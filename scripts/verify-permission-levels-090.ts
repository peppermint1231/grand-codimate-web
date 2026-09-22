import { chromium, expect, type Page } from "@playwright/test";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import assert from "node:assert/strict";
const health = (await (
  await fetch("http://127.0.0.1:8787/api/health")
).json()) as any;
assert.equal(health.mode, "local-development");
const creds = JSON.parse(await readFile("private/local-setup.json", "utf8"));
const browser = await chromium.launch({ args: ["--no-sandbox"] });
const page = await browser.newPage({ viewport: { width: 1440, height: 1050 } });
await mkdir("private/browser090", { recursive: true });
const errors: string[] = [];
page.on("pageerror", (e) => errors.push(e.message));
page.on("dialog", (d) => d.accept());
async function login(p: Page, username: string, password: string) {
  await p.goto("http://localhost:5173");
  await p
    .getByLabel("등록된 아이디 선택", { exact: true })
    .selectOption(username);
  await p.getByLabel("비밀번호", { exact: true }).fill(password);
  await p.getByRole("button", { name: "로그인", exact: true }).click();
  await p.getByRole("heading", { name: "환자목록", exact: true }).waitFor();
}
const uid = Date.now().toString(),
  password = crypto.randomUUID();
try {
  await login(page, creds.username, creds.password);
  await page.getByRole("button", { name: "설정", exact: true }).click();
  await page.getByRole("button", { name: "직원·권한", exact: true }).click();
  await page.locator(".list-row").filter({ hasText: creds.username }).click();
  await expect(page.getByLabel("권한등급", { exact: true })).toHaveValue(
    "admin",
  );
  await expect(page.getByLabel("역할", { exact: true })).toHaveValue("");
  await expect(
    page.getByText("기존 관리자 계정에는 직무가 기록되어 있지 않습니다.", {
      exact: false,
    }),
  ).toBeVisible();
  await page.getByRole("button", { name: "계정 추가", exact: true }).click();
  const panel = page.getByRole("region", {
    name: "직원 권한 설정",
    exact: true,
  });
  const job = page.getByLabel("역할", { exact: true }),
    level = page.getByLabel("권한등급", { exact: true });
  assert.deepEqual(
    await job
      .locator("option")
      .evaluateAll((opts) =>
        opts
          .filter((o) => (o as HTMLOptionElement).value)
          .map((o) => o.textContent),
      ),
    ["의사", "코디네이터", "피부관리사", "데스크"],
  );
  assert.deepEqual(await level.locator("option").allTextContents(), [
    "관리자",
    "임원",
    "일반",
  ]);
  for (const role of ["doctor", "coordinator", "esthetician", "desk"]) {
    await job.selectOption(role);
    await expect(panel.locator(".permission-effective.is-allowed")).toHaveCount(
      10,
    );
  }
  await expect(
    panel.getByLabel("단가표 관리", { exact: true }).locator("option:checked"),
  ).toHaveText("등급 기본값 · 차단");
  for (const grade of ["admin", "executive"]) {
    await level.selectOption(grade);
    await expect(panel.locator(".permission-effective.is-allowed")).toHaveCount(
      grade === "admin" ? 12 : 11,
    );
  }
  await expect(
    panel.getByRole("region", { name: "관리자 전용 기능", exact: true }),
  ).toContainText("사용 불가");
  await expect(
    panel.getByRole("region", { name: "임원 전용 기능", exact: true }),
  ).toContainText("사용 가능");
  await expect(
    panel
      .getByRole("region", { name: "임원 전용 기능", exact: true })
      .getByRole("listitem"),
  ).toHaveCount(3);
  await panel.getByLabel("금액 정정", { exact: true }).selectOption("false");
  await expect(panel.locator(".permission-effective.is-allowed")).toHaveCount(
    10,
  );
  await level.selectOption("admin");
  await expect(panel.locator(".permission-effective.is-allowed")).toHaveCount(
    11,
  );
  await panel
    .getByRole("button", { name: "등급 기본값 적용", exact: true })
    .click();
  await expect(panel.locator(".permission-effective.is-allowed")).toHaveCount(
    12,
  );
  await page.getByLabel("사용 계정", { exact: true }).uncheck();
  await expect(panel.locator(".permission-effective.is-blocked")).toHaveCount(
    12,
  );
  await page.getByLabel("사용 계정", { exact: true }).check();
  await page.setViewportSize({ width: 390, height: 844 });
  await level.scrollIntoViewIfNeeded();
  assert.ok(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  );
  await page.screenshot({
    path: "private/browser090/account-level-mobile.png",
  });
  await page.setViewportSize({ width: 1440, height: 1050 });
  const accounts = [
    { role: "esthetician", permissionLevel: "admin", name: "관리자 시험" },
    { role: "desk", permissionLevel: "executive", name: "임원 시험" },
    { role: "doctor", permissionLevel: "standard", name: "일반 시험" },
  ];
  for (const account of accounts) {
    await page.getByRole("button", { name: "계정 추가", exact: true }).click();
    await page.getByLabel("이름", { exact: true }).fill(account.name + uid);
    await page
      .getByLabel("아이디", { exact: true })
      .fill("grade_" + account.permissionLevel + "_" + uid);
    await page
      .getByLabel("새 비밀번호 (12자 이상)", { exact: true })
      .fill(password);
    await job.selectOption(account.role);
    await level.selectOption(account.permissionLevel);
    await page.getByRole("button", { name: "계정 저장", exact: true }).click();
    await expect(level).toHaveCount(0);
    const item = page
      .locator(".list-row")
      .filter({ hasText: "grade_" + account.permissionLevel + "_" + uid });
    await item.click();
    await expect(job).toHaveValue(account.role);
    await expect(level).toHaveValue(account.permissionLevel);
    await expect(panel.locator(".permission-effective.is-allowed")).toHaveCount(
      account.permissionLevel === "admin"
        ? 12
        : account.permissionLevel === "executive"
          ? 11
          : 10,
    );
  }
  await page.screenshot({
    path: "private/browser090/account-level-desktop.png",
  });
  for (const account of accounts) {
    const staff = await browser.newPage({
      viewport: { width: 1440, height: 1050 },
    });
    staff.on("pageerror", (e) => errors.push(e.message));
    await login(
      staff,
      "grade_" + account.permissionLevel + "_" + uid,
      password,
    );
    await staff.getByRole("button", { name: "설정", exact: true }).click();
    if (account.permissionLevel === "admin") {
      await expect(
        staff.getByRole("button", { name: "직원·권한", exact: true }),
      ).toBeVisible();
      await staff
        .getByRole("button", { name: "연결·복구", exact: true })
        .click();
      await expect(
        staff.getByRole("button", { name: "저장 폴더 변경", exact: true }),
      ).toBeVisible();
    } else if (account.permissionLevel === "executive") {
      await expect(
        staff.getByRole("button", { name: "직원·권한", exact: true }),
      ).toHaveCount(0);
      await expect(
        staff.getByRole("button", { name: "환자 등급", exact: true }),
      ).toHaveCount(0);
      await expect(
        staff.getByRole("button", { name: "동의서 양식", exact: true }),
      ).toBeVisible();
      await staff
        .getByRole("button", { name: "백업·복구", exact: true })
        .click();
      await expect(
        staff.getByRole("button", {
          name: "암호화 백업 내보내기",
          exact: true,
        }),
      ).toBeVisible();
      await expect(
        staff.getByRole("button", {
          name: "OneDrive 원본에서 재구축",
          exact: true,
        }),
      ).toBeVisible();
      await expect(
        staff.getByRole("button", { name: "Microsoft 계정 연결", exact: true }),
      ).toHaveCount(0);
      await expect(
        staff.getByRole("button", { name: "저장 폴더 변경", exact: true }),
      ).toHaveCount(0);
      const status = await staff.evaluate(
        async () =>
          (
            await fetch("/api/users", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                role: "doctor",
                permissionLevel: "admin",
              }),
            })
          ).status,
      );
      assert.equal(status, 403);
      await staff.screenshot({
        path: "private/browser090/executive-backup.png",
      });
    } else {
      await expect(
        staff.getByText("설정은 관리자·임원 권한등급에서 사용할 수 있습니다.", {
          exact: true,
        }),
      ).toBeVisible();
      await staff
        .getByRole("button", { name: "단가표 관리", exact: true })
        .click();
      await expect(
        staff.getByRole("button", { name: "폴더 목록 수정", exact: true }),
      ).toHaveCount(0);
      await expect(
        staff.getByRole("button", { name: "CSV 자료 교환", exact: true }),
      ).toBeDisabled();
      await expect(
        staff.getByRole("button", { name: "Excel 다운로드", exact: true }),
      ).toBeDisabled();
      const response = await staff.evaluate(
        async () => (await fetch("/api/backup", { method: "POST" })).status,
      );
      assert.equal(response, 403);
    }
    if (account.permissionLevel !== "admin") {
      await staff.getByRole("button", { name: "통계", exact: true }).click();
      await expect(
        staff.getByRole("button", { name: "통계 Excel", exact: true }),
      ).toHaveCount(0);
    }
    await staff.close();
  }
  assert.deepEqual(errors, []);
  await writeFile(
    "artifacts/permission-levels-browser-090.json",
    JSON.stringify(
      {
        ok: true,
        roleChoices: 4,
        gradeChoices: 3,
        defaultsIndependentOfRole: true,
        individualOverrides: true,
        legacyAdminJobUnassigned: true,
        defaultsReset: true,
        createdAndReloadedGrades: 3,
        executiveLimitedMenus: true,
        serverPrivilegeEscalationBlocked: true,
        standardRestricted: true,
        mobileNoOverflow: true,
        pageErrors: errors,
      },
      null,
      2,
    ),
  );
  console.log("Permission grades browser checks passed");
} catch (e) {
  console.log(await page.locator(".error").allTextContents());
  await page.screenshot({ path: "private/browser090/failure.png" });
  throw e;
} finally {
  await browser.close();
}
