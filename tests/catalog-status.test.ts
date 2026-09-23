import { expect, it } from "vitest";
import {
  catalogHasChanges,
  catalogTime,
  catalogVersionLabel,
} from "../src/core/catalogStatus";
import { bulkEditCatalogProducts } from "../src/core/catalogProducts";
import { applyCommand } from "../src/core/domain";
import { emptyState, latestCatalog } from "../src/core/model";
import { threeCatalogs, catalogAdmin } from "./fixtures/catalogs";
it("distinguishes new, edited, saved and reverted drafts independently of editing mode", () => {
  const c = threeCatalogs()[0];
  c.status = "draft";
  const saved = structuredClone(c);
  expect(catalogHasChanges(c)).toBe(true);
  expect(catalogHasChanges(c, saved)).toBe(false);
  c.products[0].name = "changed";
  expect(catalogHasChanges(c, saved)).toBe(true);
  expect(catalogHasChanges(structuredClone(saved), saved)).toBe(false);
  expect(catalogHasChanges({ ...c, status: "published" })).toBe(false);
});
it("shows actual draft save time rather than inherited version time and uses explicit Seoul time across date boundaries", () => {
  const c = threeCatalogs()[0];
  c.status = "draft";
  c.version = "2026-09-20T01:00:00.000Z-old";
  c.updatedAt = "2026-09-23T20:04:03.494Z";
  const label = catalogVersionLabel(c);
  expect(label).toContain("초안 · 저장");
  expect(label).toContain("2026. 09. 24. 05:04:03");
  expect(label).toContain("한국시간");
  expect(label).not.toContain(c.version);
  c.status = "published";
  c.publishedAt = "2026-09-22T15:30:00Z";
  expect(catalogVersionLabel(c)).toContain("2026. 09. 23. 00:30:00");
  expect(catalogTime("invalid")).toBe("시간 정보 없음");
});
it("requires reviewed prices for bulk activation and keeps activation distinct from discovery visibility", () => {
  const c = threeCatalogs()[2];
  c.status = "draft";
  c.products[0].active = false;
  c.products[0].publicVisible = false;
  c.products[0].options[0].review = true;
  expect(() =>
    bulkEditCatalogProducts(c, [c.products[0].id], { active: true }),
  ).toThrow("검토완료");
  const next = bulkEditCatalogProducts(c, [c.products[0].id], {
    active: true,
    completeReview: true,
  });
  expect(next.products[0].active).toBe(true);
  expect(next.products[0].publicVisible).toBe(false);
  expect(c.products[0].active).toBe(false);
  next.products[0].options[0].tax = "unknown";
  expect(() =>
    bulkEditCatalogProducts(next, [next.products[0].id], { active: true }),
  ).toThrow();
  expect(
    bulkEditCatalogProducts(next, [next.products[0].id], { active: false })
      .products[0].active,
  ).toBe(false);
});
it("only makes activated event products available in the published catalog after explicit publication", async () => {
  let s = emptyState();
  const published = threeCatalogs()[2];
  published.products[0].active = false;
  s.catalogs = [published];
  const draft = {
    ...structuredClone(published),
    id: "event-draft",
    status: "draft" as const,
  };
  const next = bulkEditCatalogProducts(draft, [draft.products[0].id], {
    active: true,
  });
  s = await applyCommand(s, catalogAdmin, {
    id: crypto.randomUUID(),
    type: "catalog.save",
    entityId: draft.id,
    payload: { catalog: next },
  });
  expect(latestCatalog(s, "이벤트")!.products[0].active).toBe(false);
  s = await applyCommand(s, catalogAdmin, {
    id: crypto.randomUUID(),
    type: "catalog.publish",
    entityId: draft.id,
    baseRev: 1,
    payload: {},
  });
  expect(latestCatalog(s, "이벤트")!.products[0].active).toBe(true);
});

it("refreshes only an empty consultation book and preserves other cart prices and unsaved notes", async () => {
  const { refreshConsultationBook } = await import("../src/core/catalogStatus");
  const { emptyQuote } = await import("../src/core/model");
  const c = {
    catalogVersion: "beauty-old",
    catalogVersions: { 미용: "beauty-old", 이벤트: "event-old" },
    memo: "작성 중",
    quote: { ...emptyQuote(), lines: [{ book: "미용", price: 12345 }] },
  } as any;
  const event = threeCatalogs()[2];
  const next = refreshConsultationBook(c, event);
  expect(next.catalogVersions?.["이벤트"]).toBe(event.version);
  expect(next.catalogVersions?.["미용"]).toBe("beauty-old");
  expect(next.quote).toBe(c.quote);
  expect(next.memo).toBe("작성 중");
  expect(c.catalogVersions["이벤트"]).toBe("event-old");
  expect(() => refreshConsultationBook(c, threeCatalogs()[0])).toThrow(
    "먼저 제거",
  );
  expect(() =>
    refreshConsultationBook(c, { ...event, status: "draft" }),
  ).toThrow("게시");
});
