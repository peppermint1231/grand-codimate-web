import { it, expect } from "vitest";
import { DatabaseSync } from "node:sqlite";
import { PatientDirectory } from "../server/patientDirectory";
import { PatientMarketing } from "../server/patientMarketing";
import { emptyState, emptyQuote, type Patient } from "../src/core/model";
import {
  patientIndex,
  type PatientSearchFilter,
} from "../src/core/patientSearch";
import { seal } from "../server/crypto";
import { buildMarketing } from "../src/core/marketingAnalytics";
const key = Buffer.alloc(32, 2).toString("base64");
const filter: PatientSearchFilter = {
  search: "",
  grade: "",
  sort: "recent",
  unpaid: false,
  owner: "",
  consultStatus: "",
  since: "",
  archived: false,
  duplicateOnly: false,
  page: 0,
};
const base = {
  rev: 1,
  createdAt: "2026-01-01T00:00:00Z",
  updatedAt: "2026-01-01T00:00:00Z",
};
const patient = (id: string, name = id): Patient => ({
  ...base,
  id,
  name,
  sex: "F",
  dob: "1990-01-01",
  phone: "01011112222",
  address: "석사동",
  ownerId: "staff",
});
function fixture() {
  const db = new DatabaseSync(":memory:");
  db.exec(
    "CREATE TABLE entities(section TEXT,id TEXT,value TEXT,PRIMARY KEY(section,id));",
  );
  const queries: { q: string; rows: number }[] = [];
  const sql = {
    exec(q: string, ...args: any[]) {
      if (q.includes(";")) {
        db.exec(q);
        return { toArray: () => [] };
      }
      const rows = db.prepare(q).all(...args);
      queries.push({ q, rows: rows.length });
      return { toArray: () => rows };
    },
  };
  const tx = <T>(f: () => T) => {
    db.exec("BEGIN");
    try {
      const r = f();
      db.exec("COMMIT");
      return r;
    } catch (e) {
      db.exec("ROLLBACK");
      throw e;
    }
  };
  const dir = () => new PatientDirectory(sql as any, key, tx);
  const save = async (section: string, value: any) => {
    db.prepare("INSERT OR REPLACE INTO entities VALUES(?,?,?)").run(
      section,
      value.id,
      await seal(value, key),
    );
  };
  return { db, queries, sql, dir, save };
}
it("resumes bounded migration, persists identity/revenue facets and incrementally updates after cold restart", async () => {
  const f = fixture();
  for (let i = 0; i < 45; i++)
    await f.save("patients", patient("p" + i, "환자" + i));
  await f.save("patients", patient("same", "환자1"));
  let d = f.dir();
  for (let i = 0; i < 3; i++) await d.step(10);
  expect(d.status().phase).toBe("patients");
  await d.step(10);
  expect(d.status().processed).toBe(10);
  d = f.dir();
  while (!d.status().ready) await d.step(10);
  expect((await d.search(filter)).total).toBe(46);
  expect((await d.search({ ...filter, duplicateOnly: true })).total).toBe(2);
  expect((await d.search({ ...filter, search: "환자1" })).total).toBe(12);
  const first = await d.search(filter);
  const next = await f.dir().search({ ...filter, page: 1 });
  expect(new Set([...first.rows, ...next.rows].map((r) => r.p.id)).size).toBe(
    46,
  );
  const p = { ...patient("same", "다른환자"), rev: 2, archived: true };
  await f.save("patients", p);
  d.track([{ section: "patients", id: p.id, value: p }]);
  await d.step();
  expect((await d.search({ ...filter, duplicateOnly: true })).total).toBe(0);
  expect((await d.search(filter)).total).toBe(45);
  const policy = {
    ...base,
    id: "policy",
    grades: [{ id: "vip", name: "VIP", minimum: 5000000 }],
  };
  await f.save("policies", policy);
  d.track([{ section: "policies", id: "policy", value: policy }]);
  while (!d.status().ready) await d.step();
  d.track([
    {
      section: "policies",
      id: "policy",
      value: { ...policy, discovery: { test: true } },
    },
  ]);
  expect(d.status().ready).toBe(true);
  f.db.close();
});
it("cold directory on 68000 rows reads only a page; persistent indexes serve search order", async () => {
  const f = fixture(),
    d = f.dir();
  const p = patient("p0");
  const value = await seal(
    patientIndex({ ...emptyState(), patients: [p] })[0],
    key,
  );
  const insert = f.db.prepare(
    "INSERT INTO patient_directory VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)",
  );
  f.db.exec("BEGIN");
  for (let i = 0; i < 68000; i++) {
    const id = "p" + String(i).padStart(6, "0");
    insert.run(
      id,
      value,
      "",
      "",
      "",
      0,
      0,
      id,
      "2026-01-01",
      "2026-01-01",
      0,
      0,
      "",
      "missing",
      "주소 미입력",
      0,
      "[]",
    );
  }
  f.db.exec("COMMIT");
  f.db.exec(
    "UPDATE patient_directory_meta SET phase='ready';INSERT INTO patient_directory_totals VALUES('0:all',68000,0);",
  );
  f.queries.length = 0;
  const response = await f.dir().search(filter);
  expect(response.total).toBe(68000);
  const pageQuery = f.queries.find((r) => r.q.startsWith("SELECT d.value"))!;
  expect(pageQuery.rows).toBe(30);
  expect(f.queries.some((r) => /FROM entities/.test(r.q))).toBe(false);
  expect(f.queries.reduce((n, r) => n + r.rows, 0)).toBeLessThan(100);
  const plan = f.db
    .prepare(
      "EXPLAIN QUERY PLAN SELECT value FROM patient_directory WHERE archived=0 AND merged=0 ORDER BY recent DESC,id DESC LIMIT 30",
    )
    .all();
  expect(JSON.stringify(plan)).toContain("patient_directory_recent");
  expect(JSON.stringify(plan)).not.toContain("TEMP B-TREE");
  f.db.close();
});
it("marketing deduplicates cohort overlaps, sums native receipts but never repeats historical revenue, removes archived members", () => {
  const f = fixture(),
    m = new PatientMarketing(f.sql as any);
  const summary = {
    mask: 2,
    birthYear: "1990",
    sex: "여성",
    region: "석사동",
    source: "소개",
    first: "2020-01-01",
    last: "2026-09-01",
    revenue: 5000000,
    baseline: 5000000,
    visits: 4,
    grade: "VIP",
  };
  m.update("vegas", "identity", summary);
  m.update("intake", "identity", {
    ...summary,
    mask: 5,
    revenue: 100000,
    baseline: 0,
  });
  const r = m.report(undefined, true);
  expect(r).toMatchObject({
    total: 1,
    converted: 1,
    revenue: 5100000,
    groups: [{ name: "코디메이트상담", count: 1 }],
  });
  expect(m.report(["intakeBeauty"], true).total).toBe(1);
  expect(m.report(["intakeMedical"], true).total).toBe(0);
  expect(m.report([], true).total).toBe(0);
  expect(m.report(undefined, false).revenue).toBeNull();
  m.update("intake", "identity", undefined);
  expect(m.report(undefined, true)).toMatchObject({
    total: 1,
    converted: 0,
    revenue: 5000000,
  });
  f.db.close();
});
it("age and sex cross analysis counts a repeated patient once and excludes cancelled consultations and unrelated cohorts", () => {
  const s = emptyState();
  s.patients = [
    patient("p"),
    {
      ...patient("v"),
      external: {
        source: "vegas",
        fileHash: "",
        rows: [],
        firstVisit: "2020-01-01",
        lastVisit: "2026-01-01",
        totalPaid: 5000000,
        visitCount: 3,
        issues: [],
      },
    },
  ];
  s.consultations = ["a", "b", "cancel"].map((id) => ({
    ...base,
    id,
    patientId: "p",
    patient: s.patients[0],
    ownerId: "staff",
    status: "P",
    category: "미용",
    kind: "first",
    quote: { ...emptyQuote(), lines: [] },
    cancelled: id === "cancel",
    catalogVersion: "",
  })) as any;
  const r = buildMarketing(s, { from: "2026-01-01", to: "2026-12-31" });
  expect(r.find((x) => x.dimension === "source")).toMatchObject({
    age: "30대",
    sex: "여성",
    patients: 1,
    consultations: 2,
    success: 2,
    conversion: 100,
  });
  expect(
    buildMarketing(s, {
      from: "2026-01-01",
      to: "2026-12-31",
      cohorts: ["vegas"],
    }),
  ).toEqual([]);
});
