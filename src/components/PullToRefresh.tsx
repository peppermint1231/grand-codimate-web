import { useEffect, useRef, useState } from "react";
const blocked =
  "input, textarea, select, button, a, [contenteditable=true], [role=dialog], [role=alertdialog], [role=separator], canvas, .photo-stage, .photo-compare, .overlay";
export function PullToRefresh({
  onRefresh,
  disabled,
}: {
  onRefresh: () => Promise<unknown>;
  disabled: boolean;
}) {
  const latest = useRef({ onRefresh, disabled });
  latest.current = { onRefresh, disabled };
  const [distance, setDistance] = useState(0),
    [message, setMessage] = useState("");
  useEffect(() => {
    let gesture: { x: number; y: number; distance: number } | undefined,
      loading = false,
      alive = true;
    const reset = () => {
      gesture = undefined;
      if (alive) setDistance(0);
    };
    const start = (e: TouchEvent) => {
      reset();
      if (
        loading ||
        latest.current.disabled ||
        e.touches.length !== 1 ||
        window.scrollY > 0
      )
        return;
      const target = e.target instanceof Element ? e.target : null;
      if (!target?.closest(".workspace") || target.closest(blocked)) return;
      // A nested scroll area owns its gesture, even when it is at its top.
      for (
        let el: Element | null = target;
        el && el !== document.body;
        el = el.parentElement
      )
        if (
          /(auto|scroll)/.test(getComputedStyle(el).overflowY) &&
          el.scrollHeight > el.clientHeight + 1
        )
          return;
      gesture = {
        x: e.touches[0].clientX,
        y: e.touches[0].clientY,
        distance: 0,
      };
      setMessage("");
    };
    const move = (e: TouchEvent) => {
      if (!gesture) return;
      if (e.touches.length !== 1 || latest.current.disabled) {
        reset();
        return;
      }
      const dx = e.touches[0].clientX - gesture.x,
        dy = e.touches[0].clientY - gesture.y;
      if ((Math.abs(dx) > 24 && Math.abs(dx) > Math.abs(dy)) || dy < -8) {
        reset();
        return;
      }
      if (dy > 8) {
        if (e.cancelable) e.preventDefault();
        gesture.distance = Math.min(96, dy * 0.5);
        setDistance(gesture.distance);
      }
    };
    const end = () => {
      const run =
        !!gesture && gesture.distance >= 64 && !latest.current.disabled;
      reset();
      if (!run || loading) return;
      loading = true;
      setMessage("새로고침 중…");
      Promise.resolve()
        .then(() => latest.current.onRefresh())
        .then((ok) => {
          if (alive)
            setMessage(ok ? "새로고침 완료" : "새로고침하지 못했습니다");
        })
        .catch(() => {
          if (alive) setMessage("새로고침하지 못했습니다");
        })
        .finally(() => {
          loading = false;
        });
    };
    document.documentElement.classList.add("custom-pull-refresh");
    document.addEventListener("touchstart", start, { passive: true });
    document.addEventListener("touchmove", move, { passive: false });
    document.addEventListener("touchend", end);
    document.addEventListener("touchcancel", reset);
    return () => {
      alive = false;
      document.documentElement.classList.remove("custom-pull-refresh");
      document.removeEventListener("touchstart", start);
      document.removeEventListener("touchmove", move);
      document.removeEventListener("touchend", end);
      document.removeEventListener("touchcancel", reset);
    };
  }, []);
  useEffect(() => {
    if (!message || message === "새로고침 중…") return;
    const t = setTimeout(() => setMessage(""), 2500);
    return () => clearTimeout(t);
  }, [message]);
  return distance > 8 || message ? (
    <div className="pull-refresh-indicator" role="status">
      {message || (distance >= 64 ? "놓으면 새로고침" : "아래로 당겨 새로고침")}
    </div>
  ) : null;
}
