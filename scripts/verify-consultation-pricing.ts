import { chromium, expect } from "@playwright/test";
import assert from "node:assert/strict";
import { writeFile } from "node:fs/promises";
import { emptyState, emptyQuote } from "../src/core/model";
import { threeCatalogs, catalogAdmin } from "../tests/fixtures/catalogs";
import { applyCommand } from "../src/core/domain";
import { diffStateChanges } from "../src/core/stateChanges";
const browser = await chromium.launch({ args: ["--no-sandbox"] });
const results = [];
try {
  for (const width of [1440, 768, 390]) {
    let state = emptyState();
    state.users = [catalogAdmin];
    state.catalogs = threeCatalogs();
    const catalog = state.catalogs[2],
      product = catalog.products[0];
    product.name = "진료 후 결정 상품";
    product.offering = { kind: "membership", items: [], terms: "" };
    Object.assign(product.options[0], { price: null, priceKind: "quote" });
    const base = { rev: 1, createdAt: "2026-10-01", updatedAt: "2026-10-01" };
    state.patients = [
      {
        ...base,
        id: "patient",
        number: "001",
        name: "가격검증환자",
        sex: "F",
        dob: "1990-01-01",
        phone: "01000000000",
        address: "시험",
        ownerId: "admin",
      },
    ];
    state.consultations = [
      {
        ...base,
        id: "consult",
        patientId: "patient",
        patient: state.patients[0],
        ownerId: "admin",
        category: "미용",
        status: "H",
        cancelled: false,
        catalogVersion: catalog.version,
        catalogVersions: { 이벤트: catalog.version },
        quote: emptyQuote(),
        memo: "",
        photos: [],
        appointment: "",
        attendance: "미정",
        documents: [],
      },
    ];
    state.consents = ["A", "B"].map((name, i) => ({
      ...base,
      id: "consent-" + i,
      name: name + " 맞춤 동의서",
      productIds: [product.id],
      body: name + " 검증용 설명",
      checks: ["설명을 확인했습니다", "주의사항을 확인했습니다"],
      status: "published",
      version: 1,
    }));
    const errors: string[] = [],
      commands: string[] = [];
    const page = await browser.newPage({ viewport: { width, height: 1000 } });
    page.on("pageerror", (e) => errors.push(e.message));
    let acceptDialog = true;
    page.on("dialog", (d) => (acceptDialog ? d.accept() : d.dismiss()));
    await page.route("**/api/**", async (route) => {
      const path = new URL(route.request().url()).pathname;
      let status = 200,
        json: any = {
          ok: true,
          configured: true,
          mode: "local-development",
          version: "0.13.9",
        };
      if (path === "/api/state")
        json = { state, user: catalogAdmin, pending: 0 };
      else if (path === "/api/opinions") json = { opinions: [] };
      else if (path === "/api/patients/search") {
        status = 503;
        json = { error: "fixture" };
      } else if (path === "/api/quote-reasons") json = { reasons: [] };
      else if (path === "/api/catalog-history") json = { revisions: [] };
      else if (path.startsWith("/api/catalogs/"))
        json = {
          catalog: state.catalogs.find((c) => c.id === path.split("/").at(-1)),
        };
      else if (path === "/api/commands") {
        try {
          const cmd = route.request().postDataJSON();
          commands.push(cmd.type);
          const next = await applyCommand(state, catalogAdmin, cmd);
          json = { ok: true, changes: diffStateChanges(state, next) };
          state = next;
        } catch (e: any) {
          status = e.status || 400;
          json = { error: e.message };
        }
      }
      await route.fulfill({ status, json });
    });
    await page.goto("http://127.0.0.1:5198");
    const nav = async (name: string) => {
      await expect(page.locator(".app-shell")).toBeVisible();
      const button = page.getByRole("button", { name, exact: true });
      if (!(await button.isVisible()))
        await page
          .getByRole("button", { name: "메뉴 펼치기", exact: true })
          .click();
      await button.click();
    };
    await nav("상담이력");
    await page
      .locator("button.list-row")
      .filter({ hasText: "가격검증환자" })
      .first()
      .click();
    const picker = page.getByRole("region", {
      name: "시술 선택 목록",
      exact: true,
    });
    await expect(picker.locator("button.option-row").first()).toContainText(
      "상담 시 가격 입력",
    );
    await picker.locator("button.option-row").first().click();
    const cart = page.getByRole("dialog", {
      name: "상담 장바구니",
      exact: true,
    });
    await expect(cart).toBeVisible();
    await expect(
      cart.getByText("상담 가격 입력 필요", { exact: true }),
    ).toBeVisible();
    const price = cart.getByLabel("진료 후 결정 상품 기본 임의 단가", {
      exact: true,
    });
    await expect(price).toBeEnabled();
    await expect(price).toHaveValue("");
    await expect(cart.getByRole("checkbox")).toBeChecked();
    await expect(cart.getByRole("checkbox")).toBeDisabled();
    await price.fill("70000");
    await expect(cart.getByRole("alert")).toContainText("사유를 입력하세요");
    await cart
      .getByLabel("할인·변경 사유", { exact: true })
      .fill("진료 범위에 따른 결정");
    await expect(cart.getByRole("alert")).toHaveCount(0);
    await cart.screenshot({ path: `artifacts/quote-mode-${width}-0139.png` });
    await cart
      .getByRole("button", { name: "닫기", exact: true })
      .first()
      .click();
    await page.getByRole("button", { name: "환자 상세로 돌아가기" }).click();
    await page
      .getByRole("dialog", { name: "상담을 마치고 이동할까요?" })
      .getByRole("button", { name: "보류·변경 저장 후 이동", exact: true })
      .click();
    await expect.poll(() => state.consultations[0].quote.total).toBe(77000);
    assert.equal(
      state.consultations[0].quote.lines[0].requiresCustomPrice,
      true,
    );
    await nav("상담이력");
    await page
      .locator("button.list-row")
      .filter({ hasText: "가격검증환자" })
      .first()
      .click();
    await page.getByRole("button", { name: /03.*견적서/ }).click();
    const consent = page.locator(".treatment-consent-signing");
    await expect(
      consent.getByRole("region", { name: "장바구니 맞춤 동의서 추천" }),
    ).toContainText("연결 상품");
    await consent
      .getByRole("button", { name: "추천 모두 선택 (2)", exact: true })
      .click();
    await expect(consent.getByLabel("전체 시술동의서 양식")).toHaveValue(
      "consent-0",
    );
    await expect(
      consent.getByRole("checkbox", { name: /모두 동의/ }),
    ).not.toBeChecked();
    await expect(
      consent.getByRole("button", { name: "서명 저장", exact: true }),
    ).toBeDisabled();
    for (const id of ["consent-0", "consent-1"]) {
      await expect(consent.getByLabel("전체 시술동의서 양식")).toHaveValue(id);
      await expect(
        consent.getByRole("checkbox", { name: /모두 동의/ }),
      ).not.toBeChecked();
      await consent.getByRole("checkbox", { name: /모두 동의/ }).check();
      await expect(
        consent.getByRole("checkbox", {
          name: "설명을 확인했습니다",
          exact: true,
        }),
      ).toBeChecked();
      await consent
        .getByRole("checkbox", { name: "설명을 확인했습니다", exact: true })
        .uncheck();
      assert.equal(
        await consent
          .getByRole("checkbox", { name: /모두 동의/ })
          .evaluate((e: HTMLInputElement) => e.indeterminate),
        true,
      );
      await expect(
        consent.getByRole("button", { name: "서명 저장", exact: true }),
      ).toBeDisabled();
      await consent.getByRole("checkbox", { name: /모두 동의/ }).check();
      await consent.getByRole("checkbox", { name: /모두 동의/ }).uncheck();
      await expect(
        consent.getByRole("checkbox", {
          name: "주의사항을 확인했습니다",
          exact: true,
        }),
      ).not.toBeChecked();
      await consent.getByRole("checkbox", { name: /모두 동의/ }).check();
      const canvas = consent.locator("canvas");
      await canvas.scrollIntoViewIfNeeded();
      const box = (await canvas.boundingBox())!;
      await page.mouse.move(box.x + 20, box.y + 20);
      await page.mouse.down();
      await page.mouse.move(box.x + 90, box.y + 55, { steps: 6 });
      await page.mouse.up();
      await consent
        .getByRole("button", { name: "서명 저장", exact: true })
        .click();
      await expect
        .poll(() => state.signatures.some((s) => s.templateId === id))
        .toBe(true);
    }
    await expect(consent.getByLabel("전체 시술동의서 양식")).toHaveValue("");
    await expect(consent.locator("canvas")).toHaveCount(0);
    await consent.screenshot({
      path: `artifacts/consent-recommendation-${width}-0139.png`,
    });
    await page.getByRole("button", { name: "환자 상세로 돌아가기" }).click();
    await page
      .getByRole("dialog", { name: "상담을 마치고 이동할까요?" })
      .getByRole("button", { name: "보류·변경 저장 후 이동", exact: true })
      .click();
    await nav("단가표 관리");
    await page
      .getByRole("button", { name: "단가표 수정", exact: true })
      .click();
    await page
      .getByRole("button", { name: "현재 목록 선택", exact: true })
      .click();
    await page.getByRole("button", { name: /일괄 수정 \(/ }).click();
    const bulk = page.getByRole("region", {
      name: "선택 상품 일괄 수정",
      exact: true,
    });
    await bulk.getByLabel("일괄 가격 방식").selectOption("quote");
    await bulk.getByLabel("일괄 메뉴 판매").selectOption("active");
    await bulk
      .getByRole("button", { name: "선택 상품 일괄 적용", exact: true })
      .click();
    await expect(bulk.getByRole("status")).toContainText("0개 미적용");
    await page
      .getByRole("dialog", { name: "선택 상품 일괄 수정", exact: true })
      .getByRole("button", { name: "닫기", exact: true })
      .click();
    // Open the same product's detail editor and exercise optional membership rows.
    await page
      .locator(".catalog-product-title")
      .filter({ hasText: "진료 후 결정 상품" })
      .click();
    const editor = page.getByRole("dialog", { name: "상품·옵션 편집" });
    await editor
      .getByText("패키지·멤버십 구조화 안내", { exact: true })
      .click();
    await editor
      .getByRole("button", { name: "구성 추가", exact: true })
      .click();
    await editor.getByLabel("기본 이용금액", { exact: true }).fill("1000000");
    await editor.getByLabel("구성 1 수량").fill("3");
    await expect(editor.getByRole("alert")).toContainText(
      "구성 1: 시술·혜택 이름",
    );
    await editor.getByLabel("구성 1 수량").fill("1");
    await expect(editor.getByRole("alert")).toHaveCount(0);
    const option = editor.locator(".option-edit").first();
    await option
      .getByText("옵션별 패키지·멤버십 구성", { exact: true })
      .click();
    await option.locator(".offering-editor select").selectOption("membership");
    await option.getByLabel("기본 이용금액", { exact: true }).fill("1100000");
    await option.getByLabel("추가 혜택 금액", { exact: true }).fill("100000");
    await option
      .getByLabel("이용 조건·주의사항", { exact: true })
      .fill("GOLD 등급 전용 혜택");
    await option.getByLabel("옵션", { exact: true }).fill("GOLD");
    await editor
      .getByRole("button", { name: "옵션 추가", exact: true })
      .click();
    await expect(editor.locator(".option-edit")).toHaveCount(2);
    acceptDialog = false;
    await editor
      .getByRole("button", { name: "새 옵션 옵션 삭제", exact: true })
      .click();
    await expect(editor.locator(".option-edit")).toHaveCount(2);
    acceptDialog = true;
    await editor
      .getByRole("button", { name: "새 옵션 옵션 삭제", exact: true })
      .click();
    await expect(editor.locator(".option-edit")).toHaveCount(1);
    await editor
      .getByRole("button", { name: "GOLD 옵션 삭제", exact: true })
      .click();
    await expect(editor.locator(".option-edit")).toHaveCount(0);
    await expect(editor.getByRole("status")).toContainText(
      "옵션이 최소 1개 필요",
    );
    await editor.getByRole("button", { name: "되돌리기", exact: true }).click();
    await expect(editor.locator(".option-edit")).toHaveCount(1);
    await expect(
      editor.getByRole("checkbox", { name: /메뉴 판매/ }),
    ).toBeChecked();
    await editor.screenshot({
      path: `artifacts/membership-options-${width}-0139.png`,
    });
    assert(await editor.evaluate((el) => el.scrollWidth <= el.clientWidth + 1));
    await editor
      .getByRole("button", { name: "저장하고 적용", exact: true })
      .first()
      .click();
    await expect
      .poll(() => commands.filter((c) => c === "catalog.apply").length)
      .toBe(1);
    await expect
      .poll(() =>
        state.catalogs.some((c) =>
          c.products.some(
            (p) =>
              p.offering?.creditAmount === 1000000 &&
              p.offering.items.length === 0,
          ),
        ),
      )
      .toBe(true);
    assert(
      state.catalogs.some((c) =>
        c.products.some(
          (p) =>
            p.options[0]?.offering?.creditAmount === 1100000 &&
            p.options[0].label === "GOLD",
        ),
      ),
    );
    assert.deepEqual(errors, []);
    assert(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth + 1,
      ),
    );
    results.push({
      width,
      mandatoryPriceAndReason: true,
      savedTotal: 77000,
      bulkPriceMode: true,
      membershipBlankRowSaved: true,
      optionBenefitsSaved: true,
      consentRecommendationsAndSignatureQueue: true,
      optionDeleteCancelAndUndo: true,
      errors,
    });
    await page.close({ runBeforeUnload: false });
  }
  await writeFile(
    "artifacts/consultation-pricing-browser-0139.json",
    JSON.stringify(results, null, 2),
  );
  console.log(JSON.stringify(results));
} finally {
  await browser.close();
}
