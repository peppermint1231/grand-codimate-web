import { afterEach, expect, it, vi } from "vitest";
import { DatabaseSync } from "node:sqlite";
import { PatientPurgeJobs, patientPurgeSchema } from "../server/patientPurge";
import { seal, open } from "../server/crypto";
import { Drive } from "../server/drive";
import {
  noDeletionScope,
  normalizedDeletionScope,
  type PatientPurgePlan,
} from "../src/core/patientDeletion";
afterEach(() => vi.restoreAllMocks());
const key = Buffer.alloc(32, 4).toString("base64");
const plan: PatientPurgePlan = {
  patientIds: ["p"],
  consultationIds: ["c"],
  scope: normalizedDeletionScope({ ...noDeletionScope, profile: true }),
  protectedMediaIds: ["shared"],
  snapshots: [{ path: "상담/미용/환자/상담_c.json" }],
  inquiryIds: ["inquiry"],
};
function fixture() {
  const db = new DatabaseSync(":memory:");
  db.exec(
    patientPurgeSchema +
      "CREATE TABLE operations(id TEXT PRIMARY KEY,value TEXT);CREATE TABLE media(id TEXT PRIMARY KEY,value TEXT);CREATE TABLE secrets(id TEXT PRIMARY KEY,value TEXT);CREATE TABLE inquiries(id TEXT PRIMARY KEY,remoteId TEXT);",
  );
  const sql = {
    exec(q: string, ...args: any[]) {
      const rows = db.prepare(q).all(...args);
      return { toArray: () => rows };
    },
  };
  const files = new Map<string, string>(),
    removed: string[] = [];
  const drive = {
    exists: vi.fn(async (path: string) =>
      files.has(path) ? { id: files.get(path) } : undefined,
    ),
    permanentRemove: vi.fn(async (id: string) => {
      removed.push(id);
      for (const [p, v] of files) if (v === id) files.delete(p);
    }),
    put: vi.fn(async (path: string) => {
      files.set(path, "new-" + path);
    }),
    cancelUpload: vi.fn(async () => {}),
  };
  return {
    db,
    sql,
    files,
    removed,
    drive,
    jobs: () => new PatientPurgeJobs(sql, key, drive as any),
  };
}
async function finish(f: ReturnType<typeof fixture>) {
  let last;
  for (let i = 0; i < 30; i++) {
    last = await f.jobs().step();
    if (last?.error) throw new Error(last.error);
    if (last?.phase === "done") return last;
  }
  throw new Error("job did not finish " + JSON.stringify(last));
}
it("scrubs historical snapshots and old cleanup metadata; removes actual files/chunks while protecting shared and newly uploaded media", async () => {
  const f = fixture();
  try {
    const old = {
      path: "상담/_codimate/commits/old.enc",
      changes: [
        { section: "patients", id: "p", value: { id: "p", name: "지울이름" } },
        {
          section: "patients",
          id: "other",
          value: { id: "other", name: "남길이름" },
        },
      ],
      purge: { ...plan, snapshots: [{ path: "x", content: "지울이름" }] },
    };
    f.db
      .prepare("INSERT INTO operations VALUES(?,?)")
      .run("old", await seal(old, key));
    f.files.set(old.path, "old-versioned-file");
    for (const id of ["a-own", "shared", "z-other"]) {
      const m = {
        consultationId: id === "z-other" ? "other" : "c",
        mime: "image/jpeg",
        remoteId: id,
      };
      f.db.prepare("INSERT INTO media VALUES(?,?)").run(id, await seal(m, key));
      f.db
        .prepare("INSERT INTO secrets VALUES(?,?)")
        .run("file:" + id + ":0", "chunk");
      f.files.set("상담/_codimate/media/" + id + ".enc", id + "-meta");
    }
    f.db.prepare("INSERT INTO secrets VALUES(?,?)").run(
      "media-session:unfinished",
      await seal(
        {
          consultationId: "c",
          mime: "image/jpeg",
          uploadUrl: "https://upload.test/session",
        },
        key,
      ),
    );
    f.db
      .prepare("INSERT INTO secrets VALUES(?,?)")
      .run("file:unfinished:0", "chunk");
    f.db
      .prepare("INSERT INTO inquiries VALUES(?,?)")
      .run("inquiry", "inquiry-original");
    f.files.set(plan.snapshots[0].path, "consult-mirror");
    await f.jobs().enqueue("job", plan, "상담");
    expect(
      await f
        .jobs()
        .blocksMedia("a-own", { consultationId: "c", mime: "image/jpeg" }),
    ).toBe(true);
    expect(
      await f
        .jobs()
        .blocksMedia("shared", { consultationId: "c", mime: "image/jpeg" }),
    ).toBe(false);
    // A rowid can be reused after deletion. The frozen ID set must never absorb a new upload.
    f.db.prepare("DELETE FROM media WHERE id='z-other'").run();
    f.db
      .prepare("INSERT INTO media VALUES(?,?)")
      .run(
        "new-upload",
        await seal({ consultationId: "c", mime: "image/jpeg" }, key),
      );
    await finish(f);
    const clean = await open<any>(
      (f.db.prepare("SELECT value FROM operations").get() as any).value,
      key,
    );
    expect(clean.changes[0].value).toBeNull();
    expect(clean.changes[1].value.name).toBe("남길이름");
    expect(clean).not.toHaveProperty("purge");
    expect(f.removed).toEqual(
      expect.arrayContaining([
        "old-versioned-file",
        "a-own",
        "a-own-meta",
        "inquiry-original",
        "consult-mirror",
      ]),
    );
    expect(f.removed).not.toContain("shared");
    expect(
      f.db
        .prepare("SELECT id FROM media ORDER BY id")
        .all()
        .map((r: any) => r.id),
    ).toEqual(["new-upload", "shared"]);
    expect(
      f.db
        .prepare(
          "SELECT id FROM secrets WHERE id IN ('file:a-own:0','file:unfinished:0','media-session:unfinished')",
        )
        .all(),
    ).toEqual([]);
    expect(f.drive.cancelUpload).toHaveBeenCalledWith(
      "https://upload.test/session",
    );
    expect(f.db.prepare("SELECT * FROM patient_purge_media").all()).toEqual([]);
  } finally {
    f.db.close();
  }
});
it("does not claim success on permanent-delete failure and resumes the same durable pending rewrite after restart", async () => {
  const f = fixture();
  try {
    const path = "상담/_codimate/commits/1.enc";
    f.files.set(path, "old");
    f.db.prepare("INSERT INTO operations VALUES(?,?)").run(
      "1",
      await seal(
        {
          path,
          changes: [
            {
              section: "patients",
              id: "p",
              value: { id: "p", name: "지울이름" },
            },
          ],
        },
        key,
      ),
    );
    await f.jobs().enqueue("j", plan, "상담");
    f.drive.permanentRemove.mockRejectedValueOnce(new Error("403 permission"));
    expect(await f.jobs().step()).toMatchObject({
      phase: "operations",
      error: "403 permission",
    });
    expect(f.drive.put).not.toHaveBeenCalled();
    expect((await f.jobs().active())?.pending).toBeDefined();
    await finish(f);
    expect((await f.jobs().active())?.pending).toBeUndefined();
    expect(f.removed).toContain("old");
  } finally {
    f.db.close();
  }
});
it("uses OneDrive permanentDelete, never silently falling back to recycle-bin deletion", async () => {
  const fetch = vi
    .spyOn(globalThis, "fetch")
    .mockResolvedValueOnce(
      Response.json({ parentReference: { driveId: "drive" } }),
    )
    .mockResolvedValueOnce(new Response(null, { status: 403 }));
  const d = new Drive(async () => "test");
  await expect(d.permanentRemove("item")).rejects.toThrow("403");
  expect(fetch.mock.calls[1][0]).toBe(
    "https://graph.microsoft.com/v1.0/drives/drive/items/item/permanentDelete",
  );
  expect(fetch.mock.calls[1][1]?.method).toBe("POST");
  expect(fetch).toHaveBeenCalledTimes(2);
  fetch.mockResolvedValueOnce(new Response(null, { status: 404 }));
  await expect(d.permanentRemove("already-gone")).resolves.toBeUndefined();
});

it("document-only erasure removes historical JPG exports while preserving patient photos", async () => {
  const f = fixture();
  try {
    const p = {
      ...plan,
      scope: normalizedDeletionScope({ ...noDeletionScope, documents: true }),
      snapshots: [],
      inquiryIds: [],
    };
    f.db
      .prepare("INSERT INTO operations VALUES(?,?)")
      .run(
        "history",
        await seal(
          {
            path: "상담/_codimate/commits/h.enc",
            changes: [
              {
                section: "consultations",
                id: "c",
                value: {
                  id: "c",
                  patientId: "p",
                  documents: ["jpg-export"],
                  photos: [],
                },
              },
            ],
          },
          key,
        ),
      );
    for (const id of ["jpg-export", "patient-photo"])
      f.db
        .prepare("INSERT INTO media VALUES(?,?)")
        .run(
          id,
          await seal(
            { consultationId: "c", mime: "image/jpeg", remoteId: id },
            key,
          ),
        );
    await f.jobs().enqueue("j", p, "상담");
    await finish(f);
    expect(f.removed).toContain("jpg-export");
    expect(f.removed).not.toContain("patient-photo");
    expect(
      f.db
        .prepare("SELECT id FROM media")
        .all()
        .map((r: any) => r.id),
    ).toEqual(["patient-photo"]);
  } finally {
    f.db.close();
  }
});
