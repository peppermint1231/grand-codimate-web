type RegionCount = { name: string; count: number };
const gangwon = new Set(
  "원주시 강릉시 동해시 태백시 속초시 삼척시 홍천군 횡성군 영월군 평창군 정선군 철원군 화천군 양구군 인제군 고성군 양양군".split(
    " ",
  ),
);
const gyeonggi = new Set(
  "수원시 성남시 고양시 용인시 부천시 안산시 안양시 남양주시 화성시 평택시 의정부시 시흥시 파주시 광명시 김포시 군포시 광주시 이천시 양주시 오산시 구리시 안성시 포천시 의왕시 하남시 여주시 동두천시 과천시 가평군 양평군 연천군".split(
    " ",
  ),
);

/** Display grouping only: retain detailed stored regions for later filtering. */
export function groupSmallPatientRegions(rows: RegionCount[]): RegionCount[] {
  const counts = new Map<string, number>();
  for (const row of rows)
    counts.set(row.name, (counts.get(row.name) || 0) + row.count);
  const grouped = new Map<string, number>();
  for (const [name, count] of counts) {
    let label = name;
    if (count < 100 && !/미입력|누락|확인 필요|미분류/.test(name)) {
      const first = name.trim().split(/\s+/)[0];
      if (/(^|\s)춘천시(?:\s|$)/.test(name)) label = "기타 춘천지역";
      else if (
        /^강원(?:특별자치도|도)?(?:\s|$)/.test(name) ||
        gangwon.has(first)
      )
        label = "기타 강원도";
      else if (
        /^(?:서울(?:특별시)?|경기(?:도)?)(?:\s|$)/.test(name) ||
        gyeonggi.has(first)
      )
        label = "기타 서울경기";
      else label = "기타 지방지역";
    }
    grouped.set(label, (grouped.get(label) || 0) + count);
  }
  return [...grouped]
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name, "ko"));
}
