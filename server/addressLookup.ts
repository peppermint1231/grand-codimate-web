import { createHmac } from "node:crypto";
import { open, seal } from "./crypto";
import {
  normalizeRegionAddress,
  type AddressRegion,
} from "../src/core/addressRegion";
export type RoadQuery = {
  query: string;
  city: string;
  province: string;
  road: string;
  main: string;
  sub: string;
};
export function roadQuery(address: string): RoadQuery | undefined {
  // Numbered side streets are often entered with spaces, e.g. 후석로 369 번길.
  // Join only a road + numbered 길 suffix, never a building or apartment number.
  const text = normalizeRegionAddress(address).replace(
    /([가-힣0-9·.]+(?:로|길))\s*(\d+)\s*(번길|길)(?=\s|\d|$)/g,
    "$1$2$3",
  );
  const match = text.match(
    /(?:^|\s)([가-힣0-9·.]+(?:로|길)(?:\d+(?:번길|길))?)\s*(\d+)(?:\s*-\s*(\d+))?(?=\s|[(),]|\.\d+동|$)/,
  );
  if (!match || Number(match[2]) < 1) return;
  let prefix = text.slice(0, match.index).trim();
  if (
    prefix &&
    !/^(?:(?:강원특별자치도|강원도|서울특별시|서울|경기도|경기|부산광역시|대구광역시|인천광역시|광주광역시|대전광역시|울산광역시|세종특별자치시|충청남도|충청북도|전라남도|전라북도|전북특별자치도|경상남도|경상북도|제주특별자치도|제주도)\s*)?(?:[가-힣]+[시군구](?:\s+[가-힣]+구)?\s*)?(?:[가-힣]+[읍면]\s*)?$/.test(
      prefix,
    )
  )
    return;
  const province =
    prefix.match(
      /^(강원특별자치도|강원도|서울특별시|서울|경기도|경기|부산광역시|대구광역시|인천광역시|광주광역시|대전광역시|울산광역시|세종특별자치시|충청남도|충청북도|전라남도|전라북도|전북특별자치도|경상남도|경상북도|제주특별자치도|제주도)(?=\s|$)/,
    )?.[1] || "";
  let city =
    prefix
      .slice(province.length)
      .trim()
      .match(/^([가-힣]+[시군](?:\s+[가-힣]+구)?|[가-힣]+구)(?=\s|$)/)?.[1] ||
    "";
  // A missing city is only defaulted when the whole locality is absent (or an explicit Chuncheon 읍/면 is used).
  if (!city && (!province || province.startsWith("강원"))) {
    city = "춘천시";
    prefix =
      "강원특별자치도 춘천시" +
      (prefix.slice(province.length).trim()
        ? " " + prefix.slice(province.length).trim()
        : "");
  }
  if (!city && !province.startsWith("세종")) return;
  const main = String(Number(match[2])),
    sub = String(Number(match[3] || 0));
  return {
    query: [prefix, match[1], main + (sub !== "0" ? "-" + sub : "")].join(" "),
    city,
    province,
    road: match[1],
    main,
    sub,
  };
}
const provinceName = (s: string) =>
  s
    .replace(/^강원(?:특별자치도|도)?$/, "강원")
    .replace(/^서울(?:특별시)?$/, "서울")
    .replace(/^경기(?:도)?$/, "경기")
    .replace(/^전라북도$/, "전북특별자치도");
export function matchRoadRegion(
  q: RoadQuery,
  data: any,
): AddressRegion | undefined {
  const docs = data?.documents;
  if (
    !Array.isArray(docs) ||
    !docs.length ||
    Number(data.meta?.total_count) > docs.length
  )
    return;
  const regions = new Map<string, AddressRegion>();
  for (const d of docs) {
    const r = d.road_address,
      a = d.address;
    if (
      !r ||
      !a ||
      r.road_name !== q.road ||
      String(Number(r.main_building_no)) !== q.main ||
      String(Number(r.sub_building_no || 0)) !== q.sub
    )
      continue;
    if (q.city && a.region_2depth_name !== q.city) continue;
    if (
      q.province &&
      provinceName(a.region_1depth_name) !== provinceName(q.province)
    )
      continue;
    const neighborhood = String(a.region_3depth_name || "");
    if (!/[동읍면가]$/.test(neighborhood)) continue;
    const region: AddressRegion = {
      sido: a.region_1depth_name,
      sigungu: a.region_2depth_name,
      neighborhood,
      basis: "confirmed-map",
    };
    if (!region.sido || (!region.sigungu && !region.sido.startsWith("세종")))
      continue;
    regions.set(JSON.stringify(region), region);
  }
  return regions.size === 1 ? [...regions.values()][0] : undefined;
}
export async function lookupRoad(
  q: RoadQuery,
  key: string,
): Promise<{
  region?: AddressRegion;
  error?: string;
  retry?: number;
  blocked?: boolean;
}> {
  try {
    const url = new URL("https://dapi.kakao.com/v2/local/search/address.json");
    url.searchParams.set("query", q.query);
    url.searchParams.set("analyze_type", "exact");
    url.searchParams.set("size", "30");
    const r = await fetch(url, {
      headers: { Authorization: "KakaoAK " + key },
      signal: AbortSignal.timeout(8000),
    });
    if (r.status === 401 || r.status === 403) {
      await r.body?.cancel();
      return {
        error: "주소 조회 키 또는 카카오 로컬 API 사용 권한을 확인해주세요.",
        blocked: true,
      };
    }
    if (r.status === 429) {
      await r.body?.cancel();
      return {
        error: "주소 조회 한도에 도달해 1시간 후 다시 시도합니다.",
        retry: 3600_000,
      };
    }
    if (!r.ok) {
      await r.body?.cancel();
      return {
        error: "주소 조회 서비스 연결이 지연되고 있습니다.",
        retry: 300_000,
      };
    }
    return { region: matchRoadRegion(q, await r.json()) };
  } catch {
    return {
      error: "주소 조회 연결이 지연되어 잠시 후 다시 시도합니다.",
      retry: 300_000,
    };
  }
}
const schema = `CREATE TABLE IF NOT EXISTS address_queries(id TEXT PRIMARY KEY,value TEXT NOT NULL,region TEXT NOT NULL DEFAULT '',state TEXT NOT NULL DEFAULT 'pending',next INTEGER NOT NULL DEFAULT 0,attempts INTEGER NOT NULL DEFAULT 0,error TEXT NOT NULL DEFAULT '');
CREATE INDEX IF NOT EXISTS address_queries_next ON address_queries(state,next,id);
CREATE TABLE IF NOT EXISTS address_refs(id TEXT PRIMARY KEY,query_id TEXT NOT NULL);
CREATE INDEX IF NOT EXISTS address_refs_query ON address_refs(query_id,id);
CREATE TABLE IF NOT EXISTS address_scan(id INTEGER PRIMARY KEY,cursor TEXT NOT NULL DEFAULT '',processed INTEGER NOT NULL DEFAULT 0,done INTEGER NOT NULL DEFAULT 0);
INSERT OR IGNORE INTO address_scan(id) VALUES(1);
CREATE TABLE IF NOT EXISTS address_pause(id INTEGER PRIMARY KEY,until INTEGER NOT NULL);
INSERT OR IGNORE INTO address_pause VALUES(1,0);`;
export class AddressLookup {
  constructor(
    private sql: SqlStorage,
    private key: string,
  ) {
    sql.exec(schema);
  }
  private rows(q: string, ...args: any[]) {
    return this.sql.exec(q, ...args).toArray() as any[];
  }
  private id(q: RoadQuery) {
    return createHmac("sha256", Buffer.from(this.key, "base64"))
      .update("address-v1|" + q.query)
      .digest("hex");
  }
  async resolve(patientId: string, address: string) {
    const q = roadQuery(address);
    if (!q) {
      this.detach(patientId);
      return;
    }
    const id = this.id(q);
    const cached = this.rows(
      "SELECT region FROM address_queries WHERE id=?",
      id,
    )[0];
    if (cached?.region) {
      this.detach(patientId);
      return JSON.parse(cached.region) as AddressRegion;
    }
    this.sql.exec(
      "INSERT OR REPLACE INTO address_refs VALUES(?,?)",
      patientId,
      id,
    );
    if (!cached) {
      const value = await seal(q, this.key);
      this.sql.exec(
        "INSERT OR IGNORE INTO address_queries(id,value) VALUES(?,?)",
        id,
        value,
      );
    }
  }
  detach(id: string) {
    this.sql.exec("DELETE FROM address_refs WHERE id=?", id);
  }
  cached(address: string) {
    const q = roadQuery(address);
    if (!q) return;
    const r = this.rows(
      "SELECT region FROM address_queries WHERE id=?",
      this.id(q),
    )[0];
    return r?.region ? (JSON.parse(r.region) as AddressRegion) : undefined;
  }
  status() {
    const counts = Object.fromEntries(
      this.rows(
        "SELECT state,COUNT(*) AS n FROM address_queries GROUP BY state",
      ).map((r) => [r.state, r.n]),
    );
    return {
      scan: this.rows(
        "SELECT cursor,processed,done FROM address_scan WHERE id=1",
      )[0],
      counts,
      error:
        this.rows(
          "SELECT error FROM address_queries WHERE state='blocked' LIMIT 1",
        )[0]?.error || "",
    };
  }
  scan() {
    return this.rows(
      "SELECT cursor,processed,done FROM address_scan WHERE id=1",
    )[0];
  }
  scanned(cursor: string, n: number, done: boolean) {
    this.sql.exec(
      "UPDATE address_scan SET cursor=?,processed=processed+?,done=? WHERE id=1",
      cursor,
      n,
      Number(done),
    );
  }
  restart() {
    this.sql.exec("UPDATE address_pause SET until=0 WHERE id=1");
    this.sql.exec(
      "UPDATE address_scan SET cursor='',processed=0,done=0 WHERE id=1",
    );
    this.sql.exec(
      "UPDATE address_queries SET state='pending',next=0,attempts=0,error='' WHERE state IN ('blocked','unresolved','failed')",
    );
  }
  blocked() {
    return !!this.rows(
      "SELECT id FROM address_queries WHERE state='blocked' LIMIT 1",
    ).length;
  }
  async next() {
    if (
      this.blocked() ||
      this.rows("SELECT until FROM address_pause WHERE id=1")[0].until >
        Date.now()
    )
      return;
    const r = this.rows(
      "SELECT id,value,attempts FROM address_queries WHERE state='pending' AND next<=? ORDER BY next,id LIMIT 1",
      Date.now(),
    )[0];
    if (!r) return;
    this.sql.exec(
      "UPDATE address_queries SET next=? WHERE id=?",
      Date.now() + 30_000,
      r.id,
    );
    return {
      id: r.id,
      attempts: r.attempts,
      query: await open<RoadQuery>(r.value, this.key),
    };
  }
  complete(
    id: string,
    result: Awaited<ReturnType<typeof lookupRoad>>,
    attempts: number,
  ) {
    if (result.retry === 3600_000)
      this.sql.exec(
        "UPDATE address_pause SET until=? WHERE id=1",
        Date.now() + result.retry,
      );
    const state = result.region
      ? "resolved"
      : result.blocked
        ? "blocked"
        : result.retry
          ? attempts >= 2
            ? "failed"
            : "pending"
          : "unresolved";
    this.sql.exec(
      "UPDATE address_queries SET region=?,state=?,next=?,attempts=attempts+1,error=? WHERE id=?",
      result.region ? JSON.stringify(result.region) : "",
      state,
      Date.now() + (result.retry || 0),
      result.error || "",
      id,
    );
    // Fan-out is bounded; the directory drains dirty rows in its regular batches.
    if (result.region)
      this.sql.exec(
        "UPDATE address_queries SET state='applying' WHERE id=?",
        id,
      );
  }
  applyResolved(limit = 100) {
    const q = this.rows(
      "SELECT id FROM address_queries WHERE state='applying' ORDER BY next,id LIMIT 1",
    )[0];
    if (!q) return false;
    const refs = this.rows(
      "SELECT id FROM address_refs WHERE query_id=? ORDER BY id LIMIT ?",
      q.id,
      limit,
    );
    for (const r of refs) {
      this.sql.exec(
        "INSERT OR IGNORE INTO patient_directory_dirty VALUES(?)",
        r.id,
      );
      this.detach(r.id);
    }
    if (refs.length < limit)
      this.sql.exec(
        "UPDATE address_queries SET state='resolved' WHERE id=?",
        q.id,
      );
    return true;
  }
  pending() {
    return (
      !this.scan().done ||
      !!this.rows(
        "SELECT id FROM address_queries WHERE state='applying' LIMIT 1",
      ).length
    );
  }
  nextTime() {
    if (this.blocked()) return;
    const next = this.rows(
      "SELECT next FROM address_queries WHERE state='pending' ORDER BY next,id LIMIT 1",
    )[0]?.next as number | undefined;
    return next === undefined
      ? undefined
      : Math.max(
          next,
          this.rows("SELECT until FROM address_pause WHERE id=1")[0].until,
        );
  }
}
