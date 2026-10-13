import { useEffect, useRef, useState } from "react";
import { api } from "./api";
import {
  guideUpdates,
  readGuideProgress,
  type GuideProgress,
} from "../core/userGuide";
import { trainingMode } from "../training/environment";
export function useGuideProgress(userId: string) {
  const [progress, setProgress] = useState<GuideProgress>({ lessons: {} }),
    [loading, setLoading] = useState(false),
    [error, setError] = useState("");
  const owner = useRef(userId),
    generation = useRef(0),
    queue = useRef(Promise.resolve()),
    lastRead = useRef(0);
  const adopt = (p: GuideProgress, id: string, gen: number) => {
    if (owner.current === id && generation.current === gen) {
      setProgress((old) => ((old.version || 0) > (p.version || 0) ? old : p));
      setError("");
    }
  };
  useEffect(() => {
    owner.current = userId;
    const gen = ++generation.current;
    setProgress({ lessons: {} });
    setError("");
    lastRead.current = 0;
    if (!userId || trainingMode) return;
    const c = new AbortController();
    let reading = false;
    const load = async () => {
      if (
        reading ||
        document.visibilityState === "hidden" ||
        Date.now() - lastRead.current < 10000
      )
        return;
      reading = true;
      setLoading(true);
      try {
        const p = await api<GuideProgress>(
          "/guide-progress",
          { signal: AbortSignal.any([c.signal, AbortSignal.timeout(15000)]) },
          { operation: null },
        );
        adopt(p, userId, gen);
        lastRead.current = Date.now();
        const local = readGuideProgress(
          localStorage,
          "codimate-guide:" + userId,
        );
        const legacy = Object.fromEntries(
          Object.entries(local.lessons)
            .filter(([, v]) => v.acknowledged)
            .map(([id, v]) => [id, { acknowledged: v.acknowledged }]),
        );
        if (Object.keys(legacy).length) {
          const merged = await api<GuideProgress>(
            "/guide-progress",
            {
              method: "POST",
              body: JSON.stringify({ action: "migrate", legacy }),
              signal: c.signal,
            },
            { operation: null },
          );
          adopt(merged, userId, gen);
          localStorage.removeItem("codimate-guide:" + userId);
        }
      } catch (e) {
        if (!c.signal.aborted && generation.current === gen)
          setError(
            e instanceof Error ? e.message : "학습 진도를 불러오지 못했습니다.",
          );
      } finally {
        reading = false;
        if (generation.current === gen) setLoading(false);
      }
    };
    void load();
    const focus = () => void load();
    window.addEventListener("focus", focus);
    window.addEventListener("online", focus);
    document.addEventListener("visibilitychange", focus);
    return () => {
      c.abort();
      window.removeEventListener("focus", focus);
      window.removeEventListener("online", focus);
      document.removeEventListener("visibilitychange", focus);
    };
  }, [userId]);
  const change = (
    action: "select" | "ack" | "step" | "skip" | "review" | "restart",
    lessonId: string,
    extra: Record<string, unknown> = {},
  ) => {
    const id = userId,
      gen = generation.current;
    const task = queue.current
      .catch(() => {})
      .then(async () => {
        if (owner.current !== id || generation.current !== gen)
          throw Error("계정이 변경되었습니다.");
        const p = await api<GuideProgress>(
          "/guide-progress",
          {
            method: "POST",
            body: JSON.stringify({
              action,
              lessonId,
              revision: guideUpdates[lessonId]?.revision,
              ...extra,
            }),
            signal: AbortSignal.timeout(15000),
          },
          { operation: null },
        );
        adopt(p, id, gen);
        return p;
      });
    queue.current = task.then(
      () => {},
      (e) => {
        if (owner.current === id && generation.current === gen)
          setError(
            e instanceof Error ? e.message : "진도를 저장하지 못했습니다.",
          );
      },
    );
    return task;
  };
  const checkpoint = async (lessonId: string) => {
    const id = userId,
      gen = generation.current;
    const r = await api<{ progress: GuideProgress; checkpoint: unknown }>(
      "/guide-progress?checkpoint=" + encodeURIComponent(lessonId),
      { signal: AbortSignal.timeout(15000) },
      { operation: null },
    );
    if (owner.current !== id || gen !== generation.current)
      throw Error("계정이 변경되었습니다.");
    adopt(r.progress, id, gen);
    return r;
  };
  return {
    progress: owner.current === userId ? progress : { lessons: {} },
    loading,
    error,
    change,
    checkpoint,
  };
}
export type GuideLearning = ReturnType<typeof useGuideProgress>;
