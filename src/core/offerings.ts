import { optionPackageComposition } from "./packageSchedule";
import { z } from "zod";
import type { Product, Option } from "./model";
const untouchedItem = (item: any) =>
  item &&
  typeof item.name === "string" &&
  !item.name.trim() &&
  item.quantity === 1 &&
  (item.unit === "회" || item.unit === "");
export const offeringSchema = z.object({
  kind: z.enum(["package", "membership"]),
  // Ignore only untouched placeholder rows; never discard partially filled rows.
  items: z.preprocess(
    (items) =>
      Array.isArray(items)
        ? items.filter((item) => !untouchedItem(item))
        : items,
    z
      .array(
        z.object({
          name: z.string().trim().min(1).max(200),
          quantity: z.number().int().min(1).max(10000),
          unit: z.string().trim().max(30),
        }),
      )
      .max(100),
  ),
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
export const productComposition = (product: Product, option?: Option) =>
  [
    option && (product.packageBySession || option.packageComposition?.trim())
      ? optionPackageComposition(product, option) ||
        "회차별 구성은 상담 시 확인해주세요."
      : product.composition,
    offeringSummary(option?.offering || product.offering),
  ]
    .filter(Boolean)
    .join("\n\n");

export function offeringErrors(value: unknown): string[] {
  const result = offeringSchema.safeParse(value);
  if (result.success) return [];
  const rawItems = (value as { items?: unknown[] })?.items;
  const rowNumbers = Array.isArray(rawItems)
    ? rawItems.flatMap((item, i) => (untouchedItem(item) ? [] : [i + 1]))
    : [];
  return result.error.issues.map((issue) => {
    const [field, row, part] = issue.path;
    if (field === "items") {
      const prefix =
        typeof row === "number"
          ? `구성 ${rowNumbers[row] || row + 1}`
          : "구성 항목";
      if (part === "name")
        return `${prefix}: 시술·혜택 이름을 1~200자로 입력하세요. 사용하지 않는 행은 삭제하세요.`;
      if (part === "quantity")
        return `${prefix}: 수량을 1~10,000 사이 정수로 입력하세요.`;
      if (part === "unit") return `${prefix}: 단위는 30자 이내로 입력하세요.`;
      return "구성 항목은 최대 100개까지 입력할 수 있습니다.";
    }
    const labels: Record<string, string> = {
      kind: "상품 유형",
      validityDays: "이용기간 (1~3,650일)",
      creditAmount: "기본 이용금액 (0~10억 원)",
      bonusAmount: "추가 혜택 금액 (0~10억 원)",
      terms: "이용 조건 (4,000자 이내)",
    };
    return `${labels[String(field)] || "패키지·멤버십 정보"}을 확인하세요.`;
  });
}
