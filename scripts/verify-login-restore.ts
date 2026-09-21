import { chromium, expect } from "@playwright/test";
import { readFile, writeFile } from "node:fs/promises";
import assert from "node:assert/strict";
const creds = JSON.parse(await readFile("private/local-setup.json", "utf8"));
const release = JSON.parse(await readFile("releases/android-latest.json", "utf8"));
const browser = await chromium.launch({ args: ["--no-sandbox"] });
const context = await browser.newContext();
const page = await context.newPage();
await page.addInitScript((release) => {
  const w = window as any;
  w.__name = (f: unknown) => f;
  localStorage.setItem("codimate-server", location.origin);
  w.androidBridge = {};
  w.Capacitor = {
    PluginHeaders: [
      {
        name: "ClinicDevice",
        methods: ["appInfo", "seal", "open"].map((name) => ({
          name,
          rtype: "promise",
        })),
      },
    ],
    nativePromise: async (_plugin: string, method: string, options: any) => {
      if (method === "appInfo")
        return { version: release.version, versionCode: release.versionCode };
      if (method === "seal")
        return { value: "mock-sealed:" + btoa(options.value) };
      if (method === "open")
        return { value: atob(options.value.replace("mock-sealed:", "")) };
    },
  };
}, release);
let restoredBearer = false;
page.on("request", (req) => {
  if (
    req.url().endsWith("/api/state") &&
    req.headers()["authorization"]?.startsWith("Bearer ")
  )
    restoredBearer = true;
});
try {
  await page.goto("http://localhost:5173");
  await page.getByLabel("아이디", { exact: true }).fill(creds.username);
  await page.getByLabel("비밀번호", { exact: true }).fill(creds.password);
  await page.getByRole("button", { name: "로그인", exact: true }).click();
  await page.getByRole("heading", { name: "환자목록", exact: true }).waitFor();
  const cipher = await page.evaluate(() =>
    localStorage.getItem("codimate-login"),
  );
  assert.ok(cipher?.startsWith("mock-sealed:"));
  await context.clearCookies();
  restoredBearer = false;
  await page.reload();
  await page.getByRole("heading", { name: "환자목록", exact: true }).waitFor();
  assert.ok(
    restoredBearer,
    "Restoration must authenticate with decrypted native token",
  );
  await page.clock.install();
  await page.clock.fastForward(20 * 60 * 1000);
  await expect(
    page.getByRole("heading", { name: "환자목록", exact: true }),
  ).toBeVisible();
  const loggedOut = page.waitForResponse((r) =>
    r.url().endsWith("/api/logout"),
  );
  await page.getByRole("button", { name: "로그아웃", exact: true }).click();
  assert.equal((await loggedOut).status(), 200);
  assert.equal(
    await page.evaluate(() => localStorage.getItem("codimate-login")),
    null,
  );
  await page.reload();
  await page.getByRole("button", { name: "로그인", exact: true }).waitFor();
  await writeFile(
    "artifacts/login-restore-verification.json",
    JSON.stringify(
      {
        passed: true,
        nativeCrypto:
          "bridge mock; real Keystore uses existing native seal/open",
        checks: [
          "encrypted-storage-handoff",
          "restore-without-cookie",
          "20min-idle",
          "explicit-logout-clears-credential",
        ],
      },
      null,
      2,
    ),
  );
  console.log(
    "Native login restoration browser workflow passed (Keystore bridge mocked).",
  );
} finally {
  await browser.close();
}
