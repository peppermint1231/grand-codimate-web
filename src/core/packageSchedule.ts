import type { Product, Option } from "./model";
export interface PackageSchedule {
  unit: "주차" | "회차";
  rows: string[];
}
/** Accept only complete, contiguous schedules. Never guess gaps or choose among conflicting blocks. */
export function parsePackageSchedule(
  composition: string,
): PackageSchedule | undefined {
  const rows: string[] = [];
  let unit: PackageSchedule["unit"] | undefined;
  let footer = false;
  for (const line of composition.split(/\r?\n/)) {
    const m = line.match(/^\s*(\d+)\s*(주차|회차)\s*[:：.)-]?\s*(.+?)\s*$/);
    if (!m) {
      if (rows.length && line.trim()) footer = true;
      continue;
    }
    if (footer) return undefined;
    if (Number(m[1]) !== rows.length + 1 || (unit && unit !== m[2]))
      return undefined;
    unit = m[2] as PackageSchedule["unit"];
    rows.push(m[3]);
  }
  return unit && rows.length >= 2 ? { unit, rows } : undefined;
}
export function optionSessionCount(
  option: Pick<Option, "label" | "packageSessionCount">,
) {
  if (option.packageSessionCount !== undefined)
    return option.packageSessionCount;
  const visits = [
    ...option.label.matchAll(/(?:^|[\s·])(\d+)\s*회(?=\s|$|[·/])/g),
  ].map((m) => Number(m[1]));
  if (visits.length === 1) return visits[0];
  const weeks = option.label.match(/^\s*(\d+)\s*주(?=\s|$|[·/])/);
  return weeks ? Number(weeks[1]) : undefined;
}
export function optionPackageComposition(
  product: Pick<Product, "composition" | "packageBySession">,
  option: Pick<Option, "label" | "packageSessionCount">,
) {
  if (!product.packageBySession) return undefined;
  const schedule = parsePackageSchedule(product.composition),
    count = optionSessionCount(option);
  if (!schedule || !count || count > schedule.rows.length) return undefined;
  const rows = schedule.rows.slice(0, count);
  const totals = new Map<string, { name: string; count: number }>();
  for (const row of rows) {
    for (const name of new Set(
      row
        .split("+")
        .map((s) => s.trim())
        .filter(Boolean),
    )) {
      const key = name.replace(/\s/g, "");
      const prior = totals.get(key);
      totals.set(key, {
        name: prior?.name || name,
        count: (prior?.count || 0) + 1,
      });
    }
  }
  return [
    rows.map((row, i) => `${i + 1}${schedule.unit} ${row}`).join("\n"),
    "구성별 포함 회차\n" +
      [...totals.values()].map((x) => `${x.name} · ${x.count}회차`).join("\n"),
  ].join("\n\n");
}
