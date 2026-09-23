import { expect, it } from "vitest";
import {
  allocateAmount,
  analyticsPrompt,
  buildAnalytics,
  incentiveRows,
} from "../src/core/analytics";
import { analyticsWorkbook } from "../src/core/analyticsExcel";
import {
  activeLedger,
  ledgerAvailable,
  applyCommand,
} from "../src/core/domain";
import { mergeStateChanges, visibleChanges } from "../src/core/stateChanges";
import {
  emptyQuote,
  emptyState,
  type State,
  type Consultation,
  type User,
} from "../src/core/model";
import ExcelJS from "exceljs";
const base = {
  rev: 1,
  createdAt: "2026-01-01T00:00:00Z",
  updatedAt: "2026-01-01T00:00:00Z",
};
const user: User = {
  id: "staff",
  name: "직원실명",
  username: "staff",
  role: "admin",
  active: true,
  permissions: {},
};
function fixture(): State {
  const s = emptyState();
  s.users = [user];
  s.patients = [
    {
      ...base,
      id: "patient",
      name: "환자실명",
      phone: "01099991234",
      dob: "1990-01-01",
      sex: "F",
      address: "서울특별시 영등포구 개인주소",
      ownerId: "staff",
      acquisitionSource: "검색",
    },
  ];
  const c: Consultation = {
    ...base,
    id: "consult",
    patientId: "patient",
    patient: s.patients[0],
    ownerId: "staff",
    category: "미용",
    status: "P",
    cancelled: false,
    catalogVersion: "v1",
    quote: {
      ...emptyQuote(),
      total: 30000,
      subtotal: 40000,
      discountTotal: 10000,
      lines: [
        {
          id: "l1",
          productId: "p1",
          optionId: "o1",
          name: "리프팅",
          label: "기본",
          unit: "회",
          quantity: 1,
          price: 10000,
          tax: "exempt",
          discount: { kind: "amount", value: 0 },
          book: "미용",
          categorySnapshot: "탄력",
        },
        {
          id: "l2",
          productId: "p2",
          optionId: "o2",
          name: "피부 이벤트",
          label: "기본",
          unit: "회",
          quantity: 1,
          price: 20000,
          tax: "exempt",
          discount: { kind: "amount", value: 0 },
          book: "이벤트",
          categorySnapshot: "피부결",
        },
      ],
    },
    memo: "기밀 메모",
    photos: [],
    appointment: "",
    attendance: "방문",
    documents: [],
  };
  s.consultations = [c];
  s.ledger = [
    {
      ...base,
      id: "receipt",
      patientId: "patient",
      consultationId: "consult",
      kind: "receipt",
      amount: 18000,
      date: "2026-02-01",
      method: "카드",
      memo: "",
      actorId: "cashier",
    },
    {
      ...base,
      id: "refund",
      patientId: "patient",
      consultationId: "consult",
      kind: "refund",
      originalId: "receipt",
      amount: 3000,
      date: "2026-02-02",
      method: "카드",
      memo: "환불",
      actorId: "cashier",
    },
  ];
  return s;
}
const period = { from: "2026-01-01", to: "2026-03-31" };
it("allocates won without losing or duplicating cents including zero and negative totals", () => {
  for (const n of [0, 1, 100, 30001, -30001]) {
    const a = allocateAmount(n, [1, 2, 3]);
    expect(a.reduce((x, y) => x + y, 0)).toBe(n);
    expect(a.every(Number.isInteger)).toBe(true);
  }
  expect(allocateAmount(5, [0, 0])).toEqual([3, 2]);
});
it("attributes cash to consultation owner and preserves mixed-book totals and residuals", () => {
  const s = fixture(),
    r = buildAnalytics(s, period);
  expect(r.totals).toMatchObject({
    consultations: 1,
    contract: 30000,
    receipts: 18000,
    refunds: 3000,
    net: 15000,
    outstanding: 15000,
    conversion: 100,
  });
  expect(r.employees).toHaveLength(1);
  expect(r.employees[0].id).toBe("staff");
  expect(r.strengths.reduce((n, v) => n + v.net, 0)).toBe(15000);
  const beauty = buildAnalytics(s, { ...period, book: "미용" });
  expect(beauty.totals.net).toBe(5000);
  expect(beauty.totals.contract).toBe(10000);
  expect(beauty.totals.outstanding).toBe(5000);
});
it("distinguishes contract date and cash date, reversals and cancelled contracts", () => {
  const s = fixture();
  expect(
    buildAnalytics(s, { from: "2026-02-01", to: "2026-02-28" }).totals,
  ).toMatchObject({ consultations: 0, contract: 0, net: 15000 });
  s.consultations[0].cancelled = true;
  expect(buildAnalytics(s, period).totals).toMatchObject({
    contract: 0,
    cancelled: 1,
    net: 15000,
    outstanding: 0,
  });
  s.ledger.push({
    ...s.ledger[1],
    id: "reverse-refund",
    kind: "reversal",
    originalId: "refund",
  });
  expect(buildAnalytics(s, period).totals.net).toBe(18000);
});
it("uses observed 30/90-day cohorts and avoids counting same-day consultations as returns", () => {
  const s = fixture();
  s.consultations.push({
    ...s.consultations[0],
    id: "repeat",
    createdAt: "2026-01-20T00:00:00Z",
    status: "H",
  });
  const r = buildAnalytics(s, { from: "2026-01-01", to: "2026-03-01" });
  expect(r.patients.cohorts[0]).toMatchObject({
    patients: 1,
    eligible30: 1,
    returned30: 1,
    eligible90: 0,
    returned90: 0,
  });
  expect(r.totals.conversion).toBe(100);
  expect(r.totals.held).toBe(1);
});
it("hides every monetary result and builds prompts without patient/employee identities", () => {
  const s = fixture(),
    r = buildAnalytics(s, period, false);
  expect(r.totals.net).toBe(0);
  expect(
    r.strengths.every((x) => x.contract === 0 && x.outstanding === 0),
  ).toBe(true);
  expect(r.products.every((x) => x.contract === 0)).toBe(true);
  expect(r.patients.meanLifetimeNet).toBe(0);
  const settings = {
    basis: "net" as const,
    defaultRate: 3,
    floorZero: false,
    rates: {},
  };
  for (const purpose of ["employee", "patient"] as const) {
    const prompt = analyticsPrompt(
      buildAnalytics(s, period),
      purpose,
      "분석",
      settings,
    );
    for (const secret of [
      "환자실명",
      "직원실명",
      "01099991234",
      "개인주소",
      "기밀 메모",
    ])
      expect(prompt).not.toContain(secret);
  }
  expect(incentiveRows(r, settings).every((x) => x.amount === 0)).toBe(true);
});
it("supports individual incentive overrides, bases and negative refund carrybacks", () => {
  const r = buildAnalytics(fixture(), period),
    settings = {
      basis: "net" as const,
      defaultRate: 3,
      floorZero: false,
      rates: { [r.strengths[0].id]: 10 },
    };
  const rows = incentiveRows(r, settings);
  expect(rows[0].amount).toBe(Math.round(rows[0].basis * 0.1));
  r.strengths[0].net = -10000;
  expect(incentiveRows(r, settings)[0].amount).toBe(-1000);
  expect(incentiveRows(r, { ...settings, floorZero: true })[0].amount).toBe(0);
});
it("exports separate staff/patient workbooks with numeric data, criteria and no raw patient identifiers", async () => {
  const r = buildAnalytics(fixture(), period),
    settings = {
      basis: "net" as const,
      defaultRate: 3,
      floorZero: false,
      rates: {},
    };
  for (const purpose of ["employee", "patient"] as const) {
    const blob = await analyticsWorkbook(r, purpose, settings),
      wb = new ExcelJS.Workbook();
    await wb.xlsx.load(await blob.arrayBuffer());
    expect(wb.getWorksheet("집계 기준")).toBeTruthy();
    expect(
      wb.getWorksheet(
        purpose === "employee" ? "인센티브 시뮬레이션" : "재상담 코호트",
      ),
    ).toBeTruthy();
    const values = wb.worksheets.flatMap((w) => w.getSheetValues());
    expect(JSON.stringify(values)).not.toContain("환자실명");
  }
});
it("computes remaining receipt/refund amounts and rejects stale full-balance submissions", async () => {
  const s = fixture();
  expect(ledgerAvailable(s, "consult", "receipt")).toBe(15000);
  expect(ledgerAvailable(s, "consult", "refund", "receipt")).toBe(15000);
  await expect(
    applyCommand(s, user, {
      id: "stale-operation",
      type: "ledger.create",
      payload: {
        kind: "refund",
        consultationId: "consult",
        originalId: "receipt",
        amount: 16000,
        fullAmount: true,
        date: "2026-03-01",
        method: "카드",
        memo: "test",
      },
    }),
  ).rejects.toThrow();
  const next = await applyCommand(s, user, {
    id: "full-operation",
    type: "ledger.create",
    payload: {
      kind: "receipt",
      consultationId: "consult",
      amount: 15000,
      fullAmount: true,
      date: "2026-03-01",
      method: "카드",
      memo: "",
    },
  });
  expect(ledgerAvailable(next, "consult", "receipt")).toBe(0);
  expect(activeLedger(next)).toHaveLength(3);
});
it("merges only returned records without dropping untouched data or exposing restricted fields", () => {
  const s = fixture(),
    before = structuredClone(s),
    changes = [
      {
        section: "consultations" as const,
        id: "consult",
        value: { ...s.consultations[0], rev: 2 },
      },
      {
        section: "notes" as const,
        id: "secret",
        value: { id: "secret", text: "secret" },
      },
      { section: "ledger" as const, id: "cash", value: s.ledger[0] },
    ];
  const safe = visibleChanges(changes, {
    ...user,
    role: "coordinator",
    permissionLevel: "standard",
    permissions: { "note.read": false, "money.read": false },
  });
  expect(safe).toHaveLength(1);
  expect((safe[0].value as Consultation).quote.total).toBe(0);
  const next = mergeStateChanges(s, changes.slice(0, 1));
  expect(next.consultations[0].rev).toBe(2);
  expect(next.patients).toBe(s.patients);
  expect(s).toEqual(before);
});
it("includes actual cash for interim consultations without inflating consultation counts and rejects impossible dates", () => {
  const s = fixture();
  s.consultations[0].kind = "interim";
  const r = buildAnalytics(s, period);
  expect(r.totals.consultations).toBe(0);
  expect(r.totals.net).toBe(15000);
  expect(() =>
    buildAnalytics(s, { from: "2026-02-31", to: "2026-03-31" }),
  ).toThrow();
});
