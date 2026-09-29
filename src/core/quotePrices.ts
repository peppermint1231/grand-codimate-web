import { eventOptionPrices } from "./eventPrices";
import type { Line, Option, Product } from "./model";

// Store the catalog price alongside the sale price. Never infer it from a newer catalog.
export function catalogRegularPrice(product: Product, option: Option) {
  const { regularPrice, salePrice } = eventOptionPrices(product, option);
  return regularPrice !== null &&
    salePrice !== null &&
    Number.isSafeInteger(regularPrice) &&
    regularPrice >= salePrice &&
    regularPrice <= 1_000_000_000
    ? regularPrice
    : undefined;
}

export function linePrices(line: Line) {
  const regular = Math.round(
    (line.customPrice ?? line.regularPrice ?? line.price) * line.quantity,
  );
  const sale = Math.round((line.customPrice ?? line.price) * line.quantity);
  return { regular, sale, catalogDiscount: regular - sale };
}

export function catalogDiscount(lines: Line[]) {
  return lines.reduce((sum, line) => sum + linePrices(line).catalogDiscount, 0);
}

export function discountValue(
  base: number,
  discount: import("./model").Discount,
) {
  return discount.kind === "percent"
    ? Math.round((base * discount.value) / 100)
    : Math.round(discount.value);
}

/** Same proportional allocation (including won rounding) as the charged total. */
export function quoteLinePrices(
  lines: Line[],
  discount: import("./model").Discount,
) {
  const prices = lines.map((line) => {
    const p = linePrices(line);
    const itemDiscount = discountValue(p.sale, line.discount);
    return { ...p, itemDiscount, base: p.sale - itemDiscount };
  });
  const net = prices.reduce((s, p) => s + p.base, 0);
  const global = discountValue(net, discount);
  const allocations = prices.map((p, i) => ({
    i,
    value: net ? Math.floor((global * p.base) / net) : 0,
    fraction: net ? ((global * p.base) / net) % 1 : 0,
  }));
  let remainder = global - allocations.reduce((s, a) => s + a.value, 0);
  for (const a of [...allocations].sort(
    (a, b) => b.fraction - a.fraction || a.i - b.i,
  )) {
    if (remainder-- > 0) a.value++;
  }
  return prices.map((p, i) => ({
    ...p,
    globalDiscount: allocations[i].value,
    discounted: p.base - allocations[i].value,
    discountTotal: p.catalogDiscount + p.itemDiscount + allocations[i].value,
  }));
}
