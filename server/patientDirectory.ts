import type { Patient, State } from "../src/core/model";
import { patientIndex, type PatientSearchRow } from "../src/core/patientSearch";
import { gradeFor, metrics } from "../src/core/domain";
import { open } from "./crypto";
/** Imported patients stay encrypted on disk and out of the interactive workspace snapshot. */
export class PatientDirectory {
  private patients?: Map<string, Patient>;
  private loading?: Promise<Map<string, Patient>>;
  constructor(
    private sql: SqlStorage,
    private key: string,
  ) {}
  async all() {
    if (this.patients) return this.patients;
    return (this.loading ||= this.load().finally(() => {
      this.loading = undefined;
    }));
  }
  private async load() {
    const patients = new Map<string, Patient>();
    let cursor = 0;
    for (;;) {
      const rows = this.sql
        .exec<{ cursor: number; value: string }>(
          "SELECT rowid AS cursor,value FROM entities WHERE section='patients' AND id LIKE 'vegas-%' AND rowid>? ORDER BY rowid LIMIT 100",
          cursor,
        )
        .toArray();
      if (!rows.length) break;
      // Bounded batches avoid retaining all encrypted rows alongside cleartext records.
      for (const p of await Promise.all(
        rows.map((row) => open<Patient>(row.value, this.key)),
      ))
        patients.set(p.id, this.compact(p));
      cursor = rows.at(-1)!.cursor;
    }
    return (this.patients = patients);
  }
  private compact(patient: Patient): Patient {
    // Reference visit/payment details are fetched only when opening the patient.
    const { external, ...entry } = patient;
    return entry;
  }
  update(patient: Patient) {
    if (patient.id.startsWith("vegas-"))
      this.patients?.set(patient.id, this.compact(patient));
  }
  clear() {
    this.patients = undefined;
  }
  async index(state: State): Promise<PatientSearchRow[]> {
    const native = patientIndex(state),
      ids = new Set(state.patients.map((p) => p.id));
    const zero = metrics(state, "__import_without_accounting__"),
      empty: PatientSearchRow["cs"] = [];
    const gradeState = {
      ...state,
      ledger: [],
      consultations: [],
      vipAccounts: [],
    };
    const rows = native.concat(
      [...(await this.all())].flatMap(([id, p]) =>
        ids.has(id) || p.mergedInto
          ? []
          : [
              {
                p,
                m: zero,
                g: gradeFor(gradeState, p),
                cs: empty,
                duplicates: 0,
              },
            ],
      ),
    );
    const birth = new Map<string, number>(),
      phones = new Map<string, number>();
    for (const { p } of rows) {
      const key = p.dob
        ? p.name.toLowerCase().replace(/\s/g, "") + "|" + p.dob
        : "";
      if (key) birth.set(key, (birth.get(key) || 0) + 1);
      if (p.phone) phones.set(p.phone, (phones.get(p.phone) || 0) + 1);
    }
    for (const row of rows) {
      const p = row.p;
      row.duplicates = Math.max(
        row.duplicates,
        (p.dob
          ? birth.get(p.name.toLowerCase().replace(/\s/g, "") + "|" + p.dob) ||
            1
          : 1) - 1,
        (phones.get(p.phone) || 1) - 1,
      );
    }
    return rows;
  }
}
