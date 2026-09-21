import { seal, open } from "./crypto";
import type { Drive } from "./drive";
import type { Inquiry } from "../src/core/discovery";
export class Inquiries {
  constructor(
    private sql: SqlStorage,
    private key: string,
    private drive: Drive | undefined,
    private root: string,
  ) {}
  async get(id: string) {
    const row = this.sql
      .exec<{ value: string }>("SELECT value FROM inquiries WHERE id=?", id)
      .toArray()[0];
    return row ? open<Inquiry>(row.value, this.key) : undefined;
  }
  async save(record: Inquiry) {
    const value = await seal(record, this.key);
    this.sql.exec(
      "INSERT OR REPLACE INTO inquiries VALUES(?,?,?,?)",
      record.id,
      value,
      Date.parse(record.expiresAt),
      "",
    );
    const remote = this.drive
      ? await this.drive.put(
          `${this.root}/_codimate/inquiries/${record.id}.enc`,
          value,
        )
      : undefined;
    this.sql.exec(
      "INSERT OR REPLACE INTO inquiries VALUES(?,?,?,?)",
      record.id,
      value,
      Date.parse(record.expiresAt),
      remote?.id || "",
    );
  }
  async complete(id: string, patientId: string, consultationId: string) {
    const record = await this.get(id);
    if (!record) return;
    await this.save({
      ...record,
      status: "converted",
      patientId,
      consultationId,
      person: { name: "", phone: "", sex: "U", dob: "", address: "" },
      selections: [],
      concerns: [],
      answers: [],
    });
  }
  async remove(id: string) {
    const row = this.sql
      .exec<{ remoteId: string }>(
        "SELECT remoteId FROM inquiries WHERE id=?",
        id,
      )
      .toArray()[0];
    if (row && this.drive) {
      const remoteId =
        row.remoteId ||
        (await this.drive.exists(`${this.root}/_codimate/inquiries/${id}.enc`))
          ?.id;
      if (remoteId) await this.drive.remove(remoteId);
    }
    this.sql.exec("DELETE FROM inquiries WHERE id=?", id);
  }
  async purge(now = Date.now()) {
    for (const row of this.sql
      .exec<{ id: string }>("SELECT id FROM inquiries WHERE expires<=?", now)
      .toArray())
      await this.remove(row.id);
  }
  async flush() {
    if (!this.drive) return;
    for (const row of this.sql
      .exec<{ value: string }>("SELECT value FROM inquiries WHERE remoteId=''")
      .toArray())
      await this.save(await open<Inquiry>(row.value, this.key));
  }
  async list() {
    await this.purge();
    await this.flush();
    return (
      await Promise.all(
        this.sql
          .exec<{ value: string }>(
            "SELECT value FROM inquiries ORDER BY rowid DESC",
          )
          .toArray()
          .map((r) => open<Inquiry>(r.value, this.key)),
      )
    ).filter((record) => record.status === "new");
  }
  async recover(id: string) {
    if (!this.drive) return;
    const file = await this.drive.exists(
      `${this.root}/_codimate/inquiries/${id}.enc`,
    );
    if (!file) return;
    const value = await (await this.drive.get(file.id)).text();
    const record = await open<Inquiry>(value, this.key);
    if (record.id !== id) throw new Error("접수 기록 ID를 확인하세요");
    this.sql.exec(
      "INSERT OR REPLACE INTO inquiries VALUES(?,?,?,?)",
      id,
      value,
      Date.parse(record.expiresAt),
      file.id,
    );
    return record;
  }
}
