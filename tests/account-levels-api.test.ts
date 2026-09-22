import { afterEach, expect, it, vi } from "vitest";
import { DatabaseSync } from "node:sqlite";
import { Clinic } from "../server/worker";
import { Drive } from "../server/drive";
import { seal, open, hashPassword } from "../server/crypto";
import { sha } from "../src/core/domain";
import {
  jobRoles,
  permissions,
  permissionLevels,
  type User,
} from "../src/core/model";
import { threeCatalogs } from "./fixtures/catalogs";
const dbs: DatabaseSync[] = [];
afterEach(() => {
  vi.restoreAllMocks();
  dbs.splice(0).forEach((db) => db.close());
});
async function fixture() {
  const db = new DatabaseSync(":memory:");
  dbs.push(db);
  const key = Buffer.from(crypto.getRandomValues(new Uint8Array(32))).toString(
    "base64",
  );
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
      APP_ORIGIN: "https://test.example",
      REQUIRE_ONEDRIVE: "false",
    } as any,
  );
  const passwordHash = await hashPassword("test-password-12345");
  const tokens = new Map<string, string>();
  const add = async (u: User) => {
    db.prepare("INSERT OR REPLACE INTO secrets VALUES(?,?)").run(
      "user:" + u.id,
      await seal({ ...u, passwordHash }, key),
    );
    const token = crypto.randomUUID();
    tokens.set(u.id, token);
    db.prepare("INSERT INTO secrets VALUES(?,?)").run(
      "session:" + (await sha(token)),
      await seal({ id: u.id, expires: Date.now() + 600000 }, key),
    );
  };
  const base = { name: "시험", active: true, permissions: {} };
  const admin: User = {
    ...base,
    id: "admin-account",
    username: "root",
    role: "esthetician",
    permissionLevel: "admin",
  };
  const executive: User = {
    ...base,
    id: "exec-account",
    username: "executive",
    role: "desk",
    permissionLevel: "executive",
  };
  const standard: User = {
    ...base,
    id: "staff-account",
    username: "standard",
    role: "doctor",
    permissionLevel: "standard",
  };
  await add(admin);
  await add(executive);
  await add(standard);
  const request = (u: User, path: string, body?: unknown) =>
    clinic.fetch(
      new Request("https://test.example/api" + path, {
        method: body === undefined ? "GET" : "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: "Bearer " + tokens.get(u.id),
        },
        body: body === undefined ? undefined : JSON.stringify(body),
      }),
    );
  return { db, key, add, request, admin, executive, standard, passwordHash };
}
it("creates and reads all job/grade combinations; rejects invalid or ambiguous legacy writes", async () => {
  const f = await fixture();
  for (const role of jobRoles)
    for (const permissionLevel of permissionLevels) {
      const r = await f.request(f.admin, "/users", {
        username: role + "_" + permissionLevel,
        name: "검증",
        role,
        permissionLevel,
        active: true,
        permissions: {},
        password: "test-password-12345",
      });
      expect(r.status, await r.text()).toBe(200);
    }
  const state = (await (await f.request(f.admin, "/state")).json()) as any;
  for (const role of jobRoles)
    for (const permissionLevel of permissionLevels)
      expect(
        state.state.users.find(
          (u: User) => u.username === role + "_" + permissionLevel,
        ),
      ).toMatchObject({ role, permissionLevel, permissions: {} });
  for (const change of [
    { role: "admin", permissionLevel: "admin" },
    { role: "doctor", permissionLevel: "bad" },
    { role: "doctor" },
  ])
    expect(
      (
        await f.request(f.admin, "/users", {
          username: "invalid",
          name: "검증",
          active: true,
          password: "test-password-12345",
          ...change,
        })
      ).status,
    ).toBe(400);
});
it("does not let executive or standard staff create/promote accounts or reach administrator endpoints", async () => {
  const f = await fixture();
  for (const u of [f.executive, f.standard])
    for (const [path, body] of [
      ["/users", { ...u, role: "doctor", permissionLevel: "admin" }],
      ["/storage", { rootFolder: "다른폴더", baseRoot: "상담" }],
      ["/update", {}],
      ["/onedrive/connect", undefined],
    ] as const)
      expect(
        (await f.request(u, path, body)).status,
        `${u.permissionLevel} ${path}`,
      ).toBe(403);
  expect(
    (
      await f.request(f.admin, "/users", {
        ...f.admin,
        permissionLevel: "executive",
      })
    ).status,
  ).toBe(400);
  expect(
    (await f.request(f.admin, "/users", { ...f.admin, active: false })).status,
  ).toBe(400);
});
it("backs up for executives, blocks standard staff, and enforces grade/override catalog permissions server-side", async () => {
  const f = await fixture();
  expect((await f.request(f.executive, "/backup", {})).status).toBe(200);
  expect((await f.request(f.standard, "/backup", {})).status).toBe(403);
  expect((await f.request(f.standard, "/restore", {})).status).toBe(403);
  const catalog = { ...threeCatalogs()[0], id: "api-catalog", status: "draft" };
  const command = () => ({
    id: crypto.randomUUID(),
    type: "catalog.save",
    entityId: catalog.id,
    payload: { catalog },
  });
  expect((await f.request(f.standard, "/commands", command())).status).toBe(
    403,
  );
  expect((await f.request(f.executive, "/commands", command())).status).toBe(
    200,
  );
  const updated = { ...f.admin, permissions: { "catalog.edit": false } };
  expect((await f.request(f.admin, "/users", updated)).status).toBe(200);
  expect((await f.request(f.admin, "/commands", command())).status).toBe(403);
  const state = (await (await f.request(f.admin, "/state")).json()) as any;
  expect(state.user.permissions["catalog.edit"]).toBe(false);
  expect(state.state.catalogRevisions).toHaveLength(0);
});
it("normalizes old accounts without changing ciphertext and persists migrated levels only on account save", async () => {
  const f = await fixture();
  const legacy: User = {
    id: "old-account",
    username: "old-staff",
    name: "기존",
    role: "coordinator",
    active: true,
    permissions: { export: false },
  };
  await f.add(legacy);
  const encrypted = f.db
    .prepare("SELECT value FROM secrets WHERE id=?")
    .get("user:" + legacy.id) as any;
  const state = (await (await f.request(legacy, "/state")).json()) as any;
  expect(state.user).toMatchObject({
    role: "coordinator",
    permissionLevel: "standard",
    legacyPermissionDefaults: true,
    permissions: {
      "patient.edit": false,
      "refund.create": false,
      export: false,
    },
  });
  expect(state.user.permissions).not.toHaveProperty("receipt.create");
  expect(state.user.permissions).not.toHaveProperty("followup.edit");
  expect(
    (
      f.db
        .prepare("SELECT value FROM secrets WHERE id=?")
        .get("user:" + legacy.id) as any
    ).value,
  ).toBe(encrypted.value);
  expect((await f.request(f.admin, "/users", state.user)).status).toBe(200);
  const saved = await open<any>(
    (
      f.db
        .prepare("SELECT value FROM secrets WHERE id=?")
        .get("user:" + legacy.id) as any
    ).value,
    f.key,
  );
  expect(saved.permissionLevel).toBe("standard");
  expect(saved.legacyPermissionDefaults).toBeUndefined();
  expect(saved.permissions).toEqual(state.user.permissions);
  expect(saved.passwordHash).toBe(f.passwordHash);
});
it("lets executives restore an encrypted source containing a new-grade administrator and revokes old sessions", async () => {
  const f = await fixture();
  const record = {
    ...f.admin,
    id: "restored-admin",
    passwordHash: f.passwordHash,
  };
  const encrypted = await seal(record, f.key);
  vi.spyOn(Drive.prototype, "folders").mockResolvedValue();
  vi.spyOn(Drive.prototype, "listCommits").mockImplementation(
    async (folder = "commits") =>
      folder === "accounts" ? [{ id: "source", name: "admin.enc" }] : [],
  );
  vi.spyOn(Drive.prototype, "get").mockImplementation(
    async () => new Response(encrypted),
  );
  const r = await f.request(f.executive, "/restore", {});
  expect(r.status, await r.text()).toBe(200);
  expect((await f.request(f.executive, "/state")).status).toBe(401);
  expect(
    f.db.prepare("SELECT id FROM secrets WHERE id LIKE 'user:%'").all(),
  ).toEqual([{ id: "user:restored-admin" }]);
});
it("refuses restoration with executives only, preserving the working administrator", async () => {
  const f = await fixture();
  const encrypted = await seal(
    { ...f.executive, passwordHash: f.passwordHash },
    f.key,
  );
  vi.spyOn(Drive.prototype, "folders").mockResolvedValue();
  vi.spyOn(Drive.prototype, "listCommits").mockImplementation(
    async (folder = "commits") =>
      folder === "accounts" ? [{ id: "source", name: "exec.enc" }] : [],
  );
  vi.spyOn(Drive.prototype, "get").mockImplementation(
    async () => new Response(encrypted),
  );
  expect((await f.request(f.executive, "/restore", {})).status).toBe(409);
  expect((await f.request(f.admin, "/state")).status).toBe(200);
});
it("requires both export and the relevant catalog/statistics permission, including administrator overrides", async () => {
  const f = await fixture();
  for (const account of [f.admin, f.executive, f.standard]) {
    for (const exportAllowed of [false, true]) {
      for (const featureAllowed of [false, true]) {
        await f.add({
          ...account,
          permissions: {
            export: exportAllowed,
            "catalog.edit": featureAllowed,
            "stats.read": featureAllowed,
          },
        });
        for (const format of [
          "catalog-csv",
          "catalog-xlsx",
          "statistics-xlsx",
          "consultation-pdf",
          "quote-jpg",
        ]) {
          const requiresFeature = [
            "catalog-csv",
            "catalog-xlsx",
            "statistics-xlsx",
          ].includes(format);
          const permitted =
            exportAllowed && (!requiresFeature || featureAllowed);
          const response = await f.request(account, "/commands", {
            id: crypto.randomUUID(),
            type: "audit.export",
            payload: { format },
          });
          expect(
            response.status,
            `${account.permissionLevel}/${format}/export=${exportAllowed}/feature=${featureAllowed}`,
          ).toBe(permitted ? 200 : 403);
        }
      }
    }
  }
});
it("enforces the requested default export policy without overrides", async () => {
  const f = await fixture();
  for (const account of [f.admin, f.executive, f.standard]) {
    for (const format of ["catalog-csv", "catalog-xlsx", "statistics-xlsx"]) {
      const permitted =
        account.permissionLevel === "admin" ||
        (account.permissionLevel === "executive" &&
          format !== "statistics-xlsx");
      const response = await f.request(account, "/commands", {
        id: crypto.randomUUID(),
        type: "audit.export",
        payload: { format },
      });
      expect(response.status, `${account.permissionLevel}/${format}`).toBe(
        permitted ? 200 : 403,
      );
    }
  }
});
