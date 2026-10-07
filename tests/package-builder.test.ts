import { it, expect } from "vitest";
import {
  packageBlocks,
  packageTotal,
  packageSale,
  balancePackage,
  packageOption,
  packagePlanSchema,
  type PackagePlan,
} from "../src/core/packageBuilder";
import { threeCatalogs } from "./fixtures/catalogs";
import { formatMobilePhone, formatBirthDate } from "../src/core/phone";
it("formats numeric phone and birth date without accepting extra characters", () => {
  expect(formatMobilePhone("01012345678")).toBe("010-1234-5678");
  expect(formatMobilePhone("010-12")).toBe("010-12");
  expect(formatBirthDate("19850312")).toBe("1985-03-12");
  expect(formatBirthDate("1985-0")).toBe("1985-0");
});
it("offers individual options and normalizes VAT-inclusive blocks to VAT-exclusive pricing", () => {
  const catalogs = threeCatalogs();
  catalogs.forEach((c) => (c.products[0].productType = "block"));
  catalogs[2].products[0].options[0].tax = "inclusive";
  catalogs[2].products[0].options[0].price = 11000;
  const blocks = packageBlocks(catalogs);
  expect(blocks).toHaveLength(3);
  expect(packageTotal(blocks)).toBe(25000);
  catalogs[0].products[0].packageBySession = true;
  catalogs[1].products[0].options[0].price = null;
  expect(packageBlocks(catalogs)).toHaveLength(1);
});
it("balances quantity without losing units and validates manual placement, discounts and snapshots", () => {
  const c = threeCatalogs()[0];
  c.products[0].productType = "block";
  const block = { ...packageBlocks([c])[0], quantity: 5 };
  const plan: PackagePlan = {
    durationDays: 180,
    sessions: 3,
    blocks: [block],
    placements: balancePackage([block], 3),
    discountType: "percent",
    discountValue: 10,
  };
  expect(plan.placements).toHaveLength(5);
  const loads = [1, 2, 3].map(
    (n) => plan.placements.filter((p) => p.session === n).length,
  );
  expect(Math.max(...loads) - Math.min(...loads)).toBeLessThanOrEqual(1);
  expect(packageSale(plan)).toBe(45000);
  const o = packageOption(plan, c.products[0].options[0]);
  expect(o.price).toBe(45000);
  expect(o.regularPrice).toBe(50000);
  expect(o.tax).toBe("exclusive");
  expect(o.packageComposition).toContain("3회차");
  expect(o.packagePlan).toEqual(plan);
  plan.discountType = "amount";
  plan.discountValue = 7500;
  expect(packageSale(plan)).toBe(42500);
  expect(
    packagePlanSchema.safeParse({
      ...plan,
      placements: plan.placements.slice(1),
    }).success,
  ).toBe(false);
  expect(
    packagePlanSchema.safeParse({ ...plan, discountValue: 50001 }).success,
  ).toBe(false);
  expect(
    packagePlanSchema.safeParse({
      ...plan,
      placements: plan.placements.map((p) => ({ ...p, session: 1 })),
    }).success,
  ).toBe(false);
});
it("keeps block type explicit, excludes blocks from discovery and recognizes legacy package and membership tags", async () => {
  const { productType } = await import("../src/core/productType");
  const { publicProducts } = await import("../src/core/discovery");
  const { emptyState } = await import("../src/core/model");
  const c = threeCatalogs()[0],
    p = c.products[0];
  expect(productType(p)).toBe("single");
  expect(packageBlocks([c])).toHaveLength(0);
  p.productType = "block";
  expect(packageBlocks([c])).toHaveLength(1);
  const state = emptyState();
  state.catalogs = [c];
  expect(publicProducts(state)).toHaveLength(0);
  delete p.productType;
  p.offering = { kind: "membership", items: [], terms: "" };
  expect(productType(p)).toBe("membership");
  p.offering = { kind: "package", items: [], terms: "" };
  expect(productType(p)).toBe("package");
});
it("shows the selected total block quantities rather than counting visits as units", async () => {
  const { optionPackageComposition } =
    await import("../src/core/packageSchedule");
  const c = threeCatalogs()[0];
  c.products[0].productType = "block";
  const b = { ...packageBlocks([c])[0], quantity: 3 };
  const p: PackagePlan = {
    durationDays: 30,
    sessions: 2,
    blocks: [b],
    placements: balancePackage([b], 2),
    discountType: "amount",
    discountValue: 0,
  };
  const o = packageOption(p, c.products[0].options[0]);
  expect(optionPackageComposition({ composition: "" }, o)).toContain(
    `${b.name} · 3회`,
  );
});
it("preserves session order through moves and saved patient composition", async () => {
  const { movePackagePlacement } = await import("../src/core/packageBuilder");
  const c = threeCatalogs()[0];
  c.products[0].productType = "block";
  const base = packageBlocks([c])[0];
  const plan: PackagePlan = {
    durationDays: 30,
    sessions: 2,
    discountType: "amount",
    discountValue: 0,
    blocks: [
      { ...base, id: "a", name: "토닝", quantity: 2 },
      { ...base, id: "b", name: "진정관리", quantity: 2 },
    ],
    placements: [
      { id: "a1", blockId: "a", session: 1 },
      { id: "b1", blockId: "b", session: 1 },
      { id: "a2", blockId: "a", session: 2 },
      { id: "b2", blockId: "b", session: 2 },
    ],
  };
  plan.placements = movePackagePlacement(plan.placements, "b1", 1, "a1");
  expect(
    plan.placements.filter((p) => p.session === 1).map((p) => p.id),
  ).toEqual(["b1", "a1"]);
  expect(packageOption(plan, c.products[0].options[0]).packageComposition).toBe(
    "1회차 진정관리 + 토닝\n2회차 토닝 + 진정관리",
  );
  plan.placements = movePackagePlacement(plan.placements, "a1", 2, "b2");
  expect(
    plan.placements.filter((p) => p.session === 2).map((p) => p.id),
  ).toEqual(["a2", "a1", "b2"]);
  plan.placements = movePackagePlacement(plan.placements, "a2", 2);
  expect(
    plan.placements.filter((p) => p.session === 2).map((p) => p.id),
  ).toEqual(["a1", "b2", "a2"]);
  const saved = packageOption(plan, c.products[0].options[0]);
  expect(saved.packageComposition).toBe(
    "1회차 진정관리\n2회차 토닝 + 진정관리 + 토닝",
  );
  expect(saved.packagePlan?.placements).toEqual(plan.placements);
  expect(saved.price).toBe(40000);
  expect(movePackagePlacement(plan.placements, "b2", 2, "b2")).toEqual(
    plan.placements,
  );
});
