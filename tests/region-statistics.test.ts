import { expect, it } from "vitest";
import {
  canonicalRegionLabel,
  mergeRegionCounts,
  regionBreakdown,
  regionCityCodes,
} from "../src/core/regionStatistics";
import { regionLabel } from "../src/core/addressRegion";
import { groupSmallPatientRegions } from "../server/patientRegionGroups";
import { readFileSync, readdirSync } from "node:fs";
it("unifies confirmed legal-dong labels across road lookup, legacy administrative dongs and province aliases without deleting valid digits", () => {
  for (const n of ["후평1동", "후평2동", "후평3동", "후평 2 동"])
    expect(canonicalRegionLabel("강원도 춘천시 " + n)).toBe(
      "강원특별자치도 춘천시 후평동",
    );
  for (const n of ["효자1동", "효자2동", "효자3동"])
    expect(regionLabel({ address: "춘천시 " + n })).toBe(
      "강원특별자치도 춘천시 효자동",
    );
  const road = {
    address: "후석로 369번길 40 2층",
    addressRegion: {
      sido: "강원특별자치도",
      sigungu: "춘천시",
      neighborhood: "후평동",
      basis: "confirmed-map" as const,
    },
  };
  expect(regionLabel(road)).toBe(regionLabel({ address: "후평1동 123" }));
  expect(road.address).toBe("후석로 369번길 40 2층");
  expect(canonicalRegionLabel("서울 종로구 종로1가")).toBe(
    "서울특별시 종로구 종로1가",
  );
  expect(canonicalRegionLabel("전라북도 전주시 완산구 효자동1가")).toBe(
    "전북특별자치도 전주시 완산구 효자동1가",
  );
  expect(canonicalRegionLabel("서울특별시 종로구 효자2동")).toContain(
    "효자2동",
  );
  // These administrative dongs cover multiple legal dongs; do not guess.
  expect(canonicalRegionLabel("춘천시 강남동")).toBe(
    "강원특별자치도 춘천시 강남동",
  );
  expect(canonicalRegionLabel("고성군 거진읍")).toBe("고성군 거진읍");
});
it("combines old persisted buckets before thresholding, preserves exact drill-down totals and excludes missing from ratios", () => {
  const rows = [
    { name: "강원도 춘천시 후평1동", count: 50 },
    { name: "강원특별자치도 춘천시 후평동", count: 70 },
    { name: "춘천시 후평2동", count: 30 },
    { name: "춘천시 석사동", count: 25 },
    { name: "경기 가평군 가평읍", count: 40 },
    { name: "주소 미입력", count: 5000 },
    { name: "주소 확인 필요", count: 2000 },
  ];
  const merged = mergeRegionCounts(rows);
  expect(merged.find((r) => r.name.endsWith("후평동"))?.count).toBe(150);
  expect(groupSmallPatientRegions(rows)).toContainEqual({
    name: "강원특별자치도 춘천시 후평동",
    count: 150,
  });
  expect(regionBreakdown(merged, "city")).toEqual([
    { name: "강원특별자치도 춘천시", count: 175 },
    { name: "경기도 가평군", count: 40 },
  ]);
  expect(regionBreakdown(merged, "catchment")).toEqual([
    { name: "춘천시", count: 175 },
    { name: "서울·경기", count: 40 },
  ]);
  expect(merged.reduce((n, r) => n + r.count, 0)).toBe(7215);
  expect(
    regionBreakdown(merged, "province").reduce((n, r) => n + r.count, 0),
  ).toBe(215);
  expect(rows[0].name).toContain("후평1동");
});
it("ships real legal-dong paths and complete lazy parent/child files, with consistent city names and no patient data", () => {
  const read = (key: string) =>
    JSON.parse(readFileSync(`public/maps/korea-v1/${key}.json`, "utf8"))
      .features as {
      id: string;
      name: string;
      path: string;
      bounds: number[];
    }[];
  const national = read("national");
  expect(national).toHaveLength(17);
  const cityIds = new Set<string>();
  let dongs = 0;
  for (const p of national)
    for (const c of read(p.id)) {
      expect(c.id.startsWith(p.id)).toBe(true);
      expect(regionCityCodes[c.name]).toBe(c.id);
      cityIds.add(c.id);
      const children = read(c.id);
      dongs += children.length;
      for (const f of children) {
        expect(f.id.startsWith(c.id)).toBe(true);
        expect(f.name.startsWith(c.name + " ")).toBe(true);
        expect(f.path).toMatch(/^M/);
        expect(f.bounds.every(Number.isFinite)).toBe(true);
        expect(f.bounds[2]).toBeGreaterThan(0);
      }
    }
  expect(cityIds.size).toBe(250);
  expect(dongs).toBe(5065);
  expect(read("51110").some((f) => f.name.endsWith("후평동"))).toBe(true);
  expect(read("51110").some((f) => f.name.endsWith("후평1동"))).toBe(false);
  expect(
    readdirSync("public/maps/korea-v1").filter((n) => n.endsWith(".json")),
  ).toHaveLength(268);
});
