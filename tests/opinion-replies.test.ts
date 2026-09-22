import {
  opinionReplyKey,
  unreadOpinionReply,
  hasOpinionAnswer,
  opinionPhotoLabel,
  opinionAnswerText,
} from "../src/core/opinions";
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

const requester: User = { ...doctor, id: "requester", role: "coordinator" };
const owner: User = { ...requester, id: "coordinator" };
function setup() {
  const { s } = fixture();
  s.opinions[0].fromId = requester.id;
  s.opinions[0].answer = "";
  return s;
}
const answer = (rev: number, text = "의사 답변"): Command => ({
  id: crypto.randomUUID(),
  type: "opinion.answer",
  entityId: "opinion",
  baseRev: rev,
  payload: { answer: text },
});
const read = (key: string): Command => ({
  id: crypto.randomUUID(),
  type: "opinion.read",
  entityId: "opinion",
  payload: { replyKey: key },
});
it("notifies the requester and consultation owner independently, preserving the content revision and consultation on read", async () => {
  const initial = setup();
  expect(
    unreadOpinionReply(
      initial.opinions[0],
      requester.id,
      initial.consultations,
    ),
  ).toBe(false);
  const s = await applyCommand(initial, doctor, answer(1));
  const o = s.opinions[0];
  expect(unreadOpinionReply(o, requester.id, s.consultations)).toBe(true);
  expect(unreadOpinionReply(o, owner.id, s.consultations)).toBe(true);
  expect(unreadOpinionReply(o, "other", s.consultations)).toBe(false);
  const next = await applyCommand(s, requester, read(opinionReplyKey(o)));
  expect(
    unreadOpinionReply(next.opinions[0], requester.id, next.consultations),
  ).toBe(false);
  expect(
    unreadOpinionReply(next.opinions[0], owner.id, next.consultations),
  ).toBe(true);
  expect(next.opinions[0].rev).toBe(o.rev);
  expect(next.consultations).toEqual(initial.consultations);
  expect(s.opinions[0].answerReadBy).toBeUndefined();
  const both = await applyCommand(next, owner, read(opinionReplyKey(o)));
  expect(
    unreadOpinionReply(both.opinions[0], owner.id, both.consultations),
  ).toBe(false);
});
it("updated replies become unread again and a late acknowledgement cannot mark a newer answer read", async () => {
  let s = await applyCommand(setup(), doctor, answer(1));
  const oldKey = opinionReplyKey(s.opinions[0]);
  s = await applyCommand(s, requester, read(oldKey));
  s = await applyCommand(s, doctor, answer(2, "수정된 답변"));
  expect(unreadOpinionReply(s.opinions[0], requester.id, s.consultations)).toBe(
    true,
  );
  await expect(applyCommand(s, requester, read(oldKey))).rejects.toMatchObject({
    status: 409,
  });
  await expect(
    applyCommand(
      s,
      { ...requester, id: "other" },
      read(opinionReplyKey(s.opinions[0])),
    ),
  ).rejects.toMatchObject({ status: 403 });
});
it("supports historical replies without new fields and does not notify again on photo edits", async () => {
  const { s, cmd } = fixture();
  s.opinions[0].answerReadBy = { coordinator: opinionReplyKey(s.opinions[0]) };
  const next = await applyCommand(s, doctor, cmd);
  expect(
    unreadOpinionReply(next.opinions[0], owner.id, next.consultations),
  ).toBe(false);
  expect(next.opinions[0].answer).toBe("기존 의견");
});
it("cannot acknowledge an unanswered request", async () => {
  await expect(
    applyCommand(setup(), requester, read("legacy")),
  ).rejects.toMatchObject({ status: 409 });
});

const photoAnswer = (
  rev: number,
  photoId = "photo",
  text = "이 부분을 확인하세요",
): Command => ({
  ...answer(rev, ""),
  payload: {
    answer: "",
    answerPhotoComments: [{ photoId, text, photoName: "위조된 이름" }],
  },
});
it("saves photo-only replies using the consultation photo ID/name and includes them in unread/read handling", async () => {
  const initial = setup();
  const s = await applyCommand(initial, doctor, photoAnswer(1));
  expect(s.opinions[0].answer).toBe("");
  expect(s.opinions[0].answerPhotoComments).toEqual([
    { photoId: "photo", photoName: "검증 사진", text: "이 부분을 확인하세요" },
  ]);
  expect(hasOpinionAnswer(s.opinions[0])).toBe(true);
  expect(unreadOpinionReply(s.opinions[0], owner.id, s.consultations)).toBe(
    true,
  );
  const next = await applyCommand(
    s,
    owner,
    read(opinionReplyKey(s.opinions[0])),
  );
  expect(
    unreadOpinionReply(next.opinions[0], owner.id, next.consultations),
  ).toBe(false);
  expect(s.consultations).toEqual(initial.consultations);
});
it("derives photo numbers from selected-photo order, including exclusions and deletion, without retargeting the saved comment", async () => {
  const s = await applyCommand(setup(), doctor, photoAnswer(1));
  const original = s.consultations[0].photos[0],
    another = { ...original, id: "another", name: "다른 사진" };
  expect(opinionPhotoLabel([original, another], "photo")).toBe("1번 사진");
  expect(opinionPhotoLabel([another, original], "photo")).toBe("2번 사진");
  expect(opinionAnswerText(s.opinions[0], [another, original])).toContain(
    "2번 사진 · 검증 사진\n이 부분을 확인하세요",
  );
  expect(
    opinionPhotoLabel([another, { ...original, selected: false }], "photo"),
  ).toBe("비교 제외 사진");
  expect(opinionAnswerText(s.opinions[0], [another])).toContain(
    "삭제된 사진 · 검증 사진",
  );
  expect(s.opinions[0].answerPhotoComments![0].photoId).toBe("photo");
});
it("rejects foreign/missing photos, duplicate references, blank photo text and an empty reply", async () => {
  const s = setup();
  for (const cmd of [
    photoAnswer(1, "foreign-photo"),
    photoAnswer(1, "photo", " "),
    answer(1, " "),
    {
      ...photoAnswer(1),
      payload: {
        answer: "전체 의견",
        answerPhotoComments: [
          { photoId: "photo", text: "A" },
          { photoId: "photo", text: "B" },
        ],
      },
    },
  ])
    await expect(applyCommand(s, doctor, cmd)).rejects.toThrow();
  await expect(applyCommand(s, owner, photoAnswer(1))).rejects.toMatchObject({
    status: 403,
  });
  await expect(applyCommand(s, doctor, photoAnswer(0))).rejects.toMatchObject({
    status: 409,
  });
});
it("preserves previously linked comments if a photo is removed, and preserves them when an older client omits the field", async () => {
  const s = await applyCommand(setup(), doctor, photoAnswer(1));
  s.consultations[0].photos = [];
  const next = await applyCommand(s, doctor, answer(2, "전체 의견 수정"));
  expect(next.opinions[0].answerPhotoComments).toEqual(
    s.opinions[0].answerPhotoComments,
  );
  expect(opinionAnswerText(next.opinions[0], [])).toContain("삭제된 사진");
  const cleared = await applyCommand(next, doctor, {
    ...answer(3),
    payload: { answer: "전체 의견", answerPhotoComments: [] },
  });
  expect(cleared.opinions[0].answerPhotoComments).toEqual([]);
});
