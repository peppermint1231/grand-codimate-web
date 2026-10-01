import { it, expect } from "vitest";
import { catalogCategoryView } from "../src/core/catalogCategoryView";
import { threeCatalogs } from "./fixtures/catalogs";
import { inFolder, folderPath } from "../src/core/catalogFolders";
import { matchesCatalogSearch } from "../src/core/catalogProducts";
function fixture() {
  const c = threeCatalogs()[2];
  c.products = Array.from({ length: 4 }, (_, i) => ({
    ...structuredClone(c.products[0]),
    id: "p" + i,
    name: "상품" + i,
    webEvent:
      i === 3
        ? undefined
        : ({
            categoryName: i === 2 ? "리프팅" : "특별 이벤트",
            eventId: i === 2 ? "22" : "11",
            eventName: i === 2 ? "탄력 프로그램" : "10월 행사",
          } as any),
  }));
  return c;
}
it("projects native website category and banner folders while preserving all original IDs and data", () => {
  const c = fixture(),
    before = structuredClone(c),
    v = catalogCategoryView(c, "website");
  expect(v.folderTree?.filter((f) => !f.parentId).map((f) => f.name)).toEqual([
    "특별 이벤트",
    "리프팅",
    "홈페이지 분류 미확인",
  ]);
  expect(v.products).toHaveLength(c.products.length);
  expect(folderPath(v, v.products[0].folderId).map((f) => f.name)).toEqual([
    "특별 이벤트",
    "10월 행사",
  ]);
  expect(inFolder(v, v.products[1], v.folderTree![0].id)).toBe(true);
  expect(inFolder(v, v.products[2], v.folderTree![0].id)).toBe(false);
  expect(matchesCatalogSearch(v, v.products[0], "특별 이벤트", "folder")).toBe(
    true,
  );
  v.products.forEach((p, i) => {
    expect(p.id).toBe(c.products[i].id);
    expect(p.options).toBe(c.products[i].options);
    expect(p.active).toBe(c.products[i].active);
  });
  expect(c).toEqual(before);
  expect(catalogCategoryView(c, "concern")).toBe(c);
  expect(catalogCategoryView(c, "website")).toBe(v);
});
it("leaves beauty and insurance classification intact and refreshes a changed homepage source", () => {
  for (const c of threeCatalogs().slice(0, 2))
    expect(catalogCategoryView(c, "website")).toBe(c);
  const c = fixture(),
    old = catalogCategoryView(c, "website");
  const changed = structuredClone(c);
  changed.products[0].webEvent!.categoryName = "색소/점 레이저";
  const next = catalogCategoryView(changed, "website");
  expect(next).not.toBe(old);
  expect(folderPath(next, next.products[0].folderId)[0].name).toBe(
    "색소/점 레이저",
  );
  expect(folderPath(old, old.products[0].folderId)[0].name).toBe("특별 이벤트");
});

it("automatically reflects category and banner changes from a homepage refresh without changing product identity", async () => {
  const { mergeHomepageCatalog } = await import("../src/core/websiteCatalog");
  const beauty = threeCatalogs()[0];
  const page = {
    id: "10",
    categoryId: "1",
    categoryName: "특별 이벤트",
    name: "이달 행사",
    description: "",
    url: "https://www.grand4.co.kr/clinicPrice/clinicView.php?i=10",
    posterUrls: [],
    period: "",
    offers: [
      {
        id: "1",
        name: "시험 상품",
        description: "",
        price: 10000,
        regularPrice: null,
        discountRate: null,
        priceText: "10,000원",
        tax: "inclusive" as const,
        issues: [],
      },
    ],
  };
  const initial = mergeHomepageCatalog(beauty, undefined, [page]).catalog;
  const first = catalogCategoryView(initial, "website");
  const updated = mergeHomepageCatalog(beauty, initial, [
    { ...page, categoryName: "색소/점 레이저", name: "색소 프로그램" },
  ]).catalog;
  const next = catalogCategoryView(updated, "website");
  expect(next.products[0].id).toBe(first.products[0].id);
  expect(next.products[0].options[0].id).toBe(first.products[0].options[0].id);
  expect(
    folderPath(next, next.products[0].folderId).map((f) => f.name),
  ).toEqual(["색소/점 레이저", "색소 프로그램"]);
  expect(next.folderTree?.some((f) => f.name === "특별 이벤트")).toBe(false);
  expect(initial.products[0].webEvent?.categoryName).toBe("특별 이벤트");
});
