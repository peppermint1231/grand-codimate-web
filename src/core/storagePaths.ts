import type { Patient } from "./model";
export const safeName = (name: string) =>
  name
    .replace(/[\\/:*?"<>|#%\u0000-\u001f]/g, "_")
    .replace(/[. ]+$/g, "")
    .slice(0, 120) || "환자";
export const patientFolder = (
  patient: Pick<Patient, "id" | "number" | "name" | "sex" | "storageName">,
  category: "미용" | "보험",
) =>
  `상담/${category}/${patient.storageName || safeName(`${patient.number || patient.id}${patient.sex}${patient.name}`)}`;
export function photoFileName(
  patient: Pick<Patient, "name" | "sex">,
  capturedAt: string,
  mime: string,
) {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Seoul",
    year: "2-digit",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  }).formatToParts(new Date(capturedAt));
  const p = Object.fromEntries(parts.map((x) => [x.type, x.value]));
  return `${p.year}${p.month}${p.day}_${p.hour}${p.minute}_${p.second}_${patient.sex}_${safeName(patient.name)}.${mime === "image/png" ? "png" : "jpg"}`;
}
