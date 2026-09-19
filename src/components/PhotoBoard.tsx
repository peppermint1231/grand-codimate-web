import { useEffect, useLayoutEffect, useRef, useState } from "react";
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
  const cover = photos.find((p) => p.representative);
  return cover ? (
    <span className="consultation-cover">
      <PhotoPreview photo={cover} />
    </span>
  ) : null;
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
}: {
  photos: Photo[];
  columns: number;
  onChange: (p: Photo[]) => void;
  onColumns: (n: number) => void;
  userId: string;
  readonly: boolean;
  canAnnotate: boolean;
  admin: boolean;
}) {
  const [editing, setEditing] = useState<string | null>(null),
    [, update] = useState(0),
    [large, setLarge] = useState(false),
    [infoId, setInfoId] = useState<string | null>(null);
  const [drag, setDrag] = useState<{
    id: string;
    x: number;
    y: number;
    target?: string;
  } | null>(null);
  const strip = useRef<HTMLDivElement>(null),
    editor = useRef<HTMLElement>(null);
  const positions = useRef(new Map<string, DOMRect>());
  useEffect(() => watchUploads(() => update((v) => v + 1)), []);
  useLayoutEffect(() => {
    const next = new Map<string, DOMRect>();
    strip.current
      ?.querySelectorAll<HTMLElement>(".thumbnail-card")
      .forEach((el) => {
        const id = el.dataset.photoId!,
          rect = el.getBoundingClientRect(),
          prev = positions.current.get(id);
        if (prev && (prev.x !== rect.x || prev.y !== rect.y))
          el.animate(
            [
              {
                transform: `translate(${prev.x - rect.x}px, ${prev.y - rect.y}px)`,
              },
              { transform: "translate(0, 0)" },
            ],
            { duration: 220, easing: "ease-out" },
          );
        next.set(id, rect);
      });
    positions.current = next;
  }, [photos.map((p) => p.id).join(",")]);
  const selected = photos.filter((p) => p.selected),
    edit = photos.find((p) => p.id === editing) || selected[0],
    info = photos.find((p) => p.id === infoId);
  const mayLeave = () =>
    window.dispatchEvent(
      new Event("codimate:before-photo-leave", { cancelable: true }),
    );
  const openEditor = (id: string) => {
    if (id !== edit?.id && !mayLeave()) return;
    setLarge(false);
    setEditing(id);
    requestAnimationFrame(() =>
      editor.current?.scrollIntoView({ behavior: "smooth", block: "start" }),
    );
  };
  useAppBack(
    large || !!info,
    () => (info ? setInfoId(null) : setLarge(false)),
    60,
  );
  const move = (id: string, target: string) => {
    if (readonly || id === target) return;
    const next = [...photos],
      from = next.findIndex((p) => p.id === id),
      to = next.findIndex((p) => p.id === target);
    if (from < 0 || to < 0) return;
    next.splice(to, 0, next.splice(from, 1)[0]);
    onChange(next);
  };
  const toggle = (p: Photo) => {
    if (!readonly)
      onChange(
        photos.map((x) =>
          x.id === p.id ? { ...x, selected: !x.selected } : x,
        ),
      );
  };
  const stopDrag = () => setDrag(null);
  const grid = (
    <div
      className="comparison-grid"
      style={{ gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))` }}
      data-columns={columns}
    >
      {selected.map((p, i) => (
        <figure key={p.id} data-photo-id={p.id}>
          <PhotoPreview photo={p} />
          <figcaption className="photo-overlay-actions">
            <span className="photo-index">{i + 1}</span>
            <button
              aria-label={`${p.name} 상세정보`}
              onClick={() => setInfoId(p.id)}
            >
              ℹ
            </button>
            <button
              aria-label={`${p.name} 편집·확대`}
              onClick={() => openEditor(p.id)}
            >
              ✎
            </button>
          </figcaption>
        </figure>
      ))}
    </div>
  );
  return (
    <div className="photo-board">
      <p className="small">
        썸네일을 눌러 상담·출력 사진을 선택하세요. ☆ 대표사진 · ⠿ 끌어서 순서
        이동
      </p>
      <div
        className="thumbnail-strip"
        ref={strip}
        onPointerMove={(e) => {
          if (!drag) return;
          const target = document
            .elementFromPoint(e.clientX, e.clientY)
            ?.closest<HTMLElement>(".thumbnail-card")?.dataset.photoId;
          setDrag({ id: drag.id, x: e.clientX, y: e.clientY, target });
          if (target && target !== drag.id) move(drag.id, target);
          const r = strip.current?.getBoundingClientRect();
          if (r && strip.current) {
            if (e.clientX > r.right - 32) strip.current.scrollLeft += 15;
            else if (e.clientX < r.left + 32) strip.current.scrollLeft -= 15;
          }
        }}
        onPointerUp={stopDrag}
        onPointerCancel={stopDrag}
        onLostPointerCapture={stopDrag}
      >
        {photos.map((p, i) => (
          <div
            className={
              "thumbnail-card " +
              (p.selected ? "is-selected " : "") +
              (drag?.id === p.id ? "is-dragging " : "") +
              (drag?.target === p.id ? "drop-target" : "")
            }
            key={p.id}
            data-photo-id={p.id}
          >
            <button
              className="thumbnail-toggle"
              aria-label={`${p.name} 선택`}
              aria-pressed={p.selected}
              disabled={readonly}
              onClick={() => toggle(p)}
            >
              <Thumbnail photo={p} />
              <span className="photo-selection-mark" aria-hidden="true">
                {p.selected ? "✓" : "○"}
              </span>
            </button>
            <button
              className={
                "photo-cover-toggle " + (p.representative ? "is-cover" : "")
              }
              aria-label={`${p.name} 대표사진`}
              aria-pressed={!!p.representative}
              disabled={readonly}
              onClick={() =>
                onChange(
                  photos.map((x) => ({
                    ...x,
                    representative: x.id === p.id && !p.representative,
                  })),
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
                (!admin && p.annotations.some((a) => a.authorId !== userId))
              }
              onClick={() => {
                if (
                  !window.confirm(
                    "이 사진을 현재 상담에서 삭제할까요? 상담 저장 시 반영됩니다.",
                  )
                )
                  return;
                if (edit?.id === p.id && !mayLeave()) return;
                onChange(photos.filter((x) => x.id !== p.id));
                if (editing === p.id) setEditing(null);
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
                disabled={readonly}
                aria-label={`${p.name} 순서 이동`}
                title="끌어서 이동 · 좌우 화살표로 이동"
                onPointerDown={(e) => {
                  e.preventDefault();
                  strip.current?.setPointerCapture(e.pointerId);
                  setDrag({ id: p.id, x: e.clientX, y: e.clientY });
                }}
                onKeyDown={(e) => {
                  if (e.key === "ArrowLeft" && i > 0) {
                    e.preventDefault();
                    move(p.id, photos[i - 1].id);
                  }
                  if (e.key === "ArrowRight" && i < photos.length - 1) {
                    e.preventDefault();
                    move(p.id, photos[i + 1].id);
                  }
                }}
              >
                ⠿
              </button>
            </div>
          </div>
        ))}
      </div>
      {drag && (
        <div
          className="photo-drag-ghost"
          style={{ left: drag.x + 12, top: drag.y + 12 }}
        >
          <Thumbnail photo={photos.find((p) => p.id === drag.id)!} />
          <span>이 위치로 이동</span>
        </div>
      )}
      <div className="comparison-toolbar">
        <strong>선택한 사진 {selected.length}장</strong>
        <button disabled={!selected.length} onClick={() => setLarge(true)}>
          비교 크게 보기
        </button>
      </div>
      <div className="photo-edit-workspace">
        <aside className="selected-photo-rail" aria-label="선택한 사진 목록">
          {selected.map((p) => (
            <button
              key={p.id}
              className={edit?.id === p.id ? "selected" : ""}
              aria-label={`${p.name} 바로 편집`}
              aria-pressed={edit?.id === p.id}
              onClick={() => openEditor(p.id)}
            >
              <Thumbnail photo={p} />
            </button>
          ))}
        </aside>
        {edit ? (
          <section className="active-photo-editor" ref={editor}>
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
        ) : (
          <div className="empty">사진을 선택하거나 ✎ 편집을 누르세요.</div>
        )}
      </div>
      {info && (
        <div
          className="photo-info-overlay"
          role="dialog"
          aria-modal="true"
          aria-label="사진 상세정보"
          onClick={() => setInfoId(null)}
        >
          <div className="card" onClick={(e) => e.stopPropagation()}>
            <div className="section-title">
              <h3>사진 상세정보</h3>
              <button autoFocus onClick={() => setInfoId(null)}>
                닫기
              </button>
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
        </div>
      )}
      {large && (
        <div
          className="photo-lightbox"
          role="dialog"
          aria-modal="true"
          aria-label="사진 비교 크게 보기"
          onKeyDown={(e) => {
            if (e.key === "Escape") setLarge(false);
          }}
        >
          <div className="lightbox-toolbar">
            <strong>사진 비교</strong>
            <div className="button-row">
              {[1, 2, 3, 4].map((n) => (
                <button
                  key={n}
                  aria-pressed={columns === n}
                  className={columns === n ? "selected" : ""}
                  onClick={() => onColumns(n)}
                >
                  {n}열
                </button>
              ))}
              <button autoFocus onClick={() => setLarge(false)}>
                닫기 (Esc)
              </button>
            </div>
          </div>
          {grid}
        </div>
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
