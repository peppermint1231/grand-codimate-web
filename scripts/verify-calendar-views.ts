import { chromium, expect } from "@playwright/test";
import assert from "node:assert/strict";
import { writeFile } from "node:fs/promises";
import { emptyState } from "../src/core/model";
import { catalogAdmin } from "../tests/fixtures/catalogs";
const browser = await chromium.launch({ args: ["--no-sandbox"] });
const results = [];
try {
  for (const width of [1440, 768, 390]) {
    const page = await browser.newPage({
      viewport: { width, height: 1100 },
      hasTouch: true,
    });
    const errors: string[] = [];
    page.on("pageerror", (e) => errors.push(e.message));
    await page.addInitScript("window.__name = (fn) => fn;");
    await page.route("**/api/**", (r) =>
      r.fulfill({
        json: {
          products: [],
          patientConcerns: [],
          categories: [],
          token: "fixture",
          inquiries: [],
          appointments: [
            {
              id: "c",
              rev: 1,
              patientId: "p",
              name: "달력시험",
              date: "2026-10-07",
              time: "11:00",
              coordinatorId: "admin",
              confirmed: true,
            },
          ],
          closures: { rev: 0, dates: [] },
        },
      }),
    );
    await page.goto("http://127.0.0.1:5198/discover");
    const state = emptyState();
    state.users = [catalogAdmin];
    await page.evaluate(async (state) => {
      const { default: React } = await import(
        String("/node_modules/.vite/deps/react.js")
      );
      const dom: any = await import(
        String("/node_modules/.vite/deps/react-dom_client.js")
      );
      const { DiscoveryDesk } = await import(
        String("/src/components/DiscoveryDesk.tsx")
      );
      document.getElementById("root")!.style.display = "none";
      const el = document.createElement("div");
      el.style.padding = "16px";
      document.body.appendChild(el);
      dom.default.createRoot(el).render(
        React.createElement(DiscoveryDesk, {
          state,
          publicUrl: "/discover",
          work: async (f: any) => f(),
          openConsult: async (p: string, c: string) => {
            (window as any).__opened = { p, c };
          },
        }),
      );
    }, state);
    await expect(
      page.getByRole("button", { name: "주별", exact: true }),
    ).toHaveAttribute("aria-pressed", "true");
    await page.getByLabel("캘린더 날짜").fill("2026-10-07");
    await expect(page.locator(".inquiry-calendar-heading")).toHaveText(
      "2026-10-04 ~ 2026-10-10",
    );
    await expect(page.locator(".calendar-week .inquiry-day")).toHaveCount(7);
    const cdp = await page.context().newCDPSession(page);
    const swipe = async (dx: number, dy = 0) => {
      const el = page.locator(".inquiry-calendar-scroll");
      await el.scrollIntoViewIfNeeded();
      const b = (await el.boundingBox())!;
      const x = b.x + b.width * (dx < 0 ? 0.8 : 0.2),
        y = Math.max(30, b.y) + 45;
      await cdp.send("Input.dispatchTouchEvent", {
        type: "touchStart",
        touchPoints: [{ x, y }],
      });
      for (let i = 1; i <= 8; i++)
        await cdp.send("Input.dispatchTouchEvent", {
          type: "touchMove",
          touchPoints: [{ x: x + (dx * i) / 8, y: y + (dy * i) / 8 }],
        });
      await cdp.send("Input.dispatchTouchEvent", {
        type: "touchEnd",
        touchPoints: [],
      });
    };
    await swipe(-150);
    await expect(page.locator(".inquiry-calendar-heading")).toHaveText(
      "2026-10-11 ~ 2026-10-17",
    );
    await expect(page.locator(".calendar-next")).toHaveCount(1);
    await swipe(150);
    await expect(page.locator(".inquiry-calendar-heading")).toHaveText(
      "2026-10-04 ~ 2026-10-10",
    );
    await swipe(10, -90);
    await expect(page.locator(".inquiry-calendar-heading")).toHaveText(
      "2026-10-04 ~ 2026-10-10",
    );
    await page.waitForTimeout(400);
    await page.locator(".inquiry-calendar-event").click();
    assert.deepEqual(await page.evaluate(() => (window as any).__opened), {
      p: "p",
      c: "c",
    });
    await page.getByRole("button", { name: "일별", exact: true }).click();
    await expect(page.locator(".calendar-day .inquiry-day")).toHaveCount(1);
    await swipe(-150);
    await expect(page.getByLabel("캘린더 날짜")).toHaveValue("2026-10-08");
    await page.getByRole("button", { name: "월별", exact: true }).click();
    await expect(
      page.locator(".calendar-month .inquiry-day:not(.empty)"),
    ).toHaveCount(31);
    await swipe(-150);
    await expect(page.getByLabel("캘린더 월")).toHaveValue("2026-11");
    await page.getByRole("button", { name: "이전 월", exact: true }).click();
    await expect(page.getByLabel("캘린더 월")).toHaveValue("2026-10");
    assert(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth + 1,
      ),
      "page overflow",
    );
    await page.screenshot({
      path: `artifacts/calendar-0184-${width}.png`,
      fullPage: true,
    });
    assert.deepEqual(errors, []);
    results.push({
      width,
      defaultWeek: true,
      monthWeekDay: true,
      swipe: true,
      verticalPreserved: true,
      consultationLink: true,
    });
    await page.close();
  }
  console.log(JSON.stringify(results));
  await writeFile("artifacts/calendar-0184.json", JSON.stringify(results));
} finally {
  await browser.close();
}
