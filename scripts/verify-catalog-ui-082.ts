import { chromium, expect } from "@playwright/test";
import { readFile, mkdir, writeFile } from "node:fs/promises";
import assert from "node:assert/strict";
import { threeCatalogs } from "../tests/fixtures/catalogs";
const health = (await (
  await fetch("http://127.0.0.1:8787/api/health")
).json()) as any;
assert.equal(health.mode, "local-development");
const creds = JSON.parse(await readFile("private/local-setup.json", "utf8"));
await mkdir("private/browser082", { recursive: true });
const browser = await chromium.launch({ args: ["--no-sandbox"] });
const page = await browser.newPage({
  viewport: { width: 1500, height: 1050 },
  hasTouch: true,
});
page.setDefaultTimeout(18000);
await page.addInitScript(() => {
  (window as any).__name = (f: unknown) => f;
});
const errors: string[] = [];
page.on("pageerror", (e) => errors.push(e.message));
page.on("dialog", (d) => d.accept());
const pub = () =>
  page.evaluate(async () => {
    const { api } = await import(/* @vite-ignore */ String("/src/lib/api.ts"));
    const { products, categories } = await api("/public/catalog");
    return { products, categories };
  });
const uid = Date.now().toString();
try {
  await page.goto("http://localhost:5173");
  await page
    .getByLabel("등록된 아이디 선택", { exact: true })
    .selectOption(creds.username);
  await page.getByLabel("비밀번호", { exact: true }).fill(creds.password);
  await page.getByRole("button", { name: "로그인", exact: true }).click();
  await page.getByRole("heading", { name: "환자목록", exact: true }).waitFor();
  const c = {
    ...threeCatalogs()[0],
    id: "layout-" + uid,
    status: "draft" as const,
    rev: 0,
    folderTree: [
      { id: "pigment", parentId: "", name: "점·잡티·기미" },
      { id: "acne", parentId: "", name: "여드름" },
      { id: "x", parentId: "pigment", name: "레이저" },
      { id: "y", parentId: "acne", name: "레이저" },
      { id: "xx", parentId: "x", name: "세부" },
      { id: "yy", parentId: "y", name: "세부" },
    ],
  };
  c.products[0].folderId = "xx";
  c.products[0].active = false;
  c.products[0].options[0].review = true;
  c.products.push({
    ...structuredClone(c.products[0]),
    id: "test-other",
    name: "두 번째 상품",
    folderId: "yy",
    options: [{ ...c.products[0].options[0], id: "test-option-other" }],
  });
  await page.evaluate(async (c) => {
    const { api, command, makeCommand } = await import(
      /* @vite-ignore */ String("/src/lib/api.ts")
    );
    await command(makeCommand("catalog.save", { catalog: c }, c.id));
    const saved = (await api("/state")).state.catalogs.find(
      (x: any) => x.id === c.id,
    );
    await command(makeCommand("catalog.publish", {}, c.id, saved.rev));
  }, c);
  await page.getByRole("button", { name: "새로고침", exact: true }).click();
  await page.getByRole("button", { name: "단가표 관리", exact: true }).click();
  const folders = page.getByRole("complementary", { name: "고민별 폴더 목록" });
  const rows = page.getByRole("region", { name: "상품 목록" });
  await expect(folders.locator('[data-folder-target="x"]')).toHaveCount(0);
  await expect(rows.locator(".catalog-options-visible")).toHaveCount(2);
  // Default-width titles and actions must fit one line, even at the minimum divider width.
  const divider = page.getByRole("separator", { name: "폴더 목록 너비 조절" });
  await divider.dblclick();
  for (const width of [300, 220]) {
    if (width === 220) {
      await divider.focus();
      for (let i = 0; i < 4; i++) await page.keyboard.press("ArrowLeft");
    }
    const dimensions = await folders
      .locator(".folder-list-heading")
      .evaluate((el) =>
        [...el.children].map((c) => ({
          height: c.getBoundingClientRect().height,
          width: c.getBoundingClientRect().width,
          parent: el.clientWidth,
          overflow: c.scrollWidth > c.clientWidth,
        })),
      );
    assert(
      dimensions.every(
        (d) => d.height <= 48 && !d.overflow && d.width <= d.parent + 1,
      ),
    );
  }
  await divider.dblclick();
  await folders
    .getByRole("button", { name: "모두 펼치기", exact: true })
    .click();
  await expect(folders.locator('[data-folder-target="xx"]')).toBeVisible();
  await folders.locator('[data-folder-target="xx"]').click();
  await folders.getByRole("button", { name: "모두 접기", exact: true }).click();
  await expect(folders.locator('[data-folder-target="xx"]')).toHaveCount(0);
  await folders.getByRole("button", { name: /전체 상품/ }).click();
  await rows.getByRole("button", { name: "모두 접기", exact: true }).click();
  await expect(rows.locator(".catalog-options-visible")).toHaveCount(0);
  await rows.getByRole("button", { name: "모두 펼치기", exact: true }).click();
  await expect(rows.locator(".catalog-options-visible")).toHaveCount(2);
  await expect(rows.locator(".catalog-product-group")).toHaveCount(2);
  await folders
    .getByRole("button", { name: "폴더 목록 수정", exact: true })
    .click();
  await folders.locator('[data-folder-target="pigment"]').dblclick();
  await expect(
    page.getByRole("group", { name: "텍스트 색상 프리셋" }).getByRole("button"),
  ).toHaveCount(5);
  await page.getByRole("button", { name: "로즈", exact: true }).click();
  await expect(page.getByLabel("폴더 이름", { exact: true })).toHaveCSS(
    "color",
    "rgb(160, 77, 97)",
  );
  await page
    .getByRole("button", { name: "폴더 이름 적용", exact: true })
    .click();
  await expect(
    folders.locator('[data-folder-target="pigment"] span'),
  ).toHaveCSS("color", "rgb(160, 77, 97)");
  await expect(folders.locator("[data-folder-target] svg")).toHaveCount(0);
  await folders.getByRole("button", { name: "폴더 저장", exact: true }).click();
  await expect(
    folders.getByRole("button", { name: "폴더 목록 수정", exact: true }),
  ).toBeVisible();
  assert(
    (await pub()).categories.some(
      (x: any) => x.folderId === "pigment" && x.color === "#a04d61",
    ),
  );
  // A published review candidate must open an editable draft and save without publishing.
  const publicBefore = JSON.stringify(await pub());
  await rows
    .getByRole("button", {
      name: c.products[0].name + " 검토하기",
      exact: true,
    })
    .click();
  const modal = page.getByRole("dialog");
  await expect(modal.getByLabel("상품명", { exact: true })).toBeEnabled();
  const changedName = c.products[0].name + " 검토 확인";
  await modal.getByLabel("상품명", { exact: true }).fill(changedName);
  await modal.getByLabel("가격 (원)", { exact: true }).fill("12000");
  await modal.getByLabel("부가세", { exact: true }).selectOption("inclusive");
  await modal.getByLabel("가격·옵션 검토 완료", { exact: true }).check();
  await modal
    .getByRole("button", { name: "검토 내용 초안 저장", exact: true })
    .click();
  await expect(modal).toHaveCount(0);
  assert.equal(JSON.stringify(await pub()), publicBefore);
  await rows
    .getByRole("button", { name: changedName + " 상세 편집", exact: true })
    .click();
  await expect(modal.getByLabel("상품명", { exact: true })).toHaveValue(
    changedName,
  );
  await expect(modal.getByLabel("가격 (원)", { exact: true })).toHaveValue(
    "12000",
  );
  await expect(
    modal.getByLabel("가격·옵션 검토 완료", { exact: true }),
  ).toBeChecked();
  await modal
    .getByRole("button", { name: "편집 내용 유지", exact: true })
    .click();
  await page.getByRole("button", { name: "검증 후 게시", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "검증 후 게시", exact: true }),
  ).toHaveCount(0);
  assert((await pub()).products.some((p: any) => p.name === changedName));
  await folders
    .getByRole("button", { name: "모두 펼치기", exact: true })
    .click();
  await page.screenshot({
    path: "private/browser082/catalog-desktop.png",
    fullPage: true,
  });
  await page.setViewportSize({ width: 1024, height: 768 });
  assert(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  );
  await page.screenshot({
    path: "private/browser082/catalog-tablet.png",
    fullPage: true,
  });
  await page.setViewportSize({ width: 390, height: 844 });
  assert(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  );
  await page.screenshot({
    path: "private/browser082/catalog-mobile.png",
    fullPage: true,
  });
  assert.deepEqual(errors, []);
  const result = {
    passed: true,
    defaultAndMinimumWidth: true,
    folderTextColors: true,
    fivePresets: true,
    folderDefaultsCollapsed: true,
    productsDefaultExpanded: true,
    collapseWithSelectedDescendant: true,
    reviewDraftSavePublish: true,
    tabletMobileNoOverflow: true,
    pageErrors: errors,
  };
  await writeFile(
    "artifacts/catalog-ui-082.json",
    JSON.stringify(result, null, 2),
  );
  console.log(JSON.stringify(result));
} finally {
  await browser.close();
}
