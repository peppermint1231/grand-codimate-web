import { readFile, writeFile, mkdir, copyFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { homedir } from "node:os";
import { join } from "node:path";
import { spawn } from "node:child_process";
const config = JSON.parse(
  await readFile(join(homedir(), ".codex/keys/codimate/signing.json"), "utf8"),
);
const versionName = process.env.VERSION_NAME || "0.7.0";
const versionCode = process.env.VERSION_CODE || "11";
if (
  !/^[0-9A-Za-z][0-9A-Za-z._-]*$/.test(versionName) ||
  !/^[1-9][0-9]*$/.test(versionCode) ||
  Number(versionCode) > 2100000000
)
  throw new Error("유효한 APK 버전 이름·코드를 지정하세요.");
const args = ["-p", "android", "assembleRelease", "--console=plain"];
if (process.env.CODIMATE_AAPT2)
  args.push("-Pandroid.aapt2FromMavenOverride=" + process.env.CODIMATE_AAPT2);
const child = spawn("android/gradlew", args, {
  env: {
    ...process.env,
    ANDROID_KEYSTORE: config.keystore,
    ANDROID_KEY_ALIAS: config.alias,
    ANDROID_STORE_PASSWORD: config.storePassword,
    ANDROID_KEY_PASSWORD: config.keyPassword,
    VERSION_CODE: versionCode,
    VERSION_NAME: versionName,
  },
  stdio: "inherit",
});
const code = await new Promise((resolve) => child.on("exit", resolve));
if (code !== 0) process.exit(Number(code) || 1);
await mkdir("artifacts", { recursive: true });
const filename = `codimate-${versionName}.apk`;
const target = "artifacts/" + filename;
await copyFile("android/app/build/outputs/apk/release/app-release.apk", target);
const sha = createHash("sha256")
  .update(await readFile(target))
  .digest("hex");
await writeFile(target + ".sha256", sha + "  " + filename + "\n");
console.log("Release APK and SHA-256 written to artifacts.");
