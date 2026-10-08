import {
  availablePointBalance,
  addMonths,
  type PointAllocation,
  type PointCredit,
} from "./pointLedger";
import type { Base, Patient, State, Ledger } from "./model";

export interface VipPolicy {
  enabled: boolean;
  startedAt: string;
  minimumRevenue: number;
  welcome: number;
  birthday: number;
  annualThreshold: number;
  annualReward: number;
  referralReward: number;
  existingWelcome: boolean;
  annualMonths?: number;
  expiryMonths?: number;
}
export interface VipAccount extends Base {
  patientId: string;
  enrolledAt: string;
  baselineReceiptIds: string[];
  cardNumber: string;
  cardIssuedAt?: string;
  cardIssuedBy?: string;
  mergedInto?: string;
}
export interface PointEntry extends Base {
  patientId: string;
  amount: number;
  kind:
    | "grant"
    | "revoke"
    | "use"
    | "return"
    | "adjustment"
    | "correction"
    | "expiry";
  expiresAt?: string;
  periodFrom?: string;
  periodTo?: string;
  allocations?: PointAllocation[];
  creditParts?: PointCredit[];
  reason: string;
  actorId: string;
  benefitKey?: string;
  benefitAmount?: number;
  sourcePatientId?: string;
  consultationId?: string;
  ledgerId?: string;
  originalId?: string;
}
export const defaultVipPolicy: VipPolicy = {
  enabled: false,
  startedAt: "",
  minimumRevenue: 5_000_000,
  welcome: 100_000,
  birthday: 50_000,
  annualThreshold: 5_000_000,
  annualReward: 100_000,
  referralReward: 20_000,
  existingWelcome: true,
};
export const vipTerms = [
  "VIP 포인트는 그랜드아름다운의원에서 제공하는 회원 전용 혜택입니다.",
  "VIP 포인트는 본인에 한하여 사용할 수 있으며, 현금으로 교환하거나 타인에게 양도할 수 없습니다.",
  "포인트 사용 가능 항목 및 유효기간 등 세부 운영 기준은 병원 안내에 따릅니다.",
  "혜택은 병원 운영 정책에 따라 변경될 수 있습니다.",
];
export const vipPolicy = (s: State) => s.policies[0]?.vip || defaultVipPolicy;
export const seoulDay = (value: string) =>
  value.length === 10
    ? value
    : new Intl.DateTimeFormat("sv-SE", { timeZone: "Asia/Seoul" }).format(
        new Date(value),
      );
export function activeMoneyRows(s: Pick<State, "ledger">): Ledger[] {
  const reversed = new Set(
    s.ledger.filter((l) => l.kind === "reversal").map((l) => l.originalId),
  );
  return s.ledger.filter((l) => l.kind !== "reversal" && !reversed.has(l.id));
}
export function cashRevenue(
  s: State,
  patientId: string,
  at = new Date().toISOString(),
): number {
  return activeMoneyRows(s)
    .filter(
      (l) =>
        l.patientId === patientId &&
        l.tender !== "points" &&
        l.date <= seoulDay(at),
    )
    .reduce((n, l) => n + (l.kind === "receipt" ? l.amount : -l.amount), 0);
}
export const pointBalance = availablePointBalance;
export const vipAccount = (s: State, patientId: string) =>
  (s.vipAccounts || []).find((a) => a.patientId === patientId && !a.mergedInto);
/** The first actual cash threshold crossing establishes permanent membership.
 * Reversed records are corrections; subsequent refunds never erase an enrollment. */
export function firstVipQualification(
  s: State,
  patientId: string,
  at = new Date().toISOString(),
) {
  const rows = activeMoneyRows(s)
    .filter(
      (l) =>
        l.patientId === patientId &&
        l.tender !== "points" &&
        l.date <= seoulDay(at),
    )
    .sort(
      (a, b) =>
        a.date.localeCompare(b.date) ||
        a.createdAt.localeCompare(b.createdAt) ||
        (a.kind === b.kind
          ? a.id.localeCompare(b.id)
          : a.kind === "receipt"
            ? -1
            : 1),
    );
  const patient = s.patients.find((p) => p.id === patientId);
  const imported =
    patient?.external?.source === "vegas" && patient.createdAt <= at
      ? patient
      : undefined;
  // The imported balance establishes eligibility only. It is neither a receipt nor annual spend.
  const opening = imported?.external?.totalPaid || 0;
  if (imported && opening >= vipPolicy(s).minimumRevenue)
    return {
      enrolledAt: imported.createdAt,
      baselineReceiptIds: rows
        .filter(
          (r) => r.createdAt <= imported.createdAt && r.kind === "receipt",
        )
        .map((r) => r.id),
    };
  let net = opening;
  const baselineReceiptIds: string[] = [];
  for (const row of rows) {
    net += row.kind === "receipt" ? row.amount : -row.amount;
    if (row.kind === "receipt") baselineReceiptIds.push(row.id);
    if (net >= vipPolicy(s).minimumRevenue)
      return {
        enrolledAt:
          seoulDay(row.createdAt) === row.date
            ? row.createdAt
            : imported && row.date < seoulDay(imported.createdAt)
              ? imported.createdAt
              : row.date + "T00:00:00+09:00",
        baselineReceiptIds,
      };
  }
  return undefined;
}
export const vipEligible = (
  s: State,
  patient: Patient,
  at = new Date().toISOString(),
) =>
  !patient.archived &&
  !patient.mergedInto &&
  !!(vipAccount(s, patient.id) || firstVipQualification(s, patient.id, at));
function anniversary(date: string, year: number): string {
  const [_, month, day] = date.split("-").map(Number);
  const last = new Date(Date.UTC(year, month, 0)).getUTCDate();
  return `${year}-${String(month).padStart(2, "0")}-${String(Math.min(day, last)).padStart(2, "0")}`;
}
export function vipPeriod(
  account: Pick<VipAccount, "enrolledAt">,
  at: string,
  months = 12,
) {
  const joined = seoulDay(account.enrolledAt),
    day = seoulDay(at);
  const elapsed =
    (Number(day.slice(0, 4)) - Number(joined.slice(0, 4))) * 12 +
    Number(day.slice(5, 7)) -
    Number(joined.slice(5, 7));
  let index = Math.max(0, Math.floor(elapsed / months));
  if (addMonths(joined, index * months) > day) index = Math.max(0, index - 1);
  return {
    from: addMonths(joined, index * months),
    to: addMonths(joined, (index + 1) * months),
  };
}
export function annualCash(
  s: State,
  account: VipAccount,
  from: string,
  to: string,
  at = new Date().toISOString(),
): number {
  const active = activeMoneyRows(s).filter(
    (l) =>
      l.patientId === account.patientId &&
      l.tender !== "points" &&
      l.date <= seoulDay(at),
  );
  const receipts = active.filter(
    (l) =>
      l.kind === "receipt" &&
      l.date >= from &&
      l.date < to &&
      !account.baselineReceiptIds.includes(l.id),
  );
  const ids = new Set(receipts.map((l) => l.id));
  return (
    receipts.reduce((n, l) => n + l.amount, 0) -
    active
      .filter((l) => l.kind === "refund" && ids.has(l.originalId || ""))
      .reduce((n, l) => n + l.amount, 0)
  );
}
export const benefitLabel = (key: string) =>
  key === "welcome"
    ? "VIP 최초 승급"
    : key.startsWith("birthday:")
      ? "VIP 생일 축하"
      : key.startsWith("annual:")
        ? "VIP 연간 이용 달성"
        : "VIP 친구 소개";
/** Reconcile deterministic benefit keys, so alarm/command retries cannot pay twice. */
export function reconcileVip(
  s: State,
  now: string,
  operationId: string,
  actorId = "system-vip",
): void {
  const policy = vipPolicy(s);
  if (!policy.enabled) return;
  s.vipAccounts ||= [];
  s.pointEntries ||= [];
  const day = seoulDay(now);
  const cash = activeMoneyRows(s).filter(
    (l) => l.tender !== "points" && l.date <= day,
  );
  const candidates = s.patients.filter((p) => !p.archived && !p.mergedInto);
  for (const p of candidates) {
    const qualification = !vipAccount(s, p.id)
      ? firstVipQualification(s, p.id, now)
      : undefined;
    if (qualification) {
      s.vipAccounts.push({
        id: "vip-" + p.id,
        rev: 1,
        createdAt: now,
        updatedAt: now,
        patientId: p.id,
        ...qualification,
        cardNumber: "VIP-" + (p.number || p.id).toUpperCase(),
      });
    }
  }
  let index = 0;
  for (const account of s.vipAccounts.filter((a) => !a.mergedInto)) {
    const patient = s.patients.find((p) => p.id === account.patientId);
    if (!patient || patient.archived || patient.mergedInto) continue;
    const eligible = vipEligible(s, patient, now);
    const desired = new Map<
      string,
      { amount: number; sourcePatientId?: string }
    >();
    const add = (key: string, amount: number, sourcePatientId?: string) =>
      desired.set(key, { amount, sourcePatientId });
    if (
      eligible &&
      (policy.existingWelcome || patient.createdAt >= policy.startedAt)
    )
      add("welcome", policy.welcome);
    const start = seoulDay(account.enrolledAt);
    const benefitsStart = seoulDay(policy.startedAt || account.createdAt);
    for (
      let year = Math.max(
        Number(start.slice(0, 4)),
        Number(benefitsStart.slice(0, 4)) - 1,
      );
      year <= Number(day.slice(0, 4));
      year++
    ) {
      const birthday = anniversary(patient.dob, year);
      if (birthday >= start && birthday >= benefitsStart && birthday <= day)
        add("birthday:" + year, policy.birthday);
    }
    const periodMonths = policy.annualMonths || 12;
    for (
      let offset = 0;
      addMonths(start, offset) <= day;
      offset += periodMonths
    ) {
      const from = addMonths(start, offset),
        to = addMonths(start, offset + periodMonths);
      if (
        to > benefitsStart &&
        !s.pointEntries.some(
          (e) =>
            e.patientId === patient.id &&
            e.kind === "grant" &&
            e.benefitKey?.startsWith("annual:") &&
            e.benefitKey !== "annual:" + from &&
            (e.periodFrom || e.benefitKey.slice(7)) < to &&
            (e.periodTo || addMonths(e.benefitKey.slice(7), 12)) > from,
        ) &&
        annualCash(s, account, from, to, now) >= policy.annualThreshold
      )
        add("annual:" + from, policy.annualReward);
    }
    for (const referred of s.patients.filter(
      (p) =>
        !p.mergedInto &&
        p.referredByPatientId === patient.id &&
        p.id !== patient.id,
    )) {
      const receipts = cash
        .filter((l) => l.patientId === referred.id && l.kind === "receipt")
        .sort(
          (a, b) =>
            a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id),
        );
      const first = receipts[0];
      const net = cash
        .filter((l) => l.patientId === referred.id)
        .reduce((n, l) => n + (l.kind === "receipt" ? l.amount : -l.amount), 0);
      if (
        first &&
        first.createdAt >= account.enrolledAt &&
        first.date >= benefitsStart &&
        net > 0 &&
        !s.pointEntries.some(
          (e) =>
            e.patientId === patient.id &&
            e.sourcePatientId === referred.id &&
            e.kind === "grant" &&
            e.benefitKey !== "referral:" + referred.id,
        )
      )
        add("referral:" + referred.id, policy.referralReward, referred.id);
    }
    const prior = s.pointEntries.filter(
      (e) => e.patientId === patient.id && e.benefitKey,
    );
    const keys = new Set([
      ...desired.keys(),
      ...prior.map((e) => e.benefitKey!),
    ]);
    for (const key of keys) {
      const rows = prior.filter((e) => e.benefitKey === key);
      const current = rows.reduce((n, e) => n + e.amount, 0),
        rule = desired.get(key);
      const original = rows.find((e) => e.kind === "grant");
      // Retain the amount originally promised when policy amounts later change.
      const target = rule ? (original?.benefitAmount ?? rule.amount) : current;
      const amount = target - current;
      if (!amount) continue;
      s.pointEntries.push({
        id: operationId + "-point-" + index++,
        rev: 1,
        createdAt: now,
        updatedAt: now,
        patientId: patient.id,
        amount,
        kind: amount > 0 ? "grant" : "revoke",
        reason:
          benefitLabel(key) + (amount < 0 ? " · 환자 병합 중복 적립 정리" : ""),
        actorId,
        benefitKey: key,
        ...(key.startsWith("annual:")
          ? {
              periodFrom: key.slice(7),
              periodTo: addMonths(key.slice(7), policy.annualMonths || 12),
            }
          : {}),
        ...(amount > 0 && policy.expiryMonths
          ? { expiresAt: addMonths(day, policy.expiryMonths) }
          : {}),
        benefitAmount:
          original?.benefitAmount ?? rule?.amount ?? Math.max(current, 0),
        sourcePatientId: rule?.sourcePatientId || original?.sourcePatientId,
      });
    }
  }
}
