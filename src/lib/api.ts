import {
  currentProgress,
  reportTransfer,
  transferPercent,
  type ProgressHandle,
  type TransferProgress,
} from "./operationProgress";
import { uploadRequest } from "./uploadRequest";
import { jpegCaptureDate } from "../core/photoDate";
import { openDB } from "idb";
import { native, NativeClinic } from "./native";
import type { Command, State, User, Photo } from "../core/model";
const base =
  import.meta.env.VITE_API_BASE ||
  (native ? localStorage.getItem("codimate-server") || "" : "");
export const needsServer = native && !base;
export function configureServer(value: string) {
  const u = new URL(value);
  if (
    u.protocol !== "https:" ||
    u.pathname !== "/" ||
    u.search ||
    u.hash ||
    u.username ||
    u.password
  )
    throw new Error("병원 서버의 HTTPS 주소를 입력하세요.");
  localStorage.setItem("codimate-server", u.origin);
  location.reload();
}
let token = "";
let sessionEpoch = 0;
export const setToken = (s: string) => {
  if (token !== s) {
    sessionEpoch++;
    blobs.clear();
    loading.clear();
  }
  token = s;
};
export async function rememberLogin(value: string) {
  if (native)
    localStorage.setItem(
      "codimate-login",
      (await NativeClinic.seal({ value })).value,
    );
}
export async function restoreLogin() {
  if (!native) return; // Web sessions stay in the HttpOnly server cookie.
  const value = localStorage.getItem("codimate-login");
  if (value) setToken((await NativeClinic.open({ value })).value);
}
export function forgetLogin() {
  localStorage.removeItem("codimate-login");
  setToken("");
}
export async function api<T = any>(
  path: string,
  init: RequestInit = {},
  tracking: {
    operation?: ProgressHandle | null;
    upload?: (p: TransferProgress) => void;
  } = {},
): Promise<T> {
  const operation =
    tracking.operation === undefined ? currentProgress() : tracking.operation;
  const request: RequestInit = {
    ...init,
    credentials: "include",
    headers: {
      ...(init.body && typeof init.body === "string"
        ? { "Content-Type": "application/json" }
        : {}),
      ...(token ? { Authorization: "Bearer " + token } : {}),
      ...Object.fromEntries(new Headers(init.headers)),
    },
  };
  if (
    (tracking.upload || operation) &&
    init.method === "POST" &&
    (typeof init.body === "string" || init.body instanceof Blob)
  )
    return uploadRequest<T>(
      base + "/api" + path,
      { ...request, body: init.body },
      (progress) => {
        if (tracking.upload) tracking.upload(progress);
        else reportTransfer(operation || undefined, progress);
      },
    );
  const r = await fetch(base + "/api" + path, request);
  const d = (await r.json()) as any;
  if (!r.ok)
    throw Object.assign(new Error(d.error || "요청 실패"), {
      status: r.status,
    });
  return d;
}
export const command = async (c: Command) => {
  const operation = currentProgress();
  operation?.update({
    title: "저장 준비 중입니다",
    detail: "사진 업로드와 변경 내용을 확인하고 있습니다.",
  });
  const uploads: {
    id: string;
    size: number;
    name: string;
    consultationId: string;
    capturedAt?: string;
    active?: StagedMedia;
    progress: TransferProgress;
    done: boolean;
  }[] = [];
  const ids = new Set(
    ((c.payload.photos || []) as { mediaId: string }[]).map((p) => p.mediaId),
  );
  for (const id of ids) {
    const active = stagedMedia.get(id);
    if (active) {
      uploads.push({
        id,
        size: active.file.size,
        name: active.name,
        consultationId: active.consultationId,
        capturedAt: active.capturedAt,
        active,
        progress: active.progress || {
          loaded: 0,
          total: active.file.size,
          waiting: false,
        },
        done: false,
      });
      continue;
    }
    const pending = await vaultRead<{
      name: string;
      consultationId: string;
      data: string;
      pending: boolean;
      capturedAt?: string;
    }>("media:" + id);
    if (pending?.pending) {
      const encodedLength = pending.data.length - pending.data.indexOf(",") - 1;
      const size =
        Math.floor((encodedLength * 3) / 4) -
        (pending.data.endsWith("==") ? 2 : pending.data.endsWith("=") ? 1 : 0);
      uploads.push({
        id,
        size,
        name: pending.name,
        consultationId: pending.consultationId,
        capturedAt: pending.capturedAt,
        progress: { loaded: 0, total: size, waiting: false },
        done: false,
      });
    }
  }
  const report = () => {
    const total = uploads.reduce((sum, u) => sum + u.size, 0);
    const loaded = uploads.reduce(
      (sum, u) => sum + (u.done ? u.size : Math.min(u.size, u.progress.loaded)),
      0,
    );
    const complete = uploads.filter((u) => u.done).length;
    operation?.update({
      title:
        loaded >= total
          ? "서버에 사진 저장 중입니다"
          : "사진 업로드 진행 중입니다",
      detail: `사진 ${complete} / ${uploads.length}개 저장 확인 · ${(loaded / 1048576).toFixed(1)} / ${(total / 1048576).toFixed(1)} MB 전송${loaded >= total ? " · 서버 저장 확인을 기다리고 있습니다." : ""}`,
      percent: uploads.some((u) => !u.done && u.progress.total === undefined)
        ? undefined
        : transferPercent({ loaded, total, waiting: false }),
      metric: "전체 사진 전송률",
    });
  };
  const unsubscribe = uploads.flatMap((u) =>
    u.active
      ? [
          watchMedia(u.active, (p) => {
            u.progress = p;
            report();
          }),
        ]
      : [],
  );
  try {
    if (uploads.length) report();
    for (const item of uploads) {
      if (item.active) await flushStaged(item.id);
      else {
        // Decode one offline file at a time; do not retain every full-size image.
        const pending = await vaultRead<any>("media:" + item.id);
        if (!pending?.pending) {
          item.done = true;
          report();
          continue;
        }
        const file = await (await fetch(pending.data)).blob();
        await postMedia(
          file,
          item.name,
          item.consultationId,
          item.id,
          item.capturedAt,
          (p) => {
            item.progress = p;
            report();
          },
        );
        await vaultWrite("media:" + item.id, {
          ...pending,
          pending: false,
        });
      }
      item.done = true;
      report();
    }
  } finally {
    unsubscribe.forEach((fn) => fn());
  }
  operation?.update({
    title: "변경 내용을 저장 중입니다",
    detail: "서버에 변경 내용을 기록하고 있습니다.",
  });
  return api("/commands", { method: "POST", body: JSON.stringify(c) });
};
export const makeCommand = (
  type: string,
  payload: Record<string, unknown>,
  entityId?: string,
  baseRev?: number,
): Command => ({ id: crypto.randomUUID(), type, payload, entityId, baseRev });
export async function upload(file: Blob, name: string, consultationId: string) {
  const id = crypto.randomUUID();
  if (vaultEnabled())
    await vaultWrite("media:" + id, {
      name,
      consultationId,
      data: await blobData(file),
      pending: true,
    });
  try {
    const result = await postMedia(file, name, consultationId, id);
    if (vaultEnabled()) {
      const saved = await vaultRead<any>("media:" + id);
      await vaultWrite("media:" + id, { ...saved, pending: false });
    }
    return result;
  } catch (e: any) {
    if (vaultEnabled() && (!e.status || e.status >= 500)) return { id };
    throw e;
  }
}
function blobData(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}
async function postMedia(
  file: Blob,
  name: string,
  consultationId: string,
  id: string,
  capturedAt?: string,
  onProgress?: (p: TransferProgress) => void,
) {
  return api<{ id: string }>(
    "/media",
    {
      method: "POST",
      body: file,
      headers: {
        "Content-Type": file.type,
        "X-File-Name": encodeURIComponent(name),
        "X-Consultation-Id": consultationId,
        "X-Upload-Id": id,
        ...(capturedAt ? { "X-Captured-At": capturedAt } : {}),
      },
    },
    onProgress ? { operation: null, upload: onProgress } : {},
  );
}
// Blob cache is scoped to the signed-in session; callers own their object URLs.
const blobs = new Map<string, Blob>();
const loading = new Map<string, Promise<Blob>>();
function remember(id: string, blob: Blob) {
  blobs.delete(id);
  blobs.set(id, blob);
  let bytes = [...blobs.values()].reduce((sum, b) => sum + b.size, 0);
  for (const [key, value] of blobs) {
    if (bytes < 96_000_000) break;
    if (stagedMedia.has(key)) continue;
    blobs.delete(key);
    bytes -= value.size;
  }
}
export async function mediaUrl(id: string) {
  const local = stagedMedia.get(id)?.file || blobs.get(id);
  if (local) return URL.createObjectURL(local);
  let pending = loading.get(id);
  if (!pending) {
    const session = sessionEpoch;
    pending = (async () => {
      const cached = await vaultRead<{ data: string }>("media:" + id);
      let blob: Blob;
      if (cached?.data) blob = await (await fetch(cached.data)).blob();
      else {
        const r = await fetch(base + "/api/media/" + id, {
          credentials: "include",
          headers: token ? { Authorization: "Bearer " + token } : {},
        });
        if (!r.ok) throw new Error("사진을 불러오지 못했습니다");
        blob = await r.blob();
        if (session === sessionEpoch && vaultEnabled())
          await vaultWrite("media:" + id, {
            data: await blobData(blob),
            pending: false,
          });
      }
      if (session === sessionEpoch) remember(id, blob);
      return blob;
    })();
    loading.set(id, pending);
  }
  try {
    return URL.createObjectURL(await pending);
  } finally {
    loading.delete(id);
  }
}
type StagedMedia = {
  file: Blob;
  name: string;
  consultationId: string;
  capturedAt: string;
  stored: Promise<void>;
  request?: Promise<void>;
  error?: string;
  progress?: TransferProgress;
  observers?: Set<(p: TransferProgress) => void>;
};
const stagedMedia = new Map<string, StagedMedia>();
export const hasPendingUploads = () => stagedMedia.size > 0;
const listeners = new Set<() => void>();
export const watchUploads = (fn: () => void) => {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
};
const notifyUploads = () => listeners.forEach((fn) => fn());
export const uploadState = (id: string) =>
  stagedMedia.get(id)?.error ||
  (stagedMedia.has(id) ? "업로드 중 · 저장 시 완료 확인" : "");
function watchMedia(item: StagedMedia, fn: (p: TransferProgress) => void) {
  (item.observers ||= new Set()).add(fn);
  return () => {
    item.observers?.delete(fn);
  };
}
async function flushStaged(id: string) {
  const item = stagedMedia.get(id);
  if (!item) return;
  if (!item.request) {
    item.error = undefined;
    const epoch = sessionEpoch;
    item.request = (async () => {
      await item.stored;
      if (epoch !== sessionEpoch)
        throw Object.assign(new Error("로그인 세션이 변경되었습니다"), {
          status: 401,
        });
      await postMedia(
        item.file,
        item.name,
        item.consultationId,
        id,
        item.capturedAt,
        (progress) => {
          item.progress = progress;
          item.observers?.forEach((fn) => fn(progress));
        },
      );
      if (epoch !== sessionEpoch) return;
      if (vaultEnabled()) {
        const saved = await vaultRead<any>("media:" + id);
        if (saved)
          await vaultWrite("media:" + id, { ...saved, pending: false });
      }
      remember(id, item.file);
      stagedMedia.delete(id);
      notifyUploads();
    })().catch((error) => {
      item.error = "업로드 대기 · 상담 저장 시 재시도";
      item.request = undefined;
      notifyUploads();
      throw error;
    });
  }
  await item.request;
}
export async function stagePhoto(
  file: File,
  consultationId: string,
  authorId: string,
): Promise<Photo> {
  if (!["image/jpeg", "image/png", "image/webp"].includes(file.type))
    throw new Error("JPG·PNG·WebP 사진을 선택하세요.");
  const bitmap = await createImageBitmap(file);
  try {
    let blob: Blob = file;
    const canvas = document.createElement("canvas");
    if (file.size > 7_800_000 || file.type === "image/webp") {
      const scale = Math.min(1, 3200 / Math.max(bitmap.width, bitmap.height));
      canvas.width = Math.round(bitmap.width * scale);
      canvas.height = Math.round(bitmap.height * scale);
      canvas
        .getContext("2d")!
        .drawImage(bitmap, 0, 0, canvas.width, canvas.height);
      blob = await new Promise<Blob>((resolve, reject) =>
        canvas.toBlob(
          (b) => (b ? resolve(b) : reject(new Error("사진 변환 실패"))),
          "image/jpeg",
          0.92,
        ),
      );
    }
    if (blob.size > 8_000_000)
      throw new Error("사진 용량을 8MB 이하로 줄여주세요.");
    const scale = Math.min(1, 240 / Math.max(bitmap.width, bitmap.height));
    canvas.width = Math.max(1, Math.round(bitmap.width * scale));
    canvas.height = Math.max(1, Math.round(bitmap.height * scale));
    canvas
      .getContext("2d")!
      .drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    const thumbnail = canvas.toDataURL("image/jpeg", 0.7);
    const id = crypto.randomUUID(),
      capturedAt =
        jpegCaptureDate(await file.slice(0, 262144).arrayBuffer()) ||
        new Date(file.lastModified || Date.now()).toISOString();
    remember(id, blob);
    const item: StagedMedia = {
      file: blob,
      name: file.name,
      consultationId,
      capturedAt,
      stored: Promise.resolve(),
    };
    item.stored = (async () => {
      if (vaultEnabled())
        await vaultWrite("media:" + id, {
          name: file.name,
          consultationId,
          capturedAt,
          data: await blobData(blob),
          pending: true,
        });
    })();
    stagedMedia.set(id, item);
    notifyUploads();
    void flushStaged(id).catch(() => {});
    return {
      id: crypto.randomUUID(),
      mediaId: id,
      name: file.name,
      capturedAt,
      thumbnail,
      selected: true,
      rotation: 0,
      annotations: [],
    };
  } finally {
    bitmap.close();
  }
}
if (typeof window !== "undefined")
  window.addEventListener("beforeunload", (e) => {
    if (stagedMedia.size) {
      e.preventDefault();
      e.returnValue = "";
    }
  });
const db = () =>
  openDB("codimate-private", 1, {
    upgrade(db) {
      db.createObjectStore("vault");
    },
  });
let key: CryptoKey | undefined,
  userId = "";
export async function unlockVault(id: string, password: string) {
  if (password.length < 12)
    throw new Error("기기 보관 암호는 12자 이상이어야 합니다.");
  const d = await db();
  let salt = (await d.get("vault", id + ":salt")) as Uint8Array | undefined;
  if (!salt) {
    salt = crypto.getRandomValues(new Uint8Array(16));
    await d.put("vault", salt, id + ":salt");
  }
  const material = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(password),
    "PBKDF2",
    false,
    ["deriveKey"],
  );
  const next = await crypto.subtle.deriveKey(
    {
      name: "PBKDF2",
      salt: salt as BufferSource,
      iterations: 600000,
      hash: "SHA-256",
    },
    material,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"],
  );
  const check = await d.get("vault", id + ":check");
  if (check)
    try {
      await crypto.subtle.decrypt(
        { name: "AES-GCM", iv: check.iv },
        next,
        check.data,
      );
    } catch {
      throw new Error(
        "기기 저장 암호가 다릅니다. 이전 암호로 대기 자료를 먼저 복구하세요.",
      );
    }
  key = next;
  userId = id;
  await vaultWrite("check", "codimate");
}
export function lockVault() {
  key = undefined;
  userId = "";
  token = "";
  sessionEpoch++;
  blobs.clear();
  loading.clear();
  stagedMedia.clear();
  notifyUploads();
}
export async function vaultWrite(name: string, value: unknown) {
  if (!key) return;
  const vaultKey = key,
    vaultUser = userId;
  const iv = crypto.getRandomValues(new Uint8Array(12)),
    data = await crypto.subtle.encrypt(
      { name: "AES-GCM", iv },
      vaultKey,
      new TextEncoder().encode(
        JSON.stringify(
          native && name !== "check"
            ? {
                device: (
                  await NativeClinic.seal({ value: JSON.stringify(value) })
                ).value,
              }
            : value,
        ),
      ),
    );
  if (key === vaultKey && userId === vaultUser)
    await (await db()).put("vault", { iv, data }, vaultUser + ":" + name);
}
export async function vaultRead<T>(name: string): Promise<T | undefined> {
  if (!key) return;
  const v = await (await db()).get("vault", userId + ":" + name);
  if (!v) return;
  const decoded = JSON.parse(
    new TextDecoder().decode(
      await crypto.subtle.decrypt({ name: "AES-GCM", iv: v.iv }, key, v.data),
    ),
  );
  return decoded?.device
    ? JSON.parse((await NativeClinic.open({ value: decoded.device })).value)
    : decoded;
}
export interface CachedSession {
  state: State;
  user: User;
  savedAt: number;
}
export const vaultEnabled = () => !!key;
export async function recoveryCommands() {
  if (!key) return [];
  const keys = await (await db()).getAllKeys("vault");
  const commands: Command[] = [];
  for (const k of keys)
    if (typeof k === "string" && k.startsWith(userId + ":conflict:")) {
      const c = await vaultRead<Command>(k.slice(userId.length + 1));
      if (c) commands.push(c);
    }
  return commands;
}
