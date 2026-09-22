import { expect, it } from "vitest";
import { applyCommand } from "../src/core/domain";
import {
  emptyState,
  emptyQuote,
  type User,
  type Command,
  type Annotation,
} from "../src/core/model";
const doctor: User = {
  id: "doctor",
  name: "검증의사",
  username: "doctor",
  role: "doctor",
  permissionLevel: "standard",
  active: true,
  permissions: {},
};
function fixture() {
  const s = emptyState(),
    base = { rev: 1, createdAt: "2026-09-22", updatedAt: "2026-09-22" };
  const other: Annotation = {
    id: "original",
    tool: "pen",
    points: [
      { x: 0.2, y: 0.2 },
      { x: 0.3, y: 0.3 },
    ],
    color: "#000000",
    width: 3,
    authorId: "coordinator",
  };
  s.consultations = [
    {
      ...base,
      id: "consult",
      patientId: "patient",
      patient: {
        name: "검증환자",
        sex: "F",
        dob: "1990-01-01",
        phone: "01000000000",
        address: "",
      },
      ownerId: "coordinator",
      category: "미용",
      status: "H",
      cancelled: false,
      catalogVersion: "",
      quote: emptyQuote(),
      memo: "상담 메모",
      photos: [
        {
          id: "photo",
          name: "검증 사진",
          mediaId: "media",
          selected: true,
          rotation: 90,
          annotations: [other],
        },
      ],
      appointment: "",
      attendance: "미정",
      documents: [],
    },
  ];
  s.opinions = [
    {
      ...base,
      id: "opinion",
      consultationId: "consult",
      fromId: "coordinator",
      toId: doctor.id,
      request: "그림으로 설명해주세요",
      answer: "기존 의견",
    },
  ];
  const mine = { ...other, id: "mine", authorId: doctor.id, color: "#ff0000" };
  const cmd: Command = {
    id: "save-photo",
    type: "opinion.annotate",
    entityId: "opinion",
    baseRev: 1,
    payload: {
      photoId: "photo",
      consultationRev: 1,
      annotations: [other, mine],
    },
  };
  return { s, cmd, other, mine };
}
it("saves the assigned doctor's annotations into the linked consultation while preserving original media, other authors and text opinion", async () => {
  const { s, cmd, other, mine } = fixture(),
    before = structuredClone(s);
  const next = await applyCommand(s, doctor, cmd);
  expect(next.consultations[0].photos[0]).toEqual({
    ...before.consultations[0].photos[0],
    annotations: [other, mine],
  });
  expect(next.consultations[0].quote).toEqual(before.consultations[0].quote);
  expect(next.consultations[0].memo).toBe("상담 메모");
  expect(next.opinions[0]).toMatchObject({ answer: "기존 의견", rev: 2 });
  expect(next.consultations[0].rev).toBe(2);
  expect(next.events.at(-1)).toMatchObject({
    patientId: "patient",
    kind: "opinion.annotate",
  });
  expect(s).toEqual(before);
});
it("requires the assigned clinical doctor or administrator, matching opinion and consultation revisions, and a current hold consultation", async () => {
  for (const mutate of [
    ({ cmd }: ReturnType<typeof fixture>) => {
      cmd.baseRev = 0;
    },
    ({ cmd }: ReturnType<typeof fixture>) => {
      cmd.payload.consultationRev = 0;
    },
    ({ s }: ReturnType<typeof fixture>) => {
      s.consultations[0].status = "P";
    },
    ({ s }: ReturnType<typeof fixture>) => {
      s.consultations[0].cancelled = true;
    },
    ({ cmd }: ReturnType<typeof fixture>) => {
      cmd.payload.photoId = "missing";
    },
  ]) {
    const f = fixture();
    mutate(f);
    const before = structuredClone(f.s);
    await expect(applyCommand(f.s, doctor, f.cmd)).rejects.toThrow();
    expect(f.s).toEqual(before);
  }
  const { s, cmd } = fixture();
  await expect(
    applyCommand(s, { ...doctor, id: "another-doctor" }, cmd),
  ).rejects.toMatchObject({ status: 403 });
  await expect(
    applyCommand(s, { ...doctor, role: "coordinator" }, cmd),
  ).rejects.toMatchObject({ status: 403 });
});
it("prevents other-author edits and ID collisions, and retains others even if omitted from submitted annotations", async () => {
  const { s, cmd, other, mine } = fixture();
  await expect(
    applyCommand(s, doctor, {
      ...cmd,
      payload: {
        ...cmd.payload,
        annotations: [{ ...other, color: "#ffffff" }, mine],
      },
    }),
  ).rejects.toMatchObject({ status: 403 });
  await expect(
    applyCommand(s, doctor, {
      ...cmd,
      payload: { ...cmd.payload, annotations: [{ ...mine, id: other.id }] },
    }),
  ).rejects.toMatchObject({ status: 403 });
  const next = await applyCommand(s, doctor, {
    ...cmd,
    payload: { ...cmd.payload, annotations: [mine] },
  });
  expect(next.consultations[0].photos[0].annotations).toEqual([other, mine]);
});

it("compares normalized annotation fields rather than JSON property insertion order", async () => {
  const { s, cmd, other } = fixture();
  s.consultations[0].photos[0].annotations = [
    {
      authorId: other.authorId,
      width: other.width,
      color: other.color,
      points: other.points,
      tool: other.tool,
      id: other.id,
    },
  ];
  await expect(applyCommand(s, doctor, cmd)).resolves.toBeDefined();
});
