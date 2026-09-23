import { afterEach, expect, it, vi } from "vitest";
import { DatabaseSync } from "node:sqlite";
import { Clinic } from "../server/worker";
import { QuoteShares } from "../server/quoteShares";
import { seal, open } from "../server/crypto";
import { applyCommand, calculate, sha } from "../src/core/domain";
import {
  emptyState,
  type Consultation,
  type QuoteConsent,
} from "../src/core/model";
import {
  QUOTE_CONSENT_TEXT,
  QUOTE_CONSENT_VERSION,
  quoteContentHash,
  validQuoteConsent,
} from "../src/core/quoteConsent";
import { catalogAdmin } from "./fixtures/catalogs";
const admin = { ...catalogAdmin, permissionLevel: "admin" as const };
const base = {
  id: "consult",
  rev: 1,
  createdAt: "2026-09-23",
  updatedAt: "2026-09-23",
};
const patient = {
  ...base,
  id: "patient",
  number: "001",
  name: "테스트 환자",
  sex: "F" as const,
  dob: "1990-01-01",
  phone: "01000000000",
  address: "",
  ownerId: admin.id,
};
const c: Consultation = {
  ...base,
  patientId: patient.id,
  patient,
  category: "미용",
  ownerId: admin.id,
  status: "H",
  cancelled: false,
  catalogVersion: "v1",
  quote: calculate(
    [
      {
        id: "line",
        productId: "product",
        optionId: "option",
        catalogVersion: "v1",
        name: "시술",
        label: "기본",
        unit: "회",
        quantity: 1,
        price: 70000,
        regularPrice: 100000,
        tax: "exclusive",
        discount: { kind: "amount", value: 0 },
      },
    ],
    { kind: "amount", value: 0 },
    "separate",
  ),
  photos: [],
  memo: "",
  documents: [],
  attendance: "미정",
  appointment: "",
};
const image = "data:image/png;base64,iVBORw0KGgo" + "A".repeat(400);
const makeConsent = async (): Promise<QuoteConsent> => ({
  ...base,
  id: "consent",
  consultationId: c.id,
  actorId: admin.id,
  signer: patient.name,
  image,
  contentHash: await quoteContentHash(c),
  version: QUOTE_CONSENT_VERSION,
  text: QUOTE_CONSENT_TEXT,
});
const dbs: DatabaseSync[] = [];
afterEach(() => {
  vi.restoreAllMocks();
  dbs.splice(0).forEach((db) => db.close());
});
it("binds consent to the patient, item details and final price, but allows photo/memo updates", async () => {
  const receipt = await makeConsent();
  expect(await validQuoteConsent(c, receipt)).toBe(true);
  for (const next of [
    { ...c, quote: { ...c.quote, total: 1 } },
    { ...c, patient: { ...c.patient, name: "다른 환자" } },
    { ...c, cancelled: true },
    { ...c, category: "보험" as const },
  ])
    expect(await validQuoteConsent(next, receipt)).toBe(false);
  expect(
    await validQuoteConsent({ ...c, memo: "새 메모", photos: [] }, receipt),
  ).toBe(true);
});
it("persists the server-owned notice and audit event; refuses absent agreement, stale quotes and wrong signer", async () => {
  const state = emptyState();
  state.consultations = [c];
  state.patients = [patient];
  const payload = {
    consultationId: c.id,
    agreed: true,
    signer: patient.name,
    image,
    contentHash: await quoteContentHash(c),
    text: "tampered",
  };
  const send = (p: any) =>
    applyCommand(state, admin, {
      id: crypto.randomUUID(),
      type: "quote.consent",
      payload: p,
    });
  const saved = await send(payload);
  expect(saved.quoteConsents[0].text).toBe(QUOTE_CONSENT_TEXT);
  expect(saved.events[0].kind).toBe("quote.consent");
  expect(state.quoteConsents).toEqual([]);
  for (const change of [
    { agreed: false },
    { contentHash: "stale" },
    { signer: "다른 사람" },
    { image: "data:image/png;base64," },
  ])
    await expect(send({ ...payload, ...change })).rejects.toThrow();
  await expect(
    applyCommand(
      state,
      { ...admin, permissions: { export: false } },
      { id: crypto.randomUUID(), type: "quote.consent", payload },
    ),
  ).rejects.toThrow("권한");
});
it("requires valid consent and amount/export permissions for patient downloads, including retries", async () => {
  const s = emptyState();
  s.consultations = [c];
  const cmd = {
    id: crypto.randomUUID(),
    type: "audit.export",
    payload: {
      format: "quote-jpg",
      consultationId: c.id,
      consentId: "consent",
    },
  };
  await expect(applyCommand(s, admin, cmd)).rejects.toThrow("서명");
  s.quoteConsents = [await makeConsent()];
  await expect(applyCommand(s, admin, cmd)).resolves.toBeTruthy();
  await expect(
    applyCommand(s, { ...admin, permissions: { "money.read": false } }, cmd),
  ).rejects.toThrow("권한");
  s.consultations = [{ ...c, quote: { ...c.quote, total: 1 } }];
  await expect(applyCommand(s, admin, cmd)).rejects.toThrow("서명");
});
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
  const put = async (section: string, v: any) => {
    db.prepare("INSERT OR REPLACE INTO entities VALUES(?,?,?)").run(
      section,
      v.id,
      await seal(v, key),
    );
  };
  const account = async (permissions = {}) => {
    db.prepare("INSERT OR REPLACE INTO secrets VALUES(?,?)").run(
      "user:" + admin.id,
      await seal({ ...admin, permissions }, key),
    );
  };
  await account();
  db.prepare("INSERT INTO secrets VALUES(?,?)").run(
    "session:" + (await sha("test-token")),
    await seal({ id: admin.id, expires: Date.now() + 60000 }, key),
  );
  await put("consultations", c);
  await put("patients", patient);
  await put("quoteConsents", await makeConsent());
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
  const input = {
    consultationId: c.id,
    consentId: "consent",
    pages: ["/9j/" + "A".repeat(210000), "/9j/BBBB"],
  };
  return { db, key, sql, put, request, account, input };
}
it("issues a seven-day opaque link and returns exactly the selected encrypted JPG pages without login", async () => {
  const f = await fixture(),
    before = Date.now();
  const response = await f.request("/quote-shares", f.input);
  expect(response.status).toBe(200);
  const share = (await response.json()) as any;
  expect(share.expires).toBeGreaterThanOrEqual(before + 7 * 86400000);
  expect(share.expires).toBeLessThan(Date.now() + 7 * 86400000 + 1);
  expect(share.url).not.toContain(patient.name);
  const path = share.url.replace("https://test.example/api", "");
  const html = await f.request(path, undefined, true);
  expect(html.status).toBe(200);
  expect(html.headers.get("Referrer-Policy")).toBe("no-referrer");
  expect(await html.text()).toContain("2페이지 JPG 다운로드");
  const jpg = await f.request(path + "/0?download=1", undefined, true);
  expect(jpg.status).toBe(200);
  expect(Buffer.from(await jpg.arrayBuffer())).toEqual(
    Buffer.from(f.input.pages[0], "base64"),
  );
  expect(jpg.headers.get("Content-Disposition")).toContain("attachment");
  expect((await f.request(path + "/2", undefined, true)).status).toBe(410);
  expect((await f.request(path + "x", undefined, true)).status).toBe(410);
  const rows = f.db.prepare("SELECT * FROM quote_shares").all() as any[];
  expect(rows.every((r) => !r.value.includes(f.input.pages[1]))).toBe(true);
  expect(rows.some((r) => r.id === path.split("/").pop())).toBe(false);
  await f.request("/quote-shares", {
    consultationId: c.id,
    revokeId: share.id,
  });
  expect((await f.request(path, undefined, true)).status).toBe(410);
});
it("rejects stale consent, anonymous creation, invalid images and denied export permissions", async () => {
  const f = await fixture();
  expect((await f.request("/quote-shares", f.input, true)).status).toBe(401);
  expect(
    (
      await f.request("/quote-shares", {
        ...f.input,
        pages: ["<script>bad</script>"],
      })
    ).status,
  ).toBe(400);
  expect(
    (await f.request("/quote-shares", { ...f.input, consentId: "missing" }))
      .status,
  ).toBe(409);
  await f.account({ "money.read": false } as any);
  expect((await f.request("/quote-shares", f.input)).status).toBe(403);
});
it("invalidates public links after quotation changes, patient archival or staff permission removal", async () => {
  const f = await fixture(),
    share = (await (await f.request("/quote-shares", f.input)).json()) as any,
    path = share.url.replace("https://test.example/api", "");
  expect((await f.request(path, undefined, true)).status).toBe(200);
  await f.put("consultations", { ...c, quote: { ...c.quote, total: 1 } });
  expect((await f.request(path, undefined, true)).status).toBe(410);
  await f.put("consultations", c);
  await f.put("patients", { ...patient, archived: true });
  expect((await f.request(path, undefined, true)).status).toBe(410);
  await f.put("patients", patient);
  await f.account({ export: false } as any);
  expect((await f.request(path, undefined, true)).status).toBe(410);
});
it("expires links after seven days and purges every encrypted page chunk", async () => {
  const f = await fixture(),
    store = new QuoteShares(f.sql as any, f.key);
  const old = await store.create(f.input, admin.id, Date.now() - 8 * 86400000);
  expect(
    (await f.request("/public/quotes/" + old.token, undefined, true)).status,
  ).toBe(410);
  store.purge();
  expect(f.db.prepare("SELECT * FROM quote_shares").all()).toHaveLength(0);
});
