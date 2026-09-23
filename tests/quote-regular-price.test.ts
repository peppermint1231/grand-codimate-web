import { expect, it } from "vitest";
import { applyCommand, calculate, renewalQuote } from "../src/core/domain";
import {
  catalogDiscount,
  catalogRegularPrice,
  linePrices,
} from "../src/core/quotePrices";
import { emptyState, type Line } from "../src/core/model";
import { catalogAdmin as admin, threeCatalogs } from "./fixtures/catalogs";
const zero = { kind: "amount" as const, value: 0 };
const line = (patch: Partial<Line> = {}): Line => ({
  id: "line",
  productId: "product-2",
  optionId: "option-2",
  catalogVersion: "version-2",
  book: "이벤트",
  name: "이벤트 시술",
  label: "기본",
  unit: "회",
  quantity: 1,
  price: 70000,
  regularPrice: 100000,
  tax: "exclusive",
  discount: zero,
  ...patch,
});
it("counts list prices in subtotal and automatic discounts without changing the sale-based charge", () => {
  const q = calculate([line()], zero, "separate");
  expect(q).toMatchObject({
    subtotal: 100000,
    discountTotal: 30000,
    supply: 70000,
    vatAmount: 7000,
    total: 77000,
  });
  expect(
    calculate([line({ regularPrice: undefined })], zero, "separate").total,
  ).toBe(q.total);
});
it("applies quantity then additional item and global discounts to the sale price, without discounting twice", () => {
  const q = calculate(
    [line({ quantity: 2, discount: { kind: "percent", value: 10 } })],
    { kind: "amount", value: 1000 },
    "separate",
    "추가 혜택",
  );
  expect(q).toMatchObject({
    subtotal: 200000,
    discountTotal: 75000,
    supply: 125000,
    vatAmount: 12500,
    total: 137500,
  });
  expect(catalogDiscount(q.lines)).toBe(60000);
});
it("keeps inclusive, exclusive and exempt tax calculation on the discounted amounts", () => {
  const q = calculate(
    [
      line({ price: 7000, regularPrice: 10000 }),
      line({
        id: "inclusive",
        price: 5500,
        regularPrice: 11000,
        tax: "inclusive",
      }),
      line({ id: "exempt", price: 3000, regularPrice: 5000, tax: "exempt" }),
    ],
    { kind: "percent", value: 10 },
    "separate",
  );
  expect(q).toMatchObject({
    subtotal: 26000,
    discountTotal: 12050,
    supply: 13500,
    vatAmount: 1080,
    total: 14580,
  });
  const included = calculate(
    [line({ price: 77000, regularPrice: 110000, tax: "inclusive" })],
    zero,
    "separate",
  );
  expect(included).toMatchObject({
    subtotal: 110000,
    discountTotal: 33000,
    supply: 70000,
    vatAmount: 7000,
    total: 77000,
  });
});
it("rounds fractional quantities consistently and supports a free sale price", () => {
  const q = calculate(
    [line({ regularPrice: 101, price: 99, quantity: 0.5, tax: "exempt" })],
    zero,
    "separate",
  );
  expect(q).toMatchObject({ subtotal: 51, discountTotal: 1, total: 50 });
  expect(linePrices(q.lines[0])).toEqual({
    regular: 51,
    sale: 50,
    catalogDiscount: 1,
  });
  expect(calculate([line({ price: 0 })], zero, "separate")).toMatchObject({
    subtotal: 100000,
    discountTotal: 100000,
    supply: 0,
    vatAmount: 0,
    total: 0,
  });
});
it("rejects invalid regular snapshots and never invents a discount when the catalog regular price is missing or below the sale price", () => {
  for (const regularPrice of [-1, NaN, Infinity, 1.5, 1000000001, 69999])
    expect(() =>
      calculate([line({ regularPrice })], zero, "separate"),
    ).toThrow();
  const p = threeCatalogs()[2].products[0],
    o = p.options[0];
  expect(catalogRegularPrice(p, o)).toBeUndefined();
  o.regularPrice = 7000;
  expect(catalogRegularPrice(p, o)).toBeUndefined();
  o.regularPrice = 10000;
  expect(catalogRegularPrice(p, o)).toBe(10000);
});
const cmd = (
  type: string,
  payload: any,
  entityId = "consult",
  baseRev?: number,
) => ({ id: crypto.randomUUID(), type, payload, entityId, baseRev });
async function fixture() {
  let s = emptyState();
  s.users = [admin];
  s.catalogs = threeCatalogs();
  Object.assign(s.catalogs[2].products[0].options[0], {
    price: 70000,
    regularPrice: 100000,
  });
  s = await applyCommand(
    s,
    admin,
    cmd(
      "patient.create",
      {
        name: "견적검증",
        sex: "F",
        dob: "1990-01-01",
        phone: "01000000000",
        address: "검증",
      },
      "patient",
    ),
  );
  return applyCommand(
    s,
    admin,
    cmd("consultation.create", { patientId: "patient", category: "미용" }),
  );
}
const payload = {
  lines: [line({ regularPrice: 999999, price: 1 })],
  discount: zero,
  vat: "separate",
  photos: [],
  reason: "",
};
it("server snapshots catalog regular and sale prices, ignores client spoofing, and accepts catalog discounts without an extra reason", async () => {
  let s = await applyCommand(
    await fixture(),
    admin,
    cmd("consultation.save", payload, "consult", 1),
  );
  expect(s.consultations[0].quote).toMatchObject({
    subtotal: 100000,
    discountTotal: 30000,
    total: 77000,
    lines: [{ regularPrice: 100000, price: 70000 }],
  });
  Object.assign(s.catalogs[2].products[0].options[0], {
    regularPrice: 150000,
    price: 90000,
  });
  s = await applyCommand(
    s,
    admin,
    cmd(
      "consultation.save",
      { ...payload, lines: [{ ...payload.lines[0], quantity: 2 }] },
      "consult",
      2,
    ),
  );
  expect(s.consultations[0].quote).toMatchObject({
    subtotal: 200000,
    total: 154000,
    lines: [{ regularPrice: 100000, price: 70000 }],
  });
  const q = renewalQuote(s.consultations[0], s.catalogs, "renew");
  expect(q.lines[0]).toMatchObject({ regularPrice: 150000, price: 90000 });
  expect(q.total).toBe(198000);
  delete s.catalogs[2].products[0].options[0].regularPrice;
  expect(
    renewalQuote(s.consultations[0], s.catalogs, "renew").lines[0].regularPrice,
  ).toBeUndefined();
});
it("still requires a reason for additional item or global discounts", async () => {
  for (const next of [
    { ...payload, discount: { kind: "amount", value: 1 } },
    { ...payload, lines: [line({ discount: { kind: "percent", value: 1 } })] },
  ])
    await expect(
      applyCommand(
        await fixture(),
        admin,
        cmd("consultation.save", next, "consult", 1),
      ),
    ).rejects.toThrow("할인 사유");
});
it("preserves legacy saved lines without retroactively repricing or inventing a regular price", async () => {
  let s = await fixture();
  delete s.catalogs[2].products[0].options[0].regularPrice;
  s = await applyCommand(
    s,
    admin,
    cmd("consultation.save", payload, "consult", 1),
  );
  s.catalogs[2].products[0].options[0].regularPrice = 120000;
  s = await applyCommand(
    s,
    admin,
    cmd("consultation.save", payload, "consult", 2),
  );
  expect(s.consultations[0].quote).toMatchObject({
    subtotal: 70000,
    discountTotal: 0,
    total: 77000,
  });
  expect(s.consultations[0].quote.lines[0].regularPrice).toBeUndefined();
});
