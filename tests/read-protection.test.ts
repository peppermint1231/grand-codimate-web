import { expect, it } from "vitest";
import { DatabaseSync } from "node:sqlite";
import { ReadProtection, ReadProtectionError } from "../server/readProtection";
it("persists read budgets across restarts, trips only read routes and recovers after the window", async () => {
  const db = new DatabaseSync(":memory:");
  let now = 120000;
  const raw = {
    exec(q: string, ...args: any[]) {
      if (q.includes(";")) {
        db.exec(q);
        return { toArray: () => [] };
      }
      const rows = db.prepare(q).all(...args);
      return {
        toArray: () => rows,
        rowsRead: q === "SELECT 1" ? 120 : rows.length,
      };
    },
  };
  const first = new ReadProtection(raw as any, () => now, 100);
  await first.run("/api/patients/search", "GET", async () =>
    first.sql.exec("SELECT 1").toArray(),
  );
  const restarted = new ReadProtection(raw as any, () => now, 100);
  await expect(
    restarted.run("/api/patients/search", "GET", async () => []),
  ).rejects.toBeInstanceOf(ReadProtectionError);
  await expect(
    restarted.run("/api/login", "POST", async () => true),
  ).resolves.toBe(true);
  await expect(
    restarted.run("/api/commands", "POST", async () => true),
  ).resolves.toBe(true);
  expect(restarted.status().lastHour.blocked).toBe(1);
  now += 60000;
  await expect(
    restarted.run("/api/patients/search", "GET", async () => true),
  ).resolves.toBe(true);
  db.close();
});
it("detects a single expensive statement and shares its circuit after restart without logging query values", async () => {
  const db = new DatabaseSync(":memory:");
  const raw = {
    exec(q: string, ...args: any[]) {
      if (q.includes(";")) {
        db.exec(q);
        return { toArray: () => [] };
      }
      const rows = db.prepare(q).all(...args);
      return {
        toArray: () => rows,
        rowsRead: q === "SELECT 1" ? 40000 : 1,
      };
    },
  };
  const guard = new ReadProtection(raw as any, () => 0);
  await expect(
    guard.run("/api/analytics", "GET", async () =>
      guard.sql.exec("SELECT 1").toArray(),
    ),
  ).rejects.toBeInstanceOf(ReadProtectionError);
  const next = new ReadProtection(raw as any, () => 1);
  expect(next.status().circuits).toMatchObject([
    { route: "/api/analytics", reason: "request-read-limit" },
  ]);
  await expect(
    next.run("/api/analytics", "GET", async () => true),
  ).rejects.toBeInstanceOf(ReadProtectionError);
  db.close();
});
