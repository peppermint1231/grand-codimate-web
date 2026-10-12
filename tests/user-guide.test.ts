import { expect, it } from "vitest";
import {
  guideLessons,
  guideStatus,
  guideUpdates,
  filterGuide,
  readGuideProgress,
} from "../src/core/userGuide";
it("new and revised lessons stay unread until this revision is acknowledged; older completion does not count", () => {
  const lesson = guideLessons[0],
    current = guideUpdates[lesson.id].revision;
  expect(guideStatus(lesson, { lessons: {} })).toMatchObject({
    unread: true,
    change: "신규",
    completed: false,
  });
  const previous = {
    lessons: {
      [lesson.id]: {
        acknowledged: "previous",
        revision: "previous",
        steps: ["s1"],
        completed: true,
      },
    },
  };
  expect(guideStatus(lesson, previous)).toMatchObject({
    unread: true,
    change: "수정됨",
    completed: false,
    steps: [],
  });
  const acknowledged = {
    lessons: {
      [lesson.id]: { ...previous.lessons[lesson.id], acknowledged: current },
    },
  };
  expect(guideStatus(lesson, acknowledged)).toMatchObject({
    unread: false,
    completed: false,
  });
  expect(
    guideStatus(lesson, {
      lessons: {
        [lesson.id]: {
          acknowledged: current,
          revision: current,
          completed: true,
          steps: lesson.steps.map((s) => s.id),
        },
      },
    }),
  ).toMatchObject({ unread: false, completed: true });
});
it("searches instructions without whitespace and filters revised/new guides within the chosen course", () => {
  expect(
    filterGuide("staff", "유출 방지", false, { lessons: {} }).map((x) => x.id),
  ).toContain("quote-consent");
  expect(filterGuide("admin", "유출 방지", false, { lessons: {} })).toEqual([]);
  const lessons = Object.fromEntries(
    guideLessons.map((l) => [
      l.id,
      { acknowledged: guideUpdates[l.id].revision },
    ]),
  );
  expect(filterGuide("staff", "", true, { lessons })).toEqual([]);
  lessons.photos.acknowledged = "old";
  expect(filterGuide("staff", "", true, { lessons }).map((x) => x.id)).toEqual([
    "photos",
  ]);
});
it("recovers from corrupt or blocked storage and ignores unrelated or invalid records", () => {
  expect(readGuideProgress({ getItem: () => "{" }, "x")).toEqual({
    lessons: {},
  });
  expect(
    readGuideProgress(
      {
        getItem: () => {
          throw Error("blocked");
        },
      },
      "x",
    ),
  ).toEqual({ lessons: {} });
  const value = JSON.stringify({
    lessons: {
      start: { steps: ["s1", 4], completed: true, acknowledged: 4 },
      missing: { completed: true },
    },
  });
  expect(readGuideProgress({ getItem: () => value }, "x").lessons).toEqual({
    start: { steps: ["s1"], completed: true },
  });
});
it("each published lesson has usable tutorial steps, quiz and update metadata", () => {
  expect(new Set(guideLessons.map((x) => x.id)).size).toBe(guideLessons.length);
  for (const lesson of guideLessons) {
    expect(lesson.steps.length).toBeGreaterThanOrEqual(3);
    expect(new Set(lesson.steps.map((s) => s.id)).size).toBe(
      lesson.steps.length,
    );
    expect(lesson.quiz.correct).toBeLessThan(lesson.quiz.answers.length);
    expect(guideUpdates[lesson.id].revision).toMatch(/^[a-f0-9]{20}$/);
    expect(lesson.changeNote.length).toBeGreaterThan(5);
  }
});
