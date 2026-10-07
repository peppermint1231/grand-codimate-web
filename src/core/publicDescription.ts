import type { CatalogBook } from "./model";
import { cleanProductDescription } from "./productDescription";

/** The description is patient-facing. Keep the clinic's existing price-visibility policy. */
export function publicDescription(description: string, book: CatalogBook) {
  const text = cleanProductDescription(description);
  if (book === "이벤트") return text;
  return text.replace(
    /(?:[₩￦]\s*\d[\d,.]*|\d[\d,]*(?:\.\d+)?\s*(?:(?:억|천만|백만|십만|만|천)\s*)?원|\d[\d,]*(?:\.\d+)?\s*만원?|\d[\d,.]*\s*KRW)/gi,
    (amount, offset: number) =>
      /^\s*동전/.test(text.slice(offset + amount.length))
        ? amount
        : "맞춤 상담 후 안내",
  );
}
