import { z } from "zod";
import type { Base, Grade, State } from "./model";
import {
  activeMoneyRows,
  annualCash,
  cashRevenue,
  seoulDay,
  vipAccount,
  vipPeriod,
} from "./vipPoints";
import { addMonths, expirePoints } from "./pointLedger";
const points = z.number().int().min(0).max(1_000_000_000);
export const gradeBenefitsSchema = z.object({
  enabled: z.boolean(),
  welcome: points,
  birthday: points,
  annualThreshold: points.refine((v) => v > 0),
  annualReward: points,
  referralReward: points,
  annualMonths: z.number().int().min(1).max(120),
  expiryMonths: z.number().int().min(0).max(120),
  description: z.string().max(3000).default(""),
});
export type GradeBenefits = z.infer<typeof gradeBenefitsSchema>;
export const defaultGradeBenefits: GradeBenefits = {
  enabled: false,
  welcome: 0,
  birthday: 0,
  annualThreshold: 5000000,
  annualReward: 0,
  referralReward: 0,
  annualMonths: 12,
  expiryMonths: 0,
  description: "",
};
export interface BenefitAccount extends Base {
  patientId: string;
  gradeId: string;
  enrolledAt: string;
  baselineReceiptIds: string[];
  activeSince?: string;
  mergedInto?: string;
}
export function benefitSettings(s: State, g: Grade): GradeBenefits {
  if (g.name.toUpperCase() === "VIP" && s.policies[0]?.vip) {
    const v = s.policies[0].vip;
    return {
      ...defaultGradeBenefits,
      ...g.benefits,
      ...v,
      annualMonths: v.annualMonths || 12,
      expiryMonths: v.expiryMonths || 0,
    };
  }
  return { ...defaultGradeBenefits, ...g.benefits };
}
export function currentBenefitGrade(s: State, patientId: string, now: string) {
  const p = s.patients.find((p) => p.id === patientId);
  if (!p || p.archived || p.mergedInto) return;
  const grades = s.policies[0]?.grades || [],
    r = cashRevenue(s, patientId, now),
    vip =
      vipAccount(s, patientId) &&
      grades.find((g) => g.name.toUpperCase() === "VIP");
  const manual = grades.find((g) => g.id === p.gradeOverride?.gradeId);
  if (manual && (!vip || manual.minimum >= vip.minimum)) return manual;
  const g = grades
    .slice()
    .sort((a, b) => b.minimum - a.minimum)
    .find((g) => g.minimum <= r);
  return vip && (!g || g.minimum < vip.minimum) ? vip : g;
}
export function reconcileGradeBenefits(
  s: State,
  now: string,
  operationId: string,
) {
  s.benefitAccounts ||= [];
  const today = seoulDay(now),
    cash = activeMoneyRows(s).filter(
      (l) => l.tender !== "points" && l.date <= today,
    );
  let index = 0;
  for (const p of s.patients.filter((p) => !p.archived && !p.mergedInto)) {
    const grade = currentBenefitGrade(s, p.id, now);
    for (const old of s.benefitAccounts.filter(
      (a) =>
        a.patientId === p.id &&
        !a.mergedInto &&
        a.activeSince &&
        a.gradeId !== grade?.id,
    )) {
      old.activeSince = undefined;
      old.rev++;
      old.updatedAt = now;
    }
    if (
      !grade ||
      grade.name.toUpperCase() === "VIP" ||
      !grade.benefits?.enabled
    )
      continue;
    const policy = benefitSettings(s, grade);
    let account = s.benefitAccounts.find(
      (a) => a.patientId === p.id && a.gradeId === grade.id && !a.mergedInto,
    );
    if (!account) {
      account = {
        id: `grade-${grade.id}-${p.id}`,
        rev: 1,
        createdAt: now,
        updatedAt: now,
        patientId: p.id,
        gradeId: grade.id,
        enrolledAt: now,
        activeSince: now,
        baselineReceiptIds: cash
          .filter((l) => l.patientId === p.id && l.kind === "receipt")
          .map((l) => l.id),
      };
      s.benefitAccounts.push(account);
    }
    if (!account.activeSince) {
      account.activeSince = now;
      account.rev++;
      account.updatedAt = now;
    }
    const grant = (
      key: string,
      amount: number,
      label: string,
      sourcePatientId?: string,
    ) => {
      const benefitKey = `grade:${grade.id}:${key}`;
      if (
        amount <= 0 ||
        s.pointEntries.some(
          (e) => e.patientId === p.id && e.benefitKey === benefitKey,
        )
      )
        return;
      s.pointEntries.push({
        id: operationId + "-grade-point-" + index++,
        rev: 1,
        createdAt: now,
        updatedAt: now,
        patientId: p.id,
        amount,
        kind: "grant",
        reason: `${grade.name} ${label}`,
        actorId: "system-points",
        benefitKey,
        benefitAmount: amount,
        sourcePatientId,
        ...(key.startsWith("period:")
          ? {
              periodFrom: key.slice(7),
              periodTo: addMonths(key.slice(7), policy.annualMonths),
            }
          : {}),
        ...(policy.expiryMonths
          ? { expiresAt: addMonths(today, policy.expiryMonths) }
          : {}),
      });
    };
    grant("welcome", policy.welcome, "최초 등급 혜택");
    for (
      let year = Number(account.activeSince.slice(0, 4));
      year <= Number(today.slice(0, 4));
      year++
    ) {
      const month = Number(p.dob.slice(5, 7)),
        day = Math.min(
          Number(p.dob.slice(8, 10)),
          new Date(Date.UTC(year, month, 0)).getUTCDate(),
        );
      const birthday = `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
      if (birthday >= seoulDay(account.activeSince) && birthday <= today)
        grant("birthday:" + year, policy.birthday, "생일 축하");
    }
    const period = vipPeriod(account, now, policy.annualMonths);
    if (
      !s.pointEntries.some(
        (e) =>
          e.patientId === p.id &&
          e.kind === "grant" &&
          e.benefitKey?.startsWith(`grade:${grade.id}:period:`) &&
          e.benefitKey !== `grade:${grade.id}:period:${period.from}` &&
          e.periodFrom &&
          e.periodTo &&
          e.periodFrom < period.to &&
          e.periodTo > period.from,
      ) &&
      annualCash(
        s,
        { ...account, cardNumber: "" },
        period.from,
        period.to,
        now,
      ) >= policy.annualThreshold
    )
      grant(
        "period:" + period.from,
        policy.annualReward,
        `${policy.annualMonths}개월 이용 달성`,
      );
    for (const referred of s.patients.filter(
      (x) => !x.mergedInto && x.referredByPatientId === p.id,
    )) {
      const first = cash
        .filter((l) => l.patientId === referred.id && l.kind === "receipt")
        .sort((a, b) => a.createdAt.localeCompare(b.createdAt))[0];
      if (
        first &&
        first.createdAt >= account.activeSince &&
        cashRevenue(s, referred.id, now) > 0 &&
        !s.pointEntries.some(
          (e) =>
            e.patientId === p.id &&
            e.sourcePatientId === referred.id &&
            e.kind === "grant",
        )
      )
        grant(
          "referral:" + referred.id,
          policy.referralReward,
          "친구 소개",
          referred.id,
        );
    }
  }
  expirePoints(s, now, operationId);
}
