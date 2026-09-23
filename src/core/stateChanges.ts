import { allowed, emptyQuote, type State, type User } from "./model";

export type StateChange = { section: keyof State; id: string; value: unknown };

/** Apply server-confirmed records without downloading unrelated history again. */
export function mergeStateChanges(state: State, changes: StateChange[]): State {
  const next = { ...state };
  for (const section of new Set(changes.map((c) => c.section))) {
    if (!(section in state)) continue;
    const updates = new Map(
      changes.filter((c) => c.section === section).map((c) => [c.id, c.value]),
    );
    const rows = state[section].map((row) => {
      const value = updates.get(row.id);
      updates.delete(row.id);
      return value || row;
    });
    (next[section] as unknown[]) = [...rows, ...updates.values()];
  }
  return next;
}

export function visibleChanges(
  changes: StateChange[],
  user: User,
): StateChange[] {
  return changes.flatMap((change) => {
    if (change.section === "catalogRevisions" || change.section === "users")
      return [];
    if (change.section === "notes" && !allowed(user, "note.read")) return [];
    if (
      ["ledger", "quoteConsents"].includes(change.section) &&
      !allowed(user, "money.read")
    )
      return [];
    if (
      change.section === "catalogs" &&
      !allowed(user, "catalog.edit") &&
      (change.value as State["catalogs"][number]).status !== "published"
    )
      return [];
    if (change.section === "consultations" && !allowed(user, "money.read"))
      return [
        {
          ...change,
          value: { ...(change.value as object), quote: emptyQuote() },
        },
      ];
    return [change];
  });
}

export function lightCatalog(
  catalog: State["catalogs"][number],
  products = true,
): State["catalogs"][number] {
  return {
    ...catalog,
    workspaceOnly: true,
    references: [],
    products: products
      ? catalog.products.map((p) => ({
          ...p,
          sources: [],
          options: p.options.map((o) => ({ ...o, sources: [] })),
        }))
      : [],
  };
}
