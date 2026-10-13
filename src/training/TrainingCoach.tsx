import { createPortal } from "react-dom";
import scenarios from "../data/guidePracticeScenarios.json";
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
  const [fullscreen, setFullscreen] = useState<Element | null>(
    document.fullscreenElement,
  );
  useEffect(() => {
    const changed = () => setFullscreen(document.fullscreenElement);
    const fallback = (e: Event) => setFullscreen((e as CustomEvent).detail);
    document.addEventListener("fullscreenchange", changed);
    window.addEventListener("practice:fullscreen", fallback);
    return () => {
      document.removeEventListener("fullscreenchange", changed);
      window.removeEventListener("practice:fullscreen", fallback);
    };
  }, []);
  const recipe = practiceRecipe(initial.lessonId)!;
  const scenario = scenarios[initial.lessonId as keyof typeof scenarios];
  const [briefed, setBriefed] = useState(initial.steps.length > 0),
    [choice, setChoice] = useState<number | null>(null),
    [hint, setHint] = useState(
      initial.steps.length === recipe.steps.length - 1,
    ),
    [collapsed, setCollapsed] = useState(false),
    [feedback, setFeedback] = useState<{
      rect: DOMRect | null;
      why: string;
      id: string;
    } | null>(null),
    [defaultReady, setDefaultReady] = useState(false);
  const success = useRef<{
    rect: DOMRect | null;
    why: string;
    id: string;
  } | null>(null);
  const coach = useRef<HTMLElement>(null);
  const actionRect = useRef<DOMRect | null>(null);
  const [coachHeight, setCoachHeight] = useState(200);
  useEffect(() => {
    if (!coach.current) return;
    const observer = new ResizeObserver(() =>
      setCoachHeight(coach.current!.getBoundingClientRect().height),
    );
    observer.observe(coach.current);
    return () => observer.disconnect();
  }, []);

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
  useEffect(() => {
    if (!ready || !briefed || index !== recipe.steps.length - 1 || !step)
      return;
    const timer = setTimeout(
      () =>
        findTarget(step.target)?.scrollIntoView({
          block: "center",
          behavior: "smooth",
        }),
      200,
    );
    return () => clearTimeout(timer);
  }, [ready, briefed, index]);
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
      if (success.current) setFeedback(success.current);
      setHint(e.data.steps.length === recipe.steps.length - 1);
      setCollapsed(false);
      setSteps(e.data.steps);
      pending.current = false;
      setWaiting(false);
    };
    window.addEventListener("message", ack);
    return () => window.removeEventListener("message", ack);
  }, []);
  useEffect(() => {
    if (!ready || !briefed || !step) return;
    target.current = undefined;
    actionRect.current = null;
    let dead = false;
    const locate = () => {
      const el = findTarget(step.target);
      if (el) target.current = el;
      const nextRect = el ? el.getBoundingClientRect() : null;
      if (nextRect) actionRect.current = nextRect;
      setRect(nextRect);
      setDefaultReady(
        step.kind === "value" &&
          el instanceof HTMLSelectElement &&
          normalize(el.value) === normalize(step.value || ""),
      );
    };
    locate();
    const timer = setInterval(locate, 180);
    const finish = () => {
      if (pending.current || dead) return;
      success.current = {
        rect: actionRect.current,
        why: scenario.steps[index].why,
        id: step.id,
      };
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
              editors: runtime.editors(),
              inquiries: runtime.inquiries(),
              route: route.current,
              actions:
                initial.lessonId === "editor"
                  ? document.querySelector(".photo-editor")
                    ? [
                        ...actions.current.slice(0, 1),
                        ...[
                          ...document.querySelectorAll(
                            ".photo-editor details[open] > summary",
                          ),
                        ].map((el) => ({ selector: selectorFor(el) })),
                        ...(document.fullscreenElement ||
                        document.querySelector(".training-expanded-stage")
                          ? actions.current
                              .filter((a) => {
                                const el = document.querySelector(a.selector);
                                return el?.textContent === "크게 보기";
                              })
                              .slice(-1)
                          : []),
                      ]
                    : []
                  : actions.current,
            },
          });
      }, 180);
    };
    const match = (e: Event) => {
      const el = target.current || findTarget(step.target);
      return !!el && (el === e.target || el.contains(e.target as Node));
    };
    const click = (e: Event) => {
      if (pending.current) return;
      const el = (e.target as Element).closest<HTMLElement>(
        'button,summary,a,input[type="checkbox"]',
      );
      if (
        el &&
        !el.closest(".training-coach,.training-success") &&
        step.kind !== "command"
      )
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
    const annotated = (e: Event) => {
      const detail = (e as CustomEvent).detail;
      if (
        step.kind === "draw" &&
        (!step.evidence || detail?.action === step.evidence)
      )
        finish();
    };
    const confirmDefault = () => {
      const el = findTarget(step.target);
      if (
        step.kind === "value" &&
        el instanceof HTMLSelectElement &&
        normalize(el.value) === normalize(step.value || "")
      )
        finish();
    };
    window.addEventListener("practice:confirm-default", confirmDefault);
    window.addEventListener("practice:annotation", annotated);

    document.addEventListener("click", click, true);
    document.addEventListener("input", input, true);
    document.addEventListener("change", input, true);
    window.addEventListener("practice:command", command);
    return () => {
      dead = true;
      window.removeEventListener("practice:annotation", annotated);
      window.removeEventListener("practice:confirm-default", confirmDefault);
      clearInterval(timer);

      document.removeEventListener("click", click, true);
      document.removeEventListener("input", input, true);
      document.removeEventListener("change", input, true);
      window.removeEventListener("practice:command", command);
    };
  }, [ready, index, briefed]);
  useEffect(() => {
    if (!feedback) return;
    const nextField = (e: KeyboardEvent) => {
      if (
        e.key === "Tab" &&
        (e.target as Element)?.matches("input,textarea,select")
      ) {
        setFeedback(null);
        success.current = null;
      }
    };
    document.addEventListener("keydown", nextField, true);
    return () => document.removeEventListener("keydown", nextField, true);
  }, [feedback]);
  useEffect(() => {
    if (ready && briefed && !waiting) return;
    const block = (e: KeyboardEvent) => {
      if (
        e.key !== "Tab" &&
        (e.target as Element)?.matches("input,textarea,select")
      )
        e.preventDefault();
    };
    document.addEventListener("keydown", block, true);
    return () => document.removeEventListener("keydown", block, true);
  }, [ready, waiting, briefed]);
  return createPortal(
    <>
      {(!ready || !briefed || waiting) && (
        <div className="training-busy-shield" aria-hidden="true" />
      )}
      {hint && rect && !feedback && (
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
      {feedback && (
        <section
          className="training-success"
          role="status"
          aria-label="정답 · 작업의 의미"
          style={{
            left: Math.max(
              12,
              Math.min(
                feedback.rect?.left || 12,
                innerWidth - Math.min(360, innerWidth - 24) - 12,
              ),
            ),
            top: Math.max(
              12,
              Math.min((feedback.rect?.bottom || 40) + 12, innerHeight - 230),
            ),
          }}
        >
          <span className="training-success-mark" aria-hidden="true">
            ✓
          </span>
          <div>
            <strong>정확하게 처리했어요!</strong>
            <p>{feedback.why}</p>
          </div>
          <button
            className="primary"
            onClick={() => {
              setFeedback(null);
              success.current = null;
            }}
          >
            {step ? "다음 목표 보기" : "완료 안내 보기"}
          </button>
        </section>
      )}
      <aside
        hidden={!!feedback}
        ref={coach}
        className={"training-coach" + (briefed ? " is-working" : "")}
        style={
          rect &&
          rect.bottom > innerHeight - coachHeight - 30 &&
          rect.top > coachHeight + 24
            ? { top: 12, bottom: "auto" }
            : {}
        }
        aria-live="polite"
      >
        <strong>
          {!step
            ? "상황 해결 완료"
            : !briefed
              ? "오늘의 업무 상황"
              : `${index + 1} / ${recipe.steps.length} · 업무 목표`}
        </strong>
        {ready && briefed && step && (
          <button
            className="training-collapse"
            onClick={() => setCollapsed((v) => !v)}
          >
            {collapsed ? "안내 펼치기" : "안내 접기"}
          </button>
        )}
        {collapsed ? (
          <p>{scenario.steps[index]?.goal}</p>
        ) : !ready ? (
          <p>연습 화면을 준비하고 있습니다…</p>
        ) : !briefed ? (
          <>
            <p>{scenario.scene}</p>
            <strong>{scenario.question}</strong>
            <div className="training-decisions">
              {scenario.choices.map((answer, i) => (
                <button
                  key={answer}
                  aria-pressed={choice === i}
                  onClick={() => setChoice(i)}
                >
                  {answer}
                </button>
              ))}
            </div>
            {choice !== null && (
              <p role="status">
                {choice === scenario.correct
                  ? scenario.explanation
                  : "이 선택은 기록 누락이나 오해로 이어질 수 있습니다. 상황의 목적을 다시 생각해보세요."}
              </p>
            )}
            {choice === scenario.correct && (
              <button className="primary" onClick={() => setBriefed(true)}>
                이 판단으로 업무 시작
              </button>
            )}
          </>
        ) : waiting ? (
          <p>조작 결과 확인 완료 · 계정에 진도를 저장하고 있습니다…</p>
        ) : step ? (
          <>
            <p className="training-mission">{scenario.steps[index].goal}</p>
            {step.kind === "value" &&
              [
                "start",
                "find-patient",
                "register",
                "requests",
                "quote-consent",
              ].includes(initial.lessonId) && (
                <p className="training-case-reference">
                  상단의 「상황·접수 정보」를 참고해 입력·선택하세요.
                </p>
              )}
            {defaultReady && (
              <button
                className="primary"
                onClick={() =>
                  window.dispatchEvent(new Event("practice:confirm-default"))
                }
              >
                현재 선택으로 확인
              </button>
            )}
            <small>
              화면에서 직접 해결해보세요. 결과가 확인되면 자동으로 다음 목표로
              넘어갑니다.
            </small>
            <button
              aria-expanded={hint}
              onClick={() => {
                setHint((v) => !v);
                if (!hint)
                  findTarget(step.target)?.scrollIntoView({
                    block: "center",
                    behavior: "smooth",
                  });
              }}
            >
              {hint ? "힌트 숨기기" : "막혔어요 · 힌트 보기"}
            </button>
            {hint && (
              <div className="training-hint">
                <p>{step.instruction}</p>
              </div>
            )}
            {hint && !rect && (
              <small>
                다른 화면으로 이동했다면 저장된 단계부터 다시 열 수 있습니다.{" "}
                <button onClick={() => post({ type: "practice:reopen" })}>
                  현재 단계 다시 열기
                </button>
              </small>
            )}
          </>
        ) : (
          <>
            <p>{scenario.debrief}</p>
            <small>
              실제 업무에서는 무엇을 먼저 확인해야 할지 떠올려보세요. 학습
              기록은 계정에 저장되었습니다. 화면 위쪽의 「학습 완료 · 돌아가기」
              버튼을 눌러 사용법으로 돌아가세요.
            </small>
          </>
        )}
      </aside>
      {fullscreen && (
        <button
          className="training-fullscreen-exit"
          aria-label="연습 크게 보기 닫기"
          onClick={() => {
            if (document.fullscreenElement) void document.exitFullscreen();
            else {
              fullscreen?.classList.remove("training-expanded-stage");
              setFullscreen(null);
            }
          }}
        >
          크게 보기 닫기
        </button>
      )}
    </>,
    fullscreen || document.body,
  );
}
