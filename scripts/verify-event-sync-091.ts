import { chromium, expect } from "@playwright/test";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import assert from "node:assert/strict";
import type { State, Catalog } from "../src/core/model";
const health = (await (
  await fetch("http://localhost:8787/api/health")
).json()) as any;
assert.equal(health.mode, "local-development");
const creds = JSON.parse(await readFile("private/local-setup.json", "utf8"));
const browser = await chromium.launch({ args: ["--no-sandbox"] }),
  page = await browser.newPage({ viewport: { width: 1440, height: 1100 } });
const errors: string[] = [];
page.on("pageerror", (e) => errors.push(e.message));
page.on("dialog", (d) => d.accept());
await mkdir("private/browser091", { recursive: true });
try {
  await page.goto("http://localhost:5173");
  await page
    .getByLabel("등록된 아이디 선택", { exact: true })
    .selectOption(creds.username);
  await page.getByLabel("비밀번호", { exact: true }).fill(creds.password);
  await page.getByRole("button", { name: "로그인", exact: true }).click();
  await page.getByRole("heading", { name: "환자목록", exact: true }).waitFor();
  const state = async () =>
    await page.evaluate(async () => {
      const r = await fetch("/api/state");
      if (!r.ok) throw Error("state failed");
      return ((await r.json()) as { state: State }).state;
    });
  const before = await state();
  await page.getByRole("button", { name: "단가표 관리", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "이벤트 단가표 갱신", exact: true }),
  ).toHaveCount(0);
  await page.getByRole("button", { name: "이벤트 SSOT", exact: true }).click();
  const sync = page.getByRole("region", {
    name: "홈페이지 이벤트 갱신",
    exact: true,
  });
  await sync
    .getByRole("button", { name: "이벤트 단가표 갱신", exact: true })
    .click();
  await expect(
    sync.getByRole("button", { name: "갱신 초안 저장", exact: true }),
  ).toBeVisible({ timeout: 180000 });
  await expect(
    sync.getByRole("button", { name: "갱신 초안 저장", exact: true }),
  ).toBeEnabled();
  assert.deepEqual(await state(), before);
  await sync.locator(".event-sync-preview > summary").click();
  const first = sync.locator(".event-preview-item").first();
  await first.locator(":scope > summary").click();
  await expect(first.locator(".event-prices").first()).toBeVisible();
  const poster = first.locator("img").first();
  await poster.scrollIntoViewIfNeeded();
  await expect(poster).toHaveAttribute(
    "src",
    /^https:\/\/www\.grand4\.co\.kr\/uploadFiles\//,
  );
  await expect
    .poll(
      () =>
        poster.evaluate(
          (img: HTMLImageElement) => img.complete && img.naturalWidth > 0,
        ),
      { timeout: 20000 },
    )
    .toBe(true);
  await page.screenshot({ path: "private/browser091/event-preview.png" });
  await sync
    .getByRole("button", { name: "갱신 초안 저장", exact: true })
    .click();
  await expect
    .poll(async () => (await state()).catalogs.length, { timeout: 30000 })
    .toBe(before.catalogs.length + 1);
  const after = await state(),
    latest = after.catalogs.filter((c) => c.book === "이벤트").at(-1)!;
  assert.equal(latest.status, "draft");
  assert(latest.eventImport);
  const imported = latest.products.filter((p) => p.webEvent);
  assert(imported.length > 0);
  assert(
    imported.every(
      (p) =>
        p.webEvent!.eventName.includes("이벤트") ||
        p.webEvent!.categoryName?.includes("이벤트"),
    ),
  );
  assert.deepEqual(
    after.catalogs.filter((c) => c.book !== "이벤트"),
    before.catalogs.filter((c) => c.book !== "이벤트"),
  );
  assert.deepEqual(after.patients, before.patients);
  assert.deepEqual(after.consultations, before.consultations);
  assert(
    after.catalogRevisions.some(
      (r) => r.action === "홈페이지 이벤트 갱신" && r.catalogId === latest.id,
    ),
  );
  await expect(
    page.getByText("이벤트 기간: ~2026-09-30", { exact: false }).first(),
  ).toBeVisible();
  const priced = imported.find(
    (p) =>
      p.webEvent?.regularPrice !== null && p.webEvent?.discountRate !== null,
  )!;
  const productRow = page
    .locator(".catalog-product-title")
    .filter({ hasText: priced.name })
    .first();
  await productRow.click();
  await expect(
    page.locator("[data-catalog-product-editor] .event-regular"),
  ).toContainText("정가");
  await expect(
    page.locator("[data-catalog-product-editor] .event-discount"),
  ).toContainText("% 할인");
  await page
    .locator("[data-catalog-product-editor] .event-posters > summary")
    .click();
  await expect(
    page.locator("[data-catalog-product-editor] .event-posters img").first(),
  ).toHaveAttribute("src", /^https:\/\/www\.grand4\.co\.kr/);
  await page.setViewportSize({ width: 390, height: 844 });
  assert(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  );
  await page.screenshot({ path: "private/browser091/event-mobile.png" });
  assert.deepEqual(errors, []);
  const result = {
    ok: true,
    importedEvents: latest.eventImport.eventCount,
    importedOffers: imported.length,
    onlyEventBanners: true,
    previewReadOnly: true,
    draftPersisted: true,
    otherBooksPreserved: true,
    consultationsPreserved: true,
    historyRecorded: true,
    remotePosterRendered: true,
    periodAndPricesVisible: true,
    mobileNoOverflow: true,
    pageErrors: errors,
  };
  await writeFile(
    "artifacts/events-browser-091.json",
    JSON.stringify(result, null, 2),
  );
  console.log(JSON.stringify(result));
} finally {
  await browser.close();
}
