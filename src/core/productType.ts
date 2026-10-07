import type { Product } from "./model";
export const productTypeLabels = {
  single: "일반 상품",
  package: "패키지",
  membership: "멤버십",
  block: "블록",
} as const;
export type ProductType = keyof typeof productTypeLabels;
export function productType(p: Product): ProductType {
  if (p.productType) return p.productType;
  if (
    p.offering?.kind === "membership" ||
    p.options.some((o) => o.offering?.kind === "membership") ||
    /멤버십|멤버쉽/.test(p.name)
  )
    return "membership";
  if (
    p.offering?.kind === "package" ||
    p.packageBySession ||
    p.options.some((o) => o.packagePlan || o.offering?.kind === "package") ||
    /패키지|프로그램/.test(p.name)
  )
    return "package";
  return "single";
}
