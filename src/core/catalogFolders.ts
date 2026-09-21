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
export const catalogNodes = (catalog: Catalog): CatalogFolder[] =>
  catalog.folderTree || [...rootFolders, ...(catalog.folders || [])];
export function folderPath(catalog: Catalog, id?: string): CatalogFolder[] {
  const nodes = catalogNodes(catalog);
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
  const supplied = catalog.folderTree ?? catalog.folders;
  if (
    supplied !== undefined &&
    (!Array.isArray(supplied) || supplied.length > 500)
  )
    return "폴더는 500개까지 만들 수 있습니다";
  const nodes = catalogNodes(catalog),
    ids = new Set<string>(),
    names = new Set<string>();
  for (const f of nodes) {
    if (
      !f ||
      typeof f.id !== "string" ||
      !/^[\w-]{1,100}$/.test(f.id) ||
      ids.has(f.id)
    )
      return "폴더 ID가 없거나 중복되었습니다";
    ids.add(f.id);
    if (
      typeof f.parentId !== "string" ||
      typeof f.name !== "string" ||
      !f.name.trim() ||
      f.name.length > 60 ||
      /[\\/]/.test(f.name)
    )
      return "폴더 이름은 경로 구분자 없이 60자 이내로 입력하세요";
    if (f.color !== undefined && !/^#[0-9a-fA-F]{6}$/.test(f.color))
      return "폴더 색상을 확인하세요";
    const key = f.parentId + "/" + f.name.trim().toLocaleLowerCase();
    if (names.has(key)) return "같은 위치에 같은 이름의 폴더가 있습니다";
    names.add(key);
  }
  for (const f of nodes) {
    const path = folderPath(catalog, f.id);
    if (!path.length)
      return "폴더를 자기 자신이나 하위 폴더 안으로 이동할 수 없습니다";
    if (path.length > 4)
      return "상위 분류 아래에는 세부 폴더를 3단계까지 만들 수 있습니다";
  }
  if (catalog.products.some((p) => !ids.has(productFolder(catalog, p))))
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

export function editableTree(catalog: Catalog): Catalog {
  return {
    ...structuredClone(catalog),
    folderTree: structuredClone(catalogNodes(catalog)),
    products: catalog.products.map((p) => ({
      ...structuredClone(p),
      folderId: productFolder(catalog, p),
    })),
  };
}
export const subtreeIds = (catalog: Catalog, id: string) =>
  new Set(
    catalogNodes(catalog)
      .filter((f) => folderPath(catalog, f.id).some((x) => x.id === id))
      .map((f) => f.id),
  );
export function folderImpact(c: Catalog, id: string) {
  const ids = subtreeIds(c, id);
  return {
    folders: ids.size,
    products: c.products.filter((p) => ids.has(productFolder(c, p))).length,
  };
}
function checked(c: Catalog) {
  const error = folderError(c);
  if (error) throw new Error(error);
  return c;
}
export function renameFolder(
  c: Catalog,
  id: string,
  name: string,
  color?: string,
) {
  const next = editableTree(c);
  next.folderTree = next.folderTree!.map((f) =>
    f.id === id ? { ...f, name: name.trim(), color } : f,
  );
  return checked(next);
}
export function addFolder(c: Catalog, parentId: string, name: string) {
  const next = editableTree(c),
    id = crypto.randomUUID();
  next.folderTree!.push({ id, parentId, name: name.trim(), color: "#155e59" });
  return { catalog: checked(next), id };
}
export function deleteFolder(c: Catalog, id: string) {
  const next = editableTree(c),
    ids = subtreeIds(next, id);
  if (!ids.size) throw new Error("폴더가 없습니다");
  next.products = next.products.filter((p) => !ids.has(p.folderId!));
  next.folderTree = next.folderTree!.filter((f) => !ids.has(f.id));
  return checked(next);
}
export type CollisionPolicy = "merge" | "replace";
export class FolderCollision extends Error {
  constructor(public targetId: string) {
    super("같은 이름의 폴더가 있습니다");
  }
}
export function transferFolder(
  c: Catalog,
  id: string,
  parentId: string,
  options: {
    copy?: boolean;
    policy?: CollisionPolicy;
    beforeId?: string;
    afterId?: string;
  } = {},
) {
  let next = editableTree(c);
  const source = next.folderTree!.find((f) => f.id === id);
  if (!source) throw new Error("폴더가 없습니다");
  if (parentId && !next.folderTree!.some((f) => f.id === parentId))
    throw new Error("이동할 폴더가 없습니다");
  if (!options.copy && subtreeIds(next, id).has(parentId))
    throw new Error("폴더를 자기 자신이나 하위 폴더 안으로 이동할 수 없습니다");
  if (options.copy) {
    const ids = subtreeIds(next, id),
      remap = new Map([...ids].map((x) => [x, crypto.randomUUID()]));
    const copied = next
      .folderTree!.filter((f) => ids.has(f.id))
      .map((f) => ({
        ...f,
        id: remap.get(f.id)!,
        parentId: f.id === id ? parentId : remap.get(f.parentId)!,
      }));
    next.products.push(
      ...next.products
        .filter((p) => ids.has(p.folderId!))
        .map((p) => ({
          ...structuredClone(p),
          id: crypto.randomUUID(),
          folderId: remap.get(p.folderId!)!,
          active: false,
          publicVisible: false,
          options: p.options.map((o) => ({
            ...structuredClone(o),
            id: crypto.randomUUID(),
          })),
        })),
    );
    next.folderTree!.push(...copied);
    id = remap.get(id)!;
  }
  const conflict = next.folderTree!.find(
    (f) =>
      f.id !== id &&
      f.parentId === parentId &&
      f.name.trim().toLocaleLowerCase() ===
        source.name.trim().toLocaleLowerCase(),
  );
  if (conflict && !options.policy) throw new FolderCollision(conflict.id);
  if (conflict && options.policy === "replace") {
    if (subtreeIds(next, conflict.id).has(id))
      throw new Error("상위 폴더를 자기 하위 폴더로 덮어쓸 수 없습니다");
    next = deleteFolder(next, conflict.id);
  }
  const merge = (sourceId: string, targetId: string) => {
    for (const p of next.products)
      if (p.folderId === sourceId) p.folderId = targetId;
    for (const child of next.folderTree!.filter(
      (f) => f.parentId === sourceId,
    )) {
      const duplicate = next.folderTree!.find(
        (f) =>
          f.parentId === targetId &&
          f.name.trim().toLocaleLowerCase() ===
            child.name.trim().toLocaleLowerCase(),
      );
      if (duplicate) merge(child.id, duplicate.id);
      else child.parentId = targetId;
    }
    next.folderTree = next.folderTree!.filter((f) => f.id !== sourceId);
  };
  if (conflict && options.policy === "merge") {
    if (
      subtreeIds(next, id).has(conflict.id) ||
      subtreeIds(next, conflict.id).has(id)
    )
      throw new Error("상위·하위 폴더를 서로 합칠 수 없습니다");
    merge(id, conflict.id);
  } else {
    const node = next.folderTree!.find((f) => f.id === id)!;
    node.parentId = parentId;
    const rest = next.folderTree!.filter((f) => f.id !== id);
    const anchor = options.beforeId || options.afterId;
    const index = anchor
      ? rest.findIndex((f) => f.id === anchor && f.parentId === parentId)
      : -1;
    rest.splice(
      index < 0 ? rest.length : index + (options.afterId ? 1 : 0),
      0,
      node,
    );
    next.folderTree = rest;
  }
  return checked(next);
}
