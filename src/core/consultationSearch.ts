import type { State } from "./model";
import { ledgerAvailable } from "./domain";
export type HistoryFilter =
  | "all"
  | "pending"
  | "held"
  | "success"
  | "failed"
  | "today"
  | "unpaid"
  | "cancelled";
export type ConsultationSearch = {
  query: string;
  owner: string;
  category: string;
  kind: string;
  from: string;
  to: string;
};
export const emptyConsultationSearch: ConsultationSearch = {
  query: "",
  owner: "",
  category: "",
  kind: "",
  from: "",
  to: "",
};
const dayFormat = new Intl.DateTimeFormat("sv-SE", { timeZone: "Asia/Seoul" });
export function consultationDay(value: string) {
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return value;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "" : dayFormat.format(date);
}
export function searchConsultations(
  state: State,
  filter: HistoryFilter,
  fields: ConsultationSearch,
  financial: boolean,
  today = dayFormat.format(new Date()),
) {
  const patients = new Map(state.patients.map((p) => [p.id, p]));
  const terms = fields.query
    .toLocaleLowerCase()
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  return state.consultations
    .filter((c) => {
      if (c.historyDeletedAt) return false;
      const p = patients.get(c.patientId);
      if (
        filter === "cancelled" ? !c.cancelled : filter !== "all" && c.cancelled
      )
        return false;
      if (filter === "pending" && (!p?.registrationPending || p.mergedInto))
        return false;
      if (
        (filter === "held" && c.status !== "H") ||
        (filter === "success" && c.status !== "P") ||
        (filter === "failed" && c.status !== "F")
      )
        return false;
      if (filter === "today" && consultationDay(c.appointment) !== today)
        return false;
      if (
        filter === "unpaid" &&
        (!financial ||
          c.status !== "P" ||
          ledgerAvailable(state, c.id, "receipt") <= 0)
      )
        return false;
      if (
        (fields.owner && c.ownerId !== fields.owner) ||
        (fields.category && c.category !== fields.category) ||
        (fields.kind && (c.kind || "initial") !== fields.kind)
      )
        return false;
      const day = consultationDay(c.createdAt);
      if ((fields.from && day < fields.from) || (fields.to && day > fields.to))
        return false;
      const text = [
        c.patient.name,
        c.patient.phone,
        c.patient.dob,
        p?.name,
        p?.phone,
        p?.number,
        c.patientId,
        c.id,
      ]
        .filter(Boolean)
        .join(" ")
        .toLocaleLowerCase();
      const phones = [c.patient.phone, p?.phone || ""].map((v) =>
        v.replace(/\D/g, ""),
      );
      return terms.every(
        (t) =>
          text.includes(t) ||
          (/^[\d()+-]+$/.test(t) &&
            /\d/.test(t) &&
            phones.some((phone) => phone.includes(t.replace(/\D/g, "")))),
      );
    })
    .sort(
      (a, b) =>
        b.createdAt.localeCompare(a.createdAt) || b.id.localeCompare(a.id),
    );
}
