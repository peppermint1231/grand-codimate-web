import { open, seal } from "./crypto";
import type { Drive } from "./drive";
import {
  purgeChange,
  type PatientPurgePlan,
} from "../src/core/patientDeletion";
import { relocateStoragePath, patientFolder } from "../src/core/storagePaths";
export const patientPurgeSchema =
  "CREATE TABLE IF NOT EXISTS patient_purge(id TEXT PRIMARY KEY,value TEXT NOT NULL);CREATE TABLE IF NOT EXISTS erased_media(id TEXT PRIMARY KEY);CREATE TABLE IF NOT EXISTS patient_purge_media(jobId TEXT,seq INTEGER,id TEXT,PRIMARY KEY(jobId,seq));CREATE INDEX IF NOT EXISTS patient_purge_media_id ON patient_purge_media(jobId,id);CREATE TABLE IF NOT EXISTS patient_purge_folders(jobId TEXT,id TEXT,value TEXT NOT NULL,PRIMARY KEY(jobId,id));";
type Job = {
  id: string;
  plan: PatientPurgePlan;
  root: string;
  driveId?: string;
  phase: "operations" | "media" | "snapshots" | "inquiries" | "done";
  cursor: number;
  maxOperation: number;
  completed: number;
  error?: string;
  pending?: { rowid: number; id: string; path: string; value: string };
};
export class PatientPurgeJobs {
  constructor(
    private sql: any,
    private key: string,
    private drive: Drive | undefined,
  ) {}
  async active() {
    const row = this.sql
      .exec("SELECT value FROM patient_purge ORDER BY rowid DESC LIMIT 1")
      .toArray()[0];
    return row ? open<Job>(row.value, this.key) : null;
  }
  private async save(job: Job) {
    this.sql.exec(
      "INSERT OR REPLACE INTO patient_purge VALUES(?,?)",
      job.id,
      await seal(job, this.key),
    );
  }
  async enqueue(id: string, plan: PatientPurgePlan, root: string) {
    if (
      this.sql.exec("SELECT id FROM patient_purge WHERE id=?", id).toArray()
        .length
    )
      return;
    const driveId = await this.drive?.identity();
    this.sql.exec(
      "INSERT OR IGNORE INTO patient_purge_media SELECT ?,ROW_NUMBER() OVER (ORDER BY id),id FROM (SELECT id FROM media UNION SELECT substr(id,15) AS id FROM secrets WHERE id LIKE 'media-session:%')",
      id,
    );
    await this.save({
      id,
      plan,
      root,
      driveId,
      phase: "operations",
      cursor: 0,
      completed: 0,
      maxOperation:
        this.sql.exec("SELECT MAX(rowid) AS n FROM operations").toArray()[0]
          ?.n || 0,
    });
  }
  public(job: Job | null) {
    return job
      ? {
          id: job.id,
          phase: job.phase,
          completed: job.completed,
          error: job.error,
          patientCount: job.plan.patientIds.length,
        }
      : null;
  }
  async blocksMedia(
    id: string,
    metadata: { consultationId: string; mime: string },
  ) {
    if (
      this.sql.exec("SELECT id FROM erased_media WHERE id=?", id).toArray()
        .length
    )
      return true;
    const j = await this.active();
    if (
      !j ||
      j.phase === "done" ||
      j.plan.protectedMediaIds.includes(id) ||
      !j.plan.consultationIds.includes(metadata.consultationId)
    )
      return false;
    const row = this.sql
      .exec(
        "SELECT id FROM patient_purge_media WHERE jobId=? AND id=?",
        j.id,
        id,
      )
      .toArray()[0];
    return (
      !!row &&
      (j.plan.scope.consultations ||
        (j.plan.scope.documents && !!j.plan.documentMediaIds?.includes(id)) ||
        (metadata.mime.startsWith("image/")
          ? j.plan.scope.photos
          : j.plan.scope.documents))
    );
  }
  private async erasePath(path: string) {
    if (!this.drive) return;
    const file = await this.drive.exists(path);
    if (file) await this.drive.permanentRemove(file.id);
  }
  private async replace(
    path: string,
    value: string,
    mime = "application/json",
  ) {
    if (!this.drive) return;
    // Destroy the old item's version history before recreating its sanitized contents.
    await this.erasePath(path);
    await this.drive.put(path, value, mime);
  }
  private async pending(job: Job) {
    const p = job.pending;
    if (!p) return;
    await this.replace(p.path, p.value);
    this.sql.exec("UPDATE operations SET value=? WHERE id=?", p.value, p.id);
    job.cursor = p.rowid;
    job.completed++;
    delete job.pending;
    await this.save(job);
  }
  async step() {
    const job = await this.active();
    if (!job || job.phase === "done") return this.public(job);
    delete job.error;
    try {
      await this.pending(job);
      if (job.phase === "operations") {
        const rows = this.sql
          .exec(
            "SELECT rowid,id,value FROM operations WHERE rowid>? AND rowid<=? ORDER BY rowid LIMIT 2",
            job.cursor,
            job.maxOperation,
          )
          .toArray();
        for (const row of rows) {
          const op = await open<any>(row.value, this.key);
          // Full erasure removes live patient rows before this history scan.
          // Retain only encrypted folder identities until the job completes,
          // so earlier categories/merged-source folders survive a restart.
          for (const c of op.changes) {
            if (c.section !== "patients" || !c.value) continue;
            const { id, number, name, sex, storageName } = c.value;
            this.sql.exec(
              "INSERT OR REPLACE INTO patient_purge_folders VALUES(?,?,?)",
              job.id,
              c.id,
              await seal({ id, number, name, sex, storageName }, this.key),
            );
          }
          for (const c of op.changes) {
            if (
              c.section !== "consultations" ||
              !c.value ||
              !job.plan.consultationIds.includes(c.id)
            )
              continue;
            // Merging a patient changes the current folder, but earlier mirrors
            // in the source patient's stable folder still belong to this consultation.
            const saved = this.sql
              .exec(
                "SELECT value FROM entities WHERE section='patients' AND id=?",
                c.value.patientId,
              )
              .toArray()[0];
            const historical = this.sql
              .exec(
                "SELECT value FROM patient_purge_folders WHERE jobId=? AND id=?",
                job.id,
                c.value.patientId,
              )
              .toArray()[0];
            for (const record of [saved, historical]) {
              if (!record) continue;
              const patient = await open<any>(record.value, this.key);
              const path = `${patientFolder(patient, c.value.category, job.root)}/상담_${c.id}.json`;
              if (!job.plan.snapshots.some((s) => s.path === path))
                job.plan.snapshots.push({ path, consultationId: c.id });
            }
          }

          job.plan.documentMediaIds = [
            ...new Set([
              ...(job.plan.documentMediaIds || []),
              ...op.changes.flatMap((c: any) =>
                c.section === "consultations" &&
                job.plan.consultationIds.includes(c.id)
                  ? c.value?.documents || []
                  : [],
              ),
            ]),
          ];
          const changes = op.changes.map((c: any) => purgeChange(c, job.plan));
          const next = { ...op, changes };
          // Old cleanup descriptors can contain full consultation snapshots.
          // Completed/persisted jobs live separately and must not retain erased data here.
          if (
            op.purge?.patientIds?.some((id: string) =>
              job.plan.patientIds.includes(id),
            )
          )
            delete next.purge;
          if (JSON.stringify(next) !== JSON.stringify(op)) {
            const value = await seal(next, this.key);
            job.pending = {
              rowid: row.rowid,
              id: row.id,
              path: relocateStoragePath(op.path, job.root),
              value,
            };
            await this.save(job);
            await this.pending(job);
          } else {
            job.cursor = row.rowid;
            job.completed++;
            await this.save(job);
          }
        }
        if (!rows.length) {
          job.phase = "media";
          job.cursor = 0;
        }
      } else if (job.phase === "media") {
        const rows = this.sql
          .exec(
            "SELECT s.seq AS rowid,s.id,COALESCE(m.value,u.value) AS value,u.value AS session FROM patient_purge_media s LEFT JOIN media m ON m.id=s.id LEFT JOIN secrets u ON u.id='media-session:'||s.id WHERE s.jobId=? AND s.seq>? ORDER BY s.seq LIMIT 10",
            job.id,
            job.cursor,
          )
          .toArray();
        for (const row of rows) {
          const m = row.value ? await open<any>(row.value, this.key) : null,
            p = job.plan;
          if (
            m &&
            p.consultationIds.includes(m.consultationId) &&
            !p.protectedMediaIds.includes(row.id) &&
            (p.scope.consultations ||
              (p.scope.documents && !!p.documentMediaIds?.includes(row.id)) ||
              (String(m.mime).startsWith("image/")
                ? p.scope.photos
                : p.scope.documents))
          ) {
            this.sql.exec(
              "INSERT OR IGNORE INTO erased_media VALUES(?)",
              row.id,
            );
            if (row.session && this.drive) {
              const session = await open<any>(row.session, this.key);
              if (session.uploadUrl)
                await this.drive.cancelUpload(session.uploadUrl);
            }
            if (m.remoteId && this.drive)
              await this.drive.permanentRemove(m.remoteId);
            else if (m.path)
              await this.erasePath(relocateStoragePath(m.path, job.root));
            await this.erasePath(`${job.root}/_codimate/media/${row.id}.enc`);
            this.sql.exec("DELETE FROM media WHERE id=?", row.id);
            this.sql.exec(
              "DELETE FROM secrets WHERE id LIKE ? OR id=?",
              `file:${row.id}:%`,
              `media-session:${row.id}`,
            );
          }
          job.cursor = row.rowid;
          job.completed++;
          await this.save(job);
        }
        if (!rows.length) {
          job.phase = "snapshots";
          job.cursor = 0;
        }
      } else if (job.phase === "snapshots") {
        const entry = job.plan.snapshots[job.cursor];
        if (entry) {
          // Later staff edits must survive a long-running cleanup.
          if (entry.consultationId) {
            const row = this.sql
              .exec(
                "SELECT value FROM entities WHERE section='consultations' AND id=?",
                entry.consultationId,
              )
              .toArray()[0];
            entry.content = row
              ? JSON.stringify({
                  schemaVersion: 1,
                  consultation: await open(row.value, this.key),
                })
              : undefined;
          }
          if (entry.content === undefined) await this.erasePath(entry.path);
          else await this.replace(entry.path, entry.content);
          job.cursor++;
          job.completed++;
        } else {
          job.phase = "inquiries";
          job.cursor = 0;
        }
      } else if (job.phase === "inquiries") {
        const id = job.plan.inquiryIds[job.cursor];
        if (id) {
          const row = this.sql
            .exec("SELECT remoteId FROM inquiries WHERE id=?", id)
            .toArray()[0];
          if (row?.remoteId && this.drive)
            await this.drive.permanentRemove(row.remoteId);
          await this.erasePath(`${job.root}/_codimate/inquiries/${id}.enc`);
          this.sql.exec("DELETE FROM inquiries WHERE id=?", id);
          job.cursor++;
          job.completed++;
        } else {
          this.sql.exec(
            "DELETE FROM patient_purge_media WHERE jobId=?",
            job.id,
          );
          this.sql.exec(
            "DELETE FROM patient_purge_folders WHERE jobId=?",
            job.id,
          );
          job.phase = "done";
          job.plan = { ...job.plan, snapshots: [], protectedMediaIds: [] };
        }
      }
    } catch (error) {
      job.error =
        error instanceof Error ? error.message : "자료 정리에 실패했습니다";
    }
    await this.save(job);
    return this.public(job);
  }
}
