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
    state.users = [catalogAdmin];
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
        quote: { ...emptyQuote(), total: 6000000 },
        memo: "",
        photos: [],
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
    await page.locator("tbody tr").filter({ hasText: "포인트검증" }).click();
    await page
      .getByRole("button", { name: "VIP·포인트 100,000P", exact: true })
      .click();
    await expect(page.locator(".points-balance")).toHaveText("100,000 P");
    await expect(
      page.getByText("1P = 1원 · 유효기간 없음 · 본인만 사용"),
    ).toBeVisible();
    await page
      .getByRole("button", { name: "카드 발급 기록", exact: true })
      .click();
    await expect(
      page.getByRole("button", { name: "카드 발급 기록 완료", exact: true }),
    ).toBeDisabled();
    await page.screenshot({
      path: `artifacts/vip-points-${width}.png`,
      fullPage: true,
    });
    assert.ok(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth + 1,
      ),
      "page width overflow",
    );
    await page
      .getByRole("button", { name: "수납에서 포인트 사용·반환" })
      .click();
    const ledger = page
      .locator("form")
      .filter({ has: page.getByRole("heading", { name: "금액 기록" }) });
    await ledger.getByLabel("방법", { exact: true }).selectOption("VIP 포인트");
    await ledger.getByLabel("금액", { exact: true }).fill("10000");
    await ledger.getByRole("button", { name: "기록 확정" }).click();
    await expect(
      page.getByRole("button", { name: "VIP·포인트 90,000P", exact: true }),
    ).toBeVisible();
    await ledger.getByLabel("구분", { exact: true }).selectOption("refund");
    const pointReceipt = state.ledger.find((l) => l.tender === "points")!;
    await ledger
      .getByLabel("원수납", { exact: true })
      .selectOption(pointReceipt.id);
    await expect(ledger.getByLabel("방법", { exact: true })).toBeDisabled();
    await expect(ledger.getByLabel("방법", { exact: true })).toHaveValue(
      "VIP 포인트",
    );
    await ledger.getByLabel("금액", { exact: true }).fill("10000");
    await ledger
      .getByLabel("메모·사유", { exact: true })
      .fill("포인트 결제 취소");
    await ledger.getByRole("button", { name: "기록 확정" }).click();
    await expect(
      page.getByRole("button", { name: "VIP·포인트 100,000P", exact: true }),
    ).toBeVisible();
    await nav("환자목록");
    await page
      .getByRole("button", { name: "새 환자 등록", exact: true })
      .click();
    const dialog = page.getByRole("dialog", { name: "새 환자 등록" });
    await dialog.getByLabel("이름", { exact: true }).fill("친구검증");
    await dialog.getByLabel("생년월일", { exact: true }).fill("1995-01-01");
    await dialog.getByLabel("전화번호", { exact: true }).fill("01000000002");
    await dialog.getByLabel("주소 (동까지)", { exact: true }).fill("시험동");
    await dialog.getByLabel("소개해 준 환자 검색").fill("포인트");
    await dialog.locator(".referral-results button").click();
    await expect(dialog.getByText("VIP 소개 혜택 20,000P")).toBeVisible();
    await page.screenshot({
      path: `artifacts/vip-referral-${width}.png`,
      fullPage: true,
    });
    await dialog.getByRole("button", { name: "저장", exact: true }).click();
    await expect(dialog).not.toBeVisible();
    assert.equal(
      state.patients.find((p) => p.name === "친구검증")?.referredByPatientId,
      "vip",
    );
    assert.equal(
      pointBalance(state, "vip"),
      100000,
      "registration must not grant referral credit",
    );
    await nav("설정");
    await expect(
      page.getByRole("heading", { name: "VIP 포인트 운영", exact: true }),
    ).toBeVisible();
    await page.locator(".vip-policy").getByLabel("친구 소개 포인트", { exact: true }).fill("20000");
    await page
      .getByRole("button", { name: "VIP 운영 설정 저장", exact: true })
      .click();
    await expect(
      page.getByRole("button", { name: "저장 완료", exact: true }),
    ).toBeDisabled();
    assert.equal(errors.length, 0, errors.join("\n"));
    results.push({
      width,
      registration: true,
      points: true,
      refund: true,
      card: true,
      settings: true,
      errors,
    });
    await page.close();
  }
  await writeFile(
    "artifacts/vip-browser.json",
    JSON.stringify(results, null, 2),
  );
  console.log(JSON.stringify(results));
} finally {
  await browser.close();
}
