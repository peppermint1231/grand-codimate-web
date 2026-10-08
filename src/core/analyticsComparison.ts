import type { Bucket } from "./analytics";

/** Missing values remain in population totals, but never set a chart's scale or denominator. */
export function isMissingComparisonValue(name: string) {
  return (
    /^(?:(?:주소|지역|연령|성별|횟수|최근일|유입경로|상품|카테고리|등급)\s*)?(?:미입력|확인\s*필요|미선택|미분류|누락)$/.test(
      name.trim(),
    ) || name.trim() === "수납액 없음·미입력"
  );
}
export function comparisonBuckets(rows: Bucket[]) {
  const included = rows.filter((r) => !isMissingComparisonValue(r.name));
  const excluded = rows.filter((r) => isMissingComparisonValue(r.name));
  return {
    included,
    excluded,
    total: included.reduce((sum, r) => sum + r.count, 0),
    excludedTotal: excluded.reduce((sum, r) => sum + r.count, 0),
  };
}
