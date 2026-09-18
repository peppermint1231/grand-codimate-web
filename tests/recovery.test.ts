import { afterEach, expect, it, vi } from "vitest";
import { DatabaseSync } from "node:sqlite";
import { Clinic } from "../server/worker";
import { Drive } from "../server/drive";
import { hashPassword, seal } from "../server/crypto";

const databases: DatabaseSync[] = [];
afterEach(() => {
  vi.restoreAllMocks();
  databases.splice(0).forEach((db) => db.close());
});

async function fixture() {
  const db = new DatabaseSync(":memory:");
  databases.push(db);
  const sql = {
    exec(query: string, ...params: any[]) {
      if (query.includes(";")) {
        db.exec(query);
        return { toArray: () => [] };
      }
      const rows = db.prepare(query).all(...params);
      return { toArray: () => rows };
    },
  };
  const encryptionKey = Buffer.from(crypto.getRandomValues(new Uint8Array(32))).toString("base64");
  const clinic = new Clinic({ storage: {
    sql,
    transactionSync(fn: () => void) {
      db.exec("BEGIN");
      try { fn(); db.exec("COMMIT"); }
      catch (e) { db.exec("ROLLBACK"); throw e; }
    },
  } } as any, {
    ENCRYPTION_KEY: encryptionKey,
    SETUP_KEY: "test-only-setup-key",
    APP_ORIGIN: "https://clinic.example",
    MICROSOFT_CLIENT_ID: "test-client",
    MICROSOFT_CLIENT_SECRET: "test-only-secret",
    REQUIRE_ONEDRIVE: "true",
  } as any);
  const request = (path: string, body?: unknown, token?: string) => clinic.fetch(new Request("https://clinic.example/api" + path, {
    method: body === undefined ? "GET" : "POST",
    headers: { "Content-Type": "application/json", ...(token ? { Authorization: "Bearer " + token } : {}) },
    body: body === undefined ? undefined : JSON.stringify(body),
  }));
  const setup = await request("/setup", { key: "test-only-setup-key", username: "recovery-admin", name: "임시 관리자", password: "test-password-1234" });
  expect(setup.status).toBe(200);
  const session = await (await request("/login", { username: "recovery-admin", password: "test-password-1234" })).json() as any;
  const account = {
    id: "original-admin", username: "original-admin", name: "원본 관리자", role: "admin", active: true,
    permissions: {}, passwordHash: await hashPassword("original-password-1234"),
  };
  const backup = await seal(account, encryptionKey);
  vi.spyOn(Drive.prototype, "folders").mockResolvedValue();
  const put = vi.spyOn(Drive.prototype, "put").mockResolvedValue({ id: "file", size: 0, eTag: "tag" });
  const list = vi.spyOn(Drive.prototype, "listCommits").mockImplementation(async (folder = "commits") =>
    folder === "accounts" ? [{ id: "original-account-file", name: "original-admin.enc" }] : []);
  const get = vi.spyOn(Drive.prototype, "get").mockImplementation(async () => new Response(backup));
  return { db, request, session, encryptionKey, account, put, list, get };
}

it("connecting a recovery server preserves source accounts and blocks writes until restoration", async () => {
  const f = await fixture();
  const connection = await (await f.request("/onedrive/connect", undefined, f.session.token)).json() as any;
  const state = new URL(connection.url).searchParams.get("state");
  vi.spyOn(globalThis, "fetch").mockResolvedValue(Response.json({ access_token: "test-access", refresh_token: "test-refresh", expires_in: 3600 }));
  const response = await f.request("/onedrive/callback?code=test&state=" + state);
  expect(response.status).toBe(302);
  expect(f.put).not.toHaveBeenCalled();
  expect((await (await f.request("/state", undefined, f.session.token)).json() as any).restoreRequired).toBe(true);
  expect((await f.request("/commands", { id: "new-operation", type: "patient.create", payload: {} }, f.session.token)).status).toBe(409);
});

it("restoration replaces stale accounts, media and operation receipts and revokes old sessions", async () => {
  const f = await fixture();
  f.db.prepare("INSERT INTO operations VALUES(?,?,?,?,1)").run("stale-operation", "stale", "digest", "unused");
  f.db.prepare("INSERT INTO media VALUES(?,?)").run("stale-media", "unused");
  const response = await f.request("/restore", {}, f.session.token);
  expect(response.status).toBe(200);
  expect(await response.json()).toMatchObject({ requiresLogin: true });
  expect(f.db.prepare("SELECT id FROM secrets WHERE id LIKE 'user:%'").all()).toEqual([{ id: "user:original-admin" }]);
  expect(f.db.prepare("SELECT * FROM media").all()).toEqual([]);
  expect(f.db.prepare("SELECT * FROM operations").all()).toEqual([]);
  expect((await f.request("/state", undefined, f.session.token)).status).toBe(401);
  expect((await f.request("/login", { username: "original-admin", password: "original-password-1234" })).status).toBe(200);
});

it("a wrong recovery key leaves the current accounts and data intact", async () => {
  const f = await fixture();
  const anotherKey = Buffer.from(crypto.getRandomValues(new Uint8Array(32))).toString("base64");
  const damaged = await seal(f.account, anotherKey);
  f.get.mockImplementation(async () => new Response(damaged));
  expect((await f.request("/restore", {}, f.session.token)).status).toBe(503);
  expect((await f.request("/state", undefined, f.session.token)).status).toBe(200);
});

it("a backup without an active administrator cannot replace the current server", async () => {
  const f = await fixture();
  f.list.mockResolvedValue([]);
  expect((await f.request("/restore", {}, f.session.token)).status).toBe(409);
  expect((await f.request("/state", undefined, f.session.token)).status).toBe(200);
});
