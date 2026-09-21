import { chromium, expect } from "@playwright/test";
import { readFile, writeFile } from "node:fs/promises";
import assert from "node:assert/strict";
const health = (await (
  await fetch("http://127.0.0.1:8787/api/health")
).json()) as any;
assert.equal(health.mode, "local-development");
const creds = JSON.parse(await readFile("private/local-setup.json", "utf8"));
const browser = await chromium.launch({ args: ["--no-sandbox"] });
const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
await page.addInitScript(() => {
  (window as any).__name = (f: any) => f;
});
const errors: string[] = [];
page.on("pageerror", (e) => errors.push(e.message));
const button = (name: string) =>
  page.getByRole("button", { name, exact: true });
const settings = async () => {
  await button("설정").click();
  await button("연결·복구").click();
};
let original: string | undefined;
try {
  await page.goto("http://localhost:5173");
  await page
    .getByLabel("등록된 아이디 선택", { exact: true })
    .selectOption(creds.username);
  await page.getByLabel("비밀번호", { exact: true }).fill(creds.password);
  await button("로그인").click();
  await page.getByRole("heading", { name: "환자목록", exact: true }).waitFor();
  await settings();
  const input = page.getByLabel("저장 폴더 이름", { exact: true });
  original = await input.inputValue();
  await expect(button("저장 폴더 변경")).toBeDisabled();
  await input.fill("잘못된/경로");
  await button("저장 폴더 변경").click();
  await expect(page.getByText(/폴더 이름은 80자 이내/)).toBeVisible();
  await button("코디메이트로 입력").click();
  await expect(input).toHaveValue("코디메이트");
  await expect(
    page.getByText("변경 후: 코디메이트 / 미용 · 코디메이트 / 보험", {
      exact: true,
    }),
  ).toBeVisible();
  await button("저장 폴더 변경").click();
  await expect(
    page.getByRole("status").filter({ hasText: "저장 폴더를 코디메이트" }),
  ).toBeVisible();
  await page.reload();
  await page.getByRole("heading", { name: "환자목록", exact: true }).waitFor();
  await settings();
  await expect(input).toHaveValue("코디메이트");
  await expect(
    page.getByText("현재 위치: 내 파일 / 코디메이트", { exact: true }),
  ).toBeVisible();
  await page.setViewportSize({ width: 800, height: 1180 });
  assert(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth + 1,
    ),
  );
  await page.screenshot({
    path: "artifacts/storage-settings-portrait.png",
    fullPage: true,
  });
  assert.deepEqual(errors, []);
  await writeFile(
    "artifacts/storage-settings-browser.json",
    JSON.stringify(
      {
        passed: true,
        checks: [
          "current root",
          "invalid name rejection",
          "path preview",
          "save and reload",
          "portrait layout",
        ],
        errors,
      },
      null,
      2,
    ),
  );
  console.log("Storage settings browser verification passed.");
} finally {
  if (original)
    await page.evaluate(async (root) => {
      const { api } = await import(
        /* @vite-ignore */ String("/src/lib/api.ts")
      );
      const current = await api("/state");
      if (current.storageRoot !== root)
        await api("/storage", {
          method: "POST",
          body: JSON.stringify({
            rootFolder: root,
            baseRoot: current.storageRoot,
          }),
        });
    }, original);
  await browser.close();
}
