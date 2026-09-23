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
  const regular = Math.round((line.regularPrice ?? line.price) * line.quantity);
  const sale = Math.round(line.price * line.quantity);
  return { regular, sale, catalogDiscount: regular - sale };
}

export function catalogDiscount(lines: Line[]) {
  return lines.reduce((sum, line) => sum + linePrices(line).catalogDiscount, 0);
}
