import { chromium, expect } from "@playwright/test";
import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import {
  emptyState,
  type Consent,
  type Signature,
  type User,
} from "../src/core/model";
import { applyCommand } from "../src/core/domain";
import { diffStateChanges } from "../src/core/stateChanges";
const user: User = {
  id: "admin",
  username: "admin",
  name: "시험관리자",
  role: "coordinator",
  permissionLevel: "admin",
  active: true,
  permissions: {},
};
const browser = await chromium.launch({
  args: ["--no-sandbox"],
  env: {
    ...process.env,
    LD_LIBRARY_PATH:
      process.env.LD_LIBRARY_PATH ||
      "/tmp/codimate-browser-deps/root/usr/lib/aarch64-linux-gnu",
  },
});
const results = [];
await mkdir("artifacts", { recursive: true });
try {
  for (const viewport of [
    { width: 1440, height: 1000 },
    { width: 768, height: 1024 },
    { width: 390, height: 844 },
  ]) {
    let state = emptyState();
    state.users = [user];
    const template: Consent = {
      id: "published",
      name: "서명 없는 게시본",
      body: "합성 양식",
      checks: ["내용 확인"],
      productIds: [],
      status: "published",
      version: 1,
      rev: 1,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    state.consents = [
      template,
      {
        ...template,
        id: "copy",
        name: "개정 초안",
        sourceTemplateId: template.id,
        status: "draft",
        version: 2,
      },
      { ...template, id: "signed", name: "서명 받은 게시본" },
      { ...template, id: "racing", name: "서명 동시 접수" },
    ];
    const signature = (templateId: string): Signature => ({
      ...template,
      id: "sig-" + templateId,
      templateId,
      templateVersion: 1,
      templateBody: template.body,
      consultationId: "synthetic",
      signer: "합성환자",
      relationship: "본인",
      checks: template.checks,
      image: "",
      contentHash: "synthetic",
      actorId: user.id,
    });
    state.signatures = [signature("signed")];
    const page = await browser.newPage({ viewport });
    const errors: string[] = [];
    let deletes = 0,
      offline = false;
    page.on("pageerror", (e) => errors.push(e.message));
    await page.route("**/api/**", async (route) => {
      const req = route.request(),
        path = new URL(req.url()).pathname;
      let result: any = { ok: true },
        status = 200;
      if (path === "/api/health")
        result = {
          ok: true,
          version: "0.12.12",
          mode: "local-development",
          configured: true,
          needsSetup: false,
        };
      else if (path === "/api/state")
        result = { state, user, driveConnected: true, pending: 0 };
      else if (path === "/api/opinions") result = { opinions: [] };
      else if (path === "/api/patients/search")
        result = { rows: [], total: 0, page: 0, pages: 0 };
      else if (path === "/api/commands") {
        const cmd = req.postDataJSON();
        if (cmd.type === "consent.delete") deletes++;
        if (offline) {
          status = 503;
          result = { error: "합성 네트워크 장애" };
        } else
          try {
            const next = await applyCommand(state, user, cmd);
            result = { ok: true, changes: diffStateChanges(state, next) };
            state = next;
          } catch (e: any) {
            status = e.status || 400;
            result = { error: e.message };
          }
      }
      await route.fulfill({ status, json: result });
    });
    await page.goto("http://127.0.0.1:5198");
    await page.getByRole("button", { name: "설정", exact: true }).click();
    await page
      .getByRole("button", { name: "동의서 양식", exact: true })
      .click();
    const remove = page.getByRole("button", {
      name: "양식 영구삭제",
      exact: true,
    });
    await page
      .locator(".consent-template-row")
      .filter({ hasText: "서명 받은 게시본" })
      .click();
    await expect(remove).toBeDisabled();
    await expect(page.locator(".consent-delete-actions")).toContainText(
      "받은 서명 1건",
    );
    await page
      .locator(".consent-template-row")
      .filter({ hasText: "서명 없는 게시본" })
      .click();
    await expect(remove).toBeEnabled();
    page.once("dialog", (d) => d.dismiss());
    await remove.click();
    assert.equal(deletes, 0);
    await page.screenshot({
      path: `artifacts/consent-delete-${viewport.width}.png`,
      fullPage: true,
    });
    page.once("dialog", async (d) => {
      assert(d.message().includes("영구삭제"));
      await d.accept();
    });
    await remove.click();
    await expect(
      page
        .locator(".consent-template-row")
        .filter({ hasText: "서명 없는 게시본" }),
    ).toHaveCount(0);
    await expect(
      page.locator(".consent-template-row").filter({ hasText: "개정 초안" }),
    ).toHaveCount(1);
    assert.equal(deletes, 1);
    assert.equal(state.consents.length, 3);
    // A signature arriving after the editor was opened must still prevent deletion.
    await page
      .locator(".consent-template-row")
      .filter({ hasText: "서명 동시 접수" })
      .click();
    state.signatures.push(signature("racing"));
    page.once("dialog", (d) => d.accept());
    await remove.click();
    await expect(page.getByRole("alert")).toContainText("받은 서명이 있는 양식은 영구삭제할 수 없습니다");
    assert(state.consents.some((t) => t.id === "racing"));
    await page
      .locator(".consent-template-row")
      .filter({ hasText: "개정 초안" })
      .click();
    offline = true;
    page.once("dialog", (d) => d.accept());
    await remove.click();
    await expect(page.getByRole("alert")).toContainText("대기열에 저장하지 못했습니다");
    await expect(remove).toBeEnabled();
    page.once("dialog", d => d.accept("synthetic-vault-password"));
    await page.getByRole("button", { name: "기기 보관 잠금 해제·설정" }).click();
    await expect(page.getByText("암호화 기기 보관이 활성화되어 있습니다.", { exact: true })).toBeVisible();
    page.once("dialog", d => d.accept());
    await remove.click();
    await expect(page.getByText(/삭제 요청 동기화 대기 중입니다/)).toBeVisible();
    assert(state.consents.some((t) => t.id === "copy"));
    assert(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    );
    assert.deepEqual(errors, []);
    results.push({
      viewport,
      cancelSafe: true,
      unsignedDeleted: true,
      revisionPreserved: true,
      signedBlocked: true,
      concurrentSignatureBlocked: true,
      offlinePendingAccurate: true,
      noOverflow: true,
      errors,
    });
    await page.close();
  }
} finally {
  await browser.close();
}
await writeFile(
  "artifacts/consent-deletion-browser.json",
  JSON.stringify(results, null, 2),
);
console.log(JSON.stringify(results));
