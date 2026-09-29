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
  env: {
    ...process.env,
    LD_LIBRARY_PATH:
      process.env.LD_LIBRARY_PATH ||
      "/tmp/codimate-browser-deps/root/usr/lib/aarch64-linux-gnu",
  },
});
await mkdir("artifacts", { recursive: true });
const checks: unknown[] = [];
try {
  for (const viewport of [
    { width: 1024, height: 1366 },
    { width: 390, height: 844 },
  ]) {
    let state = emptyState();
    state.users = [user];
    let configured = false,
      sourceMissing = false;
    const fields = {
      name: "연동화면시험",
      sex: "F",
      dob: "1990-02-03",
      phone: "01055551234",
      address: "춘천시 퇴계동",
      acquisitionSource: "네이버검색광고",
    };
    const page = await browser.newPage({ viewport });
    const errors: string[] = [];
    page.on("pageerror", (e) => errors.push(e.message));
    await page.route("**/api/**", async (route) => {
      const req = route.request(),
        u = new URL(req.url()),
        path = u.pathname;
      let result: any = { ok: true },
        status = 200;
      if (path === "/api/health")
        result = {
          ok: true,
          version: "0.11.1",
          mode: "local-development",
          configured: true,
          needsSetup: false,
        };
      else if (path === "/api/state")
        result = { state, user, driveConnected: true, pending: 0 };
      else if (path === "/api/login-ids")
        result = { usernames: [user.username] };
      else if (path === "/api/opinions") result = { opinions: [] };
      else if (path === "/api/patients/search")
        result = searchPatients(patientIndex(state), {
          search: u.searchParams.get("search") || "",
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
      else if (path === "/api/intake/settings") {
        if (req.method() === "POST") configured = true;
        result = {
          configured,
          canConfigure: true,
          folder: "동의서/초진설문지",
        };
      } else if (path === "/api/intake/search")
        result = {
          rows: [
            {
              id: "a".repeat(64),
              name: fields.name,
              phone: fields.phone,
              createdAt: "2026-09-29T01:00:00Z",
            },
          ],
          total: 1,
          page: 0,
          pageSize: 30,
        };
      else if (path === "/api/intake/select") {
        if (sourceMissing) {
          status = 404;
          result = {
            error:
              "선택한 설문지가 변경되거나 삭제되었습니다. 다시 검색해 주세요",
          };
        } else
          result = {
            patientId: "intake-" + "a".repeat(32),
            alreadyImported: state.patients.length > 0,
            fields,
            matches: state.patients,
          };
      } else if (path === "/api/commands") {
        state = await applyCommand(state, user, req.postDataJSON());
        result = { ok: true };
      }
      await route.fulfill({
        status,
        contentType: "application/json",
        body: JSON.stringify(result),
      });
    });
    await page.goto("http://127.0.0.1:5197");
    await page
      .getByRole("button", { name: "새 환자 등록", exact: true })
      .click();
    await page
      .getByRole("button", {
        name: "초진설문지에서 환자 불러오기",
        exact: true,
      })
      .click();
    await page
      .getByLabel("초진설문지 관리자 비밀번호", { exact: true })
      .fill("test-password");
    await page
      .getByRole("button", { name: "연결 확인 및 저장", exact: true })
      .click();
    await page.getByLabel("초진설문지 환자 검색", { exact: true }).fill("연동");
    await page.getByRole("button", { name: "검색", exact: true }).click();
    await page.getByRole("button", { name: "선택", exact: true }).click();
    await expect(page.getByLabel("이름", { exact: true })).toHaveValue(
      fields.name,
    );
    await expect(page.getByLabel("생년월일", { exact: true })).toHaveValue(
      fields.dob,
    );
    await expect(page.getByLabel("전화번호", { exact: true })).toHaveValue(
      fields.phone,
    );
    await expect(page.getByLabel("주소 (동까지)", { exact: true })).toHaveValue(
      fields.address,
    );
    await expect(
      page.getByRole("combobox", { name: "유입경로 (선택)", exact: true }),
    ).toHaveValue(fields.acquisitionSource);
    await page.screenshot({
      path: `artifacts/intake-filled-${viewport.width}.png`,
      fullPage: true,
    });
    assert.equal(
      await page.evaluate(
        () => document.documentElement.scrollWidth > window.innerWidth,
      ),
      false,
    );
    await page
      .getByRole("dialog")
      .getByRole("button", { name: "저장", exact: true })
      .click();
    await page
      .getByRole("heading", { name: fields.name + " 님", exact: true })
      .waitFor();
    assert.equal(state.patients.length, 1);
    await page
      .locator("main")
      .getByRole("button", { name: "환자목록", exact: true })
      .click();
    await page
      .getByRole("button", { name: "새 환자 등록", exact: true })
      .click();
    await page
      .getByRole("button", {
        name: "초진설문지에서 환자 불러오기",
        exact: true,
      })
      .click();
    await page.getByLabel("초진설문지 환자 검색", { exact: true }).fill("1234");
    await page.getByRole("button", { name: "검색", exact: true }).click();
    sourceMissing = true;
    await page.getByRole("button", { name: "선택", exact: true }).click();
    await expect(page.getByRole("alert")).toContainText("삭제");
    sourceMissing = false;
    await page.getByRole("button", { name: "선택", exact: true }).click();
    await expect(
      page.getByRole("button", {
        name: "다른 환자입니다 · 정보 불러오기",
        exact: true,
      }),
    ).toHaveCount(0);
    await page.screenshot({
      path: `artifacts/intake-existing-${viewport.width}.png`,
      fullPage: true,
    });
    await page
      .getByRole("button", { name: "기존 환자 열기", exact: true })
      .click();
    await page
      .getByRole("heading", { name: fields.name + " 님", exact: true })
      .waitFor();
    assert.equal(state.patients.length, 1);
    assert.deepEqual(errors, []);
    checks.push({
      viewport,
      autofill: true,
      registration: true,
      existingPatient: true,
      deletedRecordError: true,
      noHorizontalOverflow: true,
      errors,
    });
    await page.close();
  }
  await writeFile(
    "artifacts/intake-browser.json",
    JSON.stringify(checks, null, 2),
  );
  console.log(JSON.stringify(checks, null, 2));
} finally {
  await browser.close();
}
