import { useEffect, useRef, useState } from "react";
import { practiceRecipe } from "../core/guideTraining";
import { findTarget, normalize, selectorFor } from "./targets";
import {
  installPractice,
  type PracticeCheckpoint,
  type ReplayAction,
} from "./runtime";
import type { TrainingRoute } from "./environment";
import "../components/GuidePractice.css";
export type PracticeInit = {
  lessonId: string;
  steps: string[];
  checkpoint?: PracticeCheckpoint | null;
  revision: string;
};
export function TrainingCoach({
  initial,
  runtime,
}: {
  initial: PracticeInit;
  runtime: ReturnType<typeof installPractice>;
}) {
  const recipe = practiceRecipe(initial.lessonId)!;
  const [steps, setSteps] = useState(initial.steps),
    [waiting, setWaiting] = useState(false),
    [ready, setReady] = useState(false),
    [rect, setRect] = useState<DOMRect | null>(null);
  const route = useRef<TrainingRoute>(
      initial.checkpoint?.route || recipe.route,
    ),
    actions = useRef<ReplayAction[]>(initial.checkpoint?.actions || []),
    booted = useRef(false),
    pending = useRef(false);
  const session = new URLSearchParams(location.search).get("session"),
    index = steps.length,
    step = recipe.steps[index],
    target = useRef<HTMLElement | undefined>(undefined);
  const post = (data: unknown) =>
    parent.postMessage({ ...(data as any), session }, location.origin);
  useEffect(() => {
    const start = () => {
      if (booted.current) return;
      booted.current = true;
      window.dispatchEvent(
        new CustomEvent("practice:route", { detail: route.current }),
      );
      setTimeout(async () => {
        for (const action of actions.current) {
          const el = document.querySelector<HTMLElement>(action.selector);
          if (!el) continue;
          if (action.value !== undefined) {
            const proto =
              el instanceof HTMLSelectElement
                ? HTMLSelectElement.prototype
                : el instanceof HTMLTextAreaElement
                  ? HTMLTextAreaElement.prototype
                  : HTMLInputElement.prototype;
            Object.getOwnPropertyDescriptor(proto, "value")?.set?.call(
              el,
              action.value,
            );
            el.dispatchEvent(
              new Event(el instanceof HTMLSelectElement ? "change" : "input", {
                bubbles: true,
              }),
            );
          } else el.click();
          await new Promise((r) => setTimeout(r, 80));
        }
        setReady(true);
      }, 250);
    };
    window.addEventListener("practice:ready", start);
    return () => window.removeEventListener("practice:ready", start);
  }, []);
  useEffect(() => {
    const locationChanged = (e: Event) => {
      if (!ready) return;
      const next = (e as CustomEvent).detail;
      if (JSON.stringify(next) !== JSON.stringify(route.current)) {
        route.current = next;
        actions.current = [];
      }
    };
    window.addEventListener("practice:location", locationChanged);
    return () =>
      window.removeEventListener("practice:location", locationChanged);
  }, [ready]);
  useEffect(() => {
    const ack = (e: MessageEvent) => {
      if (
        e.source !== parent ||
        e.origin !== location.origin ||
        e.data?.session !== session ||
        e.data.type !== "practice:ack"
      )
        return;
      setSteps(e.data.steps);
      pending.current = false;
      setWaiting(false);
    };
    window.addEventListener("message", ack);
    return () => window.removeEventListener("message", ack);
  }, []);
  useEffect(() => {
    if (!ready || !step) return;
    let dead = false;
    const locate = () => {
      const el = findTarget(step.target);
      target.current = el;
      setRect(el ? el.getBoundingClientRect() : null);
    };
    locate();
    const timer = setInterval(locate, 180);
    const scroller = setTimeout(
      () =>
        findTarget(step.target)?.scrollIntoView({
          block: "center",
          behavior: "smooth",
        }),
      150,
    );
    const finish = () => {
      if (pending.current || dead) return;
      pending.current = true;
      setWaiting(true);
      setTimeout(() => {
        if (!dead)
          post({
            type: "practice:step",
            stepId: step.id,
            checkpoint: {
              kind: "codimate-practice-v1",
              state: runtime.snapshot(),
              drafts: runtime.drafts(),
              inquiries: runtime.inquiries(),
              route: route.current,
              actions: actions.current,
            },
          });
      }, 180);
    };
    const match = (e: Event) => {
      const el = findTarget(step.target);
      return !!el && (el === e.target || el.contains(e.target as Node));
    };
    const click = (e: Event) => {
      if (pending.current) return;
      const el = (e.target as Element).closest<HTMLElement>(
        'button,summary,a,input[type="checkbox"]',
      );
      if (el && !el.closest(".training-coach") && step.kind !== "command")
        actions.current.push({ selector: selectorFor(el) });
      if (step.kind === "click" && match(e))
        setTimeout(() => {
          if (!step.result || findTarget(step.result)) finish();
        }, 100);
    };
    const input = (e: Event) => {
      if (pending.current) return;
      const el = e.target as HTMLInputElement;
      if (!el.matches("input,textarea,select")) return;
      const selector = selectorFor(el);
      actions.current = actions.current.filter(
        (a) => a.selector !== selector || a.value === undefined,
      );
      actions.current.push({ selector, value: el.value });
      if (
        step.kind === "value" &&
        match(e) &&
        normalize(el.value) === normalize(step.value || "")
      )
        finish();
    };
    const command = (e: Event) => {
      const c = (e as CustomEvent).detail;
      if (step.kind !== "command" || c.type !== step.command) return;
      if (
        Object.entries(step.check || {}).every(
          ([k, v]) => normalize(String(c.payload[k])) === normalize(String(v)),
        )
      ) {
        actions.current = [];
        finish();
      }
    };
    const annotated = () => {
      if (step.kind === "draw") finish();
    };
    window.addEventListener("practice:annotation", annotated);

    document.addEventListener("click", click, true);
    document.addEventListener("input", input, true);
    document.addEventListener("change", input, true);
    window.addEventListener("practice:command", command);
    return () => {
      dead = true;
      window.removeEventListener("practice:annotation", annotated);
      clearInterval(timer);
      clearTimeout(scroller);
      document.removeEventListener("click", click, true);
      document.removeEventListener("input", input, true);
      document.removeEventListener("change", input, true);
      window.removeEventListener("practice:command", command);
    };
  }, [ready, index]);
  useEffect(() => {
    if (ready && !waiting) return;
    const block = (e: KeyboardEvent) => {
      if ((e.target as Element)?.matches("input,textarea,select"))
        e.preventDefault();
    };
    document.addEventListener("keydown", block, true);
    return () => document.removeEventListener("keydown", block, true);
  }, [ready, waiting]);
  return (
    <>
      {(!ready || waiting) && (
        <div className="training-busy-shield" aria-hidden="true" />
      )}
      {rect && (
        <div
          className="training-highlight"
          style={{
            top: rect.top - 4,
            left: rect.left - 4,
            width: rect.width + 8,
            height: rect.height + 8,
          }}
        />
      )}
      <aside
        className="training-coach"
        style={
          rect && rect.bottom > innerHeight - 200
            ? { top: 12, bottom: "auto" }
            : {}
        }
        aria-live="polite"
      >
        <strong>
          {!step
            ? "실습을 완료했습니다"
            : `${index + 1} / ${recipe.steps.length} · 직접 해보세요`}
        </strong>
        <p>
          {!ready
            ? "연습 화면을 준비하고 있습니다…"
            : waiting
              ? "입력 결과 확인 완료 · 진도를 저장하고 있습니다…"
              : step?.instruction ||
                "계정에 저장되었습니다. 위의 돌아가기 버튼으로 다음 과정을 선택하세요."}
        </p>
        {step && ready && !waiting && (
          <button
            onClick={() =>
              findTarget(step.target)?.scrollIntoView({
                block: "center",
                behavior: "smooth",
              })
            }
          >
            해당 위치 보기
          </button>
        )}
        {step && ready && !rect && (
          <small>
            안내 위치가 보이지 않으면 저장된 단계부터 다시 열 수 있습니다.{" "}
            <button onClick={() => post({ type: "practice:reopen" })}>
              현재 단계 다시 열기
            </button>
          </small>
        )}
      </aside>
    </>
  );
}
