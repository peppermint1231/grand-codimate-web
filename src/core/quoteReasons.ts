import type { Consultation } from "./model";
export function topQuoteReasons(consultations: Consultation[]) {
  const counts = new Map<string, number>();
  for (const c of consultations) {
    // A reason counts once per consultation: memo saves must not inflate usage.
    const reasons = new Set(
      [...(c.priceReasonHistory || []), c.quote.reason]
        .map((r) =>
          String(r || "")
            .trim()
            .replace(/\s+/g, " "),
        )
        .filter(Boolean),
    );
    for (const reason of reasons)
      counts.set(reason, (counts.get(reason) || 0) + 1);
  }
  return [...counts]
    .map(([reason, count]) => ({ reason, count }))
    .sort((a, b) => b.count - a.count || a.reason.localeCompare(b.reason, "ko"))
    .slice(0, 10);
}
