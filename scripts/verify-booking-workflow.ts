import { chromium, expect } from "@playwright/test";
import assert from "node:assert/strict";
import { writeFile } from "node:fs/promises";
import { emptyState, type Photo } from "../src/core/model";
import { threeCatalogs, catalogAdmin } from "../tests/fixtures/catalogs";
import { publicProducts } from "../src/core/discovery";
import { patientConcerns } from "../src/core/patientDiscovery";
import { consultationTimes, seoulToday } from "../src/core/appointments";
const state = emptyState(),
  now = new Date().toISOString();
state.catalogs = threeCatalogs();
state.users = [
  catalogAdmin,
  { ...catalogAdmin, id: "coord-b", role: "coordinator", name: "코디B" },
];
state.catalogs.forEach((c, i) => {
  c.products[0].name = ["리팟 흑자 상담", "색소 잡티 상담", "기미 잡티 이벤트"][
    i
  ];
  c.products[0].options[0].price = [111111, 222222, 333333][i];
});
state.patients = [
  {
    id: "existing",
    rev: 1,
    createdAt: now,
    updatedAt: now,
    name: "재방문시험",
    phone: "01012345678",
    dob: "1990-01-01",
    sex: "F",
    address: "퇴계동",
    ownerId: "admin",
  },
];
const date = Array.from({ length: 15 }, (_, i) =>
  seoulToday(Date.now() + (i + 1) * 86400000),
).find((d) => consultationTimes(d).includes("11:00"))!;
const browser = await chromium.launch({ args: ["--no-sandbox"] });
const results: any[] = [];
try {
  for (const width of process.env.STYLUS_ONLY ? [] : [1440, 768, 390]) {
    const page = await browser.newPage({ viewport: { width, height: 1100 } }),
      errors: string[] = [];
    page.on("pageerror", (e) => errors.push(e.message));
    await page.addInitScript(() => {
      (window as any).__name = (f: any) => f;
    });
    let payload: any;
    let record: any = {
      id: "request",
      rev: 1,
      status: "new",
      createdAt: now,
      expiresAt: now,
      visitType: "returning",
      person: {
        name: "재방문시험",
        phone: "01012345678",
        dob: "",
        address: "",
        sex: "U",
      },
      requestedDate: date,
      requestedTime: "11:00",
      requests: "문자로 연락해주세요",
      selections: [],
      concerns: [],
      answers: [],
      schedule: { date, time: "11:00", coordinatorId: "", confirmed: false },
    };
    let closures = { rev: 0, dates: [] as string[] };
    let converted: any;
    await page.route("**/api/**", async (route) => {
      const path = new URL(route.request().url()).pathname;
      let json: any = { ok: true, configured: true, mode: "local-development" };
      if (path === "/api/public/catalog")
        json = {
          products: publicProducts(state),
          patientConcerns,
          categories: [],
          token: "fixture",
          closedDates: [],
        };
      if (path === "/api/public/inquiries") {
        payload = route.request().postDataJSON();
        json = { receipt: "fixture" };
      }
      if (path === "/api/inquiries")
        json = {
          inquiries: [record],
          appointments: [
            {
              id: "done",
              patientId: "existing",
              name: "완료시험",
              date,
              time: "10:00",
              coordinatorId: "coord-b",
              completed: true,
              confirmed: true,
              cancelled: false,
            },
          ],
          closures,
        };
      if (path === "/api/inquiries/schedule") {
        const b = route.request().postDataJSON();
        record = {
          ...record,
          rev: record.rev + 1,
          status: b.action === "cancel" ? "cancelled" : "new",
          schedule: {
            date: b.date,
            time: b.time,
            coordinatorId: b.coordinatorId,
            confirmed: b.action === "confirm",
          },
        };
        json = { inquiry: record };
      }
      if (path === "/api/inquiries/closures") {
        const b = route.request().postDataJSON();
        closures = {
          rev: closures.rev + 1,
          dates: b.action === "add" ? [b.date] : [],
        };
        json = { closures };
      }
      if (path === "/api/intake/settings")
        json = { configured: true, canConfigure: false, folder: "fixture" };
      if (path === "/api/intake/search")
        json = {
          rows: [
            {
              id: "intake",
              name: "재방문시험",
              phone: "01012345678",
              createdAt: now,
            },
          ],
          total: 1,
        };
      if (path === "/api/intake/select")
        json = {
          patientId: "existing",
          alreadyImported: true,
          fields: state.patients[0],
          matches: [state.patients[0]],
        };
      if (path === "/api/inquiries/convert") {
        converted = route.request().postDataJSON();
        json = { patientId: "existing", consultationId: "linked" };
      }
      if (path.startsWith("/api/media/"))
        return route.fulfill({
          contentType: "image/svg+xml",
          body: '<svg xmlns="http://www.w3.org/2000/svg" width="1000" height="750"><rect width="1000" height="750" fill="#ecd8c3"/></svg>',
        });
      await route.fulfill({ json });
    });
    await page.goto("http://127.0.0.1:5198/discover");
    await page
      .locator(".pd-concern-card")
      .filter({ hasText: "점·잡티·기미" })
      .click();
    await page.getByRole("button", { name: /잘 모르겠어요/ }).click();
    const event = page.getByRole("region", { name: "이벤트", exact: true }),
      other = page.getByRole("region", { name: "추천시술", exact: true });
    await expect(event).toContainText("333,333원");
    await expect(other).toContainText("맞춤 상담 후 안내");
    assert.ok(!/111,111|222,222/.test(await other.innerText()));
    assert.ok((await event.boundingBox())!.y < (await other.boundingBox())!.y);
    await page.screenshot({
      path: `artifacts/booking-results-${width}.png`,
      fullPage: true,
    });
    await page.getByRole("button", { name: /상담으로 이어가기/ }).click();
    await page.getByLabel("방문 여부").selectOption("first");
    await expect(page.getByLabel("생년월일")).toHaveAttribute("required", "");
    await expect(page.getByLabel("주소 · 동까지")).toHaveAttribute(
      "required",
      "",
    );
    await page.getByLabel("이름 필수", { exact: true }).fill("신규시험");
    await page.getByLabel("연락처 필수", { exact: true }).fill("01000000000");
    await page.getByLabel("생년월일").fill("1990-01-01");
    await page.getByLabel("주소 · 동까지").fill("춘천시 퇴계동");
    await page.getByLabel("상담 희망일").fill("2026-10-09");
    await expect(
      page.getByLabel("상담 희망 시간").locator("option"),
    ).toHaveCount(1);
    await expect(page.getByRole("status")).toContainText("한글날");
    await page.getByLabel("상담 희망일").fill(date);
    await page.getByLabel("상담 희망 시간").selectOption("11:00");
    await page.getByLabel("요청사항").fill("다른 시간도 가능한지 알려주세요");
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
      path: `artifacts/booking-form-${width}.png`,
      fullPage: true,
    });
    await page
      .getByRole("button", { name: "상담 요청 보내기", exact: true })
      .click();
    await expect(
      page.getByRole("heading", { name: /병원에 전달했어요/ }),
    ).toBeVisible();
    assert.equal(payload.visitType, "first");
    assert.equal(payload.requestedTime, "11:00");
    assert.equal(payload.person.dob, "1990-01-01");
    // Mount staff desk with synthetic records; no production patient data or writes.
    await page.evaluate(async (state) => {
      const { default: React } = await import(
        /* @vite-ignore */ String("/node_modules/.vite/deps/react.js")
      );
      const reactDom: any = await import(
        /* @vite-ignore */ String(
          "/node_modules/.vite/deps/react-dom_client.js",
        )
      );
      const { DiscoveryDesk } = await import(
        /* @vite-ignore */ String("/src/components/DiscoveryDesk.tsx")
      );
      document.getElementById("root")!.style.display = "none";
      const div = document.createElement("div");
      div.style.padding = "16px";
      document.body.appendChild(div);
      reactDom.default.createRoot(div).render(
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
    await page.getByRole("button", { name: "월별", exact: true }).click();
    await page.getByLabel("캘린더 월").fill(date.slice(0, 7));
    await page
      .locator(".inquiry-calendar-event")
      .filter({ hasText: "재방문시험" })
      .click();
    await expect(page.locator(".inquiry-candidates")).toContainText(
      "이름·연락처 일치",
    );
    await expect(page.locator(".inquiry-candidates")).toContainText(
      "초진설문지 후보",
    );
    await page.getByLabel("상담자", { exact: true }).selectOption("coord-b");
    await page
      .getByRole("button", { name: "연락 완료 · 일정 확정", exact: true })
      .click();
    await expect(
      page.locator(".inquiry-calendar-event").filter({ hasText: "재방문시험" }),
    ).toContainText("일정 확정 · 코디B");
    await page.screenshot({
      path: `artifacts/booking-calendar-${width}.png`,
      fullPage: true,
    });
    await page
      .getByLabel("환자 연결", { exact: true })
      .selectOption("existing");
    await page
      .getByRole("button", { name: "상담으로 연결", exact: true })
      .click();
    await expect.poll(() => converted?.patientId).toBe("existing");
    await page
      .locator(".inquiry-calendar-event")
      .filter({ hasText: "완료시험" })
      .click();
    await expect
      .poll(() => page.evaluate(() => (window as any).__opened?.c))
      .toBe("done");
    assert.ok(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth + 1,
      ),
    );
    assert.deepEqual(errors, []);
    results.push({
      width,
      pricePrivacy: true,
      groups: true,
      firstVisit: true,
      holidayBlocked: true,
      calendar: true,
      returningCandidates: true,
      assignOther: true,
      completedLink: true,
    });
    await page.close();
  }
  // Real Pointer Events with CDP pen input, including the barrel-button transition.
  const page = await browser.newPage({
    viewport: { width: 1200, height: 1100 },
  });
  await page.addInitScript(() => {
    (window as any).__name = (f: any) => f;
  });
  await page.route("**/api/**", (r) =>
    r.request().url().includes("/media/")
      ? r.fulfill({
          contentType: "image/svg+xml",
          body: '<svg xmlns="http://www.w3.org/2000/svg" width="1000" height="750"><rect width="1000" height="750" fill="#ecd8c3"/></svg>',
        })
      : r.fulfill({
          json: {
            products: [],
            patientConcerns,
            categories: [],
            token: "fixture",
          },
        }),
  );
  await page.goto("http://127.0.0.1:5198/discover");
  const photo: Photo = {
    id: "test",
    mediaId: "test-media",
    name: "test",
    selected: true,
    rotation: 0,
    annotations: [
      {
        id: "own",
        tool: "pen",
        color: "#ee2222",
        width: 12,
        authorId: "admin",
        points: [
          { x: 0.4, y: 0.5 },
          { x: 0.6, y: 0.5 },
        ],
      },
      {
        id: "protected",
        tool: "pen",
        color: "#2222ee",
        width: 12,
        authorId: "other",
        points: [
          { x: 0.4, y: 0.25 },
          { x: 0.6, y: 0.25 },
        ],
      },
    ],
  };
  await page.evaluate(async (photo) => {
    const { default: React } = await import(
      /* @vite-ignore */ String("/node_modules/.vite/deps/react.js")
    );
    const reactDom: any = await import(
      /* @vite-ignore */ String("/node_modules/.vite/deps/react-dom_client.js")
    );
    const { PhotoEditor } = await import(
      /* @vite-ignore */ String("/src/components/PhotoEditor.tsx")
    );
    document.getElementById("root")!.style.display = "none";
    const div = document.createElement("div");
    document.body.appendChild(div);
    function Harness() {
      const [p, setP] = React.useState(photo);
      return React.createElement(PhotoEditor, {
        photo: p,
        userId: "admin",
        onChange: (next: any) => {
          setP(next);
          (window as any).__savedPhoto = next;
        },
      });
    }
    reactDom.default.createRoot(div).render(React.createElement(Harness));
  }, photo);
  const canvas = page.getByLabel("사진 편집 캔버스");
  await expect(canvas).toBeVisible();
  await page.evaluate(() =>
    window.dispatchEvent(
      new CustomEvent("codimate:stylus", { detail: { erasing: true } }),
    ),
  );
  await expect(
    page.getByRole("button", { name: "지우개", exact: true }),
  ).toHaveAttribute("aria-pressed", "true");
  await page.evaluate(() =>
    window.dispatchEvent(
      new CustomEvent("codimate:stylus", { detail: { erasing: false } }),
    ),
  );
  await expect(
    page.getByRole("button", { name: "펜", exact: true }),
  ).toHaveAttribute("aria-pressed", "true");
  await page.waitForTimeout(500);
  await canvas.scrollIntoViewIfNeeded();
  const cdp = await page.context().newCDPSession(page);
  const pen = async (
    type: "mousePressed" | "mouseReleased" | "mouseMoved",
    x: number,
    y: number,
    button: "left" | "right" | "none" = "left",
    buttons = 1,
  ) => {
    if (type === "mousePressed") await canvas.scrollIntoViewIfNeeded();
    const b = (await canvas.boundingBox())!;
    return cdp.send("Input.dispatchMouseEvent", {
      type,
      x: b.x + b.width * x,
      y: b.y + b.height * y,
      button,
      buttons,
      pointerType: "pen",
      clickCount: type === "mousePressed" ? 1 : 0,
    });
  };
  const nativeButton = (erasing: boolean) =>
    page.evaluate(
      (erasing) =>
        window.dispatchEvent(
          new CustomEvent("codimate:stylus", { detail: { erasing } }),
        ),
      erasing,
    );
  const save = () =>
    page.getByRole("button", { name: "사진 편집 저장", exact: true }).click();
  const savedIds = () =>
    page.evaluate(() =>
      (window as any).__savedPhoto?.annotations.map((a: any) => a.id),
    );
  // Reproduce Galaxy Tab: the bridge reports the button, but Pointer Events
  // still contain only the pen-tip contact bit (buttons=1).
  await page.getByRole("button", { name: "화살표", exact: true }).click();
  await nativeButton(true);
  await pen("mousePressed", 0.5, 0.5, "left", 1);
  await pen("mouseMoved", 0.5, 0.25, "none", 1);
  await pen("mouseReleased", 0.5, 0.25, "left", 0);
  await nativeButton(false);
  await expect(
    page.getByRole("button", { name: "화살표", exact: true }),
  ).toHaveAttribute("aria-pressed", "true");
  await save();
  await expect.poll(savedIds).toEqual(["protected"]);
  await page.getByRole("button", { name: "실행취소", exact: true }).click();
  await save();
  await expect.poll(savedIds).toEqual(["own", "protected"]);
  await page.getByRole("button", { name: "펜", exact: true }).click();
  // Also handle a button press/release while the tip stays on the screen.
  await pen("mousePressed", 0.3, 0.7, "left", 1);
  await pen("mouseMoved", 0.35, 0.7, "none", 1);
  await nativeButton(true);
  await pen("mouseMoved", 0.5, 0.5, "none", 1);
  await pen("mouseMoved", 0.5, 0.25, "none", 1);
  await nativeButton(false);
  await pen("mouseMoved", 0.6, 0.7, "none", 1);
  await pen("mouseMoved", 0.7, 0.7, "none", 1);
  await pen("mouseReleased", 0.7, 0.7, "left", 0);
  await save();
  const nativeIds = await savedIds();
  assert.ok(!nativeIds.includes("own"));
  assert.ok(nativeIds.includes("protected"));
  assert.equal(nativeIds.length, 3); // protected annotation and two separate pen strokes
  await page.getByRole("button", { name: "실행취소", exact: true }).click();
  await save();
  await expect.poll(savedIds).toEqual(["own", "protected"]);
  await pen("mousePressed", 0.5, 0.5, "right", 2);
  await expect(
    page.getByRole("button", { name: "지우개", exact: true }),
  ).toHaveAttribute("aria-pressed", "true");
  await pen("mouseMoved", 0.51, 0.5, "none", 2);
  await pen("mouseReleased", 0.51, 0.5, "right", 0);
  await expect(
    page.getByRole("button", { name: "펜", exact: true }),
  ).toHaveAttribute("aria-pressed", "true");
  await page
    .getByRole("button", { name: "사진 편집 저장", exact: true })
    .click();
  await expect
    .poll(() =>
      page.evaluate(() =>
        (window as any).__savedPhoto?.annotations.map((a: any) => a.id),
      ),
    )
    .toEqual(["protected"]);
  await canvas.scrollIntoViewIfNeeded();
  await pen("mousePressed", 0.3, 0.7);
  await pen("mouseMoved", 0.4, 0.7, "none", 1);
  await pen("mousePressed", 0.4, 0.7, "right", 3);
  await pen("mouseMoved", 0.5, 0.25, "none", 3);
  await pen("mouseReleased", 0.5, 0.25, "right", 1);
  await pen("mouseMoved", 0.6, 0.7, "none", 1);
  await pen("mouseMoved", 0.7, 0.7, "none", 1);
  await pen("mouseReleased", 0.7, 0.7, "left", 0);
  await expect(
    page.getByRole("button", { name: "펜", exact: true }),
  ).toHaveAttribute("aria-pressed", "true");
  await page
    .getByRole("button", { name: "사진 편집 저장", exact: true })
    .click();
  const saved = await page.evaluate(() => (window as any).__savedPhoto);
  assert.ok(saved.annotations.some((a: any) => a.id === "protected"));
  assert.ok(saved.annotations.length >= 2);
  await page.getByLabel("주석 굵기", { exact: true }).fill("20");
  await expect(page.locator(".stroke-width-preview line")).toHaveAttribute(
    "stroke-width",
    "20",
  );
  const sliderBox = await page
    .getByLabel("주석 굵기", { exact: true })
    .boundingBox();
  const trackBox = await page.locator(".stroke-width-track").boundingBox();
  assert.ok(
    sliderBox && trackBox && Math.abs(sliderBox.width - trackBox.width) < 1,
  );
  await page.getByRole("button", { name: "실행취소", exact: true }).click();
  await page
    .getByRole("button", { name: "사진 편집 저장", exact: true })
    .click();
  await expect
    .poll(() =>
      page.evaluate(() => (window as any).__savedPhoto.annotations.length),
    )
    .toBe(1);
  await page.getByRole("button", { name: "다시실행", exact: true }).click();
  await page
    .getByRole("button", { name: "사진 편집 저장", exact: true })
    .click();
  await expect
    .poll(() =>
      page.evaluate(() => (window as any).__savedPhoto.annotations.length),
    )
    .toBe(saved.annotations.length);
  await page.getByText("S펜 설정", { exact: true }).click();
  const stylusSetting = page.getByRole("checkbox", {
    name: "편집기에서 S펜 버튼을 누르는 동안 지우개 사용",
  });
  await expect(stylusSetting).toBeChecked();
  await stylusSetting.uncheck();
  await nativeButton(true);
  await expect(
    page.getByRole("button", { name: "펜", exact: true }),
  ).toHaveAttribute("aria-pressed", "true");
  assert.equal(
    await page.evaluate(() => localStorage.getItem("codimate.stylus-button")),
    "off",
  );
  await page.getByRole("button", { name: "지우개", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "지우개", exact: true }),
  ).toHaveAttribute("aria-pressed", "true");
  await nativeButton(false);
  await stylusSetting.check();
  await page.getByText("S펜 설정", { exact: true }).click();
  await page.screenshot({
    path: "artifacts/booking-stylus.png",
    fullPage: true,
  });
  results.push({
    nativeStylusBridge: true,
    savedStylusPreference: true,
    nativeOnlyActualErase: true,
    nativeOnlyMidStrokeAndUndo: true,
    restoresSelectedTool: true,
    stylusBarrelErase: true,
    releaseRestoresPen: true,
    midStrokeTransition: true,
    protectedAnnotations: true,
    visualWidth: true,
  });
  await page.close();
  await writeFile(
    "artifacts/booking-browser.json",
    JSON.stringify(results, null, 2),
  );
  console.log(JSON.stringify(results));
} finally {
  await browser.close();
}
