import { chromium, expect } from "@playwright/test";
import assert from "node:assert/strict";
import { writeFile } from "node:fs/promises";
import { emptyState } from "../src/core/model";
import { catalogAdmin } from "../tests/fixtures/catalogs";

const browser = await chromium.launch({ args: ["--no-sandbox"] });
const results: unknown[] = [];
try {
  for (const width of [1440, 768, 390]) {
    const page = await browser.newPage({ viewport: { width, height: 1100 } });
    const errors: string[] = [];
    page.on("pageerror", (e) => errors.push(e.message));
    page.on("dialog", (d) => void d.accept());
    await page.addInitScript("window.__name = (fn) => fn;");
    const state = emptyState();
    state.users = [
      catalogAdmin,
      { ...catalogAdmin, id: "other", name: "상담B" },
    ];
    let inquiries: any[] = Array.from({ length: 13 }, (_, n) => ({
      id: `pending-${n}`,
      rev: 1,
      status: "new",
      visitType: "first",
      createdAt: `2026-10-05T00:00:${String(59 - n * 2).padStart(2, "0")}Z`,
      person: {
        name: `미배정시험${n}`,
        phone: "01012345678",
        dob: "1990-01-01",
        sex: "F",
        address: "퇴계동",
      },
      selections: [],
      concerns: [],
      answers: [],
    }));
    let appointments: any[] = Array.from({ length: 13 }, (_, n) => ({
      id: `linked-${n}`,
      rev: 3,
      patientId: `patient-${n}`,
      name: `배정시험${n}`,
      phone: "01012345678",
      receivedAt: `2026-10-05T00:00:${String(58 - n * 2).padStart(2, "0")}Z`,
      date: "2026-10-07",
      time: "11:00",
      coordinatorId: "admin",
      completed: n === 0,
      confirmed: true,
      cancelled: false,
      canReassign: true,
    }));
    const changes: any[] = [];
    let attempts = 0;
    await page.route("**/api/**", async (route) => {
      const path = new URL(route.request().url()).pathname;
      let json: any = {
        products: [],
        patientConcerns: [],
        categories: [],
        token: "fixture",
      };
      if (path === "/api/inquiries")
        json = { inquiries, appointments, closures: { rev: 0, dates: [] } };
      if (path === "/api/inquiries/manage") {
        const b = route.request().postDataJSON();
        changes.push(b);
        if (b.action === "delete") {
          inquiries = inquiries.filter((r) => r.id !== b.id);
          appointments = appointments.filter((r) => r.id !== b.consultationId);
        } else if (b.consultationId) {
          appointments = appointments.map((r) =>
            r.id === b.consultationId
              ? { ...r, coordinatorId: b.ownerId, rev: r.rev + 1 }
              : r,
          );
        } else
          inquiries = inquiries.map((r) =>
            r.id === b.id
              ? { ...r, rev: r.rev + 1, schedule: { coordinatorId: b.ownerId } }
              : r,
          );
        json = { ok: true };
      }
      if (path === "/api/inquiries/convert") {
        attempts++;
        await new Promise((resolve) => setTimeout(resolve, 700));
        if (attempts === 1)
          return route.fulfill({
            status: 409,
            json: { error: "요청이 변경되었습니다. 다시 연결해주세요" },
          });
        json = { patientId: "converted-patient", consultationId: "converted" };
      }
      await route.fulfill({ json });
    });
    await page.goto("http://127.0.0.1:5198/discover");
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
      const root = document.createElement("div");
      root.style.padding = "16px";
      document.body.appendChild(root);
      dom.default.createRoot(root).render(
        React.createElement(DiscoveryDesk, {
          state,
          publicUrl: "/discover",
          work: async (fn: any) => fn(),
          openConsult: async (p: string, c: string) => {
            (window as any).__opened = { p, c };
          },
        }),
      );
    }, state);
    const rows = page.locator(".inquiry-request-row");
    const nav = page.getByRole("navigation", { name: "상담 요청 페이지" });
    await expect(rows).toHaveCount(10);
    await expect(rows.nth(1)).toContainText("배정시험0");
    await rows.nth(1).locator(".inquiry-request-open").click();
    await expect
      .poll(() => page.evaluate(() => (window as any).__opened?.c))
      .toBe("linked-0");
    await rows
      .nth(1)
      .getByRole("button", { name: "상담자 변경", exact: true })
      .click();
    await page.getByLabel("변경할 상담자").selectOption("other");
    await page.getByRole("button", { name: "상담자 변경 저장" }).click();
    await expect(rows.nth(1)).toContainText("상담B");
    assert.equal(changes.at(-1).consultationId, "linked-0");
    await nav.getByRole("button", { name: "다음" }).click();
    await expect(rows).toHaveCount(10);
    await nav.getByRole("button", { name: "다음" }).click();
    await expect(rows).toHaveCount(6);
    await expect(nav).toContainText("3 / 3");
    await page.screenshot({
      path: `artifacts/inquiry-list-${width}.png`,
      fullPage: true,
    });
    // Delete both pending and linked rows; page count must shrink without a blank page.
    for (let i = 0; i < 6; i++) {
      const previous = changes.length;
      await rows
        .first()
        .getByRole("button", { name: "삭제", exact: true })
        .click();
      await expect.poll(() => changes.length).toBe(previous + 1);
      if (i < 5) await expect(rows).toHaveCount(5 - i);
    }
    await expect(rows).toHaveCount(10);
    await expect(nav).toContainText("2 / 2");
    assert.ok(changes.some((c) => c.action === "delete" && !c.consultationId));
    assert.ok(changes.some((c) => c.action === "delete" && c.consultationId));
    await nav.getByRole("button", { name: "이전" }).click();
    await rows.first().locator(".inquiry-request-open").click();
    const form = page.getByRole("region", { name: "상담 준비" });
    await form
      .getByRole("button", { name: "상담으로 연결", exact: true })
      .click();
    await expect(
      form.getByRole("button", { name: "상담 연결 중…" }),
    ).toBeDisabled();
    await expect(form.getByRole("alert")).toContainText(
      "요청이 변경되었습니다",
    );
    await form
      .getByRole("button", { name: "상담으로 연결", exact: true })
      .click();
    await expect
      .poll(() => page.evaluate(() => (window as any).__opened?.c))
      .toBe("converted");
    assert.equal(attempts, 2);
    assert.ok(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth + 1,
      ),
    );
    assert.deepEqual(errors, []);
    results.push({
      width,
      assignedVisible: true,
      tenPerPage: true,
      reassign: true,
      deleteBoth: true,
      pageClamp: true,
      conversionProgressAndRetry: true,
    });
    await page.close();
  }
  await writeFile(
    "artifacts/inquiry-management-browser.json",
    JSON.stringify(results, null, 2),
  );
  console.log(JSON.stringify(results));
} finally {
  await browser.close();
}
