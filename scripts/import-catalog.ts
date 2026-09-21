import ExcelJS from "exceljs";
import { createHash } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import type { Catalog, Product, Option, Source } from "../src/core/model";
const input = process.argv[2],
  output = process.argv[3] || "private/catalog-import.json";
if (!input)
  throw new Error(
    "사용법: npm run catalog:import -- 원본.xlsx private/catalog-import.json",
  );
const wb = new ExcelJS.Workbook();
await wb.xlsx.readFile(input);
const id = (s: string) =>
  createHash("sha256").update(s).digest("hex").slice(0, 20);
function text(v: ExcelJS.CellValue): string {
  if (v == null) return "";
  if (typeof v === "object") {
    if ("richText" in v) return v.richText.map((t) => t.text).join("");
    if ("text" in v) return v.text;
    if ("result" in v) return String(v.result ?? "");
    return "";
  }
  return String(v);
}
function price(t: string): number | null {
  const clean = t.trim();
  if (/^\d[\d,]*(?:\s*원)?$/.test(clean)) {
    const n = Number(clean.replace(/[,원\s]/g, ""));
    return n >= 1000 ? n : null;
  }
  const m = [...clean.matchAll(/(\d[\d,]{3,})\s*원/g)];
  return m.length === 1 ? Number(m[0][1].replaceAll(",", "")) : null;
}
const now = new Date().toISOString();
const catalog: Catalog = {
  id: "import-" + id(input),
  rev: 0,
  schemaVersion: 1,
  createdAt: now,
  updatedAt: now,
  version: "import-draft",
  status: "draft",
  products: [],
  references: [],
};
const report: {
  sheet: string;
  rows: number;
  cells: number;
  candidates: number;
  review: number;
}[] = [];
for (const sheet of wb.worksheets) {
  let context = "";
  const headers = new Map<number, string>();
  const rows: { row: number; cells: Source[] }[] = [];
  let count = 0,
    review = 0;
  sheet.eachRow((row, n) => {
    const cells: Source[] = [];
    row.eachCell((cell) => {
      if (cell.isMerged && cell.master.address !== cell.address) return;
      const t = text(cell.value).trim();
      if (t) cells.push({ sheet: sheet.name, cell: cell.address, text: t });
    });
    if (!cells.length) return;
    rows.push({ row: n, cells });
    const priced = cells.filter((c) => price(c.text) !== null);
    if (!priced.length) {
      if (cells.length === 1) context = cells[0].text;
      for (const c of cells)
        if (
          /회|개월|가격|패키지|원내|정가|리즈톡스|보툴렉스|제오민|금액/.test(
            c.text,
          )
        )
          headers.set(Number(sheet.getCell(c.cell).col), c.text);
      return;
    }
    const first = Number(sheet.getCell(priced[0].cell).col);
    const labels = cells.filter(
      (c) =>
        Number(sheet.getCell(c.cell).col) < first && price(c.text) === null,
    );
    const name = labels[0]?.text || context || "이름 확인 필요";
    const mixed = priced.some((c) => !/^[\d,\s]+원?$/.test(c.text));
    const membership = sheet.name.includes("멤버");
    const special = /정가|원내|수가|적용가/.test(name);
    const product: Product = {
      id: "p-" + id(sheet.name + ":" + n),
      rev: 1,
      createdAt: now,
      updatedAt: now,
      category: sheet.name.replace(/^\d+\s*/, ""),
      name: special ? context + " · " + name : name,
      description: labels
        .slice(1)
        .map((c) => c.text)
        .join("\n"),
      composition: "",
      active: false,
      sources: cells,
      options: [],
    };
    for (const c of priced) {
      const col = Number(sheet.getCell(c.cell).col);
      const raw = c.text;
      const issues: string[] = ["원본과 판매 옵션·부가세 기준 확인"];
      if (mixed) issues.push("문장 안 금액: 상품명·포함구성 확인");
      if (membership) issues.push("멤버십 구매·포인트·사용가능액 구분 필요");
      if (special) issues.push("정가·원내가·이벤트가 적용 관계 확인");
      if (/\+@|별도|이상|~/.test(raw)) issues.push("추가금 또는 범위 확인");
      const o: Option = {
        id: "o-" + id(sheet.name + ":" + c.cell),
        label: headers.get(col) || "옵션 확인 필요",
        price: price(raw),
        tax: /vat.*포함|부가세.*포함/i.test(raw) ? "inclusive" : "unknown",
        review: true,
        issues,
        sources: [c],
        priceKind: /이벤트|EVENT|EVEVT/i.test(context + name)
          ? "event"
          : /정가/.test(name)
            ? "regular"
            : "clinic",
        unit: /cc/i.test(headers.get(col) || "") ? "cc" : "개",
      };
      product.options.push(o);
      review++;
    }
    catalog.products.push(product);
    count += product.options.length;
  });
  catalog.references.push({ sheet: sheet.name, rows });
  report.push({
    sheet: sheet.name,
    rows: rows.length,
    cells: rows.reduce((n, r) => n + r.cells.length, 0),
    candidates: count,
    review,
  });
}
// All source cells are retained; no ambiguous candidate is silently made sellable.
await mkdir(output.slice(0, Math.max(0, output.lastIndexOf("/"))) || ".", {
  recursive: true,
});
await writeFile(output, JSON.stringify(catalog, null, 2));
await writeFile(
  output.replace(/\.json$/, ".report.json"),
  JSON.stringify(
    {
      source: input,
      sheets: report,
      products: catalog.products.length,
      options: report.reduce((n, r) => n + r.candidates, 0),
      note: "자동 추출 후보입니다. 전체 원본 셀을 보존했고 게시 전 관리자 검토가 필요합니다.",
    },
    null,
    2,
  ),
);
console.log(
  JSON.stringify({
    sheets: report.length,
    products: catalog.products.length,
    priceCandidates: report.reduce((n, r) => n + r.candidates, 0),
    output,
  }),
);
