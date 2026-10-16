import { expect, it } from "vitest";
import { applyCommand } from "../src/core/domain";
import { emptyState, type State, type User } from "../src/core/model";
const staff: User = {
  id: "staff",
  name: "김수진",
  username: "staff",
  role: "coordinator",
  permissionLevel: "standard",
  active: true,
  permissions: {},
};
const admin: User = { ...staff, id: "admin", permissionLevel: "admin" };
const run = (state: State, items: unknown, user = admin) =>
  applyCommand(state, user, {
    id: crypto.randomUUID(),
    type: "consultation.historyDelete",
    payload: { items },
  });
async function fixture() {
  let s = emptyState();
  for (const id of ["first", "second"])
    s = await applyCommand(s, staff, {
      id: crypto.randomUUID(),
      entityId: id,
      type: "consultation.quickCreate",
      payload: { category: "미용" },
    });
  return s;
}
it("only administrators can delete history, even the consultation owner cannot", async () => {
  const s = await fixture();
  await expect(run(s, [{ id: "first", rev: 1 }], staff)).rejects.toThrow(
    "관리자",
  );
  expect(s.consultations[0].historyDeletedAt).toBeUndefined();
});
it("removes selected history with actor and patient audit while preserving clinical, signed and financial records", async () => {
  const s = await fixture();
  s.consultations[0].memo = "보존할 상담";
  s.consultations[1].cancelled = true;
  s.ledger.push({
    id: "receipt",
    rev: 1,
    createdAt: "2026-10-01",
    updatedAt: "2026-10-01",
    patientId: s.consultations[0].patientId,
    consultationId: "first",
    kind: "receipt",
    amount: 10000,
    method: "카드",
    date: "2026-10-01",
    memo: "수납",
    actorId: "staff",
  });
  s.signatures.push({
    id: "signature",
    rev: 1,
    createdAt: "2026-10-01",
    updatedAt: "2026-10-01",
    consultationId: "first",
    templateId: "consent",
    templateVersion: 1,
    templateBody: "동의 내용",
    signer: "김철수",
    relationship: "본인",
    checks: [],
    image: "signature-image",
    contentHash: "hash",
    actorId: "staff",
  });
  const before = structuredClone(s);
  const out = await run(
    s,
    s.consultations.map((c) => ({ id: c.id, rev: c.rev })),
  );
  for (const c of out.consultations) {
    expect(c.historyDeletedBy).toBe("admin");
    expect(c.historyDeletedAt).toBeTruthy();
    expect(c.rev).toBe(2);
  }
  expect(out.consultations[0].memo).toBe("보존할 상담");
  expect(out.consultations[1].cancelled).toBe(true);
  expect(out.ledger).toEqual(before.ledger);
  expect(out.signatures).toEqual(before.signatures);
  expect(out.patients).toEqual(before.patients);
  expect(
    out.events.filter(
      (e) => e.kind === "consultation.historyDelete" && e.patientId,
    ),
  ).toHaveLength(2);
  expect(s).toEqual(before);
});
it("stale, missing, duplicate and oversized selections cannot partially delete a batch", async () => {
  const s = await fixture();
  for (const items of [
    [
      { id: "first", rev: 1 },
      { id: "second", rev: 2 },
    ],
    [
      { id: "first", rev: 1 },
      { id: "missing", rev: 1 },
    ],
    [
      { id: "first", rev: 1 },
      { id: "first", rev: 1 },
    ],
    Array.from({ length: 101 }, (_, i) => ({ id: String(i), rev: 1 })),
    [],
  ])
    await expect(run(s, items)).rejects.toThrow();
  expect(s.consultations.every((c) => !c.historyDeletedAt && c.rev === 1)).toBe(
    true,
  );
  const out = await run(s, [{ id: "first", rev: 1 }]);
  await expect(run(out, [{ id: "first", rev: 2 }])).rejects.toThrow(
    "다른 기기",
  );
});
