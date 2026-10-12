import React from "react";
import { createRoot } from "react-dom/client";
import { isolatePractice, installPractice } from "./runtime";
import { TrainingCoach, type PracticeInit } from "./TrainingCoach";
import { practiceRecipe } from "../core/guideTraining";
export function bootstrapPractice() {
  isolatePractice();
  const session = new URLSearchParams(location.search).get("session");
  let started = false;
  document.getElementById("root")!.textContent =
    "가상 자료로 연습 화면을 준비하고 있습니다…";
  const receive = async (e: MessageEvent) => {
    if (
      started ||
      e.source !== parent ||
      parent === window ||
      e.origin !== location.origin ||
      e.data?.session !== session ||
      e.data.type !== "practice:init" ||
      !practiceRecipe(e.data.lessonId)
    )
      return;
    started = true;
    const initial = e.data as PracticeInit;
    const runtime = installPractice(initial.checkpoint || undefined);
    try {
      const [{ App }, { OperationProgressDialog }] = await Promise.all([
        import("../App"),
        import("../components/OperationProgressDialog"),
      ]);
      createRoot(document.getElementById("root")!).render(
        <>
          <App />
          <OperationProgressDialog />
          <TrainingCoach initial={initial} runtime={runtime} />
        </>,
      );
    } catch (err) {
      parent.postMessage(
        { type: "practice:error", session, message: (err as Error).message },
        location.origin,
      );
    }
  };
  window.addEventListener("message", receive);
  parent.postMessage({ type: "practice:ready", session }, location.origin);
}
