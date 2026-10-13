import scenarios from "../src/data/guidePracticeScenarios.json";
import { guideAccountReport } from "../src/core/guideLearningReport";
import { describe, it, expect } from "vitest";
import { guideLearning, type GuideStorage } from "../server/guideLearning";
import { guideLessons, guideUpdates, guideStatus } from "../src/core/userGuide";
import { practiceRecipes, practiceRecipe } from "../src/core/guideTraining";
import {
  practiceState,
  practiceUser,
  installPractice,
} from "../src/training/runtime";
import { validateCatalog } from "../src/core/domain";
import { trainingRuntime } from "../src/training/environment";
function fixture() {
  const rows = new Map<string, unknown>();
  const store: GuideStorage = {
    get: async <T>(key: string) => structuredClone(rows.get(key)) as T,
    put: async (k, v) => {
      rows.set(k, structuredClone(v));
    },
    remove: (k) => {
      rows.delete(k);
    },
  };
  return {
    rows,
    call: (user: string, b?: unknown, path = "") =>
      guideLearning(
        new Request(
          "https://example.test/api/guide-progress" + path,
          b ? { method: "POST", body: JSON.stringify(b) } : {},
        ),
        user,
        store,
      ) as Promise<any>,
  };
}
const command = (lessonId: string, action: string, extra = {}) => ({
  lessonId,
  revision: guideUpdates[lessonId].revision,
  action,
  ...extra,
});
describe("account based hands-on guide", () => {
  it("uses valid virtual catalogs with unique product and option identities", () => {
    for (const c of practiceState().catalogs)
      expect(() => validateCatalog(c, true)).not.toThrow();
  });
  it("covers every staff and administrator lesson with ordered practice actions", () => {
    expect(new Set(practiceRecipes.map((r) => r.id)).size).toBe(
      guideLessons.length,
    );
    for (const lesson of guideLessons) {
      const r = practiceRecipe(lesson.id)!;
      expect(r.steps.length).toBeGreaterThan(0);
      expect(new Set(r.steps.map((s) => s.id)).size).toBe(r.steps.length);
      for (const s of r.steps) {
        expect(s.instruction.length).toBeGreaterThan(5);
        expect(
          s.target.label || s.target.text || s.target.selector,
        ).toBeTruthy();
      }
    }
  });
  it("resumes same-account steps and checkpoint, isolating another account", async () => {
    const f = fixture(),
      checkpoint = {
        kind: "codimate-practice-v1",
        state: practiceState(),
        route: { page: "patients" },
        actions: [],
      };
    await f.call(
      "alice",
      command("register", "step", { stepId: "practice-1", checkpoint }),
    );
    const tablet = await f.call("alice", undefined, "?checkpoint=register");
    expect(tablet.checkpoint).toEqual(checkpoint);
    expect(tablet.progress.lessons.register.steps).toEqual(["practice-1"]);
    expect((await f.call("bob")).lessons).toEqual({});
    await f.call("alice", command("register", "ack"));
    expect((await f.call("alice")).lessons.register.completed).not.toBe(true);
    const next = await f.call(
      "alice",
      command("register", "step", { stepId: "practice-2", checkpoint }),
    );
    expect(next.lessons.register.steps).toEqual(["practice-1", "practice-2"]);
    expect(next.version).toBeGreaterThan(tablet.progress.version);
  });
  it("rejects skipped, unknown, outdated and impersonated steps", async () => {
    const f = fixture();
    await expect(
      f.call("a", command("start", "step", { stepId: "practice-3" })),
    ).rejects.toThrow("앞 단계");
    await expect(
      f.call("a", command("start", "step", { stepId: "nonexistent" })),
    ).rejects.toThrow("잘못된");
    await expect(
      f.call("a", { ...command("start", "ack"), revision: "old" }),
    ).rejects.toThrow("업데이트");
    await expect(
      f.call("a", { ...command("start", "ack"), userId: "b" }),
    ).rejects.toThrow();
  });
  it("keeps later checkpoint on retry, completes only all actions, clears checkpoint when completed", async () => {
    const f = fixture(),
      r = practiceRecipe("start")!;
    for (let i = 0; i < r.steps.length; i++) {
      const checkpoint = {
        kind: "codimate-practice-v1",
        state: practiceState(),
        route: { page: "patients" },
        actions: [],
        marker: i,
      };
      const p = await f.call(
        "a",
        command(r.id, "step", { stepId: r.steps[i].id, checkpoint }),
      );
      expect(
        guideStatus(
          guideLessons.find((l) => l.id === r.id)!,
          p,
        ).completed,
      ).toBe(i === r.steps.length - 1);
      if (i === 1) {
        await f.call(
          "a",
          command(r.id, "step", {
            stepId: r.steps[0].id,
            checkpoint: { ...checkpoint, marker: -1 },
          }),
        );
        expect(
          (await f.call("a", undefined, "?checkpoint=start")).checkpoint.marker,
        ).toBe(1);
      }
    }
    expect(
      (await f.call("a", undefined, "?checkpoint=start")).checkpoint,
    ).toBeNull();
    const restart = await f.call("a", command(r.id, "restart"));
    expect(restart.lessons.start.steps).toEqual(r.steps.map((s) => s.id));
    expect(restart.lessons.start.completed).toBe(true);
    expect(restart.lessons.start.replaySteps).toEqual([]);
    const cp = {
      kind: "codimate-practice-v1",
      state: practiceState(),
      route: { page: "patients" },
      actions: [],
    };
    await f.call(
      "a",
      command(r.id, "step", { stepId: r.steps[0].id, checkpoint: cp }),
    );
    const tablet = await f.call("a", undefined, "?checkpoint=start");
    expect(tablet.progress.lessons.start.completed).toBe(true);
    expect(tablet.progress.lessons.start.replaySteps).toEqual([r.steps[0].id]);
    expect(tablet.checkpoint).toEqual(cp);
    const reopened = await f.call("a", command(r.id, "restart"));
    expect(reopened.lessons.start.replaySteps).toEqual([r.steps[0].id]);
    expect(
      guideAccountReport(practiceUser, reopened).lessons.find(
        (l) => l.id === r.id,
      )?.completed,
    ).toBe(true);
    for (const step of r.steps.slice(1))
      await f.call("a", command(r.id, "step", { stepId: step.id }));
    expect(
      (await f.call("a", undefined, "?checkpoint=start")).checkpoint,
    ).toBeNull();
    expect((await f.call("a")).lessons.start.completed).toBe(true);
  });
  it("restores unfinished photo work and history once without replaying editing commands", () => {
    const editor = {
      photo: practiceState().consultations[0].photos[0],
      tool: "text",
      textDraft: "경과 비교",
      undo: [],
      redo: [],
    };
    const runtime = installPractice({
      kind: "codimate-practice-v1",
      state: practiceState(),
      route: { page: "consult" },
      actions: [],
      editors: { photo: editor },
    });
    expect(trainingRuntime().editor?.("photo")).toEqual(editor);
    expect(trainingRuntime().editor?.("photo")).toBeUndefined();
    expect(runtime.editors()).toEqual({ photo: editor });
    const evidence = practiceRecipe("editor")!
      .steps.map((s) => s.evidence)
      .filter(Boolean);
    expect(evidence).toEqual(
      expect.arrayContaining([
        "pen",
        "arrow",
        "rect",
        "ellipse",
        "mosaic",
        "erase",
        "move",
        "resize",
        "stamp",
        "pan",
        "crop",
        "frame",
      ]),
    );
  });
  it("migrates legacy acknowledgements without treating manual checks as practice completion", async () => {
    const f = fixture();
    const p = await f.call("a", {
      action: "migrate",
      legacy: { start: { acknowledged: "older-guide" } },
    });
    expect(p.lessons.start).toEqual({ acknowledged: "older-guide" });
    expect(guideStatus(guideLessons[0], p)).toMatchObject({
      change: "수정됨",
      unread: true,
      completed: false,
    });
  });
  it("never falls through an unknown training API to production", async () => {
    installPractice();
    expect((await trainingRuntime().api("/state")).user.id).toBe(
      practiceUser.id,
    );
    await expect(trainingRuntime().api("/onedrive/connect")).rejects.toThrow(
      "외부 작업",
    );
    await expect(
      trainingRuntime().api("/backup", { method: "POST" }),
    ).rejects.toThrow("외부 작업");
  });
});

it("keeps every scenario aligned with actual steps and requires a reasoned decision", () => {
  for (const r of practiceRecipes) {
    const scenario = scenarios[r.id as keyof typeof scenarios];
    expect(scenario.steps.length, r.id).toBe(r.steps.length);
    expect(scenario.choices[scenario.correct]).toBeTruthy();
    for (const step of scenario.steps) {
      expect(step.goal.length).toBeGreaterThan(8);
      expect(step.why.length).toBeGreaterThan(8);
    }
  }
});
it("reports current revision completion separately from acknowledgment and old completions", () => {
  const report = guideAccountReport(practiceUser, {
    lessons: {
      start: {
        revision: "old",
        completed: true,
        steps: ["practice-1"],
        acknowledged: "old",
      },
      register: {
        revision: guideUpdates.register.revision,
        steps: ["practice-1"],
        acknowledged: guideUpdates.register.revision,
      },
      pricing: {
        revision: guideUpdates.pricing.revision,
        completed: true,
        steps: guideUpdates.pricing.stepIds,
      },
    },
  });
  expect(report.staff.completed).toBe(1);
  expect(report.lessons.find((l) => l.id === "start")).toMatchObject({
    completed: false,
    revised: true,
    steps: 0,
    acknowledged: false,
  });
  expect(report.lessons.find((l) => l.id === "register")).toMatchObject({
    completed: false,
    steps: 1,
    acknowledged: true,
  });
  expect(report).not.toHaveProperty("passwordHash");
});

it("keeps known minor-version completion and partial work separately from unread updates", async () => {
  const f = fixture(),
    id = "pricing",
    old = guideUpdates[id].compatibleRevisions[0];
  f.rows.set("guide-progress:a", {
    lessons: {
      [id]: {
        revision: old,
        acknowledged: old,
        completed: true,
        steps: [...guideUpdates[id].stepIds],
      },
    },
  });
  const before = await f.call("a");
  expect(
    guideStatus(
      guideLessons.find((l) => l.id === id)!,
      before,
    ),
  ).toMatchObject({ completed: true, unread: true });
  await f.call("a", command(id, "ack"));
  expect((await f.call("a")).lessons[id]).toMatchObject({
    completed: true,
    acknowledged: guideUpdates[id].revision,
  });
  f.rows.set("guide-progress:b", {
    lessons: { [id]: { revision: old, steps: ["practice-1"] } },
  });
  expect((await f.call("b")).lessons[id].steps).toEqual(["practice-1"]);
});
it("only resets for a major learning version; a new stable step preserves earned steps", async () => {
  const f = fixture(),
    id = "pricing",
    original = structuredClone(guideUpdates[id]);
  f.rows.set("guide-progress:a", {
    lessons: {
      [id]: {
        revision: original.revision,
        learningVersion: original.learningVersion,
        completed: true,
        steps: [...original.stepIds],
      },
    },
  });
  try {
    guideUpdates[id].stepIds = ["new-required", ...original.stepIds];
    const added = (await f.call("a")).lessons[id];
    expect(added.completed).toBe(false);
    expect(added.steps).toEqual(original.stepIds);
    guideUpdates[id].learningVersion++;
    const major = (await f.call("a")).lessons[id];
    expect(major.completed).toBe(false);
    expect(major.steps).toEqual([]);
  } finally {
    Object.assign(guideUpdates[id], original);
  }
});
it("skipping persists an incomplete step across devices and never completes a course", async () => {
  const f = fixture(),
    id = "pricing",
    ids = guideUpdates[id].stepIds;
  const cp = {
    kind: "codimate-practice-v1",
    state: practiceState(),
    route: { page: "consult" },
    actions: [],
    marker: "first-skipped",
  };
  for (const stepId of ids)
    await f.call("a", command(id, "skip", { stepId, checkpoint: cp }));
  const otherDevice = await f.call("a", undefined, "?checkpoint=" + id);
  expect(otherDevice.progress.lessons[id]).toMatchObject({
    completed: false,
    steps: [],
    skipped: ids,
    cursor: ids.length,
  });
  expect((await f.call("b")).lessons).toEqual({});
  await f.call("a", command(id, "review"));
  const review = await f.call("a", undefined, "?checkpoint=" + id);
  expect(review.progress.lessons[id].cursor).toBe(0);
  expect(review.checkpoint.marker).toBe("first-skipped");
  for (const stepId of ids)
    await f.call("a", command(id, "step", { stepId, checkpoint: cp }));
  const done = (await f.call("a")).lessons[id];
  expect(done.completed).toBe(true);
  expect(done.skipped).toEqual([]);
  expect(done.steps).toEqual(ids);
});
it("finishes only after the missing action succeeds, without losing later successes", async () => {
  const f = fixture(),
    id = "pricing",
    ids = guideUpdates[id].stepIds;
  const cp = {
    kind: "codimate-practice-v1",
    state: practiceState(),
    route: { page: "consult" },
    actions: [],
  };
  await f.call("a", command(id, "step", { stepId: ids[0], checkpoint: cp }));
  await f.call("a", command(id, "skip", { stepId: ids[1], checkpoint: cp }));
  for (const stepId of ids.slice(2))
    await f.call("a", command(id, "step", { stepId, checkpoint: cp }));
  expect((await f.call("a")).lessons[id].completed).toBe(false);
  await f.call("a", command(id, "review"));
  const done = await f.call(
    "a",
    command(id, "step", { stepId: ids[1], checkpoint: cp }),
  );
  expect(done.lessons[id].completed).toBe(true);
  expect(done.lessons[id].steps).toHaveLength(ids.length);
  // A delayed skip from another device cannot revoke success.
  await f.call("a", command(id, "skip", { stepId: ids[1], checkpoint: cp }));
  expect((await f.call("a")).lessons[id].completed).toBe(true);
});
it("skipping in a replay does not revoke an earned completion", async () => {
  const f = fixture(),
    id = "pricing",
    ids = guideUpdates[id].stepIds;
  for (const stepId of ids) await f.call("a", command(id, "step", { stepId }));
  await f.call("a", command(id, "restart"));
  await f.call("a", command(id, "skip", { stepId: ids[0] }));
  const p = await f.call("a");
  expect(p.lessons[id]).toMatchObject({
    completed: true,
    steps: ids,
    replaySteps: [],
    replaySkipped: [ids[0]],
  });
});

it("rebuilds a missing scene without skipping preparation or losing credited steps", async () => {
  const f = fixture(),
    id = "pricing",
    ids = guideUpdates[id].stepIds;
  for (const stepId of ids.slice(0, 3))
    await f.call("a", command(id, "step", { stepId }));
  const reset = await f.call("a", command(id, "restart"));
  expect(reset.lessons[id]).toMatchObject({
    cursor: 0,
    steps: ids.slice(0, 3),
    completed: false,
  });
  const prepared = await f.call("a", command(id, "step", { stepId: ids[0] }));
  expect(prepared.lessons[id]).toMatchObject({
    cursor: 1,
    steps: ids.slice(0, 3),
    completed: false,
  });
});
