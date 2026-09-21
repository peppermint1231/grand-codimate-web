import { catalogBooks, type Catalog, type User } from "../../src/core/model";
export const catalogAdmin: User = {
  id: "admin",
  name: "관리자",
  username: "admin",
  role: "admin",
  active: true,
  permissions: {},
};
export const threeCatalogs = (): Catalog[] =>
  catalogBooks.map((book, i) => ({
    id: `catalog-${i}`,
    rev: 1,
    createdAt: "2026-09-21",
    updatedAt: "2026-09-21",
    schemaVersion: 1,
    book,
    version: `version-${i}`,
    status: "published",
    publishedAt: "2026-09-21",
    references: [],
    folders: [],
    products: [
      {
        id: `product-${i}`,
        rev: 1,
        createdAt: "2026-09-21",
        updatedAt: "2026-09-21",
        category: "원본 분류",
        folderId: i === 1 ? "medical" : "pigment",
        name: `시험 ${book} 상품`,
        description: "공개하면 안 되는 내부 설명",
        composition: "내부 구성 검토",
        active: true,
        publicVisible: true,
        sources: [{ sheet: "비공개시트", cell: "A1", text: "원본 근거" }],
        options: [
          {
            id: `option-${i}`,
            label: "기본",
            price: [10000, 5000, 8000][i],
            tax: i === 1 ? "exempt" : "exclusive",
            review: false,
            issues: ["내부 검토 문구"],
            sources: [],
            priceKind: i === 2 ? "event" : "clinic",
            unit: "회",
          },
        ],
      },
    ],
  }));
