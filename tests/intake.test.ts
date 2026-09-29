import { afterEach, describe, expect, it, vi } from "vitest";
import { createCipheriv, pbkdf2Sync } from "node:crypto";
import { intakeFields } from "../src/core/intake";
import {
  decryptIntakeRecord,
  parseIntakeRecords,
  intakeRecordKey,
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
