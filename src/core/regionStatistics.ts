import cities from "../data/regionCities.json";
import { isMissingComparisonValue } from "./analyticsComparison";
export type RegionCount = { name: string; count: number };
export const regionCityCodes: Record<string, string> = cities;
const provinces = [...new Set(Object.keys(cities).map((n) => n.split(" ")[0]))];
const cityNames = Object.keys(cities).sort((a, b) => b.length - a.length);
const provinceAliases: Record<string, string> = {
  서울: "서울특별시",
  부산: "부산광역시",
  대구: "대구광역시",
  인천: "인천광역시",
  광주: "광주광역시",
  대전: "대전광역시",
  울산: "울산광역시",
  세종: "세종특별자치시",
  경기: "경기도",
  강원: "강원특별자치도",
  강원도: "강원특별자치도",
  전북: "전북특별자치도",
  전라북도: "전북특별자치도",
  전남: "전라남도",
  경북: "경상북도",
  경남: "경상남도",
  충북: "충청북도",
  충남: "충청남도",
  제주: "제주특별자치도",
  제주도: "제주특별자치도",
};
/** Canonicalize aggregate labels too: old index rows need no patient scan/rewrite.
 * Only confirmed one-legal-dong mappings: never strip digits nationwide (종로1가 etc.).
 * Chuncheon: https://bomnae.chuncheon.go.kr/upload/webzine/446/224-28c4797e682d.pdf
 * https://www.chuncheon.go.kr/village/hupyeong3-dong/intro/administrative-districts/
 */
export function canonicalRegionLabel(value: string) {
  let s = value.normalize("NFKC").replace(/\s+/g, " ").trim();
  const parts = s.split(" ");
  if (provinceAliases[parts[0]]) {
    parts[0] = provinceAliases[parts[0]];
    s = parts.join(" ");
  }
  if (
    !provinces.includes(parts[0]) &&
    !isMissingComparisonValue(s) &&
    !s.startsWith("기타")
  ) {
    const candidates = cityNames.filter(
      (n) =>
        s === n.slice(n.indexOf(" ") + 1) ||
        s.startsWith(n.slice(n.indexOf(" ") + 1) + " "),
    );
    const ps = [...new Set(candidates.map((n) => n.split(" ")[0]))];
    if (ps.length === 1) s = ps[0] + " " + s;
  }
  return s.replace(
    /^(강원특별자치도 춘천시) (후평|효자)\s*[123]\s*동$/,
    "$1 $2동",
  );
}
export function mergeRegionCounts(rows: readonly RegionCount[]): RegionCount[] {
  const counts = new Map<string, number>();
  for (const r of rows) {
    const name = canonicalRegionLabel(r.name);
    counts.set(name, (counts.get(name) || 0) + r.count);
  }
  return [...counts]
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name, "ko"));
}
export function regionParts(value: string) {
  const name = canonicalRegionLabel(value);
  if (isMissingComparisonValue(name) || name.startsWith("기타")) return;
  const province = provinces.find(
    (p) => name === p || name.startsWith(p + " "),
  );
  if (!province) return;
  const city = cityNames.find((c) => name === c || name.startsWith(c + " "));
  // Preserve a known province even if boundaries have changed since the map release.
  return {
    name,
    province,
    city: city || "",
    neighborhood: city ? name.slice(city.length).trim() : "",
  };
}
export function regionCatchment(name: string) {
  const r = regionParts(name);
  if (!r) return "지역 확인 필요";
  if (r.city === "강원특별자치도 춘천시") return "춘천시";
  if (r.province === "강원특별자치도") return "강원 타지역";
  if (["서울특별시", "경기도"].includes(r.province)) return "서울·경기";
  return "그 외 지역";
}
export function regionBreakdown(
  rows: readonly RegionCount[],
  level: "province" | "city" | "catchment",
  within = "",
) {
  const counts = new Map<string, number>();
  for (const row of rows) {
    if (within && !canonicalRegionLabel(row.name).startsWith(within + " "))
      continue;
    const p = regionParts(row.name);
    if (!p) continue;
    const name = level === "catchment" ? regionCatchment(row.name) : p[level];
    if (name) counts.set(name, (counts.get(name) || 0) + row.count);
  }
  return [...counts]
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name, "ko"));
}
export function compactRegionDonut(rows: RegionCount[], limit = 7) {
  return rows.length <= limit
    ? rows
    : [
        ...rows.slice(0, limit),
        {
          name: "그 외 지역",
          count: rows.slice(limit).reduce((n, r) => n + r.count, 0),
        },
      ];
}
