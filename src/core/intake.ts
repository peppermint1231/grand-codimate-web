import type { Patient } from "./model";

export type IntakeFields = Pick<
  Patient,
  | "name"
  | "sex"
  | "dob"
  | "phone"
  | "address"
  | "acquisitionSource"
  | "intakeKind"
>;
export interface IntakeSearchRow {
  id: string;
  name: string;
  phone: string;
  createdAt: string;
}
export interface IntakeSearchResult {
  rows: IntakeSearchRow[];
  total: number;
  page: number;
  pageSize: number;
}
export interface IntakeSelection {
  patientId: string;
  alreadyImported: boolean;
  fields: IntakeFields;
  matches: Pick<Patient, "id" | "name" | "dob" | "phone" | "archived">[];
}
export interface IntakeStatus {
  configured: boolean;
  canConfigure: boolean;
  folder: string;
}

const text = (v: unknown) => (typeof v === "string" ? v.trim() : "");
const digits = (v: unknown) => text(v).replace(/\D/g, "");
function validDate(value: string) {
  return (
    /^\d{4}-\d{2}-\d{2}$/.test(value) &&
    !Number.isNaN(Date.parse(value)) &&
    new Date(value).toISOString().slice(0, 10) === value &&
    value <= new Date().toISOString().slice(0, 10)
  );
}

// Only the fields required for registration leave the server. In particular,
// never forward resident numbers, signatures, medical history or consent text.
export function intakeFields(record: Record<string, unknown>): IntakeFields {
  const registration = digits(
    record.patientType === "foreigner" ? record.foreignRegNo : record.rrn,
  );
  const code = registration[6];
  let dob = text(record.dob);
  if (!validDate(dob)) {
    const century = "1256".includes(code || "?")
      ? "19"
      : "3478".includes(code || "?")
        ? "20"
        : "90".includes(code || "?")
          ? "18"
          : "";
    const candidate =
      century && registration.length >= 7
        ? `${century}${registration.slice(0, 2)}-${registration.slice(2, 4)}-${registration.slice(4, 6)}`
        : "";
    dob = validDate(candidate) ? candidate : "";
  }
  const gender = text(record.gender).toUpperCase();
  const sex =
    gender === "M" || gender === "F"
      ? gender
      : "13579".includes(code || "?")
        ? "M"
        : "02468".includes(code || "?")
          ? "F"
          : "U";
  const routes = Array.isArray(record.routes)
    ? record.routes.filter((r): r is string => typeof r === "string")
    : [];
  return {
    ...(text(record.consultType).includes("미용")
      ? { intakeKind: "beauty" as const }
      : text(record.consultType) === "피부질환 진료만 희망"
        ? { intakeKind: "medical" as const }
        : {}),
    name: text(record.name).slice(0, 80),
    sex,
    dob,
    phone: digits(record.phone).slice(0, 11),
    address: text(record.address).slice(0, 160),
    acquisitionSource: routes.join(", ").slice(0, 80),
  };
}
