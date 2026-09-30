import { expect, it } from "vitest";
import {
  CONFIRMED_CLINIC_CONTACT,
  fillConfirmedClinicContact,
} from "../src/core/clinicContact";
import { treatmentConsentDrafts } from "../src/core/treatmentConsents";
it("replaces only the authorized contact marker and preserves adjacent hospital edits", () => {
  const original =
    "병원 수정 앞\n[병원 확인: 연락처 및 진료시간 외 대응 방법]\n병원 수정 뒤\n[병원 확인: 계약 접수 방법]";
  const result = fillConfirmedClinicContact(original);
  expect(result).toBe(
    "병원 수정 앞\n" +
      CONFIRMED_CLINIC_CONTACT +
      "\n병원 수정 뒤\n[병원 확인: 계약 접수 방법]",
  );
  expect(fillConfirmedClinicContact(result)).toBe(result);
  expect(fillConfirmedClinicContact("병원에서 직접 작성한 연락처")).toBe(
    "병원에서 직접 작성한 연락처",
  );
});
it("new clinical drafts include confirmed hours while other medical reviews remain unresolved", () => {
  const clinical = treatmentConsentDrafts.filter(
    (t) => !["doctor-plan", "membership"].includes(t.key),
  );
  expect(clinical).toHaveLength(21);
  for (const t of clinical) {
    expect(t.body).toContain(CONFIRMED_CLINIC_CONTACT);
    expect(t.body).not.toContain(
      "[병원 확인: 연락처 및 진료시간 외 대응 방법]",
    );
    expect(t.body).toContain("[병원 확인:");
  }
});
