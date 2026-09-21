import { expect, it } from "vitest";
import {
  applyCommand,
  renewalQuote,
  validateCatalog,
} from "../src/core/domain";
import { emptyState, latestCatalog, latestCatalogs } from "../src/core/model";
import {
  folderError,
  folderPath,
  moveFolder,
  moveProducts,
} from "../src/core/catalogFolders";
import { publicProducts } from "../src/core/discovery";
import { catalogAdmin as admin, threeCatalogs } from "./fixtures/catalogs";
const command = (
  type: string,
  entityId: string,
  payload: any,
  baseRev?: number,
) => ({ id: crypto.randomUUID(), type, entityId, payload, baseRev });
it("maintains three independent current catalogs and accepts mixed selections in one consultation", async () => {
  let s = emptyState();
  s.catalogs = threeCatalogs();
  expect(latestCatalogs(s)).toHaveLength(3);
  expect(latestCatalog(s, "보험")?.id).toBe("catalog-1");
  s = await applyCommand(
    s,
    admin,
    command("patient.create", "patient", {
      name: "시험",
      sex: "F",
      dob: "1990-01-01",
      phone: "01000000000",
      address: "시험동",
    }),
  );
  s = await applyCommand(
    s,
    admin,
    command("consultation.create", "consult", {
      patientId: "patient",
      category: "미용",
    }),
  );
  const lines = s.catalogs.map((c) => ({
    id: c.id,
    productId: c.products[0].id,
    optionId: c.products[0].options[0].id,
    catalogVersion: c.version,
    book: c.book,
    quantity: 1,
    discount: { kind: "amount", value: 0 },
  }));
  const payload = {
    lines,
    catalogVersion: "version-0",
    catalogVersions: s.consultations[0].catalogVersions,
    discount: { kind: "amount", value: 0 },
    vat: "separate",
    photos: [],
  };
  s = await applyCommand(
    s,
    admin,
    command("consultation.save", "consult", payload, 1),
  );
  expect(s.consultations[0].quote.total).toBe(24800);
  expect(s.consultations[0].quote.lines.map((l) => l.book)).toEqual([
    "미용",
    "보험",
    "이벤트",
  ]);
  s.catalogs.push({
    ...s.catalogs[2],
    id: "new-event",
    version: "new-event",
    publishedAt: "2026-09-22",
    products: s.catalogs[2].products.map((p) => ({
      ...p,
      options: p.options.map((o) => ({ ...o, price: 99999 })),
    })),
  });
  s = await applyCommand(
    s,
    admin,
    command(
      "consultation.save",
      "consult",
      { ...payload, lines: s.consultations[0].quote.lines },
      2,
    ),
  );
  expect(s.consultations[0].quote.total).toBe(24800);
  expect(
    renewalQuote(s.consultations[0], latestCatalogs(s), "renew").lines[2].price,
  ).toBe(99999);
  await expect(
    applyCommand(
      s,
      admin,
      command(
        "consultation.save",
        "consult",
        { ...payload, lines: [{ ...lines[0], book: "보험" }] },
        3,
      ),
    ),
  ).rejects.toThrow("구분과 버전");
});
it("keeps untagged historical catalogs in the cosmetic book", () => {
  const s = emptyState();
  const c = threeCatalogs()[0];
  delete c.book;
  s.catalogs = [c];
  expect(latestCatalog(s)?.id).toBe(c.id);
  expect(latestCatalog(s, "보험")).toBeUndefined();
});
it("supports three subfolder levels and rejects cycles, excessive depth and missing destinations", () => {
  const c = threeCatalogs()[0];
  c.folders = [
    { id: "a", parentId: "pigment", name: "1단계" },
    { id: "b", parentId: "a", name: "2단계" },
    { id: "c", parentId: "b", name: "3단계" },
  ];
  expect(folderError(c)).toBeUndefined();
  expect(folderPath(c, "c")).toHaveLength(4);
  expect(() => moveFolder(c, "a", "c")).toThrow();
  expect(() => moveFolder(c, "pigment", "acne")).toThrow("고정");
  expect(() => moveProducts(c, ["product-0"], "missing")).toThrow();
  const moved = moveProducts(c, ["product-0"], "c");
  expect(moved.products[0].folderId).toBe("c");
  expect(c.products[0].folderId).toBe("pigment");
  expect(
    folderError({
      ...c,
      folders: [...c.folders, { id: "d", parentId: "c", name: "4단계" }],
    }),
  ).toContain("3단계");
  expect(() =>
    validateCatalog({
      ...c,
      products: [{ ...c.products[0], folderId: "missing" }],
    }),
  ).toThrow("폴더");
});
it("public projection hides drafts, internal notes, evidence and unverified prices", () => {
  const s = emptyState();
  s.catalogs = threeCatalogs();
  s.catalogs[1].products[0].active = false;
  s.catalogs[2].status = "draft";
  const publicRows = publicProducts(s);
  expect(publicRows).toHaveLength(2);
  expect(publicRows[1].options[0].price).toBeNull();
  const json = JSON.stringify(publicRows);
  for (const text of ["내부", "비공개", "원본 근거", "sources", "issues"])
    expect(json).not.toContain(text);
  s.catalogs[0].products[0].publicVisible = false;
  expect(publicProducts(s)).toHaveLength(1);
});
