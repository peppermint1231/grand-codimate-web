import { productType } from "./productType";
import { z } from "zod";
import type { Catalog, Option } from "./model";
import { folderPath, productFolder } from "./catalogFolders";
const blockSchema = z.object({
  id: z.string().min(1),
  catalogId: z.string(),
  productId: z.string(),
  optionId: z.string(),
  name: z.string().min(1).max(200),
  category: z.string(),
  unit: z.string().max(30),
  unitPrice: z.number().int().min(0).max(1e9),
  tax: z.enum(["exclusive", "inclusive", "exempt"]),
  quantity: z.number().int().min(1).max(100),
});
export const packagePlanSchema = z
  .object({
    durationDays: z.number().int().min(1).max(3650),
    sessions: z.number().int().min(1).max(100),
    blocks: z.array(blockSchema).min(1).max(100),
    placements: z
      .array(
        z.object({
          id: z.string().min(1),
          blockId: z.string(),
          session: z.number().int().min(1).max(100),
        }),
      )
      .max(1000),
    discountType: z.enum(["amount", "percent"]),
    discountValue: z.number().min(0).max(1e9),
  })
  .superRefine((p, c) => {
    const add = (message: string) => c.addIssue({ code: "custom", message });
    if (
      new Set(p.blocks.map((b) => b.id)).size !== p.blocks.length ||
      new Set(p.placements.map((b) => b.id)).size !== p.placements.length
    )
      add("블록 ID가 중복되었습니다.");
    for (const b of p.blocks)
      if (p.placements.filter((x) => x.blockId === b.id).length !== b.quantity)
        add(`${b.name}: 선택한 수량을 모두 회차에 배치해주세요.`);
    if (
      p.placements.some(
        (x) =>
          x.session > p.sessions || !p.blocks.some((b) => b.id === x.blockId),
      )
    )
      add("회차와 블록 연결을 확인하세요.");
    for (let i = 1; i <= p.sessions; i++)
      if (!p.placements.some((x) => x.session === i))
        add(`${i}회차에 시술을 배치해주세요.`);
    if (
      p.blocks.some((b) => b.tax === "exempt") &&
      p.blocks.some((b) => b.tax !== "exempt")
    )
      add("면세와 과세 블록은 세금 기준이 달라 별도 패키지로 구성해주세요.");
    if (p.discountType === "amount" && !Number.isInteger(p.discountValue))
      add("할인액은 원 단위 정수로 입력해주세요.");
    const total = packageTotal(p.blocks);
    if (p.discountValue > (p.discountType === "percent" ? 100 : total))
      add("할인은 합계 또는 100%를 넘을 수 없습니다.");
    if (total > 1e9) add("패키지 합계는 10억 원 이하여야 합니다.");
  });
export type PackagePlan = z.infer<typeof packagePlanSchema>;
export type PackageBlock = z.infer<typeof blockSchema>;
export function packageBlocks(catalogs: Catalog[]) {
  return catalogs.flatMap((c) =>
    c.products.flatMap((p) =>
      p.options.flatMap((o) => {
        if (
          productType(p) !== "block" ||
          p.offering ||
          o.offering ||
          p.packageBySession ||
          o.packagePlan ||
          o.packageComposition ||
          /패키지|프로그램|멤버십|멤버쉽/.test(p.name) ||
          /(?:[2-9]|\d{2,})\s*(?:회|주|개월)/.test(o.label) ||
          o.price === null ||
          o.priceKind === "quote" ||
          o.tax === "unknown"
        )
          return [];
        return [
          {
            id: c.id + ":" + p.id + ":" + o.id,
            catalogId: c.id,
            productId: p.id,
            optionId: o.id,
            name: (p.name + " · " + o.label).slice(0, 200),
            category:
              folderPath(c, productFolder(c, p))
                .map((f) => f.name)
                .join(" / ") ||
              p.category ||
              "기타",
            unit: o.unit || "회",
            unitPrice: o.price,
            tax: o.tax,
            quantity: 1,
          } as PackageBlock,
        ];
      }),
    ),
  );
}
export function packageTotal(blocks: PackageBlock[]) {
  return blocks.reduce(
    (n, b) =>
      n +
      Math.round(b.unitPrice / (b.tax === "inclusive" ? 1.1 : 1)) * b.quantity,
    0,
  );
}
export function packageSale(plan: PackagePlan) {
  const total = packageTotal(plan.blocks);
  return Math.max(
    0,
    total -
      Math.round(
        plan.discountType === "percent"
          ? (total * plan.discountValue) / 100
          : plan.discountValue,
      ),
  );
}
/** Quantity distribution only; no clinical ordering is inferred. */
export function balancePackage(
  blocks: PackageBlock[],
  sessions: number,
): PackagePlan["placements"] {
  const loads = Array(sessions).fill(0),
    result: PackagePlan["placements"] = [];
  for (const b of blocks) {
    const own = Array(sessions).fill(0);
    for (let i = 0; i < b.quantity; i++) {
      const preferred = Math.floor((i * sessions) / b.quantity);
      const target = Array.from({ length: sessions }, (_, j) => j).sort(
        (a, z) =>
          own[a] - own[z] ||
          loads[a] - loads[z] ||
          Math.abs(a - preferred) - Math.abs(z - preferred),
      )[0];
      result.push({
        id: crypto.randomUUID(),
        blockId: b.id,
        session: target + 1,
      });
      own[target]++;
      loads[target]++;
    }
  }
  return result;
}
export function packageOption(plan: PackagePlan, option: Option): Option {
  packagePlanSchema.parse(plan);
  const rows = Array.from({ length: plan.sessions }, (_, i) => {
    const assigned = plan.placements.filter((x) => x.session === i + 1);
    return (
      `${i + 1}회차 ` +
      plan.blocks
        .flatMap((b) => {
          const qty = assigned.filter((x) => x.blockId === b.id).length;
          return qty ? [b.name + (qty > 1 ? ` × ${qty}${b.unit}` : "")] : [];
        })
        .join(" + ")
    );
  });
  return {
    ...option,
    price: packageSale(plan),
    regularPrice: packageTotal(plan.blocks),
    priceKind: plan.discountValue ? "event" : "clinic",
    tax: plan.blocks.every((b) => b.tax === "exempt") ? "exempt" : "exclusive",
    packageSessionCount: plan.sessions,
    packageComposition: rows.join("\n"),
    packagePlan: structuredClone(plan),
    offering: {
      kind: "package",
      items: [],
      validityDays: plan.durationDays,
      terms: "",
    },
  };
}
