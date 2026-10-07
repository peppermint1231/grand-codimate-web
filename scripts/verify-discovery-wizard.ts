import { chromium, expect } from "@playwright/test";
import assert from "node:assert/strict";
import { emptyState } from "../src/core/model";
import { threeCatalogs, catalogAdmin } from "../tests/fixtures/catalogs";
import { publicProducts } from "../src/core/discovery";
import { patientConcerns } from "../src/core/patientDiscovery";
import { applyCommand } from "../src/core/domain";
import { diffStateChanges } from "../src/core/stateChanges";
const browser = await chromium.launch({ args: ["--no-sandbox"] });
try {
  for (const width of [1440, 768, 390]) {
    let state = emptyState();
    state.users = [catalogAdmin];
    state.catalogs = threeCatalogs();
    state.catalogs.forEach((c) => {
      c.products[0].name = "기미토닝 " + c.book;
      c.products[0].description = "기미 상담";
    });
    const page = await browser.newPage({ viewport: { width, height: 1000 } });
    await page.addInitScript("window.__name=(fn)=>fn;");
    const errors: string[] = [];
    page.on("pageerror", (e) => errors.push(e.message));
    let submitted: any;
    await page.route("**/api/**", async (route) => {
      const path = new URL(route.request().url()).pathname;
      let json: any = {
          configured: true,
          ok: true,
          mode: "local-development",
          version: "0.18.7",
        },
        status = 200;
      if (path === "/api/state")
        json = { state, user: catalogAdmin, pending: 0 };
      else if (path === "/api/public/catalog")
        json = {
          products: publicProducts(state),
          patientConcerns,
          categories: [],
          token: "fixture",
          closedDates: [],
        };
      else if (path === "/api/public/inquiries") {
        submitted = route.request().postDataJSON();
        json = { receipt: "fixture" };
      } else if (path === "/api/opinions") json = { opinions: [] };
      else if (path === "/api/catalog-history") json = { revisions: [] };
      else if (path.startsWith("/api/catalogs/"))
        json = {
          catalog: state.catalogs.find(
            (c) => c.id === decodeURIComponent(path.split("/").at(-1)!),
          ),
        };
      else if (path === "/api/commands") {
        try {
          const after = await applyCommand(
            state,
            catalogAdmin,
            route.request().postDataJSON(),
          );
          json = { ok: true, changes: diffStateChanges(state, after) };
          state = after;
        } catch (e: any) {
          status = 400;
          json = { error: e.message };
        }
      }
      await route.fulfill({ json, status });
    });
    // Simulate the provider response without sending any patient address to an external service.
    await page.addInitScript(() => {
      (window as any).daum = {
        Postcode: class {
          constructor(public config: any) {}
          embed(target: HTMLElement) {
            const b = document.createElement("button");
            b.textContent = "시험 주소 선택";
            b.onclick = () =>
              this.config.oncomplete({
                sido: "강원특별자치도",
                sigungu: "춘천시",
                bname: "퇴계동",
              });
            target.appendChild(b);
          }
        },
      };
    });
    await page.goto("http://127.0.0.1:5198/discover");
    await page
      .locator(".pd-concern-card")
      .filter({ hasText: "점·잡티·기미" })
      .click();
    await page.getByRole("button", { name: /잘 모르겠어요/ }).click();
    await page.locator(".pd-option").first().click();
    await page.getByRole("button", { name: "다른 고민도 찾기" }).click();
    await expect(page.locator(".pd-cart-floating")).toBeVisible();
    await expect(page.locator(".pd-cart-floating")).toContainText(
      "관심 시술 1개",
    );
    const rect = await page.locator(".pd-cart-floating").boundingBox();
    assert(rect && rect.y + rect.height <= 1000);
    await page.getByRole("button", { name: /상담으로 이어가기/ }).click();
    await page.getByLabel("방문 여부").selectOption("first");
    await page.getByLabel("이름 필수", { exact: true }).fill("시험환자");
    await page.getByLabel("연락처 필수", { exact: true }).fill("01012345678");
    await expect(page.getByLabel("연락처 필수", { exact: true })).toHaveValue(
      "010-1234-5678",
    );
    await page.getByLabel("성별 필수", { exact: true }).selectOption("F");
    await page.getByLabel("생년월일 필수", { exact: true }).fill("19850312");
    await expect(page.getByLabel("생년월일 필수", { exact: true })).toHaveValue(
      "1985-03-12",
    );
    await expect(
      page.getByLabel("생년월일 필수", { exact: true }),
    ).toHaveAttribute("type", "text");
    await page.getByRole("button", { name: "주소 검색", exact: true }).click();
    await page.getByText("시험 주소 선택", { exact: true }).click();
    await expect(page.getByLabel("주소 (동까지)", { exact: true })).toHaveValue(
      "강원특별자치도 춘천시 퇴계동",
    );
    await page.getByLabel("방문 여부").selectOption("returning");
    await expect(page.getByLabel("생년월일 필수", { exact: true })).toHaveCount(
      0,
    );
    await expect(page.getByLabel("주소 (동까지)", { exact: true })).toHaveCount(
      0,
    );
    await page.locator(".pd-calendar-grid button:enabled").first().click();
    await page.locator(".pd-time-grid button").first().click();
    await page
      .getByLabel("개인정보 수집·이용에 동의합니다. (필수)", { exact: true })
      .check();
    await page
      .getByLabel(
        "고민·관심 시술 등 건강 관련 정보의 수집·이용에 동의합니다. (필수)",
        { exact: true },
      )
      .check();
    await page.screenshot({
      path: `artifacts/discovery-form-0187-${width}.png`,
      fullPage: true,
    });
    await page.getByRole("button", { name: /상담 요청 보내기/ }).click();
    await expect(
      page.getByText("접수번호 FIXTURE", { exact: true }),
    ).toBeVisible();
    assert.equal(submitted.person.dob, "");
    assert.equal(submitted.person.sex, "U");
    assert.equal(submitted.person.address, "");
    state.catalogs[0].products[0].productType = "block";
    await page.goto("http://127.0.0.1:5198");
    await page
      .getByRole("button", { name: "단가표 관리", exact: true })
      .click();
    await page.getByRole("button", { name: "미용 SSOT", exact: true }).click();
    await page
      .getByRole("button", { name: "단가표 수정", exact: true })
      .click();
    await page.getByRole("button", { name: "상품 추가", exact: true }).click();
    const wizard = page.getByRole("dialog", {
      name: "새 상품 만들기",
      exact: true,
    });
    await wizard.getByLabel("상품명", { exact: true }).fill("검증 패키지");
    await wizard.getByLabel(/상품 타입/).selectOption("package");
    await wizard
      .getByLabel("환자에게 보여줄 상품 설명", { exact: true })
      .fill("회차별 구성 테스트");
    await wizard
      .getByRole("button", { name: "다음 단계", exact: true })
      .click();
    await wizard.getByLabel("총 방문 회차", { exact: true }).fill("2");
    await wizard
      .locator(".package-library button")
      .filter({ hasText: "기미토닝 미용" })
      .first()
      .click();
    await wizard.getByLabel(/총 수량/).fill("2");
    await wizard.getByRole("button", { name: "균형 있게 자동 배치" }).click();
    await expect(
      wizard.locator('[data-package-session="1"] .package-chip'),
    ).toHaveCount(1);
    await expect(
      wizard.locator('[data-package-session="2"] .package-chip'),
    ).toHaveCount(1);
    await wizard.getByLabel("할인율 (%)", { exact: true }).fill("10");
    await expect(wizard.locator(".package-final-price")).toContainText(
      "18,000",
    );
    await wizard.locator('[data-package-session="1"] select').selectOption("2");
    await expect(
      wizard.locator('[data-package-session="2"] .package-chip'),
    ).toHaveCount(2);
    await wizard
      .getByRole("button", { name: "다음 단계", exact: true })
      .click();
    await expect(wizard.getByRole("alert")).toContainText("1회차");
    await wizard.getByRole("button", { name: "균형 있게 자동 배치" }).click();
    // Mouse/pen/touch drag handle and quick block creation stay in the current package.
    await wizard
      .locator('[data-package-session="1"] .package-drag')
      .dragTo(wizard.locator('[data-package-session="2"] h5'));
    await expect(
      wizard.locator('[data-package-session="2"] .package-chip'),
    ).toHaveCount(2);
    await wizard.getByRole("button", { name: "균형 있게 자동 배치" }).click();
    await wizard
      .getByText("+ 필요한 블록 바로 만들기", { exact: true })
      .click();
    await wizard
      .getByLabel("블록 상품명", { exact: true })
      .fill("새 진정관리 블록");
    await wizard
      .getByLabel("블록 가격 (부가세 별도)", { exact: true })
      .fill("5000");
    await wizard.getByRole("button", { name: "블록 등록하고 담기" }).click();
    await expect(wizard.locator(".package-quantity")).toHaveCount(2);
    await wizard.getByRole("button", { name: "균형 있게 자동 배치" }).click();
    await page.screenshot({
      path: `artifacts/package-builder-0187-${width}.png`,
      fullPage: true,
    });
    await wizard
      .getByRole("button", { name: "다음 단계", exact: true })
      .click();
    await wizard.getByRole("button", { name: "상품 추가 완료" }).click();
    const editor = page.getByRole("dialog", {
      name: "상품·옵션 편집",
      exact: true,
    });
    await expect(editor.getByLabel("상품명", { exact: true })).toHaveValue(
      "검증 패키지",
    );
    const size = await editor
      .getByLabel("상품명", { exact: true })
      .boundingBox();
    assert(size!.width > 200);
    await editor
      .getByRole("button", { name: "저장하고 적용", exact: true })
      .click();
    await expect(editor).toHaveCount(0);
    const saved = state.catalogs
      .at(-1)!
      .products.find((p) => p.name === "검증 패키지")!;
    assert(saved);
    assert.equal(saved.options[0].price, 22500);
    assert.equal(saved.options[0].tax, "exclusive");
    assert.equal(saved.options[0].packagePlan!.placements.length, 3);
    assert.equal(saved.productType, "package");
    await page
      .getByLabel("상품 타입 필터", { exact: true })
      .selectOption("block");
    await expect(page.locator(".catalog-product-row")).toHaveCount(2);
    await expect(page.locator(".product-type-badge").first()).toHaveText(
      "[블록]",
    );
    await page
      .getByLabel("상품 타입 필터", { exact: true })
      .selectOption("package");
    await expect(page.locator(".catalog-product-row")).toHaveCount(1);
    await expect(page.locator(".product-type-badge")).toHaveText("[패키지]");
    assert.equal(
      await page.evaluate("document.documentElement.scrollWidth>innerWidth"),
      false,
    );
    assert.deepEqual(errors, []);
    console.log(`Discovery + package wizard ${width}px passed`);
    await page.close();
  }
} finally {
  await browser.close();
}
