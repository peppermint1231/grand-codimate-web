import {
  PatientMarketing,
  marketingSummary,
  type MarketingSummary,
} from "./patientMarketing";
import { createHmac } from "node:crypto";
import { patientDirectorySchema } from "./patientDirectorySchema";
import { open, seal } from "./crypto";
import { emptyState, type Patient, type State } from "../src/core/model";
import {
  patientIndex,
  searchPatients,
  type PatientSearchRow,
  type PatientSearchFilter,
} from "../src/core/patientSearch";
import { patientIdentityKey } from "../src/core/patientIdentity";
import {
  patientLastConsultedAt,
  patientRegisteredAt,
} from "../src/core/patientHistory";
import { regionLabel } from "../src/core/addressRegion";
import { DomainError } from "../src/core/domain";
type Meta = {
  phase: string;
  cursor: string;
  processed: number;
  generation: number;
};
type Entry = {
  marketing: MarketingSummary;
  id: string;
  value: string;
  identity: string;
  phone_key: string;
  birth_key: string;
  archived: number;
  merged: number;
  name_sort: string;
  recent: string;
  registered: string;
  revenue: number;
  outstanding: number;
  grade: string;
  address_status: string;
  region: string;
  imported: number;
  facets: string;
  tokens: string;
};
const norm = (value: string) =>
  value.normalize("NFKC").toLowerCase().replace(/[\s-]/g, "");
const relationSections = ["consultations", "ledger", "vipAccounts"] as const;
/** Durable encrypted page rows + indexed metadata; never reconstruct an all-patient JS cache. */
export class PatientDirectory {
  private marketing: PatientMarketing;
  private tokenCache = new Map<string, string>();
  constructor(
    private sql: SqlStorage,
    private key: string,
    private transaction: <T>(f: () => T) => T = (f) => f(),
  ) {
    sql.exec(patientDirectorySchema);
    this.marketing = new PatientMarketing(sql);
  }
  private rows<T = any>(q: string, ...args: any[]): T[] {
    return this.sql.exec(q, ...args).toArray() as T[];
  }
  private hash(value: string) {
    return createHmac("sha256", Buffer.from(this.key, "base64"))
      .update("directory-v1|" + value)
      .digest("hex");
  }
  private chars(value: string) {
    return Array.from(norm(value))
      .map((char) => {
        let token = this.tokenCache.get(char);
        if (!token) {
          token = "h" + this.hash("char:" + char).slice(0, 32);
          if (this.tokenCache.size < 16000) this.tokenCache.set(char, token);
        }
        return token;
      })
      .join(" ");
  }
  status() {
    const meta = this.rows<Meta>(
      "SELECT phase,cursor,processed,generation FROM patient_directory_meta WHERE id=1",
    )[0];
    return {
      ...meta,
      ready: meta.phase === "ready",
      dirty:
        this.rows("SELECT id FROM patient_directory_dirty LIMIT 1").length > 0,
    };
  }
  /** Called inside the same transaction as the source writes. */
  track(changes: { section: keyof State; id: string; value: any }[]) {
    for (const change of changes) {
      if (relationSections.includes(change.section as any)) {
        for (const old of this.rows(
          "SELECT patient_id FROM patient_relations WHERE section=? AND id=?",
          change.section,
          change.id,
        ))
          this.sql.exec(
            "INSERT OR IGNORE INTO patient_directory_dirty VALUES(?)",
            old.patient_id,
          );
        this.sql.exec(
          "DELETE FROM patient_relations WHERE section=? AND id=?",
          change.section,
          change.id,
        );
        if (change.value?.patientId) {
          this.sql.exec(
            "INSERT OR REPLACE INTO patient_relations VALUES(?,?,?)",
            change.section,
            change.value.patientId,
            change.id,
          );
          this.sql.exec(
            "INSERT OR IGNORE INTO patient_directory_dirty VALUES(?)",
            change.value.patientId,
          );
        }
      }
      if (change.section === "patients")
        this.sql.exec(
          "INSERT OR IGNORE INTO patient_directory_dirty VALUES(?)",
          change.id,
        );
      if (change.section === "policies") {
        const hash = this.hash(
          JSON.stringify({
            grades: change.value.grades,
            vip: change.value.vip,
          }),
        );
        const prior = this.rows(
          "SELECT policy_hash,phase FROM patient_directory_meta WHERE id=1",
        )[0];
        if (
          prior.policy_hash &&
          prior.policy_hash !== hash &&
          ["ready", "patients"].includes(prior.phase)
        )
          this.sql.exec(
            "UPDATE patient_directory_meta SET phase='patients',cursor='',processed=0 WHERE id=1",
          );
        this.sql.exec(
          "UPDATE patient_directory_meta SET policy_hash=? WHERE id=1",
          hash,
        );
      }
    }
  }
  reset() {
    this.marketing.reset();
    this.sql.exec(
      "DELETE FROM patient_directory;DELETE FROM patient_directory_search;DELETE FROM patient_directory_dirty;DELETE FROM patient_relations;DELETE FROM patient_directory_identity;DELETE FROM patient_directory_totals;DELETE FROM patient_directory_tags;DELETE FROM patient_directory_queries;DELETE FROM patient_directory_pages;UPDATE patient_directory_meta SET phase='consultations',cursor='',processed=0,policy_hash='',generation=generation+1 WHERE id=1;",
    );
  }
  private compact(p: Patient): Patient {
    const { external, ...rest } = p;
    return {
      ...rest,
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
  private async policies() {
    return Promise.all(
      this.rows(
        "SELECT value FROM entities WHERE section='policies' ORDER BY id LIMIT 20",
      ).map((r) => open<State["policies"][number]>(r.value, this.key)),
    );
  }
  private async prepare(
    id: string,
    policies: State["policies"],
    source?: Patient,
  ): Promise<Entry | undefined> {
    const saved = source
      ? null
      : this.rows(
          "SELECT value FROM entities WHERE section='patients' AND id=?",
          id,
        )[0];
    const p =
      source ||
      (saved ? await open<Patient>(saved.value, this.key) : undefined);
    if (!p) return;
    const state = emptyState();
    state.patients = [p];
    state.policies = policies;
    for (const section of relationSections) {
      const values = this.rows(
        "SELECT e.value FROM patient_relations r JOIN entities e ON e.section=r.section AND e.id=r.id WHERE r.section=? AND r.patient_id=?",
        section,
        id,
      );
      (state[section] as any[]).push(
        ...(await Promise.all(values.map((r) => open(r.value, this.key)))),
      );
    }
    const row = patientIndex({
      ...state,
      patients: [{ ...p, mergedInto: undefined }],
    })[0];
    row.p = this.compact(p);
    row.duplicates = 0;
    const archived = Number(!!p.archived),
      merged = Number(!!p.mergedInto),
      prefix = String(archived) + ":";
    const region = regionLabel(p),
      address_status =
        region === "주소 미입력"
          ? "missing"
          : region === "주소 확인 필요"
            ? "unresolved"
            : "resolved";
    const facets = new Set([
      prefix + "all",
      prefix + "grade:" + row.g.id,
      prefix + "address:" + address_status,
      ...[p.ownerId, ...row.cs.map((c) => c.ownerId)]
        .filter(Boolean)
        .map((id) => prefix + "owner:" + id),
      ...row.cs
        .filter((c) => !c.cancelled)
        .map((c) => prefix + "status:" + c.status),
    ]);
    if (row.m.outstanding > 0) facets.add(prefix + "unpaid");
    if (!archived) {
      facets.add("region:" + region);
      if (p.external || p.id.startsWith("vegas-")) facets.add("imported");
      const day = patientRegisteredAt(p).slice(0, 10);
      if (!p.id.startsWith("vegas-") || p.external?.firstVisit) {
        facets.add("registered:" + day);
        facets.add("registered-owner:" + p.ownerId + ":" + day);
      }
    }
    const identity = patientIdentityKey(p);
    return {
      id,
      marketing: marketingSummary({ ...row, p }),
      value: await seal(row, this.key),
      identity: identity ? this.hash("identity:" + identity) : "",
      phone_key: p.phone
        ? this.hash("phone:" + p.phone.normalize("NFKC").replace(/\D/g, ""))
        : "",
      birth_key:
        p.name && p.dob ? this.hash("birth:" + norm(p.name) + "|" + p.dob) : "",
      archived,
      merged,
      name_sort: p.name.normalize("NFKC").toLowerCase().replace(/\s/g, ""),
      recent: patientLastConsultedAt(p, row.cs) || patientRegisteredAt(p),
      registered: patientRegisteredAt(p).slice(0, 10),
      revenue: row.m.revenue,
      outstanding: row.m.outstanding,
      grade: row.g.id,
      address_status,
      region,
      imported: Number(!!p.external || p.id.startsWith("vegas-")),
      facets: JSON.stringify(merged ? [] : [...facets]),
      tokens: [p.name, p.phone, p.dob, p.id, p.number || ""]
        .map((v) => this.chars(v))
        .join(" separator "),
    };
  }
  private add(facet: string, n: number, revenue = 0) {
    this.sql.exec(
      "INSERT INTO patient_directory_totals VALUES(?,?,?) ON CONFLICT(facet) DO UPDATE SET n=n+excluded.n,revenue=revenue+excluded.revenue",
      facet,
      n,
      revenue,
    );
  }
  private identityDelta(identity: string, delta: number) {
    if (!identity) return;
    const n =
      this.rows(
        "SELECT n FROM patient_directory_identity WHERE identity=?",
        identity,
      )[0]?.n || 0;
    const next = n + delta;
    this.sql.exec(
      "INSERT INTO patient_directory_identity VALUES(?,?) ON CONFLICT(identity) DO UPDATE SET n=excluded.n",
      identity,
      next,
    );
    this.add("duplicates", (next > 1 ? next : 0) - (n > 1 ? n : 0));
  }
  private apply(entry: Entry) {
    const prior = this.rows(
      "SELECT rowid,identity,archived,merged,revenue,facets FROM patient_directory WHERE id=?",
      entry.id,
    )[0];
    if (prior) {
      for (const facet of JSON.parse(prior.facets))
        this.add(facet, -1, -prior.revenue);
      if (!prior.archived && !prior.merged)
        this.identityDelta(prior.identity, -1);
      this.sql.exec(
        "DELETE FROM patient_directory_search WHERE rowid=?",
        prior.rowid,
      );
      this.sql.exec("DELETE FROM patient_directory_tags WHERE id=?", entry.id);
    }
    const { tokens, marketing, ...saved } = entry;
    this.marketing.update(
      entry.id,
      entry.identity || this.hash("id:" + entry.id),
      entry.archived || entry.merged ? undefined : marketing,
    );
    const keys = Object.keys(saved);
    this.sql.exec(
      `INSERT INTO patient_directory(${keys.join(",")}) VALUES(${keys.map(() => "?").join(",")}) ON CONFLICT(id) DO UPDATE SET ${keys
        .filter((k) => k !== "id")
        .map((k) => `${k}=excluded.${k}`)
        .join(",")}`,
      ...Object.values(saved),
    );
    const rowid =
      prior?.rowid ||
      this.rows("SELECT rowid FROM patient_directory WHERE id=?", entry.id)[0]
        .rowid;
    this.sql.exec(
      "INSERT INTO patient_directory_search(rowid,tokens) VALUES(?,?)",
      rowid,
      tokens,
    );
    for (const facet of JSON.parse(entry.facets)) {
      this.add(facet, 1, entry.revenue);
      this.sql.exec(
        "INSERT INTO patient_directory_tags VALUES(?,?)",
        facet,
        entry.id,
      );
    }
    if (!entry.archived && !entry.merged) this.identityDelta(entry.identity, 1);
    this.sql.exec("DELETE FROM patient_directory_dirty WHERE id=?", entry.id);
  }
  async step(limit = 200) {
    limit = Math.min(300, Math.max(1, Math.floor(limit)));
    const meta = this.status();
    if (relationSections.includes(meta.phase as any)) {
      const rows = this.rows(
        "SELECT id,value FROM entities WHERE section=? AND id>? ORDER BY id LIMIT ?",
        meta.phase,
        meta.cursor,
        limit,
      );
      const values = await Promise.all(
        rows.map((r) => open<any>(r.value, this.key)),
      );
      this.transaction(() => {
        for (const value of values)
          if (value.patientId)
            this.sql.exec(
              "INSERT OR REPLACE INTO patient_relations VALUES(?,?,?)",
              meta.phase,
              value.patientId,
              value.id,
            );
        if (rows.length)
          this.sql.exec(
            "UPDATE patient_directory_meta SET cursor=? WHERE id=1",
            rows.at(-1).id,
          );
        else
          this.sql.exec(
            "UPDATE patient_directory_meta SET phase=?,cursor='' WHERE id=1",
            meta.phase === "consultations"
              ? "ledger"
              : meta.phase === "ledger"
                ? "vipAccounts"
                : "patients",
          );
      });
      return this.status();
    }
    const rows = meta.ready
      ? this.rows(
          "SELECT id FROM patient_directory_dirty ORDER BY id LIMIT ?",
          limit,
        )
      : this.rows(
          "SELECT id,value FROM entities WHERE section='patients' AND id>? ORDER BY id LIMIT ?",
          meta.cursor,
          limit,
        );
    if (!rows.length) {
      if (!meta.ready)
        this.sql.exec(
          "UPDATE patient_directory_meta SET phase='ready',cursor='' WHERE id=1",
        );
      return this.status();
    }
    const policies = await this.policies();
    if (policies[0])
      this.sql.exec(
        "UPDATE patient_directory_meta SET policy_hash=? WHERE id=1 AND policy_hash=''",
        this.hash(
          JSON.stringify({ grades: policies[0].grades, vip: policies[0].vip }),
        ),
      );
    const entries: Entry[] = [];
    for (const row of rows) {
      const p = row.value
        ? await open<Patient>(row.value, this.key)
        : undefined;
      const entry = await this.prepare(row.id, policies, p);
      if (entry) entries.push(entry);
    }
    this.transaction(() => {
      for (const entry of entries) this.apply(entry);
      for (const row of rows)
        this.sql.exec("DELETE FROM patient_directory_dirty WHERE id=?", row.id);
      this.sql.exec(
        "UPDATE patient_directory_meta SET generation=generation+1,processed=processed+?,cursor=? WHERE id=1",
        meta.ready ? 0 : rows.length,
        meta.ready ? "" : rows.at(-1).id,
      );
      if (!meta.ready && rows.length < limit)
        this.sql.exec(
          "UPDATE patient_directory_meta SET phase='ready',cursor='' WHERE id=1",
        );
    });
    this.sql.exec(
      "DELETE FROM patient_directory_queries WHERE key IN (SELECT key FROM patient_directory_queries WHERE generation<? LIMIT 100)",
      meta.generation,
    );
    this.sql.exec(
      "DELETE FROM patient_directory_pages WHERE rowid IN (SELECT rowid FROM patient_directory_pages WHERE generation<? LIMIT 100)",
      meta.generation,
    );
    return this.status();
  }
  async ready() {
    let state = this.status();
    for (let i = 0; !state.ready && i < 5; i++) {
      const wasPatients = state.phase === "patients";
      await this.step();
      state = this.status();
      if (wasPatients && !state.ready) break;
    }
    for (let i = 0; state.ready && state.dirty && i < 3; i++) {
      await this.step();
      state = this.status();
    }
    if (!state.ready || state.dirty)
      throw new DomainError(
        "환자 검색 색인을 준비 중입니다. 기존 자료는 보존되며 잠시 후 다시 조회할 수 있습니다.",
        503,
      );
    return state;
  }
  private total(facet: string) {
    return (
      this.rows(
        "SELECT n,revenue FROM patient_directory_totals WHERE facet=?",
        facet,
      )[0] || { n: 0, revenue: 0 }
    );
  }
  async search(f: PatientSearchFilter, financial = true) {
    const meta = await this.ready(),
      prefix = String(Number(f.archived)) + ":";
    const conditions = ["d.archived=?", "d.merged=0"],
      args: any[] = [Number(f.archived)],
      facets: string[] = [];
    if (f.grade && financial) facets.push(prefix + "grade:" + f.grade);
    if (f.addressStatus) facets.push(prefix + "address:" + f.addressStatus);
    if (f.owner) facets.push(prefix + "owner:" + f.owner);
    if (f.consultStatus) facets.push(prefix + "status:" + f.consultStatus);
    if (f.unpaid) {
      if (!financial)
        return {
          ...searchPatients([], f, false),
          allActiveTotal: this.total("0:all").n,
        };
      facets.push(prefix + "unpaid");
    }
    for (const facet of facets) {
      conditions.push(
        "d.id IN (SELECT id FROM patient_directory_tags WHERE facet=?)",
      );
      args.push(facet);
    }
    if (f.since) {
      conditions.push("d.recent>=?");
      args.push(f.since);
    }
    if (f.duplicateOnly)
      conditions.push(
        "d.identity IN (SELECT identity FROM patient_directory_identity WHERE n>1)",
      );
    const q = norm(f.search.trim().slice(0, 200));
    if (q) {
      conditions.push(
        "d.rowid IN (SELECT rowid FROM patient_directory_search WHERE patient_directory_search MATCH ?)",
      );
      args.push('"' + this.chars(q) + '"');
    }
    const source =
      "patient_directory d" +
      (q
        ? " NOT INDEXED"
        : facets.length
          ? " INDEXED BY sqlite_autoindex_patient_directory_1"
          : f.duplicateOnly
            ? " INDEXED BY patient_directory_identity_lookup"
            : "");
    const where = conditions.join(" AND "),
      sort =
        f.sort === "name"
          ? "name_sort"
          : f.sort === "revenue" && financial
            ? "revenue"
            : "recent",
      asc = sort === "name_sort",
      order = `d.${sort} ${asc ? "ASC" : "DESC"},d.id ${asc ? "ASC" : "DESC"}`;
    const key = this.hash(JSON.stringify([where, args, sort]));
    let total: number;
    if (!q && !f.since && !f.duplicateOnly && facets.length <= 1)
      total = this.total(facets[0] || prefix + "all").n;
    else if (f.duplicateOnly && !q && !f.since && !facets.length && !f.archived)
      total = this.total("duplicates").n;
    else {
      const cached = this.rows(
        "SELECT total FROM patient_directory_queries WHERE key=? AND generation=?",
        key,
        meta.generation,
      )[0];
      if (cached) total = cached.total;
      else {
        total = this.rows(
          `SELECT COUNT(*) AS n FROM (SELECT d.id FROM ${source} WHERE ${where} LIMIT 10001)`,
          ...args,
        )[0].n;
        if (total > 10000)
          throw new DomainError(
            "검색 결과가 많습니다. 이름·연락처나 다른 조건을 추가해 주세요.",
            422,
          );
        this.sql.exec(
          "INSERT OR REPLACE INTO patient_directory_queries VALUES(?,?,?,?)",
          key,
          meta.generation,
          total,
          Date.now(),
        );
      }
    }
    if (total === 0)
      return {
        page: 0,
        total: 0,
        pageSize: 30,
        allActiveTotal: this.total("0:all").n,
        totalRevenue: financial ? this.total("0:all").revenue : null,
        rows: [],
      };
    let page = Math.min(
        Math.max(0, Math.floor(f.page) || 0),
        Math.max(0, Math.ceil(total / 30) - 1),
      ),
      offset = page * 30;
    const pageArgs = args.slice();
    let seek = "";
    if (page) {
      const anchor = this.rows(
        "SELECT page,sort_value,id FROM patient_directory_pages WHERE key=? AND generation=? AND page<=? ORDER BY page DESC LIMIT 1",
        key,
        meta.generation,
        page,
      )[0];
      if (anchor) {
        seek = ` AND (d.${sort},d.id) ${asc ? ">" : "<"} (?,?)`;
        pageArgs.push(anchor.sort_value, anchor.id);
        offset = (page - anchor.page) * 30;
      }
      if (offset > 300) {
        page = 0;
        offset = 0;
        seek = "";
        pageArgs.splice(args.length);
      }
    }
    const selected = this.rows(
      `SELECT d.value,d.identity,d.${sort} AS sort_value,d.id FROM ${source} WHERE ${where}${seek} ORDER BY ${order} LIMIT 30 OFFSET ?`,
      ...pageArgs,
      offset,
    );
    const rows = await Promise.all(
      selected.map((r) => open<PatientSearchRow>(r.value, this.key)),
    );
    for (let i = 0; i < rows.length; i++)
      rows[i].duplicates = f.archived
        ? 0
        : Math.max(
            0,
            (this.rows(
              "SELECT n FROM patient_directory_identity WHERE identity=?",
              selected[i].identity,
            )[0]?.n || 1) - 1,
          );
    if (selected.length)
      this.sql.exec(
        "INSERT OR REPLACE INTO patient_directory_pages VALUES(?,?,?,?,?)",
        key,
        meta.generation,
        page + 1,
        selected.at(-1).sort_value,
        selected.at(-1).id,
      );
    const projected = searchPatients(
      rows,
      {
        ...f,
        search: "",
        grade: "",
        owner: "",
        consultStatus: "",
        since: "",
        addressStatus: "",
        duplicateOnly: false,
        unpaid: false,
        page: 0,
      },
      financial,
    ).rows;
    return {
      page,
      total,
      pageSize: 30,
      allActiveTotal: this.total("0:all").n,
      totalRevenue: financial ? this.total("0:all").revenue : null,
      rows: selected
        .map((r) => projected.find((p) => p.p.id === r.id)!)
        .filter(Boolean),
    };
  }
  async matches(p: Patient) {
    await this.ready();
    const key = patientIdentityKey(p);
    if (!key) return { patients: [], total: 0 };
    const identity = this.hash("identity:" + key);
    const rows = this.rows(
      "SELECT value FROM patient_directory WHERE identity=? AND archived=0 AND merged=0 AND id<>? ORDER BY id LIMIT 100",
      identity,
      p.id,
    );
    return {
      patients: await Promise.all(
        rows.map(
          async (r) => (await open<PatientSearchRow>(r.value, this.key)).p,
        ),
      ),
      total: Math.max(
        0,
        (this.rows(
          "SELECT n FROM patient_directory_identity WHERE identity=?",
          identity,
        )[0]?.n || 0) - Number(!p.archived && !p.mergedInto),
      ),
    };
  }
  async candidates(
    fields: { name: string; phone: string; dob: string },
    originalId: string,
  ) {
    await this.ready();
    const ids = new Set<string>([originalId]);
    if (fields.phone)
      for (const row of this.rows(
        "SELECT id FROM patient_directory WHERE phone_key=? LIMIT 100",
        this.hash("phone:" + fields.phone.normalize("NFKC").replace(/\D/g, "")),
      ))
        ids.add(row.id);
    if (fields.name && fields.dob)
      for (const row of this.rows(
        "SELECT id FROM patient_directory WHERE birth_key=? LIMIT 100",
        this.hash("birth:" + norm(fields.name) + "|" + fields.dob),
      ))
        ids.add(row.id);
    const out: Patient[] = [];
    for (const id of ids) {
      const row = this.rows(
        "SELECT value FROM patient_directory WHERE id=?",
        id,
      )[0];
      if (row) out.push((await open<PatientSearchRow>(row.value, this.key)).p);
    }
    const merged = out.find((p) => p.id === originalId)?.mergedInto;
    if (merged && !ids.has(merged)) {
      const row = this.rows(
        "SELECT value FROM patient_directory WHERE id=?",
        merged,
      )[0];
      if (row) out.push((await open<PatientSearchRow>(row.value, this.key)).p);
    }
    return out;
  }
  intakeStatus() {
    return {
      ...(this.rows(
        "SELECT tag,cursor,total,done,updated FROM patient_intake_job WHERE id=1",
      )[0] || { tag: "", cursor: 0, total: 0, done: false, updated: "" }),
      unclassified:
        this.rows("SELECT n FROM patient_intake_counts WHERE kind=0")[0]?.n ||
        0,
    };
  }
  resetIntakeCursor() {
    this.sql.exec(
      "UPDATE patient_intake_job SET tag='',cursor=0,done=0 WHERE id=1",
    );
  }
  applyIntake(batch: {
    rows: {
      id: string;
      fields: import("../src/core/intake").IntakeFields;
      at: string;
    }[];
    tag: string;
    cursor: number;
    total: number;
    done: boolean;
  }) {
    this.transaction(() => {
      for (const row of batch.rows) {
        const p = {
          ...row.fields,
          id: "survey:" + row.id,
          createdAt: row.at,
          updatedAt: row.at,
          rev: 1,
          ownerId: "",
        } as Patient;
        const key = patientIdentityKey(p),
          identity = key
            ? this.hash("identity:" + key)
            : this.hash("id:" + p.id);
        const summary: MarketingSummary = {
          mask:
            p.intakeKind === "beauty" ? 4 : p.intakeKind === "medical" ? 8 : 0,
          birthYear: p.dob?.slice(0, 4) || "미입력",
          sex: p.sex === "F" ? "여성" : p.sex === "M" ? "남성" : "미입력",
          region: regionLabel(p),
          source: p.acquisitionSource || "미입력",
          first: row.at.slice(0, 10),
          last: "",
          revenue: 0,
          baseline: 0,
          visits: 0,
          grade: "미분류",
        };
        this.marketing.update(p.id, identity, summary);
        const old = this.rows(
          "SELECT kind FROM patient_intake_stats WHERE id=?",
          p.id,
        )[0];
        if (old)
          this.sql.exec(
            "UPDATE patient_intake_counts SET n=n-1 WHERE kind=?",
            old.kind,
          );
        this.sql.exec(
          "INSERT INTO patient_intake_counts VALUES(?,1) ON CONFLICT(kind) DO UPDATE SET n=n+1",
          summary.mask,
        );
        this.sql.exec(
          "INSERT OR REPLACE INTO patient_intake_stats VALUES(?,?,?)",
          p.id,
          batch.tag,
          summary.mask,
        );
      }
      this.sql.exec(
        "INSERT OR REPLACE INTO patient_intake_job VALUES(1,?,?,?,?,?)",
        batch.tag,
        batch.cursor,
        batch.total,
        0,
        new Date().toISOString(),
      );
    });
    if (batch.done) this.cleanIntake(batch.tag);
    return this.intakeStatus();
  }
  cleanIntake(tag: string) {
    this.transaction(() => {
      const stale = [
        ...this.rows(
          "SELECT id,kind FROM patient_intake_stats WHERE seen<? LIMIT 100",
          tag,
        ),
        ...this.rows(
          "SELECT id,kind FROM patient_intake_stats WHERE seen>? LIMIT 100",
          tag,
        ),
      ];
      for (const r of stale) {
        this.marketing.update(r.id, "", undefined);
        this.sql.exec("DELETE FROM patient_intake_stats WHERE id=?", r.id);
        this.sql.exec(
          "UPDATE patient_intake_counts SET n=n-1 WHERE kind=?",
          r.kind,
        );
      }
      if (stale.length < 100)
        this.sql.exec(
          "UPDATE patient_intake_job SET done=1,updated=? WHERE id=1",
          new Date().toISOString(),
        );
    });
    return this.intakeStatus();
  }
  enrichCohorts(patients: Patient[]) {
    for (const p of patients) {
      const key = patientIdentityKey(p);
      p.analyticsCohorts = this.marketing.mask(
        key ? this.hash("identity:" + key) : this.hash("id:" + p.id),
      );
    }
  }
  registeredReport(
    from: string,
    to: string,
    groups: import("../src/core/patientCohorts").PatientCohort[] | undefined,
  ) {
    return this.marketing.registered(from, to, groups);
  }
  async marketingReport(
    groups: import("../src/core/patientCohorts").PatientCohort[] | undefined,
    financial: boolean,
  ) {
    await this.ready();
    return this.marketing.report(groups, financial);
  }
  async statistics(from: string, to: string, owner = "") {
    await this.ready();
    const regions = this.rows(
      "SELECT facet,n FROM patient_directory_totals WHERE facet>=? AND facet<? AND n>0",
      "region:",
      "region;",
    ).map((r) => ({ name: r.facet.slice(7), count: r.n }));
    const missing = regions.find((r) => r.name === "주소 미입력")?.count || 0,
      unresolved = regions.find((r) => r.name === "주소 확인 필요")?.count || 0;
    const prefix = owner ? "registered-owner:" + owner + ":" : "registered:";
    const registered = this.rows(
      "SELECT COALESCE(SUM(n),0) AS n FROM patient_directory_totals WHERE facet>=? AND facet<=?",
      prefix + from,
      prefix + to,
    )[0].n;
    return {
      registered,
      directory: {
        total: this.total("0:all").n,
        imported: this.total("imported").n,
        missing,
        unresolved,
        regions: [
          ...regions.filter(
            (r) => !["주소 미입력", "주소 확인 필요"].includes(r.name),
          ),
          ...(missing + unresolved
            ? [{ name: "지역 누락", count: missing + unresolved }]
            : []),
        ].sort((a, b) => b.count - a.count),
      },
    };
  }
}
