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
    let failSave = false;
    let visibleUser = catalogAdmin;
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
    page.on("pageerror", (e) => {
      errors.push(e.message);
      console.log("BROWSER ERROR", e.message);
    });
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
        json = { state, user: visibleUser, pending: 0 };
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
          if (
            failSave &&
            route.request().postDataJSON().type === "consultation.save"
          )
            throw new Error("저장 테스트 실패");
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
    await page.screenshot({ path: "artifacts/exit-start.png" });
    const nav = async (name: string) => {
      await expect(page.locator(".app-shell")).toBeVisible();
      const button = page.getByRole("button", { name, exact: true });
      if (!(await button.isVisible()))
        await page
          .getByRole("button", { name: "메뉴 펼치기", exact: true })
          .click();
      await button.click();
    };
    const open = async () => {
      await nav("상담이력");
      await page
        .locator('button.list-row, [role="link"].list-row')
        .filter({ hasText: "보험검증환자" })
        .first()
        .click();
    };
    console.log("opening", viewport.width);
    await open();
    const picker = page.getByRole("region", {
      name: "시술 선택 목록",
      exact: true,
    });
    await picker.locator("button.option-row").first().click();
    await page
      .locator(".consult-floating-actions")
      .getByRole("button", { name: /메모/ })
      .click();
    await page
      .getByLabel("상담 메모", { exact: true })
      .fill("이탈 보존 시험 메모");
    await page
      .getByRole("dialog", { name: "상담메모", exact: true })
      .getByRole("button", { name: "닫기", exact: true })
      .click();
    const exit = page.getByRole("dialog", {
      name: "상담을 마치고 이동할까요?",
    });
    await page.getByRole("button", { name: "환자 상세로 돌아가기" }).click();
    await expect(exit).toBeVisible();
    await exit.getByRole("button", { name: "계속 상담하기" }).click();
    await expect(page.locator(".consultation-header")).toBeVisible();
    const beforeUnload = await page.evaluate(() => {
      const event = new Event("beforeunload", { cancelable: true });
      window.dispatchEvent(event);
      return event.defaultPrevented;
    });
    assert(beforeUnload);
    await page.getByRole("button", { name: "환자 상세로 돌아가기" }).click();
    failSave = true;
    await exit.getByRole("button", { name: "보류·변경 저장 후 이동" }).click();
    await expect(
      exit.getByText(
        "저장 완료를 확인하지 못했습니다. 화면을 유지하고 다시 확인해주세요.",
      ),
    ).toBeVisible();
    assert.equal(state.consultations[0].memo, "");
    failSave = false;
    await exit.getByRole("button", { name: "보류·변경 저장 후 이동" }).click();
    await expect(page.locator(".consultation-header")).toHaveCount(0);
    assert.equal(state.consultations[0].memo, "이탈 보존 시험 메모");
    assert.equal(state.consultations[0].status, "H");
    console.log("opening", viewport.width);
    await open();
    await page
      .locator(".consult-floating-actions")
      .getByRole("button", { name: /메모/ })
      .click();
    await page
      .getByLabel("상담 메모", { exact: true })
      .fill("성공 직전 변경도 저장");
    await page
      .getByRole("dialog", { name: "상담메모", exact: true })
      .getByRole("button", { name: "닫기", exact: true })
      .click();
    // Browser back and native back must route through the same consultation guard.
    await page.goBack();
    await expect(exit).toBeVisible();
    await exit.getByRole("button", { name: "계속 상담하기" }).click();
    await page.evaluate(() => window.dispatchEvent(new Event("codimate:back")));
    await expect(exit).toBeVisible();
    await exit.getByRole("button", { name: "상담 완료 · 성공" }).click();
    await expect(exit).toHaveCount(0);
    await expect.poll(() => state.consultations[0].status).toBe("P");
    await nav("상담이력");
    await expect(page.locator(".unpaid-badge")).toContainText("미수납");
    assert(state.consultations[0].quote.total > 0);
    assert.equal(state.consultations[0].memo, "성공 직전 변경도 저장");
    // A fully paid consultation is no longer marked unpaid; money permission hides the badge.
    const originalLedger = structuredClone(state.ledger);
    state.ledger = [
      {
        id: "paid",
        rev: 1,
        createdAt: base.createdAt,
        updatedAt: base.updatedAt,
        patientId: "patient",
        consultationId: "consult",
        kind: "receipt",
        amount: state.consultations[0].quote.total,
        method: "카드",
        authorId: "admin",
        date: base.createdAt,
        reason: "시험",
      } as any,
    ];
    await page.reload();
    await nav("상담이력");
    await expect(page.locator(".unpaid-badge")).toHaveCount(0);
    state.ledger = originalLedger;
    visibleUser = {
      ...catalogAdmin,
      role: "desk",
      permissionLevel: "standard",
      permissions: { "money.read": false },
    };
    await page.reload();
    await nav("상담이력");
    await expect(page.locator(".unpaid-badge")).toHaveCount(0);
    visibleUser = catalogAdmin;
    // Failure completion also persists the edited memo before finalizing.
    state.consultations.push({
      ...structuredClone(state.consultations[0]),
      id: "failed-consult",
      rev: 1,
      status: "H",
      quote: emptyQuote(),
      memo: "",
    });
    await page.reload();
    await open();
    await page
      .locator(".consult-floating-actions")
      .getByRole("button", { name: /메모/ })
      .click();
    await page.getByLabel("상담 메모", { exact: true }).fill("실패 사유 메모");
    await page
      .getByRole("dialog", { name: "상담메모", exact: true })
      .getByRole("button", { name: "닫기", exact: true })
      .click();
    await page.getByRole("button", { name: "환자 상세로 돌아가기" }).click();
    await exit.getByRole("button", { name: "상담 완료 · 실패" }).click();
    await expect.poll(() => state.consultations.at(-1)?.status).toBe("F");
    assert.equal(state.consultations.at(-1)?.memo, "실패 사유 메모");
    // Price-management activation has no separate review checkbox.
    await nav("단가표 관리");
    await page
      .getByRole("button", { name: "단가표 수정", exact: true })
      .click();
    await page
      .getByRole("button", { name: "현재 목록 선택", exact: true })
      .click();
    await page.getByRole("button", { name: /일괄 수정 \(/ }).click();
    const bulk = page.getByRole("region", {
      name: "선택 상품 일괄 수정",
      exact: true,
    });
    await expect(bulk.getByRole("checkbox", { name: /검토/ })).toHaveCount(0);
    await bulk
      .getByLabel("일괄 메뉴 판매", { exact: true })
      .selectOption("active");
    await bulk
      .getByRole("button", { name: "선택 상품 일괄 적용", exact: true })
      .click();
    await expect(bulk.getByRole("status")).toContainText("0개 미적용");
    assert.deepEqual(errors, []);
    assert(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth + 1,
      ),
    );
    console.log("passed", viewport.width);
    results.push({
      viewport,
      saveFailureStayed: true,
      pendingSaved: true,
      browserAndNativeBack: true,
      successFinalized: true,
      unpaidBadge: true,
      noSeparateReview: true,
    });
    await page.screenshot({
      path: `artifacts/consult-exit-${viewport.width}-0136.png`,
    });
    await page.close({ runBeforeUnload: false });
  }
  await writeFile(
    "artifacts/consult-exit-browser-0136.json",
    JSON.stringify(results, null, 2),
  );
  console.log(JSON.stringify(results));
} finally {
  await browser.close();
}
