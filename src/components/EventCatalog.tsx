import {
  mergeWebsiteCatalogs,
  websiteReviewNeeded,
  type WebsiteBases,
} from "../core/websiteCatalog";
import { useEffect, useMemo, useRef, useState } from "react";
import { RefreshCw, ExternalLink, Image as ImageIcon } from "lucide-react";
import { api } from "../lib/api";
import { scanWebsiteCatalog } from "../lib/eventSync";
import { money, type Catalog, type Product } from "../core/model";
import {
  EVENT_LIST_URL,
  eventAvailability,
  selectWebsiteOffers,
  safeEventImage,
  type EventOriginInfo,
  type WebsiteEvent,
} from "../core/eventCatalog";
export function EventPrice({
  regularPrice,
  discountRate,
  salePrice,
}: Pick<EventOriginInfo, "regularPrice" | "discountRate" | "salePrice">) {
  return (
    <span className="event-prices">
      {regularPrice !== null && (
        <span className="event-regular">
          정가 <del>{money(regularPrice)}</del>
        </span>
      )}
      {discountRate !== null && (
        <strong className="event-discount">{discountRate}% 할인</strong>
      )}
      <strong>
        할인가 {salePrice === null ? "원문 확인" : money(salePrice)}
      </strong>
    </span>
  );
}
export function EventSourceInfo({
  info,
  salePrice,
  compact = false,
}: {
  info?: EventOriginInfo;
  salePrice?: number | null;
  compact?: boolean;
}) {
  if (!info) return null;
  const availability = eventAvailability(info);
  return (
    <div className={`event-source-info ${compact ? "compact" : ""}`}>
      <p className="event-period">
        이벤트 기간: {info.period || "홈페이지 미표기"}
        {availability !== "current" && (
          <b className="event-status">
            {availability === "ended"
              ? "종료"
              : availability === "upcoming"
                ? "시작 전"
                : "이벤트 대상에서 제외됨"}
          </b>
        )}
      </p>
      <EventPrice {...info} />
      {salePrice !== undefined && salePrice !== info.salePrice && (
        <small>
          SSOT 적용가 {salePrice === null ? "미확정" : money(salePrice)} ·
          홈페이지 원문과 다름
        </small>
      )}
      {!compact && (
        <>
          <p>
            <a href={info.url} target="_blank" rel="noopener noreferrer">
              <ExternalLink size={14} /> 홈페이지 원문
            </a>{" "}
            · {info.eventName}
          </p>
          {!!info.posterUrls.length && (
            <details className="event-posters">
              <summary>
                <ImageIcon size={16} /> 이벤트 포스터 ({info.posterUrls.length})
              </summary>
              <PosterLinks urls={info.posterUrls} name={info.eventName} />
            </details>
          )}
          <small>
            정가·할인율·기간은 홈페이지 표기입니다. 마지막 확인{" "}
            {new Date(info.checkedAt).toLocaleString("ko-KR")}
          </small>
        </>
      )}
    </div>
  );
}
function PosterLinks({ urls, name }: { urls: string[]; name: string }) {
  return (
    <div className="event-poster-grid">
      {urls
        .filter((u) => safeEventImage(u) === u)
        .map((url, i) => (
          <a key={url} href={url} target="_blank" rel="noopener noreferrer">
            <img
              src={url}
              alt={`${name} 포스터 ${i + 1}`}
              loading="lazy"
              referrerPolicy="no-referrer"
            />
            <span>원본 포스터 {i + 1} 열기</span>
          </a>
        ))}
    </div>
  );
}
export function WebsiteSourceInfo({ product }: { product: Product }) {
  if (!product.websiteListings?.length) return null;
  return (
    <details className="event-source-info website-source-info">
      <summary>
        홈페이지 게시·가격 점검{" "}
        {websiteReviewNeeded(product) ? "· 원문 변경/가격 차이 확인" : ""}
      </summary>
      {product.websiteListings.map((link) => (
        <p key={`${link.pageId}:${link.offerId}`}>
          <a href={link.url} target="_blank" rel="noopener noreferrer">
            {link.name} <ExternalLink size={13} />
          </a>
          <br />
          {link.missing
            ? "홈페이지에서 제외됨"
            : `홈페이지 게시 확인 · ${link.book} · ${link.price === null ? "가격 미표기" : money(link.price)}`}
          {link.changed && " · 원문 변경"}
          {link.priceDiffers && " · SSOT 가격/부가세와 다름"}
          <br />
          <small>확인 {new Date(link.checkedAt).toLocaleString("ko-KR")}</small>
        </p>
      ))}
    </details>
  );
}
export function EventCatalogRefresh({
  catalog,
  beauty,
  bases,
  disabled,
  onImport,
}: {
  catalog?: Catalog;
  beauty?: Catalog;
  bases: WebsiteBases;
  disabled: boolean;
  onImport: (pages: WebsiteEvent[], bases: WebsiteBases) => Promise<boolean>;
}) {
  const [scan, setScan] = useState<{
      pages: WebsiteEvent[];
      beauty: Catalog;
      event?: Catalog;
      bases: WebsiteBases;
    }>(),
    [progress, setProgress] = useState(""),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  const request = useRef<AbortController | null>(null);
  useEffect(() => () => request.current?.abort(), []);
  const refresh = async () => {
    if (!beauty) return;
    setBusy(true);
    setError("");
    setScan(undefined);
    const controller = new AbortController();
    request.current = controller;
    try {
      const pages = await scanWebsiteCatalog(
        (query) =>
          api("/catalog/event-source" + query, { signal: controller.signal }),
        setProgress,
        controller.signal,
      );
      setScan({ pages, beauty, event: catalog, bases });
      setProgress(
        "전체 홈페이지 확인 완료 · 미용·이벤트 변경 내용을 확인한 뒤 초안을 저장하세요.",
      );
    } catch (e) {
      if (!controller.signal.aborted)
        setError((e as Error).message + " 기존 SSOT는 변경하지 않았습니다.");
    } finally {
      if (!controller.signal.aborted) setBusy(false);
    }
  };
  const { preview, previewError } = useMemo(() => {
    if (!scan) return {};
    try {
      return {
        preview: mergeWebsiteCatalogs(scan.beauty, scan.event, scan.pages),
      };
    } catch (e) {
      return { previewError: (e as Error).message };
    }
  }, [scan]);
  const eventPages = useMemo(
    () => (scan ? selectWebsiteOffers(scan.pages, "이벤트") : []),
    [scan],
  );
  const stale = !!scan && JSON.stringify(scan.bases) !== JSON.stringify(bases);
  const recent = beauty?.websiteImport || catalog?.websiteImport;
  return (
    <section className="card event-refresh" aria-label="홈페이지 단가표 갱신">
      <div className="section-title">
        <h3>홈페이지 단가표 연동</h3>
        <button
          type="button"
          disabled={disabled || busy || !beauty}
          onClick={() => void refresh()}
        >
          <RefreshCw size={17} />
          {busy ? "갱신 자료 확인 중…" : "홈페이지 갱신"}
        </button>
      </div>
      <p>
        홈페이지 전체를 조회해 미용·이벤트 SSOT를 함께 점검합니다.
        배너명·분류명·상품명에 ‘이벤트’ 또는 ‘EVENT’가 있으면 이벤트로
        구분합니다. 신규 상품은 최근 저장한 미용 SSOT의 분류를 따르고, 판단이
        어려우면 ‘미분류·검토 필요’에 둡니다.
      </p>
      <p>
        기존 미용 가격·판매 상태·직접 배치한 폴더는 유지하며 원문과의 차이를
        표시합니다. 하위 폴더는 게시 확인·제외·미확인·혼합 색상으로 구분합니다.
        포스터는 원본 링크로 표시합니다.
      </p>
      <a href={EVENT_LIST_URL} target="_blank" rel="noopener noreferrer">
        홈페이지 가격표 열기 <ExternalLink size={14} />
      </a>
      {recent && (
        <small>
          최근 통합 갱신: {new Date(recent.checkedAt).toLocaleString("ko-KR")} ·
          배너 {recent.pageCount}개 / 상품 {recent.offerCount}개
        </small>
      )}
      {disabled && (
        <p className="permission-notice">
          편집 중인 내용을 먼저 저장하거나 취소하세요.
        </p>
      )}
      {!beauty && <p>기준 미용 SSOT를 불러오는 중입니다.</p>}
      <p role="status" aria-live="polite">
        {progress}
      </p>
      {(error || previewError) && (
        <p className="error" role="alert">
          {error || previewError}
        </p>
      )}
      {preview && scan && (
        <>
          <div className="event-sync-summary" aria-label="미용 갱신 요약">
            <b>미용</b>
            <b>신규 {preview.summary.beauty.added}개</b>
            <span>기존 일치 {preview.summary.beauty.existing}건</span>
            <span>원문 변경·가격 확인 {preview.summary.beauty.review}개</span>
            <span>원문 제외 {preview.summary.beauty.missing}개</span>
          </div>
          <div className="event-sync-summary" aria-label="이벤트 갱신 요약">
            <b>이벤트</b>
            <b>신규 {preview.summary.event.added}개</b>
            <b>변경 {preview.summary.event.changed}개</b>
            <span>동일 {preview.summary.event.unchanged}개</span>
            <span>이벤트 대상 제외 {preview.summary.event.missing}개</span>
            <span>기간 종료 {preview.summary.event.ended}개</span>
          </div>
          <p>
            신규 미용 상품과 신규·변경 이벤트는 검토 후 활성화가 필요합니다.
            홈페이지에서 제외된 이벤트는 비활성화합니다. 부가세 미표기는 항목별
            확인 대상으로 남깁니다. 저장만으로 상담·추천기에 게시되지 않습니다.
          </p>
          {stale && (
            <p className="error">
              기준 단가표가 변경되었습니다. 홈페이지를 다시 갱신하세요.
            </p>
          )}
          <button
            className="primary"
            type="button"
            disabled={busy || disabled || stale}
            onClick={async () => {
              setBusy(true);
              setError("");
              try {
                if (await onImport(scan.pages, scan.bases)) {
                  setScan(undefined);
                  setProgress(
                    "미용·이벤트 갱신 초안을 함께 저장했습니다. 각 SSOT에서 검토 후 ‘검증 후 게시’를 눌러 반영하세요.",
                  );
                } else
                  setError(
                    "기기에 저장됐습니다. 동기화 완료 후 두 SSOT의 갱신 결과를 확인하세요.",
                  );
              } catch (e) {
                setError((e as Error).message);
              } finally {
                setBusy(false);
              }
            }}
          >
            미용·이벤트 갱신 초안 저장
          </button>
          <details className="event-sync-preview">
            <summary>미용 신규·변경·제외 상품 확인</summary>
            {preview.beauty.products
              .filter(
                (p) =>
                  preview.beautyDecisions.some(
                    (d) => d.id === p.id && d.status === "added",
                  ) ||
                  websiteReviewNeeded(p) ||
                  p.websiteListings?.some((l) => l.missing),
              )
              .map((p) => (
                <div className="event-preview-item" key={p.id}>
                  <b>{p.name}</b>
                  <p>
                    {preview.beautyDecisions.find((d) => d.id === p.id)
                      ?.status === "added"
                      ? "신규 검토 후보"
                      : "기존 SSOT 유지 · 원문 확인"}{" "}
                    · SSOT{" "}
                    {p.options
                      .map(
                        (o) =>
                          `${o.label} ${o.price === null ? "미확정" : money(o.price)}`,
                      )
                      .join(" / ")}
                  </p>
                  <WebsiteSourceInfo product={p} />
                </div>
              ))}
          </details>
          <details className="event-sync-preview">
            <summary>
              가져온 이벤트·가격·포스터 확인 ({eventPages.length}개)
            </summary>
            {eventPages.map((event) => (
              <details key={event.id} className="event-preview-item">
                <summary>
                  {event.name} · {event.offers.length}개 상품 ·{" "}
                  {event.period || "기간 미표기"}
                </summary>
                <p>{event.description}</p>
                <PosterLinks urls={event.posterUrls} name={event.name} />
                <div className="event-offer-preview">
                  {event.offers.map((offer) => (
                    <div key={offer.id}>
                      <b>{offer.name}</b>
                      <p>{offer.description}</p>
                      <EventPrice
                        regularPrice={offer.regularPrice}
                        discountRate={offer.discountRate}
                        salePrice={offer.price}
                      />
                      <small>{offer.priceText}</small>
                    </div>
                  ))}
                </div>
              </details>
            ))}
          </details>
        </>
      )}
    </section>
  );
}
