import { it, expect } from "vitest";
import { emptyState } from "../src/core/model";
import { applyCommand } from "../src/core/domain";
import {
  defaultGradeBenefits,
  reconcileGradeBenefits,
} from "../src/core/gradeBenefits";
import {
  pointBalance,
  defaultVipPolicy,
  reconcileVip,
  vipPeriod,
} from "../src/core/vipPoints";
import {
  expirePoints,
  pointAllocations,
  refundPointCredits,
} from "../src/core/pointLedger";
import { catalogAdmin } from "./fixtures/catalogs";
const at = "2026-01-15T03:00:00Z",
  base = { rev: 1, createdAt: at, updatedAt: at };
function fixture() {
  const s = emptyState();
  s.users = [catalogAdmin];
  s.patients = [
    {
      ...base,
      id: "p",
      name: "시험",
      dob: "1990-02-01",
      sex: "F" as const,
      phone: "01012345678",
      address: "동",
      ownerId: "admin",
    },
  ];
  s.policies = [
    {
      ...base,
      id: "grades",
      grades: [
        {
          id: "silver",
          name: "SILVER",
          minimum: 0,
          color: "#145d55",
          benefits: {
            ...defaultGradeBenefits,
            enabled: true,
            welcome: 10000,
            birthday: 3000,
            expiryMonths: 1,
            annualMonths: 3,
            annualThreshold: 100000,
            annualReward: 5000,
          },
        },
      ],
    },
  ];
  return s;
}
it("configures both periods, enrolls only enabled highest grades and issues birthday points once", () => {
  const s = fixture();
  reconcileGradeBenefits(s, at, "first");
  expect(pointBalance(s, "p", at)).toBe(10000);
  expect(s.pointEntries[0].expiresAt).toBe("2026-02-15");
  reconcileGradeBenefits(s, at, "retry");
  expect(s.pointEntries).toHaveLength(1);
  reconcileGradeBenefits(s, "2026-02-01T03:00:00Z", "birthday");
  expect(pointBalance(s, "p", "2026-02-01")).toBe(13000);
  reconcileGradeBenefits(s, "2026-02-02T03:00:00Z", "repeat");
  expect(
    s.pointEntries.filter((e) => e.benefitKey?.includes("birthday")),
  ).toHaveLength(1);
});
it("expires only unspent points, pays with the nearest expiry first, and preserves original expiry on returns", () => {
  const s = fixture();
  reconcileGradeBenefits(s, at, "grant");
  s.pointEntries.push({
    ...base,
    id: "forever",
    patientId: "p",
    amount: 5000,
    kind: "adjustment",
    reason: "무기한",
    actorId: "admin",
  });
  const allocations = pointAllocations(s, "p", 8000, at);
  expect(allocations[0].entryId).toBe(s.pointEntries[0].id);
  s.pointEntries.push({
    ...base,
    id: "spend",
    createdAt: "2026-01-16T00:00:00Z",
    patientId: "p",
    amount: -8000,
    kind: "use",
    reason: "사용",
    actorId: "admin",
    allocations,
  });
  expect(pointBalance(s, "p", "2026-02-16")).toBe(5000);
  expirePoints(s, "2026-02-16T00:00:00Z", "day");
  expect(s.pointEntries.at(-1)?.amount).toBe(-2000);
  expirePoints(s, "2026-02-16T00:00:00Z", "day2");
  expect(s.pointEntries.filter((e) => e.kind === "expiry")).toHaveLength(1);
  const creditParts = refundPointCredits(s, "spend", 3000, 0);
  expect(creditParts).toEqual([{ amount: 3000, expiresAt: "2026-02-15" }]);
  s.pointEntries.push({
    ...base,
    id: "return",
    createdAt: "2026-02-16T01:00:00Z",
    patientId: "p",
    amount: 3000,
    kind: "return",
    reason: "반환",
    actorId: "admin",
    creditParts,
  });
  expirePoints(s, "2026-02-16T01:00:00Z", "day");
  expect(pointBalance(s, "p", "2026-02-16")).toBe(5000);
  expect(new Set(s.pointEntries.map((e) => e.id)).size).toBe(
    s.pointEntries.length,
  );
});
it("leaves past awards unchanged when new award expiry/amount are changed", () => {
  const s = fixture();
  reconcileGradeBenefits(s, at, "one");
  s.policies[0].grades[0].benefits!.expiryMonths = 12;
  s.policies[0].grades[0].benefits!.welcome = 99999;
  reconcileGradeBenefits(s, "2026-01-20T03:00:00Z", "two");
  expect(s.pointEntries[0]).toMatchObject({
    amount: 10000,
    expiresAt: "2026-02-15",
  });
  expect(s.pointEntries).toHaveLength(1);
});
it("supports 3-month anniversary windows with month-end clamping", () => {
  expect(
    vipPeriod(
      { enrolledAt: "2026-01-31T03:00:00Z" },
      "2026-04-30T03:00:00Z",
      3,
    ),
  ).toEqual({ from: "2026-04-30", to: "2026-07-31" });
});
it("awards spend once per configured quarter and skips disabled benefits", () => {
  const s = fixture();
  reconcileGradeBenefits(s, at, "enroll");
  s.ledger.push({
    ...base,
    id: "cash",
    patientId: "p",
    consultationId: "c",
    kind: "receipt",
    amount: 100000,
    date: "2026-02-01",
    method: "카드",
    memo: "",
    actorId: "admin",
  });
  reconcileGradeBenefits(s, "2026-02-01T03:00:00Z", "cash");
  expect(
    s.pointEntries.filter((e) => e.benefitKey?.includes("period:")),
  ).toHaveLength(1);
  reconcileGradeBenefits(s, "2026-03-01T03:00:00Z", "again");
  expect(
    s.pointEntries.filter((e) => e.benefitKey?.includes("period:")),
  ).toHaveLength(1);
  s.policies[0].grades[0].benefits!.enabled = false;
  reconcileGradeBenefits(s, "2027-02-01T03:00:00Z", "off");
  expect(
    s.pointEntries.filter((e) => e.benefitKey?.includes("birthday:")),
  ).toHaveLength(1);
});
it("grade settings update VIP rules without changing existing permanent points", async () => {
  let s = fixture();
  s.policies[0].vip = { ...defaultVipPolicy, enabled: true, startedAt: at };
  s.policies[0].grades = [
    { id: "vip", name: "VIP", minimum: 5000000, color: "#145d55" },
  ];
  s.ledger.push({
    ...base,
    id: "cash",
    patientId: "p",
    consultationId: "c",
    kind: "receipt",
    amount: 5000000,
    date: "2026-01-15",
    method: "카드",
    memo: "",
    actorId: "admin",
  });
  reconcileVip(s, at, "first");
  s = await applyCommand(
    s,
    catalogAdmin,
    {
      id: crypto.randomUUID(),
      type: "grade.policy",
      entityId: "grades",
      baseRev: 1,
      payload: {
        grades: [
          {
            ...s.policies[0].grades[0],
            benefits: {
              ...defaultGradeBenefits,
              enabled: true,
              welcome: 200000,
              birthday: 60000,
              annualMonths: 6,
              expiryMonths: 3,
            },
          },
        ],
      },
    },
    "2026-01-20T00:00:00Z",
  );
  expect(s.policies[0].vip).toMatchObject({
    annualMonths: 6,
    expiryMonths: 3,
    birthday: 60000,
  });
  expect(s.pointEntries.find((e) => e.benefitKey === "welcome")).toMatchObject({
    amount: 100000,
  });
  expect(
    s.pointEntries.find((e) => e.benefitKey === "welcome")?.expiresAt,
  ).toBeUndefined();
});

it.each(["refund", "reversal"] as const)(
  "records payment allocations and expires an overdue %s without duplicating expiry entry ids",
  async (kind) => {
    let s = fixture();
    s.policies[0].grades[0].benefits!.birthday = 0;
    reconcileGradeBenefits(s, at, "grant");
    s.consultations = [
      {
        ...base,
        id: "c",
        patientId: "p",
        patient: s.patients[0],
        ownerId: "admin",
        category: "미용",
        status: "P",
        cancelled: false,
        catalogVersion: "",
        quote: {
          lines: [],
          discount: { kind: "amount", value: 0 },
          vat: "included",
          reason: "",
          subtotal: 20000,
          discountTotal: 0,
          supply: 20000,
          vatAmount: 0,
          total: 20000,
        },
        memo: "",
        photos: [],
        appointment: "",
        attendance: "방문",
        documents: [],
      },
    ];
    const pay = {
      id: crypto.randomUUID(),
      type: "ledger.create",
      payload: {
        consultationId: "c",
        kind: "receipt",
        amount: 5000,
        date: "2026-01-16",
        method: "VIP 포인트",
        memo: "",
      },
    };
    s = await applyCommand(s, catalogAdmin, pay, "2026-01-16T00:00:00Z");
    expect(
      s.pointEntries.find((e) => e.kind === "use")?.allocations?.[0].amount,
    ).toBe(5000);
    s = await applyCommand(
      s,
      catalogAdmin,
      {
        id: crypto.randomUUID(),
        type: "ledger.create",
        payload: {
          consultationId: "c",
          kind,
          originalId: pay.id,
          amount: 5000,
          date: "2026-02-16",
          method: "VIP 포인트",
          memo: "취소",
        },
      },
      "2026-02-16T00:00:00Z",
    );
    expect(pointBalance(s, "p", "2026-02-16")).toBe(0);
    expect(s.pointEntries.filter((e) => e.kind === "expiry")).toHaveLength(2);
    expect(new Set(s.pointEntries.map((e) => e.id)).size).toBe(
      s.pointEntries.length,
    );
  },
);
it("does not double-reward overlapping periods after an administrator changes the period length", () => {
  const s = fixture();
  s.policies[0].grades[0].benefits!.annualMonths = 12;
  reconcileGradeBenefits(s, at, "enroll");
  s.ledger.push({
    ...base,
    id: "cash",
    patientId: "p",
    consultationId: "c",
    kind: "receipt",
    amount: 100000,
    date: "2026-07-16",
    method: "카드",
    memo: "",
    actorId: "admin",
  });
  reconcileGradeBenefits(s, "2026-07-16T00:00:00Z", "award");
  s.policies[0].grades[0].benefits!.annualMonths = 6;
  reconcileGradeBenefits(s, "2026-07-17T00:00:00Z", "shorter");
  expect(
    s.pointEntries.filter((e) => e.benefitKey?.includes("period:")),
  ).toHaveLength(1);
});

it("offsets adjustment debt even when its credit shares the same timestamp, then expires only the remainder", () => {
  const s = fixture();
  s.pointEntries = [
    {
      ...base,
      id: "debit",
      patientId: "p",
      amount: -100,
      kind: "adjustment",
      reason: "조정",
      actorId: "admin",
      allocations: [],
    },
    {
      ...base,
      id: "credit",
      patientId: "p",
      amount: 200,
      kind: "grant",
      reason: "혜택",
      actorId: "system",
      expiresAt: "2026-02-15",
    },
  ];
  expect(pointBalance(s, "p", at)).toBe(100);
  expirePoints(s, "2026-02-16T00:00:00Z", "expire");
  expect(s.pointEntries.at(-1)?.amount).toBe(-100);
  expect(pointBalance(s, "p", "2026-02-16")).toBe(0);
});
