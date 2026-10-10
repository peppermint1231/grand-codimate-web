// Chuncheon city maps and city digital archive place-name index:
// https://www.chuncheon.go.kr/cityhall/about-chuncheon/introduction/administrative-map/eup-myeon-dong/
// https://cc-archives.or.kr/kr/locations/view.php?idx=321
const chuncheonAreas = new Set(
  "신북읍 동면 동산면 신동면 동내면 남면 남산면 서면 사북면 북산면 소양동 교동 조운동 약사명동 근화동 후평동 후평1동 후평2동 후평3동 효자동 효자1동 효자2동 효자3동 석사동 퇴계동 강남동 신사우동 봉의동 요선동 낙원동 중앙로1가 중앙로2가 중앙로3가 소양로1가 소양로2가 소양로3가 소양로4가 온의동 조양동 죽림동 운교동 약사동 우두동 사농동 삼천동 칠전동 송암동 신동 중도동 상중도동 옥천동".split(
    " ",
  ),
);
const gangwonCities = new Set(
  "춘천시 원주시 강릉시 동해시 태백시 속초시 삼척시 홍천군 횡성군 영월군 평창군 정선군 철원군 화천군 양구군 인제군 고성군 양양군".split(
    " ",
  ),
);
/** A road name alone never identifies a neighbourhood: roads may cross boundaries. */
export interface AddressRegion {
  sido: string;
  sigungu: string;
  neighborhood: string;
  basis: "search" | "source-text" | "confirmed-map";
}
export function normalizeRegionAddress(address: string) {
  return address
    .normalize("NFKC")
    .replace(/^\s*[[(]?\d{3}-?\d{3}[\])]?(?:\s+|(?=[가-힣]))/, "")
    .replace(/^\s*[[(]?\d{5}[\])]?(?:\s+|(?=[가-힣]))/, "")
    .replace(
      new RegExp(
        "^(강원특별자치도|강원도|강원)?\\s*춘천(?:시(?=\\s|[가-힣]|$)|(?=\\s|" +
          [...chuncheonAreas].join("|") +
          "|$))",
      ),
      "강원특별자치도 춘천시 ",
    )
    .replace(/(강원특별자치도|강원도|춘천시)(?=[가-힣])/g, "$1 ")
    .replace(/후평\s+([123])\s*동/g, "후평$1동")
    .replace(/효자\s+([123])\s*동/g, "효자$1동")
    .replace(/\s+/g, " ")
    .trim();
}
export function regionFromAddress(
  address: string,
  defaultCity = "춘천시",
): AddressRegion | undefined {
  const text = normalizeRegionAddress(address);
  if (!text) return;
  const sido =
    text.match(
      /^(서울(?:특별시)?|부산(?:광역시)?|대구(?:광역시)?|인천(?:광역시)?|광주(?:광역시)?|대전(?:광역시)?|울산(?:광역시)?|세종(?:특별자치시)?|경기(?:도)?|강원(?:특별자치도|도)?|충청[남북]도|전라[남북]도|전북특별자치도|경상[남북]도|제주(?:특별자치도|도)?)(?=\s|$)/,
    )?.[1] || "";
  const rest = text.slice(sido.length).trim();
  let sigungu =
    rest.match(/^([가-힣]+[시군구](?:\s+[가-힣]+구)?)(?=\s|$)/)?.[1] || "";
  if (!sigungu && (!sido || sido.startsWith("강원"))) sigungu = defaultCity;
  // Prefer explicit parenthesized legal neighbourhoods in road addresses.
  const parenthesized = text.match(
    /\(\s*([가-힣][가-힣0-9·.]*동)(?=\s|,|\))/,
  )?.[1];
  let neighborhood =
    parenthesized ||
    rest
      .replace(/^([가-힣]+[시군구](?:\s+[가-힣]+구)?)\s+/, "")
      .match(
        /^([가-힣][가-힣0-9·.]{0,7}?[동읍면]|[가-힣]{1,5}\d*가)(?=\s|\d|[(),]|$)/,
      )?.[1];
  if (sigungu === "춘천시" && !parenthesized) {
    const local = rest.replace(/^춘천시?\s*/, "");
    const known = [...chuncheonAreas]
      .sort((a, b) => b.length - a.length)
      .find(
        (n) =>
          local.startsWith(n) &&
          !/^[로길]/.test(local.slice(n.length)),
      );
    if (known) neighborhood = known;
  }
  if (!neighborhood || (!sigungu && !sido.startsWith("세종"))) return;
  if (sigungu === "춘천시" && !chuncheonAreas.has(neighborhood)) return;
  if (/아파트|빌라|주공|빌딩/.test(neighborhood)) return;
  const normalizedSido =
    (!sido && gangwonCities.has(sigungu)) || sido.startsWith("강원")
      ? "강원특별자치도"
      : sido.startsWith("서울")
        ? "서울특별시"
        : sido === "경기"
          ? "경기도"
          : (
              {
                부산: "부산광역시",
                대구: "대구광역시",
                인천: "인천광역시",
                광주: "광주광역시",
                대전: "대전광역시",
                울산: "울산광역시",
                세종: "세종특별자치시",
                전라북도: "전북특별자치도",
              } as Record<string, string>
            )[sido] || sido;
  return { sido: normalizedSido, sigungu, neighborhood, basis: "source-text" };
}
export function regionLabel(patient: {
  address: string;
  addressRegion?: AddressRegion;
}) {
  const r = patient.addressRegion || regionFromAddress(patient.address);
  return r
    ? [r.sido, r.sigungu, r.neighborhood].filter(Boolean).join(" ")
    : patient.address.trim()
      ? "주소 확인 필요"
      : "주소 미입력";
}
export function directoryRegions(
  patients: Iterable<{
    address: string;
    addressRegion?: AddressRegion;
    archived?: boolean;
    mergedInto?: string;
    external?: unknown;
    id?: string;
  }>,
) {
  const counts = new Map<string, number>();
  let total = 0,
    imported = 0;
  for (const p of patients) {
    if (p.archived || p.mergedInto) continue;
    total++;
    if (p.external || p.id?.startsWith("vegas-")) imported++;
    const name = regionLabel(p);
    counts.set(name, (counts.get(name) || 0) + 1);
  }
  return {
    total,
    imported,
    regions: [
      ...[...counts].filter(
        ([name]) => name !== "주소 확인 필요" && name !== "주소 미입력",
      ),
      ...(counts.has("주소 확인 필요") || counts.has("주소 미입력")
        ? [
            [
              "지역 누락",
              (counts.get("주소 확인 필요") || 0) +
                (counts.get("주소 미입력") || 0),
            ] as [string, number],
          ]
        : []),
    ]
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => b.count - a.count),
    unresolved: counts.get("주소 확인 필요") || 0,
    missing: counts.get("주소 미입력") || 0,
  };
}
