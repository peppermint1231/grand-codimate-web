import { afterEach, expect, it } from "vitest";
import { DatabaseSync } from "node:sqlite";
import { Clinic } from "../server/worker";
import { seal } from "../server/crypto";
import { sha } from "../src/core/domain";
import { catalogAdmin } from "./fixtures/catalogs";
import { defaultVipPolicy } from "../src/core/vipPoints";
const dbs: DatabaseSync[] = [];
afterEach(() => dbs.splice(0).forEach((db) => db.close()));
async function fixture() {
  const db = new DatabaseSync(":memory:");
  dbs.push(db);
  const key = Buffer.alloc(32, 42).toString("base64");
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
  const clinic = new Clinic(
    {
      storage: {
        sql,
        getAlarm: async () => null,
        setAlarm: async () => {},
        transactionSync: (fn: () => void) => fn(),
      },
    } as any,
    {
      ENCRYPTION_KEY: key,
      APP_ORIGIN: "https://test.example",
      REQUIRE_ONEDRIVE: "false",
    } as any,
  );
  const put = async (section: string, v: any) =>
    db
      .prepare("INSERT OR REPLACE INTO entities VALUES(?,?,?)")
      .run(section, v.id, await seal(v, key));
  const secret = async (id: string, value: any) =>
    db
      .prepare("INSERT OR REPLACE INTO secrets VALUES(?,?)")
      .run(id, await seal(value, key));
  const account = async (permissions = {}, active = true) =>
    secret("user:admin", {
      ...catalogAdmin,
      permissionLevel: "admin",
      permissions,
      active,
    });
  await account();
  await secret("session:" + (await sha("test-token")), {
    id: "admin",
    expires: Date.now() + 60000,
  });
  const now = new Date().toISOString(),
    base = { rev: 1, createdAt: now, updatedAt: now };
  const patient = {
    ...base,
    id: "patient-private-id",
    name: "홍민감",
    phone: "01098765432",
    dob: "1990-01-01",
    sex: "F",
    number: "001",
    ownerId: "admin",
  };
  await put("patients", patient);
  await put("vipAccounts", {
    ...base,
    id: "vip1",
    patientId: patient.id,
    enrolledAt: now,
    baselineReceiptIds: [],
    cardNumber: "PRIVATE-CARD",
  });
  await put("policies", {
    ...base,
    id: "grades",
    grades: [],
    vip: { ...defaultVipPolicy, enabled: true, startedAt: now },
  });
  await put("pointEntries", {
    ...base,
    id: "grant1",
    patientId: patient.id,
    kind: "grant",
    amount: 100000,
    reason: "비공개 직원 메모",
    actorId: "admin",
    sourcePatientId: "friend-private",
    benefitKey: "welcome",
  });
  await put("pointEntries", {
    ...base,
    id: "other",
    patientId: "other-patient",
    kind: "grant",
    amount: 999999,
    reason: "다른환자",
    actorId: "admin",
  });
  const request = (path: string, data?: unknown, anonymous = false) =>
    clinic.fetch(
      new Request("https://test.example/api" + path, {
        method: data === undefined ? "GET" : "POST",
        headers: {
          "Content-Type": "application/json",
          ...(anonymous ? {} : { Authorization: "Bearer test-token" }),
        },
        body: data === undefined ? undefined : JSON.stringify(data),
      }),
    );
  const create = async (action = "create") =>
    (await (
      await request("/vip-shares", { patientId: patient.id, action })
    ).json()) as any;
  return { db, key, put, secret, account, patient, base, request, create };
}
it("reuses a permanent opaque QR and shows a minimal patient projection without login", async () => {
  const f = await fixture(),
    { share } = await f.create();
  expect(share.url).toMatch(/\/api\/public\/vip\/[a-f0-9]{64}$/);
  expect(share.expires).toBeUndefined();
  expect((await f.create()).share.url).toBe(share.url);
  const row = f.db.prepare("SELECT value FROM vip_shares").get()!;
  expect(row.value).not.toContain(share.url.split("/").pop());
  const r = await f.request(
    share.url.replace("https://test.example/api", ""),
    undefined,
    true,
  );
  expect(r.status).toBe(200);
  expect(r.headers.get("Cache-Control")).toContain("no-store");
  expect(r.headers.get("X-Robots-Tag")).toContain("noindex");
  const html = await r.text();
  expect(html).toContain("100,000 P");
  expect(html).toContain("홍**");
  for (const secret of [
    "홍민감",
    "01098765432",
    "비공개 직원 메모",
    "PRIVATE-CARD",
    "friend-private",
    "999,999",
    "patient-private-id",
  ])
    expect(html).not.toContain(secret);
});
it("reads current balance, spending and benefit policy on every visit", async () => {
  const f = await fixture(),
    { share } = await f.create();
  const path = share.url.replace("https://test.example/api", "");
  await f.put("pointEntries", {
    ...f.base,
    id: "grant2",
    patientId: f.patient.id,
    kind: "grant",
    amount: 20000,
    reason: "private",
    actorId: "admin",
  });
  await f.put("ledger", {
    ...f.base,
    id: "receipt",
    patientId: f.patient.id,
    consultationId: "hidden",
    kind: "receipt",
    amount: 200000,
    date: new Date().toISOString().slice(0, 10),
    method: "카드",
    actorId: "admin",
  });
  await f.put("policies", {
    ...f.base,
    id: "grades",
    grades: [],
    vip: {
      ...defaultVipPolicy,
      enabled: true,
      birthday: 75000,
      annualMonths: 6,
      expiryMonths: 24,
    },
  });
  const html = await (await f.request(path, undefined, true)).text();
  expect(html).toContain("120,000 P");
  expect(html).toContain("200,000원");
  expect(html).toContain("75,000 P");
  expect(html).toContain("6개월");
  expect(html).toContain("24개월");
});
it("revokes and regenerates links without leaving old QR codes usable", async () => {
  const f = await fixture(),
    old = (await f.create()).share,
    newShare = (await f.create("regenerate")).share;
  expect(newShare.url).not.toBe(old.url);
  expect(
    (
      await f.request(
        old.url.replace("https://test.example/api", ""),
        undefined,
        true,
      )
    ).status,
  ).toBe(410);
  await f.create("revoke");
  expect(
    (
      await f.request(
        newShare.url.replace("https://test.example/api", ""),
        undefined,
        true,
      )
    ).status,
  ).toBe(410);
  expect(
    (await f.request("/public/vip/not-a-token", undefined, true)).status,
  ).toBe(410);
});
it("requires staff authentication and export/money permissions for QR management", async () => {
  const f = await fixture();
  const input = { patientId: f.patient.id, action: "create" };
  expect((await f.request("/vip-shares", input, true)).status).toBe(401);
  for (const permissions of [{ export: false }, { "money.read": false }]) {
    await f.account(permissions);
    expect((await f.request("/vip-shares", input)).status).toBe(403);
    expect(
      (await f.request("/vip-shares?patientId=" + f.patient.id)).status,
    ).toBe(403);
  }
});
it("blocks missing VIP membership, archived/merged patients and disabled issuers", async () => {
  const f = await fixture(),
    { share } = await f.create();
  const path = share.url.replace("https://test.example/api", "");
  await f.account({}, false);
  expect((await f.request(path, undefined, true)).status).toBe(410);
  await f.account();
  for (const change of [{ archived: true }, { mergedInto: "other" }]) {
    await f.put("patients", { ...f.patient, ...change });
    expect((await f.request(path, undefined, true)).status).toBe(410);
    expect(
      (
        await f.request("/vip-shares", {
          patientId: f.patient.id,
          action: "create",
        })
      ).status,
    ).toBe(409);
  }
  await f.put("patients", f.patient);
  f.db.prepare("DELETE FROM entities WHERE section='vipAccounts'").run();
  expect((await f.request(path, undefined, true)).status).toBe(410);
});
it("blocks patient links during recovery and escapes untrusted names", async () => {
  const f = await fixture(),
    { share } = await f.create(),
    path = share.url.replace("https://test.example/api", "");
  await f.put("patients", { ...f.patient, name: "<script>alert(1)</script>" });
  const html = await (await f.request(path, undefined, true)).text();
  expect(html).not.toContain("<script>");
  expect(html).toContain("&lt;");
  await f.secret("restore-required", true);
  expect((await f.request(path, undefined, true)).status).toBe(410);
  expect(
    (
      await f.request("/vip-shares", {
        patientId: f.patient.id,
        action: "create",
      })
    ).status,
  ).toBe(409);
});
