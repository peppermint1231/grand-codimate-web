import type { Bucket } from "../core/analytics";
export function ComparisonSummary({
  excluded,
  total,
  unit = "명",
  detail,
}: {
  excluded: Bucket[];
  total: number;
  unit?: string;
  detail?: string;
}) {
  if (!excluded.length) return null;
  return (
    <div className="comparison-summary">
      <span>
        비교 대상{" "}
        <strong>
          {total.toLocaleString("ko-KR")}
          {unit}
        </strong>
      </span>
      <span>
        비교 제외:{" "}
        {excluded
          .map((r) => `${r.name} ${r.count.toLocaleString("ko-KR")}${unit}`)
          .join(" · ")}
      </span>
      {detail && <small>{detail}</small>}
    </div>
  );
}
