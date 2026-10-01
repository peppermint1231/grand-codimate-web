import { chromium, expect } from "@playwright/test";
import assert from "node:assert/strict";
import { writeFile } from "node:fs/promises";
import { emptyState, emptyQuote } from "../src/core/model";
import { threeCatalogs, catalogAdmin } from "../tests/fixtures/catalogs";
import { expandHospitalInsurancePrices } from "../src/core/insuranceCatalogExpansion";
import { addHospitalInsurancePrices } from "../src/core/insuranceCatalog";
import { applyCommand } from "../src/core/domain";
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
    await page.getByRole("button", { name: "보험 SSOT", exact: true }).click();
    await expect(
      page.getByRole("button", { name: "홈페이지 갱신", exact: true }),
    ).toHaveCount(0);
    const rows = page.getByRole("region", { name: "상품 목록", exact: true });
    const filter = page.getByLabel("검토 항목", { exact: true });
    await expect(rows.locator("article.catalog-product-row")).toHaveCount(11);
    await filter.selectOption("unreviewed");
    await expect(rows.locator("article.catalog-product-row")).toHaveCount(1);
    await filter.selectOption("active");
    await expect(rows.locator("article.catalog-product-row")).toHaveCount(10);
    await filter.selectOption("inactive");
    await expect(rows.locator("article.catalog-product-row")).toHaveCount(1);
    await filter.selectOption("all");
    await page
      .getByRole("button", { name: "단가표 수정", exact: true })
      .click();
    await rows.getByLabel("대상포진 수액 선택", { exact: true }).check();
    await rows.getByLabel("덱세릴MD크림 선택", { exact: true }).check();
    await rows
      .getByRole("button", { name: "일괄 수정 (2개)", exact: true })
      .click();
    const modal = page.getByRole("dialog", {
      name: "선택 상품 일괄 수정",
      exact: true,
    });
    await modal
      .getByLabel("일괄 메뉴 판매", { exact: true })
      .selectOption("inactive");
    await expect(
      modal.getByRole("button", { name: "저장하고 적용", exact: true }),
    ).toBeDisabled();
    await modal.getByRole("button", { name: "닫기", exact: true }).focus();
    await page.keyboard.press("Control+s");
    assert.equal(commands.length, 0);
    await page.keyboard.press("Alt+Shift+b");
    await expect(
      modal.getByRole("button", { name: "저장하고 적용", exact: true }),
    ).toBeEnabled();
    assert.equal(commands.length, 0);
    await page.screenshot({
      path: `artifacts/catalog-bulk-${viewport.width}.png`,
    });
    await modal
      .getByRole("button", { name: "저장하고 적용", exact: true })
      .click();
    await expect(modal).toHaveCount(0);
    await expect(page.locator(".catalog-save-status")).toContainText("적용됨");
    assert.deepEqual(commands, ["catalog.apply"]);
    assert.equal(
      state.catalogs.at(-1)!.products.filter((p) => p.active).length,
      8,
    );
    assert.equal(state.catalogs[1].products.filter((p) => p.active).length, 10);
    await filter.selectOption("inactive");
    await expect(rows.locator("article.catalog-product-row")).toHaveCount(3);
    await filter.selectOption("all");
    await page
      .getByRole("button", { name: "단가표 수정", exact: true })
      .click();
    await rows
      .getByRole("button", {
        name: "대상포진 수액 메뉴 판매 비활성",
        exact: true,
      })
      .click();
    await page
      .locator(".catalog-product-save")
      .getByRole("button", { name: "저장하고 적용", exact: true })
      .click();
    await expect(page.locator(".catalog-save-status")).toContainText("적용됨");
    assert.equal(
      state.catalogs.at(-1)!.products.find((p) => p.name === "대상포진 수액")
        ?.active,
      true,
    );
    await rows.scrollIntoViewIfNeeded();
    await page.screenshot({
      path: `artifacts/catalog-filters-${viewport.width}.png`,
    });
    assert(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    );
    await page
      .getByLabel("단가표 버전", { exact: true })
      .selectOption(state.catalogs[1].id);
    await expect(page.locator(".catalog-save-status")).toContainText(
      "이전 기록",
    );
    await expect(page.locator(".catalog-save-status")).toContainText(
      "현재 상담에 적용된 버전이 아닙니다",
    );
    assert.deepEqual(errors, []);
    results.push({
      viewport,
      filters: true,
      selectionBulkModal: true,
      oneStepSave: true,
      oldVersionsPreserved: true,
      perItemToggle: true,
      noOverflow: true,
      commands,
    });
    await page.close();
  }
} finally {
  await browser.close();
}
await writeFile(
  "artifacts/catalog-browser-0134.json",
  JSON.stringify(results, null, 2),
);
console.log(JSON.stringify(results));
