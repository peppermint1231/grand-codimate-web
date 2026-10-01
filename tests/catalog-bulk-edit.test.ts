import { expect, it } from "vitest";
import {
  bulkEditCatalogProducts,
  bulkEditCatalogProductsResult,
  needsProductReview,
} from "../src/core/catalogProducts";
import { catalogChanges } from "../src/core/catalogHistory";
import { applyCommand } from "../src/core/domain";
import { publicProducts } from "../src/core/discovery";
import { emptyState } from "../src/core/model";
import { threeCatalogs, catalogAdmin } from "./fixtures/catalogs";

it("applies all options in selected products only, preserving prices, sale status, source evidence and original history", () => {
  const c = threeCatalogs()[0];
  c.status = "draft";
  c.products.push({ ...structuredClone(c.products[0]), id: "untouched" });
  c.products[0].active = false;
  c.products[0].options.push({
    ...c.products[0].options[0],
    id: "second",
    tax: "unknown",
    review: true,
  });
  const before = structuredClone(c);
  const next = bulkEditCatalogProducts(
    c,
    [c.products[0].id, c.products[0].id],
    { tax: "inclusive", publicVisible: false, completeReview: true },
  );
  expect(c).toEqual(before);
  expect(next.products[1]).toBe(c.products[1]);
  expect(
    next.products[0].options.every((o) => o.tax === "inclusive" && !o.review),
  ).toBe(true);
  expect(
    next.products[0].options.map((o) => [o.price, o.issues, o.sources]),
  ).toEqual(c.products[0].options.map((o) => [o.price, o.issues, o.sources]));
  expect(next.products[0].active).toBe(false);
  expect(next.products[0].publicVisible).toBe(false);
  expect(catalogChanges(c, next).join("\n")).not.toContain("검토완료");
  expect(catalogChanges(c, next).join("\n")).toContain("부가세:");
  expect(catalogChanges(c, next).join("\n")).toContain("추천기 공개:");
});
it("does not silently clear review or change tax when changing recommendation visibility only", () => {
  const c = threeCatalogs()[0];
  c.status = "draft";
  c.products[0].options[0].review = true;
  const next = bulkEditCatalogProducts(c, [c.products[0].id], {
    publicVisible: false,
  });
  expect(next.products[0].options).toEqual(c.products[0].options);
  expect(next.products[0].publicVisible).toBe(false);
  expect(
    bulkEditCatalogProducts(next, [c.products[0].id], { publicVisible: true })
      .products[0].publicVisible,
  ).toBe(true);
});
it("applies valid products and preserves invalid products with actionable reasons for each failure", () => {
  for (const kind of [
    "empty",
    "null",
    "negative",
    "fraction",
    "label",
    "tax",
  ]) {
    const c = threeCatalogs()[0];
    c.status = "draft";
    const invalid = structuredClone(c.products[0]);
    invalid.id = "invalid";
    invalid.name = "확인할 상품";
    if (kind === "empty") invalid.options = [];
    else if (kind === "label") invalid.options[0].label = " ";
    else if (kind === "tax") invalid.options[0].tax = "unknown";
    else
      invalid.options[0].price =
        kind === "null" ? null : kind === "negative" ? -1 : 0.5;
    c.products.push(invalid);
    const before = structuredClone(c);
    c.products[0].options[0].review = true;
    const result = bulkEditCatalogProductsResult(
      c,
      c.products.map((p) => p.id),
      { publicVisible: false, completeReview: true },
    );
    expect(result.appliedIds).toEqual([c.products[0].id]);
    expect(result.skipped).toMatchObject([
      { id: "invalid", name: "확인할 상품" },
    ]);
    expect(result.skipped[0].reasons.length).toBeGreaterThan(0);
    expect(result.catalog.products[0].options[0].review).toBe(false);
    expect(result.catalog.products[1]).toBe(invalid);
    c.products[0].options[0].review = before.products[0].options[0].review;
    expect(c).toEqual(before);
  }
});
it("requires a draft and permits zero-priced options once VAT is confirmed in the same batch", () => {
  const c = threeCatalogs()[0];
  expect(() =>
    bulkEditCatalogProducts(c, [c.products[0].id], { tax: "exempt" }),
  ).toThrow("초안");
  c.status = "draft";
  c.products[0].options[0] = {
    ...c.products[0].options[0],
    price: 0,
    tax: "unknown",
    review: true,
  };
  const next = bulkEditCatalogProducts(c, [c.products[0].id], {
    tax: "exempt",
    completeReview: true,
  });
  expect(next.products[0].options[0]).toMatchObject({
    price: 0,
    tax: "exempt",
    review: false,
  });
});
it("saves and publishes each book through existing permission and revision gates, exposing changes to discovery only after publication", async () => {
  for (const published of threeCatalogs()) {
    let s = emptyState();
    s.catalogs = [published];
    const draft = {
      ...structuredClone(published),
      id: "new-draft",
      status: "draft" as const,
    };
    const next = bulkEditCatalogProducts(draft, [draft.products[0].id], {
      tax: "inclusive",
      publicVisible: false,
      completeReview: true,
    });
    const save = {
      id: crypto.randomUUID(),
      type: "catalog.save",
      entityId: draft.id,
      payload: { catalog: next },
    };
    await expect(
      applyCommand(
        s,
        { ...catalogAdmin, role: "coordinator", permissionLevel: "standard" },
        save,
      ),
    ).rejects.toThrow();
    s = await applyCommand(s, catalogAdmin, save);
    expect(publicProducts(s)).toHaveLength(1);
    s = await applyCommand(s, catalogAdmin, {
      id: crypto.randomUUID(),
      type: "catalog.publish",
      entityId: draft.id,
      baseRev: 1,
      payload: {},
    });
    expect(publicProducts(s)).toHaveLength(0);
    expect(
      s.catalogRevisions.some((r) =>
        r.changes.some((c) => c.includes("추천기 공개")),
      ),
    ).toBe(true);
  }
});

it("selects only unresolved products, including unknown tax, missing options and invalid prices", () => {
  const c = threeCatalogs()[0];
  const reviewed = c.products[0];
  const waiting = {
    ...reviewed,
    id: "waiting",
    options: reviewed.options.map((o) => ({ ...o, review: true })),
  };
  const unknown = {
    ...reviewed,
    id: "unknown",
    options: reviewed.options.map((o) => ({ ...o, tax: "unknown" as const })),
  };
  const empty = { ...reviewed, id: "empty", options: [] };
  expect(
    [reviewed, waiting, unknown, empty]
      .filter(needsProductReview)
      .map((p) => p.id),
  ).toEqual(["unknown", "empty"]);
});
it("retains completed products on a second failed batch and allows remaining items to be completed after correction", () => {
  const c = threeCatalogs()[0];
  c.status = "draft";
  c.products[0].options[0].review = true;
  c.products.push({
    ...structuredClone(c.products[0]),
    id: "unknown",
    options: [
      { ...c.products[0].options[0], id: "other-option", tax: "unknown" },
    ],
  });
  const first = bulkEditCatalogProductsResult(
    c,
    c.products.map((p) => p.id),
    { completeReview: true },
  );
  const second = bulkEditCatalogProductsResult(
    first.catalog,
    first.skipped.map((p) => p.id),
    { completeReview: true },
  );
  expect(second.appliedIds).toEqual([]);
  expect(second.catalog).toEqual(first.catalog);
  const fixed = bulkEditCatalogProductsResult(second.catalog, ["unknown"], {
    tax: "inclusive",
    completeReview: true,
  });
  expect(fixed.skipped).toEqual([]);
  expect(fixed.catalog.products.every((p) => !needsProductReview(p))).toBe(
    true,
  );
});
