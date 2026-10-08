import { expect, it } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import {
  comparisonBuckets,
  isMissingComparisonValue,
} from "../src/core/analyticsComparison";
import {
  DonutChart,
  AgeChart,
  CategoryHeatmap,
} from "../src/components/AnalyticsCharts";
it("keeps missing counts but uses only recorded values as comparison denominator without changing input", () => {
  const rows = [
    { name: "검색", count: 500 },
    { name: "미입력", count: 60000 },
    { name: "주소 확인 필요", count: 20 },
    { name: "상품 미선택", count: 3 },
    { name: "지역 누락", count: 9 },
  ];
  const split = comparisonBuckets(rows);
  expect(split.total).toBe(500);
  expect(split.excludedTotal).toBe(60032);
  expect(rows).toHaveLength(5);
  expect(isMissingComparisonValue("기타 춘천지역")).toBe(false);
  expect(isMissingComparisonValue("1회")).toBe(false);
  expect(isMissingComparisonValue("확인 필요")).toBe(true);
});
it("shows excluded counts outside donut slices and rescales age columns to known values", () => {
  const rows = [
    { name: "30대", count: 50 },
    { name: "미입력", count: 10000 },
  ];
  const donut = renderToStaticMarkup(
    createElement(DonutChart, { rows, label: "연령" }),
  );
  expect(donut).toContain("100.0%");
  expect(donut).toContain("미입력 10,000명");
  expect(donut.match(/class="insight-ring"/g) || []).toHaveLength(1);
  const age = renderToStaticMarkup(
    createElement(AgeChart, { rows, onSelect: () => {} }),
  );
  expect(age).toContain("height:100%");
  expect(age).not.toContain('aria-label="미입력');
  expect(age).toContain("미입력 10,000명");
  const empty = renderToStaticMarkup(
    createElement(DonutChart, { rows: rows.slice(1), label: "연령" }),
  );
  expect(empty).toContain("비교할 입력 자료가 없습니다");
  expect(empty).not.toMatch(/NaN|Infinity/);
});
it("missing age/category cells do not set heatmap color scale and remain in a separate count summary", () => {
  const base = {
    dimension: "category",
    sex: "여성",
    consultations: 1,
    success: 1,
    failed: 0,
    net: 0,
    contract: 0,
    conversion: 100,
    averageNet: 0,
  } as const;
  const rows = [
    { ...base, age: "30대", name: "기미", patients: 5 },
    { ...base, age: "미입력", name: "기미", patients: 500 },
    { ...base, age: "30대", name: "상품 미선택", patients: 200 },
  ];
  const html = renderToStaticMarkup(
    createElement(CategoryHeatmap, { rows, sex: "", onSelect: () => {} }),
  );
  expect(html).toContain("30대 기미: 5명");
  expect(html).toContain("background:rgba(23,107,97,0.9500000000000001)");
  expect(html).not.toContain('aria-label="미입력');
  expect(html).toContain("500명");
  expect(html).toContain("200명");
  expect(html).toContain("중복 포함");
});
