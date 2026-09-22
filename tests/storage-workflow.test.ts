import { it, expect, vi, afterEach } from "vitest";
import { DatabaseSync } from "node:sqlite";
import { Clinic } from "../server/worker";
import { Drive } from "../server/drive";
import { seal, open } from "../server/crypto";
const databases: DatabaseSync[] = [];
afterEach(() => {
  vi.restoreAllMocks();
  databases.splice(0).forEach((x) => x.close());
});
async function fixture() {
  const db = new DatabaseSync(":memory:");
  databases.push(db);
  const sql = {
    exec(q: string, ...args: any[]) {
      if (q.includes(";")) {
        db.exec(q);
        return { toArray: () => [] };
      }
      const rows = db.prepare(q).all(...args);
      return { toArray: () => rows };
    },
  };
  const key = Buffer.from(crypto.getRandomValues(new Uint8Array(32))).toString(
    "base64",
  );
  const clinic = new Clinic(
    {
      storage: {
        sql,
        transactionSync(fn: () => void) {
          db.exec("BEGIN");
          try {
            fn();
            db.exec("COMMIT");
          } catch (e) {
            db.exec("ROLLBACK");
            throw e;
          }
        },
      },
    } as any,
    {
      ENCRYPTION_KEY: key,
      SETUP_KEY: "test-setup",
      APP_ORIGIN: "https://test.example",
      REQUIRE_ONEDRIVE: "true",
    } as any,
  );
  let token = "";
  const request = (path: string, body?: any) =>
    clinic.fetch(
      new Request("https://test.example/api" + path, {
        method: body === undefined ? "GET" : "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: "Bearer " + token,
        },
        body: body === undefined ? undefined : JSON.stringify(body),
      }),
    );
  const setup = await request("/setup", {
    key: "test-setup",
    username: "test-admin",
    name: "시험",
    password: "test-password-12345",
  });
  expect(setup.status, await setup.text()).toBe(200);
  const login = await request("/login", {
    username: "test-admin",
    password: "test-password-12345",
  });
  const session = (await login.json()) as any;
  expect(login.status, JSON.stringify(session)).toBe(200);
  token = session.token;
  const files = new Map<
    string,
    { id: string; body: string | ArrayBuffer; mime: string }
  >();
  const put = vi
    .spyOn(Drive.prototype, "put")
    .mockImplementation(
      async (path, body, mime = "application/octet-stream") => {
        const id = files.get(path)?.id || crypto.randomUUID();
        files.set(path, { id, body: body as string | ArrayBuffer, mime });
        return {
          id,
          size:
            typeof body === "string"
              ? Buffer.byteLength(body)
              : (body as ArrayBuffer).byteLength,
          eTag: "test",
        };
      },
    );
  vi.spyOn(Drive.prototype, "exists").mockImplementation(async (path) => {
    const f = files.get(path);
    return f ? { id: f.id, name: path.split("/").at(-1)!, size: 0 } : undefined;
  });
  vi.spyOn(Drive.prototype, "get").mockImplementation(async (id) => {
    const file = [...files.values()].find((x) => x.id === id);
    if (!file) throw new Error("missing mock file");
    return new Response(file.body);
  });
  const cmd = (
    type: string,
    payload: any,
    id: string,
    rev?: number,
    operationId = crypto.randomUUID(),
  ) =>
    request("/commands", {
      id: operationId,
      type,
      payload,
      entityId: id,
      baseRev: rev,
    });
  await cmd(
    "patient.create",
    {
      name: "테스트",
      sex: "M",
      dob: "1980-01-01",
      phone: "01000000000",
      address: "테스트동",
    },
    "patient",
  );
  await cmd(
    "consultation.create",
    { patientId: "patient", category: "보험" },
    "consult",
  );
  const upload = (
    id: string,
    data = "test-photo",
    time = "2026-09-19T05:22:56Z",
    consult = "consult",
  ) =>
    clinic.fetch(
      new Request("https://test.example/api/media", {
        method: "POST",
        body: data,
        headers: {
          Authorization: "Bearer " + token,
          "Content-Type": "image/jpeg",
          "X-Consultation-Id": consult,
          "X-Upload-Id": id,
          "X-File-Name": "test.jpg",
          "X-Captured-At": time,
        },
      }),
    );
  return { db, key, request, cmd, upload, put, files };
}
it("patient photo names avoid collisions, upload retries are idempotent, and optional PDF-free record retains annotation selection", async () => {
  const f = await fixture();
  expect((await f.upload("upload-0001")).status).toBe(200);
  const path = "상담/보험/000001M테스트/260919_1422_56_M_테스트.jpg";
  expect(f.files.has(path)).toBe(true);
  expect((await f.upload("upload-0002", "second-photo")).status).toBe(200);
  expect(f.files.has(path.replace(".jpg", "_upload-0002.jpg"))).toBe(true);
  const count = f.put.mock.calls.length;
  expect((await f.upload("upload-0001")).status).toBe(200);
  expect(f.put.mock.calls.length).toBe(count);
  expect((await f.upload("upload-0001", "different")).status).toBe(409);
  const body = {
    lines: [],
    discount: { kind: "amount", value: 0 },
    vat: "separate",
    memo: "보험 중간 경과",
    photoColumns: 3,
    photos: [
      {
        id: "p1",
        mediaId: "upload-0001",
        name: "test",
        rotation: 25,
        selected: true,
        annotations: [],
      },
      {
        id: "p2",
        mediaId: "upload-0002",
        name: "test2",
        rotation: 0,
        selected: false,
        annotations: [],
      },
    ],
  };
  expect((await f.cmd("consultation.save", body, "consult", 1)).status).toBe(
    200,
  );
  const record = JSON.parse(
    f.files.get("상담/보험/000001M테스트/상담_consult.json")!.body as string,
  ).consultation;
  expect(record).toMatchObject({
    photoColumns: 3,
    memo: "보험 중간 경과",
    documents: [],
  });
  expect(record.photos[0]).toMatchObject({
    selected: true,
    rotation: 25,
    path,
  });
  expect(record.photos[1].selected).toBe(false);
  expect([...f.files.keys()].some((p) => p.endsWith(".pdf"))).toBe(false);
  expect(
    (
      await f.cmd(
        "consultation.create",
        {
          patientId: "patient",
          category: "보험",
          kind: "interim",
          sourceConsultationId: "consult",
        },
        "interim",
      )
    ).status,
  ).toBe(200);
  const state = (await (await f.request("/state")).json()) as any,
    interim = state.state.consultations.find((x: any) => x.id === "interim");
  expect(
    (
      await f.cmd(
        "consultation.save",
        { ...body, photos: interim.photos },
        "interim",
        1,
      )
    ).status,
  ).toBe(200);
  // Same patient's insurance images cannot be attached to cosmetic consultation.
  await f.cmd(
    "consultation.create",
    { patientId: "patient", category: "미용" },
    "cosmetic",
  );
  expect((await f.cmd("consultation.save", body, "cosmetic", 1)).status).toBe(
    409,
  );
});
it("a failed patient snapshot never reports a successful save; same operation retries without revision duplication", async () => {
  const f = await fixture();
  const original = f.put.getMockImplementation()!;
  let fail = true;
  f.put.mockImplementation(async (...args) => {
    if (fail && args[0].endsWith("/상담_consult.json"))
      throw new Error("simulated network loss");
    return original(...args);
  });
  const id = crypto.randomUUID(),
    payload = {
      lines: [],
      discount: { kind: "amount", value: 0 },
      vat: "separate",
      memo: "retry-safe",
      photos: [],
    };
  expect(
    (await f.cmd("consultation.save", payload, "consult", 1, id)).status,
  ).toBe(503);
  const rows = f.db
    .prepare(
      "SELECT value FROM entities WHERE section='consultations' AND id='consult'",
    )
    .all() as any[];
  expect((await open<any>(rows[0].value, f.key)).memo).toBe("");
  fail = false;
  expect(
    (await f.cmd("consultation.save", payload, "consult", 1, id)).status,
  ).toBe(200);
  const state = (await (await f.request("/state")).json()) as any;
  expect(state.state.consultations[0]).toMatchObject({
    rev: 2,
    memo: "retry-safe",
  });
});

function mockRootRename(f: Awaited<ReturnType<typeof fixture>>) {
  let root = "상담";
  const exists = vi.mocked(Drive.prototype.exists).getMockImplementation()!;
  vi.mocked(Drive.prototype.exists).mockImplementation(async (path) =>
    path === root
      ? { id: "root-folder", name: root, size: 0, folder: {} }
      : exists(path),
  );
  vi.spyOn(Drive.prototype, "item").mockImplementation(async () => ({
    id: "root-folder",
    name: root,
    folder: {},
  }));
  const rename = vi
    .spyOn(Drive.prototype, "renameFolder")
    .mockImplementation(async (_id, name) => {
      for (const [path, value] of [...f.files]) {
        if (path.startsWith(root + "/")) {
          f.files.delete(path);
          f.files.set(name + path.slice(root.length), value);
        }
      }
      root = name;
    });
  return { rename };
}

it("renames the whole storage root, preserves photos, and saves records, commits and new uploads under the new name", async () => {
  const f = await fixture();
  const { rename } = mockRootRename(f);
  await f.upload("photo-before");
  const before = [...f.files.values()].map((x) => x.id);
  const response = await f.request("/storage", {
    rootFolder: "코디메이트",
    baseRoot: "상담",
  });
  expect(response.status, await response.clone().text()).toBe(200);
  expect(rename).toHaveBeenCalledWith("root-folder", "코디메이트");
  expect(((await (await f.request("/state")).json()) as any).storageRoot).toBe(
    "코디메이트",
  );
  expect([...f.files.values()].map((x) => x.id)).toEqual(
    expect.arrayContaining(before),
  );
  expect(await (await f.request("/media/photo-before")).text()).toBe(
    "test-photo",
  );
  expect((await f.upload("photo-after")).status).toBe(200);
  expect([...f.files.keys()].some((x) => x.startsWith("상담/"))).toBe(false);
  expect(
    [...f.files.keys()].some((x) =>
      x.startsWith("코디메이트/_codimate/media/"),
    ),
  ).toBe(true);
  expect(
    (
      await f.cmd(
        "consultation.save",
        {
          lines: [],
          discount: { kind: "amount", value: 0 },
          vat: "separate",
          memo: "after rename",
          photos: [
            {
              id: "p1",
              mediaId: "photo-before",
              name: "before",
              rotation: 0,
              selected: true,
              annotations: [],
            },
          ],
        },
        "consult",
        1,
      )
    ).status,
  ).toBe(200);
  const snapshot = JSON.parse(
    f.files.get("코디메이트/보험/000001M테스트/상담_consult.json")!
      .body as string,
  );
  expect(snapshot.consultation.photos[0].path).toMatch(/^코디메이트\/보험\//);
  const locator = await open<any>(
    f.files.get(".codimate-storage.enc")!.body as string,
    f.key,
  );
  expect(locator.folderId).toBe("root-folder");
  // A second rename must also relocate references made before the first rename.
  expect(
    (
      await f.request("/storage", {
        rootFolder: "병원자료",
        baseRoot: "코디메이트",
      })
    ).status,
  ).toBe(200);
  expect(await (await f.request("/media/photo-before")).text()).toBe(
    "test-photo",
  );
  expect((await f.upload("photo-third")).status).toBe(200);
  expect(
    [...f.files.keys()]
      .filter((x) => x !== ".codimate-storage.enc")
      .every((x) => x.startsWith("병원자료/")),
  ).toBe(true);
});

it("rejects invalid names, stale settings and existing destinations without moving data", async () => {
  const f = await fixture();
  const { rename } = mockRootRename(f);
  for (const rootFolder of [
    "",
    "../코디메이트",
    "상담/새폴더",
    "끝.",
    "CON",
    "공백 ",
    "a".repeat(81),
  ]) {
    expect(
      (await f.request("/storage", { rootFolder, baseRoot: "상담" })).status,
    ).toBe(400);
  }
  expect(
    (
      await f.request("/storage", {
        rootFolder: "코디메이트",
        baseRoot: "이전",
      })
    ).status,
  ).toBe(409);
  f.files.set("코디메이트", { id: "other-folder", body: "", mime: "" });
  expect(
    (
      await f.request("/storage", {
        rootFolder: "코디메이트",
        baseRoot: "상담",
      })
    ).status,
  ).toBe(409);
  expect(rename).not.toHaveBeenCalled();
  expect(((await (await f.request("/state")).json()) as any).storageRoot).toBe(
    "상담",
  );
});

it("reconciles a rename whose response was lost before allowing the next upload", async () => {
  const f = await fixture();
  const { rename } = mockRootRename(f);
  const apply = rename.getMockImplementation()!;
  rename.mockImplementation(async (...args) => {
    await apply(...args);
    throw new Error("response lost");
  });
  expect(
    (
      await f.request("/storage", {
        rootFolder: "코디메이트",
        baseRoot: "상담",
      })
    ).status,
  ).toBe(503);
  expect((await f.upload("after-timeout")).status).toBe(200);
  expect(((await (await f.request("/state")).json()) as any).storageRoot).toBe(
    "코디메이트",
  );
  expect([...f.files.keys()].some((x) => x.startsWith("상담/"))).toBe(false);
  expect(
    f.db.prepare("SELECT id FROM secrets WHERE id='storage-rename'").all(),
  ).toEqual([]);
});

it("retains the original root after a rejected remote rename and retries safely", async () => {
  const f = await fixture();
  const { rename } = mockRootRename(f);
  rename.mockRejectedValueOnce(new Error("remote unavailable"));
  expect(
    (
      await f.request("/storage", {
        rootFolder: "코디메이트",
        baseRoot: "상담",
      })
    ).status,
  ).toBe(503);
  expect(((await (await f.request("/state")).json()) as any).storageRoot).toBe(
    "상담",
  );
  expect(
    (
      await f.request("/storage", {
        rootFolder: "코디메이트",
        baseRoot: "상담",
      })
    ).status,
  ).toBe(200);
});

it("flushes pending data before renaming and stops when that save fails", async () => {
  const f = await fixture();
  const { rename } = mockRootRename(f);
  f.put.mockRejectedValue(new Error("save unavailable"));
  expect(
    (
      await f.cmd(
        "patient.create",
        {
          name: "대기",
          sex: "F",
          dob: "1980-01-01",
          phone: "01000000001",
          address: "검증동",
        },
        "pending-patient",
      )
    ).status,
  ).toBe(503);
  expect(
    (
      await f.request("/storage", {
        rootFolder: "코디메이트",
        baseRoot: "상담",
      })
    ).status,
  ).toBe(503);
  expect(rename).not.toHaveBeenCalled();
});

it("only administrators can change the clinic storage root", async () => {
  const f = await fixture();
  const { rename } = mockRootRename(f);
  const row = f.db
    .prepare("SELECT id,value FROM secrets WHERE id LIKE 'user:%'")
    .get() as { id: string; value: string };
  const account = await open<any>(row.value, f.key);
  f.db
    .prepare("UPDATE secrets SET value=? WHERE id=?")
    .run(await seal({ ...account, role: "staff" }, f.key), row.id);
  expect(
    (
      await f.request("/storage", {
        rootFolder: "코디메이트",
        baseRoot: "상담",
      })
    ).status,
  ).toBe(403);
  expect(rename).not.toHaveBeenCalled();
});

it("reconnects an externally renamed folder only after matching receipts, administrator and media ancestry", async () => {
  const f = await fixture();
  const { rename } = mockRootRename(f);
  const account = f.db
    .prepare("SELECT id,value FROM secrets WHERE id LIKE 'user:%'")
    .get() as { id: string; value: string };
  await Drive.prototype.put(
    "상담/_codimate/accounts/" + account.id.slice(5) + ".enc",
    account.value,
  );
  await f.upload("external-photo");
  await Drive.prototype.renameFolder("root-folder", "코디메이트"); // User renames in OneDrive first.
  rename.mockClear();
  const readItem = vi.mocked(Drive.prototype.item).getMockImplementation()!;
  vi.mocked(Drive.prototype.item).mockImplementation(async (id) =>
    id === "root-folder"
      ? readItem(id)
      : { id, name: "photo", parentReference: { id: "root-folder" } },
  );
  vi.spyOn(Drive.prototype, "listCommits").mockImplementation(
    async (folder = "commits", root = "상담") =>
      [...f.files]
        .filter(([path]) => path.startsWith(`${root}/_codimate/${folder}/`))
        .map(([path, file]) => ({
          id: file.id,
          name: path.split("/").at(-1)!,
        })),
  );
  const result = await f.request("/storage", {
    rootFolder: "코디메이트",
    baseRoot: "상담",
  });
  expect(result.status, await result.clone().text()).toBe(200);
  expect(await result.json()).toMatchObject({
    reconnected: true,
    rootFolder: "코디메이트",
  });
  expect(rename).not.toHaveBeenCalled();
  expect(await (await f.request("/media/external-photo")).text()).toBe(
    "test-photo",
  );
  expect((await f.upload("after-external")).status).toBe(200);
  expect([...f.files.keys()].some((path) => path.startsWith("상담/"))).toBe(
    false,
  );
});

it("does not adopt an unrelated or incomplete folder when the previous root is missing", async () => {
  const f = await fixture();
  const { rename } = mockRootRename(f);
  await Drive.prototype.renameFolder("root-folder", "코디메이트");
  rename.mockClear();
  vi.spyOn(Drive.prototype, "listCommits").mockResolvedValue([]);
  expect(
    (
      await f.request("/storage", {
        rootFolder: "코디메이트",
        baseRoot: "상담",
      })
    ).status,
  ).toBe(409);
  expect(((await (await f.request("/state")).json()) as any).storageRoot).toBe(
    "상담",
  );
  expect(f.files.has(".codimate-storage.enc")).toBe(false);
  expect(rename).not.toHaveBeenCalled();
});

it("flushes catalogue changes without loading the entire catalogue history a second time", async () => {
  const f = await fixture();
  const { threeCatalogs } = await import("./fixtures/catalogs");
  const catalog = { ...threeCatalogs()[0], status: "draft" };
  const query = vi.spyOn(f.db, "prepare");
  const response = await f.cmd("catalog.save", { catalog }, catalog.id);
  expect(response.status, await response.text()).toBe(200);
  expect(
    query.mock.calls.filter(
      ([sql]) => sql === "SELECT section,value FROM entities",
    ),
  ).toHaveLength(1);
  expect(
    f.db.prepare("SELECT id FROM operations WHERE done=0").all(),
  ).toHaveLength(0);
});
