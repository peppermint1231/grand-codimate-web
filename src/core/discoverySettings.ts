import { z } from "zod";
import type { CatalogBook, State } from "./model";
import type { ProductType } from "./productType";
const book = z.object({
  types: z
    .array(z.enum(["single", "package", "membership", "block"]))
    .max(4)
    .transform((v) => [...new Set(v)]),
  showPrices: z.boolean(),
});
export const discoverySettingsSchema = z.object({
  이벤트: book,
  미용: book,
  보험: book,
});
export type DiscoverySettings = z.infer<typeof discoverySettingsSchema>;
export function discoverySettings(
  state: Pick<State, "policies">,
): DiscoverySettings {
  const common: ProductType[] = ["single", "package", "membership"];
  return (
    state.policies[0]?.discovery || {
      이벤트: { types: [...common], showPrices: true },
      미용: { types: [...common], showPrices: false },
      보험: { types: [...common], showPrices: false },
    }
  );
}
export const discoveryPriceVisible = (p: {
  book: CatalogBook;
  priceVisible?: boolean;
}) => p.priceVisible ?? p.book === "이벤트";
