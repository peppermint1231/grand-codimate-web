import { z } from "zod";
import {
  guideLessons,
  guideUpdates,
  type GuideProgress,
  type GuideEntry,
} from "../src/core/userGuide";
import { practiceRecipe } from "../src/core/guideTraining";
import { ensure } from "../src/core/domain";
export type GuideStorage = {
  get: <T>(key: string) => Promise<T | undefined>;
  put: (key: string, value: unknown) => Promise<void>;
  remove: (key: string) => void;
};
const change = z
  .object({
    action: z.enum(["select", "ack", "step", "restart", "migrate"]),
    lessonId: z.string().max(80).optional(),
    revision: z.string().max(80).optional(),
    stepId: z.string().max(80).optional(),
    checkpoint: z.unknown().optional(),
    legacy: z
      .record(z.object({ acknowledged: z.string().max(80).optional() }))
      .optional(),
  })
  .strict();
export async function guideLearning(
  req: Request,
  userId: string,
  store: GuideStorage,
) {
  const key = "guide-progress:" + userId,
    url = new URL(req.url);
  const current = (await store.get<GuideProgress>(key)) || { lessons: {} };
  if (req.method === "GET") {
    const lesson = url.searchParams.get("checkpoint");
    if (!lesson) return current;
    ensure(
      guideLessons.some((l) => l.id === lesson),
      "사용법을 찾을 수 없습니다",
      404,
    );
    const checkpoint = await store.get<{ revision: string; data: unknown }>(
      "guide-checkpoint:" + userId + ":" + lesson,
    );
    return {
      checkpoint:
        checkpoint?.revision === guideUpdates[lesson]?.revision
          ? checkpoint.data
          : null,
      progress: current,
    };
  }
  ensure(req.method === "POST", "지원하지 않는 요청입니다", 405);
  const raw = await req.text();
  ensure(
    new TextEncoder().encode(raw).length <= 220000,
    "연습 저장 자료가 너무 큽니다",
    413,
  );
  const b = change.parse(JSON.parse(raw));
  if (b.action === "migrate") {
    // Old manual checkboxes are never imported as completed hands-on learning.
    for (const l of guideLessons) {
      const ack = b.legacy?.[l.id]?.acknowledged;
      if (ack && !current.lessons[l.id]?.acknowledged)
        current.lessons[l.id] = { ...current.lessons[l.id], acknowledged: ack };
    }
    current.version = (current.version || 0) + 1;
    await store.put(key, current);
    return current;
  }
  const lesson = guideLessons.find((l) => l.id === b.lessonId);
  ensure(lesson, "사용법을 찾을 수 없습니다", 404);
  const revision = guideUpdates[lesson.id]?.revision;
  ensure(
    b.revision === revision,
    "사용법이 업데이트되었습니다. 새 안내를 불러온 뒤 이어서 진행하세요.",
    409,
  );
  current.selected = lesson.id;
  const prior = current.lessons[lesson.id] || {},
    entry: GuideEntry & { steps: string[] } =
      prior.revision === revision
        ? { ...prior, steps: [...(prior.steps || [])] }
        : {
            acknowledged: prior.acknowledged,
            revision,
            steps: [],
            completed: false,
          };
  if (b.action === "ack") entry.acknowledged = revision;
  if (b.action === "restart") {
    if (entry.completed) {
      // Reopening a completed lesson must never revoke earned completion.
      const total = practiceRecipe(lesson.id)!.steps.length;
      if (!entry.replaySteps || entry.replaySteps.length === total) {
        entry.replaySteps = [];
        store.remove("guide-checkpoint:" + userId + ":" + lesson.id);
      }
    } else {
      entry.steps = [];
      store.remove("guide-checkpoint:" + userId + ":" + lesson.id);
    }
  }
  if (b.action === "step") {
    const recipe = practiceRecipe(lesson.id);
    ensure(recipe, "연습 과정을 찾을 수 없습니다", 404);
    const progressSteps =
      entry.completed && entry.replaySteps
        ? [...entry.replaySteps]
        : entry.steps;
    const step = recipe.steps.findIndex((s) => s.id === b.stepId);
    ensure(step >= 0, "잘못된 학습 단계입니다");
    ensure(
      recipe.steps.slice(0, step).every((s) => progressSteps.includes(s.id)),
      "앞 단계를 먼저 완료해주세요.",
      409,
    );
    if (!progressSteps.includes(b.stepId!)) {
      progressSteps.push(b.stepId!);
      if (entry.completed && entry.replaySteps)
        entry.replaySteps = progressSteps;
      else entry.steps = progressSteps;
      const finished = recipe.steps.every((s) => progressSteps.includes(s.id));
      entry.completed = entry.completed || finished;
      if (finished) {
        entry.acknowledged = revision;
        store.remove("guide-checkpoint:" + userId + ":" + lesson.id);
      } else if (b.checkpoint) {
        const cp = b.checkpoint as any;
        ensure(
          cp.kind === "codimate-practice-v1" &&
            cp.state &&
            Array.isArray(cp.state.patients) &&
            cp.route &&
            typeof cp.route.page === "string" &&
            Array.isArray(cp.actions),
          "연습 저장 형식이 올바르지 않습니다",
        );
        await store.put("guide-checkpoint:" + userId + ":" + lesson.id, {
          revision,
          data: b.checkpoint,
        });
      }
    }
  }
  current.lessons[lesson.id] = entry;
  current.version = (current.version || 0) + 1;
  await store.put(key, current);
  return current;
}
