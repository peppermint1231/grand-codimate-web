import { chromium, expect } from "@playwright/test";
import { readFile, mkdir, writeFile } from "node:fs/promises";
import assert from "node:assert/strict";
import { threeCatalogs } from "../tests/fixtures/catalogs";
const health = (await (
  await fetch("http://127.0.0.1:8787/api/health")
).json()) as any;
assert.equal(health.mode, "local-development");
const creds = JSON.parse(await readFile("private/local-setup.json", "utf8"));
await mkdir("private/browser080", { recursive: true });
const browser = await chromium.launch({ args: ["--no-sandbox"] });
const page = await browser.newPage({
  viewport: { width: 1440, height: 1000 },
  hasTouch: true,
});
const errors: string[] = [];
page.on("pageerror", (e) => errors.push(e.message));
await page.addInitScript(() => {
  (window as any).__name = (f: unknown) => f;
});
const uid = Date.now().toString();
let prompt = "";
page.on("dialog", (d) => d.accept(d.type() === "prompt" ? prompt : undefined));
try {
  await page.goto("http://localhost:5173");
  await page
    .getByLabel("등록된 아이디 선택", { exact: true })
    .selectOption(creds.username);
  await page.getByLabel("비밀번호", { exact: true }).fill(creds.password);
  await page.getByRole("button", { name: "로그인", exact: true }).click();
  await page.getByRole("heading", { name: "환자목록", exact: true }).waitFor();
  const catalogs = threeCatalogs().map((c) => ({
    ...c,
    id: c.id + "-" + uid,
    rev: 0,
    status: "draft" as const,
  }));
  // Different books can legitimately reuse imported IDs.
  catalogs[2].products[0].id = catalogs[0].products[0].id;
  catalogs[2].products[0].options[0].id = catalogs[0].products[0].options[0].id;
  catalogs[0].products.push({
    ...structuredClone(catalogs[0].products[0]),
    id: "product-extra",
    name: "시험 미용 추가",
    options: [{ ...catalogs[0].products[0].options[0], id: "option-extra" }],
  });
  await page.evaluate(async (catalogs) => {
    const { api, command, makeCommand } = await import(
      /* @vite-ignore */ String("/src/lib/api.ts")
    );
    for (const c of catalogs) {
      await command(makeCommand("catalog.save", { catalog: c }, c.id, 0));
      const saved = (await api("/state")).state.catalogs.find(
        (x: any) => x.id === c.id,
      );
      await command(makeCommand("catalog.publish", {}, c.id, saved.rev));
    }
  }, catalogs);
  await page.getByRole("button", { name: "새로고침", exact: true }).click();
  await page.getByRole("button", { name: "단가표 관리", exact: true }).click();
  for (const [i, book] of ["미용", "보험", "이벤트"].entries()) {
    await page
      .getByRole("button", { name: book + " SSOT", exact: true })
      .click();
    await page.getByLabel("단가표 버전").selectOption(catalogs[i].id);
    await expect(page.locator(".catalog-option-visible")).toHaveCount(
      i === 0 ? 2 : 1,
    );
  }
  await page.getByRole("button", { name: "미용 SSOT", exact: true }).click();
  await page.getByRole("button", { name: "복제·이전 버전 복원 초안" }).click();
  await page
    .locator(".catalog-product-rows")
    .getByLabel("시험 미용 상품 선택", { exact: true })
    .check();
  await page
    .locator(".catalog-product-rows")
    .getByLabel("시험 미용 추가 선택", { exact: true })
    .check();
  const handle = await page
    .getByRole("button", { name: "시험 미용 상품 이동", exact: true })
    .boundingBox();
  const target = await page
    .locator('[data-folder-target="acne"]')
    .boundingBox();
  assert(handle && target);
  await page.mouse.move(
    handle.x + handle.width / 2,
    handle.y + handle.height / 2,
  );
  await page.mouse.down();
  await page.mouse.move(
    target.x + target.width / 2,
    target.y + target.height / 2,
    { steps: 20 },
  );
  await page.mouse.up();
  await page.locator('[data-folder-target="acne"]').click();
  await expect(page.locator(".catalog-product-row")).toHaveCount(2);
  for (let i = 1; i <= 3; i++) {
    prompt = "시험 폴더 " + i;
    await page.getByRole("button", { name: "폴더 추가", exact: true }).click();
  }
  await expect(
    page.getByRole("button", { name: "폴더 추가", exact: true }),
  ).toBeDisabled();
  const leaf = await page
    .locator(".catalog-folder-row.selected [data-folder-target]")
    .getAttribute("data-folder-target");
  await page.getByLabel("이동할 폴더", { exact: true }).selectOption(leaf!);
  await page
    .getByRole("button", { name: "선택 2개 상품 이동", exact: true })
    .click();
  await expect(page.locator(".catalog-product-row")).toHaveCount(2);
  await page.getByRole("button", { name: "보험 SSOT", exact: true }).click();
  await page.getByRole("button", { name: "미용 SSOT", exact: true }).click();
  await expect(
    page
      .getByLabel("이동할 폴더")
      .locator("option", { hasText: "시험 폴더 3" }),
  ).toHaveCount(1);
  await page
    .getByRole("button", { name: "초안 저장", exact: true })
    .first()
    .click();
  await expect(page.locator(".busy-bar")).toHaveCount(0);
  await page.screenshot({
    path: "private/browser080/catalog-desktop.png",
    fullPage: true,
  });
  await page.reload();
  await page.getByRole("heading", { name: "환자목록", exact: true }).waitFor();
  const saved = await page.evaluate(async (leaf) => {
    const { api } = await import(/* @vite-ignore */ String("/src/lib/api.ts"));
    return (await api("/state")).state.catalogs.find(
      (c: any) =>
        c.status === "draft" && c.folders?.some((f: any) => f.id === leaf),
    );
  }, leaf);
  assert(saved);
  assert.equal(
    saved.products.filter((p: any) => p.folderId === leaf).length,
    2,
  );

  const patientPage = await browser.newPage({
    viewport: { width: 390, height: 844 },
    hasTouch: true,
  });
  patientPage.on("pageerror", (e) => errors.push(e.message));
  await patientPage.goto("http://localhost:5173/discover?kiosk=1");
  await patientPage
    .getByRole("heading", { name: "맞춤 시술 찾기", exact: true })
    .waitFor();
  await patientPage.screenshot({
    path: "private/browser080/discovery-mobile.png",
    fullPage: true,
  });
  assert(
    await patientPage.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  );
  await patientPage
    .locator(".discovery-concerns button")
    .filter({ hasText: "기미" })
    .click();
  await patientPage
    .locator(".discovery-concerns button")
    .filter({ hasText: "피부·손발톱" })
    .click();
  await patientPage.getByRole("button", { name: "시술 둘러보기" }).click();
  for (const book of ["미용", "보험", "이벤트"]) {
    await patientPage.getByRole("button", { name: book, exact: true }).click();
    await patientPage
      .locator("article")
      .filter({
        has: patientPage.getByRole("heading", {
          name: "시험 " + book + " 상품",
          exact: true,
        }),
      })
      .getByRole("button")
      .click();
  }
  await patientPage.getByRole("button", { name: "선택 내용 전달하기" }).click();
  const personName = "웹접수시험" + uid.slice(-6);
  await patientPage.getByLabel("이름 *", { exact: true }).fill(personName);
  await patientPage.getByLabel("연락처 *", { exact: true }).fill("01000000000");
  await patientPage
    .getByLabel("생년월일 (선택)", { exact: true })
    .fill("1990-01-01");
  await patientPage
    .getByLabel("주소 · 동까지 (선택)", { exact: true })
    .fill("시험동");
  await patientPage
    .getByRole("checkbox", {
      name: "개인정보 수집·이용에 동의합니다. (필수)",
      exact: true,
    })
    .check();
  await patientPage.getByRole("checkbox", { name: /건강 관련 정보/ }).check();
  await patientPage
    .getByRole("button", { name: "상담 요청 보내기", exact: true })
    .click();
  await patientPage
    .getByRole("heading", { name: "상담 요청을 전달했어요" })
    .waitFor();
  await patientPage.screenshot({
    path: "private/browser080/receipt-mobile.png",
    fullPage: true,
  });
  await page
    .locator(".sidebar")
    .getByRole("button", { name: "맞춤 시술 찾기", exact: true })
    .click();
  await page.locator("button.list-row").filter({ hasText: personName }).click();
  await page.screenshot({
    path: "private/browser080/intake-desktop.png",
    fullPage: true,
  });
  await page
    .getByRole("button", { name: "상담으로 연결", exact: true })
    .click();
  await expect(page.locator(".cart-line")).toHaveCount(3);
  const result = await page.evaluate(async (name) => {
    const { api } = await import(/* @vite-ignore */ String("/src/lib/api.ts"));
    const { state } = await api("/state");
    const patient = state.patients.find((p: any) => p.name === name);
    const c = state.consultations.find((c: any) => c.patientId === patient.id);
    return {
      total: c.quote.total,
      books: c.quote.lines.map((l: any) => l.book),
      consent: c.intakeSource.personalConsent,
    };
  }, personName);
  assert.equal(result.total, 24800);
  assert.deepEqual(result.books, ["미용", "보험", "이벤트"]);
  assert(result.consent);
  await page.screenshot({
    path: "private/browser080/mixed-cart.png",
    fullPage: true,
  });
  await patientPage
    .getByRole("button", { name: "처음으로", exact: true })
    .click();
  await patientPage.clock.install();
  await patientPage.locator(".discovery-concerns button").first().click();
  await patientPage.clock.fastForward(185000);
  await expect(
    patientPage.locator('.discovery-concerns button[aria-pressed="true"]'),
  ).toHaveCount(0);
  assert.deepEqual(errors, []);
  const report = {
    passed: true,
    folderDepth: 3,
    multiDragProducts: 2,
    mixedCart: result,
    kioskReset: true,
    publicMobileOverflow: false,
    pageErrors: errors,
  };
  await writeFile(
    "private/browser080/report.json",
    JSON.stringify(report, null, 2),
  );
  console.log(JSON.stringify(report));
} finally {
  await browser.close();
}
