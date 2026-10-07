import { expect, it } from "vitest";
import {
  parsePackageSchedule,
  optionPackageComposition,
  optionSessionCount,
} from "../src/core/packageSchedule";
import { threeCatalogs } from "./fixtures/catalogs";
import { productComposition } from "../src/core/offerings";
import { validateCatalog } from "../src/core/domain";
import { publicProducts } from "../src/core/discovery";
import { emptyState } from "../src/core/model";
const composition =
  "[원문 구성 참고]\n" +
  Array.from(
    { length: 10 },
    (_, i) =>
      `${i + 1}주차 기미토닝 + 피코토닝 + 콜라겐토닝${[2, 5, 8].includes(i) ? " + LDM물방울레이저" : ""}`,
  ).join("\n") +
  "\n기미토닝 10 + LDM물방울레이저3";
it("slices five and ten sessions and rebuilds totals without the original ten-session footer", () => {
  const p = { composition, packageBySession: true };
  const five = optionPackageComposition(p, { label: "5회" })!,
    ten = optionPackageComposition(p, { label: "10회" })!;
  expect(five).toContain("5주차");
  expect(five).not.toMatch(/6주차|10주차|기미토닝 10/);
  expect(five).toContain("LDM물방울레이저 · 1회차");
  expect(ten).toContain("10주차");
  expect(ten).toContain("LDM물방울레이저 · 3회차");
});
it("does not guess missing rows, repeated schedules, months, bonus counts or an overlong option", () => {
  expect(parsePackageSchedule("1주차 A\n3주차 B")).toBeUndefined();
  expect(parsePackageSchedule("1회차 A\n2회차 B\n1회차 C")).toBeUndefined();
  expect(optionSessionCount({ label: "20+2회" })).toBeUndefined();
  expect(optionSessionCount({ label: "3개월" })).toBeUndefined();
  expect(
    optionPackageComposition(
      { composition, packageBySession: true },
      { label: "15회" },
    ),
  ).toBeUndefined();
  expect(optionSessionCount({ label: "8주 패키지" })).toBe(8);
});
it("uses the same scoped schedule in public cards and new cart/quote snapshots, without exposing unstructured notes", () => {
  const s = emptyState();
  s.catalogs = threeCatalogs();
  const c = s.catalogs[0],
    p = c.products[0],
    o = p.options[0];
  p.packageBySession = true;
  p.composition = composition;
  o.label = "5회";
  validateCatalog(c, true);
  expect(productComposition(p, o)).toContain("5주차");
  expect(productComposition(p, o)).not.toContain("6주차");
  expect(publicProducts(s)[0].options[0].packageComposition).toContain("5주차");
  p.packageBySession = false;
  expect(publicProducts(s)[0].options[0].packageComposition).toBeUndefined();
  p.packageBySession = true;
  o.packageSessionCount = 15;
  expect(() => validateCatalog(c, true)).toThrow(/회차/);
});
it("keeps confirmed interval weeks while limiting by visits, and excludes frequency from totals", () => {
  const numbers = [1, 2, 3, 4, 5, 6, 7, 8, 10, 12, 14, 16, 20, 24];
  const p = {
    packageBySession: true,
    packageAllowGaps: true,
    composition: numbers
      .map(
        (n) =>
          `${n}주차 / ${n <= 8 ? "주 1회" : n <= 16 ? "2주 간격" : "월 1회"} / 눈가·목 LDM + LED`,
      )
      .join("\n"),
  };
  for (const [months, visits, last] of [
    [2, 8, 8],
    [4, 12, 16],
    [6, 14, 24],
  ]) {
    const text = optionPackageComposition(p, {
      label: `${months}개월`,
      packageSessionCount: visits,
    })!;
    const [schedule, totals] = text.split("구성별 포함 회차");
    expect(schedule.trim().split("\n")).toHaveLength(visits);
    expect(schedule.trim().split("\n").at(-1)).toContain(`${last}주차`);
    expect(totals).toContain(`눈가·목 LDM · ${visits}회차`);
    expect(totals).not.toMatch(/주 1회|2주 간격|월 1회/);
  }
  expect(parsePackageSchedule(p.composition)).toBeUndefined();
  expect(
    parsePackageSchedule("1주차 A\n3주차 B\n2주차 C", true),
  ).toBeUndefined();
});
it("supports monthly repetitions and independent four/eight-week schedules", () => {
  const p = {
    packageBySession: true,
    composition: Array.from(
      { length: 6 },
      (_, i) => `${i + 1}개월차 관리${(i % 3) + 1}`,
    ).join("\n"),
  };
  expect(
    optionPackageComposition(p, { label: "3개월", packageSessionCount: 3 }),
  ).not.toContain("4개월차");
  expect(
    optionPackageComposition(p, { label: "6개월", packageSessionCount: 6 }),
  ).toContain("6개월차 관리3");
  const four = {
    label: "4주",
    packageComposition: Array.from(
      { length: 4 },
      (_, i) => `${i + 1}주차 관리A`,
    ).join("\n"),
  };
  const eight = {
    label: "8주",
    packageComposition: Array.from(
      { length: 8 },
      (_, i) => `${i + 1}주차 관리B`,
    ).join("\n"),
  };
  expect(optionPackageComposition(p, four)).toContain("1주차 관리A");
  expect(optionPackageComposition(p, eight)).toContain("1주차 관리B");
  expect(
    optionPackageComposition(p, {
      label: "집중관리",
      packageComposition: "흑자 제거 + 색소케어주사 2회",
    }),
  ).toBe("흑자 제거 + 색소케어주사 2회");
});
it("validates option overrides and publishes them even without automatic common slicing", () => {
  const s = emptyState();
  s.catalogs = threeCatalogs();
  const c = s.catalogs[0],
    p = c.products[0],
    o = p.options[0];
  p.packageBySession = false;
  o.label = "2회";
  o.packageComposition = "1회차 관리A\n2회차 관리B";
  validateCatalog(c, true);
  expect(publicProducts(s)[0].options[0].packageComposition).toContain(
    "2회차 관리B",
  );
  expect(productComposition(p, o)).toContain("2회차 관리B");
  o.packageComposition = "1회차 관리A\n3회차 관리B";
  expect(() => validateCatalog(c, true)).toThrow(/회차 순서/);
  o.packageComposition = "1회차 관리A";
  expect(() => validateCatalog(c, true)).toThrow(/회차 수/);
});
