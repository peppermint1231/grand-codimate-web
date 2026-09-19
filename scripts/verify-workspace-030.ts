import { chromium, expect } from "@playwright/test";
import { readFile, mkdir, writeFile } from "node:fs/promises";
import assert from "node:assert/strict";
const creds = JSON.parse(await readFile("private/local-setup.json", "utf8"));
const browser = await chromium.launch({ args: ["--no-sandbox"] });
const page = await browser.newPage({
  viewport: { width: 1500, height: 1100 },
  hasTouch: true,
});
page.setDefaultTimeout(20000);
await page.addInitScript(() => {
  (window as any).__name = (f: unknown) => f;
});
const errors: string[] = [];
page.on("pageerror", (e) => errors.push(e.message));
page.on("dialog", (d) => d.accept());
const uid = Date.now().toString().slice(-7),
  name = "개선시험" + uid;
const save = async () => {
  const editing = await page.locator(".active-photo-editor").count();
  const tool = editing
    ? await page
        .locator(".photo-editor .editor-tools button[aria-pressed=true]")
        .first()
        .innerText()
    : "";
  const r = page.waitForResponse(
    (r) =>
      r.url().endsWith("/api/commands") &&
      r.request().method() === "POST" &&
      r.request().postDataJSON()?.type === "consultation.save",
  );
  await page
    .getByRole("button", { name: "보류·변경 저장", exact: true })
    .click();
  const v = await r;
  assert.equal(v.status(), 200, await v.text());
  await expect(page.locator(".busy-bar")).toHaveCount(0);
  if (editing) {
    await page
      .getByRole("button", { name: "gesture.png 편집", exact: true })
      .click();
    await page.waitForFunction(() => {
      const c = document.querySelector(
        ".photo-editor canvas",
      ) as HTMLCanvasElement;
      return c && c.getContext("2d")!.getImageData(600, 450, 1, 1).data[3] > 0;
    });
    if (tool)
      await page.getByRole("button", { name: tool, exact: true }).click();
  }
};
const current = () =>
  page.evaluate(async () => {
    const { api } = await import(/* @vite-ignore */ String("/src/lib/api.ts"));
    const { state } = await api("/state");
    return state.consultations
      .filter((c: any) => c.photos.some((p: any) => p.name === "gesture.png"))
      .at(-1);
  });
try {
  await page.goto("http://localhost:5173");
  await page.getByLabel("아이디", { exact: true }).fill(creds.username);
  await page.getByLabel("비밀번호", { exact: true }).fill(creds.password);
  await page.getByRole("button", { name: "로그인", exact: true }).click();
  await page.getByRole("heading", { name: "환자목록", exact: true }).waitFor();
  await page.evaluate(
    async ({ uid, name }) => {
      const { command, makeCommand } = await import(
        /* @vite-ignore */ String("/src/lib/api.ts")
      );
      for (const [suffix, phone] of [
        ["A", "010" + uid + "0"],
        ["B", "010" + uid + "0"],
        ["C", "011" + uid + "0"],
      ])
        await command(
          makeCommand(
            "patient.create",
            {
              name: name + suffix,
              sex: "F",
              dob: "1980-01-01",
              phone,
              address: "시험동",
            },
            "workspace-" + uid + suffix,
          ),
        );
    },
    { uid, name },
  );
  await page.reload();
  await page.getByRole("heading", { name: "환자목록", exact: true }).waitFor();
  await page.getByRole("button", { name: "메뉴 접기", exact: true }).click();
  await expect(page.locator(".sidebar")).toBeHidden();
  assert.equal(
    Math.round((await page.locator(".workspace").boundingBox())!.x),
    0,
  );
  await page.reload();
  await page.getByRole("heading", { name: "환자목록", exact: true }).waitFor();
  await expect(page.locator(".sidebar")).toBeHidden();
  await page.getByRole("button", { name: "메뉴 펼치기", exact: true }).click();
  await page.getByLabel("환자 검색").fill(name);
  await page
    .getByRole("button", { name: name + "A 환자 수정", exact: true })
    .click();
  await page
    .getByRole("dialog", { name: "환자정보 수정" })
    .getByLabel("주소 (동까지)", { exact: true })
    .fill("수정동");
  await page
    .getByRole("dialog", { name: "환자정보 수정" })
    .getByRole("button", { name: "저장", exact: true })
    .click();
  await expect(page.getByRole("dialog", { name: "환자정보 수정" })).toHaveCount(
    0,
  );
  await page
    .getByRole("button", { name: name + "C 환자 삭제", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: name + "C 환자 삭제", exact: true }),
  ).toHaveCount(0);
  await page.getByLabel("삭제된 환자", { exact: true }).check();
  await page
    .getByRole("button", { name: name + "C 환자 복원", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: name + "C 환자 복원", exact: true }),
  ).toHaveCount(0);
  await page.getByLabel("삭제된 환자", { exact: true }).uncheck();
  const row = page
    .locator("tbody tr")
    .filter({ has: page.getByText(name + "A", { exact: true }) });
  await row.getByRole("button", { name: /중복 의심/ }).click();
  const dialog = page.getByRole("dialog", { name: "중복 의심 환자 비교·병합" });
  await expect(dialog).toContainText(name + "B");
  await dialog
    .getByRole("button", { name: "현재 환자를 남기고 병합", exact: true })
    .click();
  await dialog.getByLabel("병합 사유").fill("테스트 중복등록");
  await dialog.getByRole("button", { name: "병합 확정", exact: true }).click();
  await page
    .getByRole("heading", { name: name + "A 님", exact: true })
    .waitFor();
  await page.getByRole("button", { name: "새 상담 시작", exact: true }).click();
  await page
    .getByRole("dialog", { name: "새 상담 시작" })
    .getByRole("button", { name: "상담 시작", exact: true })
    .click();
  await page.getByRole("heading", { name: name + "A 님의 상담" }).waitFor();
  const png = await page.evaluate(() => {
    const c = document.createElement("canvas");
    c.width = 1000;
    c.height = 750;
    const x = c.getContext("2d")!;
    x.fillStyle = "#d7c1aa";
    x.fillRect(0, 0, 1000, 750);
    return c.toDataURL("image/png").split(",")[1];
  });
  await page
    .locator("input[type=file]")
    .first()
    .setInputFiles([
      {
        name: "gesture.png",
        mimeType: "image/png",
        buffer: Buffer.from(png, "base64"),
      },
    ]);
  await expect(page.locator(".thumbnail-card")).toHaveCount(1);
  const thumb = await page.locator(".thumbnail-card").boundingBox();
  assert.ok(thumb!.height < 150);
  await page
    .locator(".thumbnail-card")
    .getByRole("button", { name: "gesture.png 상세정보", exact: true })
    .click();
  await expect(
    page.getByRole("dialog", { name: "사진 상세정보" }),
  ).toContainText("gesture.png");
  await page
    .getByRole("dialog", { name: "사진 상세정보" })
    .getByRole("button", { name: "닫기", exact: true })
    .click();
  await page
    .getByRole("button", { name: "gesture.png 편집", exact: true })
    .click();
  const canvas = page.getByLabel("사진 편집 캔버스");
  await canvas.scrollIntoViewIfNeeded();
  await page.waitForFunction(() => {
    const c = document.querySelector(
      ".photo-editor canvas",
    ) as HTMLCanvasElement;
    return c && c.getContext("2d")!.getImageData(600, 450, 1, 1).data[3] > 0;
  });
  await page.getByRole("button", { name: "글자", exact: true }).click();
  await page.getByLabel("주석 폰트").selectOption("jua");
  await canvas.click({
    position: {
      x: (await canvas.boundingBox())!.width * 0.2,
      y: (await canvas.boundingBox())!.height * 0.3,
    },
  });
  await page.getByLabel("텍스트 내용").fill("이동 가능한 한글");
  await page.getByRole("button", { name: "글자 적용", exact: true }).click();
  await save();
  let c = await current();
  const first = c.photos[0].annotations[0];
  assert.equal(first.font, "jua");
  assert.ok(first.box);
  const drag = async (x: number, y: number, x2: number, y2: number) => {
    await canvas.scrollIntoViewIfNeeded();
    const b = (await canvas.boundingBox())!;
    await page.mouse.move(b.x + b.width * x, b.y + b.height * y);
    await page.mouse.down();
    await page.mouse.move(b.x + b.width * x2, b.y + b.height * y2, {
      steps: 8,
    });
    await page.mouse.up();
  };
  await page.getByRole("button", { name: "선택", exact: true }).click();
  let x = first.points[0].x + first.box.width / 2,
    y = first.points[0].y + first.box.height / 2;
  await drag(x, y, x + 0.1, y + 0.1);
  await save();
  c = await current();
  let moved = c.photos[0].annotations[0];
  assert.ok(
    moved.points[0].x > first.points[0].x + 0.08,
    JSON.stringify({ first, moved }),
  );
  x = moved.points[0].x + moved.box.width;
  y = moved.points[0].y + moved.box.height;
  await drag(x, y, x + moved.box.width * 0.4, y + moved.box.height * 0.4);
  await save();
  c = await current();
  assert.ok(c.photos[0].annotations[0].fontSize > first.fontSize * 1.2);
  await page.getByRole("button", { name: "스탬프", exact: true }).click();
  await page.getByRole("button", { name: "스탬프 ⭐", exact: true }).click();
  await canvas.click({
    position: {
      x: (await canvas.boundingBox())!.width * 0.65,
      y: (await canvas.boundingBox())!.height * 0.6,
    },
  });
  await save();
  c = await current();
  assert.equal(c.photos[0].annotations.at(-1).tool, "stamp");
  assert.equal(c.photos[0].annotations.at(-1).text, "⭐");
  await page.getByRole("button", { name: "펜", exact: true }).click();
  await canvas.scrollIntoViewIfNeeded();
  const b = (await canvas.boundingBox())!;
  const client = await page.context().newCDPSession(page);
  const touch = (x: number, y: number, id: number) => ({
    x: b.x + b.width * x,
    y: b.y + b.height * y,
    id,
    radiusX: 3,
    radiusY: 3,
    force: 1,
  });
  await client.send("Input.dispatchTouchEvent", {
    type: "touchStart",
    touchPoints: [touch(0.3, 0.35, 1)],
  });
  await client.send("Input.dispatchTouchEvent", {
    type: "touchMove",
    touchPoints: [touch(0.32, 0.35, 1)],
  });
  await client.send("Input.dispatchTouchEvent", {
    type: "touchStart",
    touchPoints: [touch(0.32, 0.35, 1), touch(0.6, 0.35, 2)],
  });
  await client.send("Input.dispatchTouchEvent", {
    type: "touchMove",
    touchPoints: [touch(0.2, 0.4, 1), touch(0.72, 0.4, 2)],
  });
  await client.send("Input.dispatchTouchEvent", {
    type: "touchEnd",
    touchPoints: [touch(0.72, 0.4, 2)],
  });
  await client.send("Input.dispatchTouchEvent", {
    type: "touchMove",
    touchPoints: [touch(0.75, 0.45, 2)],
  });
  await client.send("Input.dispatchTouchEvent", {
    type: "touchEnd",
    touchPoints: [],
  });
  assert.ok(
    Number(await page.getByLabel("확대 축소", { exact: true }).inputValue()) >
      25,
  );
  await save();
  const afterPinch = await current();
  assert.equal(afterPinch.photos[0].annotations.length, 2);
  await page.getByRole("button", { name: "화면 맞춤", exact: true }).click();
  await page.getByRole("button", { name: "↶ 좌 90°", exact: true }).click();
  await page.getByLabel("자유회전").fill("35");
  await page.getByRole("button", { name: "0° 원래 회전", exact: true }).click();
  await expect(page.getByLabel("자유회전")).toHaveValue("0");
  await save();
  await page.getByRole("button", { name: "편집 닫기", exact: true }).click();
  await page.getByRole("button", { name: "02 상담", exact: false }).click();
  await expect(
    page.getByText("사진·장바구니 비율", { exact: true }),
  ).toHaveCount(0);
  const separator = page.getByRole("separator", {
    name: "사진과 장바구니 분할선",
  });
  const before = await separator.getAttribute("aria-valuenow");
  await separator.focus();
  await page.keyboard.press("ArrowRight");
  assert.notEqual(await separator.getAttribute("aria-valuenow"), before);
  const dragDivider = async (vertical: boolean) => {
    await separator.scrollIntoViewIfNeeded();
    const b = (await separator.boundingBox())!;
    const old = Number(await separator.getAttribute("aria-valuenow"));
    const x = b.x + b.width / 2,
      y = b.y + b.height / 2;
    await page.mouse.move(x, y);
    await page.mouse.down();
    await page.mouse.move(x + (vertical ? 0 : 70), y + (vertical ? 70 : 0), {
      steps: 5,
    });
    await page.mouse.up();
    assert.ok(Number(await separator.getAttribute("aria-valuenow")) > old);
  };
  await dragDivider(false);
  await mkdir("artifacts", { recursive: true });
  await page.screenshot({
    path: "artifacts/workspace-030-desktop.png",
    fullPage: true,
  });
  await page.setViewportSize({ width: 800, height: 1100 });
  await dragDivider(true);
  await page.screenshot({
    path: "artifacts/workspace-030-portrait.png",
    fullPage: true,
  });
  await page.reload();
  await page.getByRole("heading", { name: "환자목록", exact: true }).waitFor();
  await page.clock.install();
  await page.clock.fastForward(20 * 60 * 1000);
  await expect(
    page.getByRole("heading", { name: "환자목록", exact: true }),
  ).toBeVisible();
  const final = await current();
  assert.equal(final.photos[0].annotations.length, 2);
  assert.equal(final.photos[0].rotation, 0);
  assert.equal(final.photos[0].annotations[0].font, "jua");
  const exported = await page.evaluate(async (photo) => {
    const { annotatedBlob } = await import(
      /* @vite-ignore */ String("/src/components/PhotoEditor.tsx")
    );
    const blob = await annotatedBlob(photo),
      image = await createImageBitmap(blob),
      canvas = document.createElement("canvas");
    canvas.width = image.width;
    canvas.height = image.height;
    const ctx = canvas.getContext("2d")!;
    ctx.drawImage(image, 0, 0);
    const stamp = photo.annotations.find((a: any) => a.tool === "stamp");
    return Array.from(
      ctx.getImageData(
        Math.round((stamp.points[0].x + stamp.box.width / 2) * image.width),
        Math.round((stamp.points[0].y + stamp.box.height / 2) * image.height),
        1,
        1,
      ).data,
    );
  }, final.photos[0]);
  assert.ok(
    exported[0] > 200 && exported[1] > 120 && exported[2] < 100,
    "Noto stamp must render in exported photo, not a missing glyph",
  );
  assert.deepEqual(errors, []);
  await writeFile(
    "artifacts/workspace-030-verification.json",
    JSON.stringify(
      {
        passed: true,
        checks: [
          "sidebar",
          "web-session-restore",
          "20min-idle",
          "patient-edit",
          "archive-restore",
          "duplicate-merge",
          "compact-thumbnails",
          "photo-info",
          "text-move-resize",
          "emoji-stamp",
          "real-touch-pinch-no-stray-stroke",
          "rotation-reset",
          "split-divider",
          "portrait",
          "saved-annotations",
        ],
      },
      null,
      2,
    ),
  );
  console.log("Workspace 0.3.0 browser workflow passed.");
} finally {
  await browser.close();
}
