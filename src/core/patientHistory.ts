import type { Patient } from "./model";

// Existing native patients enriched with reference data keep their original accounting.
// Creation timestamps remain audit timestamps, including the agreed VIP import start date.
export function importedHistory(p?: Patient) {
  return p?.id.startsWith("vegas-") ? p.external || p.importSummary : undefined;
}
export function importedRevenue(p?: Patient) {
  return Math.max(0, importedHistory(p)?.totalPaid || 0);
}
export function patientRegisteredAt(p: Patient) {
  return importedHistory(p)?.firstVisit || p.createdAt;
}
export function patientLastConsultedAt(
  p: Patient,
  consultations: { createdAt: string; cancelled?: boolean }[],
) {
  return consultations.reduce(
    (last, c) => (!c.cancelled && c.createdAt > last ? c.createdAt : last),
    importedHistory(p)?.lastVisit || "",
  );
}
