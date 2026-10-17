import { expect, it } from "vitest";
import { practiceState } from "../src/training/runtime";
import {
  searchConsultations,
  emptyConsultationSearch as blank,
  consultationDay,
} from "../src/core/consultationSearch";
const fixture = () => {
  const s = practiceState();
  s.consultations = s.consultations.slice(0, 1);
  const c = s.consultations[0];
  c.patient = {
    ...c.patient,
    name: "김철수",
    phone: "010-1234-5678",
    dob: "1992-12-12",
  };
  c.createdAt = "2026-10-16T16:00:00.000Z";
  c.appointment = "2026-10-17T01:00:00Z";
  c.cancelled = false;
  c.status = "H";
  c.ownerId = "staff";
  c.kind = "renewal";
  c.category = "미용";
  s.patients = [];
  return s;
};
it("searches identity snapshots without loading the whole patient directory and normalizes phone separators", () => {
  const s = fixture();
  for (const query of [
    "김철수",
    "01012345678",
    "010-1234",
    "1992-12-12",
    "김철수 5678",
  ])
    expect(
      searchConsultations(s, "all", { ...blank, query }, false),
    ).toHaveLength(1);
  expect(
    searchConsultations(s, "all", { ...blank, query: "김철수 9999" }, false),
  ).toHaveLength(0);
});
it("combines filters and treats consultation dates inclusively in Korean time", () => {
  const s = fixture();
  expect(consultationDay(s.consultations[0].createdAt)).toBe("2026-10-17");
  expect(
    searchConsultations(
      s,
      "held",
      {
        ...blank,
        owner: "staff",
        category: "미용",
        kind: "renewal",
        from: "2026-10-17",
        to: "2026-10-17",
      },
      true,
    ),
  ).toHaveLength(1);
  for (const fields of [
    { owner: "other" },
    { category: "보험" },
    { kind: "initial" },
    { from: "2026-10-18" },
    { to: "2026-10-16" },
  ])
    expect(
      searchConsultations(s, "all", { ...blank, ...fields }, true),
    ).toHaveLength(0);
  expect(
    searchConsultations(s, "today", blank, true, "2026-10-17"),
  ).toHaveLength(1);
});
it("keeps cancelled and deleted history out of unrelated result filters", () => {
  const s = fixture();
  s.consultations[0].cancelled = true;
  expect(searchConsultations(s, "cancelled", blank, true)).toHaveLength(1);
  expect(searchConsultations(s, "held", blank, true)).toHaveLength(0);
  s.consultations[0].historyDeletedAt = "2026-10-17";
  expect(searchConsultations(s, "all", blank, true)).toHaveLength(0);
  expect(searchConsultations(s, "cancelled", blank, true)).toHaveLength(0);
});
it("does not expose unpaid status to users without financial permission", () => {
  const s = fixture();
  s.consultations[0].status = "P";
  expect(searchConsultations(s, "success", blank, false)).toHaveLength(1);
  expect(searchConsultations(s, "failed", blank, false)).toHaveLength(0);
  expect(searchConsultations(s, "unpaid", blank, false)).toHaveLength(0);
});
