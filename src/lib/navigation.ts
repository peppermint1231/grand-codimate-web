import { useEffect, useRef } from "react";
const handlers = new Map<symbol, { priority: number; run: () => void }>();
export function appBack() {
  const next = [...handlers.values()].sort(
    (a, b) => b.priority - a.priority,
  )[0];
  next?.run();
}
window.addEventListener("codimate:back", appBack);
export function useAppBack(enabled: boolean, run: () => void, priority = 10) {
  const latest = useRef(run);
  latest.current = run;
  useEffect(() => {
    if (!enabled) return;
    const id = Symbol();
    handlers.set(id, { priority, run: () => latest.current() });
    return () => {
      handlers.delete(id);
    };
  }, [enabled, priority]);
}
