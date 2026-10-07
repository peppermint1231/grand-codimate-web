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
