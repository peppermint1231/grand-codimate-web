import { chromium, expect } from "@playwright/test";
import assert from "node:assert/strict";
import { writeFile } from "node:fs/promises";
import { emptyState } from "../src/core/model";
import { threeCatalogs } from "../tests/fixtures/catalogs";
import { publicProducts } from "../src/core/discovery";
import { patientConcerns } from "../src/core/patientDiscovery";
const state = emptyState();
state.catalogs = threeCatalogs();
state.catalogs.forEach((c, i) => {
  c.products[0] = {
    ...c.products[0],
    publicVisible: true,
    name: [
      "리팟 흑자제거",
      "잡티·색소 상담 프로그램",
      "기미·잡티 토닝 프로그램",
    ][i],
    description: "색소·잡티 상담",
    composition: "",
    options: [
      { ...c.products[0].options[0], price: 100000, label: "1회 상담 구성" },
    ],
  };
  // Reused imported IDs must remain book/version scoped.
  c.products[0].id = "same-id";
  c.products[0].options[0].id = "same-option";
});
const products = publicProducts(state);
const browser = await chromium.launch({ args: ["--no-sandbox"] });
const results = [];
try {
  for (const width of [1440, 768, 390, 320]) {
    const page = await browser.newPage({
      viewport: { width, height: 1050 },
      hasTouch: width < 1000,
    });
    const errors: string[] = [];
    page.on("pageerror", (e) => errors.push(e.message));
    let payload: any;
    await page.route("**/api/**", async (route) => {
      const path = new URL(route.request().url()).pathname;
      if (path === "/api/public/catalog")
        return route.fulfill({
          json: {
            products,
            patientConcerns,
            categories: [],
            token: "fixture-token",
          },
        });
      if (path === "/api/public/inquiries") {
        payload = route.request().postDataJSON();
        return route.fulfill({ json: { receipt: "fixture-receipt-1234" } });
      }
      return route.fulfill({ json: {} });
    });
    await page.goto("http://127.0.0.1:5198/discover");
    await expect(
      page.getByRole("heading", {
        name: "가장 고민되는 곳은 어디인가요?",
        exact: true,
      }),
    ).toBeVisible();
    await expect(page.locator(".pd-concern-card")).toHaveCount(16);
    const cardText = await page.locator(".pd-concern-grid").innerText();
    assert.ok(!/IVNT|닥터플랜|멤버|미분류|검토 필요/.test(cardText));
    await expect(
      page.getByRole("button", { name: "홈페이지", exact: true }),
    ).toHaveCount(0);
    await expect(
      page.getByRole("button", { name: "보험", exact: true }),
    ).toHaveCount(0);
    await page.screenshot({
      path: `artifacts/patient-discovery-start-${width}.png`,
      fullPage: true,
    });
    await page
      .locator(".pd-concern-card")
      .filter({ hasText: "점·잡티·기미" })
      .click();
    await expect(
      page.getByRole("heading", {
        name: "어떤 상태와 가장 비슷한가요?",
        exact: true,
      }),
    ).toBeVisible();
    await page.screenshot({
      path: `artifacts/patient-discovery-detail-${width}.png`,
      fullPage: true,
    });
    await page
      .getByRole("button", { name: /잡티·주근깨가 눈에 띄어요/ })
      .click();
    await expect(page.locator(".pd-product")).toHaveCount(3);
    for (const option of await page.locator(".pd-option").all())
      await option.click();
    await expect(
      page.getByText("관심 시술 3개", { exact: true }),
    ).toBeVisible();
    await page.screenshot({
      path: `artifacts/patient-discovery-results-${width}.png`,
      fullPage: true,
    });
    await page.getByRole("button", { name: /큰 글씨/ }).click();
    const overflow = await page.evaluate(() =>
      [...document.querySelectorAll("body *")].flatMap((el) => {
        const r = el.getBoundingClientRect();
        return r.right > innerWidth + 1
          ? [
              {
                tag: el.tagName,
                cls: el.className,
                right: r.right,
                width: r.width,
              },
            ]
          : [];
      }),
    );
    if (overflow.length) console.log(JSON.stringify({ width, overflow }));
    await page.screenshot({
      path: `artifacts/patient-discovery-large-${width}.png`,
      fullPage: true,
    });
    assert.ok(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth + 1,
      ),
      `large text overflow ${width}`,
    );
    await page.getByRole("button", { name: /상담으로 이어가기/ }).click();
    await page.getByLabel("이름 필수", { exact: true }).fill("환자용시험");
    await page.getByLabel("연락처 필수", { exact: true }).fill("01000000000");
    await page
      .getByLabel("개인정보 수집·이용에 동의합니다. (필수)", { exact: true })
      .check();
    await page
      .getByLabel(
        "고민·관심 시술 등 건강 관련 정보의 수집·이용에 동의합니다. (필수)",
        { exact: true },
      )
      .check();
    await page
      .getByRole("button", { name: "상담 요청 보내기", exact: true })
      .click();
    await expect(
      page.getByRole("heading", { name: /선택하신 내용을.*병원에 전달했어요/ }),
    ).toBeVisible();
    assert.equal(
      new Set(payload.selections.map((s: any) => s.catalogVersion)).size,
      3,
    );
    assert.deepEqual(payload.concerns, ["patient:pigment"]);
    assert.deepEqual(payload.answers, ["spots"]);
    assert.equal(errors.length, 0, errors.join("\n"));
    await page
      .getByRole("button", { name: "처음으로 돌아가기", exact: true })
      .click();
    await page.locator(".pd-concern-card").filter({ hasText: "탈모" }).click();
    await page.getByRole("button", { name: /잘 모르겠어요/ }).click();
    await expect(
      page.getByRole("heading", {
        name: "정확한 시술은 상담으로 찾아드릴게요",
        exact: true,
      }),
    ).toBeVisible();
    await page.getByRole("button", { name: /상담으로 이어가기/ }).click();
    await expect(page.getByLabel("이름 필수", { exact: true })).toHaveValue("");
    assert.ok(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth + 1,
      ),
    );
    results.push({
      width,
      threeBooksIntegrated: true,
      patientSteps: true,
      largeText: true,
      unknownConcern: true,
      submission: true,
      privateInputReset: true,
      runtimeErrors: errors.length,
    });
    await page.close();
  }
  const kiosk = await browser.newPage({
    viewport: { width: 768, height: 1050 },
  });
  await kiosk.clock.install();
  await kiosk.route("**/api/**", (route) =>
    route.fulfill({
      json: { products, patientConcerns, categories: [], token: "kiosk-token" },
    }),
  );
  await kiosk.goto("http://127.0.0.1:5198/discover?kiosk=1");
  await kiosk.locator(".pd-concern-card").filter({ hasText: "탈모" }).click();
  await kiosk.getByRole("button", { name: /잘 모르겠어요/ }).click();
  await kiosk.getByRole("button", { name: /상담으로 이어가기/ }).click();
  await kiosk.getByLabel("이름 필수", { exact: true }).fill("공용기기 시험");
  await kiosk.getByLabel("연락처 필수", { exact: true }).fill("01000000000");
  await kiosk.clock.fastForward(190000);
  await expect(
    kiosk.getByRole("heading", {
      name: "가장 고민되는 곳은 어디인가요?",
      exact: true,
    }),
  ).toBeVisible();
  await kiosk.locator(".pd-concern-card").filter({ hasText: "탈모" }).click();
  await kiosk.getByRole("button", { name: /잘 모르겠어요/ }).click();
  await kiosk.getByRole("button", { name: /상담으로 이어가기/ }).click();
  await expect(kiosk.getByLabel("이름 필수", { exact: true })).toHaveValue("");
  await expect(kiosk.getByLabel("연락처 필수", { exact: true })).toHaveValue(
    "",
  );
  results.push({ kioskPrivacyReset: true });
  await kiosk.close();
  await writeFile(
    "artifacts/patient-discovery-browser.json",
    JSON.stringify(results, null, 2),
  );
  console.log(JSON.stringify(results));
} finally {
  await browser.close();
}
