import { expect, it } from "vitest";
import { threeCatalogs } from "./fixtures/catalogs";
import {
  alignEventCategories,
  beautyClassifier,
  classificationReviewId,
} from "../src/core/catalogClassification";
import {
  mergeWebsiteEvents,
  selectWebsiteOffers,
  type WebsiteEvent,
} from "../src/core/eventCatalog";
import {
  addMissingWebsiteBeauty,
  websiteNameKey,
} from "../src/core/websiteBeauty";
import { websiteFolderPresence } from "../src/core/websitePresence";
import { validateCatalog } from "../src/core/domain";
import { publicCategories } from "../src/core/discovery";
import { emptyState } from "../src/core/model";
function fixture() {
  const [beauty, , event] = threeCatalogs();
  beauty.folderTree = [
    {
      id: "user-pores",
      name: "모공·작은흉터·피부결",
      parentId: "",
      color: "#315d87",
    },
    { id: "user-infusion", name: "IVNT", parentId: "" },
    { id: "user-lift", name: "탄력 센터", parentId: "" },
  ];
  beauty.products = [
    {
      ...beauty.products[0],
      id: "b1",
      name: "슈링크 300샷",
      folderId: "user-lift",
    },
  ];
  const page: WebsiteEvent = {
    id: "123",
    categoryId: "1",
    categoryName: "일반 시술",
    name: "실리프팅",
    description: "",
    period: "",
    url: "https://www.grand4.co.kr/clinicPrice/clinicView.php?i=123&cate=1",
    posterUrls: [],
    offers: [
      {
        id: "1",
        name: "[EVENT] 슈링크 300샷",
        description: "",
        price: 8000,
        regularPrice: 10000,
        discountRate: 20,
        priceText: "8000원",
        tax: "unknown",
        issues: [],
      },
      {
        id: "2",
        name: "피코 프락셀 1회",
        description: "",
        price: 10000,
        regularPrice: null,
        discountRate: null,
        priceText: "10000원",
        tax: "unknown",
        issues: [],
      },
    ],
  };
  return { beauty, event, page };
}
it("partitions mixed ordinary banners per offer, including Korean and mixed-case EVENT, without losing offers", () => {
  const { page } = fixture();
  page.offers.push(
    { ...page.offers[0], id: "3", name: "이벤트 특가" },
    { ...page.offers[0], id: "4", name: "event 특가" },
  );
  expect(
    selectWebsiteOffers([page], "이벤트")[0].offers.map((o) => o.id),
  ).toEqual(["1", "3", "4"]);
  expect(
    selectWebsiteOffers([page], "미용")[0].offers.map((o) => o.id),
  ).toEqual(["2"]);
  page.categoryName = "한가위 이벤트";
  expect(selectWebsiteOffers([page], "미용")).toEqual([]);
});
it("learns destinations from edited beauty placements, preserves root order/colors and never defaults unknowns to booster", () => {
  const { beauty, event } = fixture();
  event.products = [
    { ...event.products[0], name: "슈링크 500샷" },
    { ...event.products[0], id: "unknown", name: "알수없는상품", options: [] },
  ];
  const before = structuredClone(event),
    result = alignEventCategories(event, beauty);
  expect(result.decisions[0].rootId).toBe("user-lift");
  expect(result.decisions[1].rootId).toBe(classificationReviewId);
  expect(result.catalog.folderTree!.slice(0, 3)).toEqual(beauty.folderTree);
  expect(result.catalog.products.map(({ folderId, ...p }) => p)).toEqual(
    event.products.map(({ folderId, ...p }) => p),
  );
  expect(event).toEqual(before);
  validateCatalog(result.catalog);
  beauty.products[0].folderId = "user-pores";
  expect(beautyClassifier(beauty)(event.products[0]).rootId).toBe("user-pores");
});
it("imports offer-only events with the beauty taxonomy and keeps manual placement on later refreshes", () => {
  const { beauty, page } = fixture();
  const imported = mergeWebsiteEvents(
    undefined,
    [page],
    undefined,
    beauty,
  ).catalog;
  validateCatalog(imported);
  expect(imported.products).toHaveLength(1);
  expect(
    imported.folderTree!.find((f) => f.id === imported.products[0].folderId)
      ?.parentId,
  ).toBe("user-lift");
  imported.products[0].folderId = "user-lift";
  expect(
    mergeWebsiteEvents(imported, [page], undefined, beauty).catalog.products[0]
      .folderId,
  ).toBe("user-lift");
});
it("adds only ordinary missing offers, recognises existing options without merging doses and preserves every existing field", () => {
  const { beauty, page } = fixture();
  beauty.products[0].options[0].label = "3회 패키지";
  page.offers.push(
    { ...page.offers[1], id: "3", name: "슈링크300샷 3회" },
    { ...page.offers[1], id: "4", name: "슈링크600샷 3회" },
  );
  const before = structuredClone(beauty),
    result = addMissingWebsiteBeauty(beauty, [page]);
  expect(result.added).toBe(2);
  expect(result.existing).toBe(1);
  expect(result.catalog.products[0]).toEqual(before.products[0]);
  expect(beauty).toEqual(before);
  expect(
    result.catalog.products
      .slice(1)
      .every(
        (p) =>
          !p.active &&
          !p.publicVisible &&
          p.options[0].review &&
          p.options[0].tax === "unknown",
      ),
  ).toBe(true);
  expect(result.catalog.products.some((p) => p.name.includes("EVENT"))).toBe(
    false,
  );
  validateCatalog(result.catalog);
  expect(addMissingWebsiteBeauty(result.catalog, [page]).added).toBe(0);
});
it("shows presence independently from expiration, distinguishes unknown and mixed folders, and handles moved products", () => {
  const { beauty, page } = fixture();
  const c = mergeWebsiteEvents(undefined, [page], undefined, beauty).catalog;
  const p = c.products[0];
  p.webEvent!.endsOn = "2000-01-01";
  expect(websiteFolderPresence(c, p.folderId!)?.label).toBe(
    "홈페이지 게시 확인",
  );
  p.webEvent!.missing = true;
  expect(websiteFolderPresence(c, p.folderId!)?.label).toBe(
    "홈페이지에서 제외됨",
  );
  c.products.push({ ...p, id: "manual", webEvent: undefined });
  expect(websiteFolderPresence(c, p.folderId!)?.label).toBe(
    "홈페이지 게시 상태 혼합",
  );
  c.products.shift();
  expect(websiteFolderPresence(c, p.folderId!)?.label).toBe(
    "홈페이지 게시 여부 미확인",
  );
});
it("recommendation uses the aligned published roots and does not publish the event draft", () => {
  const { beauty, event } = fixture();
  const aligned = alignEventCategories(event, beauty).catalog;
  const state = emptyState();
  state.catalogs = [beauty, aligned];
  expect(
    publicCategories(state)
      .filter((c) => c.book === "이벤트")
      .slice(0, 3)
      .map((c) => c.name),
  ).toEqual(beauty.folderTree!.map((f) => f.name));
  aligned.status = "draft";
  expect(publicCategories(state).filter((c) => c.book === "이벤트")).toEqual(
    [],
  );
});
it("keeps decimal doses and ranges distinct and retains differently priced same-name source offers", () => {
  expect(websiteNameKey("스킨 1.5cc")).not.toBe(websiteNameKey("스킨 15cc"));
  expect(websiteNameKey("스킨 1-3cc")).not.toBe(websiteNameKey("스킨 13cc"));
  const { beauty, page } = fixture();
  page.offers = [
    { ...page.offers[1], id: "11", name: "새 상품 1.5cc", price: 10000 },
    { ...page.offers[1], id: "12", name: "새 상품 1.5cc", price: 20000 },
  ];
  const result = addMissingWebsiteBeauty(beauty, [page]);
  expect(result.added).toBe(2);
  expect(
    result.catalog.products.slice(1).map((p) => p.options[0].price),
  ).toEqual([10000, 20000]);
});
it("catalogue saves share immutable history without mutating the source catalogue or revision snapshots", async () => {
  const { applyCommand } = await import("../src/core/domain");
  const { catalogAdmin } = await import("./fixtures/catalogs");
  const { beauty, event } = fixture();
  event.status = "draft";
  const state = emptyState();
  state.catalogs = [beauty, event];
  state.catalogRevisions = [
    {
      id: "revision-old",
      rev: 1,
      createdAt: "2026-09-20",
      updatedAt: "2026-09-20",
      catalogId: beauty.id,
      book: "미용",
      actorId: "admin",
      action: "이전",
      changes: [],
      snapshot: structuredClone(beauty),
    },
  ];
  const before = structuredClone(state);
  const next = structuredClone(event);
  next.products[0].name = "수정한 이벤트";
  const after = await applyCommand(state, catalogAdmin, {
    id: "save-memory-check",
    type: "catalog.save",
    entityId: event.id,
    baseRev: event.rev,
    payload: { catalog: next },
  });
  expect(state).toEqual(before);
  expect(after.catalogs[0]).toBe(state.catalogs[0]);
  expect(after.catalogRevisions[0]).toBe(state.catalogRevisions[0]);
  expect(after.catalogs[1]).not.toBe(state.catalogs[1]);
  expect(after.catalogs[1].products[0].name).toBe("수정한 이벤트");
  expect(after.catalogRevisions.at(-1)!.snapshot.products[0].name).toBe(
    "수정한 이벤트",
  );
});
