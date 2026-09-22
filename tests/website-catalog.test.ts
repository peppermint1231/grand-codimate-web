import { expect, it } from "vitest";
import { threeCatalogs, catalogAdmin } from "./fixtures/catalogs";
import { applyCommand, validateCatalog } from "../src/core/domain";
import { emptyState, latestCatalog, type Command } from "../src/core/model";
import {
  mergeWebsiteCatalogs,
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
    type: "catalog.website.import",
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
  expect(websiteFolderPresence(missing.beauty, "manual")?.label).toBe(
    "홈페이지에서 제외됨",
  );
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
  expect(websiteFolderPresence(returned.beauty, "manual")?.label).toBe(
    "홈페이지 게시 확인",
  );
});
it("backfills old imported sources, distinguishes unknown/mixed, and keeps option sources separate", () => {
  const { beauty, event, page } = fixture(),
    first = mergeWebsiteCatalogs(beauty, event, [page], now);
  delete first.beauty.products[1].websiteListings;
  const again = mergeWebsiteCatalogs(first.beauty, first.event, [page], now);
  expect(again.beauty.products[1].websiteListings?.[0].missing).toBe(false);
  again.beauty.products.push({ ...beauty.products[0], id: "unknown" });
  expect(websiteFolderPresence(again.beauty, "manual")?.label).toBe(
    "홈페이지 게시 상태 혼합",
  );
  const unknown = { ...beauty, products: [beauty.products[0]] };
  expect(websiteFolderPresence(unknown, "manual")?.label).toBe(
    "홈페이지 게시 여부 미확인",
  );
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
it("saves both drafts in one command with distinct history IDs, immutable previous snapshots and unchanged published versions", async () => {
  const { state, command, beauty, event } = fixture(),
    before = structuredClone(state);
  const after = await applyCommand(state, catalogAdmin, command, now);
  expect(after.catalogs).toHaveLength(5);
  expect(workingCatalog(after, "미용")?.id).toBe("combined-beauty");
  expect(workingCatalog(after, "이벤트")?.id).toBe("combined-event");
  expect(latestCatalog(after, "미용")).toBe(beauty);
  expect(latestCatalog(after, "이벤트")).toBe(event);
  expect(after.catalogRevisions).toHaveLength(4);
  expect(new Set(after.catalogRevisions.map((r) => r.id)).size).toBe(4);
  expect(
    after.catalogRevisions.some((r) =>
      r.changes.some((c) => c.includes("홈페이지 게시 상태")),
    ),
  ).toBe(true);
  expect(state).toEqual(before);
  expect(after.catalogs[0]).toBe(state.catalogs[0]);
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
