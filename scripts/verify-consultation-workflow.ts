import { chromium, expect } from "@playwright/test";
import assert from "node:assert/strict";
import { writeFile } from "node:fs/promises";
import { emptyState, emptyQuote } from "../src/core/model";
import { catalogAdmin, threeCatalogs } from "../tests/fixtures/catalogs";
import { applyCommand } from "../src/core/domain";
import { diffStateChanges } from "../src/core/stateChanges";
import {
  defaultVipPolicy,
  pointBalance,
  reconcileVip,
} from "../src/core/vipPoints";
const browser = await chromium.launch({ args: ["--no-sandbox"] });
const results: unknown[] = [];
try {
  for (const width of [1440, 768, 390]) {
    let state = emptyState();
    const now = new Date().toISOString();
    const base = { rev: 1, createdAt: now, updatedAt: now };
    state.users = [
      catalogAdmin,
      {
        ...catalogAdmin,
        id: "doctor1",
        name: "의사A",
        role: "doctor",
        permissionLevel: "standard",
      },
      {
        ...catalogAdmin,
        id: "doctor2",
        name: "의사B",
        role: "doctor",
        permissionLevel: "standard",
      },
    ];
    state.catalogs = threeCatalogs();
    state.policies = [
      {
        ...base,
        id: "grades",
        grades: [
          { id: "VIP", name: "VIP", minimum: 5000000, color: "#145d55" },
        ],
        vip: { ...defaultVipPolicy, enabled: true, startedAt: now },
      },
    ];
    state.patients = [
      {
        ...base,
        id: "vip",
        number: "001",
        name: "포인트검증",
        sex: "F",
        dob: "1990-12-30",
        phone: "01000000001",
        address: "시험동",
        ownerId: "admin",
      },
    ];
    state.consultations = [
      {
        ...base,
        id: "consult",
        patientId: "vip",
        patient: state.patients[0],
        ownerId: "admin",
        category: "미용",
        status: "P",
        cancelled: false,
        catalogVersion: state.catalogs[0].version,
        quote: {
          ...emptyQuote(),
          total: 6000000,
          lines: [
            {
              id: "historical-line",
              productId: "old-laser",
              optionId: "old-option",
              book: "미용",
              catalogVersion: state.catalogs[0].version,
              name: "이전 리팟레이저",
              label: "1+1",
              price: 6000000,
              unit: "회",
              quantity: 1,
              tax: "exempt",
              discount: { kind: "amount", value: 0 },
            },
          ],
        },
        memo: "",
        photos: [
          {
            id: "photo",
            name: "검증사진.jpg",
            mediaId: "media",
            selected: true,
            representative: true,
            rotation: 0,
            annotations: [],
          },
        ],
        appointment: "",
        attendance: "방문",
        documents: [],
      },
    ];
    state.ledger = [
      {
        ...base,
        id: "receipt",
        patientId: "vip",
        consultationId: "consult",
        kind: "receipt",
        amount: 5000000,
        date: now.slice(0, 10),
        method: "카드",
        memo: "",
        actorId: "admin",
      },
    ];
    reconcileVip(state, now, "initial");
    const errors: string[] = [];
    const page = await browser.newPage({ viewport: { width, height: 1000 } });
    page.on("pageerror", (e) => errors.push(e.message));
    page.on("dialog", (d) => d.accept());
    await page.route("**/api/**", async (route) => {
      const path = new URL(route.request().url()).pathname;
      let status = 200,
        json: any = {
          ok: true,
          configured: true,
          mode: "local-development",
          version: "0.14.0",
        };
      if (path.startsWith("/api/media/")) {
        await route.fulfill({
          status: 200,
          contentType: "image/svg+xml",
          body: '<svg xmlns="http://www.w3.org/2000/svg" width="200" height="200"><rect width="200" height="200" fill="#e3eee9"/><circle cx="100" cy="100" r="60" fill="#b5ccbf"/></svg>',
        });
        return;
      }
      if (path === "/api/state")
        json = { state, user: catalogAdmin, pending: 0 };
      else if (path === "/api/opinions") json = { opinions: [] };
      else if (path === "/api/patients/search") {
        status = 503;
        json = { error: "fixture fallback" };
      } else if (path === "/api/commands") {
        try {
          const next = await applyCommand(
            state,
            catalogAdmin,
            route.request().postDataJSON(),
          );
          json = { ok: true, changes: diffStateChanges(state, next) };
          state = next;
        } catch (e: any) {
          status = e.status || 400;
          json = { error: e.message };
        }
      }
      await route.fulfill({ status, json });
    });
    await page.goto("http://127.0.0.1:5198");
    const nav = async (name: string) => {
      await expect(page.locator(".app-shell")).toBeVisible();
      const button = page
        .locator(".sidebar")
        .getByRole("button", { name, exact: true });
      if (!(await button.isVisible()))
        await page
          .getByRole("button", { name: "메뉴 펼치기", exact: true })
          .click();
      await button.click();
    };
    await nav("환자목록");
    await expect(
      page.locator(".patient-grade-badge.vip").first(),
    ).toContainText("VIP");
    await page.screenshot({
      path: `artifacts/workflow-grades-${width}.png`,
      fullPage: true,
    });
    await nav("설정");
    const vipSettings = page.locator(".grade-settings-row").first();
    await vipSettings.locator("summary").click();
    await vipSettings.getByLabel("생일 포인트", { exact: true }).fill("60000");
    await vipSettings
      .getByLabel("이용금액 집계기간 (개월)", { exact: true })
      .fill("6");
    await vipSettings
      .getByLabel("포인트 유효기간 (개월 · 0은 무기한)", { exact: true })
      .fill("0");
    await page
      .getByRole("button", { name: "등급·혜택 저장", exact: true })
      .click();
    await expect(
      page.getByText("등급·혜택을 저장했습니다.", { exact: true }),
    ).toBeVisible();
    assert.equal(state.policies[0].vip?.annualMonths, 6);
    assert.equal(pointBalance(state, "vip"), 100000);
    await page.screenshot({
      path: `artifacts/workflow-benefits-${width}.png`,
      fullPage: true,
    });
    await nav("상담이력");
    await page.getByRole("button", { name: /미수납.*수납 확인/ }).click();
    await expect(
      page.getByRole("region", { name: "미수납 상담" }),
    ).toBeVisible();
    await expect(page.getByLabel("연결 상담", { exact: true })).toHaveValue(
      "consult",
    );
    await expect(page.getByLabel("금액", { exact: true })).toHaveValue(
      "1000000",
    );
    await page.screenshot({
      path: `artifacts/workflow-unpaid-${width}.png`,
      fullPage: true,
    });
    await page
      .getByRole("button", { name: "상담·타임라인", exact: true })
      .click();
    const history = page.locator(".consultation-history-entry").first();
    await expect(history.locator(".history-photo-owner")).toContainText(
      "관리자",
    );
    await expect(history.getByLabel("대표사진 1장")).toBeVisible();
    await page.screenshot({
      path: `artifacts/workflow-history-${width}.png`,
      fullPage: true,
    });
    await history.getByText("상담자 변경", { exact: true }).click();
    await history
      .getByLabel("새 상담자", { exact: true })
      .selectOption("doctor1");
    await history
      .getByLabel("변경 사유", { exact: true })
      .fill("환자 담당 인계");
    await history
      .getByRole("button", { name: "상담자 변경 저장", exact: true })
      .click();
    await expect(history.locator(".consultation-owner > span")).toContainText(
      "의사A",
    );
    assert.equal(state.consultations[0].ownerId, "doctor1");
    await page.getByRole("button", { name: "연장상담", exact: true }).click();
    const renewal = page.getByRole("dialog", {
      name: "연장상담 시작",
      exact: true,
    });
    await renewal.getByLabel("이어갈 이전 상담").selectOption("consult");
    await expect(renewal).toContainText("이전 상담의 단가·부가세로 불러옵니다");
    await expect(
      renewal.getByRole("button", { name: "상담 시작", exact: true }),
    ).toBeEnabled();
    await renewal
      .getByRole("button", { name: "상담 시작", exact: true })
      .click();
    await expect(renewal).not.toBeVisible();
    assert.equal(state.consultations[1].quote.lines[0].price, 6000000);
    await page.getByRole("button", { name: "02 상담", exact: true }).click();
    await page
      .getByRole("button", { name: "의사 의견 요청 열기", exact: true })
      .click();
    await page.getByLabel("의사A", { exact: true }).check();
    await page.getByLabel("의사B", { exact: true }).check();
    await page
      .getByLabel("의사 의견 요청 내용", { exact: true })
      .fill("같은 사진을 보고 각자 의견 부탁드립니다.");
    await page.screenshot({
      path: `artifacts/workflow-opinions-${width}.png`,
      fullPage: true,
    });
    await page
      .getByRole("button", { name: "2명에게 요청 보내기", exact: true })
      .click();
    await expect(
      page.locator(".consultation-opinion-request"),
    ).not.toBeVisible();
    assert.equal(state.opinions.length, 2);
    assert.ok(
      state.opinions.every(
        (o) => o.request === "같은 사진을 보고 각자 의견 부탁드립니다.",
      ),
    );
    assert.equal(errors.length, 0, errors.join("\n"));
    results.push({
      width,
      gradeBadge: true,
      benefitPeriods: true,
      unpaidLink: true,
      ownerChange: true,
      historicalRenewal: true,
      multiDoctor: true,
      errors,
    });
    await page.close();
  }
  await writeFile(
    "artifacts/workflow-browser.json",
    JSON.stringify(results, null, 2),
  );
  console.log(JSON.stringify(results));
} finally {
  await browser.close();
}
