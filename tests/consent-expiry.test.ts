import { expect, it } from "vitest";
import {
  correctPackageExpiry,
  packageExpiryClause,
  patientConsentBody,
} from "../src/core/consentPatientCopy";
import { treatmentConsentDrafts } from "../src/core/treatmentConsents";
const legacy =
  "패키지로 계약한 경우 기존 기본 사용기간은 결제일부터 1년이며, 기간 경과 후 잔여 횟수 이용이 제한될 수 있습니다. 개별 계약의 기간·연장·잔여분 처리와 중도 해지 시 정산 기준은 계약서에서 확인합니다. 사용기간 경과가 모든 잔액의 자동 소멸을 뜻하지는 않습니다.";
it.each([
  legacy,
  legacy.replace("기존 ", ""),
  legacy.replaceAll(" ", "\u00a0"),
  legacy.replaceAll(". ", ".\n"),
  packageExpiryClause.replace("기존 ", ""),
])("corrects the stored clause variant %# and nothing around it", (text) => {
  const body = "병원 맞춤 문구 $&\n12) " + text + "\n13) 별도 조건 유지";
  const expected =
    "병원 맞춤 문구 $&\n12) " + packageExpiryClause + "\n13) 별도 조건 유지";
  expect(correctPackageExpiry(body)).toBe(expected);
  expect(patientConsentBody(body)).toBe(expected);
  expect(correctPackageExpiry(expected)).toBe(expected);
});
it("preserves independently changed durations and terms", () => {
  for (const body of [
    legacy.replace("1년", "6개월"),
    legacy.replace("이용이 제한될 수 있습니다", "계약별로 연장합니다"),
  ])
    expect(correctPackageExpiry(body)).toBe(body);
});
it("uses the exact requested text in every relevant fresh draft", () => {
  const applicable = treatmentConsentDrafts.filter((t) =>
    t.body.includes("패키지로 계약한 경우"),
  );
  expect(applicable).toHaveLength(19);
  for (const t of applicable) {
    expect(t.body).toContain(packageExpiryClause);
    expect(t.body).not.toContain("자동 소멸을 뜻하지는 않습니다");
  }
});
