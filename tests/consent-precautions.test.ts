import { expect, it } from "vitest";
import { applyCommand } from "../src/core/domain";
import { emptyState, type Command } from "../src/core/model";
import { catalogAdmin } from "./fixtures/catalogs";
import {
  treatmentConsentDrafts,
  CONSENT_DRAFT_REVISION,
  consentPublishIssues,
} from "../src/core/treatmentConsents";
import {
  supplementConsentBody,
  supplementConsentChecks,
  PRECAUTION_HEADING,
  PRECAUTION_REVIEW_TOPIC,
  precautionFor,
} from "../src/core/consentPrecautions";
import { consentReviewGuide } from "../src/core/consentReviewGuide";
const install = (keys = treatmentConsentDrafts.map((t) => t.key)): Command => ({
  id: crypto.randomUUID(),
  type: "consent.installDrafts",
  payload: { keys },
});
it("adds missing behavioral instructions to all affected procedure families and preserves confirmed contact", () => {
  const expected: Record<string, string[]> = {
    toxin: ["음주·흡연", "세안·샤워", "근육의 돌출", "볼패임", "무거운 느낌"],
    "ha-filler": ["음주·흡연", "수영", "세안·샤워·화장"],
    threads: ["수영", "처방약", "실을 잡아당기지"],
    "eye-bag": ["세안·화장", "음주·흡연", "사우나·수영"],
    juvegen: ["음주·흡연", "수영", "피부염", "리터치"],
    "lesion-removal": ["물에 오래 담그기", "드레싱", "수개월", "목·몸"],
    repot: ["클렌징 티슈", "이중세안", "전동 브러시", "임상 사진", "진물"],
    scalp: ["샴푸", "음주·흡연", "수영", "주삿바늘 자국"],
    "pigment-laser": ["보습", "수분 섭취", "딱지", "자외선"],
    "hair-removal": ["뽑거나 왁싱하지", "샤워와 면도", "모낭염"],
    isotretinoin: ["두 가지 피임법", "반납·폐기", "레티노이드"],
  };
  for (const [key, terms] of Object.entries(expected)) {
    const t = treatmentConsentDrafts.find((t) => t.key === key)!;
    for (const term of terms) expect(t.body, key).toContain(term);
    expect(t.body).toContain("1899-5109");
    expect(consentPublishIssues(t).length).toBeGreaterThan(0);
  }
  expect(precautionFor("peeling")).toBeDefined();
  expect(precautionFor("iv-injection")).toBeUndefined();
});
it("separates original numeric references from patient text and shows a review example", () => {
  const t = treatmentConsentDrafts.find((t) => t.key === "juvegen")!;
  expect(t.body).not.toContain("2~4주");
  const guide = consentReviewGuide(
    t.key,
    `[병원 확인: ${PRECAUTION_REVIEW_TOPIC}]`,
  );
  expect(guide.reference).toContain("2~4주");
  expect(guide.example).toContain("[병원 확인:");
  expect(guide.instruction).toContain("확정된 환자 지침이 아닙니다");
});
it("preserves custom body and checks, inserts before choice and is idempotent", () => {
  const old = "병원별 제품·용량 $& 원문\n\n6. 환자의 선택\n병원 안내";
  const body = supplementConsentBody("toxin", old);
  expect(body.startsWith("병원별 제품·용량 $& 원문")).toBe(true);
  expect(body.endsWith("6. 환자의 선택\n병원 안내")).toBe(true);
  expect(body.indexOf(PRECAUTION_HEADING)).toBeLessThan(
    body.indexOf("6. 환자의 선택"),
  );
  expect(supplementConsentBody("toxin", body)).toBe(body);
  expect(
    supplementConsentChecks(
      "toxin",
      supplementConsentChecks("toxin", ["병원 확인란"]),
    ),
  ).toEqual(supplementConsentChecks("toxin", ["병원 확인란"]));
  expect(supplementConsentBody("unknown", old)).toBe(old);
});
it("updates current unpublished forms, creates separate published revisions and preserves all unrelated history", async () => {
  let s = await applyCommand(
    emptyState(),
    catalogAdmin,
    install(["toxin", "repot", "membership"]),
  );
  s.consents = s.consents.map((t, i) => ({
    ...t,
    draftRevision: "2026-09-30.2",
    body: `병원 수정 ${i}`,
    checks: [`병원 확인란 ${i}`],
    productIds: [`product-${i}`],
    status: i === 0 ? "published" : "draft",
  }));
  const historical = {
    ...s.consents[1],
    id: "old-repot",
    version: 0,
    body: "이전 초안",
    draftRevision: undefined,
  };
  s.consents.push(historical);
  const before = structuredClone(s);
  s = await applyCommand(
    s,
    catalogAdmin,
    install(["toxin", "repot", "membership"]),
  );
  expect(s.consents).toHaveLength(5);
  expect(s.consents.find((t) => t.id === before.consents[0].id)).toEqual(
    before.consents[0],
  );
  expect(s.consents.find((t) => t.id === historical.id)).toEqual(historical);
  const pubCopy = s.consents.find(
    (t) => t.sourceTemplateId === before.consents[0].id,
  )!;
  expect(pubCopy.status).toBe("draft");
  expect(pubCopy.version).toBe(2);
  expect(pubCopy.body).toContain("병원 수정 0");
  expect(pubCopy.productIds).toEqual(["product-0"]);
  expect(pubCopy.reviewedAt).toBeUndefined();
  expect(pubCopy.draftRevision).toBe(CONSENT_DRAFT_REVISION);
  expect(consentPublishIssues(pubCopy).length).toBeGreaterThan(0);
  const draft = s.consents.find((t) => t.id === before.consents[1].id)!;
  expect(draft.rev).toBe(before.consents[1].rev + 1);
  expect(draft.version).toBe(1);
  expect(draft.body).toContain("병원 수정 1");
  expect(draft.checks[0]).toBe("병원 확인란 1");
  expect(s.signatures).toEqual(before.signatures);
  const again = await applyCommand(
    s,
    catalogAdmin,
    install(["toxin", "repot", "membership"]),
  );
  expect(again.consents).toEqual(s.consents);
});
