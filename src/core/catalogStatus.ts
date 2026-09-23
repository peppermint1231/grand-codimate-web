import { catalogBook, type Catalog, type Consultation } from "./model";

export function refreshConsultationBook(
  consultation: Consultation,
  catalog: Catalog,
): Consultation {
  const book = catalogBook(catalog);
  if (catalog.status !== "published")
    throw new Error("게시된 단가표만 불러올 수 있습니다.");
  if (consultation.quote.lines.some((line) => (line.book || "미용") === book))
    throw new Error(
      `${book} 장바구니 상품을 먼저 제거하세요. 기존 금액은 자동으로 바꾸지 않습니다.`,
    );
  return {
    ...consultation,
    ...(book === "미용" ? { catalogVersion: catalog.version } : {}),
    catalogVersions: {
      ...consultation.catalogVersions,
      [book]: catalog.version,
    },
  };
}

export function catalogHasChanges(current: Catalog, saved?: Catalog) {
  return (
    current.status === "draft" &&
    current !== saved &&
    (!saved || JSON.stringify(current) !== JSON.stringify(saved))
  );
}
export function catalogTime(at: string) {
  const date = new Date(at);
  if (!Number.isFinite(date.getTime())) return "시간 정보 없음";
  return (
    new Intl.DateTimeFormat("ko-KR", {
      timeZone: "Asia/Seoul",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hour12: false,
    }).format(date) + " (한국시간)"
  );
}
export function catalogVersionLabel(catalog: Catalog) {
  return `${catalog.status === "published" ? "게시본 · 게시" : "초안 · 저장"} ${catalogTime(catalog.status === "published" ? catalog.publishedAt || catalog.updatedAt : catalog.updatedAt)} · ${catalog.id.slice(0, 8)}`;
}
