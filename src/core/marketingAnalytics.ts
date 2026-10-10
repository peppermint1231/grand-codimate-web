import { acquisitionSourceLabel } from "./acquisitionSource";
import { activeLedger } from "./domain";
import {
  ageBand,
  cohortSelectionMask,
  patientCohortMask,
  sexLabel,
  type PatientCohort,
} from "./patientCohorts";
import { patientIdentityKey } from "./patientIdentity";
import { catalogBook, type State } from "./model";
import { productFolderPaths } from "./catalogFolders";
import type { AnalyticsFilter, Bucket } from "./analytics";
export type PatientAudience = {
  total: number;
  converted: number;
  revenue: number | null;
  averageRevenue: number | null;
  groups: Bucket[];
  ages: Bucket[];
  sexes: Bucket[];
  regions: Bucket[];
  sources: Bucket[];
  visits: Bucket[];
  segments: Bucket[];
  spend: Bucket[];
  grades: Bucket[];
};
export type MarketingRow = {
  age: string;
  sex: string;
  dimension: "category" | "source";
  name: string;
  patients: number;
  consultations: number;
  success: number;
  failed: number;
  conversion: number;
  contract: number;
  net: number;
  averageNet: number;
};
export function buildMarketing(
  s: State,
  f: AnalyticsFilter,
  financial = true,
): MarketingRow[] {
  const identities = new Map(
    s.patients.map((p) => [p.id, patientIdentityKey(p) || "id:" + p.id]),
  );
  const people = new Map<
    string,
    { p: State["patients"][number]; mask: number }
  >();
  const byPatient = new Map<string, State["consultations"]>();
  for (const c of s.consultations) {
    if (!byPatient.has(c.patientId)) byPatient.set(c.patientId, []);
    byPatient.get(c.patientId)!.push(c);
  }
  for (const p of s.patients) {
    if (p.archived || p.mergedInto) continue;
    const key = identities.get(p.id)!;
    const existing = people.get(key);
    people.set(key, {
      p: existing?.p || p,
      mask:
        (existing?.mask || 0) | patientCohortMask(p, byPatient.get(p.id) || []),
    });
  }
  const selected = cohortSelectionMask(f.cohorts),
    asOf = new Date(f.to + "T12:00:00+09:00");
  const rows = new Map<string, MarketingRow & { ids: Set<string> }>();
  const cash = new Map<string, number>();
  for (const l of activeLedger(s)) {
    if (l.tender === "points" || l.date > f.to) continue;
    cash.set(
      l.consultationId,
      (cash.get(l.consultationId) || 0) +
        (l.kind === "receipt" ? l.amount : -l.amount),
    );
  }
  const date = (v: string) =>
    new Intl.DateTimeFormat("sv-SE", { timeZone: "Asia/Seoul" }).format(
      new Date(v),
    );
  for (const c of s.consultations) {
    const identity = identities.get(c.patientId),
      person = identity && people.get(identity);
    if (
      !identity ||
      !person ||
      !(person.mask & selected) ||
      c.kind === "interim" ||
      c.cancelled ||
      (f.ownerId && c.ownerId !== f.ownerId) ||
      date(c.createdAt) < f.from ||
      date(c.createdAt) > f.to
    )
      continue;
    const lines = c.quote.lines.filter(
      (l) => !f.book || (l.book || c.category) === f.book,
    );
    if (f.book && !lines.length) continue;
    const categories = new Set(
      lines.map((l) => {
        if (l.categorySnapshot) return l.categorySnapshot;
        const book = l.book || c.category;
        const cat = s.catalogs.find(
          (k) =>
            catalogBook(k) === book &&
            k.version ===
              (l.catalogVersion ||
                c.catalogVersions?.[book] ||
                c.catalogVersion),
        );
        const product = cat?.products.find((p) => p.id === l.productId);
        return cat && product
          ? productFolderPaths(cat, product)[0]?.[0]?.name || product.category
          : "분류 미지정";
      }),
    );
    if (!categories.size) categories.add("상품 미선택");
    const a = ageBand(person.p.dob, asOf),
      sex = sexLabel(person.p.sex);
    for (const [dimension, names] of [
      ["category", [...categories]],
      ["source", [acquisitionSourceLabel(person.p.acquisitionSource)]],
    ] as const) {
      for (const name of names) {
        const key = JSON.stringify([a, sex, dimension, name]);
        let r = rows.get(key);
        if (!r) {
          r = {
            age: a,
            sex,
            dimension,
            name,
            patients: 0,
            consultations: 0,
            success: 0,
            failed: 0,
            conversion: 0,
            contract: 0,
            net: 0,
            averageNet: 0,
            ids: new Set(),
          };
          rows.set(key, r);
        }
        r.ids.add(identity);
        r.consultations++;
        if (c.status === "P") r.success++;
        if (c.status === "F") r.failed++;
        if (financial) {
          // Category amounts would require allocation; expose money only for acquisition channels.
          if (dimension === "source") {
            if (c.status === "P") r.contract += c.quote.total;
            r.net += cash.get(c.id) || 0;
          }
        }
      }
    }
  }
  return [...rows.values()]
    .map(({ ids, ...r }) => ({
      ...r,
      patients: ids.size,
      conversion:
        r.success + r.failed ? (100 * r.success) / (r.success + r.failed) : 0,
      averageNet: ids.size ? Math.round(r.net / ids.size) : 0,
    }))
    .sort(
      (a, b) => b.patients - a.patients || b.consultations - a.consultations,
    );
}
