import type { State } from "./model";
export interface PointAllocation {
  entryId: string;
  amount: number;
}
export interface PointCredit {
  amount: number;
  expiresAt?: string;
}
export const pointDay = (at = new Date().toISOString()) =>
  new Intl.DateTimeFormat("sv-SE", { timeZone: "Asia/Seoul" }).format(
    new Date(at.length === 10 ? at + "T00:00:00+09:00" : at),
  );
export function addMonths(day: string, months: number) {
  const [y, m, d] = day.slice(0, 10).split("-").map(Number),
    date = new Date(Date.UTC(y, m - 1 + months, 1));
  date.setUTCDate(
    Math.min(
      d,
      new Date(
        Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 0),
      ).getUTCDate(),
    ),
  );
  return date.toISOString().slice(0, 10);
}
export function pointLots(s: State, patientId: string) {
  const lots: { entryId: string; amount: number; expiresAt?: string }[] = [];
  let debt = 0;
  for (const e of (s.pointEntries || [])
    .filter((e) => e.patientId === patientId)
    .slice()
    .sort(
      (a, b) =>
        a.createdAt.localeCompare(b.createdAt) ||
        (a.amount > 0 ? 0 : 1) - (b.amount > 0 ? 0 : 1) ||
        a.id.localeCompare(b.id),
    )) {
    if (e.amount > 0) {
      const parts = e.creditParts || [
        { amount: e.amount, expiresAt: e.expiresAt },
      ];
      parts.forEach((part, i) => {
        const paid = Math.min(debt, part.amount);
        debt -= paid;
        lots.push({
          entryId: e.creditParts ? `${e.id}:${i}` : e.id,
          amount: part.amount - paid,
          expiresAt: part.expiresAt,
        });
      });
    } else {
      let remaining = -e.amount;
      for (const a of e.allocations || []) {
        const lot = lots.find((x) => x.entryId === a.entryId);
        if (lot) {
          const used = Math.min(lot.amount, a.amount, remaining);
          lot.amount -= used;
          remaining -= used;
        }
      }
      if (!e.allocations)
        for (const lot of lots
          .slice()
          .sort((a, b) =>
            (a.expiresAt || "9999").localeCompare(b.expiresAt || "9999"),
          )) {
          const used = Math.min(lot.amount, remaining);
          lot.amount -= used;
          remaining -= used;
        }
      debt += remaining;
    }
  }
  // Equal timestamps may place a new credit before its preceding adjustment.
  // Settle any remaining debt against those credits before computing expiry.
  for (const lot of lots) {
    const settled = Math.min(debt, lot.amount);
    lot.amount -= settled;
    debt -= settled;
  }
  return { lots, debt };
}
export function availablePointBalance(
  s: State,
  patientId: string,
  at?: string,
) {
  const { lots, debt } = pointLots(s, patientId),
    day = pointDay(at);
  return (
    lots
      .filter((l) => !l.expiresAt || l.expiresAt >= day)
      .reduce((n, l) => n + l.amount, 0) - debt
  );
}
export function pointAllocations(
  s: State,
  patientId: string,
  amount: number,
  at?: string,
): PointAllocation[] {
  let left = amount;
  return pointLots(s, patientId)
    .lots.filter(
      (l) => l.amount > 0 && (!l.expiresAt || l.expiresAt >= pointDay(at)),
    )
    .sort((a, b) =>
      (a.expiresAt || "9999").localeCompare(b.expiresAt || "9999"),
    )
    .flatMap((l) => {
      const used = Math.min(left, l.amount);
      left -= used;
      return used ? [{ entryId: l.entryId, amount: used }] : [];
    });
}
export function refundPointCredits(
  s: State,
  pointEntryId: string | undefined,
  amount: number,
  alreadyReturned: number,
): PointCredit[] {
  const original = s.pointEntries.find((e) => e.id === pointEntryId);
  if (!original?.allocations) return [{ amount }];
  let skip = alreadyReturned,
    left = amount;
  const credits: PointCredit[] = [];
  for (const a of original.allocations) {
    const skipped = Math.min(skip, a.amount);
    skip -= skipped;
    const take = Math.min(left, a.amount - skipped);
    if (!take) continue;
    left -= take;
    const lot = pointLots(s, original.patientId).lots.find(
      (l) => l.entryId === a.entryId,
    );
    credits.push({ amount: take, expiresAt: lot?.expiresAt });
  }
  if (left) credits.push({ amount: left });
  return credits;
}
export function expirePoints(s: State, now: string, operationId: string) {
  let index = s.pointEntries.filter((e) =>
    e.id.startsWith(operationId + "-expire-"),
  ).length;
  for (const patientId of new Set(
    (s.pointEntries || []).map((e) => e.patientId),
  ))
    for (const lot of pointLots(s, patientId).lots.filter(
      (l) => l.amount > 0 && l.expiresAt && l.expiresAt < pointDay(now),
    ))
      s.pointEntries.push({
        id: operationId + "-expire-" + index++,
        rev: 1,
        createdAt: now,
        updatedAt: now,
        patientId,
        amount: -lot.amount,
        kind: "expiry",
        reason: "포인트 유효기간 만료",
        actorId: "system-points",
        allocations: [{ entryId: lot.entryId, amount: lot.amount }],
      });
}
