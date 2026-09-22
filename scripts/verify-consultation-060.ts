import { chromium, expect } from "@playwright/test";
import { readFile, writeFile } from "node:fs/promises";
import assert from "node:assert/strict";
const creds = JSON.parse(await readFile("private/local-setup.json", "utf8"));
const health = (await (
  await fetch("http://127.0.0.1:8787/api/health")
).json()) as any;
assert.equal(health.mode, "local-development");
const browser = await chromium.launch({ args: ["--no-sandbox"] });
const page = await browser.newPage({
  viewport: { width: 1500, height: 1100 },
  hasTouch: true,
});
page.setDefaultTimeout(15000);
await page.addInitScript(() => {
  (window as any).__name = (f: unknown) => f;
});
const errors: string[] = [];
page.on("pageerror", (e) => errors.push(e.message));
page.on("dialog", (d) => d.accept());
const uid = Date.now().toString().slice(-8),
  name = "견적시험" + uid;
const staff = {
  id: crypto.randomUUID(),
  username: "quote_" + uid,
  name: "견적검증직원",
  password: crypto.randomUUID(),
  role: "coordinator",
  permissionLevel: "standard",
  active: true,
  permissions: {},
};
const button = (name: string) =>
  page.getByRole("button", { name, exact: true });
const login = async (username = creds.username, password = creds.password) => {
  const picker = page.getByLabel("등록된 아이디 선택", { exact: true });
  await picker
    .or(page.getByRole("heading", { name: "환자목록", exact: true }))
    .first()
    .waitFor();
  if (await picker.count()) {
    await picker.selectOption(username);
    await page.getByLabel("비밀번호", { exact: true }).fill(password);
    await button("로그인").click();
  }
  await page.getByRole("heading", { name: "환자목록", exact: true }).waitFor();
};
const current = () =>
  page.evaluate(async (uid) => {
    const { api } = await import(/* @vite-ignore */ String("/src/lib/api.ts"));
    return (await api("/state")).state.consultations.find(
      (c: any) => c.id === "quote-" + uid,
    );
  }, uid);
const open = async () => {
  await page.getByLabel("환자 검색").fill(name);
  await page
    .locator("tbody tr")
    .filter({ has: page.getByText(name, { exact: true }) })
    .click();
  await page
    .locator(".card")
    .filter({
      has: page.getByRole("heading", { name: "상담이력", exact: true }),
    })
    .locator("button.list-row")
    .first()
    .click();
  await page.getByRole("button", { name: /02.*상담/ }).click();
};
const save = async () => {
  const response = page.waitForResponse(
    (r) =>
      r.url().endsWith("/api/commands") &&
      r.request().postDataJSON()?.type === "consultation.save",
  );
  await button("보류·변경 저장").click();
  assert.equal((await response).status(), 200);
  await expect(page.locator(".busy-bar")).toHaveCount(0);
};
const quoteTab = () => page.getByRole("button", { name: /03.*견적서/ }).click();
const consultTab = () => page.getByRole("button", { name: /02.*상담/ }).click();
try {
  await page.goto("http://localhost:5173");
  await login();
  await page.evaluate(
    async ({ uid, name, staff }) => {
      const { api, command, makeCommand } = await import(
        /* @vite-ignore */ String("/src/lib/api.ts")
      );
      const now = new Date().toISOString(),
        id = "quote-catalog-" + uid;
      const products = Array.from({ length: 76 }, (_, i) => ({
        id: `qp-${uid}-${i}`,
        rev: 1,
        createdAt: now,
        updatedAt: now,
        careCategory: i === 75 ? "보험" : "미용",
        category: i === 75 ? "보험전용" : "견적검증",
        name: ["별도시술", "포함시술", "면세시술"][i] || "검증시술" + i,
        description: "합성 검증 자료",
        composition: i === 74 ? "숨은구성 검증" : "기본 구성",
        active: true,
        sources: [],
        options: [
          {
            id: `qo-${uid}-${i}`,
            label: i === 72 ? "옵션검색전용" : "기본",
            price: [10000, 11000, 5000][i] || 1000,
            tax: ["exclusive", "inclusive", "exempt"][i] || "inclusive",
            unit: "회",
            priceKind: "regular",
            review: false,
            issues: [],
            sources: [],
          },
        ],
      }));
      await command(
        makeCommand(
          "catalog.save",
          {
            catalog: {
              id,
              rev: 0,
              schemaVersion: 1,
              version: id,
              status: "draft",
              createdAt: now,
              updatedAt: now,
              products,
              references: [],
            },
          },
          id,
        ),
      );
      await command(makeCommand("catalog.publish", {}, id, 1));
      await api("/users", { method: "POST", body: JSON.stringify(staff) });
      await command(
        makeCommand(
          "patient.create",
          {
            name,
            sex: "F",
            dob: "1990-01-01",
            phone: "010" + uid,
            address: "시험동",
          },
          "quote-patient-" + uid,
        ),
      );
      await command(
        makeCommand(
          "consultation.create",
          { patientId: "quote-patient-" + uid, category: "미용" },
          "quote-" + uid,
        ),
      );
    },
    { uid, name, staff },
  );
  await page.reload();
  await login();
  await open();
  const search = page.getByLabel("시술 검색", { exact: true });
  const products = page.locator(".product-list .product");
  await expect(products).toHaveCount(70);
  await page.getByRole("button", { name: /시술 더 보기/ }).click();
  await expect(products).toHaveCount(75);
  await expect(page.getByLabel("시술 카테고리").locator("option")).toHaveCount(
    2,
  );
  await search.fill("  옵션검색전용  ");
  await expect(products).toHaveCount(1);
  await expect(products).toContainText("검증시술72");
  await search.fill("숨은구성");
  await expect(products).toHaveCount(1);
  await expect(products).toContainText("검증시술74");
  await search.fill("없는검색어");
  await expect(
    page.getByText("검색 조건에 맞는 시술이 없습니다."),
  ).toBeVisible();
  await search.fill("");
  await quoteTab();
  await expect(button("성공 확정 · 진행 중")).toBeDisabled();
  await consultTab();
  for (const name of ["별도시술", "포함시술", "면세시술"])
    await products
      .filter({ has: page.getByText(name, { exact: true }) })
      .locator(".option-row")
      .click();
  await page.getByLabel("별도시술 기본 수량", { exact: true }).fill("2");
  await page
    .getByLabel("별도시술 기본 할인 단위", { exact: true })
    .selectOption("percent");
  await page.getByLabel("별도시술 기본 할인", { exact: true }).fill("10");
  await page.getByLabel("포함시술 기본 할인", { exact: true }).fill("1000");
  await page
    .getByLabel("전체 할인 단위", { exact: true })
    .selectOption("percent");
  await page.getByLabel("전체 할인", { exact: true }).fill("10");
  await expect(button("보류·변경 저장")).toBeDisabled();
  await expect(page.getByRole("alert")).toContainText("할인 사유");
  await page
    .getByLabel("할인·변경 사유", { exact: true })
    .fill("혼합 과세와 할인 검증");
  const totals = page.getByLabel("견적 합계", { exact: true });
  await expect(totals).toContainText("31,320원");
  await expect(totals).toContainText("2,438원");
  await expect(totals).toContainText("6,300원");
  await page.getByLabel("부가세 안내").selectOption("included");
  await expect(totals).toContainText("29,700원");
  await page.getByLabel("부가세 안내").selectOption("separate");
  await page.getByLabel("전체 할인", { exact: true }).fill("101");
  await expect(totals).toContainText("계산 불가");
  await expect(totals).not.toContainText("31,320원");
  await expect(button("보류·변경 저장")).toBeDisabled();
  await quoteTab();
  for (const name of [
    "병원용 PDF",
    "환자용 JPG",
    "인쇄",
    "성공 확정 · 진행 중",
    "실패 확정",
  ])
    await expect(button(name)).toBeDisabled();
  await consultTab();
  await page.getByLabel("전체 할인", { exact: true }).fill("10");
  await page.getByLabel("별도시술 기본 수량", { exact: true }).fill("0");
  await expect(totals).toContainText("계산 불가");
  await page.getByLabel("별도시술 기본 수량", { exact: true }).fill("2");
  await page.screenshot({
    path: "artifacts/consultation-060-landscape.png",
    fullPage: true,
  });
  await page.setViewportSize({ width: 800, height: 1100 });
  assert.ok(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  );
  await page.screenshot({
    path: "artifacts/consultation-060-portrait.png",
    fullPage: true,
  });
  await page.setViewportSize({ width: 1500, height: 1100 });
  await quoteTab();
  await expect(button("성공 확정 · 진행 중")).toBeDisabled();
  await save();
  const saved = await current();
  assert.equal(saved.quote.total, 31320);
  assert.equal(saved.quote.lines[0].description, "합성 검증 자료");
  await page.reload();
  await login();
  await open();
  await expect(totals).toContainText("31,320원");
  // A newer catalog must not silently reprice an existing saved consultation.
  await page.evaluate(async (uid) => {
    const { api, command, makeCommand } = await import(
      /* @vite-ignore */ String("/src/lib/api.ts")
    );
    const s = (await api("/state")).state,
      old = s.catalogs.find((c: any) => c.id === "quote-catalog-" + uid),
      id = "quote-next-" + uid;
    await command(
      makeCommand(
        "catalog.save",
        {
          catalog: {
            ...old,
            id,
            status: "draft",
            products: old.products.map((p: any) => ({
              ...p,
              options: p.options.map((o: any) => ({
                ...o,
                price: o.price * 2,
              })),
            })),
          },
        },
        id,
      ),
    );
    await command(makeCommand("catalog.publish", {}, id, 1));
  }, uid);
  await page.reload();
  await login();
  await open();
  await expect(totals).toContainText("31,320원");
  await expect(button("최신 단가표 가져오기")).toBeEnabled();
  await quoteTab();
  await expect(button("성공 확정 · 진행 중")).toBeEnabled();
  const finalized = page.waitForResponse(
    (r) =>
      r.url().endsWith("/api/commands") &&
      r.request().postDataJSON()?.type === "consultation.finalize",
  );
  await button("성공 확정 · 진행 중").click();
  assert.equal((await finalized).status(), 200);
  await expect(page.locator(".busy-bar")).toHaveCount(0);
  assert.equal((await current()).status, "P");
  // A separate hold consultation can be finalized as failed without a quote.
  await page.evaluate(async (uid) => {
    const { command, makeCommand } = await import(
      /* @vite-ignore */ String("/src/lib/api.ts")
    );
    await command(
      makeCommand(
        "consultation.create",
        { patientId: "quote-patient-" + uid, category: "미용" },
        "quote-failed-" + uid,
      ),
    );
  }, uid);
  await page.reload();
  await login();
  await open();
  await quoteTab();
  await expect(button("성공 확정 · 진행 중")).toBeDisabled();
  const failed = page.waitForResponse(
    (r) =>
      r.url().endsWith("/api/commands") &&
      r.request().postDataJSON()?.type === "consultation.finalize",
  );
  await button("실패 확정").click();
  assert.equal((await failed).status(), 200);
  await expect(page.locator(".busy-bar")).toHaveCount(0);
  // A different employee can view, but cannot change discount units or finalize a hold owned by another user.
  await page.evaluate(async (uid) => {
    const { command, makeCommand } = await import(
      /* @vite-ignore */ String("/src/lib/api.ts")
    );
    await command(
      makeCommand(
        "consultation.create",
        { patientId: "quote-patient-" + uid, category: "미용" },
        "quote-foreign-" + uid,
      ),
    );
  }, uid);
  await button("로그아웃").click();
  await login(staff.username, staff.password);
  await open();
  await expect(
    page.getByLabel("전체 할인 단위", { exact: true }),
  ).toBeDisabled();
  await expect(button("보류·변경 저장")).toBeDisabled();
  await quoteTab();
  await expect(button("성공 확정 · 진행 중")).toBeDisabled();
  await expect(button("실패 확정")).toBeDisabled();
  assert.deepEqual(errors, []);
  await writeFile(
    "artifacts/consultation-060-verification.json",
    JSON.stringify(
      {
        passed: true,
        checks: [
          "option and composition search",
          "all products reachable",
          "care category filter",
          "mixed tax and discounts",
          "invalid quote blocks save/export/finalize and stale totals",
          "save then finalize",
          "saved price snapshot",
          "success and failure finalization",
          "read-only controls",
          "logout and new login return to patient list",
          "landscape and portrait",
        ],
      },
      null,
      2,
    ),
  );
  console.log("Consultation review browser checks passed");
} catch (e) {
  await page.screenshot({
    path: "artifacts/consultation-060-failure.png",
    fullPage: true,
  });
  throw e;
} finally {
  await browser.close();
}
