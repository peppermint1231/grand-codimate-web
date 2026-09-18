import { mkdir, writeFile } from "node:fs/promises";
import { randomBytes } from "node:crypto";

await mkdir("private", { recursive: true, mode: 0o700 });
const path = "private/production-secrets.json";
try {
  await writeFile(path, JSON.stringify({
    ENCRYPTION_KEY: randomBytes(32).toString("base64"),
    SETUP_KEY: randomBytes(32).toString("base64url"),
    MICROSOFT_CLIENT_ID: "",
    MICROSOFT_CLIENT_SECRET: "",
  }, null, 2) + "\n", { flag: "wx", mode: 0o600 });
  console.log("운영 비밀 설정 파일을 준비했습니다: " + path);
  console.log("Microsoft 값 두 개를 파일에 직접 입력하고 암호화 키를 별도로 보관하세요. 값은 출력하지 않았습니다.");
} catch (error) {
  if (error.code !== "EEXIST") throw error;
  console.log("기존 운영 비밀 설정 파일을 보존했습니다. 덮어쓰거나 키를 재생성하지 않았습니다.");
}
