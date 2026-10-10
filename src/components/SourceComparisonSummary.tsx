import type { Bucket } from "../core/analytics";
import { comparisonBuckets } from "../core/analyticsComparison";
export function SourceComparisonSummary({
  rows,
  respondents,
}: {
  rows: Bucket[];
  respondents?: number;
}) {
  const { total, excluded } = comparisonBuckets(rows);
  return (
    <div className="comparison-summary source-comparison-summary">
      {respondents !== undefined && (
        <span>
          응답 환자 <strong>{respondents.toLocaleString("ko-KR")}명</strong> ·
          중복 제외
        </span>
      )}
      <span>
        경로 선택 <strong>{total.toLocaleString("ko-KR")}건</strong> · 복수 선택
      </span>
      {!!excluded.length && (
        <span>
          비교 제외:{" "}
          {excluded
            .map((r) => `${r.name} ${r.count.toLocaleString("ko-KR")}명`)
            .join(" · ")}
        </span>
      )}
      <small>
        여러 경로를 선택한 환자는 각 경로에 1명씩 집계합니다. 경로별 인원의 합은
        응답 환자 수보다 많을 수 있습니다.
      </small>
    </div>
  );
}
