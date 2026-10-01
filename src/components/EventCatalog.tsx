import {
  mergeHomepageCatalog,
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
        {regularPrice !== null && salePrice !== null && regularPrice > salePrice
          ? "할인가 "
          : "판매가 "}
        {salePrice === null ? "원문 확인" : money(salePrice)}
      </strong>
    </span>
  );
}
export function EventSourceInfo({
  info,
  salePrice,
  regularPrice,
  compact = false,
}: {
  info?: EventOriginInfo;
  salePrice?: number | null;
  regularPrice?: number | null;
  compact?: boolean;
}) {
  if (!info) return null;
  const availability = eventAvailability(info);
  const regular = regularPrice === undefined ? info.regularPrice : regularPrice;
  const sale = salePrice === undefined ? info.salePrice : salePrice;
  const rate =
    regular !== null &&
    regular > 0 &&
    sale !== null &&
    sale >= 0 &&
    sale <= regular
      ? Math.round((1 - sale / regular) * 1000) / 10
      : null;
  return (
    <div className={`event-source-info ${compact ? "compact" : ""}`}>
      <p className="event-period">
        게시 기간: {info.period || "홈페이지 미표기"}
        {availability !== "current" && (
          <b className="event-status">
            {availability === "ended"
              ? "종료"
              : availability === "upcoming"
                ? "시작 전"
                : "홈페이지에서 제외됨"}
          </b>
        )}
      </p>
      <EventPrice regularPrice={regular} salePrice={sale} discountRate={rate} />
      {(sale !== info.salePrice || regular !== info.regularPrice) && (
        <small>수정한 SSOT 가격 · 홈페이지 원문과 다름</small>
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
                <ImageIcon size={16} /> 홈페이지 포스터 (
                {info.posterUrls.length})
              </summary>
              <PosterLinks urls={info.posterUrls} name={info.eventName} />
            </details>
          )}
          <details>
            <summary>홈페이지 원문 가격</summary>
            <EventPrice {...info} />
          </details>
          <small>
            기간·포스터는 홈페이지 표기입니다. 마지막 확인{" "}
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
            : `홈페이지 게시 확인 · ${link.book === "이벤트" ? "이벤트 상품" : "일반 상품"} · ${link.price === null ? "가격 미표기" : money(link.price)}`}
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
        "전체 홈페이지 확인 완료 · 홈페이지 SSOT 변경 내용을 확인한 뒤 초안을 저장하세요.",
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
        preview: mergeHomepageCatalog(scan.beauty, scan.event, scan.pages),
      };
    } catch (e) {
      return { previewError: (e as Error).message };
    }
  }, [scan]);
  const eventPages = scan?.pages || [];
  const stale = !!scan && JSON.stringify(scan.bases) !== JSON.stringify(bases);
  const recent = catalog?.websiteImport;
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
        홈페이지에 게시된 모든 분류·배너·상품을 홈페이지 SSOT로 가져옵니다.
        정가·판매가·할인율·게시 기간과 원본 포스터 링크를 함께 확인할 수
        있습니다. 신규 상품 분류는 직접 구성한 미용 SSOT를 참고합니다.
      </p>
      <p>
        미용 SSOT는 홈페이지 갱신과 독립적으로 관리됩니다. 홈페이지 SSOT에서
        직접 배치한 폴더와 원문이 동일한 상품의 검토 상태는 유지합니다.
      </p>
      <a href={EVENT_LIST_URL} target="_blank" rel="noopener noreferrer">
        홈페이지 가격표 열기 <ExternalLink size={14} />
      </a>
      {recent && (
        <small>
          최근 홈페이지 갱신:{" "}
          {new Date(recent.checkedAt).toLocaleString("ko-KR")} · 배너{" "}
          {recent.pageCount}개 / 상품 {recent.offerCount}개
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
          <div className="event-sync-summary" aria-label="홈페이지 갱신 요약">
            <b>홈페이지 SSOT</b>
            <b>신규 {preview.summary.added}개</b>
            <b>변경 {preview.summary.changed}개</b>
            <span>동일 {preview.summary.unchanged}개</span>
            <span>홈페이지 제외 {preview.summary.missing}개</span>
            <span>기간 종료 {preview.summary.ended}개</span>
          </div>
          <p>
            신규·변경 상품은 검토 후 활성화가 필요합니다. 홈페이지에서 제외된
            상품은 비활성화합니다. 부가세 미표기는 항목별 확인 대상으로
            남깁니다. 초안 저장 후 검토·게시하면 상담과 맞춤 시술 찾기에
            반영됩니다.
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
                    "홈페이지 SSOT 갱신 초안을 저장했습니다. 검토 후 ‘검증 후 게시’를 눌러 반영하세요.",
                  );
                } else
                  setError(
                    "기기에 저장됐습니다. 동기화 완료 후 홈페이지 SSOT의 갱신 결과를 확인하세요.",
                  );
              } catch (e) {
                setError((e as Error).message);
              } finally {
                setBusy(false);
              }
            }}
          >
            홈페이지 갱신 초안 저장
          </button>
          <details className="event-sync-preview">
            <summary>
              가져온 전체 상품·가격·포스터 확인 ({eventPages.length}개)
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
