import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import type { GuideLearning } from "../lib/guideProgress";
import { guideLessons, guideStatus, guideUpdates } from "../core/userGuide";
import { practiceRecipe } from "../core/guideTraining";
import "./GuidePractice.css";
export function GuidePractice({
  lessonId,
  learning,
  onClose,
}: {
  lessonId: string;
  learning: GuideLearning;
  onClose: () => void;
}) {
  const frame = useRef<HTMLIFrameElement>(null),
    session = useRef(crypto.randomUUID()),
    pending = useRef<any>(null),
    active = useRef(true),
    loadEpoch = useRef(0);
  const [init, setInit] = useState<any>(),
    [error, setError] = useState(""),
    [saving, setSaving] = useState(false),
    [complete, setComplete] = useState(false);
  const lesson = guideLessons.find((l) => l.id === lessonId)!,
    recipe = practiceRecipe(lessonId)!;
  const learningRef = useRef(learning);
  learningRef.current = learning;
  const post = (data: any) =>
    frame.current?.contentWindow?.postMessage(
      { ...data, session: session.current },
      location.origin,
    );
  const save = async () => {
    if (!pending.current || saving) return;
    setSaving(true);
    setError("");
    try {
      const item = pending.current;
      const p = await learningRef.current.change("step", lessonId, {
        stepId: item.stepId,
        checkpoint: item.checkpoint,
      });
      if (!active.current) return;
      pending.current = null;
      const status = guideStatus(lesson, p);
      setComplete(status.completed);
      post({ type: "practice:ack", steps: status.steps });
    } catch (e) {
      if (active.current) setError((e as Error).message);
    } finally {
      if (active.current) setSaving(false);
    }
  };
  useEffect(() => {
    active.current = true;
    const epoch = ++loadEpoch.current;
    const previous = document.activeElement as HTMLElement;
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    void learning
      .checkpoint(lessonId)
      .then(async (r) => {
        if (!active.current || epoch !== loadEpoch.current) return;
        let status = guideStatus(lesson, r.progress);
        if (status.completed) {
          await learning.change("restart", lessonId);
          r.checkpoint = null;
          status = { ...status, steps: [] };
        }
        if (active.current && epoch === loadEpoch.current)
          setInit({
            type: "practice:init",
            lessonId,
            checkpoint: r.checkpoint,
            steps: status.steps,
            revision: guideUpdates[lessonId].revision,
          });
      })
      .catch((e) => {
        if (active.current && epoch === loadEpoch.current) setError(e.message);
      });
    return () => {
      active.current = false;
      loadEpoch.current++;
      document.body.style.overflow = overflow;
      previous?.focus();
    };
  }, [lessonId]);
  useEffect(() => {
    const receive = (e: MessageEvent) => {
      if (
        e.source !== frame.current?.contentWindow ||
        e.origin !== location.origin ||
        e.data?.session !== session.current
      )
        return;
      if (e.data.type === "practice:ready" && init) post(init);
      if (e.data.type === "practice:step" && !pending.current) {
        if (!recipe.steps.some((s) => s.id === e.data.stepId)) return;
        pending.current = e.data;
        void save();
      }
      if (e.data.type === "practice:reopen" && !pending.current) {
        setInit(undefined);
        void learningRef.current
          .checkpoint(lessonId)
          .then((r) => {
            if (active.current)
              setInit({
                type: "practice:init",
                lessonId,
                checkpoint: r.checkpoint,
                steps: guideStatus(lesson, r.progress).steps,
                revision: guideUpdates[lessonId].revision,
              });
          })
          .catch((e) => setError(e.message));
      }
      if (e.data.type === "practice:error") setError(e.data.message);
    };
    window.addEventListener("message", receive);
    return () => window.removeEventListener("message", receive);
  }, [init, saving]);
  return createPortal(
    <section
      className="guide-practice-shell"
      role="dialog"
      aria-modal="true"
      aria-label={lesson.title + " 연습"}
    >
      <header>
        <div>
          <strong>
            가상 자료 연습 · {lesson.title.replace(/^\d+\. /, "")}
          </strong>
          <small>
            {saving
              ? "계정에 진도 저장 중…"
              : complete
                ? "실습 완료 · 계정에 저장했습니다"
                : "실제 업무 자료는 바뀌지 않습니다 · 완료 단계는 계정에 저장됩니다"}
          </small>
        </div>
        <button autoFocus disabled={saving} onClick={onClose}>
          {complete ? "학습 완료 · 돌아가기" : "일시정지 · 나가기"}
        </button>
      </header>
      {error && (
        <div role="alert" className="guide-practice-error">
          {error}{" "}
          {pending.current && (
            <button onClick={() => void save()}>진도 저장 재시도</button>
          )}
          <small>
            저장에 성공한 단계까지 다른 기기에서 이어갈 수 있습니다.
          </small>
        </div>
      )}
      {init ? (
        <iframe
          ref={frame}
          title="코디메이트 가상 자료 실습"
          sandbox="allow-scripts allow-same-origin allow-modals allow-downloads allow-forms"
          src={location.pathname + "?training=1&session=" + session.current}
          onLoad={() => post(init)}
        />
      ) : (
        <p role="status">계정에서 연습 진도를 불러오는 중입니다.</p>
      )}
    </section>,
    document.body,
  );
}
