import { describe, expect, it } from "vitest";
import { calculate, validateCatalog, applyCommand } from "../src/core/domain";
import {
  emptyState,
  type Catalog,
  type Line,
  type User,
} from "../src/core/model";
import { catalogWorkbook } from "../src/core/excel";
const catalog = (): Catalog => ({
  id: "catalog-review",
  rev: 0,
  createdAt: "2026-09-21",
  updatedAt: "2026-09-21",
  schemaVersion: 1,
  version: "review",
  status: "draft",
  references: [],
  products: [
    {
      id: "product",
      rev: 1,
      createdAt: "2026-09-21",
      updatedAt: "2026-09-21",
      name: "검토상품",
      category: "검토분류",
      description: "",
      composition: "",
      active: false,
      sources: [],
      options: [
        {
          id: "option",
          label: "1회",
          price: 10000,
          tax: "unknown",
          review: true,
          issues: ["부가세 확인"],
          sources: [],
          unit: "회",
          priceKind: "clinic",
        },
      ],
    },
  ],
});
const admin: User = {
  id: "admin",
  name: "관리자",
  username: "admin",
  role: "admin",
  active: true,
  permissions: {},
};
describe("catalog review tax uncertainty", () => {
  it("saves unresolved tax in a draft without guessing", async () => {
    const c = catalog();
    const s = await applyCommand(emptyState(), admin, {
      id: crypto.randomUUID(),
      type: "catalog.save",
      entityId: c.id,
      payload: { catalog: c },
    });
    expect(s.catalogs[0].products[0].options[0].tax).toBe("unknown");
    expect(() => validateCatalog(s.catalogs[0])).not.toThrow();
  });
  it("cannot publish unknown tax by clearing the review checkbox", () => {
    const c = catalog();
    c.products[0].active = true;
    c.products[0].options[0].review = false;
    expect(() => validateCatalog(c, true)).toThrow(/부가세/);
    c.products[0].options[0].tax = "inclusive";
    expect(() => validateCatalog(c, true)).not.toThrow();
  });
  it.each(["included", "separate"] as const)(
    "refuses to calculate unknown tax even in %s mode",
    (vat) => {
      const line: Line = {
        id: "line",
        productId: "product",
        optionId: "option",
        name: "검토상품",
        label: "1회",
        unit: "회",
        quantity: 1,
        price: 10000,
        tax: "unknown",
        discount: { kind: "amount", value: 0 },
      };
      expect(() =>
        calculate([line], { kind: "amount", value: 0 }, vat),
      ).toThrow(/부가세/);
    },
  );
  it("exports unknown tax explicitly rather than exempt or exclusive", async () => {
    const wb = await catalogWorkbook(catalog(), undefined, true);
    const values = wb.worksheets
      .flatMap((ws) => ws.getSheetValues())
      .flat(Infinity)
      .join(" ");
    expect(values).toContain("부가세 확인 필요");
    expect(values).not.toContain("면세");
    expect(values).not.toContain("VAT 별도");
  });
});
