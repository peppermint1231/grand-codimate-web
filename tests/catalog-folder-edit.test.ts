import { expect, it } from "vitest";
import {
  editableTree,
  renameFolder,
  transferFolder,
  deleteFolder,
  folderImpact,
  addFolder,
  catalogNodes,
  FolderCollision,
} from "../src/core/catalogFolders";
import { threeCatalogs, catalogAdmin } from "./fixtures/catalogs";
import { emptyState, latestCatalog } from "../src/core/model";
import { applyCommand } from "../src/core/domain";
import { publicCategories, publicProducts } from "../src/core/discovery";
function fixture() {
  const c = editableTree(threeCatalogs()[0]);
  c.folderTree = [
    { id: "a", parentId: "", name: "피부", color: "#155e59" },
    { id: "b", parentId: "", name: "다른 분류" },
    { id: "x", parentId: "a", name: "레이저" },
    { id: "y", parentId: "b", name: "레이저" },
    { id: "xx", parentId: "x", name: "옵션" },
    { id: "yy", parentId: "y", name: "옵션" },
  ];
  c.products = [
    { ...c.products[0], folderId: "xx" },
    {
      ...structuredClone(c.products[0]),
      id: "product-other",
      folderId: "yy",
      options: [{ ...c.products[0].options[0], id: "option-other" }],
    },
  ];
  return c;
}
it("renames root folders with color, changes order and synchronizes public category paths without modifying the input", () => {
  const c = fixture(),
    changed = renameFolder(c, "a", "피부 고민", "#ff8800");
  const ordered = transferFolder(changed, "b", "", { beforeId: "a" });
  expect(
    catalogNodes(ordered)
      .filter((f) => !f.parentId)
      .map((f) => f.id),
  ).toEqual(["b", "a"]);
  const s = emptyState();
  s.catalogs = [ordered];
  expect(publicCategories(s).find((f) => f.folderId === "a")).toMatchObject({
    name: "피부 고민",
    color: "#ff8800",
  });
  expect(publicProducts(s)[0].folder[0].name).toBe("피부 고민");
  expect(c.folderTree![0].name).toBe("피부");
  expect(() => renameFolder(c, "a", "다른 분류", "#ff8800")).toThrow(
    "같은 이름",
  );
  expect(() => renameFolder(c, "a", "피부", "red")).toThrow("색상");
});
it("requires a collision decision and recursively merges folders without losing either set of products", () => {
  const c = fixture();
  expect(() => transferFolder(c, "x", "b")).toThrow(FolderCollision);
  const merged = transferFolder(c, "x", "b", { policy: "merge" });
  expect(merged.products).toHaveLength(2);
  expect(merged.products.map((p) => p.folderId)).toEqual(["yy", "yy"]);
  expect(catalogNodes(merged).some((f) => f.id === "x" || f.id === "xx")).toBe(
    false,
  );
  expect(catalogNodes(c)).toHaveLength(6);
});
it("overwrites only the conflicting subtree and reports deletion impact", () => {
  const c = fixture();
  expect(folderImpact(c, "y")).toEqual({ folders: 2, products: 1 });
  const replaced = transferFolder(c, "x", "b", { policy: "replace" });
  expect(replaced.products).toHaveLength(1);
  expect(replaced.products[0].id).toBe("product-0");
  expect(catalogNodes(replaced).find((f) => f.id === "x")?.parentId).toBe("b");
  const deleted = deleteFolder(c, "a");
  expect(deleted.products.map((p) => p.id)).toEqual(["product-other"]);
});
it("copies a subtree with new folder/product/option identities and prevents cycles and depth overflow", () => {
  const c = fixture();
  const copied = transferFolder(c, "x", "", { copy: true });
  expect(copied.products).toHaveLength(3);
  const clone = copied.products[2];
  expect(clone.id).not.toBe(c.products[0].id);
  expect(clone.options[0].id).not.toBe(c.products[0].options[0].id);
  expect(clone.active).toBe(false);
  expect(clone.publicVisible).toBe(false);
  expect(() => transferFolder(c, "a", "xx")).toThrow("하위 폴더");
  const deepest = addFolder(c, "xx", "세 번째").catalog;
  expect(() =>
    addFolder(deepest, catalogNodes(deepest).at(-1)!.id, "네 번째"),
  ).toThrow("3단계");
});
it("saves folder edits as one published revision and restores previous contents with a readable audit trail", async () => {
  let s = emptyState();
  s.catalogs = [fixture()];
  const old = structuredClone(s.catalogs[0]);
  const changed = renameFolder(old, "a", "새 고민", "#ff8800");
  s = await applyCommand(s, catalogAdmin, {
    id: "folder-operation",
    type: "catalog.folders.commit",
    entityId: old.id,
    baseRev: old.rev,
    payload: { catalog: changed, basePublishedId: old.id },
  });
  const posted = latestCatalog(s)!;
  expect(posted.id).toBe("folder-operation");
  expect(s.catalogs.find((c) => c.id === old.id)).toEqual(old);
  expect(s.catalogRevisions).toHaveLength(2);
  expect(s.catalogRevisions[1].changes.join(" ")).toContain("피부 → 새 고민");
  expect(s.catalogRevisions[1].changes.join(" ")).toContain("#ff8800");
  s = await applyCommand(
    s,
    catalogAdmin,
    {
      id: "restore-operation",
      type: "catalog.restore",
      entityId: posted.id,
      baseRev: posted.rev,
      payload: {
        revisionId: "folder-operation-before",
        basePublishedId: posted.id,
      },
    },
    "2026-09-22T00:00:00Z",
  );
  expect(latestCatalog(s)!.folderTree).toEqual(old.folderTree);
  expect(s.catalogRevisions.at(-1)!.action).toBe("이전 이력 복원");
  await expect(
    applyCommand(s, catalogAdmin, {
      id: "stale-operation",
      type: "catalog.folders.commit",
      entityId: posted.id,
      baseRev: posted.rev,
      payload: { catalog: changed, basePublishedId: posted.id },
    }),
  ).rejects.toThrow("다른 기기");
});
it("records ordinary price edits and enforces catalog edit permissions", async () => {
  let s = emptyState(),
    c = fixture();
  s.catalogs = [c];
  const draft = {
    ...structuredClone(c),
    id: "new-draft",
    rev: 0,
    status: "draft" as const,
  };
  draft.products[0].options[0].price = 12000;
  s = await applyCommand(s, catalogAdmin, {
    id: "save-operation",
    type: "catalog.save",
    entityId: draft.id,
    payload: { catalog: draft },
  });
  expect(s.catalogRevisions.at(-1)!.changes.join(" ")).toContain(
    "10000 → 12000원",
  );
  await expect(
    applyCommand(
      s,
      { ...catalogAdmin, role: "doctor", permissions: {} },
      {
        id: "denied-operation",
        type: "catalog.folders.commit",
        entityId: c.id,
        baseRev: c.rev,
        payload: { catalog: c, basePublishedId: c.id },
      },
    ),
  ).rejects.toThrow();
});
it("restores an unreviewed draft as a draft without replacing the published catalog", async () => {
  let s = emptyState();
  s.catalogs = [fixture()];
  const original = s.catalogs[0],
    draft = {
      ...structuredClone(original),
      id: "unsafe-draft",
      rev: 0,
      status: "draft" as const,
    };
  draft.products[0].options[0].tax = "unknown";
  s = await applyCommand(s, catalogAdmin, {
    id: "draft-save-command",
    type: "catalog.save",
    entityId: draft.id,
    payload: { catalog: draft },
  });
  s = await applyCommand(s, catalogAdmin, {
    id: "restore-draft-command",
    type: "catalog.restore",
    entityId: original.id,
    baseRev: original.rev,
    payload: { revisionId: "draft-save-command", basePublishedId: original.id },
  });
  expect(latestCatalog(s)?.id).toBe(original.id);
  expect(s.catalogs.find((c) => c.id === "restore-draft-command")?.status).toBe(
    "draft",
  );
  expect(s.catalogRevisions.at(-1)?.action).toBe("초안 이력 복원");
});
