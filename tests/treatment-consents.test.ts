import { expect, it } from "vitest";
import { applyCommand, sha, consentContent } from "../src/core/domain";
import { emptyState, type Command } from "../src/core/model";
import { catalogAdmin } from "./fixtures/catalogs";
import {
  treatmentConsentDrafts,
  CONSENT_DRAFT_REVISION,
  consentPublishIssues,
} from "../src/core/treatmentConsents";
const cmd = (
  type: string,
  payload: Record<string, unknown>,
  entityId?: string,
  baseRev?: number,
): Command => ({ id: crypto.randomUUID(), type, payload, entityId, baseRev });
const install = () =>
  cmd("consent.installDrafts", {
    keys: treatmentConsentDrafts.map((t) => t.key),
  });
it("installs review-only drafts once and never overwrites hospital edits", async () => {
  const input = emptyState();
  let s = await applyCommand(input, catalogAdmin, install());
  expect(input.consents).toEqual([]);
  expect(s.consents).toHaveLength(23);
  expect(
    s.consents.every(
      (t) =>
        t.status === "draft" &&
        t.checks.length &&
        consentPublishIssues(t).length,
    ),
  ).toBe(true);
  const t = s.consents[0];
  s = await applyCommand(
    s,
    catalogAdmin,
    cmd("consent.save", { ...t, body: t.body + "\n병원 편집" }, t.id, t.rev),
  );
  const before = structuredClone(s.consents);
  s = await applyCommand(s, catalogAdmin, install());
  expect(s.consents).toEqual(before);
});
it("rejects ordinary staff installation and publishing unreviewed or unfinished drafts", async () => {
  await expect(
    applyCommand(
      emptyState(),
      { ...catalogAdmin, role: "doctor", permissionLevel: "standard" },
      install(),
    ),
  ).rejects.toMatchObject({ status: 403 });
  await expect(
    applyCommand(
      emptyState(),
      catalogAdmin,
      cmd("consent.installDrafts", { keys: ["fake"] }),
    ),
  ).rejects.toThrow("종류");
  const s = await applyCommand(emptyState(), catalogAdmin, install()),
    t = s.consents[0];
  await expect(
    applyCommand(
      s,
      catalogAdmin,
      cmd(
        "consent.save",
        { ...t, status: "published", reviewConfirmed: true },
        t.id,
        t.rev,
      ),
    ),
  ).rejects.toThrow("병원 확인");
  const body = t.body.replace(/\[병원 확인:[^\]]+\]/g, "검증용 병원 기준");
  await expect(
    applyCommand(
      s,
      catalogAdmin,
      cmd("consent.save", { ...t, body, status: "published" }, t.id, t.rev),
    ),
  ).rejects.toThrow("검토 완료");
  await expect(
    applyCommand(
      s,
      catalogAdmin,
      cmd(
        "consent.save",
        { ...t, body, checks: [], status: "published", reviewConfirmed: true },
        t.id,
        t.rev,
      ),
    ),
  ).rejects.toThrow("확인할 항목");
});
it("records reviewer, protects published originals, clones to next version and rejects stale edits", async () => {
  let s = await applyCommand(emptyState(), catalogAdmin, install()),
    t = s.consents[0];
  const body = t.body.replace(/\[병원 확인:[^\]]+\]/g, "검증용 병원 기준");
  s = await applyCommand(
    s,
    catalogAdmin,
    cmd(
      "consent.save",
      { ...t, body, status: "published", reviewConfirmed: true },
      t.id,
      t.rev,
    ),
    "2026-09-30T01:00:00.000Z",
  );
  const original = structuredClone(s.consents[0]);
  expect(original.reviewedBy).toBe(catalogAdmin.id);
  expect(original.reviewedAt).toBe("2026-09-30T01:00:00.000Z");
  await expect(
    applyCommand(
      s,
      catalogAdmin,
      cmd(
        "consent.save",
        { ...original, status: "draft" },
        original.id,
        original.rev,
      ),
    ),
  ).rejects.toThrow("복제");
  s = await applyCommand(
    s,
    catalogAdmin,
    cmd(
      "consent.save",
      { ...original, status: "draft", sourceTemplateId: original.id },
      "copy",
    ),
  );
  const copy = s.consents.find((t) => t.id === "copy")!;
  expect(copy.version).toBe(2);
  expect(copy.draftKey).toBe(original.draftKey);
  expect(copy.reviewedBy).toBeUndefined();
  expect(s.consents[0]).toEqual(original);
  await expect(
    applyCommand(
      s,
      catalogAdmin,
      cmd("consent.save", { ...copy, body: "changed" }, copy.id, 0),
    ),
  ).rejects.toMatchObject({ status: 409 });
});

it("requires published templates for signing and snapshots the reviewed text", async () => {
  let s = await applyCommand(emptyState(), catalogAdmin, install());
  s = await applyCommand(
    s,
    catalogAdmin,
    cmd(
      "patient.create",
      {
        name: "합성환자",
        sex: "F",
        dob: "1990-01-01",
        phone: "01000000000",
        address: "시험동",
      },
      "patient",
    ),
  );
  s = await applyCommand(
    s,
    catalogAdmin,
    cmd(
      "consultation.create",
      { patientId: "patient", category: "미용" },
      "consult",
    ),
  );
  let t = s.consents[0];
  const payload = {
    consultationId: "consult",
    templateId: t.id,
    checks: t.checks,
    signer: "합성환자",
    image: "data:image/png;base64," + "A".repeat(400),
    contentHash: "",
  };
  await expect(
    applyCommand(s, catalogAdmin, cmd("signature.create", payload)),
  ).rejects.toThrow("검토·게시");
  s = await applyCommand(
    s,
    catalogAdmin,
    cmd(
      "consent.save",
      {
        ...t,
        body: t.body.replace(/\[병원 확인:[^\]]+\]/g, "합성 기준"),
        status: "published",
        reviewConfirmed: true,
      },
      t.id,
      t.rev,
    ),
  );
  t = s.consents[0];
  payload.contentHash = await sha(
    consentContent(s.consultations[0]) + JSON.stringify(t),
  );
  s = await applyCommand(s, catalogAdmin, cmd("signature.create", payload));
  expect(s.signatures[0].templateBody).toBe(t.body);
  expect(s.signatures[0].templateVersion).toBe(t.version);
});

it("upgrades older hospital drafts as new versions and preserves published forms and signatures", async () => {
  let state = await applyCommand(emptyState(), catalogAdmin, install());
  state.consents = state.consents
    .slice(0, 16)
    .map((t, i) => ({
      ...t,
      draftRevision: undefined,
      body: t.body + "\n병원별 기존 수정",
      status: i === 0 ? "published" : "draft",
    }));
  const originals = structuredClone(state.consents);
  const signatures = structuredClone(state.signatures);
  state = await applyCommand(state, catalogAdmin, install());
  expect(state.consents).toHaveLength(39);
  expect(state.consents.slice(0, 16)).toEqual(originals);
  expect(state.signatures).toEqual(signatures);
  const updated = state.consents.filter(
    (t) => t.draftRevision === CONSENT_DRAFT_REVISION,
  );
  expect(updated).toHaveLength(23);
  expect(updated.every((t) => t.status === "draft")).toBe(true);
  expect(
    updated.find((t) => t.draftKey === originals[0].draftKey)?.sourceTemplateId,
  ).toBe(originals[0].id);
  const again = await applyCommand(state, catalogAdmin, install());
  expect(again.consents).toEqual(state.consents);
});
it("blocks unresolved review placeholders in patient checks too", () => {
  expect(
    consentPublishIssues({
      name: "양식",
      body: "검토된 본문",
      checks: ["[병원 확인: 약제]"],
    }),
  ).not.toEqual([]);
});
