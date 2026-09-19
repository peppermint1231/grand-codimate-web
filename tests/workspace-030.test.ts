import { it, expect, vi } from "vitest";
import { DatabaseSync } from "node:sqlite";
import { Clinic } from "../server/worker";
import { applyCommand, duplicates } from "../src/core/domain";
import {
  emptyState,
  type User,
  type State,
  type Annotation,
} from "../src/core/model";
import {
  annotationBox,
  resizeAnnotation,
  pinchView,
} from "../src/core/annotationText";
import { annotationHit } from "../src/core/photoGeometry";
const admin: User = {
  id: "admin",
  username: "admin",
  name: "시험",
  role: "admin",
  active: true,
  permissions: {},
};
const staff: User = { ...admin, id: "staff", role: "coordinator" };
const cmd = (
  type: string,
  payload: Record<string, unknown>,
  entityId: string,
  baseRev?: number,
) => ({ id: crypto.randomUUID(), type, payload, entityId, baseRev });
async function fixture() {
  let s = emptyState();
  for (const id of ["first", "second"])
    s = await applyCommand(
      s,
      admin,
      cmd(
        "patient.create",
        {
          name: "중복시험",
          sex: "F",
          dob: "1980-01-01",
          phone: "01000000000",
          address: "시험동",
        },
        id,
      ),
    );
  s = await applyCommand(
    s,
    admin,
    cmd(
      "consultation.create",
      { patientId: "first", category: "미용" },
      "consult",
    ),
  );
  return s;
}
it("archives and restores a patient without deleting consultation/photo records", async () => {
  const s = await fixture();
  s.consultations[0].photos = [
    {
      id: "photo",
      mediaId: "media",
      name: "test",
      selected: true,
      rotation: 0,
      annotations: [],
    },
  ];
  await expect(
    applyCommand(
      s,
      staff,
      cmd("patient.archive", { archived: true }, "first", 1),
    ),
  ).rejects.toThrow("관리자");
  const archived = await applyCommand(
    s,
    admin,
    cmd("patient.archive", { archived: true }, "first", 1),
  );
  expect(archived.consultations).toEqual(s.consultations);
  expect(archived.patients[0].archived).toBe(true);
  expect(duplicates(archived, s.patients[1]).map((x) => x.id)).not.toContain(
    "first",
  );
  const restored = await applyCommand(
    archived,
    admin,
    cmd("patient.archive", { archived: false }, "first", 2),
  );
  expect(restored.patients[0].archived).toBe(false);
});
it("merges links and advances affected revisions, preserving photos and payment IDs", async () => {
  const s = await fixture();
  s.consultations[0].photos = [
    {
      id: "photo",
      mediaId: "media",
      name: "test",
      selected: true,
      rotation: 0,
      annotations: [],
    },
  ];
  s.notes = [
    {
      id: "note",
      rev: 1,
      createdAt: "2026-01-01",
      updatedAt: "2026-01-01",
      patientId: "first",
      authorId: "admin",
      text: "memo",
      important: false,
    },
  ];
  s.ledger = [
    {
      id: "receipt",
      rev: 1,
      createdAt: "2026-01-01",
      updatedAt: "2026-01-01",
      patientId: "first",
      consultationId: "consult",
      kind: "receipt",
      amount: 10000,
    } as any,
  ];
  const m = await applyCommand(
    s,
    admin,
    cmd(
      "patient.merge",
      { targetId: "second", targetRev: 1, reason: "중복등록" },
      "first",
      1,
    ),
  );
  expect(m.patients[0].mergedInto).toBe("second");
  expect(m.patients[1].rev).toBe(2);
  for (const x of [m.consultations[0], m.notes[0], m.ledger[0]])
    expect(x).toMatchObject({ patientId: "second", rev: 2 });
  expect(m.consultations[0].photos).toEqual(s.consultations[0].photos);
  expect(m.ledger[0]).toMatchObject({ id: "receipt", amount: 10000 });
  await expect(
    applyCommand(m, admin, cmd("consultation.save", {}, "consult", 1)),
  ).rejects.toThrow("다른 기기");
  await expect(
    applyCommand(
      s,
      admin,
      cmd(
        "patient.merge",
        { targetId: "second", targetRev: 5, reason: "중복" },
        "first",
        1,
      ),
    ),
  ).rejects.toThrow("다른 기기");
  await expect(
    applyCommand(
      s,
      staff,
      cmd(
        "patient.merge",
        { targetId: "second", targetRev: 1, reason: "중복" },
        "first",
        1,
      ),
    ),
  ).rejects.toThrow("관리자");
});
it("does not match empty duplicate inputs and normalizes phone/name spacing", async () => {
  const s = await fixture();
  expect(duplicates(s, { name: "", dob: "", phone: "" })).toHaveLength(0);
  expect(
    duplicates(s, { name: "other", dob: "1990-01-01", phone: "010-0000-0000" }),
  ).toHaveLength(2);
  expect(
    duplicates(s, { name: "중복 시험", dob: "1980-01-01", phone: "" }),
  ).toHaveLength(2);
});
it("persists movable text boxes and emoji stamps with strict validation", async () => {
  const s = await fixture();
  const a: Annotation = {
    id: "text",
    tool: "text",
    authorId: "admin",
    points: [{ x: 0.1, y: 0.2 }],
    box: { width: 0.3, height: 0.1 },
    font: "jua",
    fontSize: 40,
    text: "한글",
    color: "#000000",
    width: 3,
  };
  const payload = {
    lines: [],
    discount: { kind: "amount", value: 0 },
    vat: "separate",
    memo: "",
    photos: [
      {
        id: "photo",
        mediaId: "media",
        name: "test",
        selected: true,
        rotation: 0,
        annotations: [a, { ...a, id: "stamp", tool: "stamp", text: "📍" }],
      },
    ],
  };
  const next = await applyCommand(
    s,
    admin,
    cmd("consultation.save", payload, "consult", 1),
  );
  expect(next.consultations[0].photos[0].annotations[0]).toEqual(a);
  await expect(
    applyCommand(
      s,
      admin,
      cmd(
        "consultation.save",
        {
          ...payload,
          photos: [
            {
              ...payload.photos[0],
              annotations: [{ ...a, box: { width: -1, height: 1 } }],
            },
          ],
        },
        "consult",
        1,
      ),
    ),
  ).rejects.toThrow();
});
it("scales text size with its box and hit-tests the resized stamp", () => {
  const a: Annotation = {
    id: "a",
    tool: "stamp",
    authorId: "admin",
    points: [{ x: 0.1, y: 0.1 }],
    box: { width: 0.2, height: 0.2 },
    fontSize: 40,
    text: "⭐",
    color: "#000000",
    width: 3,
  };
  const b = resizeAnnotation(a, 2, 1000, 1000);
  expect(b.fontSize).toBe(80);
  expect(b.box).toEqual({ width: 0.4, height: 0.4 });
  expect(annotationHit(b, { x: 0.45, y: 0.45 }, 1000, 1000, 0)).toBe(true);
  const edge = resizeAnnotation(a, 100, 1000, 1000);
  const box = annotationBox(edge, 1000, 1000);
  expect(box.x + box.width).toBeLessThanOrEqual(1);
});
it("keeps the pinch focal point stable while allowing two-finger translation", () => {
  const start = { zoom: 25, x: 0, y: 0, cx: 400, cy: 300, distance: 100 };
  expect(pinchView(start, { cx: 420, cy: 310, distance: 200 })).toEqual({
    zoom: 50,
    x: 220,
    y: 160,
  });
  expect(pinchView(start, { cx: 400, cy: 300, distance: 10000 }).zoom).toBe(
    100,
  );
});
it("keeps server sessions for 30 days and revokes explicitly logged-out sessions", async () => {
  const db = new DatabaseSync(":memory:");
  const now = Date.now();
  try {
    const sql = {
      exec(q: string, ...args: any[]) {
        if (q.includes(";")) {
          db.exec(q);
          return { toArray: () => [] };
        }
        const rows = db.prepare(q).all(...args);
        return { toArray: () => rows };
      },
    };
    const clinic = new Clinic(
      { storage: { sql } } as any,
      {
        ENCRYPTION_KEY: Buffer.from(
          crypto.getRandomValues(new Uint8Array(32)),
        ).toString("base64"),
        SETUP_KEY: "session-test",
        APP_ORIGIN: "https://example.com",
      } as any,
    );
    let token = "";
    const req = (path: string, body?: unknown) =>
      clinic.fetch(
        new Request("https://example.com/api" + path, {
          method: body === undefined ? "GET" : "POST",
          headers: {
            Authorization: "Bearer " + token,
            "Content-Type": "application/json",
          },
          body: body === undefined ? undefined : JSON.stringify(body),
        }),
      );
    expect(
      (
        await req("/setup", {
          key: "session-test",
          username: "sessiontest",
          name: "시험",
          password: "test-password-1234",
        })
      ).status,
    ).toBe(200);
    const ids = await req("/login-ids");
    expect(await ids.json()).toEqual({ usernames: ["sessiontest"] });
    expect((await req("/state")).status).toBe(401);
    const login = await req("/login", {
      username: "sessiontest",
      password: "test-password-1234",
    });
    expect(login.headers.get("set-cookie")).toContain("Max-Age=2592000");
    token = ((await login.json()) as any).token;
    vi.spyOn(Date, "now").mockReturnValue(now + 20 * 24 * 3600000);
    expect((await req("/state")).status).toBe(200);
    expect((await req("/logout", {})).status).toBe(200);
    expect((await req("/state")).status).toBe(401);
  } finally {
    vi.restoreAllMocks();
    db.close();
  }
});
