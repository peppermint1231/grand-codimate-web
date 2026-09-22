import { expect, it } from "vitest";
import {
  folderArrowTarget,
  transferFolder,
  folderPath,
  FolderCollision,
  addFolderLink,
} from "../src/core/catalogFolders";
import { commandMatches } from "../src/lib/catalogShortcuts";
import { threeCatalogs } from "./fixtures/catalogs";
function fixture() {
  return {
    ...threeCatalogs()[0],
    products: [],
    folderTree: [
      { id: "a", parentId: "", name: "상위 A" },
      { id: "b", parentId: "", name: "상위 B" },
      { id: "x", parentId: "a", name: "첫째" },
      { id: "y", parentId: "a", name: "둘째" },
      { id: "z", parentId: "y", name: "자식" },
    ],
  };
}
function move(
  c: ReturnType<typeof fixture>,
  id: string,
  d: "up" | "down" | "out" | "in",
) {
  const t = folderArrowTarget(c, id, d)!;
  return transferFolder(c, id, t.parentId, t);
}
it("reorders siblings without changing their parent or subtree, including boundaries", () => {
  const c = fixture();
  const next = move(c, "y", "up");
  expect(
    next.folderTree!.filter((f) => f.parentId === "a").map((f) => f.id),
  ).toEqual(["y", "x"]);
  expect(folderPath(next, "z").map((f) => f.id)).toEqual(["a", "y", "z"]);
  expect(move(c, "x", "down").folderTree).toEqual(next.folderTree);
  expect(folderArrowTarget(c, "x", "up")).toBeUndefined();
  expect(folderArrowTarget(c, "y", "down")).toBeUndefined();
  expect(folderArrowTarget(c, "a", "out")).toBeUndefined();
  expect(c.folderTree[2].id).toBe("x");
});
it("indents into the previous sibling and outdents immediately after the parent", () => {
  const c = fixture(),
    inward = move(c, "y", "in"),
    outward = move(c, "y", "out");
  expect(folderPath(inward, "z").map((f) => f.id)).toEqual([
    "a",
    "x",
    "y",
    "z",
  ]);
  expect(
    outward.folderTree!.filter((f) => !f.parentId).map((f) => f.id),
  ).toEqual(["a", "y", "b"]);
  expect(folderArrowTarget(c, "x", "in")).toBeUndefined();
});
it("preserves depth and collision checks instead of bypassing the existing move algorithm", () => {
  const c = fixture();
  c.folderTree.push({ id: "deep", parentId: "z", name: "깊은 항목" });
  expect(() => move(c, "y", "in")).toThrow(/3단계/);
  const conflict = fixture();
  conflict.folderTree[0].name = "둘째";
  expect(() => move(conflict, "y", "out")).toThrow(FolderCollision);
});
it("moves link nodes but does not treat virtual linked children as movable physical nodes", () => {
  const c = fixture(),
    linked = addFolderLink(c, "y", "b");
  expect(
    folderArrowTarget(linked.catalog, linked.id + "~z", "out"),
  ).toBeUndefined();
  const target = folderArrowTarget(linked.catalog, linked.id, "out")!;
  const next = transferFolder(
    linked.catalog,
    linked.id,
    target.parentId,
    target,
  );
  expect(next.folderTree!.find((f) => f.id === linked.id)).toMatchObject({
    parentId: "",
    linkTo: "y",
  });
});
it("matches physical keys under Korean/Mac layouts and rejects extra modifiers", () => {
  const event = {
    code: "KeyN",
    key: "ㅜ",
    ctrlKey: false,
    metaKey: false,
    shiftKey: false,
    altKey: true,
  };
  expect(commandMatches(event, "folderNew")).toBe(true);
  expect(commandMatches({ ...event, key: "˜" }, "folderNew")).toBe(true);
  expect(commandMatches({ ...event, ctrlKey: true }, "folderNew")).toBe(false);
  expect(
    commandMatches(
      { ...event, code: "KeyA", altKey: false, metaKey: true, shiftKey: true },
      "selectNone",
    ),
  ).toBe(true);
  expect(
    commandMatches(
      { ...event, code: "KeyA", altKey: false, metaKey: true, shiftKey: true },
      "selectAll",
    ),
  ).toBe(false);
});
