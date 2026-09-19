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
