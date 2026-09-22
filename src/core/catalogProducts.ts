import { productFolderPaths } from "./catalogFolders";
import type { Catalog, Product } from "./model";
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
