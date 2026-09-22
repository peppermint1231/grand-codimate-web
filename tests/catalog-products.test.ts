import { expect, it } from "vitest";
import {
  matchesCatalogSearch,
  deleteCatalogProducts,
} from "../src/core/catalogProducts";
import { catalogChanges } from "../src/core/catalogHistory";
import { inFolder } from "../src/core/catalogFolders";
import { commandMatches } from "../src/lib/catalogShortcuts";
import { threeCatalogs } from "./fixtures/catalogs";
function fixture() {
  const catalog = threeCatalogs()[0];
  catalog.status = "draft";
  catalog.folderTree = [
    { id: "r", name: "탄력", parentId: "" },
    { id: "f", name: "기본 관리", parentId: "r" },
    { id: "alias-root", name: "추천 시술", parentId: "" },
    { id: "link", name: "ignored", parentId: "alias-root", linkTo: "f" },
  ];
  catalog.products[0] = {
    ...catalog.products[0],
    folderId: "f",
    name: "슈링크 300샷",
    description: "설명 전용 단어",
    composition: "구성 전용 단어",
  };
  catalog.products.push({
    ...catalog.products[0],
    id: "second",
    name: "피부 진정",
  });
  return catalog;
}
it("defaults to folder OR product names, including ancestors and linked paths, with Korean spacing/case normalization", () => {
  const c = fixture(),
    p = c.products[0];
  for (const query of [
    "탄력",
    "기본관리",
    "추천 시술",
    "탄력 기본 관리",
    "슈링크300샷",
    "　슈링크 ",
  ])
    expect(matchesCatalogSearch(c, p, query)).toBe(true);
  expect(matchesCatalogSearch(c, p, "설명 전용")).toBe(false);
  expect(matchesCatalogSearch(c, { ...p, name: "EVENT 리프팅" }, "event")).toBe(
    true,
  );
  expect(matchesCatalogSearch(c, p, "   ", "folder")).toBe(true);
});
it("limits search to the selected name field without confusing product, description or option text with folders", () => {
  const c = fixture(),
    p = c.products[0];
  expect(matchesCatalogSearch(c, p, "슈링크", "folder")).toBe(false);
  expect(matchesCatalogSearch(c, p, "탄력", "product")).toBe(false);
  expect(matchesCatalogSearch(c, p, "기본 관리", "folder")).toBe(true);
  expect(matchesCatalogSearch(c, p, "슈링크", "product")).toBe(true);
  expect(matchesCatalogSearch(c, p, "설명 전용 단어", "product")).toBe(false);
});
it("deletes only selected IDs and their options across linked folders without mutating the original or folders, records named history", () => {
  const c = fixture(),
    before = structuredClone(c),
    p = c.products[0];
  expect(inFolder(c, p, "link")).toBe(true);
  const next = deleteCatalogProducts(c, [p.id, p.id, "missing"]);
  expect(next.products.map((p) => p.id)).toEqual(["second"]);
  expect(next.folderTree).toBe(c.folderTree);
  expect(c).toEqual(before);
  expect(catalogChanges(c, next)).toContain("상품 삭제: 슈링크 300샷");
  expect(
    deleteCatalogProducts(
      c,
      c.products.map((p) => p.id),
    ).products,
  ).toEqual([]);
  expect(() =>
    deleteCatalogProducts({ ...c, status: "published" }, [p.id]),
  ).toThrow("초안");
});
it("matches deletion shortcuts only with unmodified Delete in each product scope", () => {
  const e = {
    code: "Delete",
    key: "Delete",
    ctrlKey: false,
    metaKey: false,
    altKey: false,
    shiftKey: false,
  };
  for (const id of ["productsDelete", "productDelete"] as const) {
    expect(commandMatches(e, id)).toBe(true);
    expect(commandMatches({ ...e, ctrlKey: true }, id)).toBe(false);
    expect(
      commandMatches({ ...e, code: "Backspace", key: "Backspace" }, id),
    ).toBe(false);
  }
});
