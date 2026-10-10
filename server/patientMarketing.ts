import {
  acquisitionSourceLabel,
  acquisitionSourceSummary,
} from "../src/core/acquisitionSource";
import {
  cohortSelectionMask,
  patientCohorts,
  patientCohortMask,
  type PatientCohort,
  sexLabel,
} from "../src/core/patientCohorts";
import {
  patientLastConsultedAt,
  patientRegisteredAt,
  importedRevenue,
} from "../src/core/patientHistory";
import { regionLabel } from "../src/core/addressRegion";
import { groupSmallPatientRegions } from "./patientRegionGroups";
import type { PatientSearchRow } from "../src/core/patientSearch";
export type MarketingSummary = {
  mask: number;
  birthYear: string;
  sex: string;
  region: string;
  source: string;
  first: string;
  last: string;
  revenue: number;
  baseline: number;
  visits: number;
  grade: string;
};
export function marketingSummary(row: PatientSearchRow): MarketingSummary {
  const p = row.p,
    history = p.external || p.importSummary;
  return {
    mask: patientCohortMask(p, row.cs),
    birthYear: p.dob?.slice(0, 4) || "미입력",
    sex: sexLabel(p.sex),
    region: regionLabel(p),
    source: p.acquisitionSource?.trim() || "미입력",
    first: (p.id.startsWith("vegas-")
      ? history?.firstVisit || ""
      : patientRegisteredAt(p)
    ).slice(0, 10),
    last: patientLastConsultedAt(p, row.cs).slice(0, 10),
    revenue: row.m.revenue,
    baseline: importedRevenue(p),
    visits: Math.max(
      p.external?.visitCount || 0,
      row.cs.filter((c) => !c.cancelled && c.kind !== "interim").length,
    ),
    grade: row.g.name,
  };
}
const schema = `CREATE TABLE IF NOT EXISTS patient_intake_fingerprints(id TEXT PRIMARY KEY,fingerprint TEXT NOT NULL);CREATE TABLE IF NOT EXISTS patient_intake_stats(id TEXT PRIMARY KEY,seen TEXT NOT NULL,kind INTEGER NOT NULL);CREATE INDEX IF NOT EXISTS patient_intake_stats_seen ON patient_intake_stats(seen,id);CREATE TABLE IF NOT EXISTS patient_intake_counts(kind INTEGER PRIMARY KEY,n INTEGER NOT NULL);CREATE TABLE IF NOT EXISTS patient_intake_job(id INTEGER PRIMARY KEY,tag TEXT NOT NULL,cursor INTEGER NOT NULL,total INTEGER NOT NULL,done INTEGER NOT NULL,updated TEXT NOT NULL);CREATE TABLE IF NOT EXISTS patient_marketing_members(id TEXT PRIMARY KEY,identity TEXT NOT NULL,summary TEXT NOT NULL);CREATE INDEX IF NOT EXISTS patient_marketing_identity ON patient_marketing_members(identity,id);CREATE TABLE IF NOT EXISTS patient_marketing_totals(mask INTEGER NOT NULL,dimension TEXT NOT NULL,label TEXT NOT NULL,n INTEGER NOT NULL,revenue INTEGER NOT NULL,PRIMARY KEY(mask,dimension,label));`;
export class PatientMarketing {
  constructor(private sql: SqlStorage) {
    sql.exec(schema);
    sql.exec(
      "UPDATE patient_intake_job SET cursor=0,done=0 WHERE cursor>0 AND NOT EXISTS (SELECT id FROM patient_intake_fingerprints LIMIT 1)",
    );
  }
  private rows(q: string, ...args: any[]) {
    return this.sql.exec(q, ...args).toArray() as any[];
  }
  reset() {
    this.sql.exec(
      "DELETE FROM patient_marketing_members;DELETE FROM patient_marketing_totals;DELETE FROM patient_intake_stats;DELETE FROM patient_intake_job;DELETE FROM patient_intake_counts;DELETE FROM patient_intake_fingerprints;",
    );
  }
  private group(identity: string): MarketingSummary | undefined {
    const entries = this.rows(
      "SELECT summary FROM patient_marketing_members WHERE identity=? ORDER BY id",
      identity,
    ).map((r) => JSON.parse(r.summary) as MarketingSummary);
    if (!entries.length) return;
    entries.sort(
      (a, b) =>
        Number(!!(b.mask & 1)) - Number(!!(a.mask & 1)) ||
        b.last.localeCompare(a.last),
    );
    const best = { ...entries[0] };
    best.mask = entries.reduce((n, r) => n | r.mask, 0);
    // Repeated source imports represent the same historical amount; native receipts are additive.
    best.baseline = Math.max(...entries.map((r) => r.baseline));
    best.revenue =
      best.baseline + entries.reduce((n, r) => n + r.revenue - r.baseline, 0);
    best.first =
      entries
        .map((r) => r.first)
        .filter(Boolean)
        .sort()[0] || "";
    best.last =
      entries
        .map((r) => r.last)
        .filter(Boolean)
        .sort()
        .at(-1) || "";
    best.visits = Math.max(...entries.map((r) => r.visits));
    for (const k of ["birthYear", "sex", "source", "region"] as const)
      if (["미입력", "주소 미입력", "주소 확인 필요", ""].includes(best[k]))
        best[k] =
          entries.find(
            (r) =>
              !["미입력", "주소 미입력", "주소 확인 필요", ""].includes(r[k]),
          )?.[k] || best[k];
    return best;
  }
  private delta(r: MarketingSummary | undefined, n: number) {
    if (!r?.mask) return;
    const facets = {
      all: "전체",
      birthYear: r.birthYear,
      sex: r.sex,
      region: r.region,
      source: r.source,
      first: r.first || "미입력",
      last: r.last || "미입력",
      visits:
        r.visits > 1 ? "2회 이상" : r.visits === 1 ? "1회" : "횟수 미입력",
      grade: r.grade,
      spend:
        r.revenue >= 5000000
          ? "500만원 이상"
          : r.revenue >= 1000000
            ? "100만~500만원 미만"
            : r.revenue > 0
              ? "100만원 미만"
              : "수납액 없음·미입력",
    };
    for (const [dimension, label] of Object.entries(facets))
      this.sql.exec(
        "INSERT INTO patient_marketing_totals VALUES(?,?,?,?,?) ON CONFLICT(mask,dimension,label) DO UPDATE SET n=n+excluded.n,revenue=revenue+excluded.revenue",
        r.mask,
        dimension,
        label,
        n,
        n * r.revenue,
      );
  }
  update(id: string, identity: string, summary: MarketingSummary | undefined) {
    const prior = this.rows(
      "SELECT identity FROM patient_marketing_members WHERE id=?",
      id,
    )[0]?.identity;
    const keys = new Set([identity, prior].filter(Boolean));
    for (const key of keys) this.delta(this.group(key), -1);
    this.sql.exec("DELETE FROM patient_marketing_members WHERE id=?", id);
    if (summary)
      this.sql.exec(
        "INSERT INTO patient_marketing_members VALUES(?,?,?)",
        id,
        identity,
        JSON.stringify(summary),
      );
    for (const key of keys) this.delta(this.group(key), 1);
  }
  registered(from: string, to: string, groups: PatientCohort[] | undefined) {
    const selection = cohortSelectionMask(groups);
    let total = 0;
    for (let mask = 1; mask < 16; mask++)
      if (mask & selection)
        total += this.rows(
          "SELECT COALESCE(SUM(n),0) AS n FROM patient_marketing_totals WHERE mask=? AND dimension='first' AND label>=? AND label<=?",
          mask,
          from,
          to,
        )[0].n;
    return total;
  }
  mask(identity: string) {
    return this.group(identity)?.mask || 0;
  }
  report(groups: PatientCohort[] | undefined, financial: boolean) {
    const selection = cohortSelectionMask(groups),
      maps = new Map<string, Map<string, number>>();
    let total = 0,
      revenue = 0,
      converted = 0;
    const groupCounts = new Map<string, number>();
    // At most fifteen disjoint membership combinations. Query aggregate rows, never patients.
    for (let mask = 1; mask < 16; mask++) {
      if (!(mask & selection)) continue;
      const rows = this.rows(
        "SELECT dimension,label,n,revenue FROM patient_marketing_totals WHERE mask=? AND n>0",
        mask,
      );
      for (const r of rows) {
        if (r.dimension === "all") {
          total += r.n;
          revenue += r.revenue;
          if (mask & 1 && mask & 14) converted += r.n;
          const primary = patientCohorts.find(
            (c) => (mask & selection & c.bit) !== 0,
          )!;
          groupCounts.set(
            primary.label,
            (groupCounts.get(primary.label) || 0) + r.n,
          );
        }
        if (!maps.has(r.dimension)) maps.set(r.dimension, new Map());
        const m = maps.get(r.dimension)!;
        const label =
          r.dimension === "source" ? acquisitionSourceLabel(r.label) : r.label;
        m.set(label, (m.get(label) || 0) + r.n);
      }
    }
    const bucket = (m: Map<string, number> | undefined) =>
      [...(m || [])]
        .map(([name, count]) => ({ name, count }))
        .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));
    const year = Number(
      new Intl.DateTimeFormat("en", {
        timeZone: "Asia/Seoul",
        year: "numeric",
      }).format(new Date()),
    );
    const ages = new Map<string, number>();
    for (const [y, n] of maps.get("birthYear") || []) {
      const a = year - Number(y);
      const band =
        !Number.isFinite(a) || a < 0
          ? "미입력"
          : a < 20
            ? "20세 미만"
            : a >= 70
              ? "70세 이상"
              : Math.floor(a / 10) * 10 + "대";
      ages.set(band, (ages.get(band) || 0) + n);
    }
    const recency = new Map<string, number>();
    for (const [day, n] of maps.get("last") || []) {
      const days = (Date.now() - Date.parse(day)) / 86400000;
      const band = !Number.isFinite(days)
        ? "최근일 미입력"
        : days >= 365
          ? "1년 이상 미방문"
          : days >= 180
            ? "180~364일 미방문"
            : days >= 90
              ? "90~179일 미방문"
              : days >= 30
                ? "30~89일 미방문"
                : "최근 30일 방문";
      recency.set(band, (recency.get(band) || 0) + n);
    }
    const sourceSummary = acquisitionSourceSummary(bucket(maps.get("source")));
    return {
      total,
      converted,
      revenue: financial ? revenue : null,
      averageRevenue: financial && total ? Math.round(revenue / total) : null,
      groups: bucket(groupCounts),
      ages: bucket(ages),
      sexes: bucket(maps.get("sex")),
      regions: groupSmallPatientRegions(bucket(maps.get("region"))),
      sources: sourceSummary.rows,
      sourceRespondents: sourceSummary.respondents,
      visits: bucket(maps.get("visits")),
      segments: bucket(recency),
      spend: financial ? bucket(maps.get("spend")) : [],
      grades: financial ? bucket(maps.get("grade")) : [],
    };
  }
}
