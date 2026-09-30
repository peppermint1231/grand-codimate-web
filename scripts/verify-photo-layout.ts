import { chromium, expect } from "@playwright/test";
import assert from "node:assert/strict";
import { writeFile } from "node:fs/promises";
import { emptyState, emptyQuote } from "../src/core/model";
import { threeCatalogs, catalogAdmin } from "../tests/fixtures/catalogs";
const state = emptyState(),
  base = {
    rev: 1,
    createdAt: "2026-09-30T00:00:00Z",
    updatedAt: "2026-09-30T00:00:00Z",
  };
state.users = [catalogAdmin];
state.catalogs = threeCatalogs();
state.patients = [
  {
    ...base,
    id: "patient",
    number: "001",
    name: "순서검증환자",
    sex: "F",
    dob: "1990-01-01",
    phone: "01000000000",
    address: "시험",
    ownerId: "admin",
  },
];
state.consultations = [
  {
    ...base,
    id: "consult",
    patientId: "patient",
    patient: state.patients[0],
    ownerId: "admin",
    category: "미용",
    status: "H",
    cancelled: false,
    catalogVersion: "version-0",
    catalogVersions: { 미용: "version-0" },
    quote: emptyQuote(),
    memo: "",
    photos: [],
    appointment: "",
    attendance: "미정",
    documents: [],
  },
];
state.consultations[0].photos = Array.from({ length: 4 }, (_, i) => ({
  id: "photo" + i,
  name: "합성사진" + i,
  mediaId: "media" + i,
  selected: true,
  rotation: 0,
  annotations: [],
}));
const browser = await chromium.launch({ args: ["--no-sandbox"] }),
  page = await browser.newPage({
    viewport: { width: 1440, height: 1000 },
    hasTouch: true,
  }),
  errors: string[] = [];
page.on("pageerror", (e) => errors.push(e.message));
await page.route("**/api/**", async (r) => {
  const path = new URL(r.request().url()).pathname;
  if (path.startsWith("/api/media/"))
    return r.fulfill({
      contentType: "image/svg+xml",
      body: '<svg xmlns="http://www.w3.org/2000/svg" width="600" height="800"><rect width="600" height="800" fill="#acd8bd"/><circle cx="300" cy="280" r="140" fill="#f3d0ad"/><rect x="100" y="450" width="400" height="300" fill="#417968"/></svg>',
    });
  let json: any = { ok: true, configured: true, mode: "local-development" };
  if (path === "/api/state") json = { state, user: catalogAdmin, pending: 0 };
  if (path === "/api/opinions") json = { opinions: [] };
  if (path === "/api/patients/search")
    return r.fulfill({ status: 503, json: { error: "fixture" } });
  if (path === "/api/public/catalog")
    json = { products: [], categories: [], token: "fixture" };
  await r.fulfill({ json });
});
try {
  await page.goto("http://127.0.0.1:5198");
  await page.getByRole("button", { name: "단가표 관리", exact: true }).click();
  await expect(page.locator('[aria-label="단가표 구분"] > button')).toHaveText([
    "이벤트 SSOT",
    "미용 SSOT",
    "보험 SSOT",
  ]);
  await expect(
    page.locator('[aria-label="단가표 구분"] > button').first(),
  ).toHaveClass(/active|selected/);
  await page.getByRole("button", { name: "환자목록", exact: true }).click();
  await page.getByText("순서검증환자", { exact: true }).click();
  await page.locator(".consultation-history-entry > button").click();
  await page.getByRole("button", { name: /02.*상담/ }).click();
  await expect(
    page.locator('[aria-label="상담 단가표 구분"] > button'),
  ).toHaveText(["이벤트", "미용", "보험"]);
  await expect(
    page.locator('[aria-label="상담 단가표 구분"] > button').first(),
  ).toHaveClass(/active|selected/);
  const grid = page.locator(".viewer-viewport .comparison-grid");
  for (const [width, height, columns] of [
    [1440, 1000, 2],
    [768, 1024, 4],
    [390, 844, 4],
    [1280, 1600, 4],
    [1024, 768, 2],
  ]) {
    await page.setViewportSize({ width, height });
    await expect
      .poll(() =>
        grid.evaluate(
          (el) => getComputedStyle(el).gridTemplateColumns.split(" ").length,
        ),
      )
      .toBe(columns);
    const split = page.getByRole("separator", {
      name: "사진과 시술 선택 분할선",
    });
    const panel = page.locator(".consultation-viewer-panel");
    await split.scrollIntoViewIfNeeded();
    const before = (await panel.boundingBox())!;
    await split.focus();
    await page.keyboard.press(width < height ? "ArrowDown" : "ArrowRight");
    await expect
      .poll(async () => {
        const after = (await panel.boundingBox())!;
        return Math.round(
          width < height
            ? after.height - before.height
            : after.width - before.width,
        );
      })
      .toBeGreaterThan(20);
    if (width < height) {
      await split.scrollIntoViewIfNeeded();
      const box = (await split.boundingBox())!,
        h = (await panel.boundingBox())!.height;
      await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
      await page.mouse.down();
      await page.mouse.move(
        box.x + box.width / 2,
        box.y + box.height / 2 + 80,
        { steps: 8 },
      );
      await page.mouse.up();
      await expect
        .poll(async () => Math.round((await panel.boundingBox())!.height - h))
        .toBeGreaterThan(50);
    }
    assert(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
      "overflow " + width,
    );
    await panel.scrollIntoViewIfNeeded();
    await page.waitForTimeout(200);
    await page.screenshot({ path: `artifacts/photo-layout-${width}.png` });
  }
  await page.setViewportSize({ width: 768, height: 1024 });
  const touchSplit = page.getByRole("separator", {
    name: "사진과 시술 선택 분할선",
  });
  await touchSplit.scrollIntoViewIfNeeded();
  const touchBox = (await touchSplit.boundingBox())!,
    touchHeight = (await page
      .locator(".consultation-viewer-panel")
      .boundingBox())!.height;
  const cdp = await page.context().newCDPSession(page),
    tx = touchBox.x + touchBox.width / 2,
    ty = touchBox.y + touchBox.height / 2;
  await cdp.send("Input.dispatchTouchEvent", {
    type: "touchStart",
    touchPoints: [{ x: tx, y: ty }],
  });
  for (let dy = 10; dy <= 60; dy += 10)
    await cdp.send("Input.dispatchTouchEvent", {
      type: "touchMove",
      touchPoints: [{ x: tx, y: ty + dy }],
    });
  await cdp.send("Input.dispatchTouchEvent", {
    type: "touchEnd",
    touchPoints: [],
  });
  await expect
    .poll(async () =>
      Math.round(
        (await page.locator(".consultation-viewer-panel").boundingBox())!
          .height - touchHeight,
      ),
    )
    .toBeGreaterThan(40);
  await page.getByRole("button", { name: "3열", exact: true }).click();
  await page.setViewportSize({ width: 768, height: 1024 });
  await expect
    .poll(() =>
      grid.evaluate(
        (el) => getComputedStyle(el).gridTemplateColumns.split(" ").length,
      ),
    )
    .toBe(3);
  await page.getByRole("button", { name: "자동 배치", exact: true }).click();
  await expect
    .poll(() =>
      grid.evaluate(
        (el) => getComputedStyle(el).gridTemplateColumns.split(" ").length,
      ),
    )
    .toBe(4);
  await page
    .getByRole("button", { name: "1번 사진 한 장 보기", exact: true })
    .click();
  await expect(grid.locator("figure")).toHaveCount(1);
  await page.getByRole("button", { name: "전체 비교로 돌아가기" }).click();
  await expect(grid.locator("figure")).toHaveCount(4);
  for (const count of [1, 2, 3]) {
    state.consultations[0].photos.forEach((p, i) => (p.selected = i < count));
    await page.reload();
    await page.getByRole("button", { name: "환자목록", exact: true }).click();
    await page.getByText("순서검증환자", { exact: true }).click();
    await page.locator(".consultation-history-entry > button").click();
    await page.getByRole("button", { name: /02.*상담/ }).click();
    await expect
      .poll(() =>
        grid.evaluate(
          (el) => getComputedStyle(el).gridTemplateColumns.split(" ").length,
        ),
      )
      .toBe(count);
  }
  await page.goto("http://127.0.0.1:5198/discover");
  await expect(
    page.locator('[aria-label="고민 단가표 구분"] > button'),
  ).toHaveText(["이벤트", "미용", "보험"]);
  assert.deepEqual(errors, []);
  await writeFile(
    "artifacts/photo-layout-browser.json",
    JSON.stringify(
      {
        order: ["이벤트", "미용", "보험"],
        catalogManager: true,
        consultation: true,
        discovery: true,
        widths: [1440, 768, 390],
        photoCounts: [1, 2, 3, 4],
        portraitFourColumns: true,
        manualColumns: true,
        mouseResize: true,
        keyboardResize: true,
        touchResize: true,
        errors,
      },
      null,
      2,
    ),
  );
  console.log(
    "Event default, photo layout and mouse/keyboard/touch dividers verified.",
  );
} finally {
  await browser.close();
}
