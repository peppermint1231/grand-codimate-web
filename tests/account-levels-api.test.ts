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
async function fixture(requireOneDrive = false) {
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
      REQUIRE_ONEDRIVE: String(requireOneDrive),
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
  return {
    db,
    key,
    add,
    request,
    admin,
    executive,
    standard,
    passwordHash,
    clinic,
    tokens,
  };
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
          ).toBe(permitted ? (format === "quote-jpg" ? 409 : 200) : 403);
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
it("restricts website event reads to catalog editors and never writes SSOT while fetching previews", async () => {
  const f = await fixture();
  const { eventList } = await import("./fixtures/websiteEvents");
  const fetcher = vi
    .spyOn(globalThis, "fetch")
    .mockImplementation(
      async () =>
        new Response(eventList(), { headers: { "Content-Type": "text/html" } }),
    );
  const before = (await (await f.request(f.admin, "/state")).json()) as any;
  expect((await f.request(f.standard, "/catalog/event-source")).status).toBe(
    403,
  );
  expect(fetcher).not.toHaveBeenCalled();
  const response = await f.request(f.executive, "/catalog/event-source");
  expect(response.status).toBe(200);
  expect(((await response.json()) as any).items).toHaveLength(1);
  expect(fetcher).toHaveBeenCalledTimes(1);
  const after = (await (await f.request(f.admin, "/state")).json()) as any;
  expect(after.state).toEqual(before.state);
});

it("keeps source scanning authenticated and out of the clinic write queue", async () => {
  const { request, admin, standard } = await fixture();
  let release!: (response: Response) => void;
  const source = vi.spyOn(globalThis, "fetch").mockImplementation(
    () =>
      new Promise((resolve) => {
        release = resolve;
      }),
  );
  const denied = await request(standard, "/catalog/event-source");
  expect(denied.status).toBe(403);
  expect(source).not.toHaveBeenCalled();
  const pending = request(admin, "/catalog/event-source");
  await vi.waitFor(() => expect(source).toHaveBeenCalledTimes(1));
  try {
    const health = await request(admin, "/health");
    expect(health.status).toBe(200);
  } finally {
    release(
      new Response("<html>invalid source</html>", {
        headers: { "Content-Type": "text/html" },
      }),
    );
  }
  expect((await pending).status).toBe(422);
});

it("new accounts use their ID, require first-login change, and cannot read clinical data or issue commands until changed", async () => {
  const f = await fixture();
  const create = await f.request(f.admin, "/users", {
    id: "new-staff",
    username: "newstaff",
    name: "김수진",
    role: "coordinator",
    permissionLevel: "standard",
    active: true,
    permissions: {},
    password: "ignored-old-client-password",
  });
  expect(create.status, await create.text()).toBe(200);
  const login = await f.request(f.admin, "/login", {
    username: "newstaff",
    password: "newstaff",
  });
  const session = (await login.json()) as any;
  expect(login.status).toBe(200);
  expect(session.user.mustChangePassword).toBe(true);
  expect(session.user).not.toHaveProperty("passwordHash");
  f.tokens.set(session.user.id, session.token);
  const state = (await (await f.request(session.user, "/state")).json()) as any;
  expect(state.state.patients).toEqual([]);
  expect(state.state.users).toEqual([]);
  for (const path of [
    "/patients/search",
    "/opinions",
    "/guide-progress",
    "/catalog/event-source",
  ])
    expect((await f.request(session.user, path)).status).toBe(403);
  expect(
    (
      await f.request(session.user, "/commands", {
        id: "blocked",
        type: "consultation.quickCreate",
        payload: { category: "미용" },
      })
    ).status,
  ).toBe(403);
  expect(
    (
      await f.request(session.user, "/password", {
        currentPassword: "wrong",
        password: "new-password-12345",
      })
    ).status,
  ).toBe(403);
  expect(
    (
      await f.request(session.user, "/password", {
        currentPassword: "newstaff",
        password: "short",
      })
    ).status,
  ).toBe(400);
  const changed = await f.request(session.user, "/password", {
    currentPassword: "newstaff",
    password: "new-password-12345",
  });
  expect(changed.status).toBe(200);
  const next = (await changed.json()) as any;
  expect(next.user.mustChangePassword).toBe(false);
  expect(next.user).not.toHaveProperty("passwordHash");
  expect((await f.request(session.user, "/state")).status).toBe(401);
  f.tokens.set(session.user.id, next.token);
  expect((await f.request(session.user, "/state")).status).toBe(200);
  expect(
    (
      await f.request(f.admin, "/login", {
        username: "newstaff",
        password: "newstaff",
      })
    ).status,
  ).toBe(401);
  expect(
    (
      await f.request(f.admin, "/login", {
        username: "newstaff",
        password: "new-password-12345",
      })
    ).status,
  ).toBe(200);
});
it("only administrators can reset an existing account to its ID and revoke every previous session", async () => {
  const f = await fixture();
  for (const actor of [f.standard, f.executive])
    expect(
      (await f.request(actor, "/users/reset-password", { id: f.standard.id }))
        .status,
    ).toBe(403);
  expect(
    (await f.request(f.admin, "/users/reset-password", { id: f.standard.id }))
      .status,
  ).toBe(200);
  expect((await f.request(f.standard, "/state")).status).toBe(401);
  expect(
    (
      await f.request(f.admin, "/login", {
        username: f.standard.username,
        password: "test-password-12345",
      })
    ).status,
  ).toBe(401);
  const login = (await (
    await f.request(f.admin, "/login", {
      username: f.standard.username,
      password: f.standard.username,
    })
  ).json()) as any;
  expect(login.user.mustChangePassword).toBe(true);
  // Administrative edits cannot clear the first-login requirement.
  expect(
    (
      await f.request(f.admin, "/users", {
        ...f.standard,
        mustChangePassword: false,
      })
    ).status,
  ).toBe(200);
  f.tokens.set(f.standard.id, login.token);
  expect(
    ((await (await f.request(f.standard, "/state")).json()) as any).user
      .mustChangePassword,
  ).toBe(true);
});
it("existing accounts can change only their own password without losing permissions or learning records", async () => {
  const f = await fixture();
  expect(
    ((await (await f.request(f.standard, "/state")).json()) as any).user
      .mustChangePassword,
  ).toBeUndefined();
  const updated = await f.request(f.standard, "/password", {
    id: f.admin.id,
    currentPassword: "test-password-12345",
    password: "existing-new-password",
  });
  expect(updated.status).toBe(200);
  const next = (await updated.json()) as any;
  expect(next.user.id).toBe(f.standard.id);
  expect(next.user.permissionLevel).toBe("standard");
  expect((await f.request(f.standard, "/state")).status).toBe(401);
  expect((await f.request(f.admin, "/state")).status).toBe(200);
  const stored = await open<any>(
    (
      f.db
        .prepare("SELECT value FROM secrets WHERE id=?")
        .get("user:" + f.admin.id) as any
    ).value,
    f.key,
  );
  expect(stored.passwordHash).toBe(f.passwordHash);
  f.tokens.set(f.standard.id, next.token);
  expect(
    (
      await f.request(f.standard, "/password", {
        currentPassword: "existing-new-password",
        password: "existing-new-password",
      })
    ).status,
  ).toBe(400);
});
it("does not change the password or revoke sessions when account backup fails", async () => {
  const f = await fixture(true);
  vi.spyOn(Drive.prototype, "put").mockRejectedValue(
    new Error("backup unavailable"),
  );
  const response = await f.request(f.standard, "/password", {
    currentPassword: "test-password-12345",
    password: "changed-password-12345",
  });
  expect(response.status).toBe(503);
  const stored = await open<any>(
    (
      f.db
        .prepare("SELECT value FROM secrets WHERE id=?")
        .get("user:" + f.standard.id) as any
    ).value,
    f.key,
  );
  expect(stored.passwordHash).toBe(f.passwordHash);
  expect(
    f.db
      .prepare("SELECT id FROM secrets WHERE id=?")
      .get("session:" + (await sha(f.tokens.get(f.standard.id)!))),
  ).toBeTruthy();
});

it("enforces admin-only data erasure and replays deletion tombstones without resurrecting a patient", async () => {
  const f = await fixture();
  const id = "erase-patient";
  const created = await f.request(f.admin, "/commands", {
    id: crypto.randomUUID(),
    type: "patient.create",
    entityId: id,
    payload: {
      name: "삭제시험",
      sex: "F",
      dob: "1990-01-01",
      phone: "01011112222",
      address: "석사동",
    },
  });
  expect(created.status).toBe(200);
  const state = ((await (await f.request(f.admin, "/state")).json()) as any)
    .state;
  const patient = state.patients.find((p: any) => p.id === id);
  const cmd = {
    id: crypto.randomUUID(),
    type: "patient.purge",
    payload: {
      items: [{ id, rev: patient.rev }],
      confirmation: "영구삭제",
      scope: {
        profile: true,
        consultations: false,
        photos: false,
        notes: false,
        money: false,
        documents: false,
      },
    },
  };
  for (const user of [f.executive, f.standard]) {
    expect((await f.request(user, "/commands", cmd)).status).toBe(403);
    expect((await f.request(user, "/patient-deletions")).status).toBe(403);
  }
  const deleted = await f.request(f.admin, "/commands", cmd);
  expect(deleted.status).toBe(200);
  expect(((await deleted.json()) as any).changes).toContainEqual({
    section: "patients",
    id,
    value: null,
  });
  expect((await f.request(f.admin, "/restore", {})).status).toBe(409);
  for (let n = 0; n < 25; n++) {
    const r = await f.request(f.admin, "/patient-deletions", {});
    expect(r.status).toBe(200);
    if (((await r.json()) as any).job?.phase === "done") break;
  }
  const replay = await f.request(f.admin, "/commands", cmd);
  expect(replay.status).toBe(200);
  expect(((await replay.json()) as any).changes).toContainEqual({
    section: "patients",
    id,
    value: null,
  });
  expect(
    f.db
      .prepare("SELECT * FROM entities WHERE section='patients' AND id=?")
      .all(id),
  ).toEqual([]);
});
