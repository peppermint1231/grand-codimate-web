import { it, expect } from "vitest";
import { expandHospitalInsurancePrices } from "../src/core/insuranceCatalogExpansion";
import { addHospitalInsurancePrices } from "../src/core/insuranceCatalog";
import { threeCatalogs } from "./fixtures/catalogs";
import { validateCatalog, calculate } from "../src/core/domain";
import { catalogRegularPrice } from "../src/core/quotePrices";
const base = () => addHospitalInsurancePrices(threeCatalogs()[1]);
const policy = { tax: "inclusive" as const, zosterPerVisit: true };
it("adds six products, two one-foot options, and reuses debridement without overwriting manual products", () => {
  const before = base(),
    original = structuredClone(before);
  const c = expandHospitalInsurancePrices(before, policy);
  expect(c.products).toHaveLength(before.products.length + 6);
  expect(c.products[0]).toEqual(before.products[0]);
  expect(before).toEqual(original);
  const added = c.products.filter((p) =>
    p.id.startsWith("hospital-insurance-"),
  );
  expect(added).toHaveLength(6);
  expect(
    added.every(
      (p) =>
        p.active &&
        p.insurance?.coverage === "noncovered" &&
        p.insurance.reimbursement === "eligible" &&
        p.options.every((o) => o.tax === "inclusive" && !o.review),
    ),
  ).toBe(true);
  expect(added.flatMap((p) => p.options).map((o) => o.price)).toEqual([
    105000, 567000, 892500, 95000, 513000, 807500, 80000, 90000, 40000, 48000,
  ]);
  const laser = c.products.filter((p) =>
    ["hospital-nail-basic", "hospital-nail-premium"].includes(p.id),
  );
  expect(laser.map((p) => p.options.at(-1)?.price)).toEqual([720000, 900000]);
  expect(laser.every((p) => p.options[1].label.includes("양발"))).toBe(true);
  expect(laser.every((p) => p.options.at(-1)?.tax === "inclusive")).toBe(true);
  expect(c.products.filter((p) => p.name === "발톱무좀 제균")).toHaveLength(1);
  expect(
    c.products.find((p) => p.name === "발톱무좀 제균")!.options[0],
  ).toMatchObject({ price: 50000, tax: "inclusive" });
  validateCatalog(c, true);
  expect(expandHospitalInsurancePrices(c, policy).products).toEqual(c.products);
});
it("uses whole-package prices in a quote and explains the per-visit amounts in the description", () => {
  const c = expandHospitalInsurancePrices(base(), policy);
  const p = c.products.find((p) => p.id === "hospital-insurance-ivnt-zoster")!;
  const o = p.options[2];
  expect(p.description).toContain("회당 80,750원");
  expect(o.label).toBe("10회 패키지");
  expect(o.price).toBe(807500);
  expect(o.regularPrice).toBe(950000);
  const q = calculate(
    [
      {
        id: "line",
        productId: p.id,
        optionId: o.id,
        name: p.name,
        label: o.label,
        price: o.price!,
        regularPrice: catalogRegularPrice(p, o),
        tax: o.tax,
        unit: o.unit,
        quantity: 1,
        discount: { kind: "amount", value: 0 },
      },
    ],
    { kind: "amount", value: 0 },
    "separate",
  );
  expect(q.total).toBe(807500);
});
