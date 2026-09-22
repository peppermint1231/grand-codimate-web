import { it, expect } from "vitest";
import { threeCatalogs, catalogAdmin } from "./fixtures/catalogs";
import { emptyState, latestCatalog } from "../src/core/model";
import {
  addFolder,
  addFolderLink,
  catalogNodes,
  deleteFolder,
  dependentLinks,
  displayFolderNodes,
  editableTree,
  folderError,
  inFolder,
  moveProducts,
  productFolderPaths,
  renameFolder,
  sourceFolderId,
  transferFolder,
} from "../src/core/catalogFolders";
import { publicProducts } from "../src/core/discovery";
import { applyCommand } from "../src/core/domain";
import { catalogChanges } from "../src/core/catalogHistory";
function fixture() {
  const c = editableTree(threeCatalogs()[0]);
  c.folderTree = [
    { id: "a", parentId: "", name: "피부" },
    { id: "b", parentId: "", name: "리프팅" },
    { id: "x", parentId: "a", name: "공통 시술" },
    { id: "xx", parentId: "x", name: "세부" },
  ];
  c.products[0].folderId = "xx";
  return c;
}
it("shares one original product across multiple shortcuts and resolves expandable linked children", () => {
  let c = fixture();
  const before = structuredClone(c);
  const first = addFolderLink(c, "x", "b");
  c = first.catalog;
  const second = addFolderLink(c, first.id, "b");
  c = second.catalog;
  expect(c.products).toEqual(before.products);
  expect(c.folderTree).toHaveLength(6);
  expect(catalogNodes(c).find((f) => f.id === second.id)?.linkTo).toBe("x");
  expect(sourceFolderId(c, first.id + "~xx")).toBe("xx");
  expect(inFolder(c, c.products[0], "b")).toBe(true);
  expect(inFolder(c, c.products[0], second.id)).toBe(true);
  expect(productFolderPaths(c, c.products[0])).toHaveLength(3);
  expect(before.folderTree).toHaveLength(4);
  const state = emptyState();
  state.catalogs = [c];
  const items = publicProducts(state);
  expect(items).toHaveLength(1);
  expect(items[0].folders).toHaveLength(3);
  expect(items[0].folders!.some((p) => p[0].id === "b")).toBe(true);
});
it("synchronizes original name, color, new subfolders and prices without changing link identities", () => {
  const link = addFolderLink(fixture(), "x", "b");
  let c = renameFolder(link.catalog, "x", "공통 관리", "#a04d61");
  c = addFolder(c, "x", "추가 옵션").catalog;
  c = {
    ...c,
    products: c.products.map((p) => ({
      ...p,
      name: "변경된 상품",
      options: p.options.map((o) => ({ ...o, price: 27000 })),
    })),
  };
  expect(catalogNodes(c).find((f) => f.id === link.id)).toMatchObject({
    name: "공통 관리",
    color: "#a04d61",
    linkTo: "x",
  });
  expect(
    displayFolderNodes(c).filter((f) => f.parentId === link.id),
  ).toHaveLength(2);
  const moved = moveProducts(c, [c.products[0].id], link.id);
  expect(moved.products[0].folderId).toBe("x");
  expect(moved.products[0].options[0].price).toBe(27000);
  expect(() => renameFolder(c, link.id, "별칭")).toThrow("원본");
});
it("removes only shortcut references when deleting a link and reports external dependants before original deletion", () => {
  const link = addFolderLink(fixture(), "x", "b");
  const link2 = addFolderLink(link.catalog, "xx", "b");
  expect(deleteFolder(link2.catalog, link.id).products).toEqual(
    link2.catalog.products,
  );
  expect(dependentLinks(link2.catalog, "x")).toHaveLength(2);
  const deleted = deleteFolder(link2.catalog, "x");
  expect(deleted.products).toHaveLength(0);
  expect(catalogNodes(deleted).map((f) => f.id)).toEqual(["a", "b"]);
});
it("rejects cyclic, indirect cyclic, dangling and overdeep links and raw products stored on shortcuts", () => {
  const c = fixture();
  expect(() => addFolderLink(c, "x", "xx")).toThrow("순환");
  const link = addFolderLink(c, "a", "b");
  expect(() => addFolderLink(link.catalog, "b", "a")).toThrow("순환");
  let bad = structuredClone(c);
  bad.folderTree!.push({
    id: "bad",
    parentId: "b",
    name: "링크",
    linkTo: "missing",
  });
  expect(folderError(bad)).toContain("원본");
  bad = addFolderLink(c, "x", "b").catalog;
  bad.products[0].folderId = bad.folderTree!.at(-1)!.id;
  expect(folderError(bad)).toContain("원본 폴더에 저장");
  const extra = addFolder(c, "b", "하위");
  const deep = addFolder(extra.catalog, extra.id, "또 하위");
  expect(() => addFolderLink(deep.catalog, "x", deep.id)).toThrow("3단계");
});
it("keeps links attached across original moves and merges and remaps references when copying an entire shared tree", () => {
  let c = fixture();
  c.folderTree!.push({ id: "y", parentId: "b", name: "공통 시술" });
  const link = addFolderLink(c, "x", "");
  c = transferFolder(link.catalog, "x", "b", { policy: "merge" });
  expect(catalogNodes(c).find((f) => f.id === link.id)?.linkTo).toBe("y");
  expect(inFolder(c, c.products[0], link.id)).toBe(true);
  const source = addFolderLink(fixture(), "xx", "x").catalog;
  const copied = transferFolder(source, "x", "b", { copy: true });
  const copiedRoot = catalogNodes(copied).find(
    (f) => f.parentId === "b" && !f.linkTo,
  )!;
  const copiedChildren = catalogNodes(copied).filter(
    (f) => f.parentId === copiedRoot.id,
  );
  const copiedLink = copiedChildren.find((f) => f.linkTo)!;
  expect(copiedLink.linkTo).toBe(copiedChildren.find((f) => !f.linkTo)!.id);
  expect(copied.products).toHaveLength(2);
});
it("validates links on the server, preserves them in saved revisions and restores the original snapshot", async () => {
  let state = emptyState();
  const c = fixture();
  state.catalogs = [c];
  const linked = addFolderLink(c, "x", "b");
  state = await applyCommand(
    state,
    catalogAdmin,
    {
      id: "link-save",
      type: "catalog.folders.commit",
      entityId: c.id,
      baseRev: c.rev,
      payload: { catalog: linked.catalog, basePublishedId: c.id },
    },
    "2026-09-22T01:00:00Z",
  );
  const posted = latestCatalog(state)!;
  expect(inFolder(posted, posted.products[0], "b")).toBe(true);
  expect(catalogChanges(c, posted).join(" ")).toContain("폴더 링크 생성");
  const invalid = structuredClone(posted);
  invalid.folderTree!.find((f) => f.linkTo)!.linkTo = "b";
  await expect(
    applyCommand(state, catalogAdmin, {
      id: "invalid-link",
      type: "catalog.folders.commit",
      entityId: posted.id,
      baseRev: posted.rev,
      payload: { catalog: invalid, basePublishedId: posted.id },
    }),
  ).rejects.toThrow("순환");
  state = await applyCommand(
    state,
    catalogAdmin,
    {
      id: "link-restore",
      type: "catalog.restore",
      entityId: posted.id,
      baseRev: posted.rev,
      payload: { revisionId: "link-save-before", basePublishedId: posted.id },
    },
    "2026-09-22T02:00:00Z",
  );
  expect(latestCatalog(state)!.folderTree).toEqual(c.folderTree);
  expect(state.catalogs.find((x) => x.id === posted.id)!.folderTree).toEqual(
    posted.folderTree,
  );
});
