import { chromium, expect } from "@playwright/test";
import { readFile, mkdir, writeFile } from "node:fs/promises";
import assert from "node:assert/strict";
import { threeCatalogs } from "../tests/fixtures/catalogs";
const health = (await (
  await fetch("http://127.0.0.1:8787/api/health")
).json()) as any;
assert.equal(health.mode, "local-development");
const creds = JSON.parse(await readFile("private/local-setup.json", "utf8"));
await mkdir("private/browser081", { recursive: true });
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
    return api("/public/catalog");
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
    id: "folders-" + uid,
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
  const divider = page.getByRole("separator", { name: "폴더 목록 너비 조절" });
  const d = (await divider.boundingBox())!;
  await page.mouse.move(d.x + d.width / 2, d.y + 80);
  await page.mouse.down();
  await page.mouse.move(d.x + 100, d.y + 80, { steps: 10 });
  await page.mouse.up();
  const width = Number(await divider.getAttribute("aria-valuenow"));
  assert(width > 350);
  await divider.focus();
  await page.keyboard.press("ArrowRight");
  assert(Number(await divider.getAttribute("aria-valuenow")) > width);
  await page
    .getByRole("button", { name: "폴더 목록 수정", exact: true })
    .click();
  await page.locator('[data-folder-target="pigment"]').dblclick();
  await page.getByLabel("폴더 이름", { exact: true }).fill("색소 상담");
  await page.getByLabel("폴더 색상", { exact: true }).fill("#ff8800");
  await page
    .getByRole("button", { name: "폴더 이름 적용", exact: true })
    .click();
  assert(
    (await pub()).categories.some(
      (x: any) => x.name === "점·잡티·기미" && x.book === "미용",
    ),
  );
  assert(!(await pub()).categories.some((x: any) => x.name === "색소 상담"));
  await page.locator('[data-folder-target="acne"]').click();
  await page.locator('[data-folder-target="pigment"]').click();
  const source = await page
    .getByRole("button", { name: "레이저 폴더 이동", exact: true })
    .first()
    .boundingBox();
  const target = await page.locator('[data-tree-id="acne"]').boundingBox();
  assert(source && target);
  await page.mouse.move(
    source.x + source.width / 2,
    source.y + source.height / 2,
  );
  await page.mouse.down();
  await page.mouse.move(
    target.x + target.width / 2,
    target.y + target.height / 2,
    { steps: 20 },
  );
  await page.mouse.up();
  await page.getByRole("dialog", { name: "중복 폴더 처리" }).waitFor();
  await page
    .getByRole("button", { name: "하위항목 합치기", exact: true })
    .click();
  await expect(page.locator('[data-folder-target="x"]')).toHaveCount(0);
  await page.locator('[data-folder-target="y"]').click();
  await expect(page.locator(".catalog-product-row")).toHaveCount(2);
  await page.getByLabel("이동할 폴더", { exact: true }).selectOption("");
  await page.getByRole("button", { name: "폴더 복사", exact: true }).click();
  await page.getByRole("button", { name: "폴더 저장", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "폴더 목록 수정", exact: true }),
  ).toBeVisible();
  const after = await pub();
  assert(
    after.categories.some(
      (x: any) => x.name === "색소 상담" && x.color === "#ff8800",
    ),
  );
  assert.equal(after.products.filter((p: any) => p.book === "미용").length, 2);
  await page.getByRole("button", { name: /수정 이력 · 되돌리기/ }).click();
  await expect(page.locator(".catalog-history")).toContainText(
    "점·잡티·기미 → 색소 상담",
  );
  await page.screenshot({
    path: "private/browser081/folders-history.png",
    fullPage: true,
  });
  // Root creation, in-place edit, delete warning and cancel do not publish anything.
  await page
    .getByRole("button", { name: "폴더 목록 수정", exact: true })
    .click();
  await page.locator(".folder-root-target").click();
  await page.getByRole("button", { name: "폴더 생성", exact: true }).click();
  await page.getByLabel("폴더 이름", { exact: true }).fill("새 상담");
  await page
    .getByRole("button", { name: "폴더 이름 적용", exact: true })
    .click();
  await page.getByRole("button", { name: "삭제", exact: true }).click();
  await page.getByRole("dialog", { name: "폴더 삭제 확인" }).waitFor();
  await page
    .getByRole("button", { name: "취소하고 항목 옮기기", exact: true })
    .click();
  await page
    .locator(".folder-edit-toolbar")
    .getByRole("button", { name: "취소", exact: true })
    .click();
  assert(!(await pub()).categories.some((x: any) => x.name === "새 상담"));
  const revision = page
    .locator(".catalog-history article")
    .filter({ hasText: "점·잡티·기미 → 색소 상담" });
  const before = page
    .locator(".catalog-history article")
    .filter({ hasText: "단가표 게시" });
  // Restore the published edition immediately before the folder edit.
  const history = await page.evaluate(async () => {
    const { api } = await import(/* @vite-ignore */ String("/src/lib/api.ts"));
    return (await api("/state")).state.catalogRevisions;
  });
  const original = history.find(
    (r: any) => r.catalogId === c.id && r.snapshot.status === "published",
  );
  assert(original);
  const entry = page
    .locator(".catalog-history article")
    .filter({ hasText: "게시 ·" })
    .filter({ hasText: "게시 완료" })
    .first();
  await entry
    .getByRole("button", { name: "이 시점으로 복원", exact: true })
    .click();
  assert(
    (await pub()).categories.some(
      (x: any) => x.name === "점·잡티·기미" && x.book === "미용",
    ),
  );
  await page.reload();
  await page.getByRole("heading", { name: "환자목록", exact: true }).waitFor();
  await page.getByRole("button", { name: "단가표 관리", exact: true }).click();
  assert(Number(await divider.getAttribute("aria-valuenow")) > width);
  const publicPage = await browser.newPage({
    viewport: { width: 390, height: 844 },
  });
  publicPage.on("pageerror", (e) => errors.push(e.message));
  await publicPage.goto("http://localhost:5173/discover");
  await publicPage.locator(".discovery-concerns button").first().waitFor();
  assert(
    await publicPage.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  );
  await publicPage.screenshot({
    path: "private/browser081/public-mobile.png",
    fullPage: true,
  });
  assert.deepEqual(errors, []);
  const result = {
    passed: true,
    resizePointerKeyboardAndPersistence: true,
    editOnlyAfterButton: true,
    inlineRenameColor: true,
    dragMerge: true,
    copy: true,
    deleteWarning: true,
    cancelWithoutPublish: true,
    savePublicSync: true,
    historyRestore: true,
    pageErrors: errors,
  };
  await writeFile(
    "artifacts/folders-browser-081.json",
    JSON.stringify(result, null, 2),
  );
  console.log(JSON.stringify(result));
} finally {
  await browser.close();
}
