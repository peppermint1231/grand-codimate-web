import { productFolderPaths } from "./catalogFolders";
import type { Catalog, Product, Option } from "./model";
export interface CatalogBulkChanges {
  active?: boolean;
  tax?: Option["tax"];
  publicVisible?: boolean;
  completeReview?: boolean;
}
export function productReviewIssues(p: Product): string[] {
  const issues: string[] = [];
  if (!p.name.trim()) issues.push("상품명 미입력");
  if (!p.options.length) issues.push("옵션 없음");
  for (const o of p.options) {
    const label = o.label.trim() || "이름 없는 옵션";
    if (!o.label.trim()) issues.push("옵션명 미입력");
    if (
      o.price === null ||
      !Number.isSafeInteger(o.price) ||
      o.price < 0 ||
      o.price > 1_000_000_000
    )
      issues.push(`${label}: 가격 미확정 또는 범위 오류`);
    if (o.tax === "unknown") issues.push(`${label}: 부가세 확인 필요`);
  }
  return issues;
}
export const needsProductReview = (p: Product) =>
  productReviewIssues(p).length > 0;

export function bulkEditCatalogProductsResult(
  catalog: Catalog,
  ids: string[],
  changes: CatalogBulkChanges,
) {
  if (catalog.status !== "draft")
    throw new Error("상품 일괄 수정은 편집 중인 초안에서만 가능합니다.");
  const selected = new Set(ids);
  const appliedIds: string[] = [];
  const skipped: { id: string; name: string; reasons: string[] }[] = [];
  const products = catalog.products.map((p) => {
    if (!selected.has(p.id)) return p;
    const next: Product = {
      ...p,
      ...(changes.active === undefined ? {} : { active: changes.active }),
      ...(changes.publicVisible === undefined
        ? {}
        : { publicVisible: changes.publicVisible }),
      options: p.options.map((o) => ({
        ...o,
        ...(changes.tax === undefined ? {} : { tax: changes.tax }),
        ...(changes.completeReview || changes.active === true
          ? { review: false }
          : {}),
      })),
    };
    if (changes.completeReview || changes.active === true) {
      const reasons = productReviewIssues(next);
      if (reasons.length) {
        skipped.push({ id: p.id, name: p.name, reasons });
        return p;
      }
    }
    appliedIds.push(p.id);
    return next;
  });
  return { catalog: { ...catalog, products }, appliedIds, skipped };
}
export function bulkEditCatalogProducts(
  catalog: Catalog,
  ids: string[],
  changes: CatalogBulkChanges,
): Catalog {
  return bulkEditCatalogProductsResult(catalog, ids, changes).catalog;
}
export type CatalogSearchScope = "all" | "folder" | "product";
const searchKey = (text: string) =>
  text.normalize("NFKC").toLocaleLowerCase().replace(/\s+/g, "");
export function matchesCatalogSearch(
  catalog: Catalog,
  product: Product,
  query: string,
  scope: CatalogSearchScope = "all",
) {
  const key = searchKey(query);
  if (!key) return true;
  return (
    (scope !== "folder" && searchKey(product.name).includes(key)) ||
    (scope !== "product" &&
      productFolderPaths(catalog, product).some((path) =>
        searchKey(path.map((f) => f.name).join(" ")).includes(key),
      ))
  );
}
export function deleteCatalogProducts(
  catalog: Catalog,
  ids: string[],
): Catalog {
  if (catalog.status !== "draft")
    throw new Error("상품 삭제는 편집 중인 초안에서만 가능합니다.");
  const selected = new Set(ids);
  return {
    ...catalog,
    products: catalog.products.filter((p) => !selected.has(p.id)),
  };
}

export type CatalogProductFilter =
  "all" | "unreviewed" | "active" | "inactive" | "details" | "tax" | "missing";
export function matchesCatalogProductFilter(
  p: Product,
  filter: CatalogProductFilter,
) {
  switch (filter) {
    case "unreviewed":
      return needsProductReview(p);
    case "active":
      return p.active;
    case "inactive":
      return !p.active;
    case "tax":
      return p.options.some((o) => o.tax === "unknown");
    case "missing":
      return (
        !p.options.length ||
        p.options.some(
          (o) =>
            o.price === null ||
            !Number.isSafeInteger(o.price) ||
            o.price < 0 ||
            o.price > 1_000_000_000,
        )
      );
    case "details":
      return p.options.some((o) =>
        o.issues.some((i) => !/검토|부가세 미표기/.test(i)),
      );
    default:
      return true;
  }
}
