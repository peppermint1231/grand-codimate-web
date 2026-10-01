import { it, expect } from "vitest";
import { threeCatalogs, catalogAdmin } from "./fixtures/catalogs";
import {
  addHospitalInsurancePrices,
  insuranceSummary,
} from "../src/core/insuranceCatalog";
import { validateCatalog, applyCommand, calculate } from "../src/core/domain";
import { catalogRegularPrice } from "../src/core/quotePrices";
import { catalogChanges } from "../src/core/catalogHistory";
import { catalogWorkbook } from "../src/core/excel";
import { emptyState, type Line } from "../src/core/model";
const now = "2026-10-01T01:00:00.000Z";
it("adds the supplied four treatments and seven options under coverage folders without changing existing data", () => {
  const base = threeCatalogs()[1],
    before = structuredClone(base),
    c = addHospitalInsurancePrices(base, now);
  const products = c.products.filter((p) => p.id.startsWith("hospital-nail-"));
  expect(products).toHaveLength(4);
  expect(products.flatMap((p) => p.options)).toHaveLength(7);
  expect(
    products.every(
      (p) =>
        p.active && p.options.every((o) => o.tax === "exempt" && !o.review),
    ),
  ).toBe(true);
  expect(
    products.map((p) => [p.insurance?.coverage, p.insurance?.reimbursement]),
  ).toEqual([
    ["noncovered", "eligible"],
    ["noncovered", "eligible"],
    ["noncovered", "ineligible"],
    ["covered", "eligible"],
  ]);
  expect(c.folderTree?.filter((f) => !f.parentId).map((f) => f.name)).toContain(
    "급여",
  );
  expect(c.folderTree?.filter((f) => !f.parentId).map((f) => f.name)).toContain(
    "비급여",
  );
  expect(products[0].options.map((o) => o.price)).toEqual([160000, 1440000]);
  expect(products[1].options.map((o) => o.price)).toEqual([200000, 1800000]);
  expect(products[2].options[0].price).toBe(50000);
  expect(
    products[3].options.map((o) => [o.price, o.healthInsuranceAmount]),
  ).toEqual([
    [3330, 7770],
    [37200, 77700],
  ]);
  expect(products[1].composition).toContain("2·7회: 루눌라 + 핀 + 재생레이저");
  expect(products[1].composition.match(/재생레이저/g)).toHaveLength(4);
  expect(products[3].description).toContain("3주~4주");
  expect(base).toEqual(before);
  validateCatalog(c, true);
  const again = addHospitalInsurancePrices(c, now);
  expect(again.products).toEqual(c.products);
  expect(() => addHospitalInsurancePrices(threeCatalogs()[0], now)).toThrow(
    "보험 SSOT",
  );
});
it("charges patient copayment only and retains package list-price discounts", () => {
  const c = addHospitalInsurancePrices(threeCatalogs()[1], now);
  const line = (id: string, index: number): Line => {
    const p = c.products.find((p) => p.id === `hospital-nail-${id}`)!,
      o = p.options[index];
    return {
      id: "line-" + id,
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
    };
  };
  const one = line("dressing", 0),
    ten = line("dressing", 1);
  expect(calculate([one], { kind: "amount", value: 0 }, "separate").total).toBe(
    3330,
  );
  expect(calculate([ten], { kind: "amount", value: 0 }, "separate").total).toBe(
    37200,
  );
  expect(line("basic", 1).regularPrice).toBe(1600000);
  expect(line("premium", 1).regularPrice).toBe(2000000);
  expect(
    calculate([line("basic", 1)], { kind: "amount", value: 0 }, "separate")
      .total,
  ).toBe(1440000);
});
it("validates coverage and insurer amounts and records their edits", () => {
  const before = addHospitalInsurancePrices(threeCatalogs()[1], now),
    after = structuredClone(before);
  const p = after.products.at(-1)!;
  p.insurance!.reimbursement = "check";
  p.options[0].healthInsuranceAmount = 9000;
  expect(
    catalogChanges(before, after).some((x) =>
      x.includes("급여·실비 구분 변경"),
    ),
  ).toBe(true);
  expect(
    catalogChanges(before, after).some((x) => x.includes("공단 청구액")),
  ).toBe(true);
  p.options[0].healthInsuranceAmount = -1;
  expect(() => validateCatalog(after)).toThrow();
  p.options[0].healthInsuranceAmount = 0;
  p.insurance!.coverage = "invalid" as any;
  expect(() => validateCatalog(after)).toThrow();
  expect(insuranceSummary(before.products.at(-1)!.insurance)).toBe(
    "급여 · 실비 청구 가능",
  );
});
it("preserves metadata through save/publish and includes coverage and separate claim amount in Excel", async () => {
  const s = emptyState();
  s.catalogs = threeCatalogs();
  const c = addHospitalInsurancePrices(s.catalogs[1], now);
  const saved = await applyCommand(
    s,
    catalogAdmin,
    {
      id: "insurance-save",
      type: "catalog.save",
      entityId: c.id,
      payload: { catalog: c },
    },
    now,
  );
  const draft = saved.catalogs.find((x) => x.id === c.id)!;
  const published = await applyCommand(
    saved,
    catalogAdmin,
    {
      id: "insurance-publish",
      type: "catalog.publish",
      entityId: c.id,
      baseRev: draft.rev,
      payload: {},
    },
    now,
  );
  const result = published.catalogs.find((x) => x.id === c.id)!;
  expect(result.status).toBe("published");
  expect(result.products.at(-1)!.insurance).toEqual(
    c.products.at(-1)!.insurance,
  );
  const wb = await catalogWorkbook(result);
  const cells = wb.worksheets
    .flatMap((ws) => ws.getSheetValues())
    .flat(2)
    .join(" ");
  expect(cells).toContain("비급여 · 실비 불가");
  expect(cells).toContain("급여 · 실비 청구 가능");
  expect(cells).toContain("공단 청구액 7,770원");
  expect(s.catalogs).toEqual(threeCatalogs());
});
