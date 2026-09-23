import type { Option, Product } from "./model";
export function eventOptionPrices(product: Product, option: Option) {
  const regularPrice =
    option.regularPrice !== undefined
      ? option.regularPrice
      : product.options.length === 1
        ? (product.webEvent?.regularPrice ?? null)
        : null;
  const salePrice = option.price;
  const discountRate =
    regularPrice !== null &&
    regularPrice > 0 &&
    salePrice !== null &&
    salePrice >= 0 &&
    salePrice <= regularPrice
      ? Math.round((1 - salePrice / regularPrice) * 1000) / 10
      : null;
  return { regularPrice, salePrice, discountRate };
}
