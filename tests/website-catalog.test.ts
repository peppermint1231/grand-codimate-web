import { expect, it } from "vitest";
import { threeCatalogs, catalogAdmin } from "./fixtures/catalogs";
import { applyCommand, validateCatalog } from "../src/core/domain";
import { emptyState, latestCatalog, type Command } from "../src/core/model";
import {
  mergeWebsiteCatalogs,
  mergeHomepageCatalog,
  activateHomepageCatalog,
  independentBeautyCatalog,
  workingCatalog,
  websitePagesSchema,
  websiteReviewNeeded,
} from "../src/core/websiteCatalog";
import { websiteFolderPresence } from "../src/core/websitePresence";
import type { WebsiteEvent } from "../src/core/eventCatalog";
const now = "2026-09-22T09:00:00.000Z";
function fixture() {
  const state = emptyState();
  state.catalogs = threeCatalogs();
  const [beauty, , event] = state.catalogs;
  beauty.folderTree = [
    { id: "custom", name: "우리 병원 리프팅", parentId: "", color: "#123456" },
    { id: "manual", name: "직접 정리", parentId: "custom" },
  ];
  beauty.products[0].folderId = "manual";
  beauty.products[0].name = "슈링크 300샷";
  const offer = {
    id: "1",
    name: "슈링크 300샷",
    description: "설명",
    price: 12000,
    regularPrice: 15000,
    discountRate: 20,
    priceText: "12,000원",
    tax: "unknown" as const,
    issues: [],
  };
  const page: WebsiteEvent = {
    id: "10",
    categoryId: "1",
    categoryName: "일반",
    name: "리프팅",
    description: "",
    url: "https://www.grand4.co.kr/clinicPrice/clinicView.php?i=10&cate=1",
    posterUrls: [],
    period: "",
    offers: [
      offer,
      { ...offer, id: "2", name: "슈링크 600샷" },
      { ...offer, id: "3", name: "[EVENT] 슈링크 100샷" },
    ],
  };
  const bases = {
    beauty: { id: beauty.id, rev: beauty.rev, publishedId: beauty.id },
    event: { id: event.id, rev: event.rev, publishedId: event.id },
  };
  const command: Command = {
    id: "combined",
    type: "catalog.homepage.import",
    payload: { pages: [page], bases, complete: true },
  };
  return { state, beauty, event, page, command };
}
it("refreshes both catalogues while preserving beauty prices, tax, visibility, placement and root colours", () => {
  const { beauty, event, page } = fixture(),
    before = structuredClone(beauty);
  const result = mergeWebsiteCatalogs(beauty, event, [page], now);
  expect(result.summary.beauty).toEqual({
    added: 1,
    existing: 1,
    review: 1,
    missing: 0,
  });
  expect(result.summary.event.added).toBe(1);
  const { websiteListings, ...existing } = result.beauty.products[0];
  expect(existing).toEqual(before.products[0]);
  expect(websiteListings?.[0]).toMatchObject({
    price: 12000,
    missing: false,
    priceDiffers: true,
  });
  expect(result.beauty.folderTree?.slice(0, 2)).toEqual(before.folderTree);
  expect(result.beauty.products[1]).toMatchObject({
    active: false,
    publicVisible: false,
  });
  expect(
    result.beauty.folderTree?.find(
      (f) => f.id === result.beauty.products[1].folderId,
    )?.parentId,
  ).toBe("custom");
  expect(beauty).toEqual(before);
  validateCatalog(result.beauty);
  validateCatalog(result.event);
});
it("repeated scans use source links even after renames and URL query order changes, without creating duplicates", () => {
  const { beauty, event, page } = fixture(),
    first = mergeWebsiteCatalogs(beauty, event, [page], now);
  first.beauty.products[0].name = "병원에서 수정한 이름";
  first.beauty.products[1].name = "수정 이름2";
  page.url = "https://www.grand4.co.kr/clinicPrice/clinicView.php?cate=1&i=10";
  const again = mergeWebsiteCatalogs(first.beauty, first.event, [page], now);
  expect(again.summary.beauty.added).toBe(0);
  expect(again.beauty.products).toHaveLength(2);
  expect(again.beauty.products[0].name).toBe("병원에서 수정한 이름");
  expect(again.summary.event.unchanged).toBe(1);
});
it("tracks removal and reappearance independently of preserved beauty selling status and tracks changed prices", () => {
  const { beauty, event, page } = fixture(),
    first = mergeWebsiteCatalogs(beauty, event, [page], now);
  const removed = { ...page, offers: page.offers.slice(1) };
  const missing = mergeWebsiteCatalogs(
    first.beauty,
    first.event,
    [removed],
    now,
  );
  expect(missing.beauty.products[0].active).toBe(true);
  expect(websiteFolderPresence(missing.beauty, "manual")).toBeUndefined();
  page.offers[0].price = 13000;
  const returned = mergeWebsiteCatalogs(
    missing.beauty,
    missing.event,
    [page],
    now,
  );
  expect(returned.summary.beauty.added).toBe(0);
  expect(returned.beauty.products[0].websiteListings?.[0]).toMatchObject({
    missing: false,
    changed: true,
    priceDiffers: true,
  });
  expect(websiteReviewNeeded(returned.beauty.products[0])).toBe(true);
  expect(websiteFolderPresence(returned.beauty, "manual")).toBeUndefined();
});
it("backfills old imported sources, distinguishes unknown/mixed, and keeps option sources separate", () => {
  const { beauty, event, page } = fixture(),
    first = mergeWebsiteCatalogs(beauty, event, [page], now);
  delete first.beauty.products[1].websiteListings;
  const again = mergeWebsiteCatalogs(first.beauty, first.event, [page], now);
  expect(again.beauty.products[1].websiteListings?.[0].missing).toBe(false);
  again.beauty.products.push({ ...beauty.products[0], id: "unknown" });
  expect(websiteFolderPresence(again.beauty, "manual")).toBeUndefined();
  const unknown = { ...beauty, products: [beauty.products[0]] };
  expect(websiteFolderPresence(unknown, "manual")).toBeUndefined();
});
it("handles a complete site with no event offers, distinguishes event scope from website presence, rejects empty/invalid data", () => {
  const { beauty, event, page } = fixture(),
    first = mergeWebsiteCatalogs(beauty, event, [page], now);
  page.offers[2].name = "슈링크 100샷";
  const next = mergeWebsiteCatalogs(first.beauty, first.event, [page], now);
  const old = next.event.products.find((p) => p.webEvent)!;
  expect(old.webEvent?.missing).toBe(true);
  expect(old.active).toBe(false);
  expect(old.websiteListings?.[0]).toMatchObject({
    book: "미용",
    missing: false,
  });
  expect(websiteFolderPresence(next.event, old.folderId!)?.label).toBe(
    "홈페이지 게시 확인",
  );
  expect(next.summary.beauty.added).toBe(1);
  expect(() => websitePagesSchema.parse([])).toThrow();
  expect(() => websitePagesSchema.parse([page, page])).toThrow();
  expect(() =>
    websitePagesSchema.parse([
      { ...page, posterUrls: ["https://evil.invalid/p.png"] },
    ]),
  ).toThrow();
});
it("saves only a homepage draft with all offers, immutable beauty and previous published snapshots", async () => {
  const { state, command, beauty, event } = fixture(),
    before = structuredClone(state);
  const after = await applyCommand(state, catalogAdmin, command, now);
  expect(after.catalogs).toHaveLength(4);
  expect(workingCatalog(after, "미용")).toEqual(beauty);
  const homepage = workingCatalog(after, "이벤트")!;
  expect(homepage.id).toBe("combined-homepage");
  expect(homepage.products.filter((p) => p.webEvent)).toHaveLength(3);
  expect(homepage.websiteImport?.scope).toBe("all");
  expect(latestCatalog(after, "미용")).toBe(beauty);
  expect(latestCatalog(after, "이벤트")).toBe(event);
  expect(after.catalogRevisions).toHaveLength(2);
  expect(after.catalogRevisions.every((r) => r.book === "이벤트")).toBe(true);
  expect(state).toEqual(before);
  expect(after.catalogs[0]).toBe(state.catalogs[0]);
});
it("blocks the retired combined refresh command so older clients cannot update beauty", async () => {
  const { state, command } = fixture();
  await expect(
    applyCommand(
      state,
      catalogAdmin,
      { ...command, type: "catalog.website.import" },
      now,
    ),
  ).rejects.toThrow("업데이트");
});
it("rejects either stale base, incomplete scan or denied permission without changing either SSOT", async () => {
  for (const key of ["beauty", "event"]) {
    const { state, command } = fixture(),
      before = structuredClone(state);
    (command.payload.bases as any)[key].rev++;
    await expect(
      applyCommand(state, catalogAdmin, command, now),
    ).rejects.toMatchObject({ status: 409 });
    expect(state).toEqual(before);
  }
  const { state, command } = fixture(),
    before = structuredClone(state);
  command.payload.complete = false;
  await expect(applyCommand(state, catalogAdmin, command, now)).rejects.toThrow(
    "전체 조회",
  );
  command.payload.complete = true;
  await expect(
    applyCommand(
      state,
      {
        ...catalogAdmin,
        permissionLevel: "admin",
        permissions: { "catalog.edit": false },
      },
      command,
      now,
    ),
  ).rejects.toMatchObject({ status: 403 });
  expect(state).toEqual(before);
});

it("keeps the matched option when a multi-option product and labels are renamed", () => {
  const { beauty, event, page } = fixture();
  beauty.products[0].options[0].label = "3회";
  beauty.products[0].options.push({
    ...beauty.products[0].options[0],
    id: "second-option",
    label: "5회",
  });
  page.offers[0].name = "슈링크 300샷 3회";
  const first = mergeWebsiteCatalogs(beauty, event, [page], now);
  first.beauty.products[0].name = "직접 수정";
  first.beauty.products[0].options[0].label = "변경 라벨";
  const again = mergeWebsiteCatalogs(first.beauty, first.event, [page], now);
  expect(again.summary.beauty.added).toBe(0);
  expect(again.beauty.products[0].websiteListings?.[0]).toMatchObject({
    optionId: beauty.products[0].options[0].id,
    priceDiffers: true,
  });
});

it("mirrors current website offers and prices while preserving placement and confirmed VAT", () => {
  const { beauty, event, page } = fixture();
  const before = structuredClone(beauty);
  const first = mergeHomepageCatalog(beauty, event, [page], now);
  expect(first.summary.added).toBe(3);
  expect(beauty).toEqual(before);
  validateCatalog(first.catalog);
  const p = first.catalog.products.find((p) => p.webEvent)!;
  p.name = "수동 이름";
  p.options[0].review = false;
  p.options[0].tax = "inclusive";
  p.active = true;
  const again = mergeHomepageCatalog(beauty, first.catalog, [page], now);
  expect(again.summary.added).toBe(0);
  expect(again.summary.unchanged).toBe(2);
  expect(again.catalog.products.find((x) => x.id === p.id)).toMatchObject({
    name: page.offers[0].name,
    active: false,
    folderId: p.folderId,
    options: [{ review: true, tax: "inclusive" }],
  });
  const without = mergeHomepageCatalog(
    beauty,
    again.catalog,
    [{ ...page, offers: page.offers.slice(1) }],
    now,
  );
  expect(without.catalog.products.find((x) => x.id === p.id)).toBeUndefined();
  expect(without.summary.missing).toBe(1);
  expect(without.catalog.products).toHaveLength(2);
  expect(beauty).toEqual(before);
});
it("separates website additions from beauty while keeping hospital folders, product IDs, options and prices", () => {
  const { beauty, page } = fixture();
  const mixed = mergeWebsiteCatalogs(beauty, undefined, [page], now).beauty;
  const before = structuredClone(mixed);
  const independent = independentBeautyCatalog(mixed);
  expect(independent.products).toEqual(beauty.products);
  expect(independent.folderTree).toEqual(beauty.folderTree);
  expect(independent.websiteImport).toBeUndefined();
  expect(mixed).toEqual(before);
  validateCatalog(independent);
});
it("restores independent beauty with revision guards and preserves old catalogue/consultation snapshots", async () => {
  const { state, beauty, event, page } = fixture();
  const mixed = mergeWebsiteCatalogs(beauty, event, [page], now).beauty;
  mixed.id = "mixed";
  mixed.status = "published";
  mixed.rev = 1;
  mixed.publishedAt = now;
  state.catalogs.push(mixed);
  const command: Command = {
    id: "detach-001",
    type: "catalog.beauty.detachWebsite",
    entityId: mixed.id,
    baseRev: 1,
    payload: { basePublishedId: mixed.id, publish: true },
  };
  const before = structuredClone(state);
  const after = await applyCommand(
    state,
    catalogAdmin,
    command,
    "2026-10-01T01:00:00Z",
  );
  const restored = latestCatalog(after, "미용")!;
  expect(restored.products).toEqual(beauty.products);
  expect(restored.websiteImport).toBeUndefined();
  expect(restored.id).toBe("detach-001-beauty");
  expect(restored.version).toBe("2026-10-01T01:00:00Z-detach-001");
  const again = await applyCommand(
    after,
    catalogAdmin,
    {
      ...command,
      id: "detach-002",
      entityId: restored.id,
      baseRev: restored.rev,
      payload: { basePublishedId: restored.id, publish: true },
    },
    "2026-10-01T01:00:01Z",
  );
  expect(latestCatalog(again, "미용")?.version).not.toBe(restored.version);
  expect(restored.status).toBe("published");
  expect(after.catalogs.slice(0, state.catalogs.length)).toEqual(
    state.catalogs,
  );
  expect(after.consultations).toEqual(state.consultations);
  expect(state).toEqual(before);
  await expect(
    applyCommand(state, catalogAdmin, { ...command, baseRev: 0 }),
  ).rejects.toMatchObject({ status: 409 });
  const newer = {
    ...structuredClone(mixed),
    id: "unsaved-changes",
    status: "draft" as const,
    updatedAt: "2026-10-01T02:00:00Z",
  };
  newer.products[0].name = "미게시 수정";
  state.catalogs.push(newer);
  await expect(
    applyCommand(
      state,
      catalogAdmin,
      { ...command, entityId: newer.id },
      "2026-10-01T03:00:00Z",
    ),
  ).rejects.toThrow("미게시");
  const draft = await applyCommand(
    state,
    catalogAdmin,
    { ...command, entityId: newer.id, payload: { basePublishedId: mixed.id } },
    "2026-10-01T03:00:00Z",
  );
  expect(workingCatalog(draft, "미용")?.products[0].name).toBe("미게시 수정");
  expect(latestCatalog(draft, "미용")?.id).toBe(mixed.id);
});

it("drops missing, manual and duplicate rows without mutating published history, and restores source prices", () => {
  const { beauty, event, page } = fixture();
  const first = mergeHomepageCatalog(beauty, event, [page], now).catalog;
  first.products.push(
    { ...first.products[0], id: "duplicate" },
    { ...event.products[0], id: "manual" },
  );
  first.products[1].options[0].price = 999;
  first.products[1].options[0].regularPrice = 1000;
  const before = structuredClone(first);
  const next = mergeHomepageCatalog(
    beauty,
    first,
    [{ ...page, offers: page.offers.slice(1) }],
    now,
  );
  expect(next.catalog.products).toHaveLength(2);
  expect(next.summary.missing).toBe(3);
  expect(next.catalog.products[0].options[0]).toMatchObject({ price: 12000 });
  expect(next.catalog.products[0].options[0].regularPrice).toBeUndefined();
  expect(first).toEqual(before);
});
it("activates confirmed website prices and explicitly chosen VAT without hiding unresolved prices or periods", () => {
  const { beauty, page } = fixture();
  page.offers[0].tax = "exclusive" as any;
  page.offers[1].price = null as any;
  const c = mergeHomepageCatalog(beauty, undefined, [page], now).catalog;
  const before = structuredClone(c);
  const options = {
    activate: true,
    publish: false,
    unknownTax: "unknown" as const,
  };
  const first = activateHomepageCatalog(c, options, now);
  expect(first.activated).toBe(1);
  expect(first.skipped).toHaveLength(2);
  expect(first.catalog.products[0].options[0].review).toBe(false);
  const next = activateHomepageCatalog(
    c,
    { ...options, unknownTax: "inclusive" },
    now,
  );
  expect(next.activated).toBe(2);
  expect(next.skipped).toHaveLength(1);
  expect(next.catalog.products[0].options[0].tax).toBe("exclusive");
  expect(next.catalog.products[2].options[0].tax).toBe("inclusive");
  expect(c).toEqual(before);
  c.products[0].webEvent!.endsOn = "2025-01-01";
  expect(activateHomepageCatalog(c, options, now).skipped[0].reasons).toContain(
    "게시 기간 종료",
  );
});
it("atomically synchronizes new products as inactive and publishes with permission/revision guards and preserved history", async () => {
  const { state, command, event, beauty } = fixture();
  command.payload.options = {
    activate: true,
    publish: true,
    unknownTax: "exclusive",
  };
  const after = await applyCommand(state, catalogAdmin, command, now);
  const c = latestCatalog(after, "이벤트")!;
  expect(c.status).toBe("published");
  expect(c.products).toHaveLength(3);
  expect(c.products.every((p) => !p.active)).toBe(true);
  expect(after.catalogs.find((c) => c.id === event.id)).toEqual(event);
  expect(latestCatalog(after, "미용")).toEqual(beauty);
  validateCatalog(c, true);
  command.payload.options = {
    activate: true,
    publish: true,
    unknownTax: "unknown",
  };
  const inactive = latestCatalog(
    await applyCommand(state, catalogAdmin, command, now),
    "이벤트",
  )!;
  expect(inactive.products.every((p) => !p.active)).toBe(true);
});

it("defaults omitted website VAT to the hospital-approved exclusive policy, preserving explicit website VAT", () => {
  const { beauty, page } = fixture();
  page.offers[0].tax = "inclusive" as any;
  const c = mergeHomepageCatalog(beauty, undefined, [page], now).catalog;
  c.products[1].options[0].tax = "inclusive";
  c.products[1].options[0].review = false;
  const result = activateHomepageCatalog(
    c,
    { activate: true, publish: false, unknownTax: "exclusive" },
    now,
  );
  expect(result.activated).toBe(3);
  expect(result.catalog.products.map((p) => p.options[0].tax)).toEqual([
    "inclusive",
    "exclusive",
    "exclusive",
  ]);
});

it("preserves active unchanged homepage items but leaves new, changed and manually inactive items off", () => {
  const { beauty, page } = fixture();
  const first = activateHomepageCatalog(
    mergeHomepageCatalog(beauty, undefined, [page], now).catalog,
    { activate: true, publish: false, unknownTax: "exclusive" },
    now,
  ).catalog;
  first.products[1].active = false;
  const changed = structuredClone(page);
  changed.offers[0].price = (changed.offers[0].price || 10000) + 100;
  const same = activateHomepageCatalog(
    mergeHomepageCatalog(beauty, first, [page], now).catalog,
    { activate: false, publish: true, unknownTax: "exclusive" },
    now,
  ).catalog;
  expect(same.products[0].active).toBe(true);
  expect(same.products[1].active).toBe(false);
  const updated = activateHomepageCatalog(
    mergeHomepageCatalog(beauty, first, [changed], now).catalog,
    { activate: false, publish: true, unknownTax: "exclusive" },
    now,
  ).catalog;
  expect(updated.products[0].active).toBe(false);
  const added = structuredClone(page);
  added.id = "987654";
  const newItems = activateHomepageCatalog(
    mergeHomepageCatalog(beauty, first, [page, added], now).catalog,
    { activate: false, publish: true, unknownTax: "exclusive" },
    now,
  ).catalog;
  expect(
    newItems.products
      .filter((p) => p.webEvent?.eventId === added.id)
      .every((p) => !p.active),
  ).toBe(true);
});
