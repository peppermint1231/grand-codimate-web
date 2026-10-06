import type { Catalog, CatalogFolder } from "./model";
import {
  catalogNodes,
  folderError,
  folderPath,
  productFolder,
  productFolderPaths,
} from "./catalogFolders";
import {
  patientConcerns,
  patientMatchEvidence,
  rootPatterns,
} from "./patientDiscovery";

const hash = (value: string) => {
  let n = 2166136261;
  for (const ch of value) n = Math.imul(n ^ ch.charCodeAt(0), 16777619);
  return (n >>> 0).toString(36);
};
/** Add shared folders without copying a product or changing its commercial data.
 * Only machine-owned links are rebuilt. User links and original folders survive.
 * Mixed folders are split into explicit subsets, never linked wholesale.
 */
export function syncRecommendationLinks(input: Catalog) {
  const catalog = structuredClone(input);
  const nodes: CatalogFolder[] = catalogNodes(catalog).filter(
    (f) => !f.id.startsWith("rec-link-"),
  );
  catalog.folderTree = nodes;
  delete catalog.folders;
  const base = structuredClone(catalog);
  const added: string[] = [],
    skipped: string[] = [];
  const rootFor = (concernId: string, existing: Set<string | undefined>) => {
    const key = concernId.slice(8),
      pattern = rootPatterns[key];
    const roots = nodes.filter((f) => !f.parentId && !f.linkTo);
    const exact = roots.filter((f) => pattern?.test(f.name));
    const current = exact.find((f) => existing.has(f.id));
    if (current) return current.id;
    const titled = roots.find(
      (f) => f.name === patientConcerns.find((c) => c.id === concernId)!.name,
    );
    if (titled) return titled.id;
    if (exact.length === 1) return exact[0].id;
    if (key === "scar") {
      const pores = roots.find((f) => /모공|작은흉터/.test(f.name));
      if (pores) return pores.id;
    }
    const id = "rec-root-" + key;
    if (!nodes.some((f) => f.id === id))
      nodes.push({
        id,
        parentId: "",
        name: patientConcerns.find((c) => c.id === concernId)!.name,
      });
    return id;
  };
  const groups = new Map<
    string,
    { folder: string; targets: string[]; ids: string[] }
  >();
  for (const product of base.products) {
    const paths = productFolderPaths(base, product);
    const existing = new Set(paths.map((path) => path[0]?.id));
    const targets = [
      ...new Set(
        patientMatchEvidence(product, paths).map((m) =>
          rootFor(m.concernId, existing),
        ),
      ),
    ]
      .filter((id) => !existing.has(id))
      .sort();
    if (!targets.length) continue;
    const folder = productFolder(base, product),
      key = JSON.stringify([folder, targets]);
    if (!groups.has(key)) groups.set(key, { folder, targets, ids: [] });
    groups.get(key)!.ids.push(product.id);
  }
  for (const [key, group] of groups) {
    const source = nodes.find((f) => f.id === group.folder);
    if (!source || source.linkTo) {
      skipped.push(...group.ids);
      continue;
    }
    let sourceId = source.id;
    const whole =
      base.products
        .filter((p) => productFolder(base, p) === source.id)
        .every((p) => group.ids.includes(p.id)) &&
      !nodes.some((f) => f.parentId === source.id);
    if (nodes.length + group.targets.length + (whole ? 0 : 1) > 500) {
      skipped.push(...group.ids);
      continue;
    }
    if (!whole) {
      if (
        folderPath(base, source.id).length >= 4 ||
        base.products
          .filter((p) => group.ids.includes(p.id))
          .some((p) =>
            productFolderPaths(base, p).some((path) => path.length >= 4),
          )
      ) {
        skipped.push(...group.ids);
        continue;
      }
      sourceId = "rec-group-" + hash(key);
      const first = catalog.products.find((p) => p.id === group.ids[0])!;
      if (!nodes.some((f) => f.id === sourceId))
        nodes.push({
          id: sourceId,
          parentId: source.id,
          name: `${first.name.replace(/[\\/]/g, "·").slice(0, 45)}${group.ids.length > 1 ? ` 외 ${group.ids.length - 1}종` : ""}`,
        });
    }
    for (const p of catalog.products.filter((p) => group.ids.includes(p.id))) {
      p.folderId = sourceId;
    }
    for (const target of group.targets)
      nodes.push({
        id: "rec-link-" + hash(sourceId + ":" + target),
        parentId: target,
        name: nodes.find((f) => f.id === sourceId)!.name,
        linkTo: sourceId,
      });
    added.push(...group.ids);
  }
  // Empty generated destinations are not useful; keep all user-owned roots.
  catalog.folderTree = nodes.filter(
    (f) =>
      !f.id.startsWith("rec-root-") ||
      nodes.some((n) => n.parentId === f.id) ||
      catalog.products.some((p) => p.folderId === f.id),
  );
  // Preserve manual order; deterministic generated order prevents history churn.
  catalog.folderTree = [
    ...catalog.folderTree.filter((f) => !/^rec-(link|group|root)-/.test(f.id)),
    ...catalog.folderTree
      .filter((f) => /^rec-(link|group|root)-/.test(f.id))
      .sort((a, b) => a.id.localeCompare(b.id)),
  ];
  const error = folderError(catalog);
  if (error) throw new Error(error);
  return {
    catalog,
    added: [...new Set(added)],
    skipped: [...new Set(skipped)],
  };
}
