import { it, expect } from "vitest";
import { catalogWorkbook } from "../src/core/excel";
import type { Catalog } from "../src/core/model";
it("카테고리 시트·숫자 금액·인쇄 설정·수식 주입 방지", async () => {
  const now = new Date().toISOString();
  const c: Catalog = {
    id: "test",
    rev: 1,
    createdAt: now,
    updatedAt: now,
    version: "v1",
    schemaVersion: 1,
    status: "published",
    publishedAt: now,
    references: [],
    products: [
      {
        id: "p",
        rev: 1,
        createdAt: now,
        updatedAt: now,
        name: '=HYPERLINK("https://invalid.test")',
        category: "테스트/카테고리",
        description: "한글 설명\n다음 줄",
        composition: "1회차",
        active: true,
        sources: [],
        options: [
          {
            id: "o",
            label: "1회",
            price: 123000,
            tax: "inclusive",
            review: false,
            issues: [],
            sources: [],
            priceKind: "clinic",
            unit: "회",
          },
        ],
      },
    ],
  };
  const wb = await catalogWorkbook(c);
  const ws = wb.worksheets[1];
  expect(ws.name).toBe("테스트 카테고리");
  expect(ws.getCell("A4").value).toBe(c.products[0].name);
  expect(ws.getCell("C4").value).toBe(123000);
  expect(ws.pageSetup.fitToWidth).toBe(1);
  expect(ws.views[0]).toMatchObject({ state: "frozen", ySplit: 3 });
  expect((await wb.xlsx.writeBuffer()).byteLength).toBeGreaterThan(5000);
});
