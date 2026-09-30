import { chromium, expect } from "@playwright/test";
import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import { emptyState, type User } from "../src/core/model";
import { applyCommand } from "../src/core/domain";
import { patientIndex, searchPatients } from "../src/core/patientSearch";
const user: User = {
  id: "test-admin",
  username: "test-admin",
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
await mkdir("artifacts", { recursive: true });
const results = [];
try {
  for (const viewport of [
    { width: 1440, height: 1000 },
    { width: 768, height: 1024 },
    { width: 390, height: 844 },
  ]) {
    let state = emptyState();
    state.users = [user];
    const errors: string[] = [];
    const page = await browser.newPage({ viewport });
    page.on("pageerror", (e) => errors.push(e.message));
    await page.route("**/api/**", async (route) => {
      const req = route.request(),
        u = new URL(req.url());
      let result: any = { ok: true };
      let status = 200;
      if (u.pathname === "/api/health")
        result = {
          ok: true,
          version: "0.12.3",
          mode: "local-development",
          configured: true,
          needsSetup: false,
        };
      else if (u.pathname === "/api/state")
        result = { state, user, driveConnected: true, pending: 0 };
      else if (u.pathname === "/api/opinions") result = { opinions: [] };
      else if (u.pathname === "/api/patients/search")
        result = searchPatients(patientIndex(state), {
          search: "",
          grade: "",
          sort: "recent",
          unpaid: false,
          owner: "",
          consultStatus: "",
          since: "",
          archived: false,
          duplicateOnly: false,
          page: 0,
        });
      else if (u.pathname === "/api/commands")
        try {
          state = await applyCommand(state, user, req.postDataJSON());
        } catch (e: any) {
          status = e.status || 400;
          result = { error: e.message };
        }
      await route.fulfill({ status, json: result });
    });
    await page.goto("http://127.0.0.1:5198");
    await page.getByRole("button", { name: "설정", exact: true }).click();
    await page
      .getByRole("button", { name: "동의서 양식", exact: true })
      .click();
    await page
      .getByRole("button", { name: "초안 23종 등록·업그레이드" })
      .click();
    await expect(
      page.getByRole("button", { name: "최신 초안 등록 완료" }),
    ).toBeDisabled();
    assert.equal(state.consents.length, 23);
    assert(state.consents.every((t) => t.status === "draft"));
    await page
      .getByRole("button", { name: /보툴리눔 독소 주사 동의서/ })
      .click();
    const publish = page.getByRole("button", {
      name: "검토 완료·게시",
      exact: true,
    });
    await expect(publish).toBeDisabled();
    await page.getByRole("button", { name: "환자 화면 미리보기" }).click();
    await expect(
      page.getByRole("region", { name: "동의서 미리보기" }),
    ).toContainText("환자의 선택");
    await expect(
      page.locator(".consent-preview .consent-review-mark").first(),
    ).toBeVisible();
    await page.getByRole("button", { name: "본문 편집 보기" }).click();
    const body = page.getByRole("textbox", {
      name: "동의서 본문",
      exact: true,
    });
    await expect(
      page.getByRole("region", { name: "검토 필요 항목" }),
    ).toBeVisible();
    await page.locator(".consent-review-jump").first().click();
    assert(
      await body.evaluate(
        (el: HTMLTextAreaElement) => el.selectionEnd > el.selectionStart,
      ),
    );
    const text = await body.inputValue();
    const guides = page.locator(".consent-review-guide");
    await expect(guides).toHaveCount(2);
    await expect(guides.first()).toContainText("진료시간");
    await expect(guides.nth(1)).toContainText("제품마다 단위");
    await expect(body).toHaveValue(text);
    await page.getByRole("button", { name: "환자 화면 미리보기" }).click();
    await expect(
      page.getByRole("region", { name: "동의서 미리보기" }),
    ).not.toContainText("작성 예시");
    await page.getByRole("button", { name: "본문 편집 보기" }).click();
    await body.fill(
      text.replace(/\[병원 확인:[^\]]+\]/g, "합성 검증용 병원 안내"),
    );
    await page.getByRole("button", { name: "초안 저장", exact: true }).click();
    await expect(page.getByRole("status")).toContainText("초안을 저장");
    await page
      .getByRole("button", { name: /보툴리눔 독소 주사 동의서/ })
      .click();
    await expect(body).toContainText("합성 검증용 병원 안내");
    await expect(publish).toBeDisabled();
    await page.getByRole("checkbox", { name: /담당 의료진이/ }).check();
    await expect(publish).toBeEnabled();
    await body.fill((await body.inputValue()) + "\n추가 안내");
    await expect(publish).toBeDisabled();
    await page.getByRole("checkbox", { name: /담당 의료진이/ }).check();
    await publish.click();
    await page
      .getByRole("button", { name: /보툴리눔 독소 주사 동의서/ })
      .click();
    await expect(body).toHaveAttribute("readonly", "");
    const original = structuredClone(state.consents[0]);
    await page.getByRole("button", { name: "복제하여 수정" }).click();
    await page.getByRole("button", { name: "초안 저장", exact: true }).click();
    assert.equal(state.consents.length, 24);
    assert.deepEqual(state.consents[0], original);
    assert.equal(state.consents[23].version, 2);
    await page.getByRole("button", { name: /히알루론산 필러 동의서/ }).click();
    await page.screenshot({
      path: `artifacts/consents-${viewport.width}.png`,
      fullPage: true,
    });
    assert(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
      "Horizontal overflow",
    );
    assert.deepEqual(errors, []);
    // Restarting an unsaved custom form must clear its local fields after discarding.
    await page.getByRole("button", { name: "새 양식 작성" }).click();
    await page
      .getByRole("textbox", { name: "양식명", exact: true })
      .fill("버릴 초안");
    page.once("dialog", (d) => d.accept());
    await page.getByRole("button", { name: "새 양식 작성" }).click();
    await expect(
      page.getByRole("textbox", { name: "양식명", exact: true }),
    ).toHaveValue("");
    results.push({
      viewport,
      install: 23,
      edit: true,
      reviewGate: true,
      clonePreservesOriginal: true,
      noOverflow: true,
      errors,
    });
    await page.close();
  }
} finally {
  await browser.close();
}
await writeFile(
  "artifacts/consent-drafts-browser.json",
  JSON.stringify(results, null, 2),
);
console.log(JSON.stringify(results));
