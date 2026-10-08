import type { State } from "../src/core/model";

export type EntityRow = { section: keyof State; id: string; value: string };

/** Seek through the existing (section,id) primary key; no scans across unrelated sections. */
export async function* entitySectionRows(
  sql: SqlStorage,
  section: keyof State,
  nativePatients = false,
) {
  const ranges =
    nativePatients && section === "patients"
      ? [
          { from: "", to: "vegas-" },
          { from: "vegas.", to: "" },
        ]
      : [{ from: "", to: "" }];
  for (const range of ranges) {
    let cursor = range.from;
    let first = true;
    for (;;) {
      const row = sql
        .exec<EntityRow>(
          `SELECT section,id,value FROM entities WHERE section=? AND id${first && range.from ? ">=" : ">"}?${range.to ? " AND id<?" : ""} ORDER BY id LIMIT 1`,
          section,
          cursor,
          ...(range.to ? [range.to] : []),
        )
        .toArray()[0];
      if (!row) break;
      first = false;
      cursor = row.id;
      yield row;
    }
  }
}
