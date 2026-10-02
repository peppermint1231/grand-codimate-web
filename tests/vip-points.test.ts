import { expect, it } from "vitest";
import {
  emptyState,
  emptyQuote,
  type State,
  type Patient,
  type Command,
} from "../src/core/model";
import {
  applyCommand,
  metrics,
  ledgerAvailable,
  gradeFor,
} from "../src/core/domain";
import {
  defaultVipPolicy,
  reconcileVip,
  pointBalance,
  vipAccount,
  vipPeriod,
  annualCash,
} from "../src/core/vipPoints";
import { visibleChanges } from "../src/core/stateChanges";
import { catalogAdmin } from "./fixtures/catalogs";
const start = "2026-01-01T03:00:00.000Z";
const base = { rev: 1, createdAt: start, updatedAt: start };
const person = (id: string): Patient => ({
  ...base,
  id,
  name: id,
  number: id,
  sex: "F",
  dob: "1990-12-30",
  phone: "01012345678",
  address: "시험",
  ownerId: "admin",
});
function fixture() {
  const s = emptyState();
  s.users = [catalogAdmin];
  s.patients = [person("vip"), person("friend")];
  s.policies = [
    {
      ...base,
      id: "grades",
      grades: [
        { id: "vip-grade", name: "VIP", minimum: 5e6, color: "#145d55" },
      ],
      vip: { ...defaultVipPolicy, enabled: true, startedAt: start },
    },
  ];
  s.consultations = s.patients.map((p) => ({
    ...base,
    id: "c-" + p.id,
    patientId: p.id,
    patient: p,
    ownerId: "admin",
    category: "미용",
    status: "P",
    cancelled: false,
    catalogVersion: "v",
    quote: { ...emptyQuote(), total: 20e6 },
    memo: "",
    photos: [],
    appointment: "",
    attendance: "미정",
    documents: [],
  }));
  return s;
}
const command = (
  type: string,
  payload: Record<string, unknown>,
  entityId?: string,
  baseRev?: number,
): Command => ({ id: crypto.randomUUID(), type, payload, entityId, baseRev });
async function receipt(
  s: State,
  amount: number,
  now = start,
  patient = "vip",
  method = "카드",
) {
  const c = command("ledger.create", {
    kind: "receipt",
    consultationId: "c-" + patient,
    amount,
    date: now.slice(0, 10),
    method,
    memo: "",
  });
  return { state: await applyCommand(s, catalogAdmin, c, now), id: c.id };
}
const tick = (s: State, now: string) =>
  reconcileVip(s, now, crypto.randomUUID());
it("enrolls existing VIPs, pays the welcome once and excludes promotion receipts from annual spend", async () => {
  const { state: s } = await receipt(fixture(), 5e6);
  expect(pointBalance(s, "vip")).toBe(100000);
  expect(vipAccount(s, "vip")).toBeDefined();
  const a = vipAccount(s, "vip")!;
  expect(annualCash(s, a, "2026-01-01", "2027-01-01", start)).toBe(0);
  tick(s, start);
  tick(s, start);
  expect(pointBalance(s, "vip")).toBe(100000);
  expect(s.vipAccounts).toHaveLength(1);
});
it("awards each anniversary period once and does not multiply for spending 10 million", async () => {
  let { state: s } = await receipt(fixture(), 5e6);
  ({ state: s } = await receipt(s, 10e6, "2026-02-01T03:00:00Z"));
  expect(pointBalance(s, "vip")).toBe(200000);
  ({ state: s } = await receipt(s, 5e6, "2027-01-01T03:00:00Z"));
  expect(
    s.pointEntries.filter(
      (e) => e.benefitKey?.startsWith("annual:") && e.kind === "grant",
    ),
  ).toHaveLength(2);
  expect(vipPeriod(vipAccount(s, "vip")!, "2026-12-31")).toEqual({
    from: "2026-01-01",
    to: "2027-01-01",
  });
});
it("catches up birthdays once per Korean calendar year and handles leap days", async () => {
  const seed = fixture();
  seed.patients[0].dob = "1992-02-29";
  let { state: s } = await receipt(seed, 5e6);
  tick(s, "2026-02-27T15:00:00Z");
  expect(pointBalance(s, "vip")).toBe(150000);
  tick(s, "2026-03-01T00:00:00Z");
  expect(pointBalance(s, "vip")).toBe(150000);
  tick(s, "2027-03-01T00:00:00Z");
  expect(pointBalance(s, "vip")).toBe(200000);
});
it("does not backdate birthday rewards before VIP enrollment", async () => {
  const seed = fixture();
  seed.patients[0].dob = "1990-01-01";
  const { state: s } = await receipt(seed, 5e6, "2026-02-01T03:00:00Z");
  tick(s, "2026-03-01T03:00:00Z");
  expect(pointBalance(s, "vip")).toBe(100000);
});
it("records a referral at registration but pays the VIP only after first cash receipt", async () => {
  let { state: s } = await receipt(fixture(), 5e6);
  s = await applyCommand(
    s,
    catalogAdmin,
    command(
      "patient.create",
      {
        name: "신규",
        sex: "F",
        dob: "1995-01-01",
        phone: "01099998888",
        address: "시험",
        referredByPatientId: "vip",
      },
      "new-friend",
    ),
    "2026-02-01T00:00:00Z",
  );
  expect(pointBalance(s, "vip")).toBe(100000);
  s.consultations.push({
    ...s.consultations[1],
    id: "c-new-friend",
    patientId: "new-friend",
  });
  ({ state: s } = await receipt(
    s,
    10000,
    "2026-02-02T00:00:00Z",
    "new-friend",
  ));
  expect(pointBalance(s, "vip")).toBe(120000);
  expect(pointBalance(s, "new-friend")).toBe(0);
  ({ state: s } = await receipt(
    s,
    20000,
    "2026-02-03T00:00:00Z",
    "new-friend",
  ));
  expect(pointBalance(s, "vip")).toBe(120000);
});
it("does not reward self or duplicate-person referrals and ignores payment before referrer VIP enrollment", async () => {
  let s = fixture();
  s.patients[1].referredByPatientId = "vip";
  ({ state: s } = await receipt(s, 10000, start, "friend"));
  ({ state: s } = await receipt(s, 5e6, "2026-02-01T00:00:00Z"));
  ({ state: s } = await receipt(s, 10000, "2026-02-02T00:00:00Z", "friend"));
  expect(pointBalance(s, "vip")).toBe(100000);
  await expect(
    applyCommand(
      s,
      catalogAdmin,
      command(
        "patient.create",
        { ...person("vip"), referredByPatientId: "vip" },
        "self",
      ),
    ),
  ).rejects.toThrow("동일한 환자");
  await expect(
    applyCommand(
      s,
      catalogAdmin,
      command(
        "patient.create",
        { ...person("x"), referredByPatientId: "x" },
        "x",
      ),
    ),
  ).rejects.toThrow("본인");
});
it("spends atomically with settlement, excludes points from cash contribution and returns refunds as points", async () => {
  let { state: s } = await receipt(fixture(), 5e6);
  const used = await receipt(
    s,
    60000,
    "2026-02-01T00:00:00Z",
    "vip",
    "VIP 포인트",
  );
  s = used.state;
  expect(pointBalance(s, "vip")).toBe(40000);
  expect(metrics(s, "vip").revenue).toBe(5e6);
  expect(ledgerAvailable(s, "c-vip", "receipt")).toBe(20e6 - 5e6 - 60000);
  await expect(
    receipt(s, 50000, "2026-02-01T00:00:00Z", "vip", "VIP 포인트"),
  ).rejects.toThrow("부족");
  s = await applyCommand(
    s,
    catalogAdmin,
    command("ledger.create", {
      kind: "refund",
      consultationId: "c-vip",
      originalId: used.id,
      amount: 20000,
      date: "2026-02-02",
      method: "현금",
      memo: "부분 환불",
    }),
    "2026-02-02T00:00:00Z",
  );
  expect(pointBalance(s, "vip")).toBe(60000);
  expect(s.ledger.at(-1)?.tender).toBe("points");
  expect(s.ledger.at(-1)?.method).toBe("VIP 포인트");
  expect(metrics(s, "vip").revenue).toBe(5e6);
});
it("retains annual awards after refunds and never regrants the same period after refund correction", async () => {
  let { state: s } = await receipt(fixture(), 5e6);
  const second = await receipt(s, 5e6, "2026-02-01T00:00:00Z");
  s = second.state;
  ({ state: s } = await receipt(
    s,
    150000,
    "2026-02-02T00:00:00Z",
    "vip",
    "VIP 포인트",
  ));
  const refund = command("ledger.create", {
    kind: "refund",
    consultationId: "c-vip",
    originalId: second.id,
    amount: 5e6,
    date: "2026-02-03",
    method: "카드",
    memo: "환불",
  });
  s = await applyCommand(s, catalogAdmin, refund, "2026-02-03T00:00:00Z");
  expect(pointBalance(s, "vip")).toBe(50000);
  s = await applyCommand(
    s,
    catalogAdmin,
    command("ledger.create", {
      kind: "reversal",
      consultationId: "c-vip",
      originalId: refund.id,
      amount: 5e6,
      date: "2026-02-04",
      method: "카드",
      memo: "환불 정정",
    }),
    "2026-02-04T00:00:00Z",
  );
  expect(pointBalance(s, "vip")).toBe(50000);
  tick(s, "2026-02-04T00:00:00Z");
  expect(pointBalance(s, "vip")).toBe(50000);
});
it("retains fully refunded referral credit", async () => {
  let { state: s } = await receipt(fixture(), 5e6);
  s.patients[1].referredByPatientId = "vip";
  const paid = await receipt(s, 10000, "2026-02-01T00:00:00Z", "friend");
  s = paid.state;
  expect(pointBalance(s, "vip")).toBe(120000);
  s = await applyCommand(
    s,
    catalogAdmin,
    command("ledger.create", {
      kind: "refund",
      consultationId: "c-friend",
      originalId: paid.id,
      amount: 10000,
      date: "2026-02-02",
      method: "카드",
      memo: "전액 환불",
    }),
    "2026-02-02T00:00:00Z",
  );
  expect(pointBalance(s, "vip")).toBe(120000);
});
it("preserves permanent VIP and birthday benefits after a full cash refund and on patient archival", async () => {
  const seed = fixture();
  seed.patients[0].dob = "1990-02-01";
  const paid = await receipt(seed, 5e6);
  let s = paid.state;
  tick(s, "2026-02-01T00:00:00Z");
  s = await applyCommand(
    s,
    catalogAdmin,
    command("ledger.create", {
      kind: "refund",
      consultationId: "c-vip",
      originalId: paid.id,
      amount: 5e6,
      date: "2026-03-01",
      method: "카드",
      memo: "환불",
    }),
    "2026-03-01T00:00:00Z",
  );
  expect(pointBalance(s, "vip")).toBe(150000);
  expect(gradeFor(s, s.patients[0]).name).toBe("VIP");
  tick(s, "2027-02-01T00:00:00Z");
  expect(pointBalance(s, "vip")).toBe(200000);
  s = await applyCommand(
    s,
    catalogAdmin,
    command("patient.archive", { archived: true }, "vip", s.patients[0].rev),
    "2027-02-02T00:00:00Z",
  );
  expect(pointBalance(s, "vip")).toBe(200000);
});
it("does not count point-only visits or future-dated cash for referrals", async () => {
  let { state: s } = await receipt(fixture(), 5e6);
  s.patients[1].referredByPatientId = "vip";
  s = await applyCommand(
    s,
    catalogAdmin,
    command("points.adjust", {
      patientId: "friend",
      amount: 20000,
      reason: "시험 적립",
      expectedBalance: 0,
    }),
  );
  ({ state: s } = await receipt(
    s,
    10000,
    "2026-02-01T00:00:00Z",
    "friend",
    "VIP 포인트",
  ));
  expect(pointBalance(s, "vip")).toBe(100000);
  s = await applyCommand(
    s,
    catalogAdmin,
    command("ledger.create", {
      kind: "receipt",
      consultationId: "c-friend",
      amount: 10000,
      date: "2027-01-01",
      method: "카드",
      memo: "",
    }),
    "2026-02-02T00:00:00Z",
  );
  expect(pointBalance(s, "vip")).toBe(100000);
});
it("requires money correction permission and optimistic balance for adjustments, and hides point changes without money access", async () => {
  const s = fixture();
  const cmd = command("points.adjust", {
    patientId: "vip",
    amount: 1000,
    reason: "조정",
    expectedBalance: 0,
  });
  await expect(
    applyCommand(
      s,
      {
        ...catalogAdmin,
        permissionLevel: "standard",
        permissions: { "ledger.correct": false },
      },
      cmd,
    ),
  ).rejects.toThrow("권한");
  const next = await applyCommand(s, catalogAdmin, cmd);
  await expect(
    applyCommand(next, catalogAdmin, { ...cmd, id: crypto.randomUUID() }),
  ).rejects.toThrow("잔액이 변경");
  expect(
    visibleChanges(
      [
        {
          section: "pointEntries",
          id: next.pointEntries[0].id,
          value: next.pointEntries[0],
        },
      ],
      {
        ...catalogAdmin,
        permissionLevel: "standard",
        permissions: { "money.read": false },
      },
    ),
  ).toEqual([]);
});
it("does not rewrite already promised benefit amounts when policy amounts change", async () => {
  const { state: s } = await receipt(fixture(), 5e6);
  s.policies[0].vip!.welcome = 900000;
  tick(s, "2026-02-01T00:00:00Z");
  expect(pointBalance(s, "vip")).toBe(100000);
});
it("combines balances on patient merge without duplicating first-VIP credit", async () => {
  let { state: s } = await receipt(fixture(), 5e6);
  ({ state: s } = await receipt(s, 5e6, "2026-02-01T00:00:00Z", "friend"));
  s = await applyCommand(
    s,
    catalogAdmin,
    command(
      "patient.merge",
      { targetId: "vip", targetRev: s.patients[0].rev, reason: "중복 환자" },
      "friend",
      s.patients[1].rev,
    ),
    "2026-02-02T00:00:00Z",
  );
  expect(pointBalance(s, "vip")).toBe(100000);
  expect(pointBalance(s, "friend")).toBe(0);
  expect(s.vipAccounts.filter((a) => !a.mergedInto)).toHaveLength(1);
});

it("recovers the first historical VIP threshold crossing, keeps permanent membership after a past refund, and starts benefits at rollout", async () => {
  let s = fixture();
  s.policies[0].vip!.enabled = false;
  const first = await receipt(s, 5e6, "2024-07-10T03:00:00Z");
  s = first.state;
  s = await applyCommand(
    s,
    catalogAdmin,
    command("ledger.create", {
      kind: "refund",
      consultationId: "c-vip",
      originalId: first.id,
      amount: 5e6,
      date: "2024-08-01",
      method: "카드",
      memo: "환불",
    }),
    "2024-08-01T03:00:00Z",
  );
  ({ state: s } = await receipt(s, 5e6, "2025-08-01T03:00:00Z"));
  s.policies[0].vip!.enabled = true;
  s.policies[0].vip!.startedAt = "2026-01-01T03:00:00Z";
  tick(s, "2026-01-01T03:00:00Z");
  const a = vipAccount(s, "vip")!;
  expect(a.enrolledAt).toBe("2024-07-10T03:00:00Z");
  expect(vipPeriod(a, "2026-01-01T03:00:00Z")).toEqual({
    from: "2025-07-10",
    to: "2026-07-10",
  });
  expect(pointBalance(s, "vip")).toBe(200000); // welcome + current annual period
  expect(
    s.pointEntries.some((e) => e.benefitKey?.startsWith("birthday:")),
  ).toBe(false);
  expect(
    s.pointEntries.filter((e) => e.benefitKey?.startsWith("annual:")),
  ).toHaveLength(1);
});
it("a permanent VIP still receives a new referral benefit after their own prior cash is refunded", async () => {
  const paid = await receipt(fixture(), 5e6);
  let s = await applyCommand(
    paid.state,
    catalogAdmin,
    command("ledger.create", {
      kind: "refund",
      consultationId: "c-vip",
      originalId: paid.id,
      amount: 5e6,
      date: "2026-02-01",
      method: "카드",
      memo: "환불",
    }),
    "2026-02-01T00:00:00Z",
  );
  s.patients[1].referredByPatientId = "vip";
  ({ state: s } = await receipt(s, 10000, "2026-02-02T00:00:00Z", "friend"));
  expect(pointBalance(s, "vip")).toBe(120000);
});
