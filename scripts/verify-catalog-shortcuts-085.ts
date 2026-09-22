import { chromium, expect } from "@playwright/test";
import { readFile, mkdir, writeFile } from "node:fs/promises";
import assert from "node:assert/strict";
import { threeCatalogs } from "../tests/fixtures/catalogs";
const health = (await (
  await fetch("http://127.0.0.1:8787/api/health")
).json()) as any;
assert.equal(health.mode, "local-development");
const creds = JSON.parse(await readFile("private/local-setup.json", "utf8"));
await mkdir("private/browser085", { recursive: true });
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
page.on("dialog", (d) => d.accept(d.type() === "prompt" ? "10" : undefined));
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
    id: "shortcuts-" + uid,
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
  const choose = (id: string) =>
    folders.locator(`[data-folder-target="${id}"]`).click();
  const command = (id: string) =>
    folders.locator(`[data-catalog-command="${id}"]`);
  await expect(
    page.getByRole("button", { name: "단축키 안내", exact: true }),
  ).toHaveCount(0);
  await folders
    .getByRole("button", { name: "폴더 목록 수정", exact: true })
    .click();
  await folders
    .getByRole("button", { name: "단축키 안내", exact: true })
    .click();
  const help = page.getByRole("dialog", { name: "단가표 편집 단축키" });
  await expect(help).toContainText("Alt+←");
  const originalCount = await folders.locator("[data-folder-target]").count();
  await page.keyboard.press("Alt+n");
  await page.keyboard.press("Control+s");
  await expect(folders.locator("[data-folder-target]")).toHaveCount(
    originalCount,
  );
  await page.keyboard.press("Escape");
  await expect(
    folders.getByRole("button", { name: "단축키 안내", exact: true }),
  ).toBeFocused();
  await choose("pigment");
  await page.keyboard.press("Alt+2");
  await expect(folders.locator('[data-folder-target="xx"]')).toBeVisible();
  await choose("xx");
  await page.keyboard.press("Alt+1");
  await expect(folders.locator('[data-folder-target="xx"]')).toHaveCount(0);
  await page.keyboard.press("Alt+2");
  await choose("pigment");
  await page.keyboard.press("Alt+n");
  const name = folders.getByRole("textbox", { name: "폴더 이름", exact: true });
  await name.fill("키보드 새 폴더");
  // Input protection and IME Enter must not accidentally commit/move.
  await page.keyboard.press("Alt+ArrowLeft");
  await expect(name).toBeVisible();
  await name.dispatchEvent("keydown", {
    key: "Enter",
    code: "Enter",
    isComposing: true,
    bubbles: true,
  });
  await expect(name).toBeVisible();
  await name.press("Enter");
  let newFolder = folders
    .locator(".folder-node")
    .filter({ hasText: "키보드 새 폴더" });
  await expect(newFolder).toBeFocused();
  const newId = (await newFolder.getAttribute("data-folder-target"))!;
  newFolder = folders.locator(`[data-folder-target="${newId}"]`);
  const depth = () =>
    newFolder.evaluate(
      (el) => el.closest<HTMLElement>("[data-depth]")!.dataset.depth,
    );
  assert.equal(await depth(), "1");
  await page.keyboard.press("Alt+ArrowRight");
  assert.equal(await depth(), "2");
  await expect(newFolder).toBeFocused();
  await page.keyboard.press("Control+z");
  assert.equal(await depth(), "1");
  await choose(newId);
  await page.keyboard.press("Control+Shift+z");
  assert.equal(await depth(), "2");
  await choose(newId);
  await page.keyboard.press("Alt+ArrowLeft");
  assert.equal(await depth(), "1");
  await page.keyboard.press("Alt+ArrowUp");
  let children = await folders
    .locator('[data-depth="1"] [data-folder-target]')
    .evaluateAll((els) =>
      els.map((el) => el.getAttribute("data-folder-target")),
    );
  assert.ok(children.indexOf(newId) < children.indexOf("x"));
  await page.keyboard.press("Alt+ArrowDown");
  children = await folders
    .locator('[data-depth="1"] [data-folder-target]')
    .evaluateAll((els) =>
      els.map((el) => el.getAttribute("data-folder-target")),
    );
  assert.ok(children.indexOf(newId) > children.indexOf("x"));
  await page.keyboard.press("Alt+ArrowLeft");
  assert.equal(await depth(), "0");
  await choose("pigment");
  // Disabled outdent consumes Alt+Left instead of navigating browser history.
  const url = page.url();
  await page.keyboard.press("Alt+ArrowLeft");
  assert.equal(page.url(), url);
  await choose(newId);
  await folders.getByLabel("이동할 폴더").selectOption("acne");
  await newFolder.focus();
  await page.keyboard.press("Alt+l");
  await expect(
    folders.getByRole("button", {
      name: "키보드 새 폴더 원본 폴더로 이동",
      exact: true,
    }),
  ).toHaveCount(1);
  const link = folders.getByRole("button", {
    name: "키보드 새 폴더 원본 폴더로 이동",
    exact: true,
  });
  const linkId = await link.evaluate(
    (el) => el.closest<HTMLElement>("[data-tree-id]")!.dataset.treeId!,
  );
  await choose(linkId);
  await page.keyboard.press("Alt+g");
  await expect(newFolder).toBeFocused();
  await folders.getByLabel("이동할 폴더").selectOption("pigment");
  await newFolder.focus();
  await page.keyboard.press("Alt+m");
  assert.equal(await depth(), "1");
  await folders.getByLabel("이동할 폴더").selectOption("acne");
  await newFolder.focus();
  await page.keyboard.press("Alt+c");
  await expect(
    folders.locator(".folder-node").filter({ hasText: "키보드 새 폴더" }),
  ).toHaveCount(3);
  await choose("pigment");
  await page.keyboard.press("Alt+Home");
  await rows
    .getByRole("button", { name: "현재 목록 선택", exact: true })
    .focus();
  await page.keyboard.press("Control+a");
  await expect(rows.getByRole("checkbox", { checked: true })).toHaveCount(2);
  await page.keyboard.press("Control+Shift+a");
  await expect(rows.getByRole("checkbox", { checked: true })).toHaveCount(0);
  await page.keyboard.press("Control+a");
  await folders.getByLabel("이동할 폴더").selectOption("pigment");
  await choose("pigment");
  await page.keyboard.press("Alt+p");
  await expect(rows.getByRole("checkbox", { checked: true })).toHaveCount(0);
  // Delete still opens a confirmation; Escape cancels without deleting.
  await choose(newId);
  await page.keyboard.press("Delete");
  await expect(
    page.getByRole("dialog", { name: "폴더 삭제 확인" }),
  ).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(
    page.getByRole("dialog", { name: "폴더 삭제 확인" }),
  ).toHaveCount(0);
  await choose(newId);
  await page.keyboard.press("Alt+Escape");
  await expect(
    folders.getByRole("button", { name: "폴더 목록 수정", exact: true }),
  ).toBeVisible();
  await expect(
    folders
      .locator("[data-folder-target]")
      .filter({ hasText: "키보드 새 폴더" }),
  ).toHaveCount(0);
  // Enter product editing from the published catalog, then exercise modal scope.
  await rows
    .getByRole("button", { name: "시험 미용 상품 검토하기", exact: true })
    .click();
  const product = page.getByRole("dialog", {
    name: "상품·옵션 편집",
    exact: true,
  });
  await product
    .getByRole("button", { name: "단축키 안내", exact: true })
    .focus();
  const optionCount = await product.locator(".option-edit").count();
  await page.keyboard.press("Alt+n");
  await expect(product.locator(".option-edit")).toHaveCount(optionCount + 1);
  await page.keyboard.press("Control+z");
  await expect(product.locator(".option-edit")).toHaveCount(optionCount);
  await page.keyboard.press("Alt+c");
  await expect(product.getByLabel("상품명", { exact: true })).toHaveValue(
    "시험 미용 상품 (복사)",
  );
  await page.keyboard.press("Alt+Enter");
  await expect(product).toHaveCount(0);
  await rows.getByRole("button", { name: "모두 접기", exact: true }).focus();
  await page.keyboard.press("Alt+1");
  await expect(rows.locator(".catalog-option-visible")).toHaveCount(0);
  await page.keyboard.press("Alt+2");
  await expect(rows.locator(".catalog-option-visible").first()).toBeVisible();
  await page.keyboard.press("Shift+/");
  await expect(help).toBeVisible();
  await page.setViewportSize({ width: 390, height: 844 });
  assert.ok(await help.evaluate((el) => el.scrollWidth <= el.clientWidth));
  await page.screenshot({
    path: "private/browser085/shortcut-help-mobile.png",
  });
  await page.keyboard.press("Escape");
  await page.setViewportSize({ width: 1500, height: 1050 });
  await rows
    .getByRole("button", { name: "현재 목록 선택", exact: true })
    .focus();
  await page.keyboard.press("Alt+n");
  await expect(product.getByLabel("상품명", { exact: true })).toHaveValue(
    "새 상품",
  );
  await product.getByLabel("상품명", { exact: true }).fill("키보드 상품");
  await product.getByLabel("상품명", { exact: true }).press("Alt+n");
  await expect(product.locator(".option-edit")).toHaveCount(0);
  await page.keyboard.press("Control+s");
  await expect(product).toHaveCount(0);
  await expect(
    rows.locator(".catalog-product-title").filter({ hasText: "키보드 상품" }),
  ).toBeVisible();
  await rows
    .getByRole("button", { name: "현재 목록 선택", exact: true })
    .focus();
  await page.keyboard.press("Control+a");
  await page.keyboard.press("Alt+r");
  await expect(page.locator(".bulk-edit")).toHaveAttribute("open", "");
  await expect(
    rows.getByLabel("시험 미용 상품 기본 가격", { exact: true }),
  ).toHaveValue("11000");
  await page
    .locator(".bulk-edit")
    .getByLabel("시험 미용 상품 판매", { exact: true })
    .check();
  await rows
    .getByRole("button", { name: "현재 목록 선택", exact: true })
    .focus();
  await page.keyboard.press("Alt+d");
  await expect(
    page
      .locator(".bulk-edit")
      .getByLabel("시험 미용 상품 판매", { exact: true }),
  ).not.toBeChecked();
  await page
    .getByPlaceholder("탭으로 구분된 여러 행")
    .fill("점·잡티·기미\t붙여넣기 후보\t기본\t5000\t포함");
  await rows
    .getByRole("button", { name: "현재 목록 선택", exact: true })
    .focus();
  await page.keyboard.press("Alt+v");
  await expect(
    rows.locator(".catalog-product-title").filter({ hasText: "붙여넣기 후보" }),
  ).toBeVisible();
  await page.keyboard.press("Control+Shift+Enter");
  await expect(page.locator(".error")).toContainText("초안을 저장했습니다");
  await page.keyboard.press("Control+Shift+Enter");
  await expect(
    page.getByRole("button", { name: "검증 후 게시", exact: true }),
  ).toHaveCount(0);
  assert.deepEqual(errors, []);
  await writeFile(
    "artifacts/catalog-shortcuts-085.json",
    JSON.stringify(
      {
        ok: true,
        checks: [
          "edit-only help badge",
          "help isolation/focus/mobile",
          "create + IME protection",
          "arrow reorder/indent/outdent + undo/redo",
          "boundary prevents browser back",
          "move/copy/link/original",
          "bulk move clears selection",
          "delete cancel",
          "edit cancel",
          "product new/copy/option/undo",
          "selection/fold",
          "save shortcut",
        "price adjustment/deactivation/paste/publish",
        ],
        pageErrors: errors,
      },
      null,
      2,
    ),
  );
  console.log("Catalog shortcuts browser checks passed");
} catch (e) {
  console.log("UI errors", await page.locator(".error").allTextContents());
  await page.screenshot({ path: "private/browser085/failure.png" });
  throw e;
} finally {
  await browser.close();
}
