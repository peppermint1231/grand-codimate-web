import { expect, it } from "vitest";
import { CatalogSaveRetry } from "../src/lib/catalogSaveRetry";
import { threeCatalogs } from "./fixtures/catalogs";
const make = () => ({
  id: crypto.randomUUID(),
  type: "catalog.apply",
  entityId: crypto.randomUUID(),
  payload: {
    catalog: threeCatalogs()[0],
    guard: { workingId: "a", workingRev: 1, publishedId: "a" },
  },
});
it("reuses the complete command after an uncertain result even when the button generates a new entity ID", () => {
  const store = new CatalogSaveRetry();
  const first = store.get(make(), "user");
  const second = store.get(make(), "user");
  expect(second).toEqual(first);
  store.forget(first.id);
  expect(store.get(make(), "user").id).not.toBe(first.id);
});
it("isolates changed content, owners, and immutable retry payloads", () => {
  const store = new CatalogSaveRetry();
  const input = make();
  const first = store.get(input, "user");
  input.payload.catalog.products[0].name = "edited";
  expect(first.payload.catalog).not.toEqual(input.payload.catalog);
  const edited = { ...input, id: crypto.randomUUID() };
  expect(store.get(edited, "user").id).toBe(edited.id);
  expect(store.get(make(), "another").id).not.toBe(first.id);
});
