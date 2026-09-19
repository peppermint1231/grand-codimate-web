import { chromium, expect } from "@playwright/test";
import { readFile, mkdir, writeFile } from "node:fs/promises";
import assert from "node:assert/strict";
const creds = JSON.parse(await readFile("private/local-setup.json", "utf8"));
const browser = await chromium.launch({ args: ["--no-sandbox"] });
const page = await browser.newPage({ viewport: { width: 1500, height: 1080 } });
page.setDefaultTimeout(20000);
const login = async () => {
  await page.getByLabel("아이디", { exact: true }).fill(creds.username);
  await page.getByLabel("비밀번호", { exact: true }).fill(creds.password);
  await page.getByRole("button", { name: "로그인", exact: true }).click();
  await page.getByRole("heading", { name: "환자목록", exact: true }).waitFor();
};
const errors: string[] = [];
page.on("pageerror", (e) => errors.push(e.message));
page.on("dialog", (d) =>
  d.accept(d.type() === "prompt" ? "주석 시험" : undefined),
);
const clickCommand = async (label: string, type: string) => {
  const response = page.waitForResponse(
    (r) =>
      r.url().endsWith("/api/commands") &&
      r.request().method() === "POST" &&
      r.request().postDataJSON()?.type === type,
  );
  await page.getByRole("button", { name: label, exact: true }).click();
  const r = await response;
  assert.equal(r.status(), 200, await r.text());
  await expect(page.locator(".busy-bar")).toHaveCount(0);
};
const uid = Date.now().toString().slice(-7),
  name = "사진검증" + uid;
try {
  await page.goto("http://localhost:5173");
  await page.getByLabel("아이디", { exact: true }).fill(creds.username);
  await page.getByLabel("비밀번호", { exact: true }).fill(creds.password);
  await page.getByRole("button", { name: "로그인", exact: true }).click();
  await page.getByRole("heading", { name: "환자목록", exact: true }).waitFor();
  await page.evaluate(async (uid) => {
    const { api, command, makeCommand } = await import(
      /* @vite-ignore */ String("/src/lib/api.ts")
    );
    const id = crypto.randomUUID(),
      now = new Date().toISOString();
    const p = {
      id: "photo-product-" + uid,
      rev: 1,
      createdAt: now,
      updatedAt: now,
      category: "미용",
      name: "사진시험 패키지",
      description: "시험용",
      composition: "5회",
      active: true,
      sources: [],
      options: [
        {
          id: "photo-option-" + uid,
          label: "5회",
          price: 100000,
          tax: "inclusive",
          review: false,
          issues: [],
          sources: [],
          priceKind: "clinic",
          unit: "패키지",
        },
      ],
    };
    await command(
      makeCommand(
        "catalog.save",
        {
          catalog: {
            id,
            rev: 0,
            createdAt: now,
            updatedAt: now,
            schemaVersion: 1,
            version: "photo-test-" + uid,
            status: "draft",
            products: [p],
            references: [],
          },
        },
        id,
      ),
    );
    await command(makeCommand("catalog.publish", {}, id, 1));
  }, uid);
  await page.reload();
  await login();
  await page.getByRole("button", { name: "새 환자 등록", exact: true }).click();
  await page.getByLabel("이름", { exact: true }).fill(name);
  await page.getByLabel("생년월일").fill("1980-01-01");
  await page.getByLabel("전화번호").fill("01000000000");
  // Exercise provider callback without sending patient information to the address service.
  await page.route(
    "https://t1.kakaocdn.net/mapjsapi/bundle/postcode/prod/postcode.v2.js",
    (route) =>
      route.fulfill({
        contentType: "application/javascript",
        body: `window.kakao={Postcode:class {constructor(o){this.o=o;}embed(el){let b=document.createElement('button');b.textContent='테스트 주소 선택';b.onclick=()=>this.o.oncomplete({sido:'서울',sigungu:'강남구',bname:'역삼동'});el.appendChild(b);}}};`,
      }),
  );
  await page.getByRole("button", { name: "주소 검색", exact: true }).click();
  await page.getByRole("button", { name: "테스트 주소 선택" }).click();
  await expect(page.getByLabel("주소 (동까지)", { exact: true })).toHaveValue(
    "서울 강남구 역삼동",
  );
  await page
    .getByRole("dialog", { name: "새 환자 등록" })
    .getByRole("button", { name: "저장", exact: true })
    .click();
  await page.getByRole("button", { name: "새 상담 시작", exact: true }).click();
  await page
    .getByRole("dialog", { name: "새 상담 시작" })
    .getByRole("button", { name: "상담 시작", exact: true })
    .click();
  await page.getByRole("heading", { name: name + " 님의 상담" }).waitFor();
  const png = await page.evaluate(() => {
    const c = document.createElement("canvas");
    c.width = 1000;
    c.height = 750;
    const x = c.getContext("2d")!;
    x.fillStyle = "#ddc19f";
    x.fillRect(0, 0, 1000, 750);
    x.fillStyle = "#28594d";
    x.fillRect(100, 100, 300, 400);
    return c.toDataURL("image/png").split(",")[1];
  });
  await page.route("**/api/media", async (route) => {
    if (route.request().method() === "POST")
      await new Promise((r) => setTimeout(r, 4000));
    await route.continue();
  });
  const started = Date.now();
  await page
    .locator("input[type=file]")
    .first()
    .setInputFiles(
      Array.from({ length: 5 }, (_, i) => ({
        name: `test-${i + 1}.png`,
        mimeType: "image/png",
        buffer: Buffer.from(png, "base64"),
      })),
    );
  await expect(page.locator(".thumbnail-card")).toHaveCount(5, {
    timeout: 3000,
  });
  const previewMs = Date.now() - started;
  assert.ok(previewMs < 3500, "Previews waited for network upload");
  const layouts: Record<number, number[]> = {};
  for (const n of [1, 2, 3, 4]) {
    await page.getByRole("button", { name: n + "열", exact: true }).click();
    const ys = await page
      .locator(".comparison-grid figure")
      .evaluateAll((es) =>
        es.map((e) => Math.round(e.getBoundingClientRect().top)),
      );
    const rows = [...new Set(ys)];
    layouts[n] = rows.map((y) => ys.filter((x) => x === y).length);
    assert.deepEqual(
      layouts[n],
      n === 1
        ? [1, 1, 1, 1, 1]
        : n === 2
          ? [2, 2, 1]
          : n === 3
            ? [3, 2]
            : [4, 1],
    );
  }
  await page
    .getByRole("button", { name: "test-1.png 순서 이동", exact: true })
    .focus();
  await page.keyboard.press("ArrowRight");
  await expect(page.locator(".thumbnail-toggle").first()).toContainText(
    "test-2.png",
  );
  await page
    .getByRole("button", { name: "test-5.png 선택", exact: true })
    .click();
  await expect(page.locator(".comparison-grid figure")).toHaveCount(4);
  await page
    .getByRole("button", { name: "test-5.png 선택", exact: true })
    .click();
  await page
    .locator(".thumbnail-card")
    .first()
    .getByRole("button", { name: "편집", exact: true })
    .click();
  await page.waitForFunction(() => {
    const c = document.querySelector(
      ".photo-editor canvas",
    ) as HTMLCanvasElement;
    return !!c && c.getContext("2d")!.getImageData(600, 450, 1, 1).data[3] > 0;
  });
  const canvas = page.getByLabel("사진 편집 캔버스"),
    box = (await canvas.boundingBox())!;
  await page.getByRole("button", { name: "사각형", exact: true }).click();
  await page.getByLabel("선 종류").selectOption("dashed");
  await page.getByLabel("주석 투명도").fill("30");
  const draw = async (x: number, y: number, x2: number, y2: number) => {
    await canvas.scrollIntoViewIfNeeded();
    const box = (await canvas.boundingBox())!;
    await page.mouse.move(box.x + box.width * x, box.y + box.height * y);
    await page.mouse.down();
    await page.mouse.move(box.x + box.width * x2, box.y + box.height * y2, {
      steps: 8,
    });
    await page.mouse.up();
  };
  await draw(0.2, 0.2, 0.45, 0.45);
  await page.getByRole("button", { name: "모자이크", exact: true }).click();
  await draw(0.55, 0.3, 0.75, 0.55);
  await page.getByLabel("주석 폰트").selectOption("serif");
  await page.getByRole("button", { name: "글자", exact: true }).click();
  await canvas.click({ position: { x: 100, y: 100 } });
  await page.getByLabel("자유회전").fill("35");
  await page.getByRole("button", { name: "↶ 좌 90°", exact: true }).click();
  await page.getByRole("button", { name: "↷ 우 90°", exact: true }).click();
  await canvas.click();
  await page.keyboard.press("Control+z");
  await page.keyboard.press("Control+Shift+z");
  await page.getByRole("button", { name: "편집 닫기", exact: true }).click();
  const saving = page.waitForResponse(
    (r) =>
      r.url().endsWith("/api/commands") &&
      r.request().method() === "POST" &&
      r.request().postDataJSON()?.type === "consultation.save",
  );
  await clickCommand("보류·변경 저장", "consultation.save");
  assert.equal((await saving).status(), 200);
  await expect(page.locator(".busy-bar")).toHaveCount(0);
  const saved = await page.evaluate(async (name) => {
    const { api } = await import(/* @vite-ignore */ String("/src/lib/api.ts"));
    const s = await api("/state");
    return s.state.consultations.find((x: any) => x.patient.name === name);
  }, name);
  assert.equal(saved.photoColumns, 4);
  assert.equal(saved.photos[0].name, "test-2.png");
  assert.equal(saved.photos[0].rotation, 35);
  assert.ok(
    saved.photos[0].annotations.some(
      (a: any) => a.tool === "rect" && a.dashed && a.opacity === 0.7,
    ),
  );
  assert.ok(saved.photos[0].annotations.some((a: any) => a.tool === "mosaic"));
  assert.ok(
    saved.photos[0].annotations.some(
      (a: any) => a.tool === "text" && a.font === "serif",
    ),
  );
  await page.reload();
  await login();
  await page.getByRole("button", { name: "사진", exact: true }).count();
  // Return to the synthetic patient and confirm the persisted comparison selection.
  await page.getByPlaceholder("이름·전화번호·생년월일 검색").count();
  await page.getByRole("row").filter({ hasText: name }).click();
  await page
    .getByRole("button")
    .filter({ hasText: "미용 · 첫 상담" })
    .first()
    .click();
  await expect(page.locator(".comparison-grid")).toHaveAttribute(
    "data-columns",
    "4",
  );
  await expect(page.locator(".comparison-grid figure")).toHaveCount(5);
  await mkdir("artifacts", { recursive: true });
  await page.screenshot({
    path: "artifacts/photo-comparison-desktop.png",
    fullPage: true,
  });
  await page.getByRole("button", { name: "02 상담", exact: false }).click();
  await page
    .getByRole("button", { name: /5회/ })
    .filter({ hasText: "100,000" })
    .first()
    .click();
  await clickCommand("보류·변경 저장", "consultation.save");
  await page.getByRole("button", { name: "03 견적서", exact: false }).click();
  await clickCommand("성공 확정 · 진행 중", "consultation.finalize");
  await expect(page.getByText("진행 중", { exact: true })).toHaveCount(0);
  await page.getByRole("button", { name: "환자 상세", exact: true }).click();
  await expect(page.getByText("진행 중", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "중간상담", exact: true }).click();
  await page.getByLabel("이어갈 이전 상담").selectOption(saved.id);
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "상담 시작", exact: true })
    .click();
  await expect(page.locator(".thumbnail-card")).toHaveCount(5);
  await expect(page.locator(".comparison-grid figure")).toHaveCount(0);
  await page.locator(".thumbnail-toggle").first().click();
  await page.locator(".thumbnail-toggle").nth(1).click();
  await page.getByRole("button", { name: "02 상담", exact: false }).click();
  await expect(
    page.getByRole("heading", { name: "시술 선택", exact: true }),
  ).toHaveCount(0);
  await page.getByLabel("상담 메모").fill("중간 경과와 불편 사항 테스트");
  await clickCommand("보류·변경 저장", "consultation.save");
  await page.setViewportSize({ width: 800, height: 1200 });
  await page.screenshot({
    path: "artifacts/photo-comparison-portrait.png",
    fullPage: true,
  });
  await page.getByRole("button", { name: "03 상담결과", exact: false }).click();
  const pdfDownload = page.waitForEvent("download");
  await page.getByRole("button", { name: "병원용 PDF", exact: true }).click();
  await (await pdfDownload).saveAs("artifacts/photo-comparison.pdf");
  assert.equal(
    (await readFile("artifacts/photo-comparison.pdf"))
      .subarray(0, 4)
      .toString(),
    "%PDF",
  );
  await page.getByRole("button", { name: "환자 상세", exact: true }).click();
  await page.getByRole("button", { name: "연장상담", exact: true }).click();
  await page.getByLabel("이어갈 이전 상담").selectOption(saved.id);
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "상담 시작", exact: true })
    .click();
  await page.getByRole("button", { name: "02 상담", exact: false }).click();
  await expect(page.locator(".cart-line")).toHaveCount(1);
  await page.getByRole("button", { name: "03 견적서", exact: false }).click();
  await clickCommand("연장 안 함 · 완료", "consultation.finalize");
  await page.getByRole("button", { name: "환자 상세", exact: true }).click();
  await expect(page.getByText("완료", { exact: true })).toBeVisible();
  await clickCommand("진행 중으로 전환", "consultation.package");
  await expect(page.getByText("진행 중", { exact: true })).toBeVisible();
  assert.deepEqual(errors, []);
  await writeFile(
    "artifacts/photo-workflow-verification.json",
    JSON.stringify(
      { previewMs, delayedUploadMs: 4000, layouts, passed: true },
      null,
      2,
    ),
  );
  console.log(
    "Photo workflow browser verification passed.",
    JSON.stringify({ previewMs, layouts }),
  );
} catch (e) {
  await mkdir("artifacts", { recursive: true });
  await page.screenshot({
    path: "artifacts/photo-test-failure.png",
    fullPage: true,
  });
  throw e;
} finally {
  await browser.close();
}
