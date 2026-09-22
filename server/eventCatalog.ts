import { load } from "cheerio/slim";
import {
  EVENT_ORIGIN,
  EVENT_LIST_URL,
  safeEventImage,
  type EventPage,
  type WebsiteEvent,
  type EventOffer,
} from "../src/core/eventCatalog";
const clean = (s: string) => s.replace(/\s+/g, " ").trim();
const validId = (s: string) => /^\d{1,10}$/.test(s);
const fail = (message: string): never => {
  throw new Error("이벤트 홈페이지: " + message);
};
function pageDOM(html: string) {
  const $ = load(html);
  $("script,style,noscript").remove();
  $("br").replaceWith(" ");
  return $;
}
export function parseEventPage(html: string, categoryId?: string): EventPage {
  const $ = pageDOM(html),
    categories = new Map<string, { id: string; name: string }>();
  $("#ClinicCateList a[href]").each((_, el) => {
    const u = new URL($(el).attr("href")!, EVENT_LIST_URL),
      id = u.searchParams.get("cate") || "";
    if (
      u.origin === EVENT_ORIGIN &&
      u.pathname === "/clinicPrice/eventListLeft.php" &&
      validId(id)
    )
      categories.set(id, { id, name: clean($(el).text()) });
  });
  if (!categories.size || categories.size > 80 || !$(".ClinicAllList").length)
    fail("목록 구조를 확인할 수 없습니다. 기존 단가표는 변경하지 않습니다.");
  if (categoryId && !categories.has(categoryId))
    fail("분류가 변경되었습니다. 다시 갱신하세요.");
  const items = new Map<
    string,
    { id: string; categoryId: string; categoryName: string; name: string }
  >();
  $(".ClinicAllList a[href]").each((_, el) => {
    const u = new URL($(el).attr("href")!, EVENT_LIST_URL),
      id = u.searchParams.get("i") || "",
      cat = u.searchParams.get("cate") || categoryId || "";
    if (u.pathname !== "/clinicPrice/clinicView.php") return;
    if (u.origin !== EVENT_ORIGIN || !validId(id) || !categories.has(cat))
      fail("시술 링크가 올바르지 않습니다.");
    const name = clean($(el).find(".Name").text());
    if (!name) fail("시술 이름이 없습니다.");
    items.set(id, {
      id,
      categoryId: cat,
      categoryName: categories.get(cat)!.name,
      name,
    });
  });
  if (!items.size && !/등록된\s*시술이\s*없습니다/.test($("#contents").text()))
    fail("빈 목록인지 확인할 수 없습니다.");
  const pages = new Set<number>();
  $("#contents a[href]").each((_, el) => {
    const u = new URL($(el).attr("href")!, EVENT_LIST_URL);
    if (
      u.origin !== EVENT_ORIGIN ||
      u.pathname !== "/clinicPrice/eventListLeft.php" ||
      u.searchParams.get("cate") !== categoryId ||
      !u.searchParams.has("page")
    )
      return;
    const n = Number(u.searchParams.get("page"));
    if (!Number.isInteger(n) || n < 1 || n > 100)
      fail("페이지 범위를 확인하세요.");
    pages.add(n);
  });
  return {
    categories: [...categories.values()],
    items: [...items.values()],
    pages: [...pages],
  };
}
export function exactWon(text: string): number | null {
  const s = clean(text);
  if (!/^(?:\d{1,3}(?:,\d{3})+|\d+)\s*원?$/.test(s)) return null;
  const n = Number(s.replace(/[,원\s]/g, ""));
  return Number.isSafeInteger(n) && n >= 0 && n <= 1_000_000_000 ? n : null;
}
function taxOf(text: string): EventOffer["tax"] {
  const s = text.replace(/\s+/g, "");
  const hits = [
    /(?:VAT|부가세|부가가치세)(?:별도|불포함)/i.test(s) && "exclusive",
    /(?:VAT|부가세|부가가치세)포함/i.test(s) && "inclusive",
    /면세/.test(s) && "exempt",
  ].filter(Boolean);
  return hits.length === 1 ? (hits[0] as EventOffer["tax"]) : "unknown";
}
export function periodDates(period: string) {
  const dates = [
    ...period.matchAll(/(20\d{2})[-./](\d{1,2})[-./](\d{1,2})/g),
  ].map((m) => `${m[1]}-${m[2].padStart(2, "0")}-${m[3].padStart(2, "0")}`);
  const valid = (d: string) =>
    !Number.isNaN(Date.parse(d)) &&
    new Date(d).toISOString().slice(0, 10) === d;
  if (dates.some((d) => !valid(d))) return {};
  if (dates.length === 2 && dates[0] <= dates[1])
    return { startsOn: dates[0], endsOn: dates[1] };
  if (
    dates.length === 1 &&
    /^[\s~～–-]*20\d{2}/.test(period) &&
    /[~～]/.test(period.slice(0, period.indexOf("20")))
  )
    return { endsOn: dates[0] };
  return {};
}
export function parseWebsiteEvent(
  html: string,
  id: string,
  categoryId: string,
): WebsiteEvent {
  const $ = pageDOM(html);
  if ($('.ClinicDetail input[name="idx"]').attr("value") !== id)
    fail("상세 시술 ID가 다릅니다.");
  const info = $(".ClinicDetail .ClinicInfo").first(),
    name = clean(info.find(".Name").text());
  if (!name) fail("상세 시술 이름이 없습니다.");
  let categoryName = "";
  $(".ClinicTop .MainTitle a[href]").each((_, el) => {
    const u = new URL($(el).attr("href")!, EVENT_LIST_URL);
    if (
      u.origin === EVENT_ORIGIN &&
      u.pathname === "/clinicPrice/eventListLeft.php" &&
      u.searchParams.get("cate") === categoryId
    )
      categoryName = clean($(el).text());
  });
  if (!categoryName) fail("상세 분류를 확인할 수 없습니다.");
  const description = clean(info.find(".Info").text()),
    period = clean(info.find(".Date").text());
  const posters = new Set<string>();
  $("#contents img[src]").each((_, el) => {
    const url = safeEventImage($(el).attr("src")!);
    if (url) posters.add(url);
  });
  if (posters.size > 30) fail("포스터 수가 예상 범위를 넘었습니다.");
  const offers: EventOffer[] = [],
    seen = new Set<string>();
  $(".ClinicDetailSelect .ListBox").each((_, el) => {
    const row = $(el),
      offerId = row.find('input[name="idxChk[]"]').attr("value") || "";
    const offerName = clean(row.find(".Name").text());
    if (!validId(offerId) || !offerName || seen.has(offerId))
      fail("상품 ID·이름이 없거나 중복됩니다.");
    seen.add(offerId);
    const priceText = clean(row.find('.Price [alt="할인가"]').text());
    const regularText = clean(row.find('.Price [alt="정가"]').text()),
      discountText = clean(row.find('.Price [alt="할인율"]').text());
    const price = exactWon(priceText),
      regularPrice = exactWon(regularText);
    const rate = /^(?:\d{1,2}(?:\.\d+)?|100)\s*%$/.test(discountText)
      ? Number(discountText.replace(/[%\s]/g, ""))
      : null;
    const issues: string[] = [];
    if (price === null)
      issues.push("할인가 미확정 · 범위/상담가/이미지 가격은 원문 확인");
    if (regularText && regularPrice === null)
      issues.push("정가 표기 확인 필요");
    if (discountText && rate === null) issues.push("할인율 표기 확인 필요");
    if (regularPrice !== null && price !== null && regularPrice < price)
      issues.push("정가보다 높은 할인가 확인 필요");
    if (
      regularPrice &&
      price !== null &&
      rate !== null &&
      Math.abs((1 - price / regularPrice) * 100 - rate) > 1
    )
      issues.push("홈페이지 할인율·가격 불일치 확인 필요");
    offers.push({
      id: offerId,
      name: offerName,
      description: clean(row.find(".Info").text()),
      price,
      regularPrice,
      discountRate: rate,
      priceText: [
        priceText && `할인가 ${priceText}`,
        regularText && `정가 ${regularText}`,
        discountText && `할인율 ${discountText}`,
      ]
        .filter(Boolean)
        .join(" / "),
      tax:
        taxOf(row.text()) === "unknown"
          ? taxOf(info.text())
          : taxOf(row.text()),
      issues,
    });
  });
  if (!offers.length)
    fail(
      "상세 상품 가격을 확인할 수 없습니다. 이미지 전용 이벤트는 원문에서 확인하세요.",
    );
  return {
    id,
    categoryId,
    categoryName,
    name,
    description,
    period,
    ...periodDates(period),
    url: `${EVENT_ORIGIN}/clinicPrice/clinicView.php?i=${id}&cate=${categoryId}`,
    posterUrls: [...posters],
    offers,
  };
}
export async function fetchEventSource(
  params: URLSearchParams,
  fetcher: typeof fetch = fetch,
) {
  const category = params.get("category") || "",
    item = params.get("item") || "",
    page = params.get("page") || "";
  if (
    [...params.keys()].some((k) => !["category", "item", "page"].includes(k)) ||
    (category && !validId(category)) ||
    (item && (!validId(item) || !category)) ||
    (page &&
      (!category ||
        !/^\d{1,3}$/.test(page) ||
        Number(page) < 1 ||
        Number(page) > 100))
  )
    fail("요청 분류·시술·페이지가 올바르지 않습니다.");
  const u = new URL(
    item ? "/clinicPrice/clinicView.php" : "/clinicPrice/eventListLeft.php",
    EVENT_ORIGIN,
  );
  if (category) u.searchParams.set("cate", category);
  if (item) u.searchParams.set("i", item);
  if (page) u.searchParams.set("page", page);
  const response = await fetcher(u.href, {
    redirect: "manual",
    signal: AbortSignal.timeout(15000),
    headers: { Accept: "text/html", "User-Agent": "Codimate-Event-Sync/1.0" },
  });
  if (
    !response.ok ||
    !response.headers.get("content-type")?.includes("text/html")
  )
    fail("홈페이지 응답을 읽을 수 없습니다. 잠시 후 다시 시도하세요.");
  const reader = response.body?.getReader();
  if (!reader) fail("본문이 없습니다.");
  const chunks: Uint8Array[] = [];
  let bytes = 0;
  try {
    while (true) {
      const { done, value } = await reader!.read();
      if (done) break;
      bytes += value.length;
      if (bytes > 2_000_000) fail("페이지 크기가 제한을 넘었습니다.");
      chunks.push(value);
    }
  } finally {
    await reader!.cancel();
  }
  const data = new Uint8Array(bytes);
  let offset = 0;
  for (const c of chunks) {
    data.set(c, offset);
    offset += c.length;
  }
  const html = new TextDecoder("utf-8", { fatal: true }).decode(data);
  return item
    ? parseWebsiteEvent(html, item, category)
    : parseEventPage(html, category || undefined);
}
