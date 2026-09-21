import ExcelJS from "exceljs";
import type { Catalog, State } from "./model";
import { gradeFor, metrics } from "./domain";
const teal = "145D55",
  cream = "F5F5ED";
function format(ws: ExcelJS.Worksheet, headers: string[]) {
  ws.views = [{ state: "frozen", ySplit: 3 }];
  ws.pageSetup = {
    paperSize: 9,
    orientation: "landscape",
    fitToPage: true,
    fitToWidth: 1,
    fitToHeight: 0,
    printTitlesRow: "1:3",
  };
  ws.addRow([]);
  ws.addRow(headers);
  ws.getRow(3).eachCell((c) => {
    c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: teal } };
    c.font = {
      name: "맑은 고딕",
      bold: true,
      color: { argb: "FFFFFF" },
      size: 11,
    };
    c.alignment = { vertical: "middle", wrapText: true };
  });
  ws.getRow(3).height = 30;
}
function finish(ws: ExcelJS.Worksheet, widths: number[]) {
  ws.columns.forEach((c, i) => {
    c.width = widths[i] || 22;
  });
  ws.eachRow((r, n) => {
    if (n < 4) return;
    r.eachCell((c) => {
      c.font = { name: "맑은 고딕", size: 11 };
      c.alignment = { vertical: "top", wrapText: true };
      if (n % 2 === 0)
        c.fill = {
          type: "pattern",
          pattern: "solid",
          fgColor: { argb: cream },
        };
      if (typeof c.value === "number") c.numFmt = '#,##0"원"';
    });
    r.height = Math.min(
      180,
      Math.max(
        30,
        ...(r.values as ExcelJS.CellValue[])
          .slice(1)
          .map((v) => String(v ?? "").split("\n").length * 16),
      ),
    );
  });
  ws.autoFilter = {
    from: "A3",
    to: { row: ws.rowCount, column: ws.columnCount },
  };
}
export async function catalogWorkbook(
  catalog: Catalog,
  categories?: string[],
  includeInactive = false,
) {
  const wb = new ExcelJS.Workbook();
  wb.creator = "코디메이트";
  const index = wb.addWorksheet("목차");
  index.addRow(["코디메이트 단가표", catalog.version]);
  format(index, ["카테고리", "상품 수", "기준일"]);
  const names = new Set(["목차"]);
  const unique = (value: string) => {
    const n = value.replace(/[\[\]:*?/\\]/g, " ").slice(0, 27) || "분류";
    let s = n,
      i = 1;
    while (names.has(s)) s = n + " " + i++;
    names.add(s);
    return s;
  };
  const groups = [...new Set(catalog.products.map((p) => p.category))].filter(
    (x) => !categories || categories.includes(x),
  );
  for (const category of groups) {
    const ps = catalog.products.filter(
      (p) => p.category === category && (includeInactive || p.active),
    );
    if (!ps.length) continue;
    const sheetName = unique(category);
    const ws = wb.addWorksheet(sheetName);
    ws.addRow([category, `버전 ${catalog.version}`]);
    const labels = [
      ...new Set(ps.flatMap((p) => p.options.map((o) => o.label))),
    ];
    const priceLabels = labels.length <= 12 ? labels : [];
    format(ws, [
      "시술 / 상품",
      "구성·설명",
      ...(priceLabels.length ? priceLabels : ["옵션"]),
      ...(priceLabels.length ? [] : ["가격"]),
      "부가세 / 가격구분",
      "안내",
    ]);
    for (const p of ps) {
      const note = p.active ? "" : "비활성";
      if (priceLabels.length) {
        ws.addRow([
          p.name,
          [p.description, p.composition].filter(Boolean).join("\n"),
          ...priceLabels.map((label) => {
            const os = p.options.filter((o) => o.label === label);
            return os.length === 1 && !os[0].review && os[0].price !== null
              ? os[0].price
              : os.length
                ? os
                    .map(
                      (o) =>
                        `${o.price ?? "별도견적"}${o.review ? " (확인 필요)" : ""}`,
                    )
                    .join("\n")
                : "";
          }),
          p.options
            .map(
              (o) =>
                `${o.label}: ${{ exclusive: "VAT 별도", inclusive: "VAT 포함", exempt: "면세", unknown: "부가세 확인 필요" }[o.tax]} / ${o.priceKind}`,
            )
            .join("\n"),
          note,
        ]);
      } else
        for (const o of p.options)
          ws.addRow([
            p.name,
            [p.description, p.composition].filter(Boolean).join("\n"),
            o.label,
            o.price ?? "별도 견적",
            `${{ exclusive: "VAT 별도", inclusive: "VAT 포함", exempt: "면세", unknown: "부가세 확인 필요" }[o.tax]} / ${o.priceKind}`,
            [note, ...(o.review ? o.issues : [])].filter(Boolean).join("\n"),
          ]);
    }
    finish(ws, [30, 55, ...Array(priceLabels.length || 2).fill(20), 32, 30]);
    const row = index.addRow([
      { text: category, hyperlink: `#'${sheetName.replaceAll("'", "''")}'!A1` },
      ps.length,
      catalog.publishedAt?.slice(0, 10) || "초안",
    ]);
    row.getCell(2).numFmt = "0";
  }
  for (const ref of catalog.references.filter((r) =>
    r.sheet.includes("구성"),
  )) {
    const ws = wb.addWorksheet(unique(ref.sheet));
    ws.addRow([ref.sheet]);
    format(ws, ["원본 행", "프로그램", "회차별 구성", "총 수량·설명"]);
    for (const r of ref.rows)
      ws.addRow([String(r.row), ...r.cells.map((c) => c.text)]);
    finish(ws, [12, 32, 75, 55]);
  }
  finish(index, [35, 14, 28]);
  index.getColumn(2).numFmt = "0";
  return wb;
}
export async function statisticsWorkbook(s: State) {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet("환자별 기여매출");
  ws.addRow(["코디메이트 환자 실적", new Date().toISOString()]);
  format(ws, [
    "환자번호",
    "성명",
    "계약금액",
    "수납",
    "환불",
    "기여매출",
    "미수금",
    "등급",
  ]);
  for (const p of s.patients.filter((p) => !p.mergedInto)) {
    const m = metrics(s, p.id);
    ws.addRow([
      p.id,
      p.name,
      m.contract,
      m.receipts,
      m.refunds,
      m.revenue,
      m.outstanding,
      gradeFor(s, p).name,
    ]);
  }
  finish(ws, [26, 16, 20, 20, 20, 20, 20, 18]);
  return wb;
}
export async function downloadWorkbook(wb: ExcelJS.Workbook, name: string) {
  const b = await wb.xlsx.writeBuffer();
  download(
    new Blob([b as BlobPart], {
      type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    }),
    name,
  );
}
export function catalogCSV(catalog: Catalog) {
  const cell = (value: unknown) => {
    let s = String(value ?? "");
    if (/^[=+@\-\t\r]/.test(s)) s = "'" + s;
    return '"' + s.replaceAll('"', '""') + '"';
  };
  const rows: unknown[][] = [
    [
      "상품 ID",
      "카테고리",
      "상품",
      "옵션 ID",
      "옵션",
      "가격",
      "부가세",
      "가격 구분",
      "활성",
      "버전",
    ],
  ];
  for (const p of catalog.products)
    for (const o of p.options)
      rows.push([
        p.id,
        p.category,
        p.name,
        o.id,
        o.label,
        o.price,
        o.tax,
        o.priceKind,
        p.active,
        catalog.version,
      ]);
  return new Blob(
    ["\uFEFF" + rows.map((r) => r.map(cell).join(",")).join("\r\n")],
    { type: "text/csv;charset=utf-8" },
  );
}
export function download(blob: Blob, name: string) {
  const u = URL.createObjectURL(blob),
    a = document.createElement("a");
  a.href = u;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(u), 30000);
}
