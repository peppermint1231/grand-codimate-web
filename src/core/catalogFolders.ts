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
const rawNodes = (catalog: Catalog): CatalogFolder[] =>
  catalog.folderTree || [...rootFolders, ...(catalog.folders || [])];
export const catalogNodes = (catalog: Catalog): CatalogFolder[] => {
  const nodes = rawNodes(catalog);
  return nodes.map((f) => {
    if (!f) return f;
    const target = f.linkTo && nodes.find((x) => x?.id === f.linkTo);
    return target ? { ...f, name: target.name, color: target.color } : f;
  });
};
export interface DisplayFolder extends CatalogFolder {
  sourceId: string;
  virtual: boolean;
}
const displayCache = new WeakMap<Catalog, DisplayFolder[]>();
const pathsCache = new WeakMap<Catalog, Map<string, CatalogFolder[][]>>();
export function displayFolderNodes(catalog: Catalog): DisplayFolder[] {
  const cached = displayCache.get(catalog);
  if (cached) return cached;
  const nodes = catalogNodes(catalog),
    result: DisplayFolder[] = [];
  const visit = (
    f: CatalogFolder,
    parentId: string,
    alias: boolean,
    seen: Set<string>,
  ) => {
    const sourceId = f.linkTo || f.id;
    if (seen.has(sourceId) || result.length >= 5000) return;
    const id = alias ? parentId + "~" + f.id : f.id;
    result.push({ ...f, id, parentId, sourceId, virtual: alias });
    const nextSeen = new Set([...seen, sourceId]);
    for (const child of nodes.filter((x) => x.parentId === sourceId))
      visit(child, id, alias || !!f.linkTo, nextSeen);
  };
  for (const f of nodes.filter((x) => !x.parentId))
    visit(f, "", false, new Set());
  displayCache.set(catalog, result);
  return result;
}
export function sourceFolderId(c: Catalog, id: string) {
  const f = displayFolderNodes(c).find((x) => x.id === id);
  if (!f) throw new Error("폴더가 없습니다");
  return f.sourceId;
}
export function productFolderPaths(c: Catalog, p: Product) {
  let paths = pathsCache.get(c);
  if (!paths) {
    paths = new Map();
    const nodes = displayFolderNodes(c),
      byId = new Map(nodes.map((f) => [f.id, f]));
    for (const f of nodes) {
      const path: CatalogFolder[] = [];
      let node: DisplayFolder | undefined = f;
      while (node) {
        path.unshift(node);
        node = byId.get(node.parentId);
      }
      paths.set(f.sourceId, [...(paths.get(f.sourceId) || []), path]);
    }
    pathsCache.set(c, paths);
  }
  return paths.get(productFolder(c, p)) || [];
}
export function folderPath(catalog: Catalog, id?: string): CatalogFolder[] {
  const nodes = id?.includes("~")
    ? displayFolderNodes(catalog)
    : catalogNodes(catalog);
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
    productFolderPaths(catalog, product).some((path) =>
      path.some((x) => x.id === selected),
    )
  );
}
export function folderError(catalog: Catalog): string | undefined {
  displayCache.delete(catalog);
  pathsCache.delete(catalog);
  const supplied = catalog.folderTree ?? catalog.folders;
  if (
    supplied !== undefined &&
    (!Array.isArray(supplied) || supplied.length > 500)
  )
    return "폴더는 500개까지 만들 수 있습니다";
  const nodes = rawNodes(catalog),
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
    if (!f.linkTo) {
      if (names.has(key)) return "같은 위치에 같은 이름의 폴더가 있습니다";
      names.add(key);
    }
    if (f.linkTo !== undefined && (typeof f.linkTo !== "string" || !f.linkTo))
      return "링크 원본을 확인하세요";
  }
  for (const f of nodes) {
    const path = folderPath(catalog, f.id);
    if (!path.length)
      return "폴더를 자기 자신이나 하위 폴더 안으로 이동할 수 없습니다";
    if (path.length > 4)
      return "상위 분류 아래에는 세부 폴더를 3단계까지 만들 수 있습니다";
  }
  const byId = new Map(nodes.map((f) => [f.id, f]));
  for (const f of nodes.filter((x) => x.linkTo)) {
    const source = byId.get(f.linkTo!);
    if (!source || source.linkTo)
      return "링크 원본 폴더가 없거나 다른 링크입니다";
    if (
      nodes.some((x) => x.parentId === f.id) ||
      catalog.products.some((p) => productFolder(catalog, p) === f.id)
    )
      return "링크 안의 항목은 원본 폴더에 저장해야 합니다";
  }
  const memo = new Map<string, { height: number; count: number }>();
  const visit = (
    id: string,
    seen: Set<string>,
  ): { height: number; count: number } => {
    if (seen.has(id))
      throw new Error(
        "폴더 링크가 순환합니다. 원본 자신이나 하위 폴더에는 링크를 만들 수 없습니다",
      );
    if (memo.has(id)) return memo.get(id)!;
    const f = byId.get(id)!;
    const next = new Set([...seen, id]);
    const children = f.linkTo
      ? []
      : nodes.filter((x) => x.parentId === id).map((x) => visit(x.id, next));
    const size = f.linkTo
      ? visit(f.linkTo, next)
      : {
          height: 1 + Math.max(0, ...children.map((x) => x.height)),
          count: 1 + children.reduce((n, x) => n + x.count, 0),
        };
    memo.set(id, size);
    return size;
  };
  try {
    const sizes = nodes
      .filter((x) => !x.parentId)
      .map((x) => visit(x.id, new Set()));
    if (sizes.some((x) => x.height > 4))
      return "링크를 포함해 상위 분류 아래 세부 폴더는 3단계까지 가능합니다";
    if (sizes.reduce((n, x) => n + x.count, 0) > 5000)
      return "링크를 펼친 폴더 수가 너무 많습니다 (최대 5000개)";
  } catch (e) {
    return (e as Error).message;
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
  folderId = sourceFolderId(catalog, folderId);
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
    folderTree: structuredClone(rawNodes(catalog)),
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
  if (catalogNodes(c).find((f) => f.id === id)?.linkTo || id.includes("~"))
    throw new Error("링크의 이름·색상은 원본 폴더에서 변경하세요");
  next.folderTree = next.folderTree!.map((f) =>
    f.id === id ? { ...f, name: name.trim(), color } : f,
  );
  return checked(next);
}
export function addFolder(c: Catalog, parentId: string, name: string) {
  if (parentId) parentId = sourceFolderId(c, parentId);
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
  next.folderTree = next.folderTree!.filter(
    (f) => !ids.has(f.id) && !(f.linkTo && ids.has(f.linkTo)),
  );
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
  if (id.includes("~"))
    throw new Error("연결된 하위 폴더는 원본 위치에서 이동하거나 복사하세요");
  if (parentId) parentId = sourceFolderId(c, parentId);
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
        ...(f.linkTo ? { linkTo: remap.get(f.linkTo) || f.linkTo } : {}),
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
      !f.linkTo &&
      !source.linkTo &&
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
    for (const f of next.folderTree!)
      if (f.linkTo === sourceId) f.linkTo = targetId;
    for (const p of next.products)
      if (p.folderId === sourceId) p.folderId = targetId;
    for (const child of next.folderTree!.filter(
      (f) => f.parentId === sourceId,
    )) {
      const duplicate = next.folderTree!.find(
        (f) =>
          !f.linkTo &&
          !child.linkTo &&
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

export function addFolderLink(c: Catalog, sourceId: string, parentId: string) {
  sourceId = sourceFolderId(c, sourceId);
  if (parentId) parentId = sourceFolderId(c, parentId);
  const next = editableTree(c),
    source = catalogNodes(c).find((f) => f.id === sourceId)!;
  const id = crypto.randomUUID();
  next.folderTree!.push({ id, parentId, name: source.name, linkTo: sourceId });
  return { catalog: checked(next), id };
}
export function dependentLinks(c: Catalog, id: string) {
  const ids = subtreeIds(c, id);
  return catalogNodes(c).filter(
    (f) => f.linkTo && ids.has(f.linkTo) && !ids.has(f.id),
  );
}

// Physical siblings define ordering; linked virtual children must be edited at source.
export function folderArrowTarget(
  c: Catalog,
  id: string,
  direction: "up" | "down" | "out" | "in",
) {
  const nodes = catalogNodes(c),
    node = nodes.find((f) => f.id === id);
  if (!node) return;
  const siblings = nodes.filter((f) => f.parentId === node.parentId),
    index = siblings.findIndex((f) => f.id === id);
  const previous = siblings[index - 1],
    next = siblings[index + 1];
  if (direction === "up" && previous)
    return { parentId: node.parentId, beforeId: previous.id };
  if (direction === "down" && next)
    return { parentId: node.parentId, afterId: next.id };
  if (direction === "in" && previous) return { parentId: previous.id };
  const parent = nodes.find((f) => f.id === node.parentId);
  if (direction === "out" && parent)
    return { parentId: parent.parentId, afterId: parent.id };
}
