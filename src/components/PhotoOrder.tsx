import {
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";
import type { Photo } from "../core/model";
import { movePhotoIds } from "../core/photoOrder";

type Drag = {
  id: string;
  pointer: number;
  x: number;
  y: number;
  startX: number;
  startY: number;
  ids: string[];
  target: string;
  active: boolean;
  rects: DOMRect[];
  scrollX: number;
  scrollY: number;
};

export function PhotoOrder({
  photos,
  disabled,
  onOrder,
  className,
  style,
  label,
  children,
  ghost,
}: {
  photos: Photo[];
  disabled: boolean;
  onOrder: (ids: string[]) => void;
  className: string;
  style?: CSSProperties;
  label: string;
  children: (photo: Photo, index: number) => ReactNode;
  ghost: (photo: Photo) => ReactNode;
}) {
  const root = useRef<HTMLDivElement>(null);
  const current = useRef<Drag | null>(null);
  const [drag, setDrag] = useState<Drag | null>(null);
  const suppressClick = useRef(false);
  const [announcement, announce] = useState("");
  const cancel = () => {
    current.current = null;
    setDrag(null);
  };
  const signature = photos.map((p) => p.id).join(",");
  useEffect(cancel, [signature, disabled]);
  useEffect(() => {
    if (!drag) return;
    const key = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        e.stopPropagation();
        cancel();
      }
    };
    window.addEventListener("keydown", key, true);
    return () => window.removeEventListener("keydown", key, true);
  }, [!!drag]);
  const preview = drag?.active
    ? movePhotoIds(drag.ids, drag.id, drag.target)
    : null;
  return (
    <>
      <div
        ref={root}
        className={className + " photo-order"}
        style={style}
        aria-label={label}
        onClickCapture={(e) => {
          if (suppressClick.current) {
            e.preventDefault();
            e.stopPropagation();
            suppressClick.current = false;
          }
        }}
        onPointerDown={(e) => {
          if (disabled || e.button !== 0 || !e.isPrimary) return;
          const target = e.target as HTMLElement;
          if (!target.closest("[data-photo-drag]")) return;
          const item = target.closest<HTMLElement>("[data-sort-id]");
          if (!item || item.parentElement !== root.current) return;
          suppressClick.current = false;
          const el = root.current!;
          const next: Drag = {
            id: item.dataset.sortId!,
            target: item.dataset.sortId!,
            pointer: e.pointerId,
            x: e.clientX,
            y: e.clientY,
            startX: e.clientX,
            startY: e.clientY,
            ids: photos.map((p) => p.id),
            rects: [...el.children].map((c) => c.getBoundingClientRect()),
            scrollX: el.scrollLeft,
            scrollY: el.scrollTop,
            active: false,
          };
          current.current = next;
          // Capture on the pressed element so a tap still reaches its button.
          target.setPointerCapture(e.pointerId);
        }}
        onPointerMove={(e) => {
          const d = current.current,
            el = root.current;
          if (!d || !el || d.pointer !== e.pointerId) return;
          if (
            !d.active &&
            Math.hypot(e.clientX - d.startX, e.clientY - d.startY) < 7
          )
            return;
          e.preventDefault();
          suppressClick.current = true;
          const bounds = el.getBoundingClientRect();
          if (el.scrollWidth > el.clientWidth) {
            if (e.clientX > bounds.right - 28) el.scrollLeft += 14;
            if (e.clientX < bounds.left + 28) el.scrollLeft -= 14;
          }
          if (el.scrollHeight > el.clientHeight) {
            if (e.clientY > bounds.bottom - 28) el.scrollTop += 14;
            if (e.clientY < bounds.top + 28) el.scrollTop -= 14;
          }
          const x = e.clientX + el.scrollLeft - d.scrollX,
            y = e.clientY + el.scrollTop - d.scrollY;
          // Hit-test fixed slots, never the animated elements under the pointer.
          const distances = d.rects.map((r) =>
            Math.hypot(x - r.x - r.width / 2, y - r.y - r.height / 2),
          );
          const index = distances.indexOf(Math.min(...distances));
          const next = {
            ...d,
            x: e.clientX,
            y: e.clientY,
            active: true,
            target: d.ids[index],
          };
          current.current = next;
          setDrag(next);
        }}
        onPointerUp={(e) => {
          const d = current.current;
          if (!d || d.pointer !== e.pointerId) return;
          cancel();
          if (d.active && d.id !== d.target && d.ids.join(",") === signature) {
            const ids = movePhotoIds(d.ids, d.id, d.target);
            onOrder(ids);
            announce(
              `${photos.find((p) => p.id === d.id)?.name} ${ids.indexOf(d.id) + 1}번째로 이동`,
            );
          }
        }}
        onPointerCancel={cancel}
        onLostPointerCapture={cancel}
        onKeyDown={(e) => {
          if (
            disabled ||
            !(e.target as HTMLElement).matches("[data-photo-drag]")
          )
            return;
          const direction = {
            ArrowLeft: -1,
            ArrowUp: -1,
            ArrowRight: 1,
            ArrowDown: 1,
          }[e.key];
          if (!direction) return;
          e.preventDefault();
          const id = (e.target as HTMLElement).closest<HTMLElement>(
            "[data-sort-id]",
          )?.dataset.sortId;
          const at = photos.findIndex((p) => p.id === id),
            to = at + direction;
          if (at < 0 || to < 0 || to >= photos.length) return;
          onOrder(
            movePhotoIds(
              photos.map((p) => p.id),
              id!,
              photos[to].id,
            ),
          );
          announce(`${photos[at].name} ${to + 1}번째로 이동`);
        }}
      >
        {photos.map((photo, i) => {
          const to = preview?.indexOf(photo.id) ?? i;
          const a = drag?.rects[i],
            b = drag?.rects[to];
          return (
            <div
              key={photo.id}
              data-sort-id={photo.id}
              className={
                "photo-order-item" +
                (drag?.active && drag.id === photo.id ? " is-dragging" : "")
              }
              style={
                a && b && preview
                  ? { transform: `translate(${b.x - a.x}px, ${b.y - a.y}px)` }
                  : undefined
              }
            >
              {children(photo, i)}
            </div>
          );
        })}
      </div>
      <span className="sr-only" role="status">
        {announcement}
      </span>
      {drag?.active &&
        photos.some((p) => p.id === drag.id) &&
        createPortal(
          <div
            className="photo-drag-ghost"
            style={{ left: drag.x + 14, top: drag.y + 14 }}
          >
            {ghost(photos.find((p) => p.id === drag.id)!)}
            <span>{preview!.indexOf(drag.id) + 1}번째로 이동</span>
          </div>,
          document.body,
        )}
    </>
  );
}
