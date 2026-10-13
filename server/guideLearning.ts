import { z } from "zod";
import {
  guideLessons,
  guideUpdates,
  compatibleGuideEntry,
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
    action: z.enum([
      "select",
      "ack",
      "step",
      "skip",
      "review",
      "restart",
      "migrate",
    ]),
    lessonId: z.string().max(80).optional(),
    revision: z.string().max(80).optional(),
    stepId: z.string().max(80).optional(),
    checkpoint: z.unknown().optional(),
    legacy: z
      .record(z.object({ acknowledged: z.string().max(80).optional() }))
      .optional(),
  })
  .strict();
type SavedCheckpoint = {
  revision: string;
  learningVersion?: number;
  stepId?: string;
  data: unknown;
};
export async function guideLearning(
  req: Request,
  userId: string,
  store: GuideStorage,
) {
  const key = "guide-progress:" + userId,
    url = new URL(req.url);
  const current = (await store.get<GuideProgress>(key)) || { lessons: {} };
  for (const id of Object.keys(current.lessons))
    if (guideUpdates[id] && current.lessons[id].revision)
      current.lessons[id] = compatibleGuideEntry(id, current.lessons[id]);
  const validCheckpoint = (cp: SavedCheckpoint | undefined, id: string) =>
    cp &&
    (cp.learningVersion !== undefined
      ? cp.learningVersion === guideUpdates[id].learningVersion
      : cp.revision === guideUpdates[id].revision ||
        guideUpdates[id].compatibleRevisions.includes(cp.revision));
  if (req.method === "GET") {
    const lesson = url.searchParams.get("checkpoint");
    if (!lesson) return current;
    ensure(
      guideLessons.some((l) => l.id === lesson),
      "사용법을 찾을 수 없습니다",
      404,
    );
    const cp = await store.get<SavedCheckpoint>(
      "guide-checkpoint:" + userId + ":" + lesson,
    );
    return {
      checkpoint: validCheckpoint(cp, lesson) ? cp!.data : null,
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
    // Manual checks are never imported as successful hands-on learning.
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
  const update = guideUpdates[lesson.id],
    revision = update.revision;
  ensure(
    b.revision === revision,
    "사용법이 업데이트되었습니다. 새 안내를 불러온 뒤 이어서 진행하세요.",
    409,
  );
  const recipe = practiceRecipe(lesson.id)!;
  const ids = recipe.steps.map((s) => s.id);
  const entry: GuideEntry = compatibleGuideEntry(
    lesson.id,
    current.lessons[lesson.id],
  );
  const cpKey = "guide-checkpoint:" + userId + ":" + lesson.id;
  const reviewKey = "guide-review:" + userId + ":" + lesson.id;
  current.selected = lesson.id;
  if (b.action === "ack") entry.acknowledged = revision;
  if (b.action === "restart") {
    if (entry.completed) {
      if (!entry.replaySteps || entry.replaySteps.length === ids.length) {
        entry.replaySteps = [];
        entry.replaySkipped = [];
        entry.replayCursor = 0;
        store.remove(cpKey);
        store.remove(reviewKey);
      }
    } else {
      // Starting over prepares the screen; earned successes are retained.
      entry.cursor = 0;
      store.remove(cpKey);
      store.remove(reviewKey);
    }
  }
  const replay = entry.completed && entry.replaySteps !== undefined;
  const steps = [...(replay ? entry.replaySteps! : entry.steps || [])];
  const skipped = [
    ...(replay ? entry.replaySkipped || [] : entry.skipped || []),
  ];
  let cursor =
    (replay ? entry.replayCursor : entry.cursor) ??
    ids.findIndex((id) => !steps.includes(id) && !skipped.includes(id));
  if (cursor < 0) cursor = ids.length;
  const persistTraversal = () => {
    if (replay) {
      entry.replaySteps = steps;
      entry.replaySkipped = skipped;
      entry.replayCursor = cursor;
    } else {
      entry.steps = steps;
      entry.skipped = skipped;
      entry.cursor = cursor;
    }
  };
  if (b.action === "review") {
    const firstMissing = ids.findIndex((id) => !steps.includes(id));
    ensure(firstMissing >= 0, "모든 단계를 이미 완료했습니다.");
    const saved = await store.get<SavedCheckpoint>(reviewKey);
    if (
      validCheckpoint(saved, lesson.id) &&
      saved?.stepId &&
      ids.includes(saved.stepId)
    ) {
      cursor = ids.indexOf(saved.stepId);
      await store.put(cpKey, saved);
    } else {
      cursor = 0;
      store.remove(cpKey);
    }
    persistTraversal();
  }
  if (b.action === "step" || b.action === "skip") {
    const index = ids.indexOf(b.stepId!);
    ensure(index >= 0, "잘못된 학습 단계입니다");
    ensure(
      ids
        .slice(0, index)
        .every((id) => steps.includes(id) || skipped.includes(id)),
      "앞 단계를 먼저 완료하거나 넘어가주세요.",
      409,
    );
    // Old-device retries cannot rewind a newer screen or revoke an earned success.
    const duplicate =
      index !== cursor &&
      (steps.includes(b.stepId!) ||
        (b.action === "skip" && skipped.includes(b.stepId!)));
    if (!duplicate) {
      const saved: SavedCheckpoint = {
        revision,
        learningVersion: update.learningVersion,
        stepId: b.stepId,
        data: b.checkpoint,
      };
      if (b.checkpoint) {
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
      }
      if (b.action === "step") {
        if (!steps.includes(b.stepId!)) steps.push(b.stepId!);
        const at = skipped.indexOf(b.stepId!);
        if (at >= 0) skipped.splice(at, 1);
      } else if (!steps.includes(b.stepId!) && !skipped.includes(b.stepId!)) {
        skipped.push(b.stepId!);
        const priorReview = await store.get<SavedCheckpoint>(reviewKey);
        if (
          b.checkpoint &&
          (!validCheckpoint(priorReview, lesson.id) ||
            index < ids.indexOf(priorReview?.stepId || ""))
        )
          await store.put(reviewKey, saved);
      }
      cursor = index + 1;
      persistTraversal();
      const finished = ids.every((id) => steps.includes(id));
      if (!replay) entry.completed = finished;
      if (finished) {
        entry.acknowledged = revision;
        store.remove(cpKey);
        store.remove(reviewKey);
      } else if (b.checkpoint) await store.put(cpKey, saved);
    }
  }
  current.lessons[lesson.id] = entry;
  current.version = (current.version || 0) + 1;
  await store.put(key, current);
  return current;
}
