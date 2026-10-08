import { it, expect } from "vitest";
import { DatabaseSync } from "node:sqlite";
import { entitySectionRows } from "../server/entityRows";
import { storageQuotaResponse } from "../server/storageQuota";
it("reads native workspace sections by primary-key ranges with a large imported directory present", async () => {
  const db = new DatabaseSync(":memory:");
  try {
    db.exec(
      "CREATE TABLE entities(section TEXT,id TEXT,value TEXT,PRIMARY KEY(section,id))",
    );
    const insert = db.prepare("INSERT INTO entities VALUES(?,?,?)");
    db.exec("BEGIN");
    for (let i = 0; i < 65000; i++)
      insert.run(
        "patients",
        "vegas-" + i.toString(16).padStart(32, "0"),
        "encrypted",
      );
    insert.run("patients", "native-a", "native");
    insert.run("patients", "z-native", "native-after-import-range");
    insert.run("patients", "vegas.", "upper-bound-native");
    insert.run("policies", "policy", "policy");
    db.exec("COMMIT");
    let queries = 0;
    const sql = {
      exec(query: string, ...args: any[]) {
        queries++;
        const plan = db.prepare("EXPLAIN QUERY PLAN " + query).all(...args) as {
          detail: string;
        }[];
        expect(
          plan.some(
            (row) =>
              row.detail.includes("SEARCH entities USING INDEX") &&
              row.detail.includes("section=?"),
          ),
        ).toBe(true);
        expect(
          plan.some(
            (row) =>
              row.detail.includes("SCAN") || row.detail.includes("TEMP B-TREE"),
          ),
        ).toBe(false);
        return { toArray: () => db.prepare(query).all(...args) };
      },
    };
    const patients = [];
    for await (const r of entitySectionRows(sql as any, "patients", true))
      patients.push(r.id);
    expect(patients).toEqual(["native-a", "vegas.", "z-native"]);
    const policies = [];
    for await (const r of entitySectionRows(sql as any, "policies", true))
      policies.push(r.id);
    expect(policies).toEqual(["policy"]);
    const absent = [];
    for await (const r of entitySectionRows(sql as any, "ledger", true))
      absent.push(r.id);
    expect(absent).toEqual([]);
    expect(queries).toBe(8);
  } finally {
    db.close();
  }
});
it("reports quota exhaustion as a retryable 503 with the next UTC reset, never as an invalid login", async () => {
  const response = storageQuotaResponse(
    new Error("Exceeded allowed rows read in Durable Objects free tier."),
    new Date("2026-10-08T06:20:00Z"),
  )!;
  expect(response.status).toBe(503);
  expect(response.headers.get("Retry-After")).toBe("63600");
  expect(await response.json()).toMatchObject({
    code: "STORAGE_DAILY_LIMIT",
    retryAt: "2026-10-09T00:00:00.000Z",
  });
  expect(storageQuotaResponse(new Error("자료 없음"))).toBeUndefined();
});
