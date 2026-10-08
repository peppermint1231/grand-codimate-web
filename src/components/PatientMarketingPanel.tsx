import {
  DonutChart,
  AgeChart,
  CategoryHeatmap,
  InteractiveTrend,
} from "./AnalyticsCharts";
import { useMemo, useState } from "react";
import { money } from "../core/model";
import type { AnalyticsReport, Bucket } from "../core/analytics";
const fmt = (n: number) => n.toLocaleString("ko-KR");
function Bars({ rows }: { rows: Bucket[] }) {
  const max = Math.max(1, ...rows.map((r) => r.count));
  return (
    <div className="analytics-bars">
      {rows.slice(0, 15).map((r) => (
        <div className="analytics-bar" key={r.name}>
          <span>{r.name}</span>
          <div>
            <i
              style={{
                width: `${(r.count / max) * 100}%`,
                background: "var(--primary, #145d55)",
              }}
            />
          </div>
          <strong>{fmt(r.count)}명</strong>
        </div>
      ))}
      {!rows.length && <p className="small">해당 자료가 없습니다.</p>}
      {rows.length > 15 && (
        <small>상위 15개 표시 · 전체 목록은 엑셀에서 확인</small>
      )}
    </div>
  );
}
export function PatientMarketingPanel({ report }: { report: AnalyticsReport }) {
  const [age, setAge] = useState(""),
    [sex, setSex] = useState("");
  const grouped = useMemo(() => {
    const result = new Map<string, AnalyticsReport["marketing"][number]>();
    for (const r of report.marketing || []) {
      if ((age && r.age !== age) || (sex && r.sex !== sex)) continue;
      const key = r.dimension + "|" + r.name,
        old = result.get(key);
      result.set(
        key,
        old
          ? {
              ...old,
              patients: old.patients + r.patients,
              consultations: old.consultations + r.consultations,
              success: old.success + r.success,
              failed: old.failed + r.failed,
              net: old.net + r.net,
              contract: old.contract + r.contract,
            }
          : { ...r },
      );
    }
    return [...result.values()].sort((a, b) => b.patients - a.patients);
  }, [report, age, sex]);
  const audience = report.audience;
  return (
    <>
      {audience && (
        <section className="card">
          <h2>선택한 환자군 전체</h2>
          <p className="small">
            현재 누적 자료 · 같은 이름과 연락처는 한 명으로 집계합니다.
            기간·담당자·단가표 필터는 아래 코디메이트 상담 분석에 적용됩니다.
          </p>
          <div className="analytics-kpis">
            <div className="analytics-kpi">
              <span>중복 제외 환자</span>
              <strong>{fmt(audience.total)}명</strong>
            </div>
            <div className="analytics-kpi">
              <span>이관·설문에서 코디메이트 상담으로 연결</span>
              <strong>{fmt(audience.converted)}명</strong>
              <small>전체 환자 수에 이미 포함</small>
            </div>
            {report.financial && (
              <>
                <div className="analytics-kpi">
                  <span>누적 기여매출</span>
                  <strong>{money(audience.revenue || 0)}</strong>
                  <small>베가스 누적 수납 + 코디메이트 실수납</small>
                </div>
                <div className="analytics-kpi">
                  <span>환자당 누적 매출</span>
                  <strong>{money(audience.averageRevenue || 0)}</strong>
                </div>
              </>
            )}
          </div>
          <div className="analytics-grid">
            {(
              [
                ["환자군 · 중복 제외", "groups"],
                ["연령대 · 출생연도 기준", "ages"],
                ["성별", "sexes"],
                ["지역 · 동·읍·면", "regions"],
                ["유입경로", "sources"],
                ["최근 방문 · 재방문 안내 대상", "segments"],
                ["방문 횟수", "visits"],
                ...(report.financial
                  ? [
                      ["누적 수납 구간", "spend"],
                      ["환자 등급", "grades"],
                    ]
                  : []),
              ] as [string, keyof typeof audience][]
            ).map(([label, key]) => (
              <div key={key}>
                <h3>{label}</h3>
                {["groups", "sexes", "visits", "spend"].includes(key) ? (
                  <DonutChart
                    rows={audience[key] as Bucket[]}
                    label={label}
                    onSelect={key === "sexes" ? setSex : undefined}
                  />
                ) : key === "ages" ? (
                  <AgeChart rows={audience.ages} onSelect={setAge} />
                ) : (
                  <Bars rows={audience[key] as Bucket[]} />
                )}
              </div>
            ))}
          </div>
          <p className="small">
            초진설문지는 등록 전 제출자도 포함하고 상담 구분이 확인된 자료를
            집계합니다. 베가스의 시술별 내역·중간 방문일은 추정하지 않습니다.
          </p>
        </section>
      )}
      <section className="card">
        <h2>코디메이트 상담 · 연령과 성별로 비교</h2>
        <p className="small">
          선택한 기간에 작성한 상담 기준입니다. 여러 카테고리를 고른 환자는 각
          카테고리에 한 번씩 포함됩니다. 성공률은 성공 ÷ (성공+실패), 보류는
          제외합니다.
        </p>
        <div className="analytics-filter-fields">
          <label>
            연령대
            <select
              aria-label="마케팅 연령대"
              value={age}
              onChange={(e) => setAge(e.target.value)}
            >
              <option value="">전체 연령</option>
              {[
                "20세 미만",
                "20대",
                "30대",
                "40대",
                "50대",
                "60대",
                "70세 이상",
                "미입력",
              ].map((a) => (
                <option key={a}>{a}</option>
              ))}
            </select>
          </label>
          <label>
            성별
            <select
              aria-label="마케팅 성별"
              value={sex}
              onChange={(e) => setSex(e.target.value)}
            >
              <option value="">전체 성별</option>
              {["여성", "남성", "미입력"].map((x) => (
                <option key={x}>{x}</option>
              ))}
            </select>
          </label>
        </div>
        <CategoryHeatmap
          rows={report.marketing || []}
          sex={sex}
          onSelect={setAge}
        />
        <InteractiveTrend rows={report.monthly} financial={report.financial} />
        <div className="analytics-grid">
          {(["category", "source"] as const).map((d) => (
            <div key={d}>
              <h3>{d === "category" ? "인기 카테고리" : "유입경로별 상담"}</h3>
              <Bars
                rows={grouped
                  .filter((r) => r.dimension === d)
                  .map((r) => ({ name: r.name, count: r.patients }))}
              />
              <div className="analytics-table-scroll">
                <table>
                  <thead>
                    <tr>
                      <th>{d === "category" ? "카테고리" : "유입경로"}</th>
                      <th>환자</th>
                      <th>상담</th>
                      <th>성공률</th>
                      {d === "source" && report.financial && (
                        <th>환자당 실수납</th>
                      )}
                    </tr>
                  </thead>
                  <tbody>
                    {grouped
                      .filter((r) => r.dimension === d)
                      .map((r) => (
                        <tr key={r.name}>
                          <th>{r.name}</th>
                          <td>{r.patients}명</td>
                          <td>{r.consultations}건</td>
                          <td>
                            {r.success + r.failed
                              ? (
                                  (100 * r.success) /
                                  (r.success + r.failed)
                                ).toFixed(1) + "%"
                              : "결과 대기"}
                          </td>
                          {d === "source" && report.financial && (
                            <td>
                              {money(
                                Math.round(r.net / Math.max(1, r.patients)),
                              )}
                            </td>
                          )}
                        </tr>
                      ))}
                  </tbody>
                </table>
              </div>
            </div>
          ))}
        </div>
        <p className="small">
          유입경로별 실수납은 조회 종료일까지 해당 상담에 기록된 현금성 수납에서
          환불을 뺀 금액입니다. 표본이 적은 그룹은 순위·성공률 해석에 주의해
          주세요.
        </p>
      </section>
    </>
  );
}
