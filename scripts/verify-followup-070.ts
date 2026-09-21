import { chromium, expect } from "@playwright/test";
import { readFile, writeFile } from "node:fs/promises";
import assert from "node:assert/strict";
const creds = JSON.parse(await readFile("private/local-setup.json", "utf8"));
assert.equal(
  ((await (await fetch("http://127.0.0.1:8787/api/health")).json()) as any)
    .mode,
  "local-development",
);
const browser = await chromium.launch({ args: ["--no-sandbox"] });
const page = await browser.newPage({
  viewport: { width: 1500, height: 1100 },
  hasTouch: true,
});
page.setDefaultTimeout(15000);
await page.addInitScript(() => {
  (window as any).__name = (f: unknown) => f;
});
const errors: string[] = [];
page.on("pageerror", (e) => errors.push(e.message));
page.on("dialog", (d) => d.accept());
const uid = Date.now().toString().slice(-8),
  name = "후속시험" + uid;
const button = (name: string) =>
  page.getByRole("button", { name, exact: true });
const state = () =>
  page.evaluate(async () => {
    const { api } = await import(/* @vite-ignore */ String("/src/lib/api.ts"));
    return (await api("/state")).state;
  });
const get = async (id: string) =>
  (await state()).consultations.find((c: any) => c.id === id);
const login = async () => {
  const picker = page.getByLabel("등록된 아이디 선택", { exact: true });
  await picker
    .or(page.getByRole("heading", { name: "환자목록", exact: true }))
    .first()
    .waitFor();
  if (await picker.count()) {
    await picker.selectOption(creds.username);
    await page.getByLabel("비밀번호", { exact: true }).fill(creds.password);
    await button("로그인").click();
  }
  await page.getByRole("heading", { name: "환자목록", exact: true }).waitFor();
};
const openPatient = async () => {
  await page.getByLabel("환자 검색").fill(name);
  await page
    .locator("tbody tr")
    .filter({ has: page.getByText(name, { exact: true }) })
    .click();
};
const reloadPatient = async () => {
  await page.reload();
  await login();
  await openPatient();
};
const clickCommand = async (label: string, type: string, expected = 200) => {
  const response = page.waitForResponse(
    (r) =>
      r.url().endsWith("/api/commands") &&
      r.request().postDataJSON()?.type === type,
  );
  await button(label).click();
  const r = await response;
  assert.equal(r.status(), expected);
  await expect(page.locator(".busy-bar")).toHaveCount(0);
  return r.request().postDataJSON().entityId as string;
};
const begin = async (kind: "interim" | "renewal", source: string) => {
  await button(kind === "interim" ? "중간상담" : "연장상담").click();
  await page.getByLabel("이어갈 이전 상담").selectOption(source);
};
const history = () =>
  page
    .locator(".card")
    .filter({
      has: page.getByRole("heading", { name: "상담이력", exact: true }),
    })
    .locator("button.list-row");
try {
  await page.goto("http://localhost:5173");
  await login();
  await page.evaluate(
    async ({ uid, name }) => {
      const { api, command, makeCommand, stagePhoto } = await import(
        /* @vite-ignore */ String("/src/lib/api.ts")
      );
      const user = (await api("/state")).user,
        now = new Date().toISOString();
      const products = ["기존미용", "별도패키지", "보험패키지"].map(
        (name, i) => ({
          id: `fp-${uid}-${i}`,
          rev: 1,
          createdAt: now,
          updatedAt: now,
          category: i === 2 ? "보험" : "미용",
          careCategory: i === 2 ? "보험" : "미용",
          name,
          description: "합성 검증",
          composition: "기존 구성",
          active: true,
          sources: [],
          options: [
            {
              id: `fo-${uid}-${i}`,
              label: "기본",
              price: i === 2 ? 5000 : 10000,
              tax: "inclusive",
              unit: "패키지",
              review: false,
              issues: [],
              sources: [],
              priceKind: "regular",
            },
          ],
        }),
      );
      const catalog = {
        id: "fc-" + uid,
        rev: 0,
        schemaVersion: 1,
        version: "old",
        status: "draft",
        createdAt: now,
        updatedAt: now,
        products,
        references: [],
      };
      await command(makeCommand("catalog.save", { catalog }, catalog.id));
      await command(makeCommand("catalog.publish", {}, catalog.id, 1));
      await command(
        makeCommand(
          "patient.create",
          {
            name,
            sex: "F",
            dob: "1990-01-01",
            phone: "010" + uid,
            address: "검증동",
          },
          "fp-" + uid,
        ),
      );
      for (let i = 0; i < 3; i++) {
        const id = `fs-${uid}-${i}`;
        await command(
          makeCommand(
            "consultation.create",
            { patientId: "fp-" + uid, category: i === 2 ? "보험" : "미용" },
            id,
          ),
        );
        const photos = [];
        if (i === 0) {
          const canvas = document.createElement("canvas");
          canvas.width = 600;
          canvas.height = 800;
          const x = canvas.getContext("2d")!;
          x.fillStyle = "#9db5ac";
          x.fillRect(0, 0, 600, 800);
          x.fillStyle = "#184b3d";
          x.fillRect(0, 0, 160, 800);
          const blob = await new Promise<Blob>((r) =>
            canvas.toBlob((b) => r(b!), "image/png"),
          );
          const photo = await stagePhoto(
            new File([blob], "이전사진.png", { type: "image/png" }),
            id,
            user.id,
          );
          photo.selected = true;
          photo.annotations = [
            {
              id: "mark",
              tool: "rect",
              points: [
                { x: 0.3, y: 0.3 },
                { x: 0.5, y: 0.5 },
              ],
              color: "#ff0000",
              width: 3,
              authorId: user.id,
            },
          ];
          photos.push(photo);
        }
        await command(
          makeCommand(
            "consultation.save",
            {
              lines: [
                {
                  id: id + "-line",
                  productId: products[i].id,
                  optionId: products[i].options[0].id,
                  quantity: i === 0 ? 2 : 1,
                  discount: { kind: "percent", value: i === 0 ? 10 : 0 },
                },
              ],
              discount: { kind: "amount", value: i === 0 ? 1000 : 0 },
              vat: "included",
              reason: "과거 할인",
              photos,
              photoColumns: 4,
            },
            id,
            1,
          ),
        );
        await command(
          makeCommand("consultation.finalize", { status: "P" }, id, 2),
        );
      }
      const newer = {
        ...catalog,
        id: "fn-" + uid,
        products: products.map((p, i) =>
          i === 0
            ? {
                ...p,
                name: "최신미용",
                composition: "새 구성",
                options: p.options.map((o) => ({
                  ...o,
                  label: "최신 옵션",
                  price: 20000,
                  unit: "회",
                })),
              }
            : p,
        ),
      };
      await command(makeCommand("catalog.save", { catalog: newer }, newer.id));
      await command(makeCommand("catalog.publish", {}, newer.id, 1));
    },
    { uid, name },
  );
  const sourceId = `fs-${uid}-0`,
    otherId = `fs-${uid}-1`,
    insuranceId = `fs-${uid}-2`;
  const sourceBefore = await get(sourceId);
  await reloadPatient();
  await begin("interim", sourceId);
  await expect(page.getByLabel("이전 상담 미리보기")).toContainText(
    "사진 1장 · 4열 배치",
  );
  const interimId = await clickCommand("상담 시작", "consultation.create");
  await expect(page.locator(".thumbnail-card")).toHaveCount(1);
  await expect(button("이전사진.png 선택")).toHaveAttribute(
    "aria-pressed",
    "false",
  );
  assert.equal((await get(interimId)).photoColumns, 4);
  await button("이전사진.png 선택").click();
  await button("이전사진.png 편집").click();
  await button("↶ 좌 90°").click();
  await page
    .locator(".fullscreen-editor-header")
    .getByRole("button", { name: "사진 편집 저장", exact: true })
    .click();
  await button("편집기 닫기").click();
  await page.getByRole("button", { name: /02.*상담/ }).click();
  await expect(
    page.getByRole("heading", { name: "시술 선택", exact: true }),
  ).toHaveCount(0);
  await page.getByLabel("상담 메모").fill("중간 경과 검증");
  await clickCommand("보류·변경 저장", "consultation.save");
  await page.getByRole("button", { name: /03.*상담결과/ }).click();
  await clickCommand("중간상담 완료", "consultation.finalize");
  assert.deepEqual(await get(sourceId), sourceBefore);
  assert.equal((await get(interimId)).photos[0].rotation, -90);
  await button("환자 상세").click();
  await expect(
    page.getByText("시술 성공 3건 · 중간 완료 1건", { exact: true }),
  ).toBeVisible();
  await expect(
    history().filter({ hasText: "중간상담" }).locator(".badge"),
  ).toHaveText("완료");
  await begin("renewal", sourceId);
  await expect(
    page.getByLabel("이어갈 이전 상담").locator(`option[value="${interimId}"]`),
  ).toHaveCount(0);
  await expect(
    page
      .getByLabel("이어갈 이전 상담")
      .locator(`option[value="${insuranceId}"]`),
  ).toHaveCount(0);
  await expect(page.getByLabel("이전 상담 미리보기")).toContainText(
    "이전 견적 17,000원 → 현재 단가 견적 40,000원",
  );
  await page.getByLabel("이어갈 이전 상담").selectOption(otherId);
  await expect(page.getByLabel("이전 상담 미리보기")).toContainText("사진 0장");
  await page.getByLabel("이어갈 이전 상담").selectOption(sourceId);
  await page.screenshot({
    path: "artifacts/followup-070-preview.png",
    fullPage: true,
  });
  const renewalId = await clickCommand("상담 시작", "consultation.create");
  const renewal = await get(renewalId);
  assert.equal(renewal.quote.total, 40000);
  assert.equal(renewal.quote.lines[0].unit, "회");
  assert.equal(renewal.quote.discountTotal, 0);
  assert.deepEqual(await get(sourceId), sourceBefore);
  await page.getByRole("button", { name: /02.*상담/ }).click();
  await expect(page.locator(".cart-line")).toContainText("최신미용");
  await page.getByRole("button", { name: /03.*견적서/ }).click();
  // Another device changes the base package while this browser keeps the old snapshot.
  await page.evaluate(async (sourceId) => {
    const { api, command, makeCommand } = await import(
      /* @vite-ignore */ String("/src/lib/api.ts")
    );
    const s = (await api("/state")).state,
      source = s.consultations.find((c: any) => c.id === sourceId);
    await command(
      makeCommand(
        "consultation.package",
        { complete: true },
        sourceId,
        source.rev,
      ),
    );
  }, sourceId);
  await clickCommand("연장 확정 · 진행 중 유지", "consultation.finalize", 409);
  assert.equal((await get(renewalId)).status, "H");
  await expect(page.getByRole("alert")).toContainText(
    "기준 상담이 다른 기기에서 변경",
  );
  await reloadPatient();
  await history().filter({ hasText: "연장상담" }).first().click();
  await expect(page.getByLabel("기준 상담 정보")).toContainText(
    "상담 시작 후 기준 상담이 변경됐습니다.",
  );
  await page.getByRole("button", { name: /03.*견적서/ }).click();
  await clickCommand("연장 확정 · 진행 중 유지", "consultation.finalize");
  assert.equal((await get(sourceId)).packageProgress.complete, true);
  assert.equal((await get(renewalId)).packageProgress.complete, false);
  await button("환자 상세").click();
  await begin("renewal", renewalId);
  const declinedId = await clickCommand("상담 시작", "consultation.create");
  await page.getByRole("button", { name: /03.*견적서/ }).click();
  await clickCommand("연장 안 함 · 완료", "consultation.finalize");
  assert.equal((await get(declinedId)).status, "F");
  assert.equal((await get(renewalId)).packageProgress.complete, true);
  assert.equal((await get(otherId)).packageProgress.complete, false);
  assert.equal((await get(insuranceId)).packageProgress.complete, false);
  await button("환자 상세").click();
  const otherRow = page
    .locator(".package-summary .list-row")
    .filter({ hasText: "별도패키지" });
  await otherRow
    .getByRole("button", { name: "완료로 전환", exact: true })
    .click();
  await expect(otherRow.locator(".badge")).toHaveText("완료");
  await button("환자목록").last().click();
  await page.getByLabel("환자 검색").fill(name);
  const patientRow = page
    .locator("tbody tr")
    .filter({ has: page.getByText(name, { exact: true }) });
  await expect(
    patientRow.getByText("미용 진행 중", { exact: true }),
  ).toHaveCount(0);
  await expect(
    patientRow.getByText("보험 진행 중", { exact: true }),
  ).toBeVisible();
  await patientRow.click();
  await otherRow
    .getByRole("button", { name: "진행 중으로 전환", exact: true })
    .click();
  await expect(otherRow.locator(".badge")).toHaveText("진행 중");
  await reloadPatient();
  await expect(otherRow.locator(".badge")).toHaveText("진행 중");
  await page.screenshot({
    path: "artifacts/followup-070-packages.png",
    fullPage: true,
  });
  // Starting a renewal gives an actionable preview error when the current published option is unavailable.
  await page.evaluate(async (uid) => {
    const { api, command, makeCommand } = await import(
      /* @vite-ignore */ String("/src/lib/api.ts")
    );
    const s = (await api("/state")).state,
      cat = s.catalogs.find((c: any) => c.id === "fn-" + uid),
      id = "fx-" + uid;
    await command(
      makeCommand(
        "catalog.save",
        {
          catalog: {
            ...cat,
            id,
            status: "draft",
            products: cat.products.map((p: any, i: number) =>
              i === 0 ? { ...p, active: false } : p,
            ),
          },
        },
        id,
      ),
    );
    await command(makeCommand("catalog.publish", {}, id, 1));
  }, uid);
  await reloadPatient();
  await begin("renewal", sourceId);
  await expect(button("상담 시작")).toBeDisabled();
  await expect(page.getByRole("dialog").getByRole("alert")).toContainText(
    "현재 판매 단가",
  );
  await page.setViewportSize({ width: 800, height: 1100 });
  assert.ok(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  );
  await page.screenshot({
    path: "artifacts/followup-070-portrait.png",
    fullPage: true,
  });
  assert.deepEqual(errors, []);
  await writeFile(
    "artifacts/followup-070-verification.json",
    JSON.stringify(
      {
        passed: true,
        checks: [
          "source selection and preview",
          "shared published catalog pricing and units",
          "interim independent photos and source unchanged",
          "interim completion excluded from sales success",
          "renewal hold preserves base",
          "concurrent source revision conflict",
          "successful renewal closes source",
          "declined renewal closes only its source",
          "manual progress persists",
          "beauty and insurance progress independent",
          "unavailable current option blocks start",
          "portrait layout",
        ],
      },
      null,
      2,
    ),
  );
  console.log("Follow-up review browser checks passed");
} catch (e) {
  await page.screenshot({
    path: "artifacts/followup-070-failure.png",
    fullPage: true,
  });
  throw e;
} finally {
  await browser.close();
}
