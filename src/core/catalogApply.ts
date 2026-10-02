import { z } from "zod";
import {
  catalogBook,
  latestCatalog,
  type CatalogBook,
  type State,
} from "./model";
export const catalogApplyGuardSchema = z.object({
  publishedId: z.string(),
  workingId: z.string(),
  workingRev: z.number().int().min(0),
});
export type CatalogApplyGuard = z.infer<typeof catalogApplyGuardSchema>;
export function catalogApplyGuard(
  state: Pick<State, "catalogs">,
  book: CatalogBook,
): CatalogApplyGuard {
  const current = state.catalogs
    .filter((c) => catalogBook(c) === book)
    .sort(
      (a, b) =>
        a.updatedAt.localeCompare(b.updatedAt) || a.id.localeCompare(b.id),
    )
    .at(-1);
  return {
    publishedId: latestCatalog(state as State, book)?.id || "",
    workingId: current?.id || "",
    workingRev: current?.rev || 0,
  };
}

/** Compare editable content, ignoring server-owned version/operation metadata. */
export function sameCatalogContent(
  a: State["catalogs"][number],
  b: State["catalogs"][number],
) {
  const content = (c: State["catalogs"][number]) => {
    const {
      id,
      rev,
      createdAt,
      updatedAt,
      authorId,
      version,
      status,
      publishedAt,
      workspaceOnly,
      ...editable
    } = c;
    return {
      ...editable,
      products: c.products.map((p) => ({
        ...p,
        options: p.options.map((o) => (p.active ? { ...o, review: false } : o)),
      })),
    };
  };
  return JSON.stringify(content(a)) === JSON.stringify(content(b));
}
