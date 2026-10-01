import { chromium, expect } from "@playwright/test";
import assert from "node:assert/strict";
import { writeFile } from "node:fs/promises";
import { emptyState, emptyQuote } from "../src/core/model";
import { threeCatalogs, catalogAdmin } from "../tests/fixtures/catalogs";
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
    const insurance = addHospitalInsurancePrices(state.catalogs[1]);
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
    await expect(rows.getByText("실비 불가", { exact: true })).toHaveCount(1);
    await expect(rows.getByText("실비 청구 가능", { exact: true })).toHaveCount(
      3,
    );
    await expect(rows.getByText(/공단 청구액 7,770원 별도/)).toBeVisible();
    await page
      .getByRole("button", { name: "복제·이전 버전 복원 초안", exact: true })
      .click();
    await page
      .getByRole("button", {
        name: "조갑백선 피부밀봉붕대요법 (Fu 프로그램) 상세 편집",
        exact: true,
      })
      .click();
    const editor = page.locator("[data-catalog-product-editor]");
    await expect(editor.getByLabel("급여 구분", { exact: true })).toHaveValue(
      "covered",
    );
    await expect(
      editor.getByLabel("실비 청구 가능 여부", { exact: true }),
    ).toHaveValue("eligible");
    await expect(
      editor.getByLabel("1회 · 1지 본인부담금 공단 청구액", { exact: true }),
    ).toHaveValue("7770");
    await editor
      .getByLabel("실비 청구 가능 여부", { exact: true })
      .selectOption("check");
    await editor
      .getByRole("button", { name: "검토 내용 초안 저장", exact: true })
      .click();
    await expect(rows.getByText("실비 확인 필요", { exact: true })).toHaveCount(
      2,
    );
    await rows.scrollIntoViewIfNeeded();
    await page.screenshot({
      path: `artifacts/insurance-catalog-${viewport.width}.png`,
    });
    // Open a synthetic consultation and verify the patient-facing price, with no real patient writes.
    await page.getByRole("button", { name: "환자목록", exact: true }).click();
    await page.getByText("보험검증환자", { exact: true }).first().click();
    await page
      .locator(".card")
      .filter({
        has: page.getByRole("heading", { name: "상담이력", exact: true }),
      })
      .locator("button.list-row")
      .first()
      .click();
    await page.getByRole("button", { name: /02.*상담/ }).click();
    await page
      .getByLabel("상담 단가표 구분")
      .getByRole("button", { name: "보험", exact: true })
      .click();
    const treatment = page
      .locator(".product")
      .filter({
        has: page.getByText("조갑백선 피부밀봉붕대요법 (Fu 프로그램)", {
          exact: true,
        }),
      });
    await expect(treatment.getByText("급여", { exact: true })).toBeVisible();
    await expect(
      treatment.getByText("실비 청구 가능", { exact: true }),
    ).toBeVisible();
    await expect(treatment.getByText(/공단 청구액 7,770원 별도/)).toBeVisible();
    await treatment.scrollIntoViewIfNeeded();
    await page.screenshot({
      path: `artifacts/insurance-consultation-${viewport.width}.png`,
    });
    assert(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    );
    assert.deepEqual(errors, []);
    results.push({
      viewport,
      coverageBadges: true,
      reimbursementEditable: true,
      claimSeparate: true,
      consultationBadges: true,
      noOverflow: true,
      errors,
    });
    await page.close();
  }
} finally {
  await browser.close();
}
await writeFile(
  "artifacts/insurance-browser-0133.json",
  JSON.stringify(results, null, 2),
);
console.log(JSON.stringify(results));
