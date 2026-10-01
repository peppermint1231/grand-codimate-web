import { it, expect } from "vitest";
import { threeCatalogs, catalogAdmin } from "./fixtures/catalogs";
import {
  productReviewIssues,
  bulkEditCatalogProductsResult,
  matchesCatalogProductFilter,
} from "../src/core/catalogProducts";
import { applyCommand } from "../src/core/domain";
import { catalogApplyGuard } from "../src/core/catalogApply";
import { emptyState } from "../src/core/model";
import { mergeHomepageCatalog } from "../src/core/websiteCatalog";
import { parseWebsiteEvent } from "../server/eventCatalog";
import { eventDetail } from "./fixtures/websiteEvents";

it("distinguishes missing fixed prices, consultation prices, unknown VAT and no options", () => {
  const p = threeCatalogs()[0].products[0];
  p.options[0].price = null;
  expect(productReviewIssues(p)).toContain("기본: 가격 미확정 또는 범위 오류");
  p.options[0].priceKind = "quote";
  expect(productReviewIssues(p)).toEqual([]);
  expect(matchesCatalogProductFilter(p, "missing")).toBe(false);
  p.options[0].tax = "unknown";
  expect(productReviewIssues(p)).toEqual(["기본: 부가세 확인 필요"]);
  p.options = [];
  expect(productReviewIssues(p)).toEqual(["옵션 없음"]);
});
it("bulk quote mode can activate with a tax decision without inventing membership options", async () => {
  const c = threeCatalogs()[0];
  c.status = "draft";
  const p = c.products[0];
  p.active = false;
  Object.assign(p.options[0], {
    price: null,
    regularPrice: 10000,
    tax: "unknown",
  });
  c.products.push({ ...p, id: "membership", name: "멤버십 안내", options: [] });
  const result = bulkEditCatalogProductsResult(c, [p.id, "membership"], {
    priceKind: "quote",
    tax: "exclusive",
    active: true,
  });
  expect(result.appliedIds).toEqual([p.id]);
  expect(result.skipped[0].reasons).toEqual(["옵션 없음"]);
  expect(result.catalog.products[0].options[0]).toMatchObject({
    price: null,
    priceKind: "quote",
    tax: "exclusive",
  });
  expect(result.catalog.products[0].options[0].regularPrice).toBeUndefined();
  const s = emptyState();
  s.users = [catalogAdmin];
  s.catalogs = [c];
  const saved = await applyCommand(s, catalogAdmin, {
    id: crypto.randomUUID(),
    type: "catalog.apply",
    entityId: c.id,
    baseRev: c.rev,
    payload: { catalog: result.catalog, guard: catalogApplyGuard(s, c.book!) },
  });
  expect(
    saved.catalogs.some(
      (x) => x.status === "published" && x.products[0].active,
    ),
  ).toBe(true);
});
it("does not clear an explicit quote mode on an unchanged homepage refresh", () => {
  const e = parseWebsiteEvent(eventDetail("80,000원", ""), "101", "20");
  e.offers[0].price = null;
  e.offers[0].priceText = "진료 후 결정";
  e.offers = [e.offers[0]];
  const first = mergeHomepageCatalog(threeCatalogs()[0], undefined, [
    e,
  ]).catalog;
  const p = first.products[0];
  p.active = true;
  p.options[0].priceKind = "quote";
  p.options[0].review = false;
  const refreshed = mergeHomepageCatalog(threeCatalogs()[0], first, [e]);
  expect(refreshed.summary.unchanged).toBe(1);
  expect(refreshed.catalog.products[0]).toMatchObject({
    active: true,
    options: [{ priceKind: "quote", price: null }],
  });
  e.offers[0].price = 99000;
  const changed = mergeHomepageCatalog(threeCatalogs()[0], first, [e]);
  expect(changed.catalog.products[0].active).toBe(false);
  expect(changed.catalog.products[0].options[0].priceKind).not.toBe("quote");
});
