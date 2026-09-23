import { openDB } from "idb";
import { native, NativeClinic } from "./native";
const database = () =>
  openDB("codimate-guest-photos", 1, {
    upgrade(db) {
      db.createObjectStore("photos");
      db.createObjectStore("keys");
    },
  });
async function guestKey() {
  const db = await database();
  let key = (await db.get("keys", "key")) as CryptoKey | undefined;
  if (!key) {
    const candidate = await crypto.subtle.generateKey(
      { name: "AES-GCM", length: 256 },
      false,
      ["encrypt", "decrypt"],
    );
    const tx = db.transaction("keys", "readwrite");
    key = (await tx.store.get("key")) || candidate;
    await tx.store.put(key, "key");
    await tx.done;
  }
  return key!;
}
export type GuestPhoto = { id: string; file: File; url: string };
export async function saveGuestPhoto(file: File): Promise<GuestPhoto> {
  if (!file.type.startsWith("image/"))
    throw new Error("사진 파일을 선택하세요.");
  if (file.size > 25_000_000)
    throw new Error("임시 촬영 사진은 한 장당 25MB 이하로 선택하세요.");
  const db = await database();
  if ((await db.count("photos")) >= 50)
    throw new Error(
      "미연결 사진은 50장까지 보관할 수 있습니다. 먼저 연결하거나 정리하세요.",
    );
  const id = crypto.randomUUID(),
    iv = crypto.getRandomValues(new Uint8Array(12));
  let data: BufferSource = await file.arrayBuffer();
  if (native) {
    let binary = "";
    const bytes = new Uint8Array(data as ArrayBuffer);
    for (let i = 0; i < bytes.length; i += 32768)
      binary += String.fromCharCode(...bytes.subarray(i, i + 32768));
    data = new TextEncoder().encode(
      (await NativeClinic.seal({ value: btoa(binary) })).value,
    );
  }
  const encrypted = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv },
    await guestKey(),
    data,
  );
  await db.put(
    "photos",
    {
      iv,
      data: encrypted,
      name: file.name,
      type: file.type,
      lastModified: file.lastModified,
      native,
    },
    id,
  );
  return { id, file, url: URL.createObjectURL(file) };
}
export async function loadGuestPhotos(): Promise<GuestPhoto[]> {
  const db = await database(),
    key = await guestKey(),
    result: GuestPhoto[] = [];
  for (const id of await db.getAllKeys("photos")) {
    const r = await db.get("photos", id);
    let data = await crypto.subtle.decrypt(
      { name: "AES-GCM", iv: r.iv },
      key,
      r.data,
    );
    if (r.native) {
      const value = (
        await NativeClinic.open({ value: new TextDecoder().decode(data) })
      ).value;
      data = Uint8Array.from(atob(value), (c) => c.charCodeAt(0)).buffer;
    }
    const file = new File([data], r.name, {
      type: r.type,
      lastModified: r.lastModified,
    });
    result.push({ id: String(id), file, url: URL.createObjectURL(file) });
  }
  return result;
}
export async function markGuestLinked(
  id: string,
  consultationId: string,
  mediaId: string,
) {
  const db = await database(),
    tx = db.transaction("photos", "readwrite"),
    r = await tx.store.get(id);
  if (r) await tx.store.put({ ...r, consultationId, mediaId }, id);
  await tx.done;
}
export async function clearSavedGuest(
  consultationId: string,
  mediaIds: string[],
) {
  const db = await database(),
    tx = db.transaction("photos", "readwrite");
  for (const id of await tx.store.getAllKeys()) {
    const r = await tx.store.get(id);
    if (r.consultationId === consultationId && mediaIds.includes(r.mediaId))
      await tx.store.delete(id);
  }
  await tx.done;
}
export async function removeGuestPhotos(ids: string[]) {
  const db = await database(),
    tx = db.transaction("photos", "readwrite");
  for (const id of ids) await tx.store.delete(id);
  await tx.done;
}
