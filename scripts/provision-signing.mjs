import { randomBytes } from "node:crypto";
import { mkdir, writeFile, access } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";
import { execFileSync } from "node:child_process";
const dir = join(homedir(), ".codex", "keys", "codimate");
await mkdir(dir, { recursive: true, mode: 0o700 });
const infoPath = join(dir, "signing.json");
try {
  await access(infoPath);
  console.log("Existing signing identity retained.");
  process.exit(0);
} catch {}
const keyPath = join(dir, "codimate-release.jks"),
  password = randomBytes(32).toString("hex"),
  alias = "codimate";
execFileSync(
  join(process.env.JAVA_HOME, "bin", "keytool"),
  [
    "-genkeypair",
    "-keystore",
    keyPath,
    "-storetype",
    "JKS",
    "-alias",
    alias,
    "-keyalg",
    "RSA",
    "-keysize",
    "4096",
    "-validity",
    "10000",
    "-dname",
    "CN=Codimate Internal, O=Grand Clinic, C=KR",
    "-storepass:env",
    "CODIMATE_KEY_PASSWORD",
    "-keypass:env",
    "CODIMATE_KEY_PASSWORD",
  ],
  { env: { ...process.env, CODIMATE_KEY_PASSWORD: password }, stdio: "pipe" },
);
await writeFile(
  infoPath,
  JSON.stringify(
    {
      keystore: keyPath,
      alias,
      storePassword: password,
      keyPassword: password,
    },
    null,
    2,
  ),
  { mode: 0o600 },
);
console.log(
  "Persistent signing identity created outside the source tree. Back up .codex/keys/codimate securely.",
);
