import { expect, it } from "vitest";
import { emptyState, type Patient } from "../src/core/model";
import { metrics, duplicates } from "../src/core/domain";
import { patientIndex, searchPatients } from "../src/core/patientSearch";
import {
  patientRegisteredAt,
  patientLastConsultedAt,
} from "../src/core/patientHistory";
const patient = (id = "vegas-1"): Patient => ({
  id,
  rev: 1,
  createdAt: "2026-10-08T01:00:00Z",
  updatedAt: "2026-10-08T01:00:00Z",
  name: "홍 길동",
  phone: "010-1234-5678",
  dob: "1980-01-01",
  sex: "M",
  address: "",
  ownerId: "admin",
  external: {
    source: "vegas",
    fileHash: "a".repeat(64),
    rows: [2],
    firstVisit: "2019-02-01",
    lastVisit: "2024-06-01",
    totalPaid: 5000000,
    visitCount: 10,
    issues: [],
  },
});
const filter = {
  search: "",
  grade: "",
  sort: "recent",
  unpaid: false,
  owner: "",
  consultStatus: "",
  since: "",
  archived: false,
  duplicateOnly: false,
  page: 0,
};
it("adds imported cash once to contract and contribution without creating cash or unpaid balances", () => {
  const s = emptyState();
  s.patients = [patient()];
  expect(metrics(s, "vegas-1")).toEqual({
    contract: 5000000,
    revenue: 5000000,
    receipts: 0,
    refunds: 0,
    outstanding: 0,
  });
  s.ledger = [
    {
      id: "r",
      rev: 1,
      createdAt: "",
      updatedAt: "",
      patientId: "vegas-1",
      consultationId: "c",
      kind: "receipt",
      amount: 100000,
      date: "2026-10-08",
      method: "card",
      ownerId: "admin",
    } as any,
    {
      id: "f",
      rev: 1,
      createdAt: "",
      updatedAt: "",
      patientId: "vegas-1",
      consultationId: "c",
      kind: "refund",
      amount: 20000,
      date: "2026-10-08",
      method: "card",
      ownerId: "admin",
    } as any,
  ];
  expect(metrics(s, "vegas-1")).toMatchObject({
    contract: 5000000,
    revenue: 5080000,
    receipts: 100000,
    refunds: 20000,
    outstanding: 0,
  });
  s.consultations = [
    {
      id: "c",
      patientId: "vegas-1",
      status: "P",
      quote: { total: 200000 },
    } as any,
  ];
  expect(metrics(s, "vegas-1")).toMatchObject({
    contract: 5200000,
    revenue: 5080000,
    outstanding: 120000,
  });
  s.patients = [patient("native")];
  expect(metrics(s, "native").revenue).toBe(0);
});
it("uses source dates, allows a newer real consultation and leaves VIP creation timestamps intact", () => {
  const p = patient();
  expect(patientRegisteredAt(p)).toBe("2019-02-01");
  expect(patientLastConsultedAt(p, [])).toBe("2024-06-01");
  expect(
    patientLastConsultedAt(p, [
      { createdAt: "2025-01-01" },
      { createdAt: "2026-01-01", cancelled: true },
    ]),
  ).toBe("2025-01-01");
  expect(p.createdAt).toBe("2026-10-08T01:00:00Z");
  const s = emptyState();
  s.patients = [
    p,
    {
      ...patient("vegas-2"),
      external: { ...p.external!, lastVisit: "2023-01-01" },
    },
  ];
  const result = searchPatients(patientIndex(s), {
    ...filter,
    since: "2024-01-01",
  });
  expect(result.rows.map((r) => r.p.id)).toEqual(["vegas-1"]);
});
it("requires both normalized name and phone and ignores archived or missing-contact records", () => {
  const s = emptyState(),
    p = patient();
  s.patients = [
    p,
    {
      ...p,
      id: "same",
      name: "홍길동",
      phone: "０１０１２３４５６７８",
      dob: "1990-01-01",
    },
    { ...p, id: "family", name: "가족" },
    { ...p, id: "sameBirth", phone: "01011112222" },
    { ...p, id: "removed", archived: true },
    { ...p, id: "missing", phone: "" },
  ];
  expect(duplicates(s, p).map((p) => p.id)).toEqual(["vegas-1", "same"]);
  const index = patientIndex(s);
  expect(index.map((r) => [r.p.id, r.duplicates])).toEqual([
    ["vegas-1", 1],
    ["same", 1],
    ["family", 0],
    ["sameBirth", 0],
    ["removed", 0],
    ["missing", 0],
  ]);
});
it("redacts compact imported money and aggregate totals when money permission is absent", () => {
  const s = emptyState(),
    p = patient();
  s.patients = [
    {
      ...p,
      external: undefined,
      importSummary: {
        totalPaid: 5000000,
        firstVisit: "2019-02-01",
        lastVisit: "2024-06-01",
      },
    },
  ];
  const result = searchPatients(patientIndex(s), filter, false);
  expect(result.totalRevenue).toBeNull();
  expect(result.rows[0].p.importSummary?.totalPaid).toBeNull();
  expect(result.rows[0].m.revenue).toBe(0);
});
