import type { User } from "./model";
import {
  guideLessons,
  guideStatus,
  guideUpdates,
  type GuideProgress,
  type GuideTrack,
} from "./userGuide";
import { practiceRecipe } from "./guideTraining";
export type GuideAccountReport = ReturnType<typeof guideAccountReport>;
export function guideAccountReport(
  user: Pick<User, "id" | "name" | "role" | "active">,
  progress: GuideProgress,
) {
  const lessons = guideLessons.map((lesson) => {
    const status = guideStatus(lesson, progress),
      entry = progress.lessons[lesson.id];
    const total = practiceRecipe(lesson.id)?.steps.length || 0;
    return {
      id: lesson.id,
      title: lesson.title,
      track: lesson.track,
      completed: status.completed,
      acknowledged: !status.unread,
      steps: Math.min(status.steps.length, total),
      total,
      revised:
        !!entry?.revision &&
        (entry.learningVersion !== undefined
          ? entry.learningVersion !== guideUpdates[lesson.id].learningVersion
          : entry.revision !== status.revision &&
            !guideUpdates[lesson.id].compatibleRevisions.includes(
              entry.revision,
            )),
    };
  });
  const summary = (track: GuideTrack) => {
    const items = lessons.filter((l) => l.track === track);
    return {
      total: items.length,
      completed: items.filter((l) => l.completed).length,
    };
  };
  return {
    id: user.id,
    name: user.name,
    role: user.role,
    active: user.active,
    staff: summary("staff"),
    admin: summary("admin"),
    unread: lessons.filter((l) => !l.acknowledged).length,
    lessons,
  };
}
