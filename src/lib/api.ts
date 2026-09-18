import { openDB } from "idb";
import { native, NativeClinic } from "./native";
import type { Command, State, User } from "../core/model";
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
export const setToken = (s: string) => {
  token = s;
};
export async function api<T = any>(
  path: string,
  init: RequestInit = {},
): Promise<T> {
  const r = await fetch(base + "/api" + path, {
    ...init,
    credentials: "include",
    headers: {
      ...(init.body && typeof init.body === "string"
        ? { "Content-Type": "application/json" }
        : {}),
      ...(token ? { Authorization: "Bearer " + token } : {}),
      ...Object.fromEntries(new Headers(init.headers)),
    },
  });
  const d = (await r.json()) as any;
  if (!r.ok)
    throw Object.assign(new Error(d.error || "요청 실패"), {
      status: r.status,
    });
  return d;
}
export const command = async (c: Command) => {
  for (const photo of (c.payload.photos || []) as { mediaId: string }[]) {
    const pending = await vaultRead<{
      name: string;
      consultationId: string;
      data: string;
      pending: boolean;
    }>("media:" + photo.mediaId);
    if (pending?.pending) {
      const blob = await (await fetch(pending.data)).blob();
      await postMedia(
        blob,
        pending.name,
        pending.consultationId,
        photo.mediaId,
      );
      await vaultWrite("media:" + photo.mediaId, {
        ...pending,
        pending: false,
      });
    }
  }
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
) {
  return api<{ id: string }>("/media", {
    method: "POST",
    body: file,
    headers: {
      "Content-Type": file.type,
      "X-File-Name": encodeURIComponent(name),
      "X-Consultation-Id": consultationId,
      "X-Upload-Id": id,
    },
  });
}
export async function mediaUrl(id: string) {
  const cached = await vaultRead<{ data: string }>("media:" + id);
  if (cached?.data)
    return URL.createObjectURL(await (await fetch(cached.data)).blob());
  const r = await fetch(base + "/api/media/" + id, {
    credentials: "include",
    headers: token ? { Authorization: "Bearer " + token } : {},
  });
  if (!r.ok) throw new Error("사진을 불러오지 못했습니다");
  const blob = await r.blob();
  if (vaultEnabled())
    await vaultWrite("media:" + id, {
      data: await blobData(blob),
      pending: false,
    });
  return URL.createObjectURL(blob);
}
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
}
export async function vaultWrite(name: string, value: unknown) {
  if (!key) return;
  const iv = crypto.getRandomValues(new Uint8Array(12)),
    data = await crypto.subtle.encrypt(
      { name: "AES-GCM", iv },
      key,
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
  await (await db()).put("vault", { iv, data }, userId + ":" + name);
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
