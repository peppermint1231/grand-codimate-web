import type { Patient } from "./model";
export const DEFAULT_STORAGE_ROOT = "상담";
export function validStorageRoot(value: unknown): value is string {
  return (
    typeof value === "string" &&
    value.length > 0 &&
    value.length <= 80 &&
    value === value.trim() &&
    !/[\\/:*?"<>|#%\u0000-\u001f]/.test(value) &&
    !value.endsWith(".") &&
    !value.startsWith("~$") &&
    !/^(\.|\.\.|\.lock|desktop\.ini|_vti_.*|con|prn|aux|nul|com[0-9]|lpt[0-9])(?:\..*)?$/i.test(
      value,
    )
  );
}
// All application files live directly below one configurable root folder.
// Historical records may contain an earlier root name; item IDs stay stable.
export const relocateStoragePath = (path: string, root: string) =>
  root + path.slice(path.indexOf("/"));
export const safeName = (name: string) =>
  name
    .replace(/[\\/:*?"<>|#%\u0000-\u001f]/g, "_")
    .replace(/[. ]+$/g, "")
    .slice(0, 120) || "환자";
export const patientFolder = (
  patient: Pick<Patient, "id" | "number" | "name" | "sex" | "storageName">,
  category: "미용" | "보험",
  root = DEFAULT_STORAGE_ROOT,
) =>
  `${root}/${category}/${patient.storageName || safeName(`${patient.number || patient.id}${patient.sex}${patient.name}`)}`;
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
