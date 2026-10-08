import {
  patientDuplicateCounts,
  patientIdentityKey,
} from "../src/core/patientIdentity";
import { importedRevenue } from "../src/core/patientHistory";
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
    let cursor = "vegas-";
    for (;;) {
      const rows = this.sql
        .exec<{ id: string; value: string }>(
          "SELECT id,value FROM entities WHERE section='patients' AND id>? AND id<'vegas.' ORDER BY id LIMIT 100",
          cursor,
        )
        .toArray();
      if (!rows.length) break;
      // Bounded batches avoid retaining all encrypted rows alongside cleartext records.
      for (const p of await Promise.all(
        rows.map((row) => open<Patient>(row.value, this.key)),
      ))
        patients.set(p.id, this.compact(p));
      cursor = rows.at(-1)!.id;
    }
    return (this.patients = patients);
  }
  private compact(patient: Patient): Patient {
    // Reference visit/payment details are fetched only when opening the patient.
    const { external, ...entry } = patient;
    return {
      ...entry,
      ...(external
        ? {
            importSummary: {
              totalPaid: external.totalPaid,
              firstVisit: external.firstVisit,
              lastVisit: external.lastVisit,
            },
          }
        : {}),
    };
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
                m: {
                  ...zero,
                  contract: importedRevenue(p),
                  revenue: importedRevenue(p),
                },
                g: gradeFor({ ...gradeState, patients: [p] }, p),
                cs: empty,
                duplicates: 0,
              },
            ],
      ),
    );
    const counts = patientDuplicateCounts(rows.map((row) => row.p));
    for (const row of rows)
      row.duplicates = row.p.archived
        ? 0
        : Math.max(0, (counts.get(patientIdentityKey(row.p)) || 1) - 1);
    return rows;
  }
}
