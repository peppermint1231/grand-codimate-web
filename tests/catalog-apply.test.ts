import { expect, it } from "vitest";
import { applyCommand } from "../src/core/domain";
import { catalogApplyGuard } from "../src/core/catalogApply";
import { emptyState, latestCatalog } from "../src/core/model";
import { matchesCatalogProductFilter } from "../src/core/catalogProducts";
import { catalogAdmin, threeCatalogs } from "./fixtures/catalogs";
function setup() {
  const s = emptyState();
  s.catalogs = threeCatalogs();
  const c = structuredClone(s.catalogs[0]);
  c.status = "draft";
  const cmd = {
    id: crypto.randomUUID(),
    type: "catalog.apply",
    payload: { catalog: c, guard: catalogApplyGuard(s, c.book!) },
  };
  return { s, c, cmd };
}
it("saves and applies sales state atomically, preserving old versions and other books", async () => {
  const { s, c, cmd } = setup();
  const before = structuredClone(s);
  c.products[0].active = false;
  const next = await applyCommand(s, catalogAdmin, cmd);
  expect(next.catalogs).toHaveLength(4);
  expect(next.catalogs.slice(0, 3)).toEqual(before.catalogs);
  expect(latestCatalog(next, c.book!)?.products[0].active).toBe(false);
  expect(latestCatalog(next, c.book!)?.id).toBe(cmd.id);
  expect(next.catalogRevisions.at(-1)?.changes.join(" ")).toContain("판매");
  expect(s).toEqual(before);
});
it("rejects stale saves after either a publication or an edit, and enforces permissions", async () => {
  const { s, c, cmd } = setup();
  const changed = structuredClone(s);
  changed.catalogs[0].rev++;
  await expect(applyCommand(changed, catalogAdmin, cmd)).rejects.toThrow(
    "다른 기기",
  );
  const next = await applyCommand(s, catalogAdmin, cmd);
  await expect(
    applyCommand(next, catalogAdmin, { ...cmd, id: crypto.randomUUID() }),
  ).rejects.toThrow("다른 기기");
  await expect(
    applyCommand(
      s,
      {
        ...catalogAdmin,
        role: "coordinator",
        permissionLevel: "general",
        permissions: { "catalog.edit": false },
      } as any,
      cmd,
    ),
  ).rejects.toThrow();
  expect(c.status).toBe("draft");
});
it("blocks incomplete active items without saving anything; permits keeping them inactive", async () => {
  const { s, c, cmd } = setup();
  c.products[0].options[0].price = null;
  await expect(applyCommand(s, catalogAdmin, cmd)).rejects.toThrow(
    "입력을 확인",
  );
  expect(s.catalogs).toHaveLength(3);
  c.products[0].active = false;
  const next = await applyCommand(s, catalogAdmin, cmd);
  expect(latestCatalog(next, c.book!)?.products[0].options[0].price).toBeNull();
});
it("ignores the obsolete review flag and still finds missing options and tax", () => {
  const p = threeCatalogs()[0].products[0];
  expect(matchesCatalogProductFilter(p, "active")).toBe(true);
  expect(matchesCatalogProductFilter(p, "unreviewed")).toBe(false);
  p.active = false;
  p.options[0].review = true;
  expect(matchesCatalogProductFilter(p, "inactive")).toBe(true);
  expect(matchesCatalogProductFilter(p, "unreviewed")).toBe(false);
  p.options[0].review = false;
  p.options[0].tax = "unknown";
  expect(matchesCatalogProductFilter(p, "tax")).toBe(true);
  expect(matchesCatalogProductFilter(p, "unreviewed")).toBe(true);
  p.options = [];
  expect(matchesCatalogProductFilter(p, "missing")).toBe(true);
  expect(matchesCatalogProductFilter(p, "unreviewed")).toBe(true);
});

it("activation is the review decision even with legacy option review flags", async () => {
  const { s, c, cmd } = setup();
  c.products[0].options[0].review = true;
  const after = await applyCommand(s, catalogAdmin, cmd);
  expect(latestCatalog(after, c.book!)!.products[0].active).toBe(true);
  expect(latestCatalog(after, c.book!)!.products[0].options[0].review).toBe(
    false,
  );
});
