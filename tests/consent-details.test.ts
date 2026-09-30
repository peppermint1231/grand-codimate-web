import { expect, it } from "vitest";
import {
  hospitalDetailedClauses,
  hospitalCommonClauses,
  detailedClausesFor,
  supplementDetailedConsentBody,
  DETAIL_HEADING,
} from "../src/core/consentDetailedPrecautions";
import { supplementConsentBody } from "../src/core/consentPrecautions";
import { treatmentConsentDrafts } from "../src/core/treatmentConsents";
import { applyCommand } from "../src/core/domain";
import { emptyState, type Command } from "../src/core/model";
import { catalogAdmin } from "./fixtures/catalogs";
it("covers each of the independently inventoried 87 source items and common clauses", () => {
  const counts: Record<string, number> = {
    "hair-removal": 7,
    "doctor-plan": 4,
    membership: 5,
    repot: 13,
    juvegen: 8,
    isotretinoin: 8,
    "lesion-removal": 8,
    general: 9,
    "threads-filler-eye": 9,
    "toxin-fat": 10,
    scalp: 6,
  };
  expect(hospitalDetailedClauses.map((c) => c.id).sort()).toEqual(
    Object.entries(counts)
      .flatMap(([g, n]) =>
        Array.from(
          { length: n },
          (_, i) => `${g}-${String(i + 1).padStart(2, "0")}`,
        ),
      )
      .sort(),
  );
  expect(hospitalCommonClauses).toHaveLength(5);
  for (const c of [...hospitalDetailedClauses, ...hospitalCommonClauses]) {
    expect(c.targets?.length, c.id).toBeGreaterThan(0);
    for (const key of c.targets || []) {
      const t = treatmentConsentDrafts.find((t) => t.key === key);
      expect(t, c.id + " target " + key).toBeDefined();
      expect(t?.body, c.id).toContain(c.text);
    }
  }
});
it("retains detailed durations and reasons in actual bodies, including all compound instructions", () => {
  const checks: Record<string, string[]> = {
    juvegen: [
      "1~3일",
      "당일 물 세안",
      "메이크업",
      "1~2주",
      "2~4주",
      "1개월",
      "4~12주",
      "비용은 별도",
    ],
    toxin: [
      "3~4시간",
      "약 1주",
      "3~14일",
      "2~4주",
      "3~4개월",
      "4~6개월",
      "3~7일",
      "볼패임·비대칭",
    ],
    repot: [
      "수면",
      "땀",
      "조금 넓게",
      "1~3주",
      "거품이 많이 나는",
      "오일 클렌징",
      "폼 클렌징",
      "알갱이 스크럽",
      "전동 브러시",
      "Dermal Melanophage",
      "1~3개월",
      "3~4개월",
      "1년 이상",
    ],
    "lesion-removal": ["3~7일", "1~2주", "3~6개월", "목·몸"],
    scalp: ["당일", "3~7일", "2~3일", "약 1주"],
    "ha-filler": [
      "24시간",
      "약 1개월",
      "1~2주",
      "2~4주",
      "2~3주",
      "약 하루",
      "4~12주",
    ],
    "hair-removal": ["2~4주", "10~20회", "3~7일", "샤워와 면도"],
    membership: ["1년", "보험 진료는 제외", "혜택 금액"],
  };
  for (const [key, terms] of Object.entries(checks)) {
    const body = treatmentConsentDrafts.find((t) => t.key === key)!.body;
    for (const term of terms) expect(body, key + ": " + term).toContain(term);
  }
  expect(
    detailedClausesFor("fat-injection").some((c) => c.id === "toxin-fat-06"),
  ).toBe(false);
  expect(detailedClausesFor("hifu").some((c) => c.id === "general-07")).toBe(
    false,
  );
  expect(detailedClausesFor("iv-injection")).toEqual([]);
});
it("replaces only the exact generated summary and preserves clinic edits, literals and idempotence", () => {
  const base = "병원 제품·용량 $&\n\n6. 환자의 선택\n직접 작성한 내용";
  const old = supplementConsentBody("toxin", base);
  const updated = supplementDetailedConsentBody("toxin", old);
  expect(updated).toContain("3~4시간");
  expect(updated).not.toContain("5-1. 생활 주의사항과 회복 경과 보완");
  expect(updated.startsWith("병원 제품·용량 $&")).toBe(true);
  expect(updated.endsWith("직접 작성한 내용")).toBe(true);
  expect(supplementDetailedConsentBody("toxin", updated)).toBe(updated);
  const edited = old.replace(
    "초기 회복 중에는",
    "병원에서 수정한 조건: 초기 회복 중에는",
  );
  const merged = supplementDetailedConsentBody("toxin", edited);
  expect(merged).toContain(edited.split("\n\n6. 환자의 선택")[0]);
  expect(merged).toContain(DETAIL_HEADING);
});
it("updates existing .3 revision drafts without creating another eight copies or changing signed originals", async () => {
  const command: Command = {
    id: crypto.randomUUID(),
    type: "consent.installDrafts",
    payload: { keys: ["toxin", "repot"] },
  };
  let s = await applyCommand(emptyState(), catalogAdmin, command);
  s.consents = s.consents.map((t) => ({
    ...t,
    draftRevision: "2026-09-30.3",
    body: supplementConsentBody(t.draftKey!, "병원 직접 작성"),
    sourceTemplateId: t.draftKey === "toxin" ? "published-original" : undefined,
  }));
  s.consents.push({
    ...s.consents[0],
    id: "published-original",
    version: 0,
    status: "published",
    body: "서명에 사용한 원본",
    draftRevision: "2026-09-30.2",
    sourceTemplateId: undefined,
  });
  const original = structuredClone(s.consents[2]);
  const updated = await applyCommand(s, catalogAdmin, {
    ...command,
    id: crypto.randomUUID(),
  });
  expect(updated.consents).toHaveLength(3);
  expect(updated.consents[2]).toEqual(original);
  expect(updated.consents[0].sourceTemplateId).toBe(original.id);
  expect(updated.consents[0].body).toContain("병원 직접 작성");
  expect(updated.consents[0].body).toContain("3~4시간");
  expect(updated.signatures).toEqual(s.signatures);
});
