import { z } from "zod";
import { JSONParser, TokenType } from "@streamparser/json";
import { pbkdf2Async } from "@noble/hashes/pbkdf2.js";
import { sha256 } from "@noble/hashes/sha2.js";
import { DomainError, ensure, sha } from "../src/core/domain";
import {
  allowed,
  isAdministrator,
  type State,
  type User,
} from "../src/core/model";
import { intakeFields, type IntakeSelection } from "../src/core/intake";
import type { Drive } from "./drive";

export const DEFAULT_INTAKE_FOLDER = "동의서/초진설문지";
type RecordItem = Record<string, any>;
export type IntakeSettings = { folder: string; password: string };
const settingsSchema = z.object({
  folder: z
    .string()
    .trim()
    .min(1)
    .max(240)
    .refine(
      (s) =>
        s
          .split("/")
          .every(
            (p) =>
              p.trim() === p &&
              !!p &&
              p !== "." &&
              p !== ".." &&
              !/[\\\x00-\x1f]/.test(p),
          ),
      "OneDrive 폴더 경로를 확인하세요",
    ),
  password: z.string().min(1).max(128),
});
const isObject = (v: unknown): v is RecordItem =>
  !!v && typeof v === "object" && !Array.isArray(v);
const string = (v: unknown) => (typeof v === "string" ? v : "");
export const intakeRecordKey = (r: RecordItem) =>
  string(r.recordId) ||
  string(r.id) ||
  `${r.createdAt || ""}|${r.phone || ""}|${r.name || ""}|${r.iv || r.ct || "plain"}`;

export function parseIntakeRecords(value: unknown): RecordItem[] {
  const rows = Array.isArray(value)
    ? value
    : isObject(value)
      ? value.records
      : null;
  ensure(Array.isArray(rows), "초진설문지 파일 형식을 확인하세요");
  ensure(
    rows.length <= 100000,
    "초진설문지 기록이 너무 많습니다. 관리자에게 문의하세요",
  );
  const deleted = new Set(
    isObject(value) && Array.isArray(value.deletedKeys)
      ? value.deletedKeys
      : [],
  );
  const records = new Map<string, RecordItem>();
  for (const r of rows) {
    if (
      !isObject(r) ||
      deleted.has(intakeRecordKey(r)) ||
      r.deleted ||
      r.deletedAt
    )
      continue;
    const key = intakeRecordKey(r),
      old = records.get(key);
    if (
      !old ||
      string(r.updatedAt || r.createdAt) >=
        string(old.updatedAt || old.createdAt)
    )
      records.set(key, r);
  }
  return [...records.values()];
}

export async function decryptIntakeRecord(
  item: RecordItem,
  password: string,
): Promise<RecordItem> {
  if (item.plain === true) {
    ensure(isObject(item.data), "초진설문지 기록이 손상되었습니다");
    return item.data;
  }
  try {
    const b64 = (s: unknown) => {
      if (typeof s !== "string" || !/^[A-Za-z0-9+/]*={0,2}$/.test(s))
        throw new Error();
      return new Uint8Array(Buffer.from(s, "base64"));
    };
    const salt = b64(item.salt),
      iv = b64(item.iv),
      ct = b64(item.ct);
    if (salt.length !== 16 || iv.length !== 12 || ct.length < 16)
      throw new Error();
    // Tablet records require exactly 120000 rounds. Workers' native PBKDF2
    // rejects more than 100000 rounds, including node:crypto's implementation.
    // Use the compatible JS KDF; never reduce rounds or rewrite source records.
    let key: CryptoKey;
    let derived: Uint8Array | undefined;
    try {
      derived = await pbkdf2Async(
        sha256,
        new TextEncoder().encode(password),
        salt,
        {
          c: 120000,
          dkLen: 32,
        },
      );
      key = await crypto.subtle.importKey(
        "raw",
        new Uint8Array(derived),
        { name: "AES-GCM" },
        false,
        ["decrypt"],
      );
    } catch {
      throw new DomainError(
        "서버에서 초진설문지 암호화를 처리하지 못했습니다. 잠시 후 다시 시도해 주세요",
        503,
      );
    } finally {
      derived?.fill(0);
    }
    const plain = await crypto.subtle.decrypt({ name: "AES-GCM", iv }, key, ct);
    const record: unknown = JSON.parse(new TextDecoder().decode(plain));
    if (!isObject(record)) throw new Error();
    return record;
  } catch (error) {
    if (error instanceof DomainError) throw error;
    throw new DomainError(
      "초진설문지 관리자 비밀번호가 다르거나 기록이 손상되었습니다. 연동 설정을 확인하세요",
      400,
    );
  }
}

// Cache only searchable headers, never encrypted answers or decrypted clinical data.
export class IntakeIndex {
  private cached?: { key: string; expires: number; records: RecordItem[] };
  get(key: string) {
    return this.cached?.key === key && this.cached.expires > Date.now()
      ? this.cached.records
      : undefined;
  }
  put(key: string, records: RecordItem[]) {
    this.cached = { key, expires: Date.now() + 60_000, records };
  }
  clear() {
    this.cached = undefined;
  }
}
const intakeHash = (key: string) =>
  Buffer.from(sha256(new TextEncoder().encode(key))).toString("hex");
function intakeHeader(r: RecordItem): RecordItem {
  const result: RecordItem = {};
  for (const key of [
    "recordId",
    "id",
    "name",
    "phone",
    "createdAt",
    "updatedAt",
    "deleted",
    "deletedAt",
    "iv",
    "plain",
  ])
    if (r[key] !== undefined) result[key] = r[key];
  if (r.plain === true && isObject(r.data))
    result.data = { name: r.data.name, phone: r.data.phone };
  return result;
}

// The legacy archive is one JSON file, so it must be scanned on the server.
// keepStack:false releases each parsed sibling; only headers and the chosen
// encrypted record survive. No archive-sized JSON string/object is created.
export async function readIntakeStream(
  response: Response,
  selectedId?: string | Set<string>,
) {
  ensure(response.body, "초진설문지 파일을 읽을 수 없습니다", 400);
  const reader = response.body.getReader();
  const records = new Map<string, RecordItem>(),
    deleted = new Set<string>();
  let parser: JSONParser | undefined,
    prefix = "",
    depth = 0,
    rootKey = "";
  let rootValue = false,
    envelope = false,
    sawRecords = false;
  let received = 0,
    processed = 0,
    lastToken = 0,
    recordStart: number | undefined;
  let count = 0;
  const decoder = new TextDecoder("utf-8", { fatal: true });
  const maxEntry = 12 * 1024 * 1024;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      received += value.byteLength;
      ensure(
        received <= 512 * 1024 * 1024,
        "초진설문지 보관 파일을 분리해주세요 (512MB 초과)",
        413,
      );
      for (let at = 0; at < value.length; at += 64 * 1024) {
        const piece = value.subarray(at, at + 64 * 1024);
        processed += piece.length;
        let text = decoder.decode(piece, { stream: true });
        if (!parser) {
          prefix += text;
          const first = prefix.trimStart()[0];
          if (!first) {
            ensure(prefix.length < 65536, "초진설문지 파일 형식을 확인하세요");
            continue;
          }
          ensure(
            first === "{" || first === "[",
            "초진설문지 파일 형식을 확인하세요",
          );
          envelope = first === "{";
          sawRecords = !envelope;
          parser = new JSONParser({
            paths: envelope ? ["$.records.*", "$.deletedKeys.*"] : ["$.*"],
            keepStack: false,
            stringBufferSize: 64 * 1024,
          });
          parser.onToken = ({ token, value, offset }) => {
            lastToken = offset;
            if (envelope && depth === 1) {
              if (rootValue) {
                if (rootKey === "records") {
                  ensure(
                    token === TokenType.LEFT_BRACKET && !sawRecords,
                    "초진설문지 파일 형식을 확인하세요",
                  );
                  sawRecords = true;
                }
                rootValue = false;
              } else if (token === TokenType.STRING) rootKey = String(value);
              else if (token === TokenType.COLON) rootValue = true;
            }
            if (
              token === TokenType.LEFT_BRACE ||
              token === TokenType.LEFT_BRACKET
            ) {
              if (
                depth === (envelope ? 2 : 1) &&
                (!envelope || rootKey === "records")
              )
                recordStart = offset;
              depth++;
            } else if (
              token === TokenType.RIGHT_BRACE ||
              token === TokenType.RIGHT_BRACKET
            ) {
              depth--;
              if (depth === (envelope ? 2 : 1)) recordStart = undefined;
            }
          };
          parser.onValue = ({ value, stack }) => {
            if (envelope && stack[1]?.key === "deletedKeys") {
              if (typeof value === "string") deleted.add(value);
              ensure(
                deleted.size <= 100000,
                "초진설문지 삭제 기록이 너무 많습니다",
                413,
              );
              return;
            }
            ensure(
              ++count <= 100000,
              "초진설문지 기록이 너무 많습니다. 관리자에게 문의하세요",
              413,
            );
            if (!isObject(value)) return;
            const record = value as RecordItem;
            const key = intakeRecordKey(record),
              old = records.get(key);
            if (
              !old ||
              string(record.updatedAt || record.createdAt) >=
                string(old.updatedAt || old.createdAt)
            )
              records.set(
                key,
                (
                  typeof selectedId === "string"
                    ? selectedId === intakeHash(key)
                    : selectedId?.has(intakeHash(key))
                )
                  ? record
                  : intakeHeader(record),
              );
          };
          text = prefix;
          prefix = "";
        }
        parser.write(text);
        ensure(
          processed - (recordStart ?? lastToken) <= maxEntry,
          "설문지 한 건의 첨부 데이터가 너무 큽니다. 해당 설문지의 사진·서명 용량을 확인해주세요",
          413,
        );
      }
    }
    const rest = decoder.decode();
    if (rest) parser?.write(rest);
    ensure(parser && sawRecords, "초진설문지 파일 형식을 확인하세요");
    if (!parser.isEnded) parser.end();
  } catch (error) {
    if (error instanceof DomainError) throw error;
    if (
      (error as Error).name === "AbortError" ||
      (error as Error).name === "TimeoutError"
    )
      throw new DomainError(
        "초진설문지 조회가 지연되고 있습니다. 잠시 후 다시 검색해주세요",
        503,
      );
    throw new DomainError("초진설문지 파일을 읽을 수 없습니다", 400);
  } finally {
    await reader.cancel().catch(() => {});
  }
  return [...records]
    .filter(([key, r]) => !deleted.has(key) && !r.deleted && !r.deletedAt)
    .map(([, r]) => r);
}
async function loadRecords(
  drive: Drive,
  folder: string,
  index?: IntakeIndex,
  selectedId?: string | Set<string>,
) {
  const item = await drive.exists(`${folder}/data/records.json`);
  ensure(
    item && !item.folder,
    "초진설문지 자료가 없습니다. 같은 OneDrive 계정인지, 설문지가 동기화됐는지 확인하세요",
    404,
  );
  const cacheKey = item.eTag ? `${folder}|${item.id}|${item.eTag}` : "";
  if (!selectedId && cacheKey) {
    const cached = index?.get(cacheKey);
    if (cached) return cached;
  }
  const response = await drive.request(
    `/me/drive/items/${encodeURIComponent(item.id)}/content`,
    { signal: AbortSignal.timeout(60000) },
  );
  const records = await readIntakeStream(response, selectedId);
  if (!selectedId && cacheKey) index?.put(cacheKey, records);
  return records;
}

export interface IntakeContext {
  user: User;
  drive: Drive;
  index?: IntakeIndex;
  getSettings: () => Promise<IntakeSettings | undefined>;
  saveSettings: (s: IntakeSettings | null) => Promise<void>;
  patients: (
    fields: { name: string; phone: string; dob: string },
    originalId: string,
  ) => Promise<State["patients"]>;
  audit: (action: string, target?: string) => Promise<void>;
}
export async function handleIntake(
  req: Request,
  ctx: IntakeContext,
): Promise<unknown> {
  const url = new URL(req.url),
    path = url.pathname;
  const body = async () => {
    ensure(
      Number(req.headers.get("content-length") || 0) <= 4096,
      "요청이 너무 큽니다",
      413,
    );
    const value = await req.text();
    ensure(value.length <= 4096, "요청이 너무 큽니다", 413);
    try {
      return JSON.parse(value);
    } catch {
      throw new DomainError("요청 형식을 확인하세요", 400);
    }
  };
  const settings = await ctx.getSettings();
  if (path === "/api/intake/settings") {
    if (req.method === "GET")
      return {
        configured: !!settings,
        canConfigure: isAdministrator(ctx.user),
        folder: settings?.folder || DEFAULT_INTAKE_FOLDER,
      };
    ensure(req.method === "POST", "지원하지 않는 요청입니다", 405);
    ensure(
      isAdministrator(ctx.user),
      "연동 설정은 관리자만 변경할 수 있습니다",
      403,
    );
    const input = await body();
    ensure(isObject(input), "요청 형식을 확인하세요");
    if (input.enabled === false) {
      ctx.index?.clear();
      await ctx.saveSettings(null);
      await ctx.audit("intake.disconnect");
      return { ok: true };
    }
    const next = settingsSchema.parse(input);
    const records = await loadRecords(ctx.drive, next.folder);
    // Validate against an encrypted record without decrypting the entire archive.
    const sample = records.find((r) => r.plain !== true);
    if (sample) {
      const id = intakeHash(intakeRecordKey(sample));
      const full = (
        await loadRecords(ctx.drive, next.folder, undefined, id)
      ).find((r) => intakeHash(intakeRecordKey(r)) === id);
      ensure(full, "초진설문지가 변경되었습니다. 다시 설정해주세요", 409);
      await decryptIntakeRecord(full, next.password);
    }
    ctx.index?.clear();
    await ctx.saveSettings(next);
    await ctx.audit("intake.configure");
    return { ok: true };
  }
  ensure(allowed(ctx.user, "patient.edit"), "환자정보 권한이 필요합니다", 403);
  ensure(settings, "관리자가 초진설문지 연동을 먼저 설정해 주세요", 409);
  if (path === "/api/intake/search" && req.method === "GET") {
    const q = (url.searchParams.get("q") || "")
      .trim()
      .toLocaleLowerCase()
      .replace(/[\s-]/g, "");
    ensure(
      q.length >= 2 && q.length <= 80 && (!/^\d+$/.test(q) || q.length >= 4),
      "이름 2자 이상 또는 전화번호 4자리 이상을 입력하세요",
    );
    const also = (url.searchParams.get("name") || "")
      .trim()
      .toLocaleLowerCase()
      .replace(/\s/g, "");
    ensure(
      !also || (also.length >= 2 && also.length <= 80),
      "이름을 확인하세요",
    );
    const records = (await loadRecords(ctx.drive, settings.folder, ctx.index))
      .filter((r) => {
        const source = r.plain === true && isObject(r.data) ? r.data : r;
        return (
          string(source.name)
            .toLocaleLowerCase()
            .replace(/\s/g, "")
            .includes(q) ||
          (!!also &&
            string(source.name)
              .toLocaleLowerCase()
              .replace(/\s/g, "")
              .includes(also)) ||
          (/^\d+$/.test(q) &&
            string(source.phone).replace(/\D/g, "").includes(q))
        );
      })
      .sort((a, b) => string(b.createdAt).localeCompare(string(a.createdAt)));
    const requestedPage = Number(url.searchParams.get("page") || 0);
    const page = Math.min(
      Math.max(
        0,
        Number.isFinite(requestedPage) ? Math.floor(requestedPage) : 0,
      ),
      Math.max(0, Math.ceil(records.length / 30) - 1),
    );
    const rows = await Promise.all(
      records.slice(page * 30, page * 30 + 30).map(async (r) => {
        const source = r.plain === true && isObject(r.data) ? r.data : r;
        return {
          id: await sha(intakeRecordKey(r)),
          name: string(source.name).slice(0, 80),
          phone: string(source.phone).slice(0, 30),
          createdAt: string(r.createdAt).slice(0, 40),
        };
      }),
    );
    await ctx.audit("intake.search");
    return { rows, total: records.length, page, pageSize: 30 };
  }
  if (path === "/api/intake/select" && req.method === "POST") {
    const { id } = z
      .object({ id: z.string().regex(/^[a-f0-9]{64}$/) })
      .parse(await body());
    let selected: RecordItem | undefined;
    for (const r of await loadRecords(
      ctx.drive,
      settings.folder,
      undefined,
      id,
    )) {
      if ((await sha(intakeRecordKey(r))) === id) {
        selected = r;
        break;
      }
    }
    ensure(
      selected,
      "선택한 설문지가 변경되거나 삭제되었습니다. 다시 검색해 주세요",
      404,
    );
    const fields = intakeFields(
      await decryptIntakeRecord(selected, settings.password),
    );
    ensure(fields.name, "설문지의 환자 이름을 확인하세요");
    const patientId = "intake-" + id.slice(0, 32);
    const patients = await ctx.patients(fields, patientId);
    const original = patients.find((p) => p.id === patientId);
    const matches = patients
      .filter(
        (p) =>
          !p.mergedInto &&
          (p.id === patientId ||
            p.id === original?.mergedInto ||
            (!!fields.dob &&
              p.name.replace(/\s/g, "") === fields.name.replace(/\s/g, "") &&
              p.dob === fields.dob) ||
            (!!fields.phone && p.phone.replace(/\D/g, "") === fields.phone)),
      )
      .map(({ id, name, dob, phone, archived }) => ({
        id,
        name,
        dob,
        phone,
        archived,
      }));
    await ctx.audit("intake.select", id);
    return {
      patientId,
      alreadyImported: !!original,
      fields,
      matches,
    } satisfies IntakeSelection;
  }
  throw new DomainError("지원하지 않는 요청입니다", 404);
}

/** Bounded minimal-field extraction. Full clinical answers/signatures never enter the statistics store. */
export async function intakeMarketingBatch(
  drive: Drive,
  settings: IntakeSettings,
  index: IntakeIndex,
  offset: number,
  expectedTag: string,
) {
  const item = await drive.exists(`${settings.folder}/data/records.json`);
  ensure(item && !item.folder, "초진설문지 자료가 없습니다", 404);
  const tag = String(item.eTag || item.id);
  if (expectedTag && tag !== expectedTag)
    throw new DomainError(
      "설문지가 변경되어 다음 갱신에서 처음부터 확인합니다",
      409,
    );
  const headers = await loadRecords(drive, settings.folder, index);
  const entries = headers
    .map((r) => ({
      id: intakeHash(intakeRecordKey(r)),
      at: string(r.createdAt),
    }))
    .sort((a, b) => a.id.localeCompare(b.id));
  const selected = entries.slice(offset, offset + 12),
    ids = new Set(selected.map((r) => r.id));
  const full = ids.size
    ? await loadRecords(drive, settings.folder, undefined, ids)
    : [];
  const rows = [];
  for (const r of full) {
    const id = intakeHash(intakeRecordKey(r));
    if (!ids.has(id)) continue;
    const fields = intakeFields(
      await decryptIntakeRecord(r, settings.password),
    );
    rows.push({ id, fields, at: selected.find((x) => x.id === id)!.at });
  }
  ensure(
    rows.length === selected.length,
    "설문지가 변경되었습니다. 다시 갱신해주세요",
    409,
  );
  const after = await drive.exists(`${settings.folder}/data/records.json`);
  ensure(
    String(after?.eTag || after?.id) === tag,
    "설문지가 변경되었습니다. 다시 갱신해주세요",
    409,
  );
  return {
    rows,
    tag,
    total: entries.length,
    cursor: offset + selected.length,
    done: offset + selected.length >= entries.length,
  };
}
