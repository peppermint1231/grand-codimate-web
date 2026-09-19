import { useEffect, useRef, useState } from "react";
import type { Photo } from "../core/model";
import { PhotoPreview, PhotoEditor } from "./PhotoEditor";
import { mediaUrl, uploadState, watchUploads } from "../lib/api";
function Thumbnail({ photo }: { photo: Photo }) {
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
  const dragged = useRef<string | null>(null);
  useEffect(() => watchUploads(() => update((v) => v + 1)), []);
  const selected = photos.filter((p) => p.selected),
    edit = photos.find((p) => p.id === editing),
    info = photos.find((p) => p.id === infoId);
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
  const grid = (
    <div
      className="comparison-grid"
      style={{ gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))` }}
      data-columns={columns}
    >
      {selected.map((p, i) => (
        <figure
          key={p.id}
          data-photo-id={p.id}
          draggable={!readonly}
          onDragStart={(e) => {
            dragged.current = p.id;
            e.dataTransfer.setData("text/plain", p.id);
          }}
          onDragOver={(e) => e.preventDefault()}
          onDrop={(e) => {
            e.preventDefault();
            move(dragged.current || e.dataTransfer.getData("text/plain"), p.id);
            dragged.current = null;
          }}
        >
          <PhotoPreview photo={p} />
          <figcaption className="photo-overlay-actions">
            <span className="photo-index">{i + 1}</span>
            <button
              aria-label={`${p.name} 상세정보`}
              title="상세정보"
              onClick={() => setInfoId(p.id)}
            >
              ℹ
            </button>
            <button
              aria-label={`${p.name} 편집·확대`}
              title="편집·확대"
              onClick={() => {
                setLarge(false);
                setEditing(p.id);
              }}
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
        썸네일을 누르면 상담·출력에 포함됩니다. 다시 누르면 제외됩니다. 순서
        손잡이를 끌어 배치를 바꾸세요.
      </p>
      <div className="thumbnail-strip">
        {photos.map((p, i) => (
          <div
            className={"thumbnail-card " + (p.selected ? "is-selected" : "")}
            key={p.id}
            data-photo-id={p.id}
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => {
              e.preventDefault();
              move(
                dragged.current || e.dataTransfer.getData("text/plain"),
                p.id,
              );
              dragged.current = null;
            }}
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
            {uploadState(p.mediaId) && (
              <span
                className="upload-state"
                role="status"
                title={uploadState(p.mediaId)}
              >
                ⏳
              </span>
            )}
            <div className="thumb-actions">
              <button
                aria-label={`${p.name} 편집`}
                title="편집"
                onClick={() => setEditing(editing === p.id ? null : p.id)}
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
                draggable={!readonly}
                onDragStart={(e) => {
                  dragged.current = p.id;
                  e.dataTransfer.setData("text/plain", p.id);
                }}
                onPointerDown={(e) => {
                  if (e.pointerType !== "mouse") {
                    dragged.current = p.id;
                    e.currentTarget.setPointerCapture(e.pointerId);
                  }
                }}
                onPointerUp={(e) => {
                  if (e.pointerType !== "mouse" && dragged.current) {
                    const target = document
                      .elementFromPoint(e.clientX, e.clientY)
                      ?.closest<HTMLElement>("[data-photo-id]")
                      ?.dataset.photoId;
                    if (target) move(p.id, target);
                    dragged.current = null;
                  }
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
      <div className="comparison-toolbar">
        <strong>선택한 사진 {selected.length}장</strong>
        <div className="button-row">
          {[1, 2, 3, 4].map((n) => (
            <button
              key={n}
              aria-pressed={columns === n}
              className={columns === n ? "selected" : ""}
              disabled={readonly}
              onClick={() => onColumns(n)}
            >
              {n}열
            </button>
          ))}
          <button disabled={!selected.length} onClick={() => setLarge(true)}>
            비교 크게 보기
          </button>
        </div>
      </div>
      {selected.length ? (
        grid
      ) : (
        <div className="empty">비교할 사진의 썸네일을 선택하세요.</div>
      )}
      {edit && (
        <section className="active-photo-editor">
          <div className="section-title">
            <h3>{edit.name}</h3>
            <button onClick={() => setEditing(null)}>편집 닫기</button>
          </div>
          <PhotoEditor
            key={edit.id}
            photo={edit}
            userId={userId}
            readonly={!canAnnotate}
            canEraseAll={admin}
            onChange={(p) =>
              onChange(photos.map((x) => (x.id === p.id ? p : x)))
            }
          />
        </section>
      )}
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
          <button
            autoFocus
            className="lightbox-close"
            onClick={() => setLarge(false)}
          >
            닫기 (Esc)
          </button>
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
