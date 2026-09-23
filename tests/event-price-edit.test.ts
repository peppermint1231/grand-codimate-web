import { expect, it } from "vitest";
import { eventOptionPrices } from "../src/core/eventPrices";
import { mergeWebsiteEvents } from "../src/core/eventCatalog";
import { parseWebsiteEvent } from "../server/eventCatalog";
import { eventDetail } from "./fixtures/websiteEvents";
import { threeCatalogs, catalogAdmin } from "./fixtures/catalogs";
import { validateCatalog, applyCommand } from "../src/core/domain";
import { emptyState } from "../src/core/model";
import { publicProducts } from "../src/core/discovery";
import { catalogChanges } from "../src/core/catalogHistory";
const now = "2026-09-23T00:00:00Z";
it("keeps website evidence unchanged while manually overriding or clearing the regular price and calculating discount from the current sale price", () => {
  const c = mergeWebsiteEvents(
    undefined,
    [parseWebsiteEvent(eventDetail(), "101", "20")],
    now,
  ).catalog;
  const p = c.products[0],
    o = p.options[0],
    original = structuredClone(p.webEvent);
  expect(eventOptionPrices(p, o).regularPrice).toBe(p.webEvent!.regularPrice);
  o.regularPrice = 200000;
  o.price = 150000;
  expect(eventOptionPrices(p, o)).toEqual({
    regularPrice: 200000,
    salePrice: 150000,
    discountRate: 25,
  });
  expect(p.webEvent).toEqual(original);
  o.regularPrice = null;
  expect(eventOptionPrices(p, o).regularPrice).toBeNull();
  o.regularPrice = 0;
  expect(eventOptionPrices(p, o).discountRate).toBeNull();
  o.regularPrice = 100000;
  expect(eventOptionPrices(p, o).discountRate).toBeNull();
  o.price = 0;
  expect(eventOptionPrices(p, o).discountRate).toBe(100);
});
it("retains manually edited regular prices across website refreshes while keeping updated origin data separate", () => {
  const event = parseWebsiteEvent(eventDetail(), "101", "20");
  let c = mergeWebsiteEvents(undefined, [event], now).catalog;
  c.products[0].options[0].regularPrice = 222000;
  c = mergeWebsiteEvents(c, [event], now).catalog;
  expect(c.products[0].options[0].regularPrice).toBe(222000);
  event.offers[0].regularPrice = 999000;
  c = mergeWebsiteEvents(c, [event], now).catalog;
  expect(c.products[0].options[0].regularPrice).toBe(222000);
  expect(c.products[0].webEvent!.regularPrice).toBe(999000);
});
it("validates regular prices and saves, histories and publishes them for discovery without exposing unreviewed prices", async () => {
  let s = emptyState();
  const c = threeCatalogs()[2];
  c.status = "draft";
  const old = structuredClone(c);
  c.products[0].options[0].regularPrice = 20000;
  c.products[0].options[0].price = 5000;
  expect(catalogChanges(old, c).join("\n")).toContain("이벤트 정가:");
  for (const invalid of [-1, 0.5, Infinity, NaN]) {
    const bad = structuredClone(c);
    bad.products[0].options[0].regularPrice = invalid;
    expect(() => validateCatalog(bad)).toThrow();
  }
  s = await applyCommand(
    s,
    catalogAdmin,
    {
      id: crypto.randomUUID(),
      type: "catalog.save",
      entityId: c.id,
      payload: { catalog: c },
    },
    now,
  );
  expect(publicProducts(s)).toHaveLength(0);
  s = await applyCommand(
    s,
    catalogAdmin,
    {
      id: crypto.randomUUID(),
      type: "catalog.publish",
      entityId: c.id,
      baseRev: 1,
      payload: {},
    },
    now,
  );
  expect(publicProducts(s)[0].event).toMatchObject({
    regularPrice: 20000,
    salePrice: 5000,
    discountRate: 75,
  });
  s.catalogs[0].products[0].options[0].review = true;
  expect(publicProducts(s)[0].event).toBeUndefined();
  expect(publicProducts(s)[0].options[0].event).toBeUndefined();
});
it("uses each option’s own regular price for multi-option events", () => {
  const c = threeCatalogs()[2];
  const p = c.products[0];
  p.options[0].regularPrice = 10000;
  p.options.push({
    ...p.options[0],
    id: "extra",
    regularPrice: 20000,
    price: 10000,
  });
  const s = { ...emptyState(), catalogs: [c] };
  const result = publicProducts(s)[0];
  expect(result.event).toBeUndefined();
  expect(result.options.map((o) => o.event?.discountRate)).toEqual([20, 50]);
});
