import type { Product, Option } from "./model";
export interface PackageSchedule {
  unit: "주차" | "회차" | "개월차";
  rows: string[];
  numbers: number[];
}
/** Gaps are allowed only for a clinic-confirmed interval schedule. */
export function parsePackageSchedule(
  composition: string,
  allowGaps = false,
): PackageSchedule | undefined {
  const rows: string[] = [],
    numbers: number[] = [];
  let unit: PackageSchedule["unit"] | undefined;
  let footer = false;
  for (const line of composition.split(/\r?\n/)) {
    const m = line.match(
      /^\s*(\d+)\s*(주차|회차|개월차)\s*[:：.)-]?\s*(.+?)\s*$/,
    );
    if (!m) {
      if (rows.length && line.trim()) footer = true;
      continue;
    }
    if (footer) return undefined;
    const n = Number(m[1]);
    if (
      (unit && unit !== m[2]) ||
      (!numbers.length && n !== 1) ||
      (allowGaps ? n <= (numbers.at(-1) || 0) : n !== rows.length + 1)
    )
      return undefined;
    unit = m[2] as PackageSchedule["unit"];
    numbers.push(n);
    rows.push(m[3]);
  }
  return unit && rows.length >= 1 ? { unit, rows, numbers } : undefined;
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
export function formatPackageSchedule(
  schedule: PackageSchedule,
  count = schedule.rows.length,
) {
  const rows = schedule.rows.slice(0, count),
    totals = new Map<string, { name: string; count: number }>();
  for (const row of rows) {
    // Frequency is a visit annotation, not another included procedure.
    const content = row.replace(/^\s*\/\s*[^/]+\/\s*/, "");
    const inVisit = new Map<string, string>();
    for (const name of content
      .split("+")
      .map((s) => s.trim())
      .filter(Boolean))
      inVisit.set(name.replace(/\s/g, ""), name);
    for (const [key, name] of inVisit) {
      const prior = totals.get(key);
      totals.set(key, {
        name: prior?.name || name,
        count: (prior?.count || 0) + 1,
      });
    }
  }
  return [
    rows
      .map((row, i) => `${schedule.numbers[i]}${schedule.unit} ${row}`)
      .join("\n"),
    "구성별 포함 회차\n" +
      [...totals.values()].map((x) => `${x.name} · ${x.count}회차`).join("\n"),
  ].join("\n\n");
}
export function optionPackageComposition(
  product: Pick<
    Product,
    "composition" | "packageBySession" | "packageAllowGaps"
  >,
  option: Pick<
    Option,
    "label" | "packageSessionCount" | "packageComposition" | "packagePlan"
  >,
) {
  if (option.packageComposition?.trim()) {
    const schedule = parsePackageSchedule(
      option.packageComposition,
      !!product.packageAllowGaps,
    );
    if (schedule && option.packagePlan)
      return (
        formatPackageSchedule(schedule).split("\n\n구성별 포함 회차")[0] +
        "\n\n구성별 포함 회차\n" +
        option.packagePlan.blocks
          .map((b) => `${b.name} · ${b.quantity}${b.unit}`)
          .join("\n")
      );
    return schedule
      ? formatPackageSchedule(schedule)
      : option.packageComposition.trim();
  }
  if (!product.packageBySession) return undefined;
  const schedule = parsePackageSchedule(
      product.composition,
      !!product.packageAllowGaps,
    ),
    count = optionSessionCount(option);
  if (!schedule || !count || count > schedule.rows.length) return undefined;
  return formatPackageSchedule(schedule, count);
}
