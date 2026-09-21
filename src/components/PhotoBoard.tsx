import { createPortal } from "react-dom";
import { PhotoOrder } from "./PhotoOrder";
import { applyPhotoOrder } from "../core/photoOrder";
import {
  useEffect,
  useRef,
  useState,
  type ReactNode,
  type CSSProperties,
} from "react";
import type { Photo } from "../core/model";
import { PhotoPreview, PhotoEditor } from "./PhotoEditor";
import { mediaUrl, uploadState, watchUploads } from "../lib/api";
import { useAppBack } from "../lib/navigation";
export function Thumbnail({ photo }: { photo: Photo }) {
  const [url, setUrl] = useState(photo.thumbnail || "");
  useEffect(() => {
    if (photo.thumbnail) {
      setUrl(photo.thumbnail);
      return;
    }
    let live = true,
      u = "";
    mediaUrl(photo.mediaId)
      .then((x) => {
        u = x;
        if (live) setUrl(x);
      })
      .catch(() => {});
    return () => {
      live = false;
      if (u) URL.revokeObjectURL(u);
    };
  }, [photo.mediaId, photo.thumbnail]);
  return url ? (
    <img src={url} alt="" loading="lazy" />
  ) : (
    <span className="thumbnail-placeholder">사진</span>
  );
}
export function ConsultationCover({ photos }: { photos: Photo[] }) {
  const covers = photos.filter((p) => p.representative);
  return covers.length ? (
    <span
      className="consultation-covers"
      aria-label={`대표사진 ${covers.length}장`}
    >
      {covers.map((cover) => (
        <span className="consultation-cover" key={cover.id} title={cover.name}>
          <PhotoPreview photo={cover} />
        </span>
      ))}
    </span>
  ) : null;
}
function PhotoModal({
  label,
  className,
  close,
  children,
}: {
  label: string;
  className: string;
  close: () => void;
  children: ReactNode;
}) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    ref.current?.focus();
    return () => {
      document.body.style.overflow = overflow;
      previous?.focus();
    };
  }, []);
  return createPortal(
    <div
      ref={ref}
      role="dialog"
      aria-modal="true"
      aria-label={label}
      className={className}
      tabIndex={-1}
      onKeyDown={(e) => {
        if (e.key === "Escape") {
          e.stopPropagation();
          close();
        }
        if (e.key !== "Tab") return;
        const buttons = [
          ...e.currentTarget.querySelectorAll<HTMLElement>(
            'button:not(:disabled), input:not(:disabled), textarea, select, [tabindex="0"]',
          ),
        ].filter((el) => el.getClientRects().length > 0);
        const first = buttons[0],
          last = buttons.at(-1);
        if (!first) {
          e.preventDefault();
          return;
        }
        if (
          e.shiftKey &&
          (document.activeElement === first ||
            document.activeElement === ref.current)
        ) {
          e.preventDefault();
          last?.focus();
        } else if (
          !e.shiftKey &&
          (document.activeElement === last ||
            document.activeElement === ref.current)
        ) {
          e.preventDefault();
          first.focus();
        }
      }}
    >
      {children}
    </div>,
    document.body,
  );
}

function PhotoViewer({
  photos,
  columns,
  onColumns,
  onOrder,
  readonly,
  onEdit,
  onInfo,
  fit,
  onFit,
}: {
  photos: Photo[];
  columns: number;
  onColumns: (n: number) => void;
  onOrder: (ids: string[]) => void;
  readonly: boolean;
  onEdit: (id: string) => void;
  onInfo: (id: string) => void;
  fit: "width" | "height" | "screen";
  onFit: (fit: "width" | "height" | "screen") => void;
}) {
  const viewport = useRef<HTMLDivElement>(null);
  const [height, setHeight] = useState(500);
  useEffect(() => {
    const el = viewport.current;
    if (!el) return;
    const observer = new ResizeObserver(() => setHeight(el.clientHeight));
    observer.observe(el);
    return () => observer.disconnect();
  }, []);
  return (
    <div className="photo-viewer">
      <div className="viewer-controls">
        <div className="button-row" role="group" aria-label="사진 열 수">
          {[1, 2, 3, 4].map((n) => (
            <button
              key={n}
              className={columns === n ? "selected" : ""}
              aria-pressed={columns === n}
              onClick={() => onColumns(n)}
            >
              {n}열
            </button>
          ))}
        </div>
        <div className="button-row" role="group" aria-label="사진 맞춤">
          {(
            [
              ["width", "넓이맞춤"],
              ["height", "높이맞춤"],
              ["screen", "전체화면맞춤"],
            ] as const
          ).map(([value, label]) => (
            <button
              key={value}
              aria-pressed={fit === value}
              className={fit === value ? "selected" : ""}
              onClick={() => onFit(value)}
            >
              {label}
            </button>
          ))}
        </div>
      </div>
      <div className={"viewer-viewport fit-" + fit} ref={viewport}>
        {photos.length ? (
          <PhotoOrder
            photos={photos}
            disabled={readonly}
            onOrder={onOrder}
            className="comparison-grid"
            label="비교 사진 순서"
            style={
              {
                "--columns": columns,
                "--rows": Math.ceil(photos.length / columns),
                "--viewer-height": Math.max(120, height - 2) + "px",
              } as CSSProperties
            }
            ghost={(p) => <Thumbnail photo={p} />}
          >
            {(p, i) => (
              <figure data-photo-id={p.id}>
                <div
                  className="comparison-image"
                  data-photo-drag={!readonly || undefined}
                >
                  <PhotoPreview photo={p} />
                </div>
                <figcaption className="photo-overlay-actions">
                  <span className="photo-index">{i + 1}</span>
                  <button
                    data-photo-drag
                    disabled={readonly}
                    aria-label={`${p.name} 비교 순서 이동`}
                    title="드래그 또는 방향키로 순서 이동"
                  >
                    ⠿
                  </button>
                  <button
                    aria-label={`${p.name} 상세정보`}
                    onClick={() => onInfo(p.id)}
                  >
                    ℹ
                  </button>
                  <button
                    aria-label={`${p.name} 편집·확대`}
                    onClick={() => onEdit(p.id)}
                  >
                    ✎
                  </button>
                </figcaption>
              </figure>
            )}
          </PhotoOrder>
        ) : (
          <div className="empty">사진 탭에서 비교할 사진을 선택하세요.</div>
        )}
      </div>
    </div>
  );
}

export function PhotoBoard({
  photos,
  columns,
  onChange,
  onColumns,
  userId,
  readonly,
  canAnnotate,
  admin,
  viewer = false,
}: {
  photos: Photo[];
  columns: number;
  onChange: (p: Photo[]) => void;
  onColumns: (n: number) => void;
  userId: string;
  readonly: boolean;
  canAnnotate: boolean;
  admin: boolean;
  viewer?: boolean;
}) {
  const [editing, setEditing] = useState<string | null>(null),
    [, update] = useState(0),
    [large, setLarge] = useState(false),
    [infoId, setInfoId] = useState<string | null>(null);
  const [fit, setFit] = useState<"width" | "height" | "screen">("screen");
  useEffect(() => watchUploads(() => update((v) => v + 1)), []);
  const selected = photos.filter((p) => p.selected),
    edit = photos.find((p) => p.id === editing),
    info = photos.find((p) => p.id === infoId);
  const mayLeave = () =>
    window.dispatchEvent(
      new Event("codimate:before-photo-leave", { cancelable: true }),
    );
  const openEditor = (id: string) => {
    if (id !== editing && !mayLeave()) return;
    setLarge(false);
    setEditing(id);
  };
  const closeEditor = () => {
    if (mayLeave()) setEditing(null);
  };
  useAppBack(!!edit, closeEditor, 80);
  useAppBack(large, () => setLarge(false), 60);
  useAppBack(!!info, () => setInfoId(null), 90);
  const order = (ids: string[]) => {
    if (!readonly) onChange(applyPhotoOrder(photos, ids));
  };
  const viewerContent = () => (
    <PhotoViewer
      photos={selected}
      columns={columns}
      onColumns={onColumns}
      onOrder={order}
      readonly={readonly}
      onEdit={openEditor}
      onInfo={setInfoId}
      fit={fit}
      onFit={setFit}
    />
  );
  return (
    <div className={"photo-board" + (viewer ? " viewer-board" : "")}>
      <div className="photo-board-content" inert={!!edit || large || !!info}>
        {!viewer && (
          <>
            <p className="small">
              사진을 눌러 상담·출력에 포함하세요. ✎ 편집 · ☆ 대표사진 · ⠿ 끌어서
              순서 이동
            </p>
            <PhotoOrder
              photos={photos}
              disabled={readonly}
              onOrder={order}
              className="thumbnail-strip"
              label="상담 사진 순서"
              ghost={(p) => <Thumbnail photo={p} />}
            >
              {(p) => (
                <div
                  className={
                    "thumbnail-card " + (p.selected ? "is-selected" : "")
                  }
                  data-photo-id={p.id}
                >
                  <button
                    className="thumbnail-toggle"
                    aria-label={`${p.name} 선택`}
                    aria-pressed={p.selected}
                    disabled={readonly}
                    onClick={() =>
                      onChange(
                        photos.map((x) =>
                          x.id === p.id ? { ...x, selected: !x.selected } : x,
                        ),
                      )
                    }
                  >
                    <Thumbnail photo={p} />
                    <span className="photo-selection-mark" aria-hidden="true">
                      {p.selected ? "✓" : "○"}
                    </span>
                  </button>
                  <button
                    className={
                      "photo-cover-toggle " +
                      (p.representative ? "is-cover" : "")
                    }
                    aria-label={`${p.name} 대표사진`}
                    aria-pressed={!!p.representative}
                    disabled={readonly}
                    onClick={() =>
                      onChange(
                        photos.map((x) =>
                          x.id === p.id
                            ? { ...x, representative: !p.representative }
                            : x,
                        ),
                      )
                    }
                  >
                    {p.representative ? "★" : "☆"}
                  </button>
                  {uploadState(p.mediaId) && (
                    <span
                      className="upload-state"
                      role="status"
                      title={uploadState(p.mediaId)}
                    >
                      ⏳
                    </span>
                  )}
                  <button
                    className="photo-delete"
                    aria-label={`${p.name} 삭제`}
                    title="이 상담에서 사진 삭제"
                    disabled={
                      readonly ||
                      (!admin &&
                        p.annotations.some((a) => a.authorId !== userId))
                    }
                    onClick={() => {
                      if (
                        window.confirm(
                          "이 사진을 현재 상담에서 삭제할까요? 상담 저장 시 반영됩니다.",
                        )
                      )
                        onChange(photos.filter((x) => x.id !== p.id));
                    }}
                  >
                    ×
                  </button>
                  <div className="thumb-actions">
                    <button
                      aria-label={`${p.name} 편집`}
                      title="편집"
                      onClick={() => openEditor(p.id)}
                    >
                      ✎
                    </button>
                    <button
                      aria-label={`${p.name} 상세정보`}
                      title="상세정보"
                      onClick={() => setInfoId(p.id)}
                    >
                      ℹ
                    </button>
                    <button
                      className="photo-reorder"
                      data-photo-drag
                      disabled={readonly}
                      aria-label={`${p.name} 순서 이동`}
                      title="끌어서 이동 · 방향키로 이동"
                    >
                      ⠿
                    </button>
                  </div>
                </div>
              )}
            </PhotoOrder>
          </>
        )}
        <div className="comparison-toolbar">
          <strong>선택한 사진 {selected.length}장</strong>
          <button disabled={!selected.length} onClick={() => setLarge(true)}>
            비교 크게 보기
          </button>
        </div>
        {viewer && viewerContent()}
      </div>
      {edit && (
        <PhotoModal
          label="전체화면 사진 편집"
          className="photo-editor-fullscreen"
          close={closeEditor}
        >
          <header className="fullscreen-editor-header">
            <strong>사진 편집</strong>
            <span>사진 편집 저장 후 상담 저장까지 눌러주세요.</span>
            <button onClick={closeEditor}>편집기 닫기</button>
          </header>
          <div className="photo-edit-workspace">
            <PhotoOrder
              photos={photos.filter((p) => p.selected || p.id === edit.id)}
              disabled={readonly}
              onOrder={order}
              className="selected-photo-rail"
              label="편집 사진 순서"
              ghost={(p) => <Thumbnail photo={p} />}
            >
              {(p) => (
                <div className="editor-rail-photo">
                  <button
                    className={edit.id === p.id ? "selected" : ""}
                    aria-label={`${p.name} 바로 편집`}
                    aria-pressed={edit.id === p.id}
                    data-photo-drag={!readonly || undefined}
                    onClick={() => openEditor(p.id)}
                  >
                    <Thumbnail photo={p} />
                  </button>
                  <button
                    className="rail-order-handle"
                    data-photo-drag
                    disabled={readonly}
                    aria-label={`${p.name} 편집 목록 순서 이동`}
                    title="드래그 또는 방향키로 순서 이동"
                  >
                    ⠿
                  </button>
                </div>
              )}
            </PhotoOrder>
            <section className="active-photo-editor">
              <h3>{edit.name}</h3>
              <PhotoEditor
                key={edit.id}
                photo={edit}
                userId={userId}
                readonly={!canAnnotate}
                canEraseAll={admin}
                onChange={(p) =>
                  onChange(
                    photos.map((x) =>
                      x.id === p.id
                        ? {
                            ...p,
                            selected: x.selected,
                            representative: x.representative,
                          }
                        : x,
                    ),
                  )
                }
              />
            </section>
          </div>
        </PhotoModal>
      )}
      {large && (
        <PhotoModal
          label="사진 비교 크게 보기"
          className="photo-lightbox"
          close={() => setLarge(false)}
        >
          <header className="lightbox-toolbar">
            <strong>사진 비교 · 드래그로 순서 변경</strong>
            <button onClick={() => setLarge(false)}>닫기 (Esc)</button>
          </header>
          {viewerContent()}
        </PhotoModal>
      )}
      {info && (
        <PhotoModal
          label="사진 상세정보"
          className="photo-info-overlay"
          close={() => setInfoId(null)}
        >
          <div className="card">
            <div className="section-title">
              <h3>사진 상세정보</h3>
              <button onClick={() => setInfoId(null)}>닫기</button>
            </div>
            <p>{info.name}</p>
            <p>
              {info.capturedAt
                ? new Date(info.capturedAt).toLocaleString("ko-KR")
                : "촬영 날짜 정보 없음"}
            </p>
            <p>
              {info.sourceConsultationId
                ? "이전 상담에서 가져온 사진"
                : "이 상담에서 추가한 사진"}
            </p>
            <p>
              {info.selected ? "상담·출력에 포함" : "상담·출력에서 제외"} · 주석{" "}
              {info.annotations.length}개
            </p>
            {uploadState(info.mediaId) && (
              <p role="status">{uploadState(info.mediaId)}</p>
            )}
          </div>
        </PhotoModal>
      )}
    </div>
  );
}
export function HistoryPhotoPicker({
  photos,
  onAdd,
}: {
  photos: Photo[];
  onAdd: (photos: Photo[]) => void;
}) {
  const [ids, setIds] = useState<string[]>([]);
  return (
    <div>
      <div className="thumbnail-strip">
        {photos.map((p) => (
          <button
            className={
              "thumbnail-card " + (ids.includes(p.id) ? "is-selected" : "")
            }
            key={p.id}
            aria-pressed={ids.includes(p.id)}
            onClick={() =>
              setIds((x) =>
                x.includes(p.id) ? x.filter((id) => id !== p.id) : [...x, p.id],
              )
            }
          >
            <Thumbnail photo={p} />
            <span>{p.name}</span>
            <small>
              {p.capturedAt
                ? new Date(p.capturedAt).toLocaleDateString("ko-KR")
                : ""}
            </small>
          </button>
        ))}
      </div>
      <button
        className="primary"
        disabled={!ids.length}
        onClick={() => onAdd(photos.filter((p) => ids.includes(p.id)))}
      >
        선택한 {ids.length}장 불러오기
      </button>
    </div>
  );
}
