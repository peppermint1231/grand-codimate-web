import { chromium, expect } from "@playwright/test";
import { readFile, mkdir, writeFile } from "node:fs/promises";
import assert from "node:assert/strict";
import { threeCatalogs } from "../tests/fixtures/catalogs";
const health = (await (
  await fetch("http://127.0.0.1:8787/api/health")
).json()) as any;
assert.equal(health.mode, "local-development");
const creds = JSON.parse(await readFile("private/local-setup.json", "utf8"));
await mkdir("private/browser083", { recursive: true });
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
    id: "undo-" + uid,
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
  const editActions = page.getByRole("group", { name: "편집 되돌리기" });
  const productName = c.products[0].name;
  await folders
    .getByRole("button", { name: "폴더 목록 수정", exact: true })
    .click();
  await expect(
    editActions.getByRole("button", { name: "되돌리기", exact: true }),
  ).toBeDisabled();
  await rows
    .getByRole("button", { name: "현재 목록 선택", exact: true })
    .click();
  await folders.getByLabel("이동할 폴더", { exact: true }).selectOption("acne");
  await folders
    .getByRole("button", { name: "선택 2개 상품 이동", exact: true })
    .click();
  await expect(rows.getByRole("checkbox", { checked: true })).toHaveCount(0);
  await expect(rows.locator(".catalog-product-group")).toHaveCount(1);
  await editActions
    .getByRole("button", { name: "되돌리기", exact: true })
    .click();
  await expect(rows.locator(".catalog-product-group")).toHaveCount(2);
  await page.keyboard.press("Control+Shift+Z");
  await expect(rows.locator(".catalog-product-group")).toHaveCount(1);
  await page.keyboard.press("Control+z");
  await expect(rows.locator(".catalog-product-group")).toHaveCount(2);
  // Pointer-driven bulk move also clears the selection after a valid drop.
  await rows
    .getByRole("button", { name: "현재 목록 선택", exact: true })
    .click();
  const handle = rows.getByRole("button", {
    name: productName + " 이동",
    exact: true,
  });
  await handle.scrollIntoViewIfNeeded();
  await folders.evaluate((el) => {
    el.scrollTop = 0;
  });
  const h = (await handle.boundingBox())!,
    target = (await folders
      .locator('[data-folder-target="acne"]')
      .boundingBox())!;
  await page.mouse.move(h.x + h.width / 2, h.y + h.height / 2);
  await page.mouse.down();
  await page.mouse.move(
    target.x + target.width / 2,
    target.y + target.height / 2,
    { steps: 12 },
  );
  await page.mouse.up();
  await expect(rows.getByRole("checkbox", { checked: true })).toHaveCount(0);
  await expect(rows.locator(".catalog-product-group")).toHaveCount(1);
  await editActions
    .getByRole("button", { name: "되돌리기", exact: true })
    .click();
  await folders.locator('[data-folder-target="pigment"]').dblclick();
  await page
    .getByLabel("폴더 이름", { exact: true })
    .fill("폴더 실행 취소 확인");
  await page
    .getByRole("button", { name: "폴더 이름 적용", exact: true })
    .click();
  await expect(
    editActions.getByRole("button", { name: "다시 실행", exact: true }),
  ).toBeDisabled();
  await page.keyboard.press("Control+z");
  await expect(folders.locator('[data-folder-target="pigment"]')).toContainText(
    "점·잡티·기미",
  );
  await page.keyboard.press("Control+y");
  await expect(folders.locator('[data-folder-target="pigment"]')).toContainText(
    "폴더 실행 취소 확인",
  );
  await folders.getByRole("button", { name: "폴더 저장", exact: true }).click();
  await expect(
    folders.getByRole("button", { name: "폴더 목록 수정", exact: true }),
  ).toBeVisible();
  await rows
    .getByRole("button", { name: productName + " 검토하기", exact: true })
    .click();
  const modal = page.getByRole("dialog", { name: "상품·옵션 편집" }),
    actions = modal.getByRole("group", { name: "편집 되돌리기" });
  const name = modal.getByLabel("상품명", { exact: true });
  await name.fill("되돌리기");
  await name.pressSequentially(" 상품");
  await name.press("Control+z");
  await expect(name).toHaveValue(productName);
  await name.press("Meta+Shift+Z");
  await expect(name).toHaveValue("되돌리기 상품");
  const price = modal.getByLabel("가격 (원)", { exact: true });
  await price.fill("17000");
  await actions.getByRole("button", { name: "되돌리기", exact: true }).click();
  await expect(price).toHaveValue("10000");
  await actions.getByRole("button", { name: "다시 실행", exact: true }).click();
  await expect(price).toHaveValue("17000");
  await actions.getByRole("button", { name: "되돌리기", exact: true }).click();
  await price.fill("18000");
  await expect(
    actions.getByRole("button", { name: "다시 실행", exact: true }),
  ).toBeDisabled();
  await modal
    .getByRole("button", { name: "검토 내용 초안 저장", exact: true })
    .click();
  await expect(modal).toHaveCount(0);
  await expect(
    editActions.getByRole("button", { name: "되돌리기", exact: true }),
  ).toBeDisabled();
  await page.getByRole("button", { name: "검증 후 게시", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "검증 후 게시", exact: true }),
  ).toHaveCount(0);
  const history = page.locator(".catalog-history"),
    height = (await history.boundingBox())!.height;
  const trigger = history.getByRole("button", { name: /수정 이력/ });
  await trigger.click();
  const chooser = page.getByRole("dialog", { name: "수정 이력 · 되돌리기" });
  await expect(chooser).toBeVisible();
  assert((await history.boundingBox())!.height <= height + 1);
  assert((await chooser.boundingBox())!.height <= 1050 * 0.85 + 1);
  const list = chooser.getByRole("group", { name: "저장 이력 목록" });
  assert((await list.getByRole("button").count()) > 5);
  await list.getByRole("button").first().click();
  await expect(
    chooser.getByRole("button", { name: "이 시점으로 복원", exact: true }),
  ).toBeEnabled();
  await page.screenshot({
    path: "private/browser083/history-desktop.png",
    fullPage: true,
  });
  await page.keyboard.press("Escape");
  await expect(chooser).toHaveCount(0);
  await expect(trigger).toBeFocused();
  await trigger.click();
  await page.setViewportSize({ width: 390, height: 844 });
  await list.getByRole("button").first().click();
  assert(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  );
  await page.screenshot({
    path: "private/browser083/history-mobile.png",
    fullPage: true,
  });
  await chooser
    .getByRole("button", { name: "이 시점으로 복원", exact: true })
    .click();
  await expect(chooser).toHaveCount(0);
  assert((await pub()).products.some((p: any) => p.name === "되돌리기 상품"));
  assert.deepEqual(errors, []);
  const result = {
    passed: true,
    bulkMoveClearsSelection: true,
    dragMoveClearsSelection: true,
    folderUndoRedo: true,
    productUndoRedo: true,
    typingGrouped: true,
    redoBranchDiscarded: true,
    saveClearsUndo: true,
    historyModalBounded: true,
    historyEscapeFocus: true,
    historyRestoreCloses: true,
    mobileNoOverflow: true,
    pageErrors: errors,
  };
  await writeFile(
    "artifacts/catalog-undo-083.json",
    JSON.stringify(result, null, 2),
  );
  console.log(JSON.stringify(result));
} finally {
  await browser.close();
}
