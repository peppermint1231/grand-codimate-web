import { it, expect } from "vitest";
import { DatabaseSync } from "node:sqlite";
import { Clinic } from "../server/worker";
import { seal } from "../server/crypto";
import { sha } from "../src/core/domain";
import { guideUpdates } from "../src/core/userGuide";
it("authenticates guide metadata per account without loading clinic records; concurrent devices merge progress", async () => {
  const db = new DatabaseSync(":memory:"),
    queries: string[] = [];
  const key = Buffer.from(crypto.getRandomValues(new Uint8Array(32))).toString(
    "base64",
  );
  const clinic = new Clinic(
    {
      storage: {
        sql: {
          exec(q: string, ...args: any[]) {
            queries.push(q);
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
      },
    } as any,
    {
      ENCRYPTION_KEY: key,
      APP_ORIGIN: "https://test.example",
      REQUIRE_ONEDRIVE: "false",
    } as any,
  );
  try {
    const tokens = ["device-one", "device-two", "other-account"];
    for (let i = 0; i < tokens.length; i++) {
      const id = i < 2 ? "alice" : "bob";
      db.prepare("INSERT OR REPLACE INTO secrets VALUES(?,?)").run(
        "user:" + id,
        await seal(
          {
            id,
            name: id,
            username: id,
            role: "coordinator",
            permissionLevel: "standard",
            active: true,
            permissions: {},
          },
          key,
        ),
      );
      db.prepare("INSERT INTO secrets VALUES(?,?)").run(
        "session:" + (await sha(tokens[i])),
        await seal({ id, expires: Date.now() + 600000 }, key),
      );
    }
    const request = (token: string, body?: unknown) =>
      clinic.fetch(
        new Request("https://test.example/api/guide-progress", {
          method: body ? "POST" : "GET",
          headers: {
            Authorization: "Bearer " + token,
            Origin: "https://test.example",
          },
          ...(body ? { body: JSON.stringify(body) } : {}),
        }),
      );
    expect((await request("invalid")).status).toBe(401);
    queries.length = 0;
    const changes = await Promise.all(
      ["start", "register"].map((id, i) =>
        request(tokens[i], {
          action: "ack",
          lessonId: id,
          revision: guideUpdates[id].revision,
        }),
      ),
    );
    for (const r of changes) expect(r.status).toBe(200);
    const r: any = await (await request(tokens[0])).json();
    expect(Object.keys(r.lessons).sort()).toEqual(["register", "start"]);
    expect(((await (await request(tokens[2])).json()) as any).lessons).toEqual(
      {},
    );
    const reportRequest = (token: string, method = "GET") =>
      clinic.fetch(
        new Request("https://test.example/api/guide-progress/accounts", {
          method,
          headers: {
            Authorization: "Bearer " + token,
            Origin: "https://test.example",
          },
        }),
      );
    expect((await reportRequest(tokens[0])).status).toBe(403);
    await db
      .prepare("INSERT OR REPLACE INTO secrets VALUES(?,?)")
      .run(
        "user:alice",
        await seal(
          {
            id: "alice",
            name: "Admin",
            username: "secret-login",
            passwordHash: "hidden-password",
            role: "admin",
            permissionLevel: "admin",
            active: true,
            permissions: {},
          },
          key,
        ),
      );
    expect((await reportRequest(tokens[0], "POST")).status).toBe(405);
    queries.length = 0;
    const response = await reportRequest(tokens[0]);
    expect(response.status).toBe(200);
    const report: any = await response.json();
    expect(report.accounts).toHaveLength(2);
    expect(
      report.accounts.find((a: any) => a.id === "bob").staff.completed,
    ).toBe(0);
    expect(JSON.stringify(report)).not.toContain("hidden-password");
    expect(JSON.stringify(report)).not.toContain("secret-login");
    expect(
      queries.some((q) =>
        /guide-checkpoint|FROM\s+(records|entities)/i.test(q),
      ),
    ).toBe(false);
    expect(queries.some((q) => /FROM\s+records/i.test(q))).toBe(false);
  } finally {
    db.close();
  }
});
