import { age, type Patient, type Consultation } from "./model";
export const patientCohorts = [
  { id: "codimate", bit: 1, label: "코디메이트상담" },
  { id: "vegas", bit: 2, label: "베가스이관" },
  { id: "intakeBeauty", bit: 4, label: "초진설문지(미용)" },
  { id: "intakeMedical", bit: 8, label: "초진설문지(진료)" },
] as const;
export type PatientCohort = (typeof patientCohorts)[number]["id"];
export const defaultPatientCohorts: PatientCohort[] = [
  "codimate",
  "vegas",
  "intakeBeauty",
];
export const cohortSelectionMask = (
  ids: readonly string[] = defaultPatientCohorts,
) => patientCohorts.reduce((n, c) => n | (ids.includes(c.id) ? c.bit : 0), 0);
export function patientCohortMask(
  p: Patient,
  cs: Pick<Consultation, "cancelled" | "kind">[],
) {
  return (
    (p.analyticsCohorts || 0) |
    ((cs.some((c) => !c.cancelled && c.kind !== "interim") ? 1 : 0) |
      (p.external?.source === "vegas" || p.id.startsWith("vegas-") ? 2 : 0) |
      (p.intakeKind === "beauty" ? 4 : p.intakeKind === "medical" ? 8 : 0))
  );
}
export function ageBand(dob: string, asOf: Date) {
  const n = age(dob, asOf);
  return !dob || !Number.isFinite(n) || n < 0
    ? "미입력"
    : n < 20
      ? "20세 미만"
      : n >= 70
        ? "70세 이상"
        : Math.floor(n / 10) * 10 + "대";
}
export const sexLabel = (sex: string) =>
  sex === "F" ? "여성" : sex === "M" ? "남성" : "미입력";
