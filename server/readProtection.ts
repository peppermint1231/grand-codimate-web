import { AsyncLocalStorage } from "node:async_hooks";
import { DomainError } from "../src/core/domain";
const schema = `CREATE TABLE IF NOT EXISTS read_protection_windows(minute INTEGER PRIMARY KEY,reads INTEGER NOT NULL,maintenance INTEGER NOT NULL,requests INTEGER NOT NULL,blocked INTEGER NOT NULL,peak INTEGER NOT NULL);CREATE TABLE IF NOT EXISTS read_protection_circuits(route TEXT PRIMARY KEY,until INTEGER NOT NULL,reason TEXT NOT NULL);`;
type Scope = {
  route: string;
  reads: number;
  limit: number;
  maintenance: boolean;
  blocked: boolean;
};
export class ReadProtectionError extends DomainError {
  constructor(public retryAfter = 60) {
    super(
      "조회가 급증하여 잠시 쉬고 있습니다. 저장된 자료와 로그인은 유지됩니다. 잠시 후 다시 조회해 주세요.",
      429,
    );
  }
}
/** Actual SQLite cursor reads, persisted across isolate restarts. No query text or patient data is logged. */
export class ReadProtection {
  private scopes = new AsyncLocalStorage<Scope>();
  readonly sql: SqlStorage;
  constructor(
    private raw: SqlStorage,
    private now = () => Date.now(),
    private windowLimit = 250000,
  ) {
    raw.exec(schema);
    const self = this;
    this.sql = new Proxy(raw, {
      get(target, key) {
        if (key !== "exec") {
          const v = (target as any)[key];
          return typeof v === "function" ? v.bind(target) : v;
        }
        return (query: string, ...bindings: any[]) => {
          const scope = self.scopes.getStore();
          if (scope && scope.reads >= scope.limit)
            throw new ReadProtectionError();
          const cursor = target.exec(query, ...bindings);
          if (!scope || !/^\s*(SELECT|WITH|EXPLAIN)/i.test(query))
            return cursor;
          let counted = 0;
          const record = (fallback: number) => {
            const measured =
              typeof cursor.rowsRead === "number"
                ? cursor.rowsRead
                : counted + fallback;
            scope.reads += Math.max(0, measured - counted);
            counted = measured;
            if (scope.reads > scope.limit) throw new ReadProtectionError();
          };
          return new Proxy(cursor, {
            get(c, k) {
              if (k === "toArray")
                return () => {
                  const rows = c.toArray();
                  record(rows.length);
                  return rows;
                };
              if (k === "one")
                return () => {
                  const row = c.one();
                  record(1);
                  return row;
                };
              if (k === "next")
                return () => {
                  const row = c.next();
                  record(row.done ? 0 : 1);
                  return row;
                };
              if (k === Symbol.iterator)
                return function* () {
                  for (;;) {
                    const row = c.next();
                    record(row.done ? 0 : 1);
                    if (row.done) return;
                    yield row.value;
                  }
                };
              const v = (c as any)[k];
              return typeof v === "function" ? v.bind(c) : v;
            },
          });
        };
      },
    }) as SqlStorage;
  }
  private route(path: string) {
    if (
      path.startsWith("/api/patients/") &&
      !["/api/patients/search", "/api/patients/matches"].includes(path)
    )
      return "/api/patients/:id";
    return [
      "/api/state",
      "/api/patients/search",
      "/api/patients/matches",
      "/api/analytics",
      "/api/patient-index",
      "/api/read-protection",
      "/api/login",
      "/api/logout",
      "/api/health",
      "/api/commands",
      "alarm",
    ].includes(path)
      ? path
      : "/api/other";
  }
  async run<T>(path: string, method: string, fn: () => Promise<T>): Promise<T> {
    const route = this.route(path),
      minute = Math.floor(this.now() / 60000),
      maintenance = route === "/api/patient-index" || path === "alarm",
      critical =
        maintenance ||
        method !== "GET" ||
        ["/api/health", "/api/read-protection"].includes(route);
    const prior = this.raw
      .exec(
        "SELECT reads,requests FROM read_protection_windows WHERE minute=?",
        minute,
      )
      .toArray()[0] as any;
    const circuit = this.raw
      .exec("SELECT until FROM read_protection_circuits WHERE route=?", route)
      .toArray()[0] as any;
    const scope: Scope = {
      route,
      reads: 0,
      limit: maintenance ? 60000 : method !== "GET" ? 100000 : 30000,
      maintenance,
      blocked: false,
    };
    try {
      if (
        !critical &&
        ((prior?.reads || 0) >= this.windowLimit ||
          (prior?.requests || 0) > 2400 ||
          (circuit?.until || 0) > this.now())
      )
        throw new ReadProtectionError(
          Math.max(
            1,
            Math.ceil(
              ((circuit?.until || (minute + 1) * 60000) - this.now()) / 1000,
            ),
          ),
        );
      return await this.scopes.run(scope, fn);
    } catch (e) {
      if (e instanceof ReadProtectionError) {
        scope.blocked = true;
        if (scope.reads >= scope.limit)
          this.raw.exec(
            "INSERT OR REPLACE INTO read_protection_circuits VALUES(?,?,?)",
            route,
            this.now() + 60000,
            "request-read-limit",
          );
      }
      throw e;
    } finally {
      this.raw.exec(
        "INSERT INTO read_protection_windows VALUES(?,?,?,?,?,?) ON CONFLICT(minute) DO UPDATE SET reads=reads+excluded.reads,maintenance=maintenance+excluded.maintenance,requests=requests+1,blocked=blocked+excluded.blocked,peak=MAX(peak,excluded.peak)",
        minute,
        maintenance ? 0 : scope.reads,
        maintenance ? scope.reads : 0,
        1,
        Number(scope.blocked),
        scope.reads,
      );
      if (!prior) {
        this.raw.exec(
          "DELETE FROM read_protection_windows WHERE minute<?",
          minute - 1440,
        );
        this.raw.exec(
          "DELETE FROM read_protection_circuits WHERE until<?",
          this.now() - 3600000,
        );
      }
    }
  }
  status() {
    const minute = Math.floor(this.now() / 60000);
    const row = this.raw
      .exec("SELECT * FROM read_protection_windows WHERE minute=?", minute)
      .toArray()[0] as any;
    const recent = this.raw
      .exec(
        "SELECT COALESCE(SUM(reads),0) AS reads,COALESCE(SUM(maintenance),0) AS maintenance,COALESCE(SUM(blocked),0) AS blocked,COALESCE(MAX(peak),0) AS peak FROM read_protection_windows WHERE minute>=?",
        minute - 59,
      )
      .toArray()[0] as any;
    const circuits = this.raw
      .exec(
        "SELECT route,until,reason FROM read_protection_circuits WHERE until>?",
        this.now(),
      )
      .toArray();
    return {
      minuteReads: row?.reads || 0,
      minuteLimit: this.windowLimit,
      warning: (row?.reads || 0) >= this.windowLimit / 2,
      circuits,
      lastHour: recent,
      measuredAt: new Date(this.now()).toISOString(),
    };
  }
}
