import { DatabaseSync } from "node:sqlite";
import { Clinic } from "../../server/worker";
import { hashPassword, seal } from "../../server/crypto";
import { sha } from "../../src/core/domain";
import {
  emptyState,
  emptyQuote,
  type State,
  type User,
} from "../../src/core/model";
import { threeCatalogs } from "./catalogs";
export async function clinicFixture() {
  const db = new DatabaseSync(":memory:");
  const key = Buffer.from(crypto.getRandomValues(new Uint8Array(32))).toString(
    "base64",
  );
  const storage = {
    sql: {
      exec(q: string, ...args: any[]) {
        if (q.includes(";")) {
          db.exec(q);
          return { toArray: () => [] };
        }
        const rows = db.prepare(q).all(...args);
        return { toArray: () => rows };
      },
    },
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
    getAlarm: async () => null,
    setAlarm: async () => {},
  };
  const env = {
    ENCRYPTION_KEY: key,
    APP_ORIGIN: "https://test.example",
    REQUIRE_ONEDRIVE: "false",
  };
  const clinic = new Clinic({ storage } as any, env as any);
  const password = "test-password-12345",
    passwordHash = await hashPassword(password);
  const admin: User = {
    id: "admin-user",
    username: "admin",
    name: "관리자",
    role: "coordinator",
    permissionLevel: "admin",
    active: true,
    permissions: {},
  };
  const staff: User = {
    ...admin,
    id: "staff-user",
    username: "staff",
    name: "일반직원",
    permissionLevel: "standard",
  };
  const tokens = new Map<string, string>();
  const add = async (u: User) => {
    await secret("user:" + u.id, { ...u, passwordHash });
    const token = crypto.randomUUID();
    tokens.set(u.id, token);
    await secret("session:" + (await sha(token)), {
      id: u.id,
      expires: Date.now() + 600000,
    });
  };
  const secret = async (id: string, value: unknown) => {
    db.prepare("INSERT OR REPLACE INTO secrets VALUES(?,?)").run(
      id,
      await seal(value, key),
    );
  };
  await add(admin);
  await add(staff);
  const state = emptyState();
  state.users = [admin, staff];
  state.catalogs = threeCatalogs();
  const base = {
    rev: 1,
    createdAt: "2026-09-01T00:00:00Z",
    updatedAt: "2026-09-01T00:00:00Z",
  };
  state.patients = [
    {
      ...base,
      id: "patient-test",
      name: "검증환자",
      dob: "1990-01-01",
      sex: "F",
      phone: "01000000000",
      address: "서울",
      ownerId: admin.id,
    },
  ];
  state.consultations = [
    {
      ...base,
      id: "consult-test",
      patientId: state.patients[0].id,
      patient: state.patients[0],
      ownerId: admin.id,
      status: "H",
      category: "미용",
      cancelled: false,
      catalogVersion: state.catalogs[0].id,
      quote: emptyQuote(),
      memo: "",
      photos: [],
      documents: [],
      appointment: "",
      attendance: "미정",
    },
  ];
  const put = async (section: keyof State, value: any) => {
    db.prepare("INSERT OR REPLACE INTO entities VALUES(?,?,?)").run(
      section,
      value.id,
      await seal(value, key),
    );
  };
  for (const section of Object.keys(state) as (keyof State)[])
    if (section !== "users")
      for (const item of state[section]) await put(section, item);
  const request = (user: User, path: string, body?: unknown) =>
    clinic.fetch(
      new Request("https://test.example/api" + path, {
        method: body === undefined ? "GET" : "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: "Bearer " + tokens.get(user.id),
        },
        body: body === undefined ? undefined : JSON.stringify(body),
      }),
    );
  const bytes = (user: User, path: string, data: Uint8Array) =>
    clinic.fetch(
      new Request("https://test.example/api" + path, {
        method: "POST",
        headers: { Authorization: "Bearer " + tokens.get(user.id) },
        body: data as any,
      }),
    );
  return {
    db,
    key,
    storage,
    env,
    clinic,
    password,
    passwordHash,
    admin,
    staff,
    tokens,
    state,
    add,
    put,
    secret,
    request,
    bytes,
  };
}
