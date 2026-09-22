import type { Catalog, Option, Product } from "./model";
import { catalogNodes, inferRoot, rootFolders } from "./catalogFolders";
export const EVENT_ORIGIN = "https://www.grand4.co.kr";
export const EVENT_LIST_URL = EVENT_ORIGIN + "/clinicPrice/eventListLeft.php";
export const isEventBanner = (name: string, categoryName = "") =>
  name.includes("이벤트") || categoryName.includes("이벤트");
export interface EventCategory {
  id: string;
  name: string;
}
export interface EventItem {
  id: string;
  categoryId: string;
  categoryName: string;
  name: string;
}
export interface EventPage {
  categories: EventCategory[];
  items: EventItem[];
  pages: number[];
}
export interface EventOffer {
  id: string;
  name: string;
  description: string;
  price: number | null;
  regularPrice: number | null;
  discountRate: number | null;
  priceText: string;
  tax: Option["tax"];
  issues: string[];
}
export interface WebsiteEvent {
  id: string;
  categoryId: string;
  categoryName: string;
  name: string;
  description: string;
  period: string;
  startsOn?: string;
  endsOn?: string;
  url: string;
  posterUrls: string[];
  offers: EventOffer[];
}
export interface EventOriginInfo {
  provider: "grand4";
  eventId: string;
  offerId: string;
  eventName: string;
  categoryName?: string;
  url: string;
  posterUrls: string[];
  period: string;
  startsOn?: string;
  endsOn?: string;
  regularPrice: number | null;
  discountRate: number | null;
  salePrice: number | null;
  priceText: string;
  sourceSignature: string;
  checkedAt: string;
  missing?: boolean;
}
export function safeEventImage(value: string): string | undefined {
  try {
    const u = new URL(value, EVENT_ORIGIN);
    if (
      u.origin !== EVENT_ORIGIN ||
      u.username ||
      u.password ||
      !u.pathname.startsWith("/uploadFiles/") ||
      !/\.(?:png|jpe?g|webp|gif)$/i.test(u.pathname)
    )
      return;
    return u.href;
  } catch {
    return;
  }
}
export function eventAvailability(
  info?: Pick<EventOriginInfo, "startsOn" | "endsOn" | "missing">,
  now = new Date().toISOString(),
): "current" | "upcoming" | "ended" | "missing" {
  if (!info) return "current";
  if (info.missing) return "missing";
  const today = new Date(now).toLocaleDateString("en-CA", {
    timeZone: "Asia/Seoul",
  });
  if (info.startsOn && today < info.startsOn) return "upcoming";
  if (info.endsOn && today > info.endsOn) return "ended";
  return "current";
}
export function mergeWebsiteEvents(
  base: Catalog | undefined,
  events: WebsiteEvent[],
  now = new Date().toISOString(),
) {
  if (base && base.book !== "이벤트")
    throw new Error("이벤트 SSOT에서만 갱신할 수 있습니다.");
  events = events.filter((e) => isEventBanner(e.name, e.categoryName));
  if (!events.length || !events.some((e) => e.offers.length))
    throw new Error(
      "홈페이지에서 상품을 확인하지 못했습니다. 기존 단가표는 유지됩니다.",
    );
  const catalog: Catalog = base
    ? structuredClone(base)
    : {
        id: "",
        rev: 0,
        createdAt: now,
        updatedAt: now,
        schemaVersion: 1,
        book: "이벤트",
        version: "홈페이지 이벤트 갱신",
        status: "draft",
        products: [],
        references: [],
      };
  catalog.id = crypto.randomUUID();
  catalog.rev = 0;
  catalog.status = "draft";
  catalog.createdAt = now;
  catalog.updatedAt = now;
  delete catalog.publishedAt;
  catalog.version = "홈페이지 이벤트 · " + now.slice(0, 10);
  const nodes = catalogNodes(catalog).map((f) => ({ ...f }));
  const oldBySource = new Map(
    catalog.products
      .filter((p) => p.webEvent)
      .map((p) => [p.webEvent!.eventId + ":" + p.webEvent!.offerId, p]),
  );
  const seen = new Set<string>(),
    updated = new Map<string, Product>();
  const summary = {
    added: 0,
    changed: 0,
    unchanged: 0,
    missing: 0,
    ended: 0,
    review: 0,
  };
  for (const event of events)
    for (const offer of event.offers) {
      const key = event.id + ":" + offer.id;
      if (seen.has(key))
        throw new Error("홈페이지 상품 ID가 중복됩니다. 갱신을 중단했습니다.");
      seen.add(key);
      const old = oldBySource.get(key);
      const signature = JSON.stringify({
        name: offer.name,
        description: offer.description,
        price: offer.price,
        regularPrice: offer.regularPrice,
        discountRate: offer.discountRate,
        priceText: offer.priceText,
        tax: offer.tax,
        issues: offer.issues,
        event: {
          name: event.name,
          categoryName: event.categoryName,
          description: event.description,
          period: event.period,
          startsOn: event.startsOn,
          endsOn: event.endsOn,
          posterUrls: event.posterUrls,
        },
      });
      const changed =
        !old ||
        old.webEvent!.sourceSignature !== signature ||
        !!old.webEvent!.missing;
      const info: EventOriginInfo = {
        provider: "grand4",
        eventId: event.id,
        offerId: offer.id,
        eventName: event.name,
        categoryName: event.categoryName,
        url: event.url,
        posterUrls: event.posterUrls,
        period: event.period,
        startsOn: event.startsOn,
        endsOn: event.endsOn,
        regularPrice: offer.regularPrice,
        discountRate: offer.discountRate,
        salePrice: offer.price,
        priceText: offer.priceText,
        checkedAt: now,
        sourceSignature: signature,
      };
      const availability = eventAvailability(info, now);
      const p: Product =
        old && !changed
          ? { ...old, webEvent: info }
          : {
              ...(old || {}),
              id: old?.id || `grand4-${event.id}-${offer.id}`,
              rev: (old?.rev || 0) + 1,
              createdAt: old?.createdAt || now,
              updatedAt: now,
              name: offer.name,
              description: [event.description, offer.description]
                .filter(Boolean)
                .join("\n"),
              composition: old?.composition || "",
              category: event.name,
              careCategory: old?.careCategory || "미용",
              publicVisible: old?.publicVisible || false,
              active: false,
              sources: [
                {
                  sheet: event.url,
                  cell: offer.id,
                  text: `${event.name} / ${offer.name} / ${offer.priceText} / ${event.period}`,
                },
              ],
              options: [
                {
                  id:
                    old?.options[0]?.id ||
                    `grand4-option-${event.id}-${offer.id}`,
                  label: "이벤트가",
                  price: offer.price,
                  tax: offer.tax,
                  priceKind: "event",
                  unit: old?.options[0]?.unit || "건",
                  review: true,
                  issues: [
                    "홈페이지 가져오기 검토",
                    ...offer.issues,
                    ...(offer.tax === "unknown"
                      ? ["부가세 미표기 · 항목별 확인 필요"]
                      : []),
                  ],
                  sources: [
                    { sheet: event.url, cell: offer.id, text: offer.priceText },
                  ],
                },
              ],
              webEvent: info,
            };
      if (!old) summary.added++;
      else if (changed) summary.changed++;
      else summary.unchanged++;
      if (availability === "ended" || availability === "missing") {
        p.active = false;
        summary.ended++;
      }
      if (p.options.some((o) => o.review)) summary.review++;
      if (!p.folderId || !nodes.some((n) => n.id === p.folderId && !n.linkTo)) {
        const root = inferRoot({ ...p, folderId: undefined });
        if (!nodes.some((n) => n.id === root))
          nodes.push({ ...rootFolders.find((n) => n.id === root)! });
        const folderId = `grand4-folder-${root}-${event.id}`;
        if (!nodes.some((n) => n.id === folderId)) {
          const label = event.name
            .replace(/[\/\\]/g, "·")
            .slice(0, 45)
            .trim();
          const name = nodes.some(
            (n) => n.parentId === root && n.name === label,
          )
            ? `${label} (${event.id})`
            : label;
          nodes.push({ id: folderId, parentId: root, name });
        }
        p.folderId = folderId;
      }
      updated.set(p.id, p);
    }
  catalog.products = catalog.products
    .map((p) => {
      const next = updated.get(p.id);
      if (next) {
        updated.delete(p.id);
        return next;
      }
      if (!p.webEvent) return p;
      if (!p.webEvent.missing) summary.missing++;
      return {
        ...p,
        active: false,
        webEvent: { ...p.webEvent, missing: true, checkedAt: now },
      };
    })
    .concat([...updated.values()]);
  catalog.folderTree = nodes;
  delete catalog.folders;
  catalog.eventImport = {
    sourceUrl: EVENT_LIST_URL,
    checkedAt: now,
    eventCount: events.length,
    offerCount: seen.size,
  };
  return { catalog, summary };
}
