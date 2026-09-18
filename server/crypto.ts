import {
  scrypt as nativeScrypt,
  randomBytes,
  timingSafeEqual,
} from "node:crypto";
export const bytes = (s: string) => new Uint8Array(Buffer.from(s, "base64"));
async function key(secret: string) {
  if (bytes(secret).length !== 32)
    throw new Error("ENCRYPTION_KEY must be 32 random bytes, base64 encoded");
  return crypto.subtle.importKey(
    "raw",
    bytes(secret),
    { name: "AES-GCM" },
    false,
    ["encrypt", "decrypt"],
  );
}
export async function seal(value: unknown, secret: string) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const plain = new TextEncoder().encode(JSON.stringify(value));
  const compressed = plain.byteLength > 1024;
  const payload = compressed
    ? await new Response(
        new Blob([plain]).stream().pipeThrough(new CompressionStream("gzip")),
      ).arrayBuffer()
    : plain;
  const encrypted = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv },
    await key(secret),
    payload,
  );
  return JSON.stringify({
    v: 2,
    compressed,
    iv: Buffer.from(iv).toString("base64"),
    data: Buffer.from(encrypted).toString("base64"),
  });
}
export async function open<T>(value: string, secret: string): Promise<T> {
  const v = JSON.parse(value);
  let plain = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv: bytes(v.iv) },
    await key(secret),
    bytes(v.data),
  );
  if (v.compressed)
    plain = await new Response(
      new Blob([plain]).stream().pipeThrough(new DecompressionStream("gzip")),
    ).arrayBuffer();
  return JSON.parse(new TextDecoder().decode(plain));
}
const derive = (password: string, salt: string) =>
  new Promise<Buffer>((resolve, reject) =>
    nativeScrypt(
      password,
      salt,
      32,
      { N: 32768, r: 8, p: 1, maxmem: 64 * 1024 * 1024 },
      (e, key) => (e ? reject(e) : resolve(key)),
    ),
  );
export async function hashPassword(password: string) {
  if (password.length < 12 || password.length > 128)
    throw new Error("비밀번호는 12~128자로 입력하세요");
  const salt = Buffer.from(randomBytes(16)).toString("hex");
  return salt + ":" + Buffer.from(await derive(password, salt)).toString("hex");
}
export async function verifyPassword(password: string, hash: string) {
  if (password.length > 128) return false;
  const [salt, h] = hash.split(":");
  const actual = await derive(password, salt);
  const expected = Buffer.from(h, "hex");
  return expected.length === actual.length && timingSafeEqual(actual, expected);
}
