import ExcelJS from "exceljs";
import { readFile, writeFile } from "node:fs/promises";
import assert from "node:assert/strict";
const input = process.argv[2];
if (!input) throw new Error("Original XLSX path required");
const wb = new ExcelJS.Workbook();
await wb.xlsx.readFile(input);
const catalog = JSON.parse(
  await readFile("private/catalog-import.json", "utf8"),
);
const sheets = [];
for (const ws of wb.worksheets) {
  const saved = catalog.references.find((x: any) => x.sheet === ws.name);
  assert.ok(saved);
  const sources = new Map(
    saved.rows.flatMap((r: any) => r.cells.map((c: any) => [c.cell, c.text])),
  );
  let cells = 0;
  ws.eachRow((row) =>
    row.eachCell((cell) => {
      if (cell.isMerged && cell.master.address !== cell.address) return;
      let v = cell.value;
      let text = "";
      if (v === null) return;
      if (typeof v === "object") {
        if ("richText" in v) text = v.richText.map((x) => x.text).join("");
        else if ("text" in v) text = v.text;
        else if ("result" in v) text = String(v.result ?? "");
      } else text = String(v);
      if (!text.trim()) return;
      assert.equal(
        sources.get(cell.address),
        text.trim(),
        ws.name + "!" + cell.address,
      );
      cells++;
    }),
  );
  assert.equal(sources.size, cells);
  sheets.push({ sheet: ws.name, cells });
}
assert.equal(sheets.length, 29);
assert.ok(
  catalog.products.every(
    (p: any) => !p.active && p.options.every((o: any) => o.review),
  ),
);
await writeFile(
  "artifacts/import-verification.json",
  JSON.stringify(
    {
      passed: true,
      sheets,
      sourceCells: sheets.reduce((n, s) => n + s.cells, 0),
      productCandidates: catalog.products.length,
      priceCandidates: catalog.products.reduce(
        (n: number, p: any) => n + p.options.length,
        0,
      ),
      semanticReview: "pending; no candidate enabled for sale",
    },
    null,
    2,
  ),
);
console.log("29-sheet source-cell verification passed");
