import { catalogBook, type Catalog, type CatalogFolder } from "./model";
export type CatalogCategoryMode = "concern" | "website";
const cache = new WeakMap<Catalog, Catalog>();
/** Read-only projection. Product IDs, options and prices stay shared with the source. */
export function catalogCategoryView(
  catalog: Catalog,
  mode: CatalogCategoryMode,
): Catalog {
  if (mode !== "website" || catalogBook(catalog) !== "이벤트") return catalog;
  const cached = cache.get(catalog);
  if (cached) return cached;
  const folders = new Map<string, CatalogFolder>();
  const products = catalog.products.map((product) => {
    const origin = product.webEvent;
    const name = origin?.categoryName?.trim() || "홈페이지 분류 미확인";
    const root = "website-category:" + encodeURIComponent(name);
    if (!folders.has(root)) folders.set(root, { id: root, name, parentId: "" });
    let folderId = root;
    if (origin?.eventId && origin.eventName.trim()) {
      folderId = root + ":banner:" + origin.eventId;
      if (!folders.has(folderId))
        folders.set(folderId, {
          id: folderId,
          name: origin.eventName,
          parentId: root,
        });
    }
    return { ...product, folderId };
  });
  const view = { ...catalog, folderTree: [...folders.values()], products };
  cache.set(catalog, view);
  return view;
}
