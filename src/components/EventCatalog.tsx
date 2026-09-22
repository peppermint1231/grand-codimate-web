import { useEffect, useRef, useState } from "react";
import { RefreshCw, ExternalLink, Image as ImageIcon } from "lucide-react";
import { api } from "../lib/api";
import { scanWebsiteEvents } from "../lib/eventSync";
import { money, type Catalog } from "../core/model";
import {
  EVENT_LIST_URL,
  eventAvailability,
  mergeWebsiteEvents,
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
                : "홈페이지에서 제외됨"}
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
export function EventCatalogRefresh({
  catalog,
  beauty,
  disabled,
  onImport,
}: {
  catalog?: Catalog;
  beauty?: Catalog;
  disabled: boolean;
  onImport: (candidate: Catalog) => Promise<boolean>;
}) {
  const [events, setEvents] = useState<WebsiteEvent[]>(),
    [progress, setProgress] = useState(""),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  const request = useRef<AbortController | null>(null);
  useEffect(() => () => request.current?.abort(), []);
  const refresh = async () => {
    setBusy(true);
    setError("");
    setEvents(undefined);
    const controller = new AbortController();
    request.current = controller;
    try {
      const result = await scanWebsiteEvents(
        (query) =>
          api("/catalog/event-source" + query, { signal: controller.signal }),
        setProgress,
        controller.signal,
      );
      setEvents(result);
      setProgress(
        "가져오기 완료 · 변경 내용을 확인한 뒤 갱신 초안을 저장하세요.",
      );
    } catch (e) {
      if (!controller.signal.aborted)
        setError((e as Error).message + " 기존 SSOT는 변경하지 않았습니다.");
    } finally {
      if (!controller.signal.aborted) setBusy(false);
    }
  };
  let preview: ReturnType<typeof mergeWebsiteEvents> | undefined,
    previewError = "";
  if (events) {
    try {
      preview = mergeWebsiteEvents(catalog, events, undefined, beauty);
    } catch (e) {
      previewError = (e as Error).message;
    }
  }
  return (
    <section className="card event-refresh" aria-label="홈페이지 이벤트 갱신">
      <div className="section-title">
        <h3>홈페이지 이벤트 연동</h3>
        <button
          type="button"
          disabled={disabled || busy}
          onClick={() => void refresh()}
        >
          <RefreshCw size={17} />
          {busy ? "갱신 자료 확인 중…" : "이벤트 단가표 갱신"}
        </button>
      </div>
      <p>
        배너명·분류명·상품명에 ‘이벤트’ 또는 ‘EVENT’가 있는 항목의
        시술·기간·정가·할인율·할인가를 가져옵니다. 일반 미용 가격표는
        제외합니다. 포스터는 원본 링크로 표시합니다. 신규 상품은 게시된 미용
        SSOT의 분류를 따르며, 판단이 어려우면 ‘미분류·검토 필요’에 둡니다.
      </p>
      <a href={EVENT_LIST_URL} target="_blank" rel="noopener noreferrer">
        홈페이지 이벤트 목록 열기 <ExternalLink size={14} />
      </a>
      {catalog?.eventImport && (
        <small>
          최근 갱신 초안:{" "}
          {new Date(catalog.eventImport.checkedAt).toLocaleString("ko-KR")} ·
          이벤트 {catalog.eventImport.eventCount}개 / 상품{" "}
          {catalog.eventImport.offerCount}개
        </small>
      )}
      {disabled && (
        <p className="permission-notice">
          편집 중인 내용을 먼저 저장하거나 취소하세요.
        </p>
      )}
      <p role="status" aria-live="polite">
        {progress}
      </p>
      {(error || previewError) && (
        <p className="error" role="alert">
          {error || previewError}
        </p>
      )}
      {preview && (
        <>
          <div className="event-sync-summary">
            <b>신규 {preview.summary.added}개</b>
            <b>변경 {preview.summary.changed}개</b>
            <span>동일 {preview.summary.unchanged}개</span>
            <span>원문 제외 {preview.summary.missing}개</span>
            <span>기간 종료 {preview.summary.ended}개</span>
          </div>
          <p>
            수동 등록 상품·기존 폴더 배치는 유지합니다. 홈페이지에서 빠진 상품은
            삭제 대신 비활성화합니다. 신규·변경 상품은 검토 후 판매 활성화가
            필요하며, 부가세 미표기는 항목별 확인 대상으로 남깁니다.
          </p>
          <button
            className="primary"
            type="button"
            disabled={busy || disabled}
            onClick={async () => {
              setBusy(true);
              setError("");
              try {
                if (await onImport(preview!.catalog)) {
                  setEvents(undefined);
                  setProgress(
                    "갱신 초안을 저장했습니다. 상품 검토 후 ‘검증 후 게시’를 눌러 상담·추천기에 반영하세요.",
                  );
                } else
                  setError(
                    "기기에 저장됐습니다. 동기화 완료 후 갱신 결과를 확인하세요.",
                  );
              } catch (e) {
                setError((e as Error).message);
              } finally {
                setBusy(false);
              }
            }}
          >
            갱신 초안 저장
          </button>
          <details className="event-sync-preview">
            <summary>
              가져온 이벤트·가격·포스터 확인 ({events!.length}개)
            </summary>
            {events!.map((event) => (
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
