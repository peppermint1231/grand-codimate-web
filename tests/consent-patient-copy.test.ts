import { expect, it } from "vitest";
import {
  patientConsentBody,
  patientChecksFor,
  patientConsentChecks,
} from "../src/core/consentPatientCopy";
import {
  treatmentConsentDrafts,
  CONSENT_DRAFT_REVISION,
} from "../src/core/treatmentConsents";
import { applyCommand } from "../src/core/domain";
import { emptyState } from "../src/core/model";
import { catalogAdmin } from "./fixtures/catalogs";

it("renders patient-facing instructions without editorial wording and retains specific medical warnings", () => {
  for (const t of treatmentConsentDrafts) {
    expect(t.body).not.toMatch(
      /기존 (병원|안내|원문|기준)|세부안|사용기간 경과가 모든 잔액|환급 권리를 일괄 포기|이 문서를 읽고 방법/,
    );
    expect(patientConsentBody(t.body)).toBe(t.body);
  }
  const filler = treatmentConsentDrafts.find((t) => t.key === "ha-filler")!;
  expect(filler.body).toContain("시야");
  expect(filler.body).toContain("1~2주");
  expect(filler.body).toContain("잔여 횟수는 소멸됩니다");
  expect(filler.checks).toEqual(patientConsentChecks);
  const medication = treatmentConsentDrafts.find(
    (t) => t.key === "isotretinoin",
  )!;
  expect(medication.checks.join("\n")).toContain("헌혈 금지");
  expect(medication.checks).not.toContain(patientConsentChecks[4]);
  const membership = treatmentConsentDrafts.find(
    (t) => t.key === "membership",
  )!;
  expect(membership.body).toContain(
    "추가 혜택 금액은 현금으로 교환·환급되지 않으며",
  );
  expect(membership.body).not.toContain("50%");
});
it("removes exact obsolete paragraphs, renumbers details and preserves clinic-specific edits", () => {
  const body =
    "맞춤 제품 $&\n5-1. 시술별 세부 주의사항\n1) 내원 기준\n2) 이 문서를 읽고 방법·기대 효과·발생 가능한 합병증·주의사항을 설명받았습니다. 질문할 기회가 있었고 답변을 이해한 뒤 동의 여부를 결정합니다.\n3) 병원 개별 조건\n\n6. 환자의 선택\n추가 작성";
  const changed = patientConsentBody(body);
  expect(changed).toContain("2) 병원 개별 조건");
  expect(changed).toContain("맞춤 제품 $&");
  expect(changed).toContain("추가 작성");
  expect(changed).not.toContain("3)");
  const checks = patientChecksFor("toxin", [
    "병원 특수 주의사항",
    ...patientConsentChecks,
  ]);
  expect(checks[0]).toBe("병원 특수 주의사항");
  expect(patientChecksFor("toxin", checks)).toEqual(checks);
});
it("upgrades .4 drafts once, preserves published originals and signature snapshots", async () => {
  const command = {
    id: crypto.randomUUID(),
    type: "consent.installDrafts",
    payload: { keys: ["toxin"] },
  };
  let state = await applyCommand(emptyState(), catalogAdmin, command);
  const source = {
    ...state.consents[0],
    draftRevision: "2026-09-30.4",
    status: "published" as const,
    body: "병원 수정 $&\n음주·흡연은 시술 후 약 1주 삼가는 것이 기존 병원 기준입니다.",
  };
  state.consents = [source];
  const signature = {
    id: "signed",
    templateId: source.id,
    templateBody: source.body,
  } as any;
  state.signatures = [signature];
  const next = await applyCommand(state, catalogAdmin, {
    ...command,
    id: crypto.randomUUID(),
  });
  expect(next.consents[0]).toEqual(source);
  expect(next.signatures).toEqual([signature]);
  expect(next.consents[1].status).toBe("draft");
  expect(next.consents[1].body).toContain("병원 수정 $&");
  expect(next.consents[1].body).not.toContain("기존 병원 기준");
  expect(next.consents[1].draftRevision).toBe(CONSENT_DRAFT_REVISION);
  const again = await applyCommand(next, catalogAdmin, {
    ...command,
    id: crypto.randomUUID(),
  });
  expect(again.consents).toEqual(next.consents);
});
