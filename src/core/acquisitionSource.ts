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
]);

/** Statistical label only; original intake/patient answers remain unchanged. */
export function acquisitionSourceLabel(value?: string) {
  const parts = (value || "")
    .normalize("NFKC")
    .split(/[,·]/u)
    .map((part) => part.replace(/[\s\u200b-\u200d\ufeff]+/gu, ""))
    .filter(Boolean)
    .map((key) => labels.get(key) || key);
  return (
    [...new Set(parts)].sort((a, b) => a.localeCompare(b, "ko")).join(" · ") ||
    "미입력"
  );
}
