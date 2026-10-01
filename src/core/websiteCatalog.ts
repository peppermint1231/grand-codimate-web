import { z } from "zod";
import {
  catalogBook,
  type Catalog,
  type Product,
  type State,
  type WebsiteListing,
} from "./model";
import {
  EVENT_LIST_URL,
  EVENT_ORIGIN,
  isEventBanner,
  safeEventImage,
  eventAvailability,
  mergeWebsiteEvents,
  type WebsiteEvent,
} from "./eventCatalog";
import { addMissingWebsiteBeauty } from "./websiteBeauty";
import { productReviewIssues } from "./catalogProducts";
import { withBeautyRootLabels } from "./catalogClassification";

export const workingCatalog = (state: State, book: "미용" | "이벤트") =>
  state.catalogs
    .filter((c) => catalogBook(c) === book)
    .sort(
      (a, b) =>
        a.updatedAt.localeCompare(b.updatedAt) || a.id.localeCompare(b.id),
    )
    .at(-1);

const price = z.number().int().min(0).max(1_000_000_000).nullable();
const numericId = z.string().regex(/^\d{1,10}$/);
const sourceUrl = z
  .string()
  .max(1000)
  .refine((s) => s.startsWith(EVENT_ORIGIN + "/clinicPrice/clinicView.php?"));
const sourceDate = z
  .string()
  .regex(/^20\d{2}-\d{2}-\d{2}$/)
  .refine(
    (s) =>
      !Number.isNaN(Date.parse(s)) &&
      new Date(s).toISOString().slice(0, 10) === s,
  );
export const websiteListingSchema = z.object({
  pageId: numericId,
  offerId: numericId,
  optionId: z.string().optional(),
  name: z.string().max(1000),
  description: z.string().max(10000),
  url: sourceUrl,
  book: z.enum(["미용", "이벤트"]),
  price,
  regularPrice: price,
  tax: z.enum(["unknown", "inclusive", "exclusive", "exempt"]),
  checkedAt: z.string().refine((s) => !Number.isNaN(Date.parse(s))),
  missing: z.boolean(),
  changed: z.boolean(),
  priceDiffers: z.boolean(),
});
export const websitePagesSchema = z
  .array(
    z.object({
      id: numericId,
      categoryId: numericId,
      categoryName: z.string().max(200),
      name: z.string().min(1).max(300),
      description: z.string().max(10000),
      period: z.string().max(500),
      startsOn: sourceDate.optional(),
      endsOn: sourceDate.optional(),
      url: sourceUrl,
      posterUrls: z
        .array(
          z
            .string()
            .max(2000)
            .refine((s) => safeEventImage(s) === s),
        )
        .max(30),
      offers: z
        .array(
          z.object({
            id: numericId,
            name: z.string().min(1).max(1000),
            description: z.string().max(10000),
            price,
            regularPrice: price,
            discountRate: z.number().min(0).max(100).nullable(),
            priceText: z.string().max(2000),
            tax: z.enum(["unknown", "inclusive", "exclusive", "exempt"]),
            issues: z.array(z.string().max(1000)).max(50),
          }),
        )
        .min(1)
        .max(2000),
    }),
  )
  .min(1)
  .max(400)
  .superRefine((pages, ctx) => {
    if (new Set(pages.map((p) => p.id)).size !== pages.length)
      ctx.addIssue({ code: "custom", message: "배너 ID가 중복됩니다" });
    for (const p of pages)
      if (new Set(p.offers.map((o) => o.id)).size !== p.offers.length)
        ctx.addIssue({ code: "custom", message: "상품 ID가 중복됩니다" });
    if (pages.reduce((n, p) => n + p.offers.length, 0) > 10000)
      ctx.addIssue({
        code: "custom",
        message: "홈페이지 상품 수가 제한을 넘었습니다",
      });
  });

type Association = {
  id: string;
  pageId: string;
  offerId: string;
  optionId?: string;
};
export function checkWebsiteListings(
  catalog: Catalog,
  pages: WebsiteEvent[],
  now: string,
  associations: Association[] = [],
) {
  const offers = new Map<
    string,
    { page: WebsiteEvent; offer: WebsiteEvent["offers"][number] }
  >(
    pages.flatMap((page) =>
      page.offers.map(
        (offer) => [`${page.id}:${offer.id}`, { page, offer }] as const,
      ),
    ),
  );
  for (const p of catalog.products) {
    const links = new Map<
      string,
      { pageId: string; offerId: string; optionId?: string }
    >();
    for (const link of p.websiteListings || [])
      links.set(`${link.pageId}:${link.offerId}`, link);
    if (p.webEvent)
      links.set(`${p.webEvent.eventId}:${p.webEvent.offerId}`, {
        pageId: p.webEvent.eventId,
        offerId: p.webEvent.offerId,
        optionId: p.options[0]?.id,
      });
    // Backfill links for website candidates created before the combined refresh.
    for (const source of p.sources) {
      try {
        const u = new URL(source.sheet);
        const id = u.searchParams.get("i");
        if (
          u.origin === EVENT_ORIGIN &&
          u.pathname === "/clinicPrice/clinicView.php" &&
          id &&
          /^\d{1,10}$/.test(id) &&
          /^\d{1,10}$/.test(source.cell)
        )
          if (!links.has(`${id}:${source.cell}`))
            links.set(`${id}:${source.cell}`, {
              pageId: id,
              offerId: source.cell,
              optionId: p.options.length === 1 ? p.options[0].id : undefined,
            });
      } catch {}
    }
    for (const a of associations.filter((a) => a.id === p.id))
      links.set(`${a.pageId}:${a.offerId}`, a);
    if (!links.size) continue;
    p.websiteListings = [...links].map(([key, ref]) => {
      const old = p.websiteListings?.find(
          (l) => `${l.pageId}:${l.offerId}` === key,
        ),
        hit = offers.get(key);
      if (!hit)
        return {
          ...(old || {
            pageId: ref.pageId,
            offerId: ref.offerId,
            optionId: ref.optionId,
            name: p.name,
            description: "",
            url: EVENT_ORIGIN + `/clinicPrice/clinicView.php?i=${ref.pageId}`,
            book: catalogBook(catalog) === "이벤트" ? "이벤트" : "미용",
            price: null,
            regularPrice: null,
            tax: "unknown",
            changed: false,
            priceDiffers: false,
          }),
          checkedAt: now,
          missing: true,
        } as WebsiteListing;
      const { page, offer } = hit;
      const book =
        isEventBanner(page.name, page.categoryName) || isEventBanner(offer.name)
          ? "이벤트"
          : "미용";
      const option = p.options.find((o) => o.id === ref.optionId);
      const fields = {
        name: offer.name,
        description: offer.description,
        price: offer.price,
        regularPrice: offer.regularPrice,
        tax: offer.tax,
        book,
      };
      const changed =
        !!old &&
        Object.keys(fields).some(
          (k) =>
            old[k as keyof WebsiteListing] !== fields[k as keyof typeof fields],
        );
      return {
        pageId: page.id,
        offerId: offer.id,
        optionId: ref.optionId,
        ...fields,
        book,
        url: page.url,
        checkedAt: now,
        missing: false,
        changed,
        priceDiffers:
          !!option &&
          (option.price !== offer.price ||
            (option.tax !== "unknown" &&
              offer.tax !== "unknown" &&
              option.tax !== offer.tax)),
      };
    });
  }
  catalog.websiteImport = {
    sourceUrl: EVENT_LIST_URL,
    checkedAt: now,
    pageCount: pages.length,
    offerCount: pages.reduce((n, p) => n + p.offers.length, 0),
  };
}
export const websiteReviewNeeded = (p: Product) =>
  !!p.websiteListings?.some((l) => !l.missing && (l.changed || l.priceDiffers));

export function mergeWebsiteCatalogs(
  beauty: Catalog,
  event: Catalog | undefined,
  pages: WebsiteEvent[],
  now = new Date().toISOString(),
) {
  if (catalogBook(beauty) !== "미용")
    throw new Error("기준 미용 SSOT가 필요합니다.");
  if (!pages.length || !pages.some((p) => p.offers.length))
    throw new Error("홈페이지 전체 조회가 완료되지 않았습니다.");
  const b = addMissingWebsiteBeauty(beauty, pages, now);
  const e = mergeWebsiteEvents(event, pages, now, beauty, true);
  const eventCatalog = withBeautyRootLabels(e.catalog, beauty);
  checkWebsiteListings(b.catalog, pages, now, b.decisions);
  checkWebsiteListings(eventCatalog, pages, now);
  for (const c of [b.catalog, eventCatalog]) {
    c.id = crypto.randomUUID();
    c.rev = 0;
    c.status = "draft";
    c.createdAt = now;
    c.updatedAt = now;
    delete c.publishedAt;
    c.version = "홈페이지 통합 갱신 · " + now.slice(0, 10);
  }
  return {
    beauty: b.catalog,
    event: eventCatalog,
    beautyDecisions: b.decisions,
    summary: {
      beauty: {
        added: b.added,
        existing: b.existing,
        review: b.catalog.products.filter(websiteReviewNeeded).length,
        missing: b.catalog.products.filter(
          (p) =>
            p.websiteListings?.length &&
            p.websiteListings.every((l) => l.missing),
        ).length,
      },
      event: e.summary,
    },
  };
}

export type WebsiteBases = Record<
  "beauty" | "event",
  { id: string; rev: number; publishedId: string }
>;

export const homepageSyncOptionsSchema = z.object({
  activate: z.boolean().default(false),
  publish: z.boolean().default(false),
  unknownTax: z
    .enum(["unknown", "inclusive", "exclusive", "exempt"])
    .default("exclusive"),
});
export type HomepageSyncOptions = z.infer<typeof homepageSyncOptionsSchema>;

/** Replace the working product set with the complete website scan; old versions remain immutable. */
export function mergeHomepageCatalog(
  beauty: Catalog,
  base: Catalog | undefined,
  pages: WebsiteEvent[],
  now = new Date().toISOString(),
) {
  if (catalogBook(beauty) !== "미용")
    throw new Error("기준 미용 SSOT가 필요합니다.");
  if (!pages.length || !pages.some((p) => p.offers.length))
    throw new Error("홈페이지 전체 조회가 완료되지 않았습니다.");
  // Start fresh so removed, duplicated and manually inserted products cannot linger.
  const result = mergeWebsiteEvents(
    base && { ...base, products: [] },
    pages,
    now,
    beauty,
    false,
    "all",
  );
  const oldBySource = new Map(
    (base?.products || [])
      .filter((p) => p.webEvent)
      .map((p) => [p.webEvent!.eventId + ":" + p.webEvent!.offerId, p]),
  );
  const retained = new Set<string>();
  result.summary.added = result.summary.changed = result.summary.unchanged = 0;
  for (const product of result.catalog.products) {
    const info = product.webEvent!;
    const old = oldBySource.get(info.eventId + ":" + info.offerId);
    if (!old) {
      result.summary.added++;
      continue;
    }
    retained.add(old.id);
    product.id = old.id;
    product.createdAt = old.createdAt;
    product.rev = old.rev + 1;
    product.publicVisible = old.publicVisible;
    if (
      result.catalog.folderTree?.some((f) => f.id === old.folderId && !f.linkTo)
    )
      product.folderId = old.folderId;
    const option = product.options[0],
      prior = old.options[0];
    if (prior) {
      option.id = prior.id;
      // Keep an explicitly reviewed tax decision only when the source still omits VAT.
      if (
        option.tax === "unknown" &&
        !prior.review &&
        prior.tax !== "unknown" &&
        old.websiteListings?.[0]?.tax === "unknown"
      )
        option.tax = prior.tax;
    }
    const same =
      old.webEvent?.sourceSignature === info.sourceSignature &&
      old.name === product.name &&
      old.options.length === 1 &&
      prior?.price === option.price &&
      prior?.regularPrice === undefined;
    if (same) {
      result.summary.unchanged++;
      option.review = prior.review;
      product.active = old.active && eventAvailability(info, now) === "current";
    } else result.summary.changed++;
  }
  result.summary.missing = (base?.products || []).filter(
    (p) => !retained.has(p.id),
  ).length;
  // Discard empty generated folders, including nested generated folders from previous scans.
  let nodes = result.catalog.folderTree || [];
  while (true) {
    const next = nodes.filter(
      (f) =>
        !f.id.startsWith("grand4-folder-") ||
        result.catalog.products.some((p) => p.folderId === f.id) ||
        nodes.some((n) => n.parentId === f.id || n.linkTo === f.id),
    );
    if (next.length === nodes.length) break;
    nodes = next;
  }
  result.catalog.folderTree = nodes;
  result.summary.review = result.catalog.products.filter((p) =>
    p.options.some((o) => o.review),
  ).length;
  result.catalog = withBeautyRootLabels(result.catalog, beauty);
  checkWebsiteListings(result.catalog, pages, now);
  result.catalog.websiteImport!.scope = "all";
  result.catalog.version = "홈페이지 갱신 · " + now.slice(0, 10);
  return result;
}

/** Explicit one-step activation never invents a missing price or VAT policy. */
export function activateHomepageCatalog(
  catalog: Catalog,
  options: HomepageSyncOptions,
  now = new Date().toISOString(),
) {
  const candidate = structuredClone(catalog);
  const skipped: { id: string; name: string; reasons: string[] }[] = [];
  let activated = 0;
  for (const product of candidate.products) {
    for (const option of product.options) {
      if (
        option.tax === "unknown" ||
        (options.unknownTax !== "unknown" &&
          product.websiteListings?.some(
            (link) =>
              !link.missing &&
              link.optionId === option.id &&
              link.tax === "unknown",
          ))
      )
        option.tax = options.unknownTax;
    }
    const reasons = productReviewIssues(product);
    const availability = eventAvailability(product.webEvent, now);
    if (!product.webEvent || product.webEvent.missing)
      reasons.push("현재 홈페이지 상품이 아닙니다");
    if (availability === "ended") reasons.push("게시 기간 종료");
    if (availability === "upcoming") reasons.push("게시 시작 전");
    const sourceIssues = product.options.flatMap((o) =>
      o.issues.filter(
        (i) =>
          i !== "홈페이지 가져오기 검토" &&
          i !== "부가세 미표기 · 항목별 확인 필요",
      ),
    );
    reasons.push(...sourceIssues);
    product.active = !reasons.length;
    if (reasons.length)
      skipped.push({
        id: product.id,
        name: product.name,
        reasons: [...new Set(reasons)],
      });
    else {
      activated++;
      for (const option of product.options) {
        option.review = false;
        option.issues = [];
      }
    }
  }
  return { catalog: candidate, activated, skipped };
}

/** Restore the hospital-maintained book without rewriting its products, prices or taxonomy. */
export function independentBeautyCatalog(base: Catalog): Catalog {
  if (catalogBook(base) !== "미용") throw new Error("미용 SSOT를 선택하세요.");
  const catalog = structuredClone(base);
  delete catalog.websiteImport;
  catalog.products = catalog.products
    .filter((p) => !/^grand4-beauty-\d+-\d+$/.test(p.id))
    .map((p) => {
      delete p.websiteListings;
      delete p.webEvent;
      return p;
    });
  catalog.folderTree = catalog.folderTree?.filter(
    (f) =>
      !/^website-additions-\d+$/.test(f.id) ||
      catalog.products.some((p) => p.folderId === f.id) ||
      catalog.folderTree?.some(
        (other) => other.parentId === f.id || other.linkTo === f.id,
      ),
  );
  return catalog;
}
