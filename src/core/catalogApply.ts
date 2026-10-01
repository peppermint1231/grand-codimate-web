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
