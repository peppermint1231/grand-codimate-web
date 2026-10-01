import { chromium, expect } from "@playwright/test";
import assert from "node:assert/strict";
import { writeFile } from "node:fs/promises";
import { emptyState } from "../src/core/model";
import { catalogAdmin, threeCatalogs } from "../tests/fixtures/catalogs";
import { parseWebsiteEvent } from "../server/eventCatalog";
import { eventDetail } from "../tests/fixtures/websiteEvents";
const browser = await chromium.launch({ args: ["--no-sandbox"] });
const reports = [];
try {
  for (const width of [1440, 768, 390]) {
    const state = {
      ...emptyState(),
      catalogs: threeCatalogs(),
      users: [catalogAdmin],
    };
    let failing = true,
      writes = 0;
    const requests: string[] = [];
    const errors: string[] = [];
    const page = await browser.newPage({ viewport: { width, height: 1000 } });
    page.on("pageerror", (e) => errors.push(e.message));
    const item = (id: string) => ({
      id,
      categoryId: "20",
      categoryName: "시험 이벤트",
      name: "배너" + id,
    });
    const detail = (id: string) => ({
      ...parseWebsiteEvent(eventDetail("80,000원", ""), "101", "20"),
      id,
      name: "배너" + id,
      offers: [
        {
          ...parseWebsiteEvent(eventDetail("80,000원", ""), "101", "20")
            .offers[0],
          id: id + "0",
        },
      ],
    });
    await page.route("**/api/**", async (route) => {
      const u = new URL(route.request().url());
      let status = 200,
        json: any = {
          ok: true,
          configured: true,
          version: "0.13.7",
          mode: "local-development",
        };
      if (u.pathname === "/api/state")
        json = { state, user: catalogAdmin, pending: 0 };
      else if (u.pathname === "/api/opinions") json = { opinions: [] };
      else if (u.pathname === "/api/patients/search") {
        status = 503;
        json = { error: "fixture" };
      } else if (u.pathname.startsWith("/api/catalogs/"))
        json = {
          catalog: state.catalogs.find(
            (c) => c.id === u.pathname.split("/").at(-1),
          ),
        };
      else if (u.pathname === "/api/catalog/event-source") {
        requests.push(u.search);
        const id = u.searchParams.get("item");
        if (id === "102" && failing) {
          status = 503;
          json = {
            error:
              "홈페이지가 일시적인 오류를 반환했습니다 (HTTP 522). 다시 확인합니다.",
          };
        } else
          json = id
            ? detail(id)
            : {
                categories: [{ id: "20", name: "시험 이벤트" }],
                items: [item("101"), item("102")],
                pages: [],
              };
      } else if (u.pathname === "/api/commands") {
        writes++;
        status = 403;
        json = { error: "must not mutate" };
      }
      await route.fulfill({ status, json });
    });
    await page.goto("http://127.0.0.1:5198");
    await page
      .getByRole("button", { name: "단가표 관리", exact: true })
      .click();
    const section = page.getByRole("region", {
      name: "홈페이지 단가표 갱신",
      exact: true,
    });
    await section
      .getByRole("button", { name: "홈페이지 갱신", exact: true })
      .click();
    const retry = section.getByRole("button", {
      name: "실패 항목 다시 확인",
      exact: true,
    });
    await expect(retry).toBeVisible({ timeout: 15000 });
    await expect(section.getByRole("alert")).toContainText("완료한 1개");
    await expect(
      section.getByRole("button", { name: "동기화하고 적용", exact: true }),
    ).toHaveCount(0);
    assert.equal(requests.filter((q) => q.includes("item=101")).length, 1);
    assert.equal(requests.filter((q) => q.includes("item=102")).length, 3);
    await section.screenshot({
      path: `artifacts/refresh-resume-${width}-0137.png`,
    });
    failing = false;
    const before = requests.length;
    await retry.click();
    await expect(
      section.getByRole("button", { name: "동기화하고 적용", exact: true }),
    ).toBeEnabled();
    assert.deepEqual(requests.slice(before), [
      "",
      "?category=20&page=1",
      "?category=20&item=102",
    ]);
    await expect(section.getByLabel("홈페이지 갱신 요약")).toContainText(
      "신규 2개",
    );
    assert.equal(writes, 0);
    assert.deepEqual(errors, []);
    assert(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth + 1,
      ),
    );
    reports.push({
      width,
      automaticRetries: 2,
      resumedOnlyFailed: true,
      partialApplyBlocked: true,
      businessWrites: writes,
      errors,
    });
    await page.close();
  }
  await writeFile(
    "artifacts/homepage-resume-browser-0137.json",
    JSON.stringify(reports, null, 2),
  );
  console.log(JSON.stringify(reports));
} finally {
  await browser.close();
}
