import { expect, it } from "vitest";
import { groupSmallPatientRegions } from "../server/patientRegionGroups";

it("groups fewer than 100 patients by the requested geography, retaining boundaries, unknowns and totals", () => {
  const rows = [
    { name: "강원특별자치도 춘천시 석사동", count: 100 },
    { name: "강원특별자치도 춘천시 교동", count: 99 },
    { name: "강원도 춘천시 소양동", count: 2 },
    { name: "강원특별자치도 원주시 단계동", count: 20 },
    { name: "홍천군 홍천읍", count: 3 },
    { name: "서울특별시 강남구 역삼동", count: 7 },
    { name: "경기도 성남시 분당구 정자동", count: 8 },
    { name: "광주시 경안동", count: 4 },
    { name: "광주광역시 북구 용봉동", count: 5 },
    { name: "인천광역시 부평구 부평동", count: 6 },
    { name: "지역 누락", count: 9 },
    { name: "주소 확인 필요", count: 1 },
  ];
  const result = groupSmallPatientRegions(rows);
  expect(result).toEqual(
    expect.arrayContaining([
      { name: "강원특별자치도 춘천시 석사동", count: 100 },
      { name: "기타 춘천지역", count: 101 },
      { name: "기타 강원도", count: 23 },
      { name: "기타 서울경기", count: 19 },
      { name: "기타 지방지역", count: 11 },
      { name: "지역 누락", count: 9 },
      { name: "주소 확인 필요", count: 1 },
    ]),
  );
  expect(result.reduce((n, r) => n + r.count, 0)).toBe(
    rows.reduce((n, r) => n + r.count, 0),
  );
  expect(rows[1].name).toBe("강원특별자치도 춘천시 교동");
});

it("combines the same region before applying the threshold and omits empty synthetic groups", () => {
  const name = "강원특별자치도 춘천시 교동";
  expect(
    groupSmallPatientRegions([
      { name, count: 60 },
      { name, count: 40 },
    ]),
  ).toEqual([{ name, count: 100 }]);
  expect(groupSmallPatientRegions([])).toEqual([]);
});
