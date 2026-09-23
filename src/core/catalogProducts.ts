import { productFolderPaths } from "./catalogFolders";
import type { Catalog, Product, Option } from "./model";
export interface CatalogBulkChanges {
  active?: boolean;
  tax?: Option["tax"];
  publicVisible?: boolean;
  completeReview?: boolean;
}
export function bulkEditCatalogProducts(
  catalog: Catalog,
  ids: string[],
  changes: CatalogBulkChanges,
): Catalog {
  if (catalog.status !== "draft")
    throw new Error("상품 일괄 수정은 편집 중인 초안에서만 가능합니다.");
  const selected = new Set(ids);
  const products = catalog.products.map((p) =>
    selected.has(p.id)
      ? {
          ...p,
          ...(changes.active === undefined ? {} : { active: changes.active }),
          ...(changes.publicVisible === undefined
            ? {}
            : { publicVisible: changes.publicVisible }),
          options: p.options.map((o) => ({
            ...o,
            ...(changes.tax === undefined ? {} : { tax: changes.tax }),
            ...(changes.completeReview ? { review: false } : {}),
          })),
        }
      : p,
  );
  if (changes.completeReview || changes.active === true) {
    const invalid = products.filter(
      (p) =>
        selected.has(p.id) &&
        (!p.options.length ||
          p.options.some(
            (o) =>
              o.price === null ||
              !Number.isSafeInteger(o.price) ||
              o.price < 0 ||
              o.tax === "unknown" ||
              (changes.active === true && o.review) ||
              !o.label.trim(),
          )),
    );
    if (invalid.length)
      throw new Error(
        `검토완료·판매 활성화할 수 없는 상품 ${invalid.length}개: ${invalid
          .slice(0, 3)
          .map((p) => p.name)
          .join(
            ", ",
          )}${invalid.length > 3 ? " 외" : ""}. 옵션명·가격·부가세를 확정하고 검토완료하세요. 이번 일괄 변경은 적용되지 않았습니다.`,
      );
  }
  return { ...catalog, products };
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
