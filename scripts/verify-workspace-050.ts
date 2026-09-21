import { chromium, expect, type Dialog } from "@playwright/test";
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
page.setDefaultTimeout(18000);
await page.addInitScript(() => {
  (window as any).__name = (f: unknown) => f;
});
const errors: string[] = [];
page.on("pageerror", (e) => errors.push(e.message));
const acceptDialog = (d: Dialog) => d.accept();
page.on("dialog", acceptDialog);
const uid = Date.now().toString().slice(-8),
  name = "화면시험" + uid;
const button = (name: string) =>
  page.getByRole("button", { name, exact: true });
const back = () =>
  page.evaluate(() => window.dispatchEvent(new Event("codimate:back")));
const current = () =>
  page.evaluate(async (uid) => {
    const { api } = await import(/* @vite-ignore */ String("/src/lib/api.ts"));
    return (await api("/state")).state.consultations.find(
      (c: any) => c.id === "editor-" + uid,
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
    .click();
  await page.getByRole("button", { name: /01 사진/ }).click();
  await page
    .getByRole("button", { name: "photo1.png 편집", exact: true })
    .waitFor();
};
const save = async () => {
  const photoSave = button("사진 편집 저장");
  if (await photoSave.count()) {
    if (await photoSave.isEnabled()) await photoSave.click();
    await button("편집기 닫기").click();
  }
  const r = page.waitForResponse(
    (r) =>
      r.url().endsWith("/api/commands") &&
      r.request().postDataJSON()?.type === "consultation.save",
  );
  await button("보류·변경 저장").click();
  assert.equal((await r).status(), 200);
  await expect(page.locator(".busy-bar")).toHaveCount(0);
};
const canvas = page.getByLabel("사진 편집 캔버스");
const drag = async (x: number, y: number, x2: number, y2: number) => {
  await canvas.scrollIntoViewIfNeeded();
  const b = (await canvas.boundingBox())!;
  await page.mouse.move(b.x + b.width * x, b.y + b.height * y);
  await page.mouse.down();
  await page.mouse.move(b.x + b.width * x2, b.y + b.height * y2, { steps: 10 });
  await page.mouse.up();
};
try {
  await page.goto("http://localhost:5173");
  await page
    .getByLabel("등록된 아이디 선택", { exact: true })
    .selectOption(creds.username);
  await expect(page.getByLabel("아이디", { exact: true })).toHaveValue(
    creds.username,
  );
  await page.getByLabel("비밀번호", { exact: true }).fill(creds.password);
  await button("로그인").click();
  await page.getByRole("heading", { name: "환자목록", exact: true }).waitFor();
  await page.evaluate(
    async ({ uid, name }) => {
      const { api, command, makeCommand, stagePhoto } = await import(
        /* @vite-ignore */ String("/src/lib/api.ts")
      );
      const s = await api("/state");
      const userId = s.user.id;
      await command(
        makeCommand(
          "patient.create",
          {
            name,
            sex: "F",
            dob: "1980-01-01",
            phone: "010" + uid,
            address: "시험동",
          },
          "patient-" + uid,
        ),
      );
      await command(
        makeCommand(
          "consultation.create",
          { patientId: "patient-" + uid, category: "미용" },
          "editor-" + uid,
        ),
      );
      const c = document.createElement("canvas");
      c.width = 1000;
      c.height = 750;
      const x = c.getContext("2d")!;
      x.fillStyle = "#d7c1aa";
      x.fillRect(0, 0, 1000, 750);
      x.fillStyle = "#d03030";
      x.fillRect(0, 0, 160, 750);
      const blob = await new Promise<Blob>((r) =>
        c.toBlob((b) => r(b!), "image/png"),
      );
      const portrait = document.createElement("canvas");
      portrait.width = 600;
      portrait.height = 1000;
      const portraitContext = portrait.getContext("2d")!;
      portraitContext.fillStyle = "#a8bcc9";
      portraitContext.fillRect(0, 0, 600, 1000);
      portraitContext.fillStyle = "#244c67";
      portraitContext.fillRect(0, 0, 600, 120);
      const portraitBlob = await new Promise<Blob>((resolve) =>
        portrait.toBlob((b) => resolve(b!), "image/png"),
      );
      const photos = [];
      for (let i = 1; i <= 5; i++)
        photos.push(
          await stagePhoto(
            new File([i === 2 ? portraitBlob : blob], `photo${i}.png`, {
              type: "image/png",
            }),
            "editor-" + uid,
            userId,
          ),
        );
      photos[0].annotations = [
        {
          id: "rect",
          tool: "rect",
          color: "#008800",
          width: 4,
          authorId: userId,
          points: [
            { x: 0.1, y: 0.2 },
            { x: 0.3, y: 0.4 },
          ],
        },
      ];
      await command(
        makeCommand(
          "consultation.save",
          {
            lines: [],
            discount: { kind: "amount", value: 0 },
            vat: "separate",
            memo: "",
            photos,
          },
          "editor-" + uid,
          1,
        ),
      );
    },
    { uid, name },
  );
  await button("새로고침").click();
  await open();
  await expect(canvas).toHaveCount(0);
  const list = page.getByLabel("상담 사진 순서", { exact: true });
  const ids = (root: any) =>
    root
      .locator(":scope > [data-sort-id]")
      .evaluateAll((els: HTMLElement[]) => els.map((el) => el.dataset.sortId));
  const movePhoto = async (
    root: any,
    handle: any,
    to: number,
    cancel = false,
  ) => {
    await handle.scrollIntoViewIfNeeded();
    const before = await ids(root);
    const h = (await handle.boundingBox())!;
    const target = (await root
      .locator(":scope > [data-sort-id]")
      .nth(to)
      .boundingBox())!;
    await page.mouse.move(h.x + h.width / 2, h.y + h.height / 2);
    await page.mouse.down();
    await page.mouse.move(
      target.x + target.width / 2,
      target.y + target.height / 2,
      { steps: 8 },
    );
    await expect(page.locator(".photo-drag-ghost")).toBeVisible();
    const transforms = () =>
      root
        .locator(":scope > [data-sort-id]")
        .evaluateAll((els: HTMLElement[]) =>
          els.map((el) => el.style.transform),
        );
    const stable = await transforms();
    for (let i = 0; i < 12; i++) {
      await page.mouse.move(
        target.x + target.width / 2 + (i % 2),
        target.y + target.height / 2,
      );
      assert.deepEqual(
        await transforms(),
        stable,
        "hover must not swap back and forth",
      );
      assert.deepEqual(await ids(root), before, "order commits only on drop");
    }
    if (cancel) await page.keyboard.press("Escape");
    await page.mouse.up();
    await expect(page.locator(".photo-drag-ghost")).toHaveCount(0);
    if (cancel) assert.deepEqual(await ids(root), before);
    else assert.notDeepEqual(await ids(root), before);
  };
  await movePhoto(list, button("photo1.png 순서 이동"), 2);
  await expect(canvas).toHaveCount(0);
  await save();
  let saved = await current();
  assert.deepEqual(
    saved.photos.map((p: any) => p.name),
    ["photo2.png", "photo3.png", "photo1.png", "photo4.png", "photo5.png"],
  );
  await movePhoto(list, button("photo2.png 순서 이동"), 2, true);
  // Explicit edit opens a full-screen dialog; unsaved changes survive rail reordering.
  await button("photo1.png 편집").click();
  const editor = page.getByRole("dialog", {
    name: "전체화면 사진 편집",
    exact: true,
  });
  await expect(editor).toBeVisible();
  const eb = (await editor.boundingBox())!;
  assert.equal(eb.x, 0);
  assert.equal(eb.y, 0);
  assert.equal(eb.width, 1500);
  assert.equal(eb.height, 1100);
  await expect(button("펜").locator("svg")).toHaveCount(1);
  assert.equal((await button("펜").innerText()).trim(), "");
  await expect(button("펜")).toHaveAttribute("title", "펜 (P)");
  await button("↶ 좌 90°").click();
  const rotation = await page.getByLabel("자유회전").inputValue();
  const rail = page.getByLabel("편집 사진 순서", { exact: true });
  const rb = (await rail.boundingBox())!,
    ab = (await page.locator(".active-photo-editor").boundingBox())!;
  assert.ok(rb.x + rb.width <= ab.x);
  await movePhoto(rail, button("photo1.png 편집 목록 순서 이동"), 0);
  await expect(page.locator(".active-photo-editor h3")).toHaveText(
    "photo1.png",
  );
  await expect(page.getByLabel("자유회전")).toHaveValue(rotation);
  page.off("dialog", acceptDialog);
  let prompts = 0;
  const dismiss = async (d: Dialog) => {
    prompts++;
    await d.dismiss();
  };
  page.on("dialog", dismiss);
  await button("편집기 닫기").click();
  await expect(editor).toBeVisible();
  await button("photo2.png 바로 편집").click();
  await expect(page.locator(".active-photo-editor h3")).toHaveText(
    "photo1.png",
  );
  assert.equal(prompts, 2);
  page.off("dialog", dismiss);
  page.on("dialog", acceptDialog);
  await button("0° 원래 회전").click();
  await expect(button("사진 편집 저장")).toBeDisabled();
  // Text preview is drawn with the same font, fitting, color and opacity as the saved annotation.
  await button("글자").click();
  await canvas.click({
    position: {
      x: (await canvas.boundingBox())!.width * 0.4,
      y: (await canvas.boundingBox())!.height * 0.4,
    },
  });
  await page.getByLabel("텍스트 내용").fill("경과 확인\n미리보기");
  const preview = page.getByLabel("텍스트 사진 미리보기", { exact: true });
  await expect(preview).toBeVisible();
  const pixels = () =>
    preview.evaluate((c: HTMLCanvasElement) => c.toDataURL());
  const beforeText = await pixels();
  await page.getByLabel("주석 폰트").selectOption("jua");
  await page.getByLabel("글자 크기", { exact: true }).fill("72");
  await page.getByLabel("설정 색상").fill("#ffff00");
  await expect(button("글자 적용")).toBeEnabled();
  await expect.poll(pixels).not.toBe(beforeText);
  await page.screenshot({
    path: "artifacts/workspace-050-text-preview.png",
    fullPage: true,
  });
  assert.equal(
    (await current()).photos.find((p: any) => p.name === "photo1.png")
      .annotations.length,
    1,
  );
  const projected = await pixels();
  await button("글자 적용").click();
  await button("사진 편집 저장").click();
  await save();
  saved = await current();
  const photo = saved.photos.find((p: any) => p.name === "photo1.png");
  assert.equal(photo.annotations[1].font, "jua");
  assert.equal(photo.annotations[1].fontSize, 72);
  const actualPreview = await page.evaluate(async (photo) => {
    const { paintPhoto } = await import(
      /* @vite-ignore */ String("/src/components/PhotoEditor.tsx")
    );
    const { mediaUrl } = await import(
      /* @vite-ignore */ String("/src/lib/api.ts")
    );
    const img = new Image();
    const url = await mediaUrl(photo.mediaId);
    img.src = url;
    await img.decode();
    const c = document.createElement("canvas");
    c.width = 1200;
    c.height = 900;
    paintPhoto(c.getContext("2d")!, img, photo);
    URL.revokeObjectURL(url);
    return c.toDataURL();
  }, photo);
  assert.equal(
    projected,
    actualPreview,
    "text preview matches applied photo pixels",
  );
  // Touch dragging directly on a rail thumbnail keeps the selected editor open.
  await button("photo1.png 편집").click();
  const railBefore = await ids(rail);
  const source = (await button("photo1.png 바로 편집").boundingBox())!;
  const dest = (await rail
    .locator(":scope > [data-sort-id]")
    .nth(2)
    .boundingBox())!;
  const touch = await page.context().newCDPSession(page);
  const pt = (x: number, y: number) => ({
    x,
    y,
    id: 1,
    radiusX: 3,
    radiusY: 3,
    force: 1,
  });
  await touch.send("Input.dispatchTouchEvent", {
    type: "touchStart",
    touchPoints: [pt(source.x + 20, source.y + 20)],
  });
  await touch.send("Input.dispatchTouchEvent", {
    type: "touchMove",
    touchPoints: [pt(dest.x + 20, dest.y + 20)],
  });
  await touch.send("Input.dispatchTouchEvent", {
    type: "touchEnd",
    touchPoints: [],
  });
  await expect.poll(() => ids(rail)).not.toEqual(railBefore);
  await expect(page.locator(".active-photo-editor h3")).toHaveText(
    "photo1.png",
  );
  await page.screenshot({
    path: "artifacts/workspace-050-editor.png",
    fullPage: true,
  });
  await back();
  await expect(editor).toHaveCount(0);
  await save();
  // Comparison modes fit the output without distorting it and permit drag sorting.
  await button("비교 크게 보기").click();
  const viewer = page.getByRole("dialog", {
    name: "사진 비교 크게 보기",
    exact: true,
  });
  await button("2열").click();
  await button("전체화면맞춤").click();
  const viewport = viewer.locator(".viewer-viewport");
  const overflow = () =>
    viewport.evaluate((e: HTMLElement) => ({
      x: e.scrollWidth - e.clientWidth,
      y: e.scrollHeight - e.clientHeight,
    }));
  await expect.poll(overflow).toEqual({ x: 0, y: 0 });
  await button("넓이맞춤").click();
  const first = (await viewer.locator("figure").nth(0).boundingBox())!;
  assert.ok(first.width > 700);
  await button("높이맞춤").click();
  await expect
    .poll(async () =>
      Math.abs(
        (await viewer.locator("canvas").first().boundingBox())!.height -
          (await viewport.boundingBox())!.height,
      ),
    )
    .toBeLessThan(5);
  await button("전체화면맞춤").click();
  const compare = viewer.getByLabel("비교 사진 순서", { exact: true });
  const compareBefore = await ids(compare);
  await movePhoto(compare, viewer.locator(".comparison-image").first(), 3);
  await expect.poll(() => ids(compare)).not.toEqual(compareBefore);
  await page.screenshot({
    path: "artifacts/workspace-050-comparison.png",
    fullPage: true,
  });
  await page.setViewportSize({ width: 800, height: 1100 });
  await expect.poll(overflow).toEqual({ x: 0, y: 0 });
  await page.screenshot({
    path: "artifacts/workspace-050-comparison-portrait.png",
    fullPage: true,
  });
  await back();
  await expect(viewer).toHaveCount(0);
  await save();
  const expectedOrder = (await current()).photos.map((p: any) => p.id);
  await page.getByRole("button", { name: /02 相談|02.*상담/ }).click();
  await expect(canvas).toHaveCount(0);
  await expect(
    page.locator(".consultation-viewer-panel .comparison-grid canvas"),
  ).toHaveCount(5);
  await expect(page.getByLabel("시술 검색")).toBeVisible();
  await page.screenshot({
    path: "artifacts/workspace-050-consult-portrait.png",
    fullPage: true,
  });
  await page.setViewportSize({ width: 1500, height: 1100 });
  await page.screenshot({
    path: "artifacts/workspace-050-consult.png",
    fullPage: true,
  });
  await button("사진 선택·추가").click();
  await expect(canvas).toHaveCount(0);
  await page.reload();
  await open();
  assert.deepEqual(
    (await current()).photos.map((p: any) => p.id),
    expectedOrder,
  );
  // Photo-only save stays a consultation draft; a reload restores the last server save.
  await button("photo1.png 편집").click();
  await button("↶ 좌 90°").click();
  await button("사진 편집 저장").click();
  await button("편집기 닫기").click();
  await page.reload();
  await open();
  await button("photo1.png 편집").click();
  await expect(page.getByLabel("자유회전")).toHaveValue("0");
  // Existing crop and annotation tools remain usable in full-screen mode.
  await button("영역 자르기 (포트레이트)").click();
  await page.getByLabel("자유회전").fill("30");
  await button("자르기 적용").click();
  await save();
  assert.ok(
    (await current()).photos.find((p: any) => p.name === "photo1.png")
      .viewportCrop,
  );
  await button("photo1.png 대표사진").click();
  await button("photo2.png 대표사진").click();
  await expect(button("photo1.png 대표사진")).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  await expect(button("photo2.png 대표사진")).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  await save();
  assert.equal(
    (await current()).photos.filter((p: any) => p.representative).length,
    2,
  );
  await button("환자 상세").click();
  await expect(page.locator(".consultation-cover")).toHaveCount(2);
  const covers = await page
    .locator(".consultation-cover canvas")
    .evaluateAll((els: HTMLCanvasElement[]) =>
      els.map((el) => ({
        fit: getComputedStyle(el).objectFit,
        w: el.getBoundingClientRect().width,
        h: el.getBoundingClientRect().height,
      })),
    );
  for (const cover of covers) {
    assert.equal(cover.fit, "contain");
    assert.equal(cover.w, cover.h);
  }
  await page.screenshot({
    path: "artifacts/workspace-050-covers.png",
    fullPage: true,
  });
  assert.deepEqual(errors, []);
  await writeFile(
    "artifacts/workspace-050-verification.json",
    JSON.stringify(
      {
        passed: true,
        checks: [
          "no automatic editor",
          "stable drag slots",
          "pointer cancellation",
          "fullscreen editor",
          "icon toolbar",
          "unsaved close/switch guards",
          "editor rail reorder preserves edits",
          "text preview equals applied pixels",
          "touch rail sorting",
          "three fit modes",
          "comparison drag sorting",
          "portrait layout",
          "consultation viewer",
          "saved order restoration",
          "photo/consultation save separation",
          "rotated crop",
          "multiple square contain-fit covers",
        ],
      },
      null,
      2,
    ),
  );
  console.log("Workspace 0.5 browser checks passed");
} catch (e) {
  await page.screenshot({
    path: "artifacts/workspace-050-failure.png",
    fullPage: true,
  });
  throw e;
} finally {
  await browser.close();
}
