import { chromium, expect } from "@playwright/test";
import assert from "node:assert/strict";
import { readFile, writeFile } from "node:fs/promises";
const origin = process.env.DISCOVERY_ORIGIN || "http://127.0.0.1:5198";
const production = origin.startsWith("https:");
const browser = await chromium.launch({ args: ["--no-sandbox"] });
const results = [];
try {
  for (const width of [1440, 390]) {
    const page = await browser.newPage({ viewport: { width, height: 1000 } });
    const errors: string[] = [];
    page.on("pageerror", (e) => errors.push(e.message));
    if (!production) {
      const data = JSON.parse(
        await readFile("private/discovery-dedup-before.json", "utf8"),
      );
      for (const p of data.products)
        if (p.book === "이벤트")
          for (const o of p.options)
            if (/^홈페이지\s*가격$/.test(o.label.trim())) o.label = "이벤트가";
      await page.route("**/api/public/catalog", (route) =>
        route.fulfill({ json: data }),
      );
    }
    await page.goto(origin + "/discover");
    await page
      .locator(".pd-concern-card")
      .filter({ hasText: /^.*여드름.*$/ })
      .filter({ hasNotText: "자국" })
      .click();
    await page.getByRole("button", { name: /잘 모르겠어요/ }).click();
    const more = page.getByRole("button", { name: /더 보기/ });
    for (let n = 0; n < 100 && (await more.count()); n++) await more.click();
    for (const weeks of [4, 8]) {
      const card = page
        .locator(".pd-product")
        .filter({
          has: page.getByRole("heading", {
            name: `굿바이 여드름/트러블 ${weeks}주 패키지`,
            exact: true,
          }),
        });
      await expect(card).toHaveCount(1);
      await expect(card.getByText("이벤트가", { exact: true })).toBeVisible();
      const labelBox = await card.getByText("이벤트가", { exact: true }).boundingBox();
      assert.ok(labelBox && labelBox.height < 30, "price label must stay on one line");
      assert.ok(!(await card.innerText()).includes("홈페이지 가격"));
      if (weeks === 4) {
        await card.scrollIntoViewIfNeeded();
        await card.screenshot({
          path: `artifacts/discovery-dedup-${production ? "production" : "local"}-${width}.png`,
        });
        await card.locator(".pd-option").click();
      }
    }
    assert.ok(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth + 1,
      ),
    );
    await page.getByRole("button", { name: /상담으로 이어가기/ }).click();
    await expect(page.getByLabel("이름 필수", { exact: true })).toBeVisible();
    assert.equal(errors.length, 0, errors.join("\n"));
    results.push({
      width,
      websitePrecedence: true,
      eventPriceLabel: true,
      distinctDurations: true,
      selection: true,
      submitted: false,
    });
    await page.close();
  }
  await writeFile(
    `artifacts/discovery-dedup-${production ? "production" : "local"}.json`,
    JSON.stringify(results, null, 2),
  );
  console.log(JSON.stringify(results));
} finally {
  await browser.close();
}
