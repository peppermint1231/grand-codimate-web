import { expect, it } from "vitest";
import { publicDescription } from "../src/core/publicDescription";
it("preserves configured prose and newlines, leaving website prices visible", () => {
  const description = "  첫 줄\n둘째 줄 105,000원  ";
  expect(publicDescription(description, "이벤트")).toBe(
    "첫 줄\n둘째 줄 105,000원",
  );
  expect(publicDescription("", "미용")).toBe("");
});
it("keeps beauty and insurance prices private without hiding amounts of treatment", () => {
  for (const book of ["미용", "보험"] as const) {
    expect(
      publicDescription(
        "1회 105,000원 · 6회 56.7만원 · ₩90,000 · 4만 · 80000 KRW",
        book,
      ),
    ).not.toMatch(/105|56\.7|90,000|4만|80000/);
    expect(
      publicDescription(
        "2cc · 300샷 · 1회 · 10주 · 원형탈모 · 500원 동전 크기",
        book,
      ),
    ).toBe("2cc · 300샷 · 1회 · 10주 · 원형탈모 · 500원 동전 크기");
  }
});

it("removes duplicate VAT notices while preserving tip fees and treatment prose", () => {
  expect(
    publicDescription(
      "*VAT는 별도입니다.\n* 팁 별도, 펌핑제외\n모공 관리 (부가세 포함)",
      "이벤트",
    ),
  ).toBe("* 팁 별도, 펌핑제외\n모공 관리");
  expect(publicDescription("*VAT별도", "이벤트")).toBe("");
});
