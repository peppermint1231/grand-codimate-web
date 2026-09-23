import { expect, it } from "vitest";
import { emptyState } from "../src/core/model";
import { applyCommand } from "../src/core/domain";
import { catalogAdmin, threeCatalogs } from "./fixtures/catalogs";
import { offeringSchema, productComposition } from "../src/core/offerings";
import { wrapDocumentText } from "../src/core/quoteTemplate";
it("retains note versions, editor attribution and rejects edits at a stale revision", async () => {
  let s = emptyState();
  s.users = [catalogAdmin];
  s.patients = [
    {
      id: "p",
      rev: 1,
      createdAt: "2026-09-01",
      updatedAt: "2026-09-01",
      name: "검증",
      dob: "1990-01-01",
      sex: "F",
      phone: "01000000000",
      address: "서울",
      ownerId: "admin",
    },
  ];
  const payload = { patientId: "p", text: "원문", important: false };
  s = await applyCommand(s, catalogAdmin, {
    id: "operation1",
    type: "note.save",
    entityId: "note",
    payload,
  });
  s = await applyCommand(s, catalogAdmin, {
    id: "operation2",
    type: "note.save",
    entityId: "note",
    baseRev: 1,
    payload: { ...payload, text: "수정", important: true },
  });
  expect(s.notes[0].versions).toMatchObject([
    { rev: 1, text: "원문", important: false, actorId: "admin" },
  ]);
  expect(s.notes[0].editedBy).toBe("admin");
  await expect(
    applyCommand(s, catalogAdmin, {
      id: "operation3",
      type: "note.save",
      entityId: "note",
      baseRev: 1,
      payload,
    }),
  ).rejects.toThrow();
});
it("validates structured package/membership terms and keeps legacy composition", () => {
  const p = threeCatalogs()[0].products[0];
  p.composition = "기존 안내";
  p.offering = offeringSchema.parse({
    kind: "membership",
    items: [{ name: "관리", quantity: 5, unit: "회" }],
    validityDays: 365,
    creditAmount: 1000000,
    bonusAmount: 50000,
    terms: "예약 후 이용",
  });
  const text = productComposition(p);
  for (const value of [
    "기존 안내",
    "관리 5회",
    "365일",
    "1,000,000원",
    "50,000원",
    "예약 후 이용",
  ])
    expect(text).toContain(value);
  expect(() =>
    offeringSchema.parse({
      ...p.offering,
      items: [{ name: "관리", quantity: -1, unit: "회" }],
    }),
  ).toThrow();
});
it("wraps long Unicode document text without losing characters or clipping into the price column", () => {
  const source = "길고 자세한 시술명 ".repeat(150);
  const lines = wrapDocumentText(source, (t) => Array.from(t).length * 12, 600);
  expect(lines.join("")).toBe(source);
  expect(lines.every((t) => Array.from(t).length <= 50)).toBe(true);
});
