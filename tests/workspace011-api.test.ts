import { afterEach, expect, it, vi } from "vitest";
import { clinicFixture } from "./fixtures/clinic";
import { Drive } from "../server/drive";
import { open, seal } from "../server/crypto";
const fixtures: Awaited<ReturnType<typeof clinicFixture>>[] = [];
async function fixture() {
  const f = await clinicFixture();
  fixtures.push(f);
  return f;
}
afterEach(() => {
  vi.restoreAllMocks();
  fixtures.splice(0).forEach((f) => f.db.close());
});
async function data(r: Response) {
  const d = (await r.json()) as any;
  expect(r.status, JSON.stringify(d)).toBe(200);
  return d;
}
it("projects workspace catalog sources/history, lazy-loads full authorized drafts, rejects projected writes", async () => {
  const f = await fixture();
  const cat = { ...f.state.catalogs[0], status: "draft" as const };
  await f.put("catalogs", cat);
  const revision = { id: "history", book: "미용", snapshot: cat };
  await f.put("catalogRevisions", revision);
  const full = await data(await f.request(f.admin, "/state"));
  const workspace = await data(
    await f.request(f.admin, "/state?view=workspace"),
  );
  expect(full.state.catalogRevisions).toHaveLength(1);
  expect(workspace.state.catalogRevisions).toEqual([]);
  expect(
    workspace.state.catalogs.every(
      (c: any) => c.workspaceOnly && c.references.length === 0,
    ),
  ).toBe(true);
  expect(
    (await data(await f.request(f.admin, "/catalogs/" + cat.id))).catalog,
  ).toEqual(cat);
  expect((await f.request(f.staff, "/catalogs/" + cat.id)).status).toBe(403);
  expect(
    (
      await f.request(f.admin, "/commands", {
        id: "save-projection",
        type: "catalog.save",
        entityId: cat.id,
        baseRev: cat.rev,
        payload: {
          catalog: workspace.state.catalogs.find((c: any) => c.id === cat.id),
        },
      })
    ).status,
  ).toBe(409);
  expect(
    (await data(await f.request(f.admin, "/catalog-history?book=미용")))
      .revisions[0].snapshot,
  ).toEqual({ status: "draft" });
});
it("returns fresh deltas for response-loss retries and rejects ID reuse with altered content", async () => {
  const f = await fixture(),
    c = f.state.consultations[0];
  const cmd = {
    id: "retry-save-001",
    type: "consultation.save",
    entityId: c.id,
    baseRev: 1,
    payload: { ...c.quote, memo: "첫 저장", photos: [] },
  };
  const first = await data(await f.request(f.admin, "/commands", cmd));
  expect(
    first.changes.find((x: any) => x.section === "consultations").value.rev,
  ).toBe(2);
  await data(
    await f.request(f.admin, "/commands", {
      ...cmd,
      id: "save-next-002",
      baseRev: 2,
      payload: { ...cmd.payload, memo: "최신 저장" },
    }),
  );
  const retry = await data(await f.request(f.admin, "/commands", cmd));
  expect(retry.replayed).toBe(true);
  expect(
    retry.changes.find((x: any) => x.section === "consultations").value,
  ).toMatchObject({ rev: 3, memo: "최신 저장" });
  expect(
    (
      await f.request(f.admin, "/commands", {
        ...cmd,
        payload: { ...cmd.payload, memo: "변경" },
      })
    ).status,
  ).toBe(409);
});
it("enforces analytics permission and financial redaction, validates dates, and paginates patients without leaking grade filters", async () => {
  const f = await fixture();
  expect(
    (await f.request(f.staff, "/analytics?from=2026-09-01&to=2026-09-30"))
      .status,
  ).toBe(403);
  await f.add({
    ...f.staff,
    permissions: { "stats.read": true, "money.read": false },
  });
  const report = await data(
    await f.request(f.staff, "/analytics?from=2026-09-01&to=2026-09-30"),
  );
  expect(report.financial).toBe(false);
  expect(report.totals.contract).toBe(0);
  expect(
    (await f.request(f.admin, "/analytics?from=2026-02-31&to=2026-09-30"))
      .status,
  ).toBe(400);
  for (let i = 0; i < 64; i++)
    await f.put("patients", {
      ...f.state.patients[0],
      id: "page-" + i,
      phone: "02" + String(i).padStart(8, "0"),
    });
  const first = await data(
    await f.request(f.staff, "/patients/search?page=0&grade=vip"),
  );
  const next = await data(await f.request(f.staff, "/patients/search?page=1"));
  expect(first.total).toBe(65);
  expect(first.rows).toHaveLength(30);
  expect(next.rows).toHaveLength(30);
  expect(
    first.rows.some((r: any) => next.rows.some((x: any) => x.p.id === r.p.id)),
  ).toBe(false);
  expect(first.rows.every((r: any) => r.m.revenue === 0 && r.g.id === "")).toBe(
    true,
  );
});
it("resumes encrypted media chunks, handles retry and response loss, rejects conflicting bytes, actor and order", async () => {
  const f = await fixture();
  const size = 327680 * 2 + 19;
  const bytes = new Uint8Array(size);
  bytes.fill(17);
  bytes[size - 1] = 43;
  const hash = Buffer.from(
    await crypto.subtle.digest("SHA-256", bytes),
  ).toString("hex");
  const meta = {
    id: "chunk-media-test",
    consultationId: "consult-test",
    name: "original.jpg",
    mime: "image/jpeg",
    size,
    sha256: hash,
  };
  expect(
    (await data(await f.request(f.admin, "/media-sessions", meta))).offset,
  ).toBe(0);
  expect(
    (
      await f.bytes(
        f.staff,
        "/media-sessions/" + meta.id + "?offset=0",
        bytes.slice(0, 327680),
      )
    ).status,
  ).toBe(403);
  expect(
    (
      await f.bytes(
        f.admin,
        "/media-sessions/" + meta.id + "?offset=327680",
        bytes.slice(0, 327680),
      )
    ).status,
  ).toBe(409);
  expect(
    (
      await data(
        await f.bytes(
          f.admin,
          "/media-sessions/" + meta.id + "?offset=0",
          bytes.slice(0, 327680),
        ),
      )
    ).offset,
  ).toBe(327680);
  expect(
    (await data(await f.request(f.admin, "/media-sessions", meta))).offset,
  ).toBe(327680);
  expect(
    (
      await data(
        await f.bytes(
          f.admin,
          "/media-sessions/" + meta.id + "?offset=0",
          bytes.slice(0, 327680),
        ),
      )
    ).offset,
  ).toBe(327680);
  expect(
    (
      await f.bytes(
        f.admin,
        "/media-sessions/" + meta.id + "?offset=0",
        new Uint8Array(327680),
      )
    ).status,
  ).toBe(409);
  await data(
    await f.bytes(
      f.admin,
      "/media-sessions/" + meta.id + "?offset=327680",
      bytes.slice(327680),
    ),
  );
  expect(
    (await data(await f.request(f.admin, "/media-sessions", meta))).done,
  ).toBe(true);
  const image = await f.request(f.admin, "/media/" + meta.id);
  expect(image.status).toBe(200);
  expect(new Uint8Array(await image.arrayBuffer())).toEqual(bytes);
  expect(
    (
      await f.request(f.admin, "/media-sessions", {
        ...meta,
        sha256: "a".repeat(64),
      })
    ).status,
  ).toBe(409);
});
async function mockArchive(
  f: Awaited<ReturnType<typeof fixture>>,
  bad = false,
) {
  const records = new Map<string, string>();
  for (let i = 0; i < 6; i++)
    records.set(
      "commit" + i,
      await seal(
        {
          changes: [
            {
              section: "patients",
              id: "restored",
              value: { ...f.state.patients[0], id: "restored", rev: i + 1 },
            },
          ],
        },
        f.key,
      ),
    );
  records.set(
    "account",
    bad
      ? "invalid"
      : await seal(
          { ...f.admin, id: "restored-admin", passwordHash: f.passwordHash },
          f.key,
        ),
  );
  vi.spyOn(Drive.prototype, "folders").mockResolvedValue();
  vi.spyOn(Drive.prototype, "listCommits").mockImplementation(
    async (kind = "commits") =>
      kind === "commits"
        ? Array.from({ length: 6 }, (_, i) => ({
            id: "commit" + i,
            name: "2026-01-0" + (i + 1) + ".enc",
          }))
        : kind === "accounts"
          ? [{ id: "account", name: "admin.enc" }]
          : [],
  );
  vi.spyOn(Drive.prototype, "get").mockImplementation(
    async (id) => new Response(records.get(id)),
  );
  return records;
}
it("stages recovery in batches, blocks mutations, preserves current data until atomic commit and revokes old sessions", async () => {
  const f = await fixture();
  await mockArchive(f);
  expect(
    (await f.request(f.staff, "/restore-jobs", { action: "start" })).status,
  ).toBe(403);
  const { job } = await data(
    await f.request(f.admin, "/restore-jobs", { action: "start" }),
  );
  expect(
    (
      await f.request(f.admin, "/commands", {
        id: "blocked",
        type: "audit.export",
        payload: { format: "statistics-xlsx" },
      })
    ).status,
  ).toBe(409);
  expect(
    (
      await f.request(f.admin, "/restore-jobs", {
        action: "commit",
        id: job.id,
      })
    ).status,
  ).toBe(409);
  const step = await data(
    await f.request(f.admin, "/restore-jobs", { action: "step", id: job.id }),
  );
  expect(step.job.processed).toBe(4);
  expect(
    (await data(await f.request(f.admin, "/state"))).state.patients[0].id,
  ).toBe("patient-test");
  expect(
    (await data(await f.request(f.admin, "/restore-jobs"))).job.processed,
  ).toBe(4);
  expect(
    (
      await data(
        await f.request(f.admin, "/restore-jobs", {
          action: "step",
          id: job.id,
        }),
      )
    ).job.phase,
  ).toBe("ready");
  expect(
    (
      await data(
        await f.request(f.admin, "/restore-jobs", {
          action: "commit",
          id: job.id,
        }),
      )
    ).requiresLogin,
  ).toBe(true);
  expect((await f.request(f.admin, "/state")).status).toBe(401);
  const patient = await open<any>(
    (
      f.db
        .prepare("SELECT value FROM entities WHERE section='patients'")
        .get() as any
    ).value,
    f.key,
  );
  expect(patient).toMatchObject({ id: "restored", rev: 6 });
});
it("keeps working data and resume cursor on corrupt archive; cancel releases mutation lock", async () => {
  const f = await fixture();
  await mockArchive(f, true);
  const { job } = await data(
    await f.request(f.admin, "/restore-jobs", { action: "start" }),
  );
  await data(
    await f.request(f.admin, "/restore-jobs", { action: "step", id: job.id }),
  );
  expect(
    (await f.request(f.admin, "/restore-jobs", { action: "step", id: job.id }))
      .status,
  ).toBe(503);
  expect(
    (await data(await f.request(f.admin, "/restore-jobs"))).job.processed,
  ).toBe(6);
  expect(
    (await data(await f.request(f.admin, "/state"))).state.patients[0].id,
  ).toBe("patient-test");
  await data(
    await f.request(f.admin, "/restore-jobs", { action: "cancel", id: job.id }),
  );
  await data(
    await f.request(f.admin, "/commands", {
      id: "unblocked",
      type: "audit.export",
      payload: { format: "statistics-xlsx" },
    }),
  );
});
it("requires verified administrator handover, preserves roles, records it and permits only admins to read audit", async () => {
  const f = await fixture();
  const body = {
    targetId: f.staff.id,
    reason: "관리자 인계 검증",
    password: f.password,
    keepAdministrator: false,
  };
  expect(
    (
      await f.request(f.staff, "/admin-handover", {
        ...body,
        targetId: f.admin.id,
      })
    ).status,
  ).toBe(403);
  expect(
    (
      await f.request(f.admin, "/admin-handover", {
        ...body,
        password: "wrong",
      })
    ).status,
  ).toBe(403);
  await data(await f.request(f.admin, "/admin-handover", body));
  expect((await data(await f.request(f.staff, "/state"))).user).toMatchObject({
    permissionLevel: "admin",
    role: "coordinator",
  });
  expect(
    (await data(await f.request(f.admin, "/state"))).user.permissionLevel,
  ).toBe("executive");
  expect((await f.request(f.admin, "/access-log")).status).toBe(403);
  const logs = await data(await f.request(f.staff, "/access-log"));
  expect(logs.entries.map((e: any) => e.action)).toContain(
    "admin.handover.complete",
  );
});
it("keeps the current administrator if OneDrive handover backup fails", async () => {
  const f = await fixture();
  f.env.REQUIRE_ONEDRIVE = "true";
  vi.spyOn(Drive.prototype, "put").mockRejectedValue(
    new Error("network interrupted"),
  );
  expect(
    (
      await f.request(f.admin, "/admin-handover", {
        targetId: f.staff.id,
        password: f.password,
        reason: "인계 실패 검증",
        keepAdministrator: false,
      })
    ).status,
  ).toBe(503);
  const owner = await open<any>(
    (
      f.db
        .prepare("SELECT value FROM secrets WHERE id=?")
        .get("user:" + f.admin.id) as any
    ).value,
    f.key,
  );
  expect(owner.permissionLevel).toBe("admin");
});
it("does not restore without a final active administrator, even if an earlier account snapshot was active", async () => {
  const f = await fixture();
  await mockArchive(f);
  const a = await seal({ ...f.admin, passwordHash: f.passwordHash }, f.key);
  const b = await seal(
    { ...f.admin, active: false, passwordHash: f.passwordHash },
    f.key,
  );
  vi.mocked(Drive.prototype.listCommits).mockImplementation(
    async (kind = "commits") =>
      kind === "accounts"
        ? [
            { id: "active", name: "1.enc" },
            { id: "inactive", name: "2.enc" },
          ]
        : [],
  );
  vi.mocked(Drive.prototype.get).mockImplementation(
    async (id) => new Response(id === "active" ? a : b),
  );
  const { job } = await data(
    await f.request(f.admin, "/restore-jobs", { action: "start" }),
  );
  expect(
    (await f.request(f.admin, "/restore-jobs", { action: "step", id: job.id }))
      .status,
  ).toBe(409);
  expect(
    (await data(await f.request(f.admin, "/state"))).state.patients[0].id,
  ).toBe("patient-test");
});
it("recovers final chunk metadata failure and session expiration without corrupting the original image", async () => {
  const f = await fixture();
  f.env.REQUIRE_ONEDRIVE = "true";
  const bytes = new Uint8Array(327680);
  const meta = {
    id: "remote-image-001",
    consultationId: "consult-test",
    name: "photo.jpg",
    mime: "image/jpeg",
    size: bytes.length,
    sha256: "b".repeat(64),
  };
  vi.spyOn(Drive.prototype, "exists").mockResolvedValue(null as any);
  const start = vi
    .spyOn(Drive.prototype, "startUpload")
    .mockResolvedValue({
      uploadUrl: "https://sample.1drv.com/upload",
      expirationDateTime: "2099-01-01",
    });
  const part = vi
    .spyOn(Drive.prototype, "uploadPart")
    .mockRejectedValueOnce(
      Object.assign(new Error("expired"), { expired: true }),
    )
    .mockResolvedValue({ id: "remote-result", size: bytes.length });
  const put = vi
    .spyOn(Drive.prototype, "put")
    .mockRejectedValueOnce(new Error("metadata interrupted"))
    .mockResolvedValue({ id: "metadata" } as any);
  await data(await f.request(f.admin, "/media-sessions", meta));
  expect(
    (await f.bytes(f.admin, "/media-sessions/" + meta.id + "?offset=0", bytes))
      .status,
  ).toBe(503);
  await data(await f.request(f.admin, "/media-sessions", meta));
  expect(start).toHaveBeenCalledTimes(2);
  expect(
    (await f.bytes(f.admin, "/media-sessions/" + meta.id + "?offset=0", bytes))
      .status,
  ).toBe(503);
  expect(
    (await data(await f.request(f.admin, "/media-sessions", meta))).done,
  ).toBe(true);
  expect(part).toHaveBeenCalledTimes(2);
  expect(put).toHaveBeenCalledTimes(2);
});
it("paginates equal-timestamp access records without missing or repeating entries", async () => {
  const f = await fixture();
  for (let i = 0; i < 70; i++) {
    const entry = {
      id: "log-" + String(i).padStart(2, "0"),
      at: "2026-09-23T00:00:00Z",
      actorId: f.admin.id,
      action: "patient.view",
      targetId: "patient-test",
      detail: "",
    };
    f.db
      .prepare("INSERT INTO access_log VALUES(?,?,?,0)")
      .run(entry.id, entry.at, await seal(entry, f.key));
  }
  const one = await data(await f.request(f.admin, "/access-log"));
  const two = await data(
    await f.request(
      f.admin,
      "/access-log?before=" + encodeURIComponent(one.next),
    ),
  );
  expect(one.entries).toHaveLength(50);
  expect(two.entries).toHaveLength(20);
  expect(
    new Set([...one.entries, ...two.entries].map((x: any) => x.id)).size,
  ).toBe(70);
});
