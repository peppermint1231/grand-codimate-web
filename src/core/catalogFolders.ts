import { concerns } from "./concerns";
import {
  catalogBook,
  type Catalog,
  type CatalogFolder,
  type Product,
} from "./model";
export const rootFolders = concerns.map((c) => ({
  id: c.id,
  name: c.name,
  parentId: "",
}));
export function folderPath(catalog: Catalog, id?: string): CatalogFolder[] {
  const nodes = [...rootFolders, ...(catalog.folders || [])];
  const path: CatalogFolder[] = [],
    seen = new Set<string>();
  while (id) {
    if (seen.has(id)) return [];
    seen.add(id);
    const node = nodes.find((x) => x.id === id);
    if (!node) return [];
    path.unshift(node);
    id = node.parentId;
  }
  return path;
}
export function inferRoot(product: Product, catalog?: Catalog): string {
  if (catalog && product.folderId)
    return folderPath(catalog, product.folderId)[0]?.id || "booster";
  const text = product.category + " " + product.name;
  if (catalog && catalogBook(catalog) === "보험") return "medical";
  if (/문신/.test(text)) return "tattoo";
  if (/제모/.test(text)) return "hair-removal";
  if (/탈모|두피/.test(text)) return "hair-loss";
  if (/비만|바디|지방|윤곽|이중턱/.test(text)) return "body";
  if (/눈밑|다크서클/.test(text)) return "eye";
  if (/보톡스|필러/.test(text)) return "botox-filler";
  if (/홍조|혈관|딸기코/.test(text)) return "redness";
  if (/리프팅|주름|녹는실|탄력/.test(text)) return "lifting";
  if (/모공/.test(text)) return "pores";
  if (/흉터|자국/.test(text)) return "scar";
  if (/여드름|아크네/.test(text)) return "acne";
  if (/색소|잡티|기미|리팟|점제거|검버섯|주근깨/.test(text)) return "pigment";
  return "booster";
}
export const productFolder = (catalog: Catalog, product: Product) =>
  product.folderId || inferRoot(product, catalog);
export function inFolder(catalog: Catalog, product: Product, selected: string) {
  return (
    !selected ||
    folderPath(catalog, productFolder(catalog, product)).some(
      (x) => x.id === selected,
    )
  );
}
export function folderError(catalog: Catalog): string | undefined {
  if (
    catalog.folders !== undefined &&
    (!Array.isArray(catalog.folders) || catalog.folders.length > 500)
  )
    return "폴더는 500개까지 만들 수 있습니다";
  const folders = catalog.folders || [],
    ids = new Set<string>(rootFolders.map((x) => x.id)),
    siblingNames = new Set<string>();
  for (const folder of folders) {
    if (
      !folder ||
      typeof folder.id !== "string" ||
      !folder.id ||
      ids.has(folder.id)
    )
      return "폴더 ID가 없거나 중복되었습니다";
    ids.add(folder.id);
    if (
      typeof folder.name !== "string" ||
      !folder.name.trim() ||
      folder.name.length > 60 ||
      /[\\/]/.test(folder.name)
    )
      return "폴더 이름은 경로 구분자 없이 60자 이내로 입력하세요";
    const key = folder.parentId + "/" + folder.name.trim().toLocaleLowerCase();
    if (siblingNames.has(key)) return "같은 위치에 같은 이름의 폴더가 있습니다";
    siblingNames.add(key);
  }
  for (const folder of folders) {
    const path = folderPath(catalog, folder.id);
    if (
      !path.length ||
      !folder.parentId ||
      !rootFolders.some((x) => x.id === path[0].id)
    )
      return "폴더를 자기 자신이나 하위 폴더 안으로 이동할 수 없습니다";
    if (path.length > 4)
      return "고정 상위 분류 아래에는 세부 폴더를 3단계까지 만들 수 있습니다";
  }
  if (catalog.products.some((p) => p.folderId && !ids.has(p.folderId)))
    return "상품의 폴더가 존재하지 않습니다";
}
export function moveProducts(
  catalog: Catalog,
  ids: string[],
  folderId: string,
): Catalog {
  if (!folderPath(catalog, folderId).length)
    throw new Error("이동할 폴더를 선택하세요");
  return {
    ...catalog,
    products: catalog.products.map((p) =>
      ids.includes(p.id) ? { ...p, folderId } : p,
    ),
  };
}
export function moveFolder(
  catalog: Catalog,
  id: string,
  parentId: string,
): Catalog {
  if (!catalog.folders?.some((x) => x.id === id))
    throw new Error("상위 분류는 고정되어 있습니다");
  const next = {
    ...catalog,
    folders: catalog.folders.map((x) => (x.id === id ? { ...x, parentId } : x)),
  };
  const error = folderError(next);
  if (error) throw new Error(error);
  return next;
}
