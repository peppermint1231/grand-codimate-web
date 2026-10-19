import { afterEach, expect, it, vi } from "vitest";
import { DatabaseSync } from "node:sqlite";
import { PatientPurgeJobs, patientPurgeSchema } from "../server/patientPurge";
import { seal, open } from "../server/crypto";
import { Drive, PermanentDeleteUnavailable } from "../server/drive";
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
      "CREATE TABLE entities(section TEXT,id TEXT,value TEXT,PRIMARY KEY(section,id));CREATE TABLE operations(id TEXT PRIMARY KEY,value TEXT);CREATE TABLE media(id TEXT PRIMARY KEY,value TEXT);CREATE TABLE secrets(id TEXT PRIMARY KEY,value TEXT);CREATE TABLE inquiries(id TEXT PRIMARY KEY,remoteId TEXT);",
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
    identity: vi.fn(async () => "test-drive"),
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
it.each(["400 invalidRequest", "403 permission"])(
  "does not claim success on %s and resumes the same durable pending rewrite after restart",
  async (message) => {
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
      f.drive.permanentRemove.mockRejectedValueOnce(new Error(message));
      expect(await f.jobs().step()).toMatchObject({
        phase: "operations",
        error: message,
      });
      expect(f.drive.put).not.toHaveBeenCalled();
      expect((await f.jobs().active())?.pending).toBeDefined();
      await finish(f);
      expect((await f.jobs().active())?.pending).toBeUndefined();
      expect(f.removed).toContain("old");
    } finally {
      f.db.close();
    }
  },
);
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

it("preserves Graph error codes and request ID on 400 without exposing patient data or falling back to trash", async () => {
  const fetch = vi
    .spyOn(globalThis, "fetch")
    .mockResolvedValueOnce(
      Response.json({ parentReference: { driveId: "drive" } }),
    )
    .mockResolvedValueOnce(
      Response.json(
        {
          error: {
            code: "invalidRequest",
            message: "API not found: 상담/가상환자/상담.json",
            innerError: {
              code: "notSupported",
              "request-id": "test-request-400",
            },
          },
        },
        { status: 400 },
      ),
    );
  const error = await new Drive(async () => "test")
    .permanentRemove("item")
    .catch((e) => e);
  expect(error.message).toContain("OneDrive 영구삭제 실패 (400)");
  expect(error.message).toContain("invalidRequest / notSupported");
  expect(error.message).toContain("test-request-400");
  expect(error.message).not.toContain("가상환자");
  expect(fetch).toHaveBeenCalledTimes(2);
  expect(fetch.mock.calls[1][1]).toMatchObject({
    method: "POST",
    headers: { Accept: "application/json" },
  });
  expect(fetch.mock.calls[1][1]?.body).toBeUndefined();
});

it("accepts a successful permanent deletion", async () => {
  const fetch = vi
    .spyOn(globalThis, "fetch")
    .mockResolvedValueOnce(
      Response.json({ parentReference: { driveId: "drive" } }),
    )
    .mockResolvedValueOnce(new Response(null, { status: 204 }));
  await expect(
    new Drive(async () => "test").permanentRemove("item"),
  ).resolves.toBeUndefined();
  expect(fetch).toHaveBeenCalledTimes(2);
});

it.each([true, false])(
  "verifies an action 404 against the item before claiming success (exists: %s)",
  async (exists) => {
    const fetch = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(
        Response.json({ parentReference: { driveId: "drive" } }),
      )
      .mockResolvedValueOnce(
        Response.json({ error: { code: "notSupported" } }, { status: 404 }),
      )
      .mockResolvedValueOnce(
        exists
          ? Response.json({ id: "item" })
          : new Response(null, { status: 404 }),
      );
    const result = new Drive(async () => "test").permanentRemove("item");
    if (exists) await expect(result).rejects.toThrow("notSupported");
    else await expect(result).resolves.toBeUndefined();
    expect(fetch).toHaveBeenCalledTimes(3);
    expect(fetch.mock.calls[2][0]).toBe(fetch.mock.calls[0][0]);
  },
);

it("keeps the original HTTP error when Graph returns a non-JSON response", async () => {
  vi.spyOn(globalThis, "fetch")
    .mockResolvedValueOnce(
      Response.json({ parentReference: { driveId: "drive" } }),
    )
    .mockResolvedValueOnce(new Response("unavailable", { status: 503 }));
  await expect(
    new Drive(async () => "test").permanentRemove("item"),
  ).rejects.toThrow("OneDrive 영구삭제 실패 (503)");
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
    f.db.prepare("INSERT INTO operations VALUES(?,?)").run(
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

it("erases old versions of the selected records even when a patient merge changed their patient ID", async () => {
  const f = fixture();
  try {
    const p = {
      ...plan,
      recordIds: { notes: ["linked-note"], ledger: ["linked-money"] },
      snapshots: [],
      inquiryIds: [],
    };
    const changes = [
      {
        section: "consultations",
        id: "c",
        value: {
          id: "c",
          patientId: "before-merge",
          category: "미용",
          photos: [{ mediaId: "old" }],
          documents: [],
        },
      },
      {
        section: "notes",
        id: "linked-note",
        value: {
          id: "linked-note",
          patientId: "before-merge",
          text: "과거 메모",
        },
      },
      {
        section: "ledger",
        id: "linked-money",
        value: { id: "linked-money", patientId: "before-merge", amount: 100 },
      },
      {
        section: "notes",
        id: "other-note",
        value: { id: "other-note", patientId: "another", text: "남길 메모" },
      },
    ];
    f.db
      .prepare("INSERT INTO operations VALUES(?,?)")
      .run(
        "old",
        await seal({ path: "상담/_codimate/commits/old.enc", changes }, key),
      );
    f.db.prepare("INSERT INTO entities VALUES(?,?,?)").run(
      "patients",
      "before-merge",
      await seal(
        {
          id: "before-merge",
          name: "통합전",
          sex: "F",
          storageName: "old-patient",
        },
        key,
      ),
    );
    f.files.set("상담/미용/old-patient/상담_c.json", "historical-mirror");
    await f.jobs().enqueue("j", p, "상담");
    await finish(f);
    const op = await open<any>(
      (f.db.prepare("SELECT value FROM operations").get() as any).value,
      key,
    );
    expect(op.changes.slice(0, 3).map((x: any) => x.value)).toEqual([
      null,
      null,
      null,
    ]);
    expect(op.changes[3].value.text).toBe("남길 메모");
    expect(f.removed).toContain("historical-mirror");
  } finally {
    f.db.close();
  }
});

it("finds historical consultation folders after the patient entity has already been erased, across restart", async () => {
  const f = fixture();
  try {
    const patient = {
      id: "p",
      name: "가상환자",
      sex: "F",
      storageName: "historical-folder",
    };
    for (const [id, changes] of [
      ["1", [{ section: "patients", id: "p", value: patient }]],
      ["2", []],
      [
        "3",
        [
          {
            section: "consultations",
            id: "c",
            value: {
              id: "c",
              patientId: "p",
              category: "보험",
              photos: [],
              documents: [],
            },
          },
        ],
      ],
    ] as const) {
      f.db
        .prepare("INSERT INTO operations VALUES(?,?)")
        .run(
          id,
          await seal(
            { path: `상담/_codimate/commits/${id}.enc`, changes },
            key,
          ),
        );
    }
    const oldPath = "상담/보험/historical-folder/상담_c.json";
    f.files.set(oldPath, "old-mirror");
    f.files.set(
      "상담/보험/historical-folder/상담_other.json",
      "unselected-mirror",
    );
    // The initial deletion already removed the patient. Only a current-category
    // snapshot was planned; the old category must be recovered from history.
    await f.jobs().enqueue(
      "j",
      {
        ...plan,
        snapshots: [{ path: "상담/미용/historical-folder/상담_c.json" }],
        inquiryIds: [],
      },
      "상담",
    );
    await f.jobs().step();
    // Each call creates a fresh job service, simulating durable-object restart.
    await finish(f);
    expect(f.removed).toContain("old-mirror");
    expect(f.db.prepare("SELECT * FROM patient_purge_folders").all()).toEqual(
      [],
    );
    expect(f.files.get("상담/보험/historical-folder/상담_other.json")).toBe(
      "unselected-mirror",
    );
  } finally {
    f.db.close();
  }
});

it("deletes only the selected file's chunks when its ID contains SQL wildcard characters", async () => {
  const f = fixture();
  try {
    for (const id of ["a_own", "axown", "a%file", "another-file"]) {
      f.db.prepare("INSERT INTO media VALUES(?,?)").run(
        id,
        await seal(
          {
            consultationId: id === "a_own" || id === "a%file" ? "c" : "other",
            mime: "image/jpeg",
          },
          key,
        ),
      );
      f.db
        .prepare("INSERT INTO secrets VALUES(?,?)")
        .run("file:" + id + ":0", "chunk");
    }
    await f
      .jobs()
      .enqueue("j", { ...plan, snapshots: [], inquiryIds: [] }, "상담");
    await finish(f);
    expect(
      f.db
        .prepare("SELECT id FROM secrets ORDER BY id")
        .all()
        .map((x: any) => x.id),
    ).toEqual(["file:another-file:0", "file:axown:0"]);
  } finally {
    f.db.close();
  }
});

it("resumes a sanitized rewrite after deletion succeeded but upload failed, preserving later consultation edits", async () => {
  const f = fixture();
  try {
    const path = "상담/_codimate/commits/failed-upload.enc";
    f.files.set(path, "old-version");
    f.db.prepare("INSERT INTO operations VALUES(?,?)").run(
      "history",
      await seal(
        {
          path,
          changes: [
            {
              section: "patients",
              id: "p",
              value: { id: "p", name: "지울이름" },
            },
            {
              section: "patients",
              id: "other",
              value: { id: "other", name: "남길이름" },
            },
          ],
        },
        key,
      ),
    );
    f.drive.put.mockRejectedValueOnce(new Error("upload interrupted"));
    await f.jobs().enqueue(
      "j",
      {
        ...plan,
        snapshots: [
          {
            path: "상담/current.json",
            consultationId: "c",
            content: "stale",
          },
        ],
      },
      "상담",
    );
    expect(await f.jobs().step()).toMatchObject({
      phase: "operations",
      completed: 0,
      error: "upload interrupted",
    });
    expect(f.files.has(path)).toBe(false);
    expect((await f.jobs().active())?.pending).toBeDefined();
    f.db
      .prepare("INSERT INTO entities VALUES(?,?,?)")
      .run(
        "consultations",
        "c",
        await seal(
          { id: "c", memo: "정리 시작 후 저장한 새 메모", rev: 8 },
          key,
        ),
      );
    await finish(f);
    const clean = await open<any>(
      (f.db.prepare("SELECT value FROM operations").get() as any).value,
      key,
    );
    expect(clean.changes[0].value).toBeNull();
    expect(clean.changes[1].value.name).toBe("남길이름");
    expect(f.drive.put).toHaveBeenCalledWith(
      "상담/current.json",
      JSON.stringify({
        schemaVersion: 1,
        consultation: { id: "c", memo: "정리 시작 후 저장한 새 메모", rev: 8 },
      }),
      "application/json",
    );
  } finally {
    f.db.close();
  }
});

it("identifies the fixed API-not-found response without treating it as a deleted file", async () => {
  const fetch = vi
    .spyOn(globalThis, "fetch")
    .mockResolvedValueOnce(
      Response.json({ parentReference: { driveId: "drive" } }),
    )
    .mockResolvedValueOnce(
      Response.json(
        { error: { code: "invalidRequest", message: "API not found" } },
        { status: 400 },
      ),
    );
  await expect(
    new Drive(async () => "test").permanentRemove("item"),
  ).rejects.toThrow("영구삭제 API를 찾지 못함");
  expect(fetch).toHaveBeenCalledTimes(2);
});

function personalFixture() {
  const f = fixture();
  const drive = Object.assign(f.drive, {
    isPersonal: vi.fn(async () => true),
    folders: vi.fn(async (path: string) => {
      f.files.set(path, "trash-folder");
    }),
    stageDeletion: vi.fn(async (id: string, folder: string) => {
      for (const [path, value] of f.files)
        if (value === id) f.files.delete(path);
      f.files.set(`${folder}/${id}`, id);
    }),
    recycleDeletionFolder: vi.fn(async (id: string, ids: Set<string>) => {
      for (const [path, value] of f.files)
        if (value === id || (path.startsWith(id + "/") && ids.has(value)))
          f.files.delete(path);
    }),
    itemExists: vi.fn(async (id: string) => [...f.files.values()].includes(id)),
  });
  drive.exists.mockImplementation(async (path) =>
    f.files.has(path)
      ? {
          id: f.files.get(path),
          ...(f.files.get(path) === "trash-folder" ? { folder: {} } : {}),
        }
      : undefined,
  );
  drive.permanentRemove.mockRejectedValue(
    new PermanentDeleteUnavailable("unsupported"),
  );
  return { ...f, drive };
}
async function awaitManual(f: ReturnType<typeof fixture>) {
  for (let n = 0; n < 30; n++) {
    const job = await f.jobs().step();
    if (job?.error) throw new Error(job.error);
    if (job?.phase === "awaiting-recycle-bin") return job;
  }
  throw new Error("never reached manual cleanup");
}
it("personal-drive cleanup preserves other patient history and versions, resumes after upload failure, and waits for explicit admin confirmation", async () => {
  const f = personalFixture();
  try {
    const path = "상담/_codimate/commits/history.enc";
    f.files.set(path, "old-with-versions");
    f.files.set("other/patient.jpg", "untouched");
    f.db.prepare("INSERT INTO operations VALUES(?,?)").run(
      "old",
      await seal(
        {
          path,
          changes: [
            {
              section: "patients",
              id: "p",
              value: { id: "p", name: "삭제대상" },
            },
            {
              section: "patients",
              id: "other",
              value: { id: "other", name: "유지대상" },
            },
          ],
        },
        key,
      ),
    );
    await f
      .jobs()
      .enqueue(
        "personal-job",
        { ...plan, snapshots: [], inquiryIds: [] },
        "상담",
      );
    f.drive.put.mockRejectedValueOnce(new Error("upload failed"));
    expect(await f.jobs().step()).toMatchObject({
      phase: "operations",
      completed: 0,
      error: "upload failed",
    });
    expect(f.files.get("trash-folder/old-with-versions")).toBe(
      "old-with-versions",
    );
    expect((await f.jobs().active())?.pending).toBeDefined();
    const waiting = await awaitManual(f);
    expect(waiting.phase).toBe("awaiting-recycle-bin");
    expect(f.drive.permanentRemove).toHaveBeenCalledTimes(1);
    expect(f.drive.recycleDeletionFolder).toHaveBeenCalledWith(
      "trash-folder",
      new Set(["old-with-versions"]),
    );
    const clean = await open<any>(
      (f.db.prepare("SELECT value FROM operations").get() as any).value,
      key,
    );
    expect(clean.changes[0].value).toBeNull();
    expect(clean.changes[1].value.name).toBe("유지대상");
    expect(f.files.get("other/patient.jpg")).toBe("untouched");
    expect(f.files.has(path)).toBe(true);
    expect(await f.jobs().step()).toEqual(waiting);
    const name = waiting.manualCleanup!.folderName;
    await expect(
      f.jobs().confirmRecycleBin("wrong-job", name, "admin"),
    ).rejects.toThrow("현재 삭제 작업");
    await expect(
      f.jobs().confirmRecycleBin("personal-job", "wrong-name", "admin"),
    ).rejects.toThrow("현재 삭제 작업");
    f.drive.identity.mockResolvedValueOnce("different-drive");
    await expect(
      f.jobs().confirmRecycleBin("personal-job", name, "admin"),
    ).rejects.toThrow("OneDrive 계정");
    f.files.set("restored-trash", "trash-folder");
    await expect(
      f.jobs().confirmRecycleBin("personal-job", name, "admin"),
    ).rejects.toThrow("복원");
    f.files.delete("restored-trash");
    expect(
      await f.jobs().confirmRecycleBin("personal-job", name, "admin"),
    ).toMatchObject({
      phase: "done",
      manualCleanup: { confirmedAt: expect.any(String) },
    });
    expect((await f.jobs().active())?.manualCleanup?.confirmedBy).toBe("admin");
    expect(f.db.prepare("SELECT * FROM patient_purge_trash").all()).toEqual([]);
  } finally {
    f.db.close();
  }
});
it("does not activate manual cleanup for business drives or ordinary failures", async () => {
  const f = personalFixture();
  try {
    f.drive.isPersonal.mockResolvedValue(false);
    f.files.set(plan.snapshots[0].path, "old");
    await f.jobs().enqueue("j", plan, "상담");
    for (let n = 0; n < 6; n++) await f.jobs().step();
    expect((await f.jobs().active())?.error).toBe("unsupported");
    expect(f.drive.stageDeletion).not.toHaveBeenCalled();
    expect(f.drive.recycleDeletionFolder).not.toHaveBeenCalled();
  } finally {
    f.db.close();
  }
});
it("keeps manual cleanup pending when staging or recycling fails and safely retries after restart", async () => {
  const f = personalFixture();
  try {
    f.files.set(plan.snapshots[0].path, "snapshot");
    await f.jobs().enqueue("j", plan, "상담");
    f.drive.stageDeletion.mockRejectedValueOnce(new Error("move failed"));
    for (let n = 0; n < 3; n++) await f.jobs().step();
    expect((await f.jobs().active())?.error).toBe("move failed");
    expect(f.files.get(plan.snapshots[0].path)).toBe("snapshot");
    f.drive.recycleDeletionFolder.mockRejectedValueOnce(
      new Error("recycle failed"),
    );
    for (let n = 0; n < 4; n++) {
      const result = await f.jobs().step();
      if (result?.error) break;
    }
    expect((await f.jobs().active())?.error).toBe("recycle failed");
    expect((await awaitManual(f)).phase).toBe("awaiting-recycle-bin");
  } finally {
    f.db.close();
  }
});
it("moves a single file with all versions using a stable non-patient name", async () => {
  const fetch = vi
    .spyOn(globalThis, "fetch")
    .mockResolvedValueOnce(Response.json({ id: "file" }))
    .mockResolvedValueOnce(Response.json({ id: "file", name: "private-name" }))
    .mockResolvedValueOnce(Response.json({ id: "file" }));
  await new Drive(async () => "test").stageDeletion("file", "quarantine");
  expect(fetch.mock.calls[2][1]?.method).toBe("PATCH");
  const payload = JSON.parse(fetch.mock.calls[2][1]!.body as string);
  expect(payload).toMatchObject({
    parentReference: { id: "quarantine" },
    "@microsoft.graph.conflictBehavior": "fail",
  });
  expect(payload.name).toMatch(/^file-[0-9a-f]{64}$/);
});
it("refuses to stage a whole folder", async () => {
  vi.spyOn(globalThis, "fetch")
    .mockResolvedValueOnce(Response.json({ id: "folder" }))
    .mockResolvedValueOnce(Response.json({ id: "folder", folder: {} }));
  await expect(
    new Drive(async () => "test").stageDeletion("folder", "quarantine"),
  ).rejects.toThrow("폴더 전체");
});
it.each([true, false])(
  "checks every page before recycling a dedicated folder (foreign child: %s)",
  async (foreign) => {
    const fetch = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(
        Response.json({ id: "folder", folder: {}, eTag: "folder-version" }),
      )
      .mockResolvedValueOnce(
        Response.json({
          value: [{ id: "own" }],
          "@odata.nextLink":
            "https://graph.microsoft.com/v1.0/me/drive/items/folder/children?$skiptoken=next",
        }),
      )
      .mockResolvedValueOnce(
        Response.json({ value: [{ id: foreign ? "other" : "own2" }] }),
      )
      .mockResolvedValueOnce(new Response(null, { status: 204 }));
    const result = new Drive(async () => "test").recycleDeletionFolder(
      "folder",
      new Set(["own", "own2"]),
    );
    if (foreign) {
      await expect(result).rejects.toThrow("대상 외 자료");
      expect(fetch).toHaveBeenCalledTimes(3);
    } else {
      await result;
      expect(fetch.mock.calls[3][1]?.method).toBe("DELETE");
      expect(fetch.mock.calls[3][1]?.headers).toMatchObject({
        "If-Match": "folder-version",
      });
      expect(fetch.mock.calls[3][0]).toContain("/items/folder");
    }
  },
);
