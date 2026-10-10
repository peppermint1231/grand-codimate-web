import { isMissingComparisonValue } from "./analyticsComparison";
const labels = new Map([
  ["네이버검색광고", "네이버 검색"],
  ["네이버플레이스", "네이버 검색"],
  ["네이버검색", "네이버 검색"],
  ["네이버예약", "네이버 예약"],
  ["네이버블로그", "네이버 블로그"],
  ["지인소개", "지인 소개"],
  ["현장방문", "현장 방문"],
  ["병원인근", "병원 인근"],
  ["기존환자", "재방문"],
  ["확인필요", "확인 필요"],
  ["없음", "현장 방문"],
  ["카카오", "기타"],
]);

/** Statistical label only; original intake/patient answers remain unchanged. */
export function acquisitionSourceLabels(value?: string) {
  const parts = (value || "")
    .normalize("NFKC")
    .split(/[,·]/u)
    .map((part) => part.replace(/[\s\u200b-\u200d\ufeff]+/gu, ""))
    .filter(Boolean)
    .map((key) => labels.get(key) || key);
  const unique = [...new Set(parts)].sort((a, b) => a.localeCompare(b, "ko"));
  const known = unique.filter((n) => !isMissingComparisonValue(n));
  return known.length ? known : [unique[0] || "미입력"];
}
export function acquisitionSourceLabel(value?: string) {
  return acquisitionSourceLabels(value).join(" · ");
}
/** Disjoint respondent buckets in; multi-response channel counts out. */
export function acquisitionSourceSummary(
  rows: readonly { name: string; count: number }[],
) {
  const counts = new Map<string, number>();
  let respondents = 0;
  for (const row of rows) {
    const names = acquisitionSourceLabels(row.name);
    if (names.some((n) => !isMissingComparisonValue(n)))
      respondents += row.count;
    for (const name of names)
      counts.set(name, (counts.get(name) || 0) + row.count);
  }
  return {
    respondents,
    rows: [...counts]
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name, "ko")),
  };
}
