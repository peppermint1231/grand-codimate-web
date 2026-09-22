import { chromium, expect } from "@playwright/test";
import { readFile, mkdir, writeFile } from "node:fs/promises";
import assert from "node:assert/strict";
import { threeCatalogs } from "../tests/fixtures/catalogs";
const health = (await (
  await fetch("http://127.0.0.1:8787/api/health")
).json()) as any;
assert.equal(health.mode, "local-development");
const creds = JSON.parse(await readFile("private/local-setup.json", "utf8"));
await mkdir("private/browser084", { recursive: true });
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
    id: "links-" + uid,
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
  const folders = page.getByRole("complementary", { name: "고민별 폴더 목록" }),
    rows = page.getByRole("region", { name: "상품 목록" });
  const choose = (id: string) =>
    folders.locator(`[data-folder-target="${id}"]`).click();
  await folders
    .getByRole("button", { name: "폴더 목록 수정", exact: true })
    .click();
  await folders
    .getByRole("button", { name: "단축키 안내", exact: true })
    .click();
  await expect(
    page.getByRole("dialog", { name: "단가표 편집 단축키" }),
  ).toContainText("링크 붙여넣기");
  await page.keyboard.press("Escape");
  await folders
    .getByRole("button", { name: "모두 펼치기", exact: true })
    .click();
  await choose("x");
  await page.keyboard.press("Control+c");
  await choose("acne");
  await page.keyboard.press("Control+Alt+v");
  const icon = folders.getByRole("button", {
    name: "레이저 원본 폴더로 이동",
    exact: true,
  });
  await expect(icon).toHaveCount(1);
  const linkId = await icon.evaluate(
    (el) => el.closest<HTMLElement>("[data-tree-id]")!.dataset.treeId!,
  );
  await choose(linkId);
  await expect(rows.locator(".catalog-product-row")).toHaveCount(1);
  await expect(
    folders.locator(`[data-folder-target="${linkId}~xx"]`),
  ).toBeVisible();
  await icon.click();
  await expect(folders.locator('[data-tree-id="x"]')).toHaveClass(/selected/);
  await folders.getByLabel("이동할 폴더", { exact: true }).selectOption("acne");
  await folders.getByRole("button", { name: "폴더 링크", exact: true }).click();
  await expect(icon).toHaveCount(2);
  await choose("x");
  await page.keyboard.press("F2");
  await page.getByLabel("폴더 이름", { exact: true }).fill("공통 레이저");
  await page.getByRole("button", { name: "로즈", exact: true }).click();
  await page
    .getByRole("button", { name: "폴더 이름 적용", exact: true })
    .click();
  await expect(
    folders.locator(`[data-folder-target="${linkId}"] span`),
  ).toHaveCSS("color", "rgb(160, 77, 97)");
  await expect(
    folders.getByRole("button", {
      name: "공통 레이저 원본 폴더로 이동",
      exact: true,
    }),
  ).toHaveCount(2);
  // Ordinary folder paste remains an independent copy; cut/paste moves the original without breaking its links.
  await choose("x");
  await page.keyboard.press("Control+c");
  await choose("acne");
  await page.keyboard.press("Control+v");
  await folders.getByRole("button", { name: /전체 상품/ }).click();
  await expect(rows.locator(".catalog-product-row")).toHaveCount(3);
  await page.keyboard.press("Control+z");
  await expect(rows.locator(".catalog-product-row")).toHaveCount(2);
  await choose("x");
  await page.keyboard.press("Control+x");
  await choose("acne");
  await page.keyboard.press("Control+v");
  await expect(folders.locator('[data-tree-id="x"]')).toBeVisible();
  await page.keyboard.press("Control+z");
  await choose(linkId);
  await page.keyboard.press("Delete");
  await expect(
    page.getByRole("dialog", { name: "폴더 삭제 확인" }),
  ).toContainText("원본 폴더와 상품");
  await page.getByRole("button", { name: "링크만 삭제", exact: true }).click();
  await expect(folders.locator(`[data-folder-target="${linkId}"]`)).toHaveCount(
    0,
  );
  await page.keyboard.press("Control+z");
  await expect(
    folders.locator(`[data-folder-target="${linkId}"]`),
  ).toBeVisible();
  await page.keyboard.press("Control+s");
  await expect(
    folders.getByRole("button", { name: "폴더 목록 수정", exact: true }),
  ).toBeVisible();
  const published = await pub();
  const shared = published.products.find(
    (p: any) => p.id === c.products[0].id && p.book === "미용",
  );
  assert.equal(shared.folders.length, 3);
  assert.equal(
    published.products.filter((p: any) => p.book === "미용").length,
    2,
  );
  await choose(linkId);
  await rows
    .getByRole("button", {
      name: c.products[0].name + " 검토하기",
      exact: true,
    })
    .click();
  const modal = page.getByRole("dialog", { name: "상품·옵션 편집" });
  await modal.getByLabel("상품명", { exact: true }).fill("링크 동기화 상품");
  await modal.getByLabel("가격 (원)", { exact: true }).fill("22000");
  await modal.getByLabel("부가세", { exact: true }).selectOption("inclusive");
  await modal.getByLabel("가격·옵션 검토 완료", { exact: true }).check();
  await modal.getByLabel("상품명", { exact: true }).press("Control+s");
  await expect(modal).toHaveCount(0);
  assert(
    !(await pub()).products.some((p: any) => p.name === "링크 동기화 상품"),
  );
  await rows.locator(".catalog-product-title").first().focus();
  await page.keyboard.press("Control+a");
  await expect(
    rows.getByRole("checkbox", { name: "링크 동기화 상품 선택", exact: true }),
  ).toBeChecked();
  await page.getByRole("button", { name: "검증 후 게시", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "검증 후 게시", exact: true }),
  ).toHaveCount(0);
  await choose("acne");
  await expect(rows.locator(".catalog-product-row")).toHaveCount(2);
  await expect(
    rows
      .locator(".catalog-product-title")
      .filter({ hasText: "링크 동기화 상품" }),
  ).toHaveCount(1);
  await folders
    .getByRole("button", { name: "모두 펼치기", exact: true })
    .click();
  await page.screenshot({
    path: "private/browser084/links-desktop.png",
    fullPage: true,
  });
  const publicPage = await browser.newPage({
    viewport: { width: 390, height: 844 },
  });
  publicPage.on("pageerror", (e) => errors.push(e.message));
  await publicPage.goto("http://localhost:5173/discover");
  await publicPage
    .locator(".discovery-concerns button")
    .filter({ hasText: "여드름" })
    .click();
  await publicPage.getByRole("button", { name: /시술 둘러보기/ }).click();
  await expect(
    publicPage
      .locator(".discovery-products article")
      .filter({ hasText: "링크 동기화 상품" }),
  ).toHaveCount(1);
  const folderSelect = publicPage.locator("select");
  await folderSelect.selectOption(linkId + "~xx");
  await expect(publicPage.locator(".discovery-products article")).toHaveCount(
    1,
  );
  await publicPage.screenshot({
    path: "private/browser084/discovery-linked-mobile.png",
    fullPage: true,
  });
  assert(
    await publicPage.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  );
  await publicPage.close();
  // Deleting the original warns about all external references; cancellation preserves them.
  await folders
    .getByRole("button", { name: "폴더 목록 수정", exact: true })
    .click();
  await choose("x");
  await page.keyboard.press("Delete");
  await expect(
    page.getByRole("dialog", { name: "폴더 삭제 확인" }),
  ).toContainText("링크 2개");
  await page
    .getByRole("button", { name: "취소하고 항목 옮기기", exact: true })
    .click();
  await folders
    .locator(".folder-edit-toolbar")
    .getByRole("button", { name: "취소", exact: true })
    .click();
  assert.deepEqual(errors, []);
  const result = {
    passed: true,
    multipleLinkedViews: true,
    sourceIconNavigation: true,
    sourceNameColorSynced: true,
    sharedProductEdit: true,
    uniqueProductsInDiscovery: true,
    linkDeletePreservesOriginal: true,
    originalDeleteWarns: true,
    keyboardCopyCutPasteLinkRenameDeleteSaveSelect: true,
    undoPreservesLinks: true,
    mobileNoOverflow: true,
    pageErrors: errors,
  };
  await writeFile(
    "artifacts/catalog-links-084.json",
    JSON.stringify(result, null, 2),
  );
  console.log(JSON.stringify(result));
} finally {
  await browser.close();
}
