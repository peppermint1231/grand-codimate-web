import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { createPortal } from "react-dom";
import { progressSnapshot, watchProgress } from "../lib/operationProgress";
import { useAppBack } from "../lib/navigation";
export function OperationProgressDialog() {
  const progress = useSyncExternalStore(watchProgress, progressSnapshot);
  const ref = useRef<HTMLDivElement>(null);
  const [now, setNow] = useState(Date.now());
  useAppBack(!!progress, () => {}, 100000);
  useEffect(() => {
    if (!progress) return;
    const previous = document.activeElement as HTMLElement | null;
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    ref.current?.focus();
    const key = (e: KeyboardEvent) => {
      // The status dialog has no inputs. Keep underlying save shortcuts inactive.
      e.preventDefault();
      e.stopImmediatePropagation();
      ref.current?.focus();
    };
    const leave = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = "";
    };
    document.addEventListener("keydown", key, true);
    window.addEventListener("beforeunload", leave);
    const timer = setInterval(() => setNow(Date.now()), 1000);
    setNow(Date.now());
    return () => {
      clearInterval(timer);
      document.removeEventListener("keydown", key, true);
      window.removeEventListener("beforeunload", leave);
      document.body.style.overflow = overflow;
      if (previous?.isConnected) previous.focus();
    };
  }, [progress?.id]);
  if (!progress) return null;
  const elapsed = Math.max(0, Math.floor((now - progress.startedAt) / 1000));
  return createPortal(
    <div
      className="operation-progress-overlay"
      role="dialog"
      aria-modal="true"
      aria-labelledby="operation-progress-title"
      aria-describedby="operation-progress-detail"
      tabIndex={-1}
      ref={ref}
    >
      <section className="operation-progress-card">
        <div className="operation-spinner" aria-hidden="true" />
        <h2 id="operation-progress-title" aria-live="polite">
          {progress.title}
        </h2>
        <p id="operation-progress-detail">
          {progress.detail || "작업을 처리하고 있습니다. 잠시 기다려주세요."}
        </p>
        <div className="operation-progress-label">
          <span>
            {progress.percent === undefined
              ? "처리 중"
              : progress.metric || "진행률"}
          </span>
          <strong>
            {progress.percent === undefined ? "…" : `${progress.percent}%`}
          </strong>
        </div>
        <progress
          aria-label={progress.metric || "작업 진행률"}
          max={100}
          value={progress.percent}
        />
        <p className="operation-progress-hint">
          {elapsed >= 15
            ? "저장 확인에 시간이 걸리고 있습니다. 창을 닫지 말고 기다려주세요."
            : "완료되면 자동으로 닫힙니다."}
          <span aria-hidden="true">{elapsed}초 경과</span>
        </p>
      </section>
    </div>,
    document.body,
  );
}
