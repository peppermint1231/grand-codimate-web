import { z } from "zod";
import { DomainError, ensure, sha } from "../src/core/domain";
import { isAdministrator, type State, type User } from "../src/core/model";
import { intakeFields, type IntakeSelection } from "../src/core/intake";
import type { Drive } from "./drive";

export const DEFAULT_INTAKE_FOLDER = "동의서/초진설문지";
type RecordItem = Record<string, any>;
type Settings = { folder: string; password: string };
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
    const base = await crypto.subtle.importKey(
      "raw",
      new TextEncoder().encode(password),
      "PBKDF2",
      false,
      ["deriveKey"],
    );
    const key = await crypto.subtle.deriveKey(
      { name: "PBKDF2", salt, iterations: 120000, hash: "SHA-256" },
      base,
      { name: "AES-GCM", length: 256 },
      false,
      ["decrypt"],
    );
    const plain = await crypto.subtle.decrypt({ name: "AES-GCM", iv }, key, ct);
    const record: unknown = JSON.parse(new TextDecoder().decode(plain));
    if (!isObject(record)) throw new Error();
    return record;
  } catch {
    throw new DomainError(
      "초진설문지 관리자 비밀번호가 다르거나 기록이 손상되었습니다. 연동 설정을 확인하세요",
      400,
    );
  }
}

async function loadRecords(drive: Drive, folder: string) {
  const path = `${folder}/data/records.json`;
  const item = await drive.exists(path);
  ensure(
    item && !item.folder,
    "초진설문지 자료가 없습니다. 같은 OneDrive 계정인지, 설문지가 동기화됐는지 확인하세요",
    404,
  );
  const limit = 32 * 1024 * 1024;
  ensure(
    item.size <= limit,
    "초진설문지 파일이 너무 큽니다. 관리자에게 문의하세요",
    413,
  );
  const response = await drive.request(
    `/me/drive/items/${encodeURIComponent(item.id)}/content`,
    { signal: AbortSignal.timeout(20000) },
  );
  const reader = response.body!.getReader();
  let size = 0,
    text = "";
  const decoder = new TextDecoder();
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      ensure(size <= limit, "초진설문지 파일이 너무 큽니다", 413);
      text += decoder.decode(value, { stream: true });
    }
    text += decoder.decode();
  } finally {
    await reader.cancel();
  }
  let payload: unknown;
  try {
    payload = JSON.parse(text);
  } catch {
    throw new DomainError("초진설문지 파일을 읽을 수 없습니다", 400);
  }
  return parseIntakeRecords(payload);
}

export interface IntakeContext {
  user: User;
  drive: Drive;
  getSettings: () => Promise<Settings | undefined>;
  saveSettings: (s: Settings | null) => Promise<void>;
  patients: () => Promise<State["patients"]>;
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
      await ctx.saveSettings(null);
      await ctx.audit("intake.disconnect");
      return { ok: true };
    }
    const next = settingsSchema.parse(input);
    const records = await loadRecords(ctx.drive, next.folder);
    // Validate against an encrypted record without decrypting the entire archive.
    const sample = records.find((r) => r.plain !== true);
    if (sample) await decryptIntakeRecord(sample, next.password);
    await ctx.saveSettings(next);
    await ctx.audit("intake.configure");
    return { ok: true };
  }
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
    const records = (await loadRecords(ctx.drive, settings.folder))
      .filter((r) => {
        const source = r.plain === true && isObject(r.data) ? r.data : r;
        return (
          string(source.name)
            .toLocaleLowerCase()
            .replace(/\s/g, "")
            .includes(q) ||
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
    for (const r of await loadRecords(ctx.drive, settings.folder)) {
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
    const patients = await ctx.patients();
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
