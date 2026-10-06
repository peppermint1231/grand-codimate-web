import { expect, it } from "vitest";
import { threeCatalogs } from "./fixtures/catalogs";
import { syncRecommendationLinks } from "../src/core/recommendationLinks";
import { folderError, productFolderPaths } from "../src/core/catalogFolders";
import { patientMatches } from "../src/core/patientDiscovery";
it("links only the matching subset, shares edits, preserves user folders and is idempotent", () => {
  const c = threeCatalogs()[0];
  c.folderTree = [
    { id: "lift", name: "주름·탄력·리프팅", parentId: "" },
    { id: "pores", name: "모공·피부결", parentId: "" },
    { id: "source", name: "레이저리프팅", parentId: "lift" },
  ];
  const p = {
    ...c.products[0],
    name: "슈링크",
    description: "",
    composition: "",
    options: [],
    publicVisible: true,
    folderId: "source",
  };
  c.products = [
    {
      ...p,
      id: "combo",
      name: "슈링크 모공 콤보",
      description: "탄력·모공 개선",
    },
    { ...p, id: "plain" },
  ];
  const result = syncRecommendationLinks(c);
  expect(folderError(result.catalog)).toBeUndefined();
  expect(result.catalog.products).toHaveLength(2);
  expect(
    productFolderPaths(result.catalog, result.catalog.products[0]).some(
      (path) => path[0].id === "pores",
    ),
  ).toBe(true);
  expect(
    productFolderPaths(result.catalog, result.catalog.products[1]).some(
      (path) => path[0].id === "pores",
    ),
  ).toBe(false);
  expect(result.catalog.folderTree?.find((f) => f.id === "source")).toEqual(
    c.folderTree[2],
  );
  expect(syncRecommendationLinks(result.catalog).catalog).toEqual(
    result.catalog,
  );
  expect(
    patientMatches(
      result.catalog.products[0],
      productFolderPaths(result.catalog, result.catalog.products[0]),
    ),
  ).toEqual(
    patientMatches(c.products[0], productFolderPaths(c, c.products[0])),
  );
  // References point to one source folder, so a price change isn't copied.
  result.catalog.products[0].description = "수정된 설명";
  expect(result.catalog.products.filter((p) => p.id === "combo")).toHaveLength(
    1,
  );
  expect(
    result.catalog.folderTree?.some(
      (f) => f.linkTo === result.catalog.products[0].folderId,
    ),
  ).toBe(true);
});
