export const quoteTemplates = [
  {
    id: "signature",
    name: "그랜드 시그니처",
    ink: "#145d55",
    accent: "#ad945e",
    paper: "#f7f6ef",
    soft: "#eaf1eb",
    description: "딥그린 · 샴페인 포인트",
  },
  {
    id: "classic",
    name: "클래식 네이비",
    ink: "#263d57",
    accent: "#9c805a",
    paper: "#ffffff",
    soft: "#eef2f7",
    description: "네이비 · 정돈된 화이트",
  },
] as const;
export type QuoteTheme = (typeof quoteTemplates)[number];
export function documentTheme(): QuoteTheme {
  try {
    return (
      quoteTemplates.find(
        (t) => t.id === localStorage.getItem("codimate-quote-template"),
      ) || quoteTemplates[0]
    );
  } catch {
    return quoteTemplates[0];
  }
}
export function selectDocumentTheme(id: string) {
  if (quoteTemplates.some((t) => t.id === id))
    localStorage.setItem("codimate-quote-template", id);
}
export function wrapDocumentText(
  text: string,
  measure: (text: string) => number,
  width: number,
): string[] {
  return String(text)
    .split("\n")
    .flatMap((paragraph) => {
      const lines: string[] = [];
      let line = "";
      for (const char of paragraph) {
        if (line && measure(line + char) > width) {
          lines.push(line);
          line = "";
        }
        line += char;
      }
      lines.push(line);
      return lines;
    });
}
