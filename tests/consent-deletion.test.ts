import { afterEach, expect, it, vi } from "vitest";
import { clinicFixture } from "./fixtures/clinic";
import { Drive } from "../server/drive";
import { open, seal } from "../server/crypto";
import { consentContent, sha } from "../src/core/domain";
import {
  diffStateChanges,
  mergeStateChanges,
  visibleChanges,
} from "../src/core/stateChanges";
import type { Consent } from "../src/core/model";
const fixtures: Awaited<ReturnType<typeof clinicFixture>>[] = [];
afterEach(() => {
  vi.restoreAllMocks();
  fixtures.splice(0).forEach((f) => f.db.close());
});
async function fixture() {
  const f = await clinicFixture();
  fixtures.push(f);
  const template: Consent = {
    id: "form",
    rev: 1,
    createdAt: "2026-09-30T00:00:00Z",
    updatedAt: "2026-09-30T00:00:00Z",
    name: "합성 동의서",
    body: "검토한 본문",
    checks: ["설명을 확인했습니다"],
    productIds: [],
    status: "published",
    version: 1,
  };
  f.state.consents = [
    template,
    {
      ...template,
      id: "revision",
      sourceTemplateId: template.id,
      status: "draft",
      version: 2,
    },
  ];
  for (const t of f.state.consents) await f.put("consents", t);
  const deletion = {
    id: "delete-form",
    type: "consent.delete",
    entityId: template.id,
    baseRev: 1,
    payload: { confirmed: true },
  };
  const sign = async () => ({
    id: "sign-form",
    type: "signature.create",
    entityId: "signature",
    payload: {
      templateId: template.id,
      consultationId: f.state.consultations[0].id,
      checks: template.checks,
      signer: "검증환자",
      image: "data:image/png;base64," + "A".repeat(400),
      contentHash: await sha(
        consentContent(f.state.consultations[0]) + JSON.stringify(template),
      ),
    },
  });
  return { ...f, template, deletion, sign };
}
async function data(r: Response) {
  const d = (await r.json()) as any;
  expect(r.status, JSON.stringify(d)).toBe(200);
  return d;
}
it("deletes unsigned published forms, preserves revision drafts and audits; deltas remove cached records idempotently", async () => {
  const f = await fixture();
  const result = await data(await f.request(f.admin, "/commands", f.deletion));
  expect(result.changes).toContainEqual({
    section: "consents",
    id: "form",
    value: null,
  });
  const after = (await data(await f.request(f.admin, "/state"))).state;
  expect(after.consents).toEqual([f.state.consents[1]]);
  expect(JSON.stringify(after.events)).toContain("동의서 양식 영구삭제");
  const merged = mergeStateChanges(f.state, result.changes);
  expect(merged.consents).toEqual(after.consents);
  expect(mergeStateChanges(merged, result.changes)).toEqual(merged);
  expect(diffStateChanges(f.state, after)).toContainEqual({
    section: "consents",
    id: "form",
    value: null,
  });
  expect(visibleChanges(result.changes, f.staff)).toContainEqual({
    section: "consents",
    id: "form",
    value: null,
  });
  const retry = await data(await f.request(f.admin, "/commands", f.deletion));
  expect(retry.replayed).toBe(true);
  expect(retry.changes).toContainEqual({
    section: "consents",
    id: "form",
    value: null,
  });
});
it("requires management authority, explicit confirmation, matching revision and existing form", async () => {
  const f = await fixture();
  expect((await f.request(f.staff, "/commands", f.deletion)).status).toBe(403);
  expect(
    (await f.request(f.admin, "/commands", { ...f.deletion, payload: {} }))
      .status,
  ).toBe(400);
  expect(
    (await f.request(f.admin, "/commands", { ...f.deletion, baseRev: 0 }))
      .status,
  ).toBe(409);
  expect(
    (
      await f.request(f.admin, "/commands", {
        ...f.deletion,
        entityId: "missing",
      })
    ).status,
  ).toBe(404);
  const executive = {
    ...f.staff,
    id: "executive",
    permissionLevel: "executive" as const,
  };
  await f.add(executive);
  await data(
    await f.request(executive, "/commands", {
      ...f.deletion,
      entityId: "revision",
    }),
  );
});
it("blocks deletion once any signature exists, including cancelled consultations and different template versions", async () => {
  const f = await fixture();
  await data(await f.request(f.admin, "/commands", await f.sign()));
  await f.put("consultations", {
    ...f.state.consultations[0],
    cancelled: true,
  });
  await f.put("consents", { ...f.template, version: 2 });
  const result = await f.request(f.admin, "/commands", f.deletion);
  expect(result.status).toBe(409);
  expect(await result.json()).toMatchObject({
    error: "받은 서명이 있는 양식은 영구삭제할 수 없습니다",
  });
  const state = (await data(await f.request(f.admin, "/state"))).state;
  expect(state.signatures).toHaveLength(1);
  expect(state.consents).toHaveLength(2);
});
it("serializes signature and deletion races in both orders", async () => {
  const f = await fixture();
  const signing = await f.sign();
  const first = await Promise.all([
    f.request(f.admin, "/commands", signing),
    f.request(f.admin, "/commands", f.deletion),
  ]);
  expect(first.map((r) => r.status)).toEqual([200, 409]);
  const g = await fixture();
  const second = await Promise.all([
    g.request(g.admin, "/commands", g.deletion),
    g.request(g.admin, "/commands", await g.sign()),
  ]);
  expect(second.map((r) => r.status)).toEqual([200, 400]);
});
it("old save retries report a tombstone and new stale saves cannot recreate the deleted form", async () => {
  const f = await fixture();
  const save = {
    id: "save-draft",
    type: "consent.save",
    entityId: "revision",
    baseRev: 1,
    payload: f.state.consents[1],
  };
  await data(await f.request(f.admin, "/commands", save));
  await data(
    await f.request(f.admin, "/commands", {
      ...f.deletion,
      entityId: "revision",
      baseRev: 2,
    }),
  );
  const retry = await data(await f.request(f.admin, "/commands", save));
  expect(retry.changes).toContainEqual({
    section: "consents",
    id: "revision",
    value: null,
  });
  expect(
    (
      await f.request(f.admin, "/commands", {
        ...save,
        id: "stale-save",
        baseRev: 2,
      })
    ).status,
  ).toBe(404);
});
for (const resumable of [false, true])
  it(`preserves deletion through ${resumable ? "resumable" : "legacy"} OneDrive restoration`, async () => {
    const f = await fixture();
    await data(await f.request(f.admin, "/commands", f.deletion));
    const row = f.db
      .prepare("SELECT value FROM operations WHERE id=?")
      .get(f.deletion.id) as { value: string };
    const deletion = await open<any>(row.value, f.key);
    expect(deletion.changes).toContainEqual({
      section: "consents",
      id: "form",
      value: null,
    });
    const records = new Map([
      [
        "initial",
        await seal(
          {
            changes: f.state.consents.map((value) => ({
              section: "consents",
              id: value.id,
              value,
            })),
          },
          f.key,
        ),
      ],
      ["delete", row.value],
      [
        "account",
        await seal({ ...f.admin, passwordHash: f.passwordHash }, f.key),
      ],
    ]);
    vi.spyOn(Drive.prototype, "folders").mockResolvedValue();
    vi.spyOn(Drive.prototype, "listCommits").mockImplementation(
      async (kind = "commits") =>
        kind === "commits"
          ? [
              { id: "initial", name: "01.enc" },
              { id: "delete", name: "02.enc" },
            ]
          : kind === "accounts"
            ? [{ id: "account", name: "admin.enc" }]
            : [],
    );
    vi.spyOn(Drive.prototype, "get").mockImplementation(
      async (id) => new Response(records.get(id)),
    );
    // Simulate stale cache at the destination before restoring the full journal.
    await f.put("consents", f.template);
    if (resumable) {
      let job = (
        await data(
          await f.request(f.admin, "/restore-jobs", { action: "start" }),
        )
      ).job;
      while (job.phase !== "ready")
        job = (
          await data(
            await f.request(f.admin, "/restore-jobs", {
              action: "step",
              id: job.id,
            }),
          )
        ).job;
      await data(
        await f.request(f.admin, "/restore-jobs", {
          action: "commit",
          id: job.id,
        }),
      );
    } else await data(await f.request(f.admin, "/restore", {}));
    expect(
      f.db.prepare("SELECT id FROM entities WHERE section='consents'").all(),
    ).toEqual([{ id: "revision" }]);
  });
