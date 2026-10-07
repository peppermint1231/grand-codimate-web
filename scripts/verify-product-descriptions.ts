import { chromium, expect } from "@playwright/test";
import assert from "node:assert/strict";
import { emptyState } from "../src/core/model";
import { threeCatalogs } from "../tests/fixtures/catalogs";
import { publicProducts } from "../src/core/discovery";
import { patientConcerns } from "../src/core/patientDiscovery";
const state = emptyState();
state.catalogs = threeCatalogs();
state.catalogs.forEach((c, i) => {
  c.products[0].name = ["리팟 흑자 상담", "색소 잡티 상담", "기미 잡티 이벤트"][
    i
  ];
  c.products[0].description =
    i === 2
      ? "*VAT별도\n기미 상태를 확인하고 진행하는 맞춤 관리입니다.\n" +
        "구성과 일정을 상담에서 안내합니다. ".repeat(12) +
        "\n<script>window.descriptionInjected=true</script>"
      : "저장한 상품 설명\n1회 123,456원";
});
const pkg = state.catalogs[0].products[0];
pkg.name = "기미토닝 + 피코토닝 + 콜라겐토닝";
pkg.description =
  "기미 고민을 중심으로 세 가지 토닝 구성을 상담하는 상품입니다.";
pkg.packageBySession = true;
pkg.composition = Array.from(
  { length: 10 },
  (_, i) =>
    `${i + 1}주차 기미토닝 + 피코토닝 + 콜라겐토닝${[2, 5, 8].includes(i) ? " + LDM물방울레이저" : ""}`,
).join("\n");
pkg.options = [
  { ...pkg.options[0], label: "5회" },
  { ...pkg.options[0], id: "option-ten", label: "10회" },
];
const browser = await chromium.launch({ args: ["--no-sandbox"] });
try {
  for (const width of [1440, 768, 390]) {
    const page = await browser.newPage({ viewport: { width, height: 1000 } });
    const errors: string[] = [];
    page.on("pageerror", (e) => errors.push(e.message));
    await page.addInitScript("window.__name=(fn)=>fn;");
    await page.route("**/api/**", (r) =>
      r.fulfill({
        json:
          new URL(r.request().url()).pathname === "/api/public/catalog"
            ? {
                products: publicProducts(state),
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
    const event = page.getByRole("region", { name: "이벤트", exact: true }),
      other = page.getByRole("region", { name: "추천시술", exact: true });
    await expect(event).toContainText(
      "기미 상태를 확인하고 진행하는 맞춤 관리입니다.",
    );
    await expect(event).not.toContainText("VAT");
    await expect(other).toContainText("저장한 상품 설명");
    const card = page
      .locator(".pd-product")
      .filter({ hasText: "기미토닝 + 피코토닝 + 콜라겐토닝" });
    await expect(card).toContainText("공통 상품 설명");
    await card.getByText("5회 패키지 구성 보기", { exact: true }).click();
    const five = card.locator(".pd-package-composition").first();
    await expect(five).toContainText("5주차");
    await expect(five).not.toContainText("6주차");
    await card.getByText("10회 패키지 구성 보기", { exact: true }).click();
    await expect(card.locator(".pd-package-composition").nth(1)).toContainText(
      "10주차",
    );
    assert.ok(
      await card
        .locator("h3")
        .evaluate((el) => parseFloat(getComputedStyle(el).fontWeight) >= 700),
    );
    await expect(other).not.toContainText("123,456");
    const expand = event.getByRole("button", { name: "설명 전체 보기" });
    await expect(expand).toHaveAttribute("aria-expanded", "false");
    const p = event.locator(".pd-product-copy");
    const collapsed = (await p.boundingBox())!.height;
    await expand.click();
    await expect(
      event.getByRole("button", { name: "설명 접기" }),
    ).toHaveAttribute("aria-expanded", "true");
    assert.ok((await p.boundingBox())!.height > collapsed);
    assert.equal(await page.evaluate("window.descriptionInjected"), undefined);
    assert.equal(
      await page.evaluate("document.documentElement.scrollWidth>innerWidth"),
      false,
    );
    assert.deepEqual(errors, []);
    await page.screenshot({
      path: `artifacts/product-descriptions-${width}.png`,
      fullPage: true,
    });
    await page.close();
    console.log(`description UI ${width}px passed`);
  }
} finally {
  await browser.close();
}
