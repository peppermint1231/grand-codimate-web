import { chromium, expect } from "@playwright/test";
import assert from "node:assert/strict";
import { writeFile, mkdir } from "node:fs/promises";
import { emptyState } from "../src/core/model";
import { applyCommand } from "../src/core/domain";
import { diffStateChanges } from "../src/core/stateChanges";
import { workingCatalog } from "../src/core/websiteCatalog";
import { threeCatalogs, catalogAdmin } from "../tests/fixtures/catalogs";
import type { WebsiteEvent } from "../src/core/eventCatalog";
const user = catalogAdmin;
const browser = await chromium.launch({
  args: ["--no-sandbox"],
  env: {
    ...process.env,
    LD_LIBRARY_PATH:
      process.env.LD_LIBRARY_PATH ||
      "/tmp/codimate-browser-deps/root/usr/lib/aarch64-linux-gnu",
  },
});
const results = [];
await mkdir("artifacts", { recursive: true });
try {
  for (const viewport of [
    { width: 1440, height: 1000 },
    { width: 768, height: 1024 },
    { width: 390, height: 844 },
  ]) {
    let state = emptyState();
    state.users = [user];
    state.catalogs = threeCatalogs();
    const base = state.catalogs[2].products[0];
    state.catalogs[2].products = ["검토 가능", "부가세 확인", "검토 완료"].map(
      (name, i) => ({
        ...structuredClone(base),
        id: "manual-" + i,
        name,
        active: false,
        options: [
          {
            ...base.options[0],
            id: "opt-" + i,
            review: i < 2,
            tax: i === 1 ? "unknown" : "inclusive",
          },
        ],
      }),
    );
    const beautyBefore = structuredClone(state.catalogs[0]);
    const offer = {
      id: "1",
      name: "일반 리프팅",
      description: "시험 안내",
      price: 10000,
      regularPrice: 15000,
      discountRate: 33.3,
      priceText: "10,000원",
      tax: "inclusive" as const,
      issues: [],
    };
    const pages: WebsiteEvent[] = [
      {
        id: "10",
        categoryId: "1",
        categoryName: "리프팅",
        name: "일반 시술",
        description: "",
        period: "",
        url: "https://www.grand4.co.kr/clinicPrice/clinicView.php?i=10&cate=1",
        posterUrls: [],
        offers: [
          offer,
          { ...offer, id: "2", name: "일반 보톡스", tax: "unknown" },
        ],
      },
      {
        id: "11",
        categoryId: "2",
        categoryName: "특별 이벤트",
        name: "EVENT 혜택",
        description: "",
        period: "",
        url: "https://www.grand4.co.kr/clinicPrice/clinicView.php?i=11&cate=2",
        posterUrls: [],
        offers: [{ ...offer, id: "3", name: "이벤트 시술" }],
      },
    ];
    const page = await browser.newPage({ viewport });
    const errors: string[] = [];
    let commands = 0;
    page.on("pageerror", (e) => errors.push(e.message));
    await page.route("**/api/**", async (route) => {
      const req = route.request(),
        u = new URL(req.url());
      let result: any = { ok: true },
        status = 200;
      if (u.pathname === "/api/health")
        result = {
          ok: true,
          configured: true,
          needsSetup: false,
          mode: "local-development",
          version: "0.13.2",
        };
      else if (u.pathname === "/api/state")
        result = { state, user, driveConnected: true, pending: 0 };
      else if (u.pathname === "/api/patients/search")
        result = { rows: [], total: 0, page: 0, pages: 0 };
      else if (u.pathname === "/api/opinions") result = { opinions: [] };
      else if (u.pathname === "/api/catalog-history")
        result = { revisions: [] };
      else if (u.pathname.startsWith("/api/catalogs/"))
        result = {
          catalog: state.catalogs.find(
            (c) => c.id === decodeURIComponent(u.pathname.split("/").at(-1)!),
          ),
        };
      else if (u.pathname === "/api/catalog/event-source") {
        const categories = [
          ...new Map(
            pages.map((p) => [
              p.categoryId,
              { id: p.categoryId, name: p.categoryName },
            ]),
          ).values(),
        ];
        result = u.searchParams.get("item")
          ? pages.find((p) => p.id === u.searchParams.get("item"))
          : {
              categories,
              items: pages
                .filter((p) => p.categoryId === u.searchParams.get("category"))
                .map(({ id, categoryId, categoryName, name }) => ({
                  id,
                  categoryId,
                  categoryName,
                  name,
                })),
              pages: [],
            };
      } else if (u.pathname === "/api/commands") {
        commands++;
        try {
          const next = await applyCommand(state, user, req.postDataJSON());
          result = { ok: true, changes: diffStateChanges(state, next) };
          state = next;
        } catch (e: any) {
          status = e.status || 400;
          result = { error: e.message };
        }
      }
      await route.fulfill({ status, json: result });
    });
    await page.goto("http://127.0.0.1:5198");
    await page
      .getByRole("button", { name: "단가표 관리", exact: true })
      .click();
    const refresh = page.getByRole("region", { name: "홈페이지 단가표 갱신" });
    await expect(
      page.getByRole("button", { name: "홈페이지 SSOT", exact: true }),
    ).toHaveClass(/active/);
    await page.getByRole("button", { name: "미용 SSOT", exact: true }).click();
    await expect(refresh).toHaveCount(0);
    await expect(page.getByLabel("홈페이지 게시 상태 색상 안내")).toHaveCount(
      0,
    );
    await page.getByRole("button", { name: "보험 SSOT", exact: true }).click();
    await expect(refresh).toHaveCount(0);
    await page
      .getByRole("button", { name: "홈페이지 SSOT", exact: true })
      .click();
    await refresh
      .getByRole("button", { name: "홈페이지 갱신", exact: true })
      .click();
    await expect(refresh.getByLabel("홈페이지 갱신 요약")).toContainText(
      "신규 3개",
    );
    assert.equal(commands, 0);
    await expect(refresh).toContainText("이전 상품 제거 3개");
    await expect(refresh.getByLabel("홈페이지 미표기 부가세 정책")).toHaveValue(
      "exclusive",
    );
    await expect(refresh).toContainText("활성화 가능 3개 · 확인 필요 0개");
    await refresh
      .getByLabel("홈페이지 미표기 부가세 정책")
      .selectOption("unknown");
    await expect(refresh).toContainText("활성화 가능 2개 · 확인 필요 1개");
    await expect(refresh).toContainText("부가세 확인 필요");
    await refresh
      .getByLabel("홈페이지 미표기 부가세 정책")
      .selectOption("exclusive");
    await expect(refresh).toContainText("활성화 가능 3개 · 확인 필요 0개");
    await refresh
      .getByRole("button", { name: "동기화·활성화 후 게시", exact: true })
      .click();
    await expect(refresh).toContainText("게시 완료: 상담에 반영했습니다.");
    assert.equal(commands, 1);
    const published = workingCatalog(state, "이벤트")!;
    assert.equal(published.products.length, 3);
    assert.equal(published.status, "published");
    assert(
      published.products.every(
        (p) => p.active && p.options.every((o) => !o.review),
      ),
    );
    assert(state.catalogs[2].products.every((p) => p.id.startsWith("manual-")));
    await refresh
      .getByRole("button", { name: "홈페이지 갱신", exact: true })
      .click();
    await expect(refresh.getByLabel("홈페이지 갱신 요약")).toContainText(
      "신규 0개",
    );
    await expect(refresh).toContainText("이전 상품 제거 0개");
    await refresh
      .getByLabel("홈페이지 미표기 부가세 정책")
      .selectOption("unknown");
    await expect(refresh).toContainText("활성화 가능 3개 · 확인 필요 0개");
    await refresh
      .getByRole("button", { name: "동기화·활성화 초안 저장", exact: true })
      .click();
    await expect(refresh).toContainText("초안 저장 완료");
    assert.equal(commands, 2);
    assert.equal(workingCatalog(state, "이벤트")!.products.length, 3);
    assert.equal(workingCatalog(state, "이벤트")!.status, "draft");
    await refresh.scrollIntoViewIfNeeded();
    await page.screenshot({
      path: `artifacts/homepage-sync-${viewport.width}.png`,
    });
    assert.deepEqual(state.catalogs[0], beautyBefore);
    assert(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    );
    assert.deepEqual(errors, []);
    results.push({
      viewport,
      homepageDefault: true,
      allOffersImported: true,
      beautyUnchanged: true,
      onlyHomepageRefresh: true,
      removedPreviousProducts: true,
      oneStepActivationPublish: true,
      explicitTaxChoice: true,
      repeatScanPreservesConfirmedTax: true,
      saved: true,
      noOverflow: true,
      errors,
    });
    await page.close();
  }
} finally {
  await browser.close();
}
await writeFile(
  "artifacts/homepage-browser-0132.json",
  JSON.stringify(results, null, 2),
);
console.log(JSON.stringify(results));
