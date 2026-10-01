import { expect, it } from "vitest";
import { offeringErrors, offeringSchema } from "../src/core/offerings";
import { threeCatalogs, catalogAdmin } from "./fixtures/catalogs";
import { emptyState } from "../src/core/model";
import { applyCommand } from "../src/core/domain";
import { catalogApplyGuard } from "../src/core/catalogApply";
const empty = { name: " ", quantity: 1, unit: "회" };
const offering = {
  kind: "membership",
  items: [empty],
  terms: "혜택",
  creditAmount: 1000000,
};
it("ignores an untouched optional membership row and preserves configured benefits", () => {
  expect(offeringSchema.parse(offering)).toMatchObject({
    items: [],
    creditAmount: 1000000,
    terms: "혜택",
  });
  expect(offeringErrors(offering)).toEqual([]);
});
it("does not discard partial entries, and names the original row in Korean", () => {
  expect(
    offeringErrors({ ...offering, items: [empty, { ...empty, quantity: 3 }] }),
  ).toEqual([expect.stringContaining("구성 2: 시술·혜택 이름")]);
  expect(
    offeringErrors({
      ...offering,
      items: [{ name: "레이저", quantity: 0, unit: "회" }],
    }),
  ).toEqual([expect.stringContaining("수량")]);
});
it("saves membership placeholders without raw schema errors and rejects incomplete real entries", async () => {
  const s = emptyState();
  s.catalogs = threeCatalogs();
  s.users = [catalogAdmin];
  const c = structuredClone(s.catalogs[0]);
  c.status = "draft";
  c.products[0].offering = structuredClone(offering) as any;
  const command = (catalog: typeof c) => ({
    id: crypto.randomUUID(),
    type: "catalog.apply",
    entityId: c.id,
    baseRev: c.rev,
    payload: { catalog, guard: catalogApplyGuard(s, c.book!) },
  });
  const saved = await applyCommand(s, catalogAdmin, command(c));
  expect(
    saved.catalogs.find((x) => x.products[0].offering)!.products[0].offering!
      .items,
  ).toEqual([]);
  c.products[0].offering!.items[0].quantity = 3;
  await expect(applyCommand(s, catalogAdmin, command(c))).rejects.toThrow(
    "구성 1: 시술·혜택 이름",
  );
});

it("validates and normalizes option-specific membership benefits with option context", async () => {
  const s = emptyState();
  s.catalogs = threeCatalogs();
  s.users = [catalogAdmin];
  const c = structuredClone(s.catalogs[0]);
  c.status = "draft";
  c.products[0].options[0].label = "GOLD";
  c.products[0].options[0].offering = structuredClone(offering) as any;
  const command = () => ({
    id: crypto.randomUUID(),
    type: "catalog.apply",
    entityId: c.id,
    baseRev: c.rev,
    payload: { catalog: c, guard: catalogApplyGuard(s, c.book!) },
  });
  const saved = await applyCommand(s, catalogAdmin, command());
  expect(
    saved.catalogs.find((c) => c.products[0].options[0].offering)!.products[0]
      .options[0].offering!.items,
  ).toEqual([]);
  c.products[0].options[0].offering!.items[0].quantity = 2;
  await expect(applyCommand(s, catalogAdmin, command())).rejects.toThrow(
    "GOLD: 구성 1",
  );
});
