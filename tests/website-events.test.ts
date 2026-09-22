import { expect, it, vi } from "vitest";
import {
  fetchEventSource,
  parseEventPage,
  parseWebsiteEvent,
  exactWon,
  periodDates,
} from "../server/eventCatalog";
import {
  eventAvailability,
  mergeWebsiteEvents,
  safeEventImage,
  type WebsiteEvent,
} from "../src/core/eventCatalog";
import { scanWebsiteEvents } from "../src/lib/eventSync";
import { validateCatalog, applyCommand } from "../src/core/domain";
import { emptyState, type Command } from "../src/core/model";
import { publicProducts } from "../src/core/discovery";
import { catalogAdmin, threeCatalogs } from "./fixtures/catalogs";
import { eventList, eventDetail } from "./fixtures/websiteEvents";
const now = "2026-09-22T01:00:00Z";
const event = () => parseWebsiteEvent(eventDetail(), "101", "20");
it("extracts category IDs, event links and pagination without taking teaser prices", () => {
  const result = parseEventPage(
    eventList(
      undefined,
      '<a href="?cate=20&page=2">2</a><a href="https://evil.example/?cate=20&page=3">3</a>',
    ),
    "20",
  );
  expect(result.categories).toHaveLength(2);
  expect(result.pages).toEqual([2]);
  expect(result.items).toEqual([
    {
      id: "101",
      categoryId: "20",
      categoryName: "시험 이벤트",
      name: "시험 이벤트",
    },
  ]);
  expect(
    parseEventPage(eventList("등록된 시술이 없습니다."), "20").items,
  ).toEqual([]);
  expect(() => parseEventPage("로그인하세요")).toThrow();
  expect(() => parseEventPage(eventList(""), "20")).toThrow();
});
it("reads exact offer price, separate regular price/rate, period and remote poster links", () => {
  const e = event();
  expect(e).toMatchObject({
    name: "시험 이벤트",
    description: "설명 & 안내",
    startsOn: "2026-09-01",
    endsOn: "2026-09-30",
    posterUrls: [
      "https://www.grand4.co.kr/uploadFiles/C00269/clinicEventImg/test.png",
    ],
  });
  expect(e.offers[0]).toMatchObject({
    id: "201",
    price: 80000,
    regularPrice: 100000,
    discountRate: 20,
    tax: "exclusive",
    issues: [],
  });
  expect(() => parseWebsiteEvent(eventDetail(), "999", "20")).toThrow();
});
it("never invents a price or tax for ranges, consultation prices or absent VAT", () => {
  for (const text of [
    "80,000원~",
    "8만원부터",
    "상담 후 결정",
    "8,000~9,000원",
    "-100원",
    "무료 상담",
  ])
    expect(exactWon(text)).toBeNull();
  expect(exactWon("0원")).toBe(0);
  const e = parseWebsiteEvent(
    eventDetail("80,000원~").replace("VAT 별도", ""),
    "101",
    "20",
  );
  expect(e.offers[0].price).toBeNull();
  expect(e.offers[0].tax).toBe("unknown");
  expect(e.offers[0].issues.length).toBeGreaterThan(0);
  const absent = parseWebsiteEvent(
    eventDetail()
      .replace('<em alt="정가">100,000원</em>', "")
      .replace('<small alt="할인율">20%</small>', ""),
    "101",
    "20",
  );
  expect(absent.offers[0].regularPrice).toBeNull();
  expect(absent.offers[0].discountRate).toBeNull();
});
it("flags inconsistent discounts without replacing the website's displayed rate", () => {
  const e = parseWebsiteEvent(eventDetail("90,000원"), "101", "20");
  expect(e.offers[0].discountRate).toBe(20);
  expect(e.offers[0].issues.join()).toContain("불일치");
});
it("uses Korea dates including the final event day and leaves ambiguous date text unbounded", () => {
  expect(periodDates("~2026-09-30")).toEqual({ endsOn: "2026-09-30" });
  expect(periodDates("2026-02-31~2026-03-30")).toEqual({});
  expect(periodDates("9월 한정")).toEqual({});
  expect(eventAvailability(event(), "2026-09-30T14:59:59Z")).toBe("current");
  expect(eventAvailability(event(), "2026-09-30T15:00:00Z")).toBe("ended");
  expect(eventAvailability(event(), "2026-08-31T00:00:00Z")).toBe("upcoming");
});
it("rejects arbitrary endpoints and reads HTML only; image bodies are never fetched", async () => {
  const fetcher = vi.fn(
    async () =>
      new Response(eventDetail(), {
        headers: { "Content-Type": "text/html;charset=UTF-8" },
      }),
  );
  const result = (await fetchEventSource(
    new URLSearchParams("category=20&item=101"),
    fetcher as typeof fetch,
  )) as WebsiteEvent;
  expect(fetcher).toHaveBeenCalledTimes(1);
  expect(fetcher.mock.calls[0]).toHaveLength(2);
  expect(result.posterUrls).toHaveLength(1);
  for (const q of [
    "url=https://evil.example",
    "category=../x",
    "category=20&page=101",
    "item=101",
  ])
    await expect(
      fetchEventSource(new URLSearchParams(q), fetcher as typeof fetch),
    ).rejects.toThrow();
  expect(fetcher).toHaveBeenCalledTimes(1);
  expect(safeEventImage("javascript:alert(1)")).toBeUndefined();
  expect(
    safeEventImage("https://www.grand4.co.kr@evil.example/uploadFiles/a.png"),
  ).toBeUndefined();
  expect(safeEventImage("/uploadFiles/a.svg")).toBeUndefined();
  await expect(
    fetchEventSource(
      new URLSearchParams(),
      vi.fn(
        async () =>
          new Response("x".repeat(2_000_001), {
            headers: { "Content-Type": "text/html" },
          }),
      ) as typeof fetch,
    ),
  ).rejects.toThrow("크기");
});
it("scans all banner details to find offer-level events, follows pages and deduplicates events", async () => {
  const calls: string[] = [];
  const load = async (q: string) => {
    calls.push(q);
    if (q.includes("item="))
      return q.includes("item=102")
        ? {
            ...event(),
            id: "102",
            name: "일반 가격표",
            categoryName: "미용",
            offers: [{ ...event().offers[0], name: "일반 시술" }],
          }
        : event();
    const page = parseEventPage(
      eventList(
        '<a href="./clinicView.php?i=101&cate=20"><div class="Name">시험 이벤트</div></a><a href="./clinicView.php?i=102&cate=30"><div class="Name">일반 가격표</div></a>',
        '<a href="?cate=20&page=2">2</a>',
      ),
      q ? "20" : undefined,
    );
    return page;
  };
  const events = await scanWebsiteEvents(load, () => {});
  expect(events).toHaveLength(1);
  expect(calls.filter((q) => q.includes("item="))).toEqual([
    "?category=20&item=101",
    "?category=30&item=102",
  ]);
  expect(calls).toContain("?category=20&page=2");
});
it("fails the whole preview when any page fails and honors cancellation", async () => {
  const load = vi.fn(async (q: string) => {
    if (q) throw Error("network failed");
    return parseEventPage(eventList());
  });
  await expect(scanWebsiteEvents(load, () => {})).rejects.toThrow(
    "network failed",
  );
  const abort = new AbortController();
  abort.abort();
  await expect(
    scanWebsiteEvents(load, () => {}, abort.signal),
  ).rejects.toMatchObject({ name: "AbortError" });
});
it("merges into event drafts with stable IDs and retains manual entries, layout and completed review on unchanged refresh", () => {
  const base = threeCatalogs()[2],
    snapshot = structuredClone(base),
    first = mergeWebsiteEvents(base, [event()], now);
  validateCatalog(first.catalog);
  expect(first.summary.added).toBe(1);
  expect(base).toEqual(snapshot);
  expect(first.catalog.products[0]).toEqual(base.products[0]);
  const imported = first.catalog.products[1];
  imported.active = true;
  imported.publicVisible = true;
  imported.options[0].review = false;
  imported.options[0].tax = "inclusive";
  imported.folderId = "pigment";
  const next = mergeWebsiteEvents(first.catalog, [event()], now);
  expect(next.summary.unchanged).toBe(1);
  expect(next.catalog.products).toHaveLength(2);
  expect(next.catalog.products[1]).toMatchObject({
    id: imported.id,
    active: true,
    folderId: "pigment",
    options: [{ review: false, tax: "inclusive" }],
  });
  expect(first.catalog.id).not.toBe(next.catalog.id);
});
it("requires re-review on changed prices, deactivates missing/ended items, never deletes and excludes ordinary banners", () => {
  const first = mergeWebsiteEvents(undefined, [event()], now).catalog;
  first.products[0].active = true;
  first.products[0].options[0].review = false;
  const changed = event();
  changed.offers[0].price = 70000;
  const next = mergeWebsiteEvents(first, [changed], now);
  expect(next.summary.changed).toBe(1);
  expect(next.catalog.products[0]).toMatchObject({
    active: false,
    options: [{ price: 70000, review: true }],
  });
  const other = { ...event(), id: "102" };
  const missing = mergeWebsiteEvents(first, [other], now);
  expect(missing.summary.missing).toBe(1);
  expect(missing.catalog.products[0].webEvent?.missing).toBe(true);
  expect(missing.catalog.products).toHaveLength(2);
  const expired = mergeWebsiteEvents(first, [event()], "2026-10-01T01:00:00Z");
  expect(expired.summary.ended).toBe(1);
  expect(expired.catalog.products[0].active).toBe(false);
  const ordinary = {
    ...event(),
    id: "999",
    name: "일반 가격표",
    categoryName: "일반 가격표",
  };
  expect(
    mergeWebsiteEvents(undefined, [event(), ordinary], now).catalog.products,
  ).toHaveLength(1);
  expect(() => mergeWebsiteEvents(first, [ordinary], now)).toThrow();
  expect(() =>
    mergeWebsiteEvents(threeCatalogs()[0], [event()], now),
  ).toThrow();
});
it("records import history, enforces edit permission and rejects stale base revisions", async () => {
  const s = emptyState();
  s.catalogs = threeCatalogs();
  const base = s.catalogs[2],
    next = mergeWebsiteEvents(base, [event()], now).catalog;
  const command: Command = {
    id: crypto.randomUUID(),
    type: "catalog.events.import",
    entityId: next.id,
    payload: {
      catalog: next,
      baseCatalogId: base.id,
      baseCatalogRev: base.rev,
      basePublishedId: base.id,
    },
  };
  const saved = await applyCommand(s, catalogAdmin, command, now);
  expect(saved.catalogs.slice(0, 3)).toEqual(s.catalogs);
  expect(saved.catalogs.at(-1)?.status).toBe("draft");
  expect(saved.catalogRevisions.at(-1)?.action).toBe("홈페이지 이벤트 갱신");
  await expect(
    applyCommand(
      s,
      { ...catalogAdmin, role: "desk", permissionLevel: "standard" },
      command,
      now,
    ),
  ).rejects.toMatchObject({ status: 403 });
  await expect(
    applyCommand(
      s,
      catalogAdmin,
      { ...command, payload: { ...command.payload, baseCatalogRev: 5 } },
      now,
    ),
  ).rejects.toMatchObject({ status: 409 });
  await expect(
    applyCommand(
      saved,
      catalogAdmin,
      { ...command, entityId: crypto.randomUUID() },
      now,
    ),
  ).rejects.toMatchObject({ status: 409 });
});
it("validates poster URLs and never exposes unreviewed event prices through the recommender", () => {
  const c = mergeWebsiteEvents(undefined, [event()], now).catalog;
  c.status = "published";
  c.publishedAt = now;
  const p = c.products[0];
  p.publicVisible = true;
  // Use a current open-ended event so this test remains stable after September.
  p.webEvent!.endsOn = undefined;
  p.webEvent!.startsOn = undefined;
  const s = { ...emptyState(), catalogs: [c] };
  expect(publicProducts(s)[0].event).toBeUndefined();
  p.active = true;
  p.options[0].review = false;
  expect(publicProducts(s)[0].event?.regularPrice).toBe(100000);
  p.webEvent!.endsOn = "2001-01-01";
  expect(publicProducts(s)).toEqual([]);
  p.webEvent!.posterUrls = ["https://evil.example/a.png"];
  expect(() => validateCatalog(c)).toThrow("포스터");
});
it("blocks new expired event selections while preserving already saved consultation prices", async () => {
  let s = emptyState();
  const c = mergeWebsiteEvents(undefined, [event()], now).catalog;
  c.status = "published";
  c.publishedAt = now;
  c.version = "published-event";
  c.products[0].active = true;
  c.products[0].options[0].review = false;
  s.catalogs = [c];
  const command = (
    type: string,
    entityId: string,
    payload: any,
    baseRev?: number,
  ): Command => ({ id: crypto.randomUUID(), type, entityId, payload, baseRev });
  s = await applyCommand(
    s,
    catalogAdmin,
    command("patient.create", "patient-event", {
      name: "시험",
      sex: "F",
      dob: "1990-01-01",
      phone: "01000000000",
      address: "시험동",
    }),
    now,
  );
  s = await applyCommand(
    s,
    catalogAdmin,
    command("consultation.create", "consult-event", {
      patientId: "patient-event",
      category: "미용",
    }),
    now,
  );
  const line = {
    id: "line-event",
    productId: c.products[0].id,
    optionId: c.products[0].options[0].id,
    catalogVersion: c.version,
    book: "이벤트",
    quantity: 1,
    discount: { kind: "amount", value: 0 },
  };
  const payload = {
    lines: [line],
    catalogVersion: c.version,
    catalogVersions: s.consultations[0].catalogVersions,
    discount: { kind: "amount", value: 0 },
    vat: "separate",
    photos: [],
  };
  await expect(
    applyCommand(
      s,
      catalogAdmin,
      command("consultation.save", "consult-event", payload, 1),
      "2026-10-01T01:00:00Z",
    ),
  ).rejects.toThrow("진행 중");
  s = await applyCommand(
    s,
    catalogAdmin,
    command("consultation.save", "consult-event", payload, 1),
    now,
  );
  const saved = await applyCommand(
    s,
    catalogAdmin,
    command(
      "consultation.save",
      "consult-event",
      { ...payload, lines: s.consultations[0].quote.lines },
      2,
    ),
    "2026-10-01T01:00:00Z",
  );
  expect(saved.consultations[0].quote.lines[0].price).toBe(80000);
});
it("includes event-category banners even when their individual title does not contain 이벤트", async () => {
  const special = {
    ...event(),
    id: "103",
    name: "한가위 핫딜",
    categoryName: "추석맞이 이벤트",
  };
  const ordinary = {
    ...event(),
    id: "104",
    name: "일반 피부관리",
    categoryName: "미용 단가표",
  };
  const page = parseEventPage(
    eventList(
      '<a href="./clinicView.php?i=103&cate=20"><div class="Name">한가위 핫딜</div></a><a href="./clinicView.php?i=104&cate=30"><div class="Name">일반 피부관리</div></a>',
    ),
  );
  const calls: string[] = [];
  const events = await scanWebsiteEvents(
    async (q) => {
      calls.push(q);
      return q.includes("item=104")
        ? ordinary
        : q.includes("item=")
          ? special
          : page;
    },
    () => {},
  );
  expect(events.map((e) => e.id)).toEqual(["103"]);
  expect(calls.filter((q) => q.includes("item="))).toEqual([
    "?category=20&item=103",
    "?category=30&item=104",
  ]);
  const merged = mergeWebsiteEvents(undefined, [special, ordinary], now);
  expect(merged.catalog.products).toHaveLength(1);
  expect(merged.catalog.products[0].webEvent?.categoryName).toBe(
    "추석맞이 이벤트",
  );
  validateCatalog(merged.catalog);
});
