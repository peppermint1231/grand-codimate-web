/** Tax is already shown alongside the price. Keep other conditions (e.g. tip fees). */
export function cleanProductDescription(value: string) {
  return value
    .split(/\r?\n/)
    .map((line) =>
      line
        .replace(
          /(?:\*|※|•)?\s*\(?\s*(?:VAT|부가(?:가치)?세)\s*(?:는|은)?\s*(?:10\s*%\s*)?(?:별도|포함|면제|면세)(?:입니다|입니다만)?\s*\)?\.?/gi,
          "",
        )
        .replace(/^[\s·,;|/]+|[\s·,;|/]+$/g, ""),
    )
    .filter(Boolean)
    .join("\n")
    .trim();
}

/** Preserve staff-written copy when a website refresh replaces prices and source data. */
export function editedWebsiteDescription(
  description: string,
  signature?: string,
) {
  if (!signature) return undefined;
  try {
    const source = JSON.parse(signature);
    if (
      typeof source.description !== "string" ||
      typeof source.event?.description !== "string"
    )
      return undefined;
    const original = [source.event.description, source.description]
      .filter(Boolean)
      .join("\n");
    if (
      cleanProductDescription(description) !== cleanProductDescription(original)
    )
      return cleanProductDescription(description);
  } catch {
    /* Older or unknown source signatures cannot establish an override. */
  }
  return undefined;
}
