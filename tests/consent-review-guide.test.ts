import { expect, it } from "vitest";
import { consentReviewGuide } from "../src/core/consentReviewGuide";
import {
  consentPublishIssues,
  treatmentConsentDrafts,
} from "../src/core/treatmentConsents";

it("provides a specific writing example for every supplied draft review marker", () => {
  for (const draft of treatmentConsentDrafts) {
    const markers = [...draft.body.matchAll(/\[병원 확인\s*[:：][^\]]*\]/g)];
    expect(markers.length).toBeGreaterThan(0);
    for (const [marker] of markers) {
      const guide = consentReviewGuide(draft.key, marker);
      expect(guide.kind, `${draft.key}: ${marker}`).not.toBe("custom");
      expect(guide.instruction.length).toBeGreaterThan(20);
      // Pasting an unfilled example cannot bypass the existing review gate.
      expect(
        consentPublishIssues({
          name: draft.name,
          body: guide.example,
          checks: draft.checks,
        }),
      ).not.toEqual([]);
    }
  }
});
it("keeps contact, contractual and clinical guidance separate and falls back for custom edits", () => {
  expect(
    consentReviewGuide(
      "ha-filler",
      "[병원 확인: 연락처 및 진료시간 외 대응 방법]",
    ).kind,
  ).toBe("contact");
  expect(
    consentReviewGuide(
      "membership",
      "[병원 확인: 유상 금액과 혜택 금액의 사용 순서 및 기록 방식]",
    ).kind,
  ).toBe("contract");
  expect(
    consentReviewGuide("ha-filler", "[병원 확인: 병원에서 추가한 검사 항목]")
      .kind,
  ).toBe("custom");
  expect(
    consentReviewGuide(undefined, "[병원 확인: 사용자 지정 항목]").example,
  ).toContain("사용자 지정 항목");
  expect(
    consentReviewGuide(
      "eye-bag",
      `[병원 확인: ${treatmentConsentDrafts.find((t) => t.key === "eye-bag")!.review}]`,
    ).example,
  ).toContain("별도 양식명");
});
