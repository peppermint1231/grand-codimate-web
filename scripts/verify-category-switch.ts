import { chromium, expect } from "@playwright/test";
import assert from "node:assert/strict";
import { writeFile } from "node:fs/promises";
import { emptyState, emptyQuote } from "../src/core/model";
import { threeCatalogs, catalogAdmin } from "../tests/fixtures/catalogs";
import { expandHospitalInsurancePrices } from "../src/core/insuranceCatalogExpansion";
import { addHospitalInsurancePrices } from "../src/core/insuranceCatalog";
import { applyCommand } from "../src/core/domain";
import {
  mergeHomepageCatalog,
  activateHomepageCatalog,
} from "../src/core/websiteCatalog";
import { diffStateChanges } from "../src/core/stateChanges";
const browser = await chromium.launch({ args: ["--no-sandbox"] });
const results = [];
try {
  for (const viewport of [
    { width: 1440, height: 1000 },
    { width: 768, height: 1024 },
    { width: 390, height: 844 },
  ]) {
    let state = emptyState();
    state.users = [catalogAdmin];
    state.catalogs = threeCatalogs();
    const insurance = expandHospitalInsurancePrices(
      addHospitalInsurancePrices(state.catalogs[1]),
      { tax: "inclusive", zosterPerVisit: true },
    );
    insurance.products[0].active = false;
    insurance.products[0].options[0].review = true;
    const commands: string[] = [];
    insurance.status = "published";
    insurance.publishedAt = new Date().toISOString();
    state.catalogs[1] = insurance;
    const pages = [
      {
        id: "10",
        categoryId: "1",
        categoryName: "특별 이벤트",
        name: "10월 행사",
        description: "",
        url: "https://www.grand4.co.kr/clinicPrice/clinicView.php?i=10",
        posterUrls: [],
        period: "",
        offers: [
          {
            id: "1",
            name: "테스트 색소 프로그램",
            description: "설명",
            price: 12000,
            regularPrice: 15000,
            discountRate: 20,
            priceText: "12,000원",
            tax: "exclusive" as const,
            issues: [],
          },
        ],
      },
      {
        id: "11",
        categoryId: "2",
        categoryName: "리프팅",
        name: "탄력 프로그램",
        description: "",
        url: "https://www.grand4.co.kr/clinicPrice/clinicView.php?i=11",
        posterUrls: [],
        period: "",
        offers: [
          {
            id: "2",
            name: "테스트 탄력 프로그램",
            description: "설명",
            price: 30000,
            regularPrice: 40000,
            discountRate: 25,
            priceText: "30,000원",
            tax: "exclusive" as const,
            issues: [],
          },
        ],
      },
    ];
    const homepage = activateHomepageCatalog(
      mergeHomepageCatalog(state.catalogs[0], undefined, pages).catalog,
      { activate: true, publish: true, unknownTax: "exclusive" },
    ).catalog;
    homepage.status = "published";
    homepage.publishedAt = new Date().toISOString();
    state.catalogs[2] = homepage;
    const sourceFolders = homepage.products.map((p) => p.folderId);
    const base = { rev: 1, createdAt: "2026-10-01", updatedAt: "2026-10-01" };
    state.patients = [
      {
        ...base,
        id: "patient",
        number: "001",
        name: "보험검증환자",
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
        category: "보험",
        status: "H",
        cancelled: false,
        catalogVersion: insurance.version,
        catalogVersions: { 보험: insurance.version },
        quote: emptyQuote(),
        memo: "",
        photos: [],
        appointment: "",
        attendance: "미정",
        documents: [],
      },
    ];
    const page = await browser.newPage({ viewport });
    const errors: string[] = [];
    page.on("pageerror", (e) => errors.push(e.message));
    await page.route("**/api/**", async (route) => {
      const path = new URL(route.request().url()).pathname;
      let status = 200,
        json: any = {
          ok: true,
          configured: true,
          mode: "local-development",
          version: "0.13.3",
        };
      if (path === "/api/state")
        json = { state, user: catalogAdmin, pending: 0 };
      else if (path === "/api/opinions") json = { opinions: [] };
      else if (path === "/api/patients/search") {
        status = 503;
        json = { error: "fixture" };
      } else if (path === "/api/catalog-history") json = { revisions: [] };
      else if (path.startsWith("/api/catalogs/"))
        json = {
          catalog: state.catalogs.find(
            (c) => c.id === decodeURIComponent(path.split("/").at(-1)!),
          ),
        };
      else if (path === "/api/commands") {
        try {
          commands.push(route.request().postDataJSON().type);
          const after = await applyCommand(
            state,
            catalogAdmin,
            route.request().postDataJSON(),
          );
          json = { ok: true, changes: diffStateChanges(state, after) };
          state = after;
        } catch (e: any) {
          status = e.status || 400;
          json = { error: e.message };
        }
      }
      await route.fulfill({ status, json });
    });
    await page.goto("http://127.0.0.1:5198");
    await page
      .getByRole("button", { name: "단가표 관리", exact: true })
      .click();
    const rows = page.getByRole("region", { name: "상품 목록", exact: true });
    await page
      .getByRole("button", { name: "홈페이지 분류", exact: true })
      .click();
    const folderPanel = page.getByRole("complementary", {
      name: "홈페이지 폴더 목록",
      exact: true,
    });
    await expect(
      folderPanel.getByRole("button", { name: "폴더 목록 수정", exact: true }),
    ).toHaveCount(0);
    await folderPanel
      .locator("button.folder-node")
      .filter({ hasText: "특별 이벤트" })
      .click();
    await expect(rows.locator("article.catalog-product-row")).toHaveCount(1);
    await expect(rows).toContainText("테스트 색소 프로그램");
    await page.getByRole("button", { name: "고민별", exact: true }).click();
    await expect(rows.locator("article.catalog-product-row")).toHaveCount(2);
    await page
      .getByRole("button", { name: "홈페이지 분류", exact: true })
      .click();
    await page
      .getByRole("button", { name: "단가표 수정", exact: true })
      .click();
    await rows
      .getByRole("button", { name: "현재 목록 선택", exact: true })
      .click();
    await rows
      .getByRole("button", { name: "일괄 수정 (2개)", exact: true })
      .click();
    const modal = page.getByRole("dialog", {
      name: "선택 상품 일괄 수정",
      exact: true,
    });
    await modal
      .getByLabel("일괄 부가세 정책", { exact: true })
      .selectOption("inclusive");
    await modal
      .getByRole("button", { name: "선택 상품 일괄 적용", exact: true })
      .click();
    await modal
      .getByRole("button", { name: "저장하고 적용", exact: true })
      .click();
    await expect(modal).toHaveCount(0);
    assert.deepEqual(
      state.catalogs.at(-1)!.products.map((p) => p.folderId),
      sourceFolders,
    );
    assert(
      state.catalogs
        .at(-1)!
        .products.every((p) => p.options[0].tax === "inclusive"),
    );
    assert(
      !state.catalogs
        .at(-1)!
        .folderTree?.some((f) => f.id.startsWith("website-category:")),
    );
    await page.getByRole("button", { name: "환자목록", exact: true }).click();
    await page.getByText("보험검증환자", { exact: true }).first().click();
    await page
      .locator(".card")
      .filter({
        has: page.getByRole("heading", { name: "상담이력", exact: true }),
      })
      .locator('button.list-row, [role="link"].list-row')
      .first()
      .click();
    await page.getByRole("button", { name: /02.*상담/ }).click();
    await page
      .getByLabel("상담 단가표 구분")
      .getByRole("button", { name: "홈페이지", exact: true })
      .click();
    const picker = page.getByRole("region", {
      name: "시술 선택 목록",
      exact: true,
    });
    await picker
      .getByRole("button", { name: "홈페이지 분류", exact: true })
      .click();
    const category = picker.getByLabel("시술 카테고리", { exact: true });
    await category.selectOption({ label: "특별 이벤트" });
    await expect(picker.locator(".product")).toHaveCount(1);
    await picker.locator("button.option-row").click();
    const cart = page
      .locator(".consult-floating-actions")
      .getByRole("button", { name: /장바구니/ });
    const before = await cart.textContent();
    await picker.getByRole("button", { name: "고민별", exact: true }).click();
    await expect(picker.locator(".product")).toHaveCount(2);
    await picker
      .getByRole("button", { name: "홈페이지 분류", exact: true })
      .click();
    assert.equal(await cart.textContent(), before);
    await expect(category).toHaveValue("");
    await category.selectOption({ label: "리프팅" });
    await expect(picker.locator(".product")).toHaveCount(1);
    await expect(picker.locator(".product")).toContainText(
      "테스트 탄력 프로그램",
    );
    await picker.scrollIntoViewIfNeeded();
    await page.screenshot({
      path: `artifacts/category-switch-${viewport.width}.png`,
    });
    assert(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    );
    assert.deepEqual(errors, []);
    assert.deepEqual(commands, ["catalog.apply"]);
    results.push({
      viewport,
      adminSwitch: true,
      sourceFoldersPreservedAfterEdit: true,
      consultationSwitch: true,
      cartPreserved: true,
      noOverflow: true,
    });
    await page.close();
  }
} finally {
  await browser.close();
}
await writeFile(
  "artifacts/category-browser-0135.json",
  JSON.stringify(results, null, 2),
);
console.log(JSON.stringify(results));
