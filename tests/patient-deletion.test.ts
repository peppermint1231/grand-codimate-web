import { expect, it } from "vitest";
import { applyCommand } from "../src/core/domain";
import { emptyState, type User, type Command } from "../src/core/model";
import {
  noDeletionScope,
  normalizedDeletionScope,
  purgeChange,
} from "../src/core/patientDeletion";
import { diffStateChanges, mergeStateChanges } from "../src/core/stateChanges";
const admin: User = {
  id: "admin",
  username: "admin",
  name: "시험",
  role: "admin",
  active: true,
  permissions: {},
};
const command = (
  type: string,
  payload: Record<string, unknown>,
  entityId?: string,
): Command => ({ id: crypto.randomUUID(), type, payload, entityId });
async function fixture() {
  let s = emptyState();
  s.users = [admin];
  for (const id of ["a", "b"]) {
    s = await applyCommand(
      s,
      admin,
      command(
        "patient.create",
        {
          name: id,
          sex: "F",
          dob: "1990-01-01",
          phone: "01011112222",
          address: "석사동",
        },
        id,
      ),
    );
    s = await applyCommand(
      s,
      admin,
      command(
        "consultation.create",
        { patientId: id, category: "미용" },
        "c" + id,
      ),
    );
    const c = s.consultations.find((c) => c.patientId === id)!;
    c.memo = "남길 메모";
    c.documents = ["doc-" + id];
    c.photos = [
      {
        id: "photo-" + id,
        mediaId: "media-" + id,
        name: "시험사진",
        rotation: 0,
        selected: true,
        annotations: [],
      },
    ];
  }
  const row = { rev: 1, createdAt: "2026-01-01", updatedAt: "2026-01-01" };
  for (const id of ["a", "b"]) {
    s.notes.push({
      ...row,
      id: "note-" + id,
      patientId: id,
      text: "메모",
      authorId: "admin",
    } as any);
    s.ledger.push({
      ...row,
      id: "money-" + id,
      patientId: id,
      consultationId: "c" + id,
      kind: "receipt",
      amount: 100000,
    } as any);
    s.signatures.push({
      ...row,
      id: "sign-" + id,
      consultationId: "c" + id,
    } as any);
  }
  return s;
}
const payload = (s: any, scope: any) => ({
  items: [{ id: "a", rev: s.patients.find((p: any) => p.id === "a").rev }],
  confirmation: "영구삭제",
  scope: { ...noDeletionScope, ...scope },
});
it("requires administrator, nonempty scope, confirmation and current revision before changing anything", async () => {
  const s = await fixture();
  for (const user of [
    { ...admin, role: "coordinator" },
    { ...admin, permissionLevel: "executive" },
  ])
    await expect(
      applyCommand(
        s,
        user as User,
        command("patient.purge", payload(s, { profile: true })),
      ),
    ).rejects.toThrow();
  for (const p of [
    payload(s, {}),
    { ...payload(s, { profile: true }), confirmation: "" },
    { ...payload(s, { profile: true }), items: [{ id: "a", rev: 999 }] },
  ])
    await expect(
      applyCommand(s, admin, command("patient.purge", p)),
    ).rejects.toThrow();
  expect(s.patients).toHaveLength(2);
});
it("archives a batch atomically without touching linked data", async () => {
  const s = await fixture(),
    items = s.patients.map((p) => ({ id: p.id, rev: p.rev }));
  await expect(
    applyCommand(
      s,
      admin,
      command("patient.archiveBatch", {
        items: [items[0], { ...items[1], rev: 999 }],
      }),
    ),
  ).rejects.toThrow();
  expect(s.patients.every((p) => !p.archived)).toBe(true);
  const after = await applyCommand(
    s,
    admin,
    command("patient.archiveBatch", { items }),
  );
  expect(after.patients.every((p) => p.archived)).toBe(true);
  expect(after.consultations).toEqual(s.consultations);
  expect(after.ledger).toEqual(s.ledger);
});
it("photo-only erasure also removes photo-containing exports, keeping notes, payments and other patients", async () => {
  const s = await fixture(),
    after = await applyCommand(
      s,
      admin,
      command("patient.purge", payload(s, { photos: true })),
    );
  const c = after.consultations.find((c) => c.id === "ca")!;
  expect(c.photos).toEqual([]);
  expect(c.documents).toEqual([]);
  expect(c.memo).toBe("남길 메모");
  expect(after.ledger).toEqual(s.ledger);
  expect(after.notes).toEqual(s.notes);
  expect(after.signatures.map((x) => x.id)).toEqual(["sign-b"]);
  expect(after.consultations.find((c) => c.id === "cb")).toEqual(
    s.consultations.find((c) => c.id === "cb"),
  );
  expect(s.consultations[0].photos).toHaveLength(1);
});
it("full erasure produces client and restore tombstones, leaving no patient in archived lists", async () => {
  const s = await fixture(),
    after = await applyCommand(
      s,
      admin,
      command("patient.purge", payload(s, { profile: true })),
    );
  for (const section of [
    "patients",
    "consultations",
    "notes",
    "ledger",
    "signatures",
  ] as const)
    expect(after[section]).toHaveLength(1);
  expect(after.patients[0].id).toBe("b");
  const changes = diffStateChanges(s, after);
  expect(changes).toContainEqual({ section: "patients", id: "a", value: null });
  expect(mergeStateChanges(s, changes)).toEqual(after);
  const plan = {
    patientIds: ["a"],
    consultationIds: ["ca"],
    scope: normalizedDeletionScope({ ...noDeletionScope, profile: true }),
    protectedMediaIds: [],
    snapshots: [],
    inquiryIds: [],
  };
  expect(
    purgeChange({ section: "patients", id: "a", value: s.patients[0] }, plan)
      .value,
  ).toBeNull();
  expect(
    purgeChange({ section: "patients", id: "b", value: s.patients[1] }, plan)
      .value,
  ).toEqual(s.patients[1]);
});
