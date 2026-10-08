import { useState } from "react";
import type { Bucket, Performance } from "../core/analytics";
import type { MarketingRow } from "../core/marketingAnalytics";
import "./AnalyticsCharts.css";
const colors = [
  "#176b61",
  "#d78b42",
  "#597bc4",
  "#a96894",
  "#76a35c",
  "#8b7f70",
  "#46a7b0",
  "#b66150",
];
const n = (v: number) => v.toLocaleString("ko-KR");
export function DonutChart({
  rows,
  label,
  onSelect,
}: {
  rows: Bucket[];
  label: string;
  onSelect?: (name: string) => void;
}) {
  const [focus, setFocus] = useState(""),
    total = rows.reduce((s, r) => s + r.count, 0),
    active = rows.find((r) => r.name === focus);
  let offset = 0;
  return (
    <figure className="insight-chart insight-donut">
      <svg
        viewBox="0 0 240 240"
        aria-label={`${label}: ${rows.map((r) => r.name + " " + n(r.count) + "명").join(", ")}`}
      >
        <circle
          cx="120"
          cy="120"
          r="84"
          fill="none"
          stroke="#e9eeeb"
          strokeWidth="30"
        />
        {rows.map((r, i) => {
          const length = total ? (r.count / total) * 100 : 0,
            start = offset;
          offset += length;
          return (
            <circle
              key={r.name}
              className="insight-ring"
              pathLength="100"
              cx="120"
              cy="120"
              r="84"
              fill="none"
              stroke={colors[i % colors.length]}
              strokeWidth={focus === r.name ? 36 : 30}
              strokeDasharray={`${Math.max(0, length - 0.5)} ${100 - Math.max(0, length - 0.5)}`}
              strokeDashoffset={-start}
              transform="rotate(-90 120 120)"
              opacity={focus && focus !== r.name ? 0.4 : 1}
              tabIndex={0}
              role="button"
              aria-label={`${r.name} ${n(r.count)}명 ${((100 * r.count) / (total || 1)).toFixed(1)}%`}
              onFocus={() => setFocus(r.name)}
              onMouseEnter={() => setFocus(r.name)}
              onMouseLeave={() => setFocus("")}
              onClick={() => {
                setFocus(r.name);
                onSelect?.(r.name);
              }}
              onKeyDown={(e) => {
                if (["Enter", " "].includes(e.key)) {
                  e.preventDefault();
                  setFocus(r.name);
                  onSelect?.(r.name);
                }
              }}
            >
              <title>
                {r.name}: {n(r.count)}명
              </title>
            </circle>
          );
        })}
        <text x="120" y="114" textAnchor="middle" className="insight-total">
          {n(active?.count ?? total)}
        </text>
        <text x="120" y="139" textAnchor="middle" className="insight-subtitle">
          {active
            ? `${((100 * active.count) / (total || 1)).toFixed(1)}%`
            : "명 · 전체"}
        </text>
      </svg>
      <figcaption>
        <span className="sr-only">{label}</span>
        {rows.map((r, i) => (
          <button
            type="button"
            key={r.name}
            onClick={() => {
              setFocus(r.name);
              onSelect?.(r.name);
            }}
            aria-pressed={focus === r.name}
          >
            <i style={{ background: colors[i % colors.length] }} />
            <span>{r.name}</span>
            <strong>{n(r.count)}</strong>
            <small>{((100 * r.count) / (total || 1)).toFixed(1)}%</small>
          </button>
        ))}
        {!rows.length && <p>해당 자료가 없습니다.</p>}
      </figcaption>
    </figure>
  );
}
const ageOrder = [
  "20세 미만",
  "20대",
  "30대",
  "40대",
  "50대",
  "60대",
  "70세 이상",
  "미입력",
];
export function AgeChart({
  rows,
  onSelect,
}: {
  rows: Bucket[];
  onSelect: (name: string) => void;
}) {
  const max = Math.max(1, ...rows.map((r) => r.count)),
    [focus, setFocus] = useState("");
  return (
    <figure className="insight-chart">
      <div
        className="insight-columns"
        role="group"
        aria-label="연령대별 환자 수 · 누르면 상담 분석 연령 필터 적용"
      >
        {ageOrder.map((name, i) => {
          const count = rows.find((r) => r.name === name)?.count || 0;
          return (
            <button
              type="button"
              className={focus === name ? "selected" : ""}
              key={name}
              onClick={() => {
                setFocus(name);
                onSelect(name);
              }}
              aria-label={`${name} ${n(count)}명, 상담 분석 보기`}
            >
              <span className="insight-column-value">{n(count)}</span>
              <span className="insight-column-track">
                <i
                  style={{
                    height: `${(count / max) * 100}%`,
                    background: colors[i % colors.length],
                  }}
                />
              </span>
              <span>{name === "20세 미만" ? "~19세" : name}</span>
            </button>
          );
        })}
      </div>
      <figcaption className="small">
        막대를 누르면 아래 상담 분석의 연령대가 선택됩니다.
      </figcaption>
    </figure>
  );
}
export function CategoryHeatmap({
  rows,
  sex,
  onSelect,
}: {
  rows: MarketingRow[];
  sex: string;
  onSelect: (age: string) => void;
}) {
  const filtered = rows.filter(
    (r) => r.dimension === "category" && (!sex || r.sex === sex),
  );
  const totals = new Map<string, number>();
  for (const r of filtered)
    totals.set(r.name, (totals.get(r.name) || 0) + r.patients);
  const categories = [...totals]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 8)
      .map((r) => r[0]),
    ages = ageOrder.filter((a) => filtered.some((r) => r.age === a));
  const cells = categories.map((category) =>
      ages.map((age) =>
        filtered
          .filter((r) => r.name === category && r.age === age)
          .reduce((n, r) => n + r.patients, 0),
      ),
    ),
    max = Math.max(1, ...cells.flat());
  const [hint, setHint] = useState(
    "칸을 누르면 해당 연령대 상담을 비교합니다.",
  );
  return (
    <figure className="insight-chart">
      <div className="analytics-table-scroll">
        <table className="insight-heatmap">
          <caption>
            연령대 × 인기 카테고리 · 색이 진할수록 환자가 많습니다
          </caption>
          <thead>
            <tr>
              <th>카테고리</th>
              {ages.map((a) => (
                <th key={a}>{a}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {categories.map((c, i) => (
              <tr key={c}>
                <th>{c}</th>
                {ages.map((a, j) => (
                  <td key={a}>
                    <button
                      type="button"
                      style={{
                        background: `rgba(23,107,97,${0.05 + (0.9 * cells[i][j]) / max})`,
                        color: cells[i][j] / max > 0.5 ? "white" : "#24453e",
                      }}
                      aria-label={`${a} ${c}: ${cells[i][j]}명`}
                      onMouseEnter={() =>
                        setHint(`${a} · ${c}: ${n(cells[i][j])}명`)
                      }
                      onFocus={() =>
                        setHint(`${a} · ${c}: ${n(cells[i][j])}명`)
                      }
                      onClick={() => {
                        onSelect(a);
                        setHint(`${a} · ${c}: ${n(cells[i][j])}명`);
                      }}
                    >
                      {cells[i][j] || "–"}
                    </button>
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <figcaption role="status">
        {categories.length ? hint : "해당 기간 상담이 없습니다."}
      </figcaption>
    </figure>
  );
}
export function InteractiveTrend({
  rows,
  financial,
  onPeriod,
}: {
  rows: Performance[];
  financial: boolean;
  onPeriod?: (month: string) => void;
}) {
  const [metric, setMetric] = useState<"consultations" | "net">(
      "consultations",
    ),
    [selected, setSelected] = useState("");
  const key = financial ? metric : "consultations";
  const values = rows.map((r) => r[key]),
    low = Math.min(0, ...values),
    high = Math.max(1, ...values),
    span = high - low;
  const x = (i: number) =>
      60 + (rows.length === 1 ? 290 : (i * 580) / Math.max(1, rows.length - 1)),
    y = (v: number) => 190 - ((v - low) / span) * 150;
  const picked = rows.find((r) => r.id === selected) || rows.at(-1),
    format = (v: number) => n(v) + (key === "net" ? "원" : "건");
  return (
    <figure className="insight-chart insight-trend">
      <div className="button-row" role="group" aria-label="추이 지표">
        <button
          type="button"
          aria-pressed={key === "consultations"}
          className={key === "consultations" ? "primary" : ""}
          onClick={() => setMetric("consultations")}
        >
          월별 상담 수
        </button>
        {financial && (
          <button
            type="button"
            aria-pressed={key === "net"}
            className={key === "net" ? "primary" : ""}
            onClick={() => setMetric("net")}
          >
            월별 실수납
          </button>
        )}
      </div>
      <svg
        viewBox="0 0 700 235"
        aria-label={rows.map((r) => r.name + " " + format(r[key])).join(", ")}
      >
        {[0, 0.5, 1].map((t) => {
          const v = low + span * t;
          return (
            <g key={t}>
              <line
                x1="60"
                x2="640"
                y1={y(v)}
                y2={y(v)}
                stroke="#dce5df"
                strokeDasharray="3 4"
              />
              <text x="53" y={y(v) + 4} textAnchor="end" fontSize="11">
                {Math.round(v).toLocaleString("ko-KR", { notation: "compact" })}
              </text>
            </g>
          );
        })}
        <polyline
          className="insight-line"
          key={key + rows.map((r) => r[key]).join(",")}
          points={rows.map((r, i) => `${x(i)},${y(r[key])}`).join(" ")}
          fill="none"
          stroke="#176b61"
          strokeWidth="3"
          pathLength="1"
        />
        {rows.map((r, i) => (
          <g
            key={r.id}
            tabIndex={0}
            role="button"
            aria-label={`${r.name} ${format(r[key])}`}
            onFocus={() => setSelected(r.id)}
            onMouseEnter={() => setSelected(r.id)}
            onClick={() => {
              setSelected(r.id);
              onPeriod?.(r.id);
            }}
            onKeyDown={(e) => {
              if (["Enter", " "].includes(e.key)) {
                e.preventDefault();
                setSelected(r.id);
                onPeriod?.(r.id);
              }
            }}
          >
            <circle cx={x(i)} cy={y(r[key])} r="15" fill="transparent" />
            <circle
              cx={x(i)}
              cy={y(r[key])}
              r={selected === r.id ? 6 : 4}
              fill="#176b61"
            />
            {(rows.length <= 12 || i === 0 || i === rows.length - 1) && (
              <text x={x(i)} y="220" textAnchor="middle" fontSize="11">
                {r.name.slice(2)}
              </text>
            )}
          </g>
        ))}
      </svg>
      <figcaption role="status">
        {picked
          ? `${picked.name} · ${format(picked[key])}`
          : "해당 자료가 없습니다."}
        {onPeriod && " · 점을 누르면 해당 월로 조회합니다."}
      </figcaption>
    </figure>
  );
}
