import { afterEach, describe, expect, it, vi } from "vitest";
import { createCipheriv, pbkdf2Sync } from "node:crypto";
import { intakeFields } from "../src/core/intake";
import {
  decryptIntakeRecord,
  parseIntakeRecords,
  intakeRecordKey,
  readIntakeStream,
  intakeRanges,
} from "../server/intake";
import { clinicFixture } from "./fixtures/clinic";
import { Drive } from "../server/drive";
import { sha } from "../src/core/domain";
import { open } from "../server/crypto";

// Independent Node crypto fixture using the legacy tablet/Python record format.
const password = "synthetic-intake-password";
const person = {
  id: "survey-1",
  name: "연동시험",
  gender: "F",
  phone: "010-5555-1234",
  rrn: "900203-2000000",
  address: "강원특별자치도 춘천시 퇴계동",
  routes: ["네이버검색광고"],
  signature: "sensitive-signature",
  medicationsEtc: "sensitive-health",
  createdAt: "2026-09-29T01:00:00Z",
};
function encrypt(data = person) {
  const salt = Buffer.alloc(16, 7),
    iv = Buffer.alloc(12, 8);
  const cipher = createCipheriv(
    "aes-256-gcm",
    pbkdf2Sync(password, salt, 120000, 32, "sha256"),
    iv,
  );
  const ct = Buffer.concat([
    cipher.update(JSON.stringify(data)),
    cipher.final(),
    cipher.getAuthTag(),
  ]);
  return {
    salt: salt.toString("base64"),
    iv: iv.toString("base64"),
    ct: ct.toString("base64"),
    recordId: data.id,
    name: data.name,
    phone: data.phone,
    createdAt: data.createdAt,
  };
}
const databases: Awaited<ReturnType<typeof clinicFixture>>[] = [];
afterEach(() => {
  vi.restoreAllMocks();
  databases.splice(0).forEach((f) => f.db.close());
});
async function fixture() {
  const f = await clinicFixture();
  databases.push(f);
  let payload: unknown = { records: [encrypt()] };
  const exists = vi
    .spyOn(Drive.prototype, "exists")
    .mockResolvedValue({ id: "source-file", name: "records.json", size: 1000 });
  const request = vi
    .spyOn(Drive.prototype, "request")
    .mockImplementation(async () => Response.json(payload));
  const writes = vi
    .spyOn(Drive.prototype, "put")
    .mockImplementation(async () => {
      throw new Error("Source writes must not occur");
    });
  const configure = () =>
    f.request(f.admin, "/intake/settings", {
      folder: "동의서/초진설문지",
      password,
    });
  return {
    ...f,
    exists,
    requestDrive: request,
    writes,
    configure,
    payload: (p: unknown) => {
      payload = p;
    },
  };
}

describe("intake patient mapping", () => {
  it("decrypts tablet records when Workers rejects native PBKDF2 above 100000 iterations", async () => {
    vi.spyOn(crypto.subtle, "deriveKey").mockRejectedValue(
      new DOMException(
        "Pbkdf2 failed: iteration counts above 100000 are not supported",
        "NotSupportedError",
      ),
    );
    expect(await decryptIntakeRecord(encrypt(), password)).toEqual(person);
    await expect(decryptIntakeRecord(encrypt(), "wrong")).rejects.toThrow(
      "비밀번호",
    );
  });

  it("decrypts the existing PBKDF2/AES-GCM format and omits sensitive fields", async () => {
    const fields = intakeFields(await decryptIntakeRecord(encrypt(), password));
    expect(fields).toEqual({
      name: person.name,
      sex: "F",
      dob: "1990-02-03",
      phone: "01055551234",
      address: person.address,
      acquisitionSource: "네이버검색광고",
    });
    expect(JSON.stringify(fields)).not.toMatch(
      /rrn|signature|medications|2000000/,
    );
    await expect(decryptIntakeRecord(encrypt(), "wrong")).rejects.toThrow(
      "비밀번호",
    );
  });
  it("does not misreport a server crypto failure as a wrong password", async () => {
    vi.spyOn(crypto.subtle, "importKey").mockRejectedValue(
      new Error("Runtime crypto unavailable"),
    );
    await expect(
      decryptIntakeRecord(encrypt(), password),
    ).rejects.toMatchObject({ status: 503 });
  });
  it("handles foreigner century/gender and leaves unknown or invalid dates empty", () => {
    expect(
      intakeFields({
        name: "외국인",
        patientType: "foreigner",
        foreignRegNo: "030406-8000000",
        age: "23",
      }),
    ).toMatchObject({ dob: "2003-04-06", sex: "F" });
    expect(intakeFields({ age: "30", gender: "M" })).toMatchObject({
      dob: "",
      sex: "M",
    });
    expect(intakeFields({ rrn: "900230-1000000" }).dob).toBe("");
    expect(intakeFields({ rrn: "991231-3000000" }).dob).toBe("");
  });
  it("respects tombstones in legacy and current envelopes", () => {
    const row = encrypt();
    expect(
      parseIntakeRecords({ records: [row], deletedKeys: [row.recordId] }),
    ).toEqual([]);
    expect(parseIntakeRecords([row])).toEqual([row]);
    const legacy = {
      name: "시험",
      phone: "01000000000",
      createdAt: "now",
      iv: "nonce",
    };
    expect(
      parseIntakeRecords({
        records: [legacy],
        deletedKeys: [intakeRecordKey(legacy)],
      }),
    ).toEqual([]);
    expect(() => parseIntakeRecords({ records: {} })).toThrow("파일 형식");
  });
});

describe("authenticated intake integration", () => {
  it("denies survey search and selection without patient information permission", async () => {
    const f = await fixture();
    const restricted = { ...f.staff, permissions: { "patient.edit": false } };
    await f.add(restricted);
    expect((await f.request(restricted, "/intake/search?q=시험")).status).toBe(
      403,
    );
    expect(
      (await f.request(restricted, "/intake/select", { id: "survey" })).status,
    ).toBe(403);
    expect(f.requestDrive).not.toHaveBeenCalled();
  });
  it("requires login and administrator configuration; secrets stay encrypted", async () => {
    const f = await fixture();
    expect(
      (
        await f.clinic.fetch(
          new Request("https://test.example/api/intake/settings"),
        )
      ).status,
    ).toBe(401);
    expect(
      (
        await f.request(f.staff, "/intake/settings", {
          folder: "동의서/초진설문지",
          password,
        })
      ).status,
    ).toBe(403);
    expect((await f.configure()).status).toBe(200);
    const status = (await (
      await f.request(f.staff, "/intake/settings")
    ).json()) as any;
    expect(status).toEqual({
      configured: true,
      canConfigure: false,
      folder: "동의서/초진설문지",
    });
    const raw = f.db
      .prepare("SELECT value FROM secrets WHERE id='intake-settings'")
      .get() as { value: string };
    expect(raw.value).not.toContain(password);
    expect(await open(raw.value, f.key)).toMatchObject({ password });
    expect(f.writes).not.toHaveBeenCalled();
  });
  it("does not replace working settings on a wrong password or missing file", async () => {
    const f = await fixture();
    await f.configure();
    expect(
      (
        await f.request(f.admin, "/intake/settings", {
          folder: "동의서/초진설문지",
          password: "wrong",
        })
      ).status,
    ).toBe(400);
    f.exists.mockResolvedValueOnce(undefined);
    expect((await f.configure()).status).toBe(404);
    const result = await f.request(f.staff, "/intake/search?q=1234");
    expect(result.status).toBe(200);
    expect(((await result.json()) as any).rows).toHaveLength(1);
  });
  it("searches metadata, excludes deleted records, and rejects stale selections", async () => {
    const f = await fixture();
    await f.configure();
    const row = encrypt();
    f.payload({
      records: [row, { ...row, recordId: "removed" }],
      deletedKeys: ["removed"],
    });
    const result = (await (
      await f.request(f.staff, "/intake/search?q=010-5555")
    ).json()) as any;
    expect(result.rows).toHaveLength(1);
    expect(result.rows[0]).toEqual({
      id: await sha("survey-1"),
      name: person.name,
      phone: person.phone,
      createdAt: person.createdAt,
    });
    expect(JSON.stringify(result)).not.toMatch(
      /ct|salt|rrn|signature|medications/,
    );
    f.payload({ records: [row], deletedKeys: [row.recordId] });
    expect(
      (await f.request(f.staff, "/intake/select", { id: result.rows[0].id }))
        .status,
    ).toBe(404);
  });
  it("registers through normal patient commands and reuses a stable ID on repeat import", async () => {
    const f = await fixture();
    await f.configure();
    const selected = (await (
      await f.request(f.staff, "/intake/select", { id: await sha(person.id) })
    ).json()) as any;
    expect(selected.fields.dob).toBe("1990-02-03");
    expect(selected.alreadyImported).toBe(false);
    const command = {
      id: "import-once",
      type: "patient.create",
      entityId: selected.patientId,
      payload: selected.fields,
    };
    expect((await f.request(f.staff, "/commands", command)).status).toBe(200);
    expect(
      (
        await f.request(f.admin, "/commands", {
          ...command,
          id: "import-twice",
        })
      ).status,
    ).toBe(409);
    const again = (await (
      await f.request(f.staff, "/intake/select", { id: await sha(person.id) })
    ).json()) as any;
    expect(again.patientId).toBe(selected.patientId);
    expect(again.alreadyImported).toBe(true);
    expect(again.matches[0].id).toBe(selected.patientId);
    expect(
      f.db
        .prepare("SELECT id FROM entities WHERE section='patients' AND id=?")
        .all(selected.patientId),
    ).toHaveLength(1);
    expect(f.writes).not.toHaveBeenCalled();
  });
  it("offers existing and archived candidates without merging shared phone numbers", async () => {
    const f = await fixture();
    await f.configure();
    await f.put("patients", {
      ...f.state.patients[0],
      id: "family",
      name: "다른 가족",
      phone: "01055551234",
    });
    await f.put("patients", {
      ...f.state.patients[0],
      id: "old",
      name: person.name,
      dob: "1990-02-03",
      archived: true,
    });
    const selected = (await (
      await f.request(f.staff, "/intake/select", { id: await sha(person.id) })
    ).json()) as any;
    expect(selected.matches.map((p: any) => p.id).sort()).toEqual([
      "family",
      "old",
    ]);
    expect(selected.matches.find((p: any) => p.id === "old").archived).toBe(
      true,
    );
  });
  it("supports plain legacy records, pagination, disconnect and input limits", async () => {
    const f = await fixture();
    await f.configure();
    f.payload(
      Array.from({ length: 35 }, (_, i) => ({
        plain: true,
        recordId: `plain-${i}`,
        data: { ...person, id: `plain-${i}` },
      })),
    );
    const result = (await (
      await f.request(f.staff, "/intake/search?q=연동&page=1")
    ).json()) as any;
    expect(result.total).toBe(35);
    expect(result.rows).toHaveLength(5);
    const selected = (await (
      await f.request(f.staff, "/intake/select", { id: result.rows[0].id })
    ).json()) as any;
    expect(selected.fields.name).toBe(person.name);
    expect((await f.request(f.staff, "/intake/search?q=1")).status).toBe(400);
    expect(
      (
        await f.request(f.admin, "/intake/settings", {
          folder: "../data",
          password,
        })
      ).status,
    ).toBe(400);
    expect(
      (await f.request(f.admin, "/intake/settings", { enabled: false })).status,
    ).toBe(200);
    expect((await f.request(f.staff, "/intake/search?q=연동")).status).toBe(
      409,
    );
  });
});

it("streams an archive larger than 32MB, caches only headers and decrypts only the selected record", async () => {
  const f = await fixture();
  await f.configure();
  const junk = JSON.stringify({
    recordId: "junk",
    name: "다른 환자",
    phone: "01011112222",
    iv: "nonce",
    ct: "A".repeat(2 * 1024 * 1024),
  });
  f.exists.mockResolvedValue({
    id: "source-file",
    name: "records.json",
    size: 40 * 1024 * 1024,
    eTag: "v1",
  });
  const source = () => {
    let n = -1;
    return new Response(
      new ReadableStream<Uint8Array>({
        pull(controller) {
          if (n === -1) {
            controller.enqueue(
              new TextEncoder().encode(
                '{"records":[' + JSON.stringify(encrypt()),
              ),
            );
            n++;
          } else if (n < 18) {
            controller.enqueue(
              new TextEncoder().encode(
                "," + junk.replace('"junk"', '"junk-' + n++ + '"'),
              ),
            );
          } else {
            controller.enqueue(
              new TextEncoder().encode('],"deletedKeys":["junk-0"]}'),
            );
            controller.close();
          }
        },
      }),
    );
  };
  f.requestDrive.mockImplementation(async () => source());
  f.requestDrive.mockClear();
  const search = await f.request(
    f.staff,
    "/intake/search?q=0000&name=연동시험",
  );
  expect(search.status, await search.clone().text()).toBe(200);
  const d: any = await search.json();
  expect(d.rows).toHaveLength(1);
  expect(JSON.stringify(d)).not.toMatch(/ct|salt|signature|rrn|medications/);
  await f.request(f.staff, "/intake/search?q=1234");
  expect(f.requestDrive).toHaveBeenCalledTimes(1);
  const selected = await f.request(f.staff, "/intake/select", {
    id: d.rows[0].id,
  });
  expect(selected.status, await selected.clone().text()).toBe(200);
  expect(((await selected.json()) as any).fields).toMatchObject({
    name: person.name,
    dob: "1990-02-03",
    address: person.address,
  });
  expect(f.writes).not.toHaveBeenCalled();
  f.exists.mockResolvedValue({
    id: "source-file",
    name: "records.json",
    size: 200,
    eTag: "v2",
  });
  f.requestDrive.mockResolvedValue(
    Response.json({ records: [encrypt()], deletedKeys: [person.id] }),
  );
  expect(
    ((await (await f.request(f.staff, "/intake/search?q=1234")).json()) as any)
      .rows,
  ).toHaveLength(0);
}, 15000);

it("does not block consultation requests behind a delayed external survey read", async () => {
  const f = await fixture();
  await f.configure();
  let release!: (r: Response) => void, began!: () => void;
  const started = new Promise<void>((resolve) => {
    began = resolve;
  });
  f.requestDrive.mockImplementation(() => {
    began();
    return new Promise<Response>((resolve) => {
      release = resolve;
    });
  });
  const search = f.request(f.staff, "/intake/search?q=1234");
  await started;
  try {
    const response = await Promise.race([
      f.request(f.staff, "/inquiries/convert", { id: "no-such-request" }),
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(Error("blocked by survey read")), 1000),
      ),
    ]);
    expect(response.status).toBe(404);
  } finally {
    release(Response.json({ records: [encrypt()] }));
    await search;
  }
});

it("keeps only latest headers, respects trailing tombstones, UTF-8 chunks and rejects truncated archives", async () => {
  const text = JSON.stringify({
    records: [
      { recordId: "a", name: "이전", updatedAt: "1", ct: "private" },
      { recordId: "a", name: "최근", updatedAt: "2", ct: "private" },
      { recordId: "b", name: "삭제" },
    ],
    deletedKeys: ["b"],
  });
  const bytes = new TextEncoder().encode(text);
  let pos = 0;
  const rows = await readIntakeStream(
    new Response(
      new ReadableStream({
        pull(c) {
          if (pos === bytes.length) {
            c.close();
            return;
          }
          c.enqueue(bytes.slice(pos, pos + 1));
          pos++;
        },
      }),
    ),
  );
  expect(rows).toEqual([
    {
      recordId: "a",
      name: "최근",
      updatedAt: "2",
      statsFingerprint: expect.stringMatching(/^[a-f0-9]{64}$/),
      rangeStart: expect.any(Number),
      rangeLength: expect.any(Number),
    },
  ]);
  expect(
    JSON.parse(
      new TextDecoder().decode(
        bytes.slice(
          rows[0].rangeStart,
          rows[0].rangeStart + rows[0].rangeLength,
        ),
      ),
    ).name,
  ).toBe("최근");
  await expect(readIntakeStream(new Response('{"records":['))).rejects.toThrow(
    "파일",
  );
  await expect(
    readIntakeStream(new Response('{"records":{}}')),
  ).rejects.toThrow("형식");
});

it("includes unregistered questionnaires in deduplicated analytics with bounded extraction, no patient creation and no clinical fields", async () => {
  const f = await fixture();
  f.exists.mockResolvedValue({
    id: "source-file",
    name: "records.json",
    size: 1000,
    eTag: "version-1",
  });
  const base = {
    createdAt: "2026-09-01T00:00:00Z",
    gender: "F",
    dob: "1990-01-01",
    address: "석사동",
    consultType: "미용시술 상담 희망",
    signature: "never-store-signature",
    rrn: "900101-2123456",
  };
  const original = f.state.patients[0];
  const rows = [
    {
      ...base,
      id: "linked-survey",
      name: original.name,
      phone: original.phone,
    },
    { ...base, id: "new-beauty", name: "설문미용", phone: "01022223333" },
    {
      ...base,
      id: "duplicate-survey",
      name: "설문미용",
      phone: "010-2222-3333",
    },
    {
      ...base,
      id: "new-medical",
      name: "설문진료",
      phone: "01044445555",
      consultType: "피부질환 진료만 희망",
    },
  ].map((data) => ({
    recordId: data.id,
    createdAt: data.createdAt,
    plain: true,
    data,
  }));
  f.payload({ records: rows });
  await f.configure();
  const sync = await f.request(f.admin, "/intake/analytics-sync", {});
  expect(sync.status, await sync.clone().text()).toBe(200);
  expect(await sync.json()).toMatchObject({ done: 1, cursor: 4, total: 4 });
  const report = (await (
    await f.request(f.admin, "/analytics?from=2026-09-01&to=2026-09-30")
  ).json()) as any;
  expect(report.audience).toMatchObject({ total: 2, converted: 1 });
  const all = (await (
    await f.request(
      f.admin,
      "/analytics?from=2026-09-01&to=2026-09-30&cohorts=codimate,vegas,intakeBeauty,intakeMedical",
    )
  ).json()) as any;
  expect(all.audience.total).toBe(3);
  const onlyIntake = (await (
    await f.request(
      f.admin,
      "/analytics?from=2026-09-01&to=2026-09-30&cohorts=intakeBeauty",
    )
  ).json()) as any;
  expect(onlyIntake.audience.total).toBe(2);
  expect(onlyIntake.patients.consulted).toBe(1);
  expect(
    f.db
      .prepare("SELECT COUNT(*) AS n FROM entities WHERE section='patients'")
      .get(),
  ).toMatchObject({ n: 1 });
  const summaries = JSON.stringify(
    f.db.prepare("SELECT summary FROM patient_marketing_members").all(),
  );
  expect(summaries).not.toMatch(
    /never-store-signature|900101-2123456|설문미용|01022223333/,
  );
  f.exists.mockResolvedValue({
    id: "source-file",
    name: "records.json",
    size: 1000,
    eTag: "version-2",
  });
  f.payload({ records: rows, deletedKeys: ["new-beauty", "duplicate-survey"] });
  expect((await f.request(f.admin, "/intake/analytics-sync", {})).status).toBe(
    200,
  );
  const after = (await (
    await f.request(f.admin, "/analytics?from=2026-09-01&to=2026-09-30")
  ).json()) as any;
  expect(after.audience.total).toBe(1);
  f.exists.mockResolvedValue({
    id: "source-file",
    name: "records.json",
    size: 1000,
    eTag: "version-3",
  });
  f.requestDrive.mockClear();
  expect((await f.request(f.admin, "/intake/analytics-sync", {})).status).toBe(
    200,
  );
  expect(f.requestDrive).toHaveBeenCalledTimes(1); // Headers only: unchanged answers are not fetched/decrypted again.
  expect(f.writes).not.toHaveBeenCalled();
});

it("reads exact UTF-8 JSON record ranges without full-file or authorization-header transfer and falls back on ignored ranges", async () => {
  const records = [
    {
      recordId: "range-a",
      plain: true,
      data: {
        name: "가나다",
        phone: "01012345678",
        address: "춘천시 석사동",
        consultType: "미용시술 상담 희망",
      },
    },
    {
      recordId: "range-b",
      plain: true,
      data: {
        name: "홍길동",
        phone: "01087654321",
        address: "춘천시 퇴계동",
        consultType: "피부질환 진료만 희망",
      },
    },
  ];
  const text = JSON.stringify({ records }),
    bytes = new TextEncoder().encode(text);
  const headers = await readIntakeStream(new Response(text));
  const selected = await Promise.all(
    headers.map(async (h) => ({
      id: await sha(intakeRecordKey(h)),
      fingerprint: h.statsFingerprint,
      rangeStart: h.rangeStart,
      rangeLength: h.rangeLength,
    })),
  );
  const drive = {
    request: async () =>
      Response.json({
        "@microsoft.graph.downloadUrl": "https://download.example.test/source",
      }),
  } as any;
  const fetched = vi
    .spyOn(globalThis, "fetch")
    .mockImplementation(async (_url, init) => {
      const h = new Headers(init?.headers);
      expect(h.has("Authorization")).toBe(false);
      const [start, end] = h.get("Range")!.match(/\d+/g)!.map(Number);
      return new Response(bytes.slice(start, end + 1), {
        status: 206,
        headers: { "Content-Range": `bytes ${start}-${end}/${bytes.length}` },
      });
    });
  expect(await intakeRanges(drive, "source", selected)).toEqual(records);
  expect(fetched).toHaveBeenCalledTimes(2);
  fetched.mockImplementation(async () => new Response(text));
  expect(await intakeRanges(drive, "source", selected)).toBeUndefined();
});
