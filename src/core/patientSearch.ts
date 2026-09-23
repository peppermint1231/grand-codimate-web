import { duplicates, gradeFor, metrics } from "./domain";
import {
  emptyState,
  type State,
  type Patient,
  type Consultation,
} from "./model";
export type PatientSearchRow = {
  p: Patient;
  m: ReturnType<typeof metrics>;
  g: ReturnType<typeof gradeFor>;
  cs: Pick<
    Consultation,
    | "id"
    | "createdAt"
    | "ownerId"
    | "status"
    | "cancelled"
    | "category"
    | "kind"
    | "packageProgress"
  >[];
  duplicates: number;
};
export type PatientSearchFilter = {
  search: string;
  grade: string;
  sort: string;
  unpaid: boolean;
  owner: string;
  consultStatus: string;
  since: string;
  archived: boolean;
  duplicateOnly: boolean;
  page: number;
};
export function patientIndex(s: State): PatientSearchRow[] {
  const consultations = new Map<string, State["consultations"]>(),
    ledger = new Map<string, State["ledger"]>();
  for (const c of s.consultations) {
    if (!consultations.has(c.patientId)) consultations.set(c.patientId, []);
    consultations.get(c.patientId)!.push(c);
  }
  for (const l of s.ledger) {
    if (!ledger.has(l.patientId)) ledger.set(l.patientId, []);
    ledger.get(l.patientId)!.push(l);
  }
  const nameBirth = new Map<string, Set<string>>(),
    phones = new Map<string, Set<string>>();
  for (const p of s.patients.filter((p) => !p.mergedInto)) {
    for (const [map, key] of [
      [nameBirth, p.name.toLowerCase().replace(/\s/g, "") + "|" + p.dob],
      [phones, p.phone.replace(/\D/g, "")],
    ] as const) {
      if (!key) continue;
      if (!map.has(key)) map.set(key, new Set());
      map.get(key)!.add(p.id);
    }
  }
  return s.patients
    .filter((p) => !p.mergedInto)
    .map((p) => {
      const cs = (consultations.get(p.id) || [])
          .slice()
          .sort((a, b) => a.createdAt.localeCompare(b.createdAt)),
        mini = {
          ...emptyState(),
          patients: [p],
          consultations: cs,
          ledger: ledger.get(p.id) || [],
          policies: s.policies,
        };
      const dupe = new Set([
        ...(nameBirth.get(
          p.name.toLowerCase().replace(/\s/g, "") + "|" + p.dob,
        ) || []),
        ...(phones.get(p.phone.replace(/\D/g, "")) || []),
      ]);
      dupe.delete(p.id);
      return {
        p,
        m: metrics(mini, p.id),
        g: gradeFor(mini, p),
        cs: cs.map(
          ({
            id,
            createdAt,
            ownerId,
            status,
            cancelled,
            category,
            kind,
            packageProgress,
          }) => ({
            id,
            createdAt,
            ownerId,
            status,
            cancelled,
            category,
            kind,
            packageProgress,
          }),
        ),
        duplicates: dupe.size,
      };
    });
}
export function searchPatients(
  index: PatientSearchRow[],
  f: PatientSearchFilter,
  financial = true,
) {
  const q = f.search.trim().toLocaleLowerCase(),
    phone = q.replace(/[\s-]/g, "");
  const rows = index
    .filter(
      ({ p, m, g, cs, duplicates }) =>
        !!p.archived === f.archived &&
        (!f.duplicateOnly || duplicates > 0) &&
        (!q ||
          [p.name, p.phone, p.dob, p.id, p.number || ""].some((v) =>
            v.toLocaleLowerCase().includes(q),
          ) ||
          (!!phone && p.phone.replace(/[\s-]/g, "").includes(phone))) &&
        (!financial || !f.grade || g.id === f.grade) &&
        (!f.owner ||
          p.ownerId === f.owner ||
          cs.some((c) => c.ownerId === f.owner)) &&
        (!f.consultStatus ||
          cs.some((c) => c.status === f.consultStatus && !c.cancelled)) &&
        (!f.since || cs.some((c) => c.createdAt.slice(0, 10) >= f.since)) &&
        (!f.unpaid || (financial && m.outstanding > 0)),
    )
    .sort((a, b) =>
      f.sort === "revenue" && financial
        ? b.m.revenue - a.m.revenue || a.p.id.localeCompare(b.p.id)
        : f.sort === "name"
          ? a.p.name.localeCompare(b.p.name) || a.p.id.localeCompare(b.p.id)
          : (b.cs.at(-1)?.createdAt || b.p.createdAt).localeCompare(
              a.cs.at(-1)?.createdAt || a.p.createdAt,
            ) || a.p.id.localeCompare(b.p.id),
    );
  const page = Math.min(
    Math.max(0, Math.floor(f.page) || 0),
    Math.max(0, Math.ceil(rows.length / 30) - 1),
  );
  return {
    page,
    total: rows.length,
    pageSize: 30,
    rows: rows.slice(page * 30, page * 30 + 30).map((r) =>
      financial
        ? r
        : {
            ...r,
            m: {
              ...r.m,
              contract: 0,
              revenue: 0,
              outstanding: 0,
              receipts: 0,
              refunds: 0,
            },
            g: { id: "", name: "금액 열람 필요", color: "#718579" },
          },
    ),
  };
}
