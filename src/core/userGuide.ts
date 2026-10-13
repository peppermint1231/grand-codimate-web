import content from "../data/userGuideLessons.json";
import releases from "../data/userGuideUpdates.json";
export type GuideTrack = "staff" | "admin";
export type GuideTarget =
  "patients" | "discovery" | "catalog" | "stats" | "settings";
export type GuideLesson = {
  id: string;
  track: GuideTrack;
  title: string;
  summary: string;
  where: string;
  target: GuideTarget;
  requires?: string;
  steps: { id: string; title: string; instruction: string; result: string }[];
  quiz: {
    question: string;
    answers: string[];
    correct: number;
    explanation: string;
  };
  changeNote: string;
};
export const guideLessons = content as GuideLesson[];
export const guideUpdates = releases as Record<
  string,
  { revision: string; updatedIn: string }
>;
export type GuideEntry = {
  acknowledged?: string;
  revision?: string;
  steps?: string[];
  completed?: boolean;
  replaySteps?: string[];
};
export type GuideProgress = {
  version?: number;
  lessons: Record<string, GuideEntry>;
  selected?: string;
};
export function guideStatus(lesson: GuideLesson, progress: GuideProgress) {
  const entry = progress.lessons[lesson.id];
  const revision = guideUpdates[lesson.id]?.revision || "";
  return {
    revision,
    unread: entry?.acknowledged !== revision,
    change: entry?.acknowledged ? "수정됨" : "신규",
    completed: entry?.revision === revision && entry?.completed === true,
    steps:
      entry?.revision === revision && Array.isArray(entry.steps)
        ? entry.steps
        : [],
  };
}
export function filterGuide(
  track: GuideTrack,
  query: string,
  changedOnly: boolean,
  progress: GuideProgress,
) {
  const needle = query.toLocaleLowerCase().replace(/\s/g, "");
  return guideLessons.filter(
    (l) =>
      l.track === track &&
      (!changedOnly || guideStatus(l, progress).unread) &&
      (!needle ||
        [
          l.title,
          l.summary,
          l.where,
          ...l.steps.flatMap((s) => [s.title, s.instruction]),
        ]
          .join(" ")
          .toLocaleLowerCase()
          .replace(/\s/g, "")
          .includes(needle)),
  );
}
export function readGuideProgress(
  storage: Pick<Storage, "getItem">,
  key: string,
): GuideProgress {
  try {
    const parsed = JSON.parse(storage.getItem(key) || "null");
    if (
      parsed &&
      parsed.lessons &&
      typeof parsed.lessons === "object" &&
      !Array.isArray(parsed.lessons)
    ) {
      const lessons: Record<string, GuideEntry> = {};
      for (const lesson of guideLessons) {
        const v = parsed.lessons[lesson.id];
        if (v && typeof v === "object")
          lessons[lesson.id] = {
            acknowledged:
              typeof v.acknowledged === "string" ? v.acknowledged : undefined,
            revision: typeof v.revision === "string" ? v.revision : undefined,
            steps: Array.isArray(v.steps)
              ? v.steps.filter((x: unknown) => typeof x === "string")
              : [],
            completed: v.completed === true,
          };
      }
      return {
        lessons,
        selected:
          typeof parsed.selected === "string" ? parsed.selected : undefined,
      };
    }
  } catch {
    /* Unavailable/corrupt storage must not prevent reading the guide. */
  }
  return { lessons: {} };
}
