import { z } from "zod";
import type { Product } from "./model";
export const offeringSchema = z.object({
  kind: z.enum(["package", "membership"]),
  items: z
    .array(
      z.object({
        name: z.string().trim().min(1).max(200),
        quantity: z.number().int().min(1).max(10000),
        unit: z.string().trim().max(30),
      }),
    )
    .max(100),
  validityDays: z.number().int().min(1).max(3650).optional(),
  creditAmount: z.number().int().min(0).max(1000000000).optional(),
  bonusAmount: z.number().int().min(0).max(1000000000).optional(),
  terms: z.string().max(4000),
});
export type Offering = z.infer<typeof offeringSchema>;
export function offeringSummary(offering?: Offering) {
  if (!offering) return "";
  return [
    offering.kind === "package" ? "패키지 구성" : "멤버십 안내",
    ...offering.items.map((i) => `${i.name} ${i.quantity}${i.unit || "회"}`),
    offering.validityDays ? `이용기간 ${offering.validityDays}일` : "",
    offering.creditAmount !== undefined
      ? `기본 이용금액 ${offering.creditAmount.toLocaleString()}원`
      : "",
    offering.bonusAmount !== undefined
      ? `추가 혜택 ${offering.bonusAmount.toLocaleString()}원`
      : "",
    offering.terms,
  ]
    .filter(Boolean)
    .join("\n");
}
export const productComposition = (product: Product) =>
  [product.composition, offeringSummary(product.offering)]
    .filter(Boolean)
    .join("\n\n");
