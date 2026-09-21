import { chromium, expect, type Dialog } from "@playwright/test";
import { readFile, writeFile } from "node:fs/promises";
import assert from "node:assert/strict";
const creds = JSON.parse(await readFile("private/local-setup.json", "utf8"));
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
  name = "편집시험" + uid;
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
  await page.getByLabel("사진 편집 캔버스").waitFor();
};
const save = async () => {
  const photoSave = button("사진 편집 저장");
  if (await photoSave.isEnabled()) await photoSave.click();
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
      const photos = [];
      for (let i = 1; i <= 5; i++)
        photos.push(
          await stagePhoto(
            new File([blob], `photo${i}.png`, { type: "image/png" }),
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
  // The initially displayed photo has no explicit editing ID yet. Selection
  // and reordering must still protect its unsaved edits before switching it.
  await button("↶ 좌 90°").click();
  const editedRotation = await page.getByLabel("자유회전").inputValue();
  page.off("dialog", acceptDialog);
  let discardPrompts = 0;
  const dismissDiscard = async (d: Dialog) => {
    discardPrompts++;
    await d.dismiss();
  };
  page.on("dialog", dismissDiscard);
  await button("photo1.png 선택").click();
  await expect(button("photo1.png 선택")).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByLabel("자유회전")).toHaveValue(editedRotation);
  assert.equal(discardPrompts, 1);
  await button("photo1.png 순서 이동").press("ArrowRight");
  await expect(page.locator(".active-photo-editor h3")).toHaveText("photo1.png");
  await expect(page.getByLabel("자유회전")).toHaveValue(editedRotation);
  assert.equal(discardPrompts, 2);
  page.off("dialog", dismissDiscard);
  page.on("dialog", acceptDialog);
  await button("photo1.png 선택").click();
  await expect(page.locator(".active-photo-editor h3")).toHaveText("photo2.png");
  await button("photo1.png 선택").click();
  await expect(page.locator(".active-photo-editor h3")).toHaveText("photo1.png");
  await expect(page.getByLabel("자유회전")).toHaveValue("0");
  await expect(button("사진 편집 저장")).toBeDisabled();
  await expect(page.locator(".selected-photo-rail button")).toHaveCount(5);
  await expect(button("1열")).toHaveCount(0);
  const rail = (await page.locator(".selected-photo-rail").boundingBox())!,
    editor = (await page.locator(".active-photo-editor").boundingBox())!;
  assert.ok(rail.x + rail.width <= editor.x);
  await button("photo1.png 편집").click();
  await page.waitForTimeout(400);
  assert.ok((await page.locator(".active-photo-editor").boundingBox())!.y < 90);
  await button("비교 크게 보기").click();
  await button("2열").click();
  const figs = page.locator(".photo-lightbox figure");
  await expect(figs).toHaveCount(5);
  const f1 = (await figs.nth(0).boundingBox())!,
    f2 = (await figs.nth(1).boundingBox())!;
  assert.ok(f1.width + f2.width > 1400);
  assert.ok(Math.abs(f1.y - f2.y) < 2);
  await back();
  await expect(page.locator(".photo-lightbox")).toHaveCount(0);
  // Reorder uses captured pointers, a floating preview and FLIP animation.
  const handle = button("photo1.png 순서 이동");
  await handle.scrollIntoViewIfNeeded();
  const h = (await handle.boundingBox())!,
    target = (await page.locator(".thumbnail-card").nth(2).boundingBox())!;
  await page.mouse.move(h.x + h.width / 2, h.y + h.height / 2);
  await page.mouse.down();
  await page.mouse.move(
    target.x + target.width / 2,
    target.y + target.height / 2,
    { steps: 8 },
  );
  await expect(page.locator(".photo-drag-ghost")).toBeVisible();
  await page.mouse.up();
  await expect(page.locator(".photo-drag-ghost")).toHaveCount(0);
  await save();
  let c = await current();
  assert.notEqual(c.photos[0].name, "photo1.png");
  await button("photo1.png 바로 편집").click();
  await button("선택").click();
  // Original rectangle at x .1-.3, y .2-.4; moving retains both vertices.
  await drag(0.2, 0.2, 0.3, 0.3);
  await save();
  c = await current();
  let p = c.photos.find((p: any) => p.name === "photo1.png");
  assert.ok(p.annotations[0].points[0].x > 0.18, JSON.stringify(p.annotations));
  assert.equal(p.annotations[0].points.length, 2);
  await button("photo1.png 바로 편집").click();
  await button("선택").click();
  await canvas.click({
    position: {
      x: (await canvas.boundingBox())!.width * 0.3,
      y: (await canvas.boundingBox())!.height * 0.3,
    },
  });
  await button("선택 주석 수정").click();
  await page.getByLabel("설정 색상").fill("#1122ff");
  await button("주석 적용").click();
  await save();
  c = await current();
  assert.equal(
    c.photos.find((p: any) => p.name === "photo1.png").annotations[0].color,
    "#1122ff",
  );
  // Text input is modal, at the clicked location, and is staged until photo+consult save.
  await button("photo1.png 바로 편집").click();
  await button("글자").click();
  await expect(page.getByLabel("텍스트 내용")).toHaveCount(0);
  await canvas.click({
    position: {
      x: (await canvas.boundingBox())!.width * 0.5,
      y: (await canvas.boundingBox())!.height * 0.5,
    },
  });
  await expect(
    page.getByRole("dialog", { name: "텍스트 박스 설정" }),
  ).toBeVisible();
  await page.getByLabel("텍스트 내용").fill("경과 확인");
  await page.getByLabel("주석 폰트").selectOption("jua");
  await button("글자 적용").click();
  assert.equal(
    (await current()).photos.find((p: any) => p.name === "photo1.png")
      .annotations.length,
    1,
  );
  await button("선택 주석 수정").click();
  await page.getByLabel("텍스트 내용").fill("경과 수정");
  await button("글자 적용").click();
  await button("사진 편집 저장").click();
  // Refresh retains the working consultation but never writes it to the server.
  await button("새로고침").click();
  assert.equal(
    (await current()).photos.find((p: any) => p.name === "photo1.png")
      .annotations.length,
    1,
  );
  await save();
  c = await current();
  p = c.photos.find((p: any) => p.name === "photo1.png");
  assert.equal(p.annotations[1].text, "경과 수정");
  assert.equal(p.annotations[1].font, "jua");
  await button("photo1.png 바로 편집").click();
  await button("선택").click();
  const text = p.annotations[1],
    tx = text.points[0].x,
    ty = text.points[0].y;
  await canvas.click({
    position: {
      x: (await canvas.boundingBox())!.width * (tx + text.box.width / 2),
      y: (await canvas.boundingBox())!.height * (ty + text.box.height / 2),
    },
  });
  await drag(
    tx + text.box.width,
    ty + text.box.height,
    tx + text.box.width * 1.4,
    ty + text.box.height * 1.4,
  );
  await save();
  assert.ok(
    (await current()).photos.find((p: any) => p.name === "photo1.png")
      .annotations[1].fontSize >
      text.fontSize * 1.2,
  );

  await button("photo1.png 바로 편집").click();
  await button("영역 자르기 (포트레이트)").click();
  const frame = page.locator(".crop-frame"),
    before = (await frame.boundingBox())!;
  await page.getByLabel("자유회전").fill("30");
  const after = (await frame.boundingBox())!;
  assert.ok(
    Math.abs(before.x - after.x) < 1 &&
      Math.abs(before.width - after.width) < 1,
  );
  const corner = page.locator(".handle-se"),
    cb = (await corner.boundingBox())!;
  await page.mouse.move(cb.x + 12, cb.y + 12);
  await page.mouse.down();
  await page.mouse.move(cb.x - 45, cb.y - 30, { steps: 6 });
  await page.mouse.up();
  assert.ok((await frame.boundingBox())!.width < before.width - 30);
  await page.screenshot({
    path: "artifacts/editor-040-crop.png",
    fullPage: true,
  });
  await button("자르기 적용").click();
  await save();
  c = await current();
  p = c.photos.find((p: any) => p.name === "photo1.png");
  assert.ok(p.viewportCrop);
  assert.equal(p.rotation, 30);
  const output = await page.evaluate(async (p) => {
    const { annotatedBlob } = await import(
      /* @vite-ignore */ String("/src/components/PhotoEditor.tsx")
    );
    const b = await annotatedBlob(p);
    const i = await createImageBitmap(b);
    return { width: i.width, height: i.height };
  }, p);
  assert.ok(output.width > 0 && output.height > 0);
  const expectedWidth =
    (1000 * Math.cos(Math.PI / 6) + 750 * Math.sin(Math.PI / 6)) *
    p.viewportCrop.width;
  const expectedHeight =
    (1000 * Math.sin(Math.PI / 6) + 750 * Math.cos(Math.PI / 6)) *
    p.viewportCrop.height;
  assert.ok(
    Math.abs(output.width - expectedWidth) < 2 &&
      Math.abs(output.height - expectedHeight) < 2,
  );
  // Pinch remains available while using the pen; no stray annotation is committed.
  await button("photo2.png 바로 편집").click();
  await button("펜").click();
  await canvas.scrollIntoViewIfNeeded();
  const cb2 = (await canvas.boundingBox())!;
  const client = await page.context().newCDPSession(page);
  const touch = (x: number, y: number, id: number) => ({
    x: cb2.x + cb2.width * x,
    y: cb2.y + cb2.height * y,
    id,
    radiusX: 3,
    radiusY: 3,
    force: 1,
  });
  await client.send("Input.dispatchTouchEvent", {
    type: "touchStart",
    touchPoints: [touch(0.3, 0.3, 1)],
  });
  await client.send("Input.dispatchTouchEvent", {
    type: "touchMove",
    touchPoints: [touch(0.32, 0.3, 1)],
  });
  await client.send("Input.dispatchTouchEvent", {
    type: "touchStart",
    touchPoints: [touch(0.32, 0.3, 1), touch(0.6, 0.3, 2)],
  });
  await client.send("Input.dispatchTouchEvent", {
    type: "touchMove",
    touchPoints: [touch(0.2, 0.35, 1), touch(0.7, 0.35, 2)],
  });
  await client.send("Input.dispatchTouchEvent", {
    type: "touchEnd",
    touchPoints: [touch(0.7, 0.35, 2)],
  });
  await client.send("Input.dispatchTouchEvent", {
    type: "touchMove",
    touchPoints: [touch(0.75, 0.35, 2)],
  });
  await client.send("Input.dispatchTouchEvent", {
    type: "touchEnd",
    touchPoints: [],
  });
  assert.ok(
    Number(await page.getByLabel("확대 축소", { exact: true }).inputValue()) >
      25,
  );
  await expect(button("사진 편집 저장")).toBeDisabled();
  await button("화면 맞춤").click();
  // Basic crop is visible even with fully transparent, thick annotation style.
  await page.getByLabel("주석 투명도").fill("100");
  await page.getByLabel("주석 굵기").fill("30");
  await button("영역 자르기").click();
  await canvas.scrollIntoViewIfNeeded();
  const bb = (await canvas.boundingBox())!;
  await page.mouse.move(bb.x + bb.width * 0.2, bb.y + bb.height * 0.2);
  await page.mouse.down();
  await page.mouse.move(bb.x + bb.width * 0.8, bb.y + bb.height * 0.8, {
    steps: 6,
  });
  const whitePixels = await canvas.evaluate((c: HTMLCanvasElement) => {
    const d = c.getContext("2d")!.getImageData(0, 0, c.width, c.height).data;
    let n = 0;
    for (let i = 0; i < d.length; i += 4)
      if (d[i] > 245 && d[i + 1] > 245 && d[i + 2] > 245) n++;
    return n;
  });
  assert.ok(whitePixels > 100);
  await page.mouse.up();
  await save();
  const cropped = (await current()).photos.find(
    (p: any) => p.name === "photo2.png",
  );
  assert.ok(cropped.crop);
  assert.equal(cropped.annotations.length, 0);
  await button("photo3.png 바로 편집").click();
  await button("글자").click();
  await canvas.click({
    position: {
      x: (await canvas.boundingBox())!.width * 0.5,
      y: (await canvas.boundingBox())!.height * 0.5,
    },
  });
  await page.getByLabel("텍스트 내용").fill("삭제 시험");
  await button("글자 적용").click();
  await button("선택 주석 삭제").click();
  await expect(button("선택 주석 수정")).toHaveCount(0);
  await expect(button("사진 편집 저장")).toBeDisabled();
  await button("photo1.png 대표사진").click();
  await save();
  await button("photo5.png 삭제").click();
  await expect(button("photo5.png 선택")).toHaveCount(0);
  assert.equal((await current()).photos.length, 5);
  await save();
  assert.equal((await current()).photos.length, 4);
  await page.screenshot({
    path: "artifacts/editor-040-desktop.png",
    fullPage: true,
  });
  // Photo-only save is intentionally not restored after leaving the consultation.
  await button("photo1.png 바로 편집").click();
  await button("↶ 좌 90°").click();
  await button("사진 편집 저장").click();
  await page.reload();
  await open();
  await button("photo1.png 바로 편집").click();
  await expect(page.getByLabel("자유회전")).toHaveValue("30");
  await page.setViewportSize({ width: 800, height: 1100 });
  await page.screenshot({
    path: "artifacts/editor-040-portrait.png",
    fullPage: true,
  });
  await back(); // photo tab -> consult tab
  await back(); // consultation -> patient detail
  await expect(page.locator(".consultation-cover")).toHaveCount(1);
  assert.deepEqual(errors, []);
  await writeFile(
    "artifacts/editor-040-verification.json",
    JSON.stringify(
      {
        passed: true,
        tests: [
          "login choice",
          "refresh",
          "native back event",
          "editor scroll",
          "selected rail",
          "full-width comparison",
          "animated reorder",
          "all-annotation move/edit",
          "text modal",
          "separate photo save",
          "screen-aligned crop",
          "cover",
          "thumbnail deletion",
          "photo save isolation",
          "unsaved edits protected during selection and reordering",
        ],
        output,
      },
      null,
      2,
    ),
  );
  console.log("Editor 0.4 browser checks passed");
} catch (e) {
  await page.screenshot({
    path: "artifacts/editor-040-failure.png",
    fullPage: true,
  });
  throw e;
} finally {
  await browser.close();
}
