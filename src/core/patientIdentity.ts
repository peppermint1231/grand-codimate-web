import type { Patient } from "./model";

export function patientIdentityKey(p: Pick<Patient, "name" | "phone">) {
  const name = p.name.normalize("NFKC").replace(/\s/g, "").toLowerCase();
  const phone = p.phone.normalize("NFKC").replace(/\D/g, "");
  return name && phone ? name + "|" + phone : "";
}

export function patientDuplicateCounts(patients: Patient[]) {
  const counts = new Map<string, number>();
  for (const p of patients) {
    const key = patientIdentityKey(p);
    if (key && !p.archived && !p.mergedInto)
      counts.set(key, (counts.get(key) || 0) + 1);
  }
  return counts;
}
