import { expect, it } from "vitest";
import { applyCommand } from "../src/core/domain";
import { emptyState, type User, type State } from "../src/core/model";
import { patientIndex } from "../src/core/patientSearch";
const staff: User = {
  id: "staff",
  name: "최수진",
  username: "staff",
  role: "coordinator",
  permissionLevel: "standard",
  active: true,
  permissions: { "patient.edit": false },
};
const fields = {
  name: "김철수",
  sex: "M",
  dob: "1992-12-12",
  phone: "01012345678",
  address: "후평동",
};
const run = (
  s: State,
  type: string,
  payload: Record<string, unknown>,
  entityId: string,
  baseRev?: number,
  user = staff,
) =>
  applyCommand(s, user, {
    id: crypto.randomUUID(),
    type,
    payload,
    entityId,
    baseRev,
  });
it("starts atomically without invented identity and excludes pending people from patient search", async () => {
  const s = await run(
    emptyState(),
    "consultation.quickCreate",
    { category: "미용" },
    "consult",
  );
  expect(s.consultations[0]).toMatchObject({
    patientId: "quick-consult",
    quickStarted: true,
    status: "H",
    ownerId: "staff",
  });
  expect(s.patients[0]).toMatchObject({
    registrationPending: true,
    dob: "",
    phone: "",
    address: "",
  });
  expect(s.patients[0].number).toBeUndefined();
  expect(patientIndex(s)).toEqual([]);
  await expect(
    run(
      s,
      "consultation.create",
      { category: "미용", patientId: "quick-consult" },
      "second",
    ),
  ).rejects.toThrow("기존 바로상담");
  await expect(
    run(s, "consultation.quickCreate", { category: "보험" }, "consult"),
  ).rejects.toThrow("이미");
  expect(emptyState().patients).toEqual([]);
});
it("registers after a completed consultation, preserving id, photos, quote and history", async () => {
  let s = await run(
    emptyState(),
    "consultation.quickCreate",
    { category: "보험" },
    "consult",
  );
  s.consultations[0].status = "F";
  s.consultations[0].memo = "나중에 다시 연락";
  const original = structuredClone(s.consultations[0]);
  s = await run(s, "patient.quickRegister", fields, "quick-consult", 1);
  expect(s.patients[0]).toMatchObject({
    ...fields,
    registrationPending: false,
    storageName: "quick-consult",
  });
  expect(s.consultations[0]).toMatchObject({
    patient: fields,
    status: "F",
    memo: original.memo,
    photos: original.photos,
    quote: original.quote,
  });
  expect(patientIndex(s)).toHaveLength(1);
  await expect(
    run(s, "patient.quickRegister", fields, "quick-consult", 2),
  ).rejects.toThrow("등록 대기");
});
it("links to an existing person with revision checks and remaps ledger, notes, consultation snapshots", async () => {
  let s = await run(emptyState(), "patient.create", fields, "existing");
  s = await run(s, "consultation.quickCreate", { category: "미용" }, "consult");
  const base = {
    id: "record",
    rev: 1,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    patientId: "quick-consult",
  };
  s.notes.push({ ...base, text: "상담 메모", authorId: staff.id } as any);
  await expect(
    run(s, "patient.quickRegister", { ...fields }, "quick-consult", 1),
  ).rejects.toThrow("기존 환자 연결");
  await expect(
    run(
      s,
      "patient.quickRegister",
      { targetId: "existing", targetRev: 50 },
      "quick-consult",
      1,
    ),
  ).rejects.toThrow("다시 선택");
  s = await run(
    s,
    "patient.quickRegister",
    { targetId: "existing", targetRev: 1 },
    "quick-consult",
    1,
  );
  expect(s.consultations[0].patientId).toBe("existing");
  expect(s.consultations[0].patient.name).toBe(fields.name);
  expect(s.notes[0].patientId).toBe("existing");
  expect(s.patients.find((p) => p.id === "quick-consult")?.mergedInto).toBe(
    "existing",
  );
  expect(patientIndex(s)).toHaveLength(1);
});
it("rejects unauthorized registration, incomplete identity and ordinary-update bypass", async () => {
  const s = await run(
    emptyState(),
    "consultation.quickCreate",
    { category: "미용" },
    "consult",
  );
  await expect(
    run(s, "patient.quickRegister", fields, "quick-consult", 1, {
      ...staff,
      id: "other",
    }),
  ).rejects.toThrow("권한");
  await expect(
    run(s, "patient.quickRegister", { ...fields, dob: "" }, "quick-consult", 1),
  ).rejects.toThrow();
  await expect(
    run(s, "patient.update", fields, "quick-consult", 1, {
      ...staff,
      permissions: { "patient.edit": true },
    }),
  ).rejects.toThrow("바로상담");
  await expect(
    run(s, "patient.quickRegister", fields, "quick-consult", 9),
  ).rejects.toThrow("다른 기기");
});
it("accepts a real referrer on deferred registration and rejects self-referral", async () => {
  let s=await run(emptyState(),"patient.create",fields,"referrer");
  s=await run(s,"consultation.quickCreate",{category:"미용"},"consult");
  const other={...fields,name:"이서연",phone:"01000000002"};
  await expect(run(s,"patient.quickRegister",{...other,referredByPatientId:"quick-consult"},"quick-consult",1)).rejects.toThrow("소개한 기존 환자");
  s=await run(s,"patient.quickRegister",{...other,referredByPatientId:"referrer"},"quick-consult",1);
  expect(s.patients.find(p=>p.id==="quick-consult")?.referredByPatientId).toBe("referrer");
});
