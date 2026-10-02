import { chromium, expect } from "@playwright/test";
import assert from "node:assert/strict";
import { writeFile } from "node:fs/promises";
import { emptyState } from "../src/core/model";
import { threeCatalogs, catalogAdmin } from "../tests/fixtures/catalogs";
import { applyCommand } from "../src/core/domain";
import { diffStateChanges } from "../src/core/stateChanges";
const browser = await chromium.launch({ args: ["--no-sandbox"] });
const reports = [];
try {
  for (const width of [1440, 768, 390]) {
    let state = {
      ...emptyState(),
      users: [catalogAdmin],
      catalogs: threeCatalogs(),
    };
    const page = await browser.newPage({ viewport: { width, height: 1000 } });
    const errors: string[] = [];
    page.on("pageerror", (e) => errors.push(e.message));
    const attempts: any[] = [];
    const receipts = new Map<string, any[]>();
    let drop = true;
    await page.route("**/api/**", async (route) => {
      const path = new URL(route.request().url()).pathname;
      let status = 200,
        json: any = {
          ok: true,
          configured: true,
          mode: "local-development",
          version: "0.13.8",
        };
      if (path === "/api/state")
        json = { state, user: catalogAdmin, pending: 0 };
      else if (path === "/api/opinions") json = { opinions: [] };
      else if (path === "/api/catalog-history") json = { revisions: [] };
      else if (path === "/api/patients/search") {
        status = 503;
        json = { error: "fixture" };
      } else if (path.startsWith("/api/catalogs/"))
        json = {
          catalog: state.catalogs.find((c) => c.id === path.split("/").at(-1)),
        };
      else if (path === "/api/commands") {
        const cmd = route.request().postDataJSON();
        attempts.push(cmd);
        try {
          if (receipts.has(cmd.id))
            json = { ok: true, replayed: true, changes: receipts.get(cmd.id) };
          else {
            const next = await applyCommand(state, catalogAdmin, cmd);
            const changes = diffStateChanges(state, next);
            state = next;
            receipts.set(cmd.id, changes);
            json = { ok: true, changes };
            if (drop) {
              drop = false;
              status = 503;
              json = {
                error:
                  "Durable Object's isolate exceeded its memory limit and was reset.",
              };
            }
          }
        } catch (e: any) {
          status = e.status || 400;
          json = { error: e.message };
        }
      }
      await route.fulfill({ status, json });
    });
    await page.goto("http://127.0.0.1:5198");
    await expect(page.locator(".app-shell")).toBeVisible();
    await page
      .getByRole("button", { name: "단가표 관리", exact: true })
      .click();
    await page
      .getByRole("button", { name: "단가표 수정", exact: true })
      .click();
    await page.locator(".catalog-product-title").first().click();
    const editor = page.getByRole("dialog", { name: "상품·옵션 편집" });
    await editor
      .getByLabel("상품명", { exact: true })
      .fill("저장 복구 검증 상품");
    const save = editor
      .getByRole("button", { name: "저장하고 적용", exact: true })
      .first();
    await save.click();
    await expect(
      page.getByText(/서버 저장 결과를 확인하지 못했습니다/),
    ).toBeVisible();
    await expect(editor.getByLabel("상품명", { exact: true })).toHaveValue(
      "저장 복구 검증 상품",
    );
    await save.click();
    await expect(editor).toHaveCount(0);
    assert.equal(attempts.length, 2);
    assert.deepEqual(attempts[0], attempts[1]);
    assert.equal(state.catalogs.length, 4);
    await expect(
      page
        .locator(".catalog-product-title")
        .filter({ hasText: "저장 복구 검증 상품" }),
    ).toBeVisible();
    assert.deepEqual(errors, []);
    reports.push({
      width,
      deviceVault: false,
      responseLostAfterCommit: true,
      identicalOperationRetry: true,
      publishedOnce: true,
      errors,
    });
    await page.screenshot({
      path: `artifacts/catalog-save-recovery-${width}-0138.png`,
    });
    await page.close();
  }
  await writeFile(
    "artifacts/catalog-save-recovery-0138.json",
    JSON.stringify(reports, null, 2),
  );
  console.log(JSON.stringify(reports));
} finally {
  await browser.close();
}
