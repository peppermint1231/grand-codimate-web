import { chromium, expect } from "@playwright/test";
import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
const browser = await chromium.launch({ args: ["--no-sandbox"] });
const manifest = {
  version: "0.2.1",
  versionCode: 4,
  url: "https://example.com/app.apk",
  sha256: "a".repeat(64),
  notes: "업데이트 시험",
};
const errors: string[] = [];
async function fixture(
  installedCode = 3,
  value: unknown = manifest,
  failure = false,
) {
  const page = await browser.newPage({
    viewport: { width: 900, height: 1100 },
  });
  let networkFailure = failure;
  page.on("pageerror", (e) => errors.push(e.message));
  await page.addInitScript(
    ({ installedCode }) => {
      const w = window as any;
      w.__name = (fn: unknown) => fn;
      localStorage.setItem("codimate-server", location.origin);
      w.androidBridge = {};
      w.updateInstalls = [];
      w.rejectInstall = false;
      w.Capacitor = {
        PluginHeaders: [
          {
            name: "ClinicDevice",
            methods: [
              { name: "appInfo", rtype: "promise" },
              { name: "install", rtype: "promise" },
            ],
          },
        ],
        nativePromise: async (
          _plugin: string,
          method: string,
          options: any,
        ) => {
          if (method === "appInfo")
            return {
              versionCode: installedCode,
              version: installedCode === 3 ? "0.2.0" : "0.2.1",
            };
          if (method === "install") {
            w.updateInstalls.push(options);
            if (w.rejectInstall)
              throw new Error("이 앱의 설치 허용 후 다시 눌러주세요");
            return;
          }
          throw new Error("Unexpected native method: " + method);
        },
      };
    },
    { installedCode },
  );
  await page.route("**/api/health", (route) =>
    route.fulfill({ json: { ok: true, configured: true, needsSetup: false } }),
  );
  await page.route("**/api/app-release", (route) =>
    networkFailure ? route.abort("failed") : route.fulfill({ json: value }),
  );
  await page.goto("http://localhost:5173");
  return {
    page,
    reconnect: () => {
      networkFailure = false;
    },
  };
}
try {
  const { page } = await fixture();
  const banner = page.getByRole("status", { name: "앱 업데이트 안내" });
  await expect(banner).toContainText("코디메이트 0.2.1 업데이트");
  await page.getByRole("button", { name: "나중에", exact: true }).click();
  await page.evaluate(() => window.dispatchEvent(new Event("focus")));
  await expect(banner).toHaveCount(0);
  const manual = () =>
    page.evaluate(() =>
      window.dispatchEvent(new Event("codimate:check-update")),
    );
  await manual();
  await expect(banner).toBeVisible();
  page.once("dialog", (d) => d.dismiss());
  await page
    .getByRole("button", { name: "업데이트 설치", exact: true })
    .click();
  assert.equal(
    await page.evaluate(() => (window as any).updateInstalls.length),
    0,
  );
  await page.evaluate(() =>
    window.addEventListener(
      "codimate:before-install",
      (e) => e.preventDefault(),
      { once: true },
    ),
  );
  await page
    .getByRole("button", { name: "업데이트 설치", exact: true })
    .click();
  await expect(banner).toContainText("저장·전송 중인 자료");
  assert.equal(
    await page.evaluate(() => (window as any).updateInstalls.length),
    0,
  );
  await page.evaluate(() => {
    (window as any).rejectInstall = true;
  });
  page.on("dialog", (d) => d.accept());
  await page
    .getByRole("button", { name: "업데이트 설치", exact: true })
    .click();
  await expect(banner).toContainText("설치 허용 후 다시");
  await page.evaluate(() => {
    (window as any).rejectInstall = false;
  });
  await page
    .getByRole("button", { name: "업데이트 설치", exact: true })
    .click();
  await expect(banner).toContainText("Android 설치 화면");
  assert.deepEqual(
    await page.evaluate(() => (window as any).updateInstalls),
    Array(2).fill({ url: manifest.url, sha256: manifest.sha256 }),
  );
  await mkdir("artifacts", { recursive: true });
  await page.screenshot({ path: "artifacts/android-update-notice.png" });
  await page.close();
  for (const installedCode of [4, 5]) {
    const { page } = await fixture(installedCode);
    await page.waitForTimeout(500);
    await expect(page.locator(".android-update-notice")).toHaveCount(0);
    await page.evaluate(() =>
      window.dispatchEvent(new Event("codimate:check-update")),
    );
    await expect(page.locator(".android-update-notice")).toContainText(
      "새 업데이트가 없습니다",
    );
    await expect(
      page.getByRole("button", { name: "업데이트 설치", exact: true }),
    ).toHaveCount(0);
    await page.close();
  }
  const offline = await fixture(3, manifest, true);
  await offline.page.waitForTimeout(500);
  await expect(offline.page.locator(".android-update-notice")).toHaveCount(0);
  offline.reconnect();
  await offline.page.evaluate(() => window.dispatchEvent(new Event("online")));
  await expect(offline.page.locator(".android-update-notice")).toContainText(
    "0.2.1 업데이트",
  );
  await offline.page.close();
  const invalid = await fixture(3, { ...manifest, sha256: "invalid" });
  await invalid.page.waitForTimeout(500);
  await expect(invalid.page.locator(".android-update-notice")).toHaveCount(0);
  await invalid.page.evaluate(() =>
    window.dispatchEvent(new Event("codimate:check-update")),
  );
  await expect(invalid.page.locator(".android-update-notice")).toContainText(
    "정보를 확인하지 못했습니다",
  );
  await invalid.page.close();
  assert.deepEqual(errors, []);
  await writeFile(
    "artifacts/android-update-verification.json",
    JSON.stringify(
      {
        passed: true,
        nativeBridge: "mock",
        checks: [
          "startup",
          "defer",
          "manual-recheck",
          "cancel",
          "pending-save-block",
          "permission-retry",
          "hash-handoff",
          "same-version",
          "older-version",
          "network-recovery",
          "invalid-manifest",
        ],
      },
      null,
      2,
    ),
  );
  console.log("Android update browser workflow passed (native bridge mocked).");
} finally {
  await browser.close();
}
