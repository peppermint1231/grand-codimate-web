import { readFile, mkdir, writeFile, rename, rm } from "node:fs/promises";
import { createHash, randomUUID } from "node:crypto";

// These fonts are bundled for offline photo rendering and PDF/JPG exports.
for (const font of JSON.parse(
  await readFile(new URL("./annotation-fonts.json", import.meta.url), "utf8"),
)) {
  const target = new URL("../public/fonts/" + font.file, import.meta.url);
  let bytes;
  try {
    bytes = await readFile(target);
  } catch (e) {
    if (e.code !== "ENOENT") throw e;
  }
  if (!bytes) {
    const response = await fetch(font.url, {
      signal: AbortSignal.timeout(60000),
    });
    if (!response.ok) throw new Error(`Font download failed: ${font.file}`);
    bytes = Buffer.from(await response.arrayBuffer());
  }
  if (createHash("sha256").update(bytes).digest("hex") !== font.sha256)
    throw new Error(`Font checksum mismatch: ${font.file}`);
  await mkdir(new URL("../public/fonts/", import.meta.url), {
    recursive: true,
  });
  await writeFile(target, bytes);
}

const path = new URL("../public/fonts/NotoSansKR.ttf", import.meta.url);
const expected =
  "194018e6b2b293a7964f037b25c0249ce1418bc9ab3c971060a03aa57861e252";
const source =
  "https://raw.githubusercontent.com/google/fonts/4efc2774c63917927efe769ca845def6bd6debae/ofl/notosanskr/NotoSansKR%5Bwght%5D.ttf";
const digest = (bytes) => createHash("sha256").update(bytes).digest("hex");
let existing;
try {
  existing = await readFile(path);
} catch (error) {
  if (error.code !== "ENOENT") throw error;
}
if (existing) {
  if (digest(existing) !== expected)
    throw new Error("Korean font checksum mismatch; existing file preserved.");
  console.log("Korean font verified.");
} else {
  const response = await fetch(source, { signal: AbortSignal.timeout(60000) });
  if (!response.ok)
    throw new Error(`Font download failed: HTTP ${response.status}`);
  const bytes = Buffer.from(await response.arrayBuffer());
  if (digest(bytes) !== expected)
    throw new Error("Downloaded font checksum mismatch.");
  await mkdir(new URL("../public/fonts/", import.meta.url), {
    recursive: true,
  });
  const temporary = new URL(`NotoSansKR.${randomUUID()}.tmp`, path);
  try {
    await writeFile(temporary, bytes, { flag: "wx" });
    await rename(temporary, path);
  } finally {
    await rm(temporary, { force: true });
  }
  console.log("Korean font downloaded and verified.");
}
