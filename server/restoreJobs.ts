import { open, seal } from "./crypto";
import { ensure } from "../src/core/domain";
import { emptyState, isAdministrator } from "../src/core/model";
import type { Drive } from "./drive";
export const restoreSchema =
  "CREATE TABLE IF NOT EXISTS restore_job(id TEXT PRIMARY KEY,value TEXT NOT NULL);CREATE TABLE IF NOT EXISTS restore_files(seq INTEGER PRIMARY KEY,kind TEXT,remoteId TEXT,name TEXT);CREATE TABLE IF NOT EXISTS restore_staging(kind TEXT,section TEXT,id TEXT,value TEXT,extra TEXT,PRIMARY KEY(kind,section,id));";
export type RestoreStatus = {
  id: string;
  actorId: string;
  root: string;
  startedAt: string;
  phase: "loading" | "ready";
  processed: number;
  total: number;
  admins: string[];
  commits: number;
  error?: string;
};
export class RestoreJobs {
  constructor(
    private storage: any,
    private drive: Drive,
    private key: string,
    private root: string,
  ) {}
  private get sql() {
    return this.storage.sql;
  }
  async status(): Promise<RestoreStatus | null> {
    const row = this.sql
      .exec("SELECT value FROM restore_job WHERE id='active'")
      .toArray()[0];
    return row ? open(row.value, this.key) : null;
  }
  private async save(job: RestoreStatus) {
    this.sql.exec(
      "INSERT OR REPLACE INTO restore_job VALUES('active',?)",
      await seal(job, this.key),
    );
  }
  private stage(
    kind: string,
    section: string,
    id: string,
    value: string,
    extra: unknown = {},
  ) {
    this.sql.exec(
      "INSERT OR REPLACE INTO restore_staging VALUES(?,?,?,?,?)",
      kind,
      section,
      id,
      value,
      JSON.stringify(extra),
    );
  }
  async start(actorId: string) {
    const existing = await this.status();
    if (existing) return existing;
    ensure(
      !this.sql.exec("SELECT id FROM operations WHERE done=0 LIMIT 1").toArray()
        .length,
      "서버 대기 작업을 먼저 처리하세요",
      409,
    );
    const files: { kind: string; remoteId: string; name: string }[] = [];
    for (const kind of [
      "commits",
      "accounts",
      "media",
      "inquiries",
      "access",
    ]) {
      await this.drive.folders(`${this.root}/_codimate/${kind}`);
      const list = await this.drive.listCommits(kind, this.root);
      files.push(
        ...list
          .map((item) => ({ kind, remoteId: item.id, name: item.name }))
          .sort((a, b) => a.name.localeCompare(b.name)),
      );
    }
    ensure(
      files.some((f) => f.kind === "accounts"),
      "복구할 계정 원본이 없습니다",
      409,
    );
    const job: RestoreStatus = {
      id: crypto.randomUUID(),
      actorId,
      root: this.root,
      startedAt: new Date().toISOString(),
      phase: "loading",
      processed: 0,
      total: files.length,
      admins: [],
      commits: 0,
    };
    this.storage.transactionSync(() => {
      this.sql.exec("DELETE FROM restore_files");
      this.sql.exec("DELETE FROM restore_staging");
      files.forEach((f, i) =>
        this.sql.exec(
          "INSERT INTO restore_files VALUES(?,?,?,?)",
          i,
          f.kind,
          f.remoteId,
          f.name,
        ),
      );
    });
    await this.save(job);
    return job;
  }
  async step(id: string) {
    const job = await this.status();
    ensure(job && job.id === id, "복구 작업이 없습니다", 404);
    if (job.phase === "ready") return job;
    ensure(
      job.root === this.root,
      "저장 폴더가 변경되었습니다. 복구를 다시 시작하세요",
      409,
    );
    const files = this.sql
      .exec(
        "SELECT * FROM restore_files WHERE seq>=? ORDER BY seq LIMIT 4",
        job.processed,
      )
      .toArray();
    try {
      for (const file of files) {
        const raw = await (await this.drive.get(file.remoteId)).text(),
          record = await open<any>(raw, this.key);
        if (file.kind === "commits") {
          ensure(
            Array.isArray(record.changes),
            "원본 변경 기록 형식이 다릅니다",
          );
          for (const change of record.changes) {
            ensure(
              change.section in emptyState() &&
                change.section !== "users" &&
                change.id === change.value?.id,
              "원본 자료 ID가 다릅니다",
            );
            this.stage(
              "entity",
              change.section,
              change.id,
              await seal(change.value, this.key),
            );
          }
          if (record.operation) {
            const op = record.operation;
            ensure(
              typeof op.id === "string" &&
                typeof op.actor === "string" &&
                typeof op.digest === "string",
              "원본 작업 기록이 다릅니다",
            );
            this.stage("operation", "", op.id, raw, {
              actor: op.actor,
              digest: op.digest,
            });
          }
          job.commits++;
        } else if (file.kind === "accounts" || file.kind === "media") {
          ensure(
            typeof record.id === "string" && record.id,
            "복구 파일 ID가 없습니다",
          );
          if (file.kind === "accounts") {
            ensure(
              typeof record.passwordHash === "string" && record.passwordHash,
              "계정 암호 정보가 없습니다",
            );
            job.admins = job.admins.filter((id) => id !== record.id);
            if (isAdministrator(record)) job.admins.push(record.id);
          }
          this.stage(file.kind, "", record.id, raw);
        } else if (file.kind === "inquiries") {
          ensure(
            record.id && Number.isFinite(Date.parse(record.expiresAt)),
            "접수 원본 형식이 다릅니다",
          );
          this.stage("inquiries", "", record.id, raw, {
            expires: Date.parse(record.expiresAt),
            remoteId: file.remoteId,
          });
        } else if (file.kind === "access") {
          ensure(Array.isArray(record), "조회 기록 원본 형식이 다릅니다");
          for (const entry of record) {
            const log = await open<any>(entry.value, this.key);
            ensure(
              log.id === entry.id && Number.isFinite(Date.parse(log.at)),
              "조회 기록 ID가 다릅니다",
            );
            this.stage("access", "", log.id, entry.value, { at: log.at });
          }
        }
        job.processed = file.seq + 1;
        job.error = undefined;
        await this.save(job);
      }
      if (job.processed === job.total) {
        ensure(
          job.admins.length > 0,
          "원본에 활성 관리자가 없습니다. 현재 자료를 유지합니다",
          409,
        );
        job.phase = "ready";
        await this.save(job);
      }
      return job;
    } catch (e) {
      job.error = (e as Error).message;
      await this.save(job);
      throw e;
    }
  }
  async cancel(id: string) {
    const job = await this.status();
    ensure(job?.id === id, "복구 작업이 없습니다", 404);
    this.storage.transactionSync(() => {
      this.sql.exec("DELETE FROM restore_job");
      this.sql.exec("DELETE FROM restore_files");
      this.sql.exec("DELETE FROM restore_staging");
    });
  }
  async commit(id: string) {
    const job = await this.status();
    ensure(
      job && job.id === id && job.phase === "ready" && job.admins.length,
      "원본 확인을 먼저 완료하세요",
      409,
    );
    ensure(
      !this.sql.exec("SELECT id FROM operations WHERE done=0 LIMIT 1").toArray()
        .length,
      "대기 작업을 먼저 처리하세요",
      409,
    );
    // Copy staged ciphertext using SQLite, without materializing the whole archive in JS.
    this.storage.transactionSync(() => {
      this.sql.exec("DELETE FROM entities");
      this.sql.exec("DELETE FROM operations");
      this.sql.exec("DELETE FROM media");
      this.sql.exec("DELETE FROM inquiries");
      this.sql.exec("DELETE FROM quote_shares");
      this.sql.exec(
        "DELETE FROM secrets WHERE id LIKE 'user:%' OR id LIKE 'session:%' OR id='restore-required'",
      );
      this.sql.exec(
        "INSERT INTO entities SELECT section,id,value FROM restore_staging WHERE kind='entity'",
      );
      this.sql.exec(
        "INSERT INTO secrets SELECT 'user:'||id,value FROM restore_staging WHERE kind='accounts'",
      );
      this.sql.exec(
        "INSERT INTO media SELECT id,value FROM restore_staging WHERE kind='media'",
      );
      this.sql.exec(
        "INSERT INTO operations(id,actor,digest,value,done) SELECT id,json_extract(extra,'$.actor'),json_extract(extra,'$.digest'),value,1 FROM restore_staging WHERE kind='operation'",
      );
      this.sql.exec(
        "INSERT INTO inquiries SELECT id,value,json_extract(extra,'$.expires'),json_extract(extra,'$.remoteId') FROM restore_staging WHERE kind='inquiries'",
      );
      this.sql.exec(
        "INSERT OR REPLACE INTO access_log SELECT id,json_extract(extra,'$.at'),value,1 FROM restore_staging WHERE kind='access'",
      );
      this.sql.exec("DELETE FROM restore_job");
      this.sql.exec("DELETE FROM restore_files");
      this.sql.exec("DELETE FROM restore_staging");
    });
    return { ok: true, requiresLogin: true, commits: job.commits };
  }
}
