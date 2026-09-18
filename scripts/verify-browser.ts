import { chromium } from "@playwright/test";
import { readFile, mkdir, writeFile } from "node:fs/promises";
import assert from "node:assert/strict";
const creds = JSON.parse(await readFile("private/local-setup.json", "utf8"));
await mkdir("artifacts", { recursive: true });
const browser = await chromium.launch({ args: ["--no-sandbox"] });
const page = await browser.newPage({
  viewport: { width: 1440, height: 1000 },
  acceptDownloads: true,
});
const errors: string[] = [];
page.on("pageerror", (e) => errors.push(e.message));
page.on("dialog", (d) => d.accept());
await page.goto("http://localhost:5173");
await page.getByLabel("아이디", { exact: true }).fill(creds.username);
await page.getByLabel("비밀번호", { exact: true }).fill(creds.password);
await page.getByRole("button", { name: "로그인", exact: true }).click();
await page.getByRole("heading", { name: "환자목록", exact: true }).waitFor();
await page.screenshot({
  path: "artifacts/01-patients-landscape.png",
  fullPage: true,
});
await page.getByRole("button", { name: "새 환자 등록" }).click();
const patientName = "기능검증" + Date.now().toString().slice(-5);
await page.getByLabel("이름", { exact: true }).fill(patientName);
await page.getByLabel("생년월일").fill("1970-03-12");
await page.getByLabel("전화번호").fill("01000000000");
await page.getByLabel("주소 (동까지)").fill("검증동");
await page
  .getByRole("dialog")
  .getByRole("button", { name: "저장", exact: true })
  .click();
await page
  .getByRole("heading", { name: patientName + " 님", exact: true })
  .waitFor();
await page.getByRole("button", { name: "새 상담 시작" }).click();
await page.getByRole("heading", { name: patientName + " 님의 상담" }).waitFor();
const fixture = await page.evaluate(() => {
  const c = document.createElement("canvas");
  c.width = 640;
  c.height = 480;
  const x = c.getContext("2d")!;
  x.fillStyle = "#d1d5d3";
  x.fillRect(0, 0, 640, 480);
  x.fillStyle = "#657d73";
  x.fillRect(80, 80, 160, 160);
  x.fillStyle = "#eea060";
  x.beginPath();
  x.arc(420, 220, 80, 0, Math.PI * 2);
  x.fill();
  return c.toDataURL("image/png").split(",")[1];
});
await page
  .locator('input[type="file"]')
  .first()
  .setInputFiles({
    name: "검증사진.png",
    mimeType: "image/png",
    buffer: Buffer.from(fixture, "base64"),
  });
await page.getByRole("button", { name: /1\. 검증사진/ }).waitFor();
const canvas = page.locator(".photo-editor canvas").first();
await page.waitForFunction(() => {
  const c = document.querySelector(".photo-editor canvas") as HTMLCanvasElement;
  return !!c && c.getContext("2d")!.getImageData(500, 375, 1, 1).data[3] > 0;
});
const box = await canvas.boundingBox();
assert.ok(box);
await page.mouse.move(box.x + box.width * 0.35, box.y + box.height * 0.35);
await page.mouse.down();
await page.mouse.move(box.x + box.width * 0.65, box.y + box.height * 0.55, {
  steps: 10,
});
await page.mouse.up();
await page.getByRole("button", { name: "90° 회전", exact: true }).click();
await page.getByRole("button", { name: "실행취소", exact: true }).click();
await page.getByRole("button", { name: "다시실행", exact: true }).click();
const inverseError = await page.evaluate(async () => {
  const { paintPhoto } = await import(
    /* @vite-ignore */ String("/src/components/PhotoEditor.tsx")
  );
  const c = document.createElement("canvas");
  c.width = 600;
  c.height = 400;
  const src = document.createElement("canvas");
  src.width = 640;
  src.height = 480;
  const img = new Image();
  img.src = src.toDataURL();
  await img.decode();
  const m = paintPhoto(c.getContext("2d")!, img, {
    rotation: 90,
    crop: { x: 0.1, y: 0.2, width: 0.8, height: 0.6 },
    annotations: [],
  } as any);
  const point = new DOMPoint(200, 170);
  const result = point.matrixTransform(m).matrixTransform(m.inverse());
  return Math.abs(result.x - point.x) + Math.abs(result.y - point.y);
});
assert.ok(inverseError < 1e-6);
await page.getByRole("button", { name: "02 상담", exact: false }).click();
await page.getByLabel("상담 메모").fill("자동 브라우저 검증 · 실제 환자 아님");
await page.getByRole("button", { name: "보류·변경 저장", exact: true }).click();
await page.getByText("개발 서버에 저장했습니다.", { exact: true }).waitFor();
await page.screenshot({
  path: "artifacts/02-consultation-landscape.png",
  fullPage: true,
});
await page.setViewportSize({ width: 800, height: 1200 });
await page.screenshot({
  path: "artifacts/03-consultation-portrait.png",
  fullPage: true,
});
await page.getByRole("button", { name: "03 견적서", exact: false }).click();
const pdf = page.waitForEvent("download");
await page.getByRole("button", { name: "병원용 PDF" }).click();
await (await pdf).saveAs("artifacts/sample-consultation.pdf");
const jpg = page.waitForEvent("download");
await page.getByRole("button", { name: "환자용 JPG" }).click();
await (await jpg).saveAs("artifacts/sample-quote.jpg");
await page.getByRole("button", { name: "단가표 관리", exact: true }).click();
await page.getByRole("heading", { name: "단가표 관리", exact: true }).waitFor();
await page.screenshot({
  path: "artifacts/04-catalog-admin.png",
  fullPage: true,
});
assert.deepEqual(errors, []);
assert.ok(
  (await readFile("artifacts/sample-consultation.pdf"))
    .subarray(0, 4)
    .toString() === "%PDF",
);
await writeFile(
  "artifacts/browser-verification.json",
  JSON.stringify(
    {
      passed: true,
      checks: [
        "login",
        "patient registration",
        "new consultation",
        "save",
        "landscape",
        "portrait",
        "Korean PDF",
        "JPG",
        "catalog admin",
      ],
      javascriptErrors: errors,
    },
    null,
    2,
  ),
);
await browser.close();
console.log("Browser verification passed");
