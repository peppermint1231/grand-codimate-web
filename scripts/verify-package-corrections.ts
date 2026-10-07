import { chromium, expect } from "@playwright/test";
import { readFile } from "node:fs/promises";
import assert from "node:assert/strict";
import { emptyState } from "../src/core/model";
import { publicProducts } from "../src/core/discovery";
import { patientConcerns } from "../src/core/patientDiscovery";
// Uses a locally validated candidate catalog; never writes production state.
const { catalog } = JSON.parse(
  await readFile("private/user-package-corrections.json", "utf8"),
);
const state = emptyState();
state.catalogs = [catalog];
const names = [
  "색소 패키지 후 유지관리 프로그램",
  "굿바이 여드름/트러블",
  "탄력·광채",
  "루비스타 흑자제거",
  "내맘대로 피부관리",
];
const browser = await chromium.launch({ args: ["--no-sandbox"] });
try {
  for (const width of [1440, 768, 390]) {
    const page = await browser.newPage({ viewport: { width, height: 1000 } });
    await page.addInitScript("window.__name=(fn)=>fn;");
    const errors: string[] = [];
    page.on("pageerror", (e) => errors.push(e.message));
    for (const name of names) {
      const product = publicProducts(state).find((p) => p.name === name)!;
      assert(product);
      // Route each real product to one concern so this verifies the card, independently of ranking.
      product.matches = [
        {
          concernId: patientConcerns.find((c) => c.name === "점·잡티·기미")!.id,
          answerIds: [],
        },
      ];
      await page.route("**/api/**", (r) =>
        r.fulfill({
          json:
            new URL(r.request().url()).pathname === "/api/public/catalog"
              ? {
                  products: [product],
                  patientConcerns,
                  categories: [],
                  token: "fixture",
                  closedDates: [],
                }
              : { ok: true, configured: true },
        }),
      );
      await page.goto("http://127.0.0.1:5198/discover");
      await page
        .locator(".pd-concern-card")
        .filter({ hasText: "점·잡티·기미" })
        .click();
      await page.getByRole("button", { name: /잘 모르겠어요/ }).click();
      const card = page.locator(".pd-product");
      await expect(card).toHaveCount(1);
      await expect(card).toContainText(name);
      await expect(card).toContainText("맞춤 상담 후 안내");
      const source = catalog.products.find((p: any) => p.name === name);
      for (let i = 0; i < product.options.length; i++) {
        const option = product.options[i];
        if (!option.packageComposition) continue;
        await card
          .getByText(`${option.label} 패키지 구성 보기`, { exact: true })
          .click();
        // Find the exact details by summary, since label substrings overlap.
        const details = card
          .locator("details.pd-package-composition")
          .filter({
            has: page.getByText(`${option.label} 패키지 구성 보기`, {
              exact: true,
            }),
          });
        const count = source.options[i].packageSessionCount;
        if (count) {
          await expect(details.locator("li")).toHaveCount(count);
        }
        if (name === "탄력·광채")
          await expect(details.locator("li").last()).toContainText(
            [8, 16, 24][i] + "주차",
          );
        if (name === "색소 패키지 후 유지관리 프로그램")
          await expect(details.locator("li").last()).toContainText(
            [3, 6][i] + "개월차",
          );
        if (name === "루비스타 흑자제거" && i === 5)
          await expect(details.locator("li")).toHaveCount(0);
      }
      if (name === "내맘대로 피부관리") {
        await card.getByRole("button", { name: "설명 전체 보기" }).click();
        for (const text of [
          "1회 차감",
          "2회 차감",
          "3회차감",
          "4회 차감",
          "리브이",
        ])
          await expect(card).toContainText(text);
      }
      assert.equal(
        await page.evaluate("document.documentElement.scrollWidth>innerWidth"),
        false,
      );
      if (name === "탄력·광채")
        await page.screenshot({
          path: `artifacts/package-interval-${width}.png`,
          fullPage: true,
        });
      await page.unroute("**/api/**");
    }
    assert.deepEqual(errors, []);
    await page.close();
    console.log(`package UI ${width}px passed`);
  }
} finally {
  await browser.close();
}
