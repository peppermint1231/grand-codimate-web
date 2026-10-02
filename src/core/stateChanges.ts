import { allowed, emptyQuote, type State, type User } from "./model";

export type StateChange = { section: keyof State; id: string; value: unknown };

/** Only consent templates currently support physical deletion. */
export function isConsentDeletion(change: StateChange): boolean {
  return (
    change.section === "consents" &&
    typeof change.id === "string" &&
    change.id.length > 0 &&
    change.value === null
  );
}

export function diffStateChanges(before: State, after: State): StateChange[] {
  const changes: StateChange[] = [];
  for (const section of Object.keys(before) as (keyof State)[]) {
    if (section === "users") continue;
    const prior = new Map(before[section].map((v) => [v.id, v]));
    for (const v of after[section]) {
      if (
        prior.get(v.id) !== v &&
        JSON.stringify(prior.get(v.id)) !== JSON.stringify(v)
      )
        changes.push({ section, id: v.id, value: v });
      prior.delete(v.id);
    }
    if (section === "consents")
      for (const id of prior.keys()) changes.push({ section, id, value: null });
  }
  return changes;
}

/** Apply server-confirmed records without downloading unrelated history again. */
export function mergeStateChanges(state: State, changes: StateChange[]): State {
  const next = { ...state };
  for (const section of new Set(changes.map((c) => c.section))) {
    if (!(section in state)) continue;
    const updates = new Map(
      changes.filter((c) => c.section === section).map((c) => [c.id, c.value]),
    );
    const rows = state[section].flatMap((row) => {
      const value = updates.get(row.id);
      updates.delete(row.id);
      if (isConsentDeletion({ section, id: row.id, value })) return [];
      return [value || row];
    });
    (next[section] as unknown[]) = [
      ...rows,
      ...[...updates.values()].filter((value) => value != null),
    ];
  }
  return next;
}

export function visibleChanges(
  changes: StateChange[],
  user: User,
): StateChange[] {
  return changes.flatMap((change) => {
    if (change.value == null) return isConsentDeletion(change) ? [change] : [];
    if (change.section === "catalogRevisions" || change.section === "users")
      return [];
    if (change.section === "notes" && !allowed(user, "note.read")) return [];
    if (
      [
        "ledger",
        "quoteConsents",
        "vipAccounts",
        "pointEntries",
        "benefitAccounts",
      ].includes(change.section) &&
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
          value: {
            ...(change.value as object),
            quote: emptyQuote(),
            priceReasonHistory: [],
          },
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
