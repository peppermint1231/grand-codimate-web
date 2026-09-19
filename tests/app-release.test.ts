import { expect, it } from "vitest";
import { DatabaseSync } from "node:sqlite";
import { Clinic } from "../server/worker";
import { seal } from "../server/crypto";
import {
  latestRelease,
  newerRelease,
  parseRelease,
} from "../src/core/appRelease";
import bundled from "../releases/android-latest.json";

const release = {
  version: "0.2.1",
  versionCode: 4,
  url: "https://example.com/app.apk",
  sha256: "a".repeat(64),
  notes: "시험",
};

it("compares numeric Android version codes and never prompts equal/older releases", () => {
  expect(newerRelease(release, 3)).toEqual(release);
  expect(newerRelease(release, 4)).toBeNull();
  expect(newerRelease(release, 5)).toBeNull();
  expect(
    newerRelease({ ...release, version: "0.1.0", versionCode: 10 }, 9)
      ?.versionCode,
  ).toBe(10);
  expect(() => newerRelease(release, NaN)).toThrow();
});

it("rejects unsafe/incomplete manifests and strips administrator metadata", () => {
  for (const patch of [
    { url: "http://example.com/a.apk" },
    { url: "https://user:password@example.com/a.apk" },
    { sha256: "bad" },
    { versionCode: "4" },
    { versionCode: -1 },
    { versionCode: 4.2 },
    { notes: null },
  ])
    expect(parseRelease({ ...release, ...patch })).toBeNull();
  expect(
    parseRelease({ ...release, actorId: "private", publishedAt: "private" }),
  ).toEqual(release);
  expect(
    latestRelease({ ...release, versionCode: 2 }, release)?.versionCode,
  ).toBe(4);
  expect(latestRelease(null, {})).toBeNull();
});

it("serves public startup updates without patient data and keeps publishing authenticated", async () => {
  const db = new DatabaseSync(":memory:");
  try {
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
    const key = Buffer.from(
      crypto.getRandomValues(new Uint8Array(32)),
    ).toString("base64");
    const clinic = new Clinic(
      { storage: { sql } } as any,
      { ENCRYPTION_KEY: key, APP_ORIGIN: "https://example.com" } as any,
    );
    const get = () =>
      clinic.fetch(new Request("https://example.com/api/app-release"));
    const first = await get();
    expect(first.status).toBe(200);
    expect(first.headers.get("Cache-Control")).toBe("no-store");
    expect(await first.json()).toEqual(bundled);
    const custom = {
      ...release,
      versionCode: bundled.versionCode + 1,
      actorId: "private-user",
    };
    db.prepare("INSERT INTO secrets VALUES(?,?)").run(
      "release",
      await seal(custom, key),
    );
    expect(await (await get()).json()).toEqual(parseRelease(custom));
    db.prepare("UPDATE secrets SET value=? WHERE id='release'").run(
      await seal({ ...release, versionCode: 1 }, key),
    );
    expect(await (await get()).json()).toEqual(bundled);
    const response = await clinic.fetch(
      new Request("https://example.com/api/update", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(release),
      }),
    );
    expect(response.status).toBe(401);
  } finally {
    db.close();
  }
});
