import { randomBytes } from "node:crypto";
import { mkdir, writeFile, access } from "node:fs/promises";
try {
  await access(".dev.vars");
  console.log(".dev.vars already exists; kept unchanged.");
  process.exit(0);
} catch {}
await mkdir("private", { recursive: true });
const encryptionKey = randomBytes(32).toString("base64"),
  setupKey = randomBytes(24).toString("hex");
await writeFile(
  ".dev.vars",
  `ENCRYPTION_KEY=${encryptionKey}\nSETUP_KEY=${setupKey}\nREQUIRE_ONEDRIVE=false\nAPP_ORIGIN=http://localhost:5173\n`,
  { mode: 0o600 },
);
await writeFile(
  "private/local-bootstrap.json",
  JSON.stringify({ setupKey, encryptionKey }, null, 2),
  { mode: 0o600 },
);
console.log(
  "Created local-only secrets. Read private/local-bootstrap.json for the setup key; do not commit or share it.",
);
