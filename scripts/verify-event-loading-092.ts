import { chromium, expect } from "@playwright/test";
import { readFile, writeFile } from "node:fs/promises";
import assert from "node:assert/strict";
import { parseEventPage, parseWebsiteEvent } from "../server/eventCatalog";
import { eventList, eventDetail } from "../tests/fixtures/websiteEvents";
const health = (await (
  await fetch("http://localhost:8787/api/health")
).json()) as any;
assert.equal(health.mode, "local-development");
const creds = JSON.parse(await readFile("private/local-setup.json", "utf8"));
const browser = await chromium.launch({ args: ["--no-sandbox"] }),
  page = await browser.newPage({ viewport: { width: 1440, height: 1050 } });
let releaseState!: () => void,
  releaseSource!: () => void,
  sourceStarted!: () => void;
const stateGate = new Promise<void>((r) => (releaseState = r)),
  sourceGate = new Promise<void>((r) => (releaseSource = r)),
  started = new Promise<void>((r) => (sourceStarted = r));
let stateHeld = false,
  sourceHeld = false,
  writes = 0;
const errors: string[] = [];
page.on("pageerror", (e) => errors.push(e.message));
await page.route("**/api/commands", async (route) => {
  writes++;
  await route.abort();
});
await page.route("**/api/state", async (route) => {
  const response = await route.fetch();
  if (response.ok() && !stateHeld) {
    stateHeld = true;
    await stateGate;
  }
  await route.fulfill({ response });
});
await page.route("**/api/catalog/event-source*", async (route) => {
  const u = new URL(route.request().url());
  if (u.searchParams.has("category") && !sourceHeld) {
    sourceHeld = true;
    sourceStarted();
    await sourceGate;
  }
  const data = u.searchParams.has("item")
    ? parseWebsiteEvent(eventDetail(), "101", "20")
    : parseEventPage(eventList());
  await route.fulfill({ status: 200, json: data });
});
try {
  await page.goto("http://localhost:5173");
  await page
    .getByLabel("등록된 아이디 선택", { exact: true })
    .selectOption(creds.username);
  await page.getByLabel("비밀번호", { exact: true }).fill(creds.password);
  await page.getByRole("button", { name: "로그인", exact: true }).click();
  await page.getByRole("heading", { name: "환자목록", exact: true }).waitFor();
  await page.getByRole("button", { name: "단가표 관리", exact: true }).click();
  await page.getByRole("button", { name: "이벤트 SSOT", exact: true }).click();
  await expect(page.getByLabel("단가표 버전", { exact: true })).toHaveValue("");
  await page
    .getByRole("button", { name: "이벤트 단가표 갱신", exact: true })
    .click();
  await started;
  releaseState();
  await expect(page.getByLabel("단가표 버전", { exact: true })).not.toHaveValue(
    "",
  );
  releaseSource();
  await expect(
    page.getByRole("button", { name: "갱신 초안 저장", exact: true }),
  ).toBeVisible({ timeout: 10000 });
  assert.equal(writes, 0);
  assert.deepEqual(errors, []);
  const result = {
    ok: true,
    initialCatalogLoadingRaceReproduced: true,
    collectionSurvivesBaseLoad: true,
    previewReady: true,
    ssotWrites: 0,
    pageErrors: errors,
  };
  await writeFile(
    "artifacts/events-loading-092.json",
    JSON.stringify(result, null, 2),
  );
  console.log(JSON.stringify(result));
} finally {
  releaseState();
  releaseSource();
  await browser.close();
}
