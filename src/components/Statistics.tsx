import { useEffect, useMemo, useState } from "react";
import { BarChart3, Download, RefreshCw, Copy, Sparkles } from "lucide-react";
import { api, vaultRead, vaultWrite, vaultEnabled } from "../lib/api";
import { saveDocuments } from "../lib/saveDocuments";
import {
  analyticsPrompt,
  incentiveRows,
  koreanDay,
  type AnalyticsReport,
  type Bucket,
  type IncentiveSettings,
  type Performance,
} from "../core/analytics";
import { analyticsWorkbook } from "../core/analyticsExcel";
import { allowed, money, type User, type State } from "../core/model";
const fmt = (n: number) => n.toLocaleString("ko-KR"),
  pct = (n: number) => n.toFixed(1) + "%";
function Bars({ rows, unit = "명" }: { rows: Bucket[]; unit?: string }) {
  const max = Math.max(1, ...rows.map((r) => Math.abs(r.count)));
  return (
    <div className="analytics-bars">
      {rows.length ? (
        rows.map((r, i) => (
          <div className="analytics-bar" key={r.name}>
            <span>{r.name}</span>
            <div>
              <i
                style={{
                  width: Math.abs(r.count / max) * 100 + "%",
                  background: [
                    "#176b61",
                    "#5b8a80",
                    "#988047",
                    "#78769c",
                    "#7898aa",
                  ][i % 5],
                }}
              />
            </div>
            <b>
              {fmt(r.count)}
              {unit}
            </b>
          </div>
        ))
      ) : (
        <p className="small">해당 기간에 기록된 자료가 없습니다.</p>
      )}
    </div>
  );
}
function Trend({
  rows,
  financial,
}: {
  rows: Performance[];
  financial: boolean;
}) {
  const values = rows.map((r) => (financial ? r.net : r.consultations)),
    max = Math.max(1, ...values.map(Math.abs)),
    w = 720,
    h = 160,
    step = w / Math.max(1, values.length - 1);
  const points = values
    .map(
      (v, i) =>
        `${values.length === 1 ? w / 2 : i * step},${80 - (v / max) * 70}`,
    )
    .join(" ");
  return (
    <figure className="analytics-trend">
      <figcaption>{financial ? "월별 실수납" : "월별 상담 수"} 추이</figcaption>
      <svg
        viewBox={`-5 -10 ${w + 10} ${h + 40}`}
        role="img"
        aria-label={rows
          .map((r, i) => `${r.name} ${fmt(values[i])}`)
          .join(", ")}
      >
        <line x1="0" x2={w} y1="80" y2="80" stroke="#d2dfd9" />
        <polyline
          points={points}
          fill="none"
          stroke="#176b61"
          strokeWidth="3"
        />
        {values.map((v, i) => (
          <g key={rows[i].id}>
            <circle
              cx={values.length === 1 ? w / 2 : i * step}
              cy={80 - (v / max) * 70}
              r="4"
              fill="#176b61"
            />
            <title>
              {rows[i].name}: {fmt(v)}
            </title>
            {(rows.length <= 12 || i === 0 || i === rows.length - 1) && (
              <text
                x={values.length === 1 ? w / 2 : i * step}
                y="180"
                textAnchor={
                  i === 0 ? "start" : i === rows.length - 1 ? "end" : "middle"
                }
                fontSize="12"
              >
                {rows[i].name}
              </text>
            )}
          </g>
        ))}
      </svg>
    </figure>
  );
}
function PerformanceTable({
  rows,
  financial,
}: {
  rows: Performance[];
  financial: boolean;
}) {
  return (
    <div className="analytics-table-scroll">
      <table>
        <thead>
          <tr>
            {[
              "직원 / 분야",
              "상담",
              "성공",
              "실패",
              "보류",
              "전환율",
              ...(financial
                ? ["계약", "실수납", "환불", "미수", "할인", "평균 계약"]
                : []),
            ].map((x) => (
              <th key={x}>{x}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.id}>
              <th>{r.name}</th>
              <td>{fmt(r.consultations)}</td>
              <td>{fmt(r.success)}</td>
              <td>{fmt(r.failed)}</td>
              <td>{fmt(r.held)}</td>
              <td>
                {pct(r.conversion)}
                {r.consultations < 5 && <small> 표본 5건 미만</small>}
              </td>
              {financial &&
                [
                  r.contract,
                  r.net,
                  r.refunds,
                  r.outstanding,
                  r.discount,
                  r.average,
                ].map((v, i) => <td key={i}>{money(v)}</td>)}
            </tr>
          ))}
        </tbody>
      </table>
      {!rows.length && <p>조회 결과가 없습니다.</p>}
    </div>
  );
}
export function Statistics({
  state,
  user,
  work,
  send,
}: {
  state: State;
  user: User;
  work: (f: () => Promise<any>) => any;
  send: (...args: any[]) => Promise<any>;
}) {
  const today = koreanDay(new Date().toISOString());
  const [from, setFrom] = useState(today.slice(0, 7) + "-01"),
    [to, setTo] = useState(today),
    [ownerId, setOwner] = useState(""),
    [book, setBook] = useState(""),
    [purpose, setPurpose] = useState<"employee" | "patient">("employee");
  const [report, setReport] = useState<AnalyticsReport | null>(null),
    [loading, setLoading] = useState(false),
    [error, setError] = useState(""),
    [refresh, setRefresh] = useState(0);
  const [settings, setSettings] = useState<IncentiveSettings>({
      basis: "net",
      defaultRate: 3,
      floorZero: false,
      rates: {},
    }),
    [configReady, setConfigReady] = useState(false);
  const [question, setQuestion] = useState(""),
    [promptOpen, setPromptOpen] = useState(false),
    [message, setMessage] = useState("");
  useEffect(() => {
    let active = true;
    vaultRead<IncentiveSettings>("incentive-settings")
      .then((v) => {
        if (active) {
          if (v) setSettings(v);
          setConfigReady(true);
        }
      })
      .catch(() => setConfigReady(true));
    return () => {
      active = false;
    };
  }, [user.id]);
  useEffect(() => {
    if (configReady && vaultEnabled())
      void vaultWrite("incentive-settings", settings);
  }, [settings, configReady]);
  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setError("");
    setReport(null);
    const timer = setTimeout(() => {
      api<AnalyticsReport>(
        "/analytics?" + new URLSearchParams({ from, to, ownerId, book }),
        { signal: controller.signal },
      )
        .then(setReport)
        .catch((e) => {
          if (e.name !== "AbortError") setError(e.message);
        })
        .finally(() => {
          if (!controller.signal.aborted) setLoading(false);
        });
    }, 200);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [from, to, ownerId, book, refresh]);
  const incentive = useMemo(
    () => (report ? incentiveRows(report, settings) : []),
    [report, settings],
  );
  const prompt = useMemo(
    () => (report ? analyticsPrompt(report, purpose, question, settings) : ""),
    [report, purpose, question, settings],
  );
  const exportFile = () =>
    work(async () => {
      if (!report) return;
      if (!(await send("audit.export", { format: "statistics-xlsx" }))) return;
      await saveDocuments([
        {
          name: `코디메이트_${purpose === "employee" ? "직원통계" : "환자통계"}_${from}_${to}.xlsx`,
          blob: await analyticsWorkbook(report, purpose, settings),
        },
      ]);
    });
  const card = (label: string, value: string, detail?: string) => (
    <div className="analytics-kpi" key={label}>
      <span>{label}</span>
      <strong>{value}</strong>
      {detail && <small>{detail}</small>}
    </div>
  );
  return (
    <section className="analytics-page">
      <div className="section-title">
        <div>
          <p className="eyebrow">CODIMATE INSIGHTS</p>
          <h1>성과·환자 분석</h1>
          <p className="small">
            직원의 강점과 환자 상담 흐름을 함께 확인하세요.
          </p>
        </div>
        <button onClick={() => setRefresh((x) => x + 1)} disabled={loading}>
          <RefreshCw size={16} />
          최신 통계
        </button>
      </div>
      <div className="card analytics-filters">
        <div className="tabs">
          {(["employee", "patient"] as const).map((p) => (
            <button
              key={p}
              className={purpose === p ? "active" : ""}
              onClick={() => setPurpose(p)}
            >
              {p === "employee" ? "직원 성과" : "환자·마케팅"}
            </button>
          ))}
        </div>
        <div className="analytics-filter-fields">
          <label>
            시작일
            <input
              aria-label="통계 시작일"
              type="date"
              value={from}
              onChange={(e) => setFrom(e.target.value)}
            />
          </label>
          <label>
            종료일
            <input
              aria-label="통계 종료일"
              type="date"
              value={to}
              onChange={(e) => setTo(e.target.value)}
            />
          </label>
          <label>
            담당 직원
            <select
              aria-label="담당 직원"
              value={ownerId}
              onChange={(e) => setOwner(e.target.value)}
            >
              <option value="">전체 직원</option>
              {state.users.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.name}
                  {u.active ? "" : " (퇴사·비활성)"}
                </option>
              ))}
            </select>
          </label>
          <label>
            단가표 구분
            <select
              aria-label="단가표 구분"
              value={book}
              onChange={(e) => setBook(e.target.value)}
            >
              <option value="">전체 구분</option>
              {["미용", "보험", "이벤트"].map((b) => (
                <option key={b}>{b}</option>
              ))}
            </select>
          </label>
          <button
            onClick={() => {
              setFrom(today.slice(0, 4) + "-01-01");
              setTo(today);
            }}
          >
            올해
          </button>
          <button
            onClick={() => {
              setFrom(today.slice(0, 7) + "-01");
              setTo(today);
            }}
          >
            이번 달
          </button>
        </div>
      </div>
      {loading && (
        <div role="status" className="card">
          통계를 집계하고 있습니다…
        </div>
      )}
      {error && (
        <p role="alert" className="error">
          {error}
        </p>
      )}
      {report && (
        <>
          <div className="analytics-actions">
            <button disabled={!allowed(user, "export")} onClick={exportFile}>
              <Download size={16} />
              {purpose === "employee" ? "직원통계" : "환자통계"} Excel
            </button>
            <button
              disabled={!allowed(user, "export")}
              onClick={() => setPromptOpen((v) => !v)}
            >
              <Sparkles size={16} />
              통계 해석 프롬프트
            </button>
            <small>
              {new Date(report.generatedAt).toLocaleString("ko-KR")} 기준 · 서버
              저장 완료 자료
            </small>
          </div>
          {!report.financial && (
            <p className="notice">
              금액 열람 권한이 없어 건수·비율만 표시합니다.
            </p>
          )}
          {purpose === "employee" ? (
            <>
              <div className="analytics-kpis">
                {card(
                  "상담 전환율",
                  pct(report.totals.conversion),
                  `성공 ${report.totals.success} · 실패 ${report.totals.failed} · 보류 ${report.totals.held}`,
                )}
                {card(
                  "상담 수",
                  fmt(report.totals.consultations) + "건",
                  `취소 ${report.totals.cancelled}건 제외`,
                )}
                {report.financial && (
                  <>
                    {card(
                      "계약금액",
                      money(report.totals.contract),
                      "상담 작성일 기준",
                    )}
                    {card(
                      "실수납",
                      money(report.totals.net),
                      `수납 ${money(report.totals.receipts)} − 환불 ${money(report.totals.refunds)}`,
                    )}
                    {card(
                      "미수 잔액",
                      money(report.totals.outstanding),
                      "조회 종료일 기준",
                    )}
                    {card(
                      "평균 계약",
                      money(report.totals.average),
                      "성공 상담당 계약금액",
                    )}
                  </>
                )}
              </div>
              <div className="analytics-grid">
                <div className="card">
                  <Trend rows={report.monthly} financial={report.financial} />
                </div>
                <div className="card">
                  <h3>
                    <BarChart3 size={18} /> 직원별{" "}
                    {report.financial ? "실수납" : "성공 상담"}
                  </h3>
                  <Bars
                    rows={report.employees.map((r) => ({
                      name: r.name,
                      count: report.financial ? r.net : r.success,
                    }))}
                    unit={report.financial ? "원" : "건"}
                  />
                </div>
              </div>
              <div className="card">
                <h3>직원별 성과</h3>
                <PerformanceTable
                  rows={report.employees}
                  financial={report.financial}
                />
              </div>
              <div className="card">
                <h3>직원별 강점 · 분야별 성과</h3>
                <p className="small">
                  분야별 상담·전환율과 금액을 함께 비교하세요. 표본이 작은
                  분야는 순위만으로 평가하지 마세요.
                </p>
                <PerformanceTable
                  rows={report.strengths.map((r) => ({
                    ...r,
                    name: r.name + " / " + r.book,
                  }))}
                  financial={report.financial}
                />
              </div>
              {report.financial && (
                <details className="card analytics-incentives">
                  <summary>
                    인센티브 시뮬레이션 · 예상{" "}
                    {money(incentive.reduce((n, r) => n + r.amount, 0))}
                  </summary>
                  <p className="small">
                    기본 3%는 예시입니다. 지급 확정 기능이 아니며 기준과 비율을
                    변경해 비교할 수 있습니다.{" "}
                    {vaultEnabled()
                      ? "설정은 이 기기에 암호화 보관됩니다."
                      : "기기 보관을 켜면 설정도 보관됩니다."}
                  </p>
                  <div className="analytics-filter-fields">
                    <label>
                      계산 기준
                      <select
                        aria-label="계산 기준"
                        value={settings.basis}
                        onChange={(e) =>
                          setSettings({
                            ...settings,
                            basis: e.target.value as IncentiveSettings["basis"],
                          })
                        }
                      >
                        <option value="net">실수납 (수납−환불)</option>
                        <option value="receipts">수납 (환불 미차감)</option>
                        <option value="contract">계약금액</option>
                      </select>
                    </label>
                    <label>
                      기본 지급률 (%)
                      <input
                        type="number"
                        min="0"
                        max="100"
                        step="0.1"
                        value={settings.defaultRate}
                        onChange={(e) =>
                          setSettings({
                            ...settings,
                            defaultRate: Math.min(
                              100,
                              Math.max(0, Number(e.target.value)),
                            ),
                          })
                        }
                      />
                    </label>
                    <label className="check">
                      <input
                        type="checkbox"
                        checked={settings.floorZero}
                        onChange={(e) =>
                          setSettings({
                            ...settings,
                            floorZero: e.target.checked,
                          })
                        }
                      />
                      분야별 음수 지급액을 0원으로 제한
                    </label>
                    <button
                      onClick={() => setSettings({ ...settings, rates: {} })}
                    >
                      개별 비율 초기화
                    </button>
                  </div>
                  <div className="analytics-table-scroll">
                    <table>
                      <thead>
                        <tr>
                          <th>직원 · 분야</th>
                          <th>기준금액</th>
                          <th>개별 비율 (%)</th>
                          <th>예상액</th>
                        </tr>
                      </thead>
                      <tbody>
                        {incentive.map((r, i) => (
                          <tr key={report.strengths[i].id}>
                            <th>
                              {r.employee} · {r.book}
                            </th>
                            <td>{money(r.basis)}</td>
                            <td>
                              <input
                                aria-label={r.employee + " 지급률"}
                                type="number"
                                min="0"
                                max="100"
                                step="0.1"
                                placeholder={String(settings.defaultRate)}
                                value={
                                  settings.rates[report.strengths[i].id] ?? ""
                                }
                                onChange={(e) => {
                                  const rates = { ...settings.rates },
                                    id = report.strengths[i].id;
                                  if (e.target.value === "") delete rates[id];
                                  else
                                    rates[id] = Math.min(
                                      100,
                                      Math.max(0, Number(e.target.value)),
                                    );
                                  setSettings({ ...settings, rates });
                                }}
                              />
                            </td>
                            <td>{money(r.amount)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </details>
              )}
            </>
          ) : (
            <>
              <div className="analytics-kpis">
                {card(
                  "상담 환자",
                  fmt(report.patients.consulted) + "명",
                  "기간 내 중복 제외",
                )}
                {card("신규 상담 환자", fmt(report.patients.first) + "명")}
                {card(
                  "재상담 환자",
                  fmt(report.patients.returning) + "명",
                  `재상담 비중 ${pct(report.patients.revisitRate)}`,
                )}
                {card("신규 등록", fmt(report.patients.registered) + "명")}
                {report.financial &&
                  card(
                    "환자당 누적 실수납",
                    money(report.patients.meanLifetimeNet),
                    "조회 환자의 종료일 이전 누적 평균",
                  )}
              </div>
              <div className="analytics-grid">
                {(
                  [
                    ["연령대", "ages"],
                    ["성별", "sexes"],
                    ["유입경로", "sources"],
                    ["지역", "regions"],
                    ["재상담 관리 대상", "segments"],
                    ["환자 등급", "grades"],
                  ] as const
                ).map(([title, key]) => (
                  <div className="card" key={key}>
                    <h3>{title}</h3>
                    <Bars rows={report.patients[key]} />
                  </div>
                ))}
              </div>
              <div className="card">
                <h3>신규 환자 재상담 코호트</h3>
                <p className="small">
                  첫 상담 월별로 묶어 30일·90일 내 재상담을 비교합니다. 아직
                  관찰기간이 지나지 않은 환자는 분모에서 제외합니다.
                </p>
                <div className="analytics-table-scroll">
                  <table>
                    <thead>
                      <tr>
                        <th>첫 상담 월</th>
                        <th>신규 환자</th>
                        <th>30일 재상담</th>
                        <th>90일 재상담</th>
                      </tr>
                    </thead>
                    <tbody>
                      {report.patients.cohorts.map((r) => (
                        <tr key={r.month}>
                          <th>{r.month}</th>
                          <td>{r.patients}명</td>
                          <td>
                            {r.eligible30
                              ? `${pct((r.returned30 / r.eligible30) * 100)} (${r.returned30}/${r.eligible30})`
                              : "관찰 중"}
                          </td>
                          <td>
                            {r.eligible90
                              ? `${pct((r.returned90 / r.eligible90) * 100)} (${r.returned90}/${r.eligible90})`
                              : "관찰 중"}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
              <div className="card">
                <h3>상품 관심 · 상담 전환</h3>
                <div className="analytics-table-scroll">
                  <table>
                    <thead>
                      <tr>
                        <th>상품</th>
                        <th>구분</th>
                        <th>선택 상담</th>
                        <th>성공 상담</th>
                        <th>전환</th>
                        {report.financial && <th>배분 계약금액</th>}
                      </tr>
                    </thead>
                    <tbody>
                      {report.products.map((r, i) => (
                        <tr key={i}>
                          <th>{r.name}</th>
                          <td>{r.book}</td>
                          <td>{r.consultations}</td>
                          <td>{r.success}</td>
                          <td>
                            {pct(
                              r.consultations
                                ? (r.success / r.consultations) * 100
                                : 0,
                            )}
                          </td>
                          {report.financial && <td>{money(r.contract)}</td>}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </>
          )}
          {promptOpen && allowed(user, "export") && (
            <section className="card">
              <h3>LLM 통계 해석 프롬프트 제작기</h3>
              <p className="small">
                집계 자료와 지표 정의로 프롬프트를 만듭니다. 환자 이름·연락처는
                포함하지 않고 직원 이름은 익명으로 바꿉니다. 외부 AI로 자동
                전송하지 않습니다.
              </p>
              <label className="field">
                분석 목적·추가 질문
                <textarea
                  aria-label="분석 목적·추가 질문"
                  value={question}
                  onChange={(e) => setQuestion(e.target.value)}
                  placeholder="예: 재상담 비중을 높이기 위해 다음 달 우선 실행할 일을 제안해줘"
                />
              </label>
              <label className="field">
                완성 프롬프트
                <textarea
                  aria-label="완성 프롬프트"
                  className="analytics-prompt"
                  readOnly
                  value={prompt}
                />
              </label>
              <div className="actions">
                <button
                  onClick={() =>
                    work(async () => {
                      if (
                        !(await send("audit.export", {
                          format: "statistics-prompt",
                        }))
                      )
                        return;
                      await navigator.clipboard.writeText(prompt);
                      setMessage("프롬프트를 복사했습니다.");
                    })
                  }
                >
                  <Copy size={16} />
                  복사
                </button>
                <button
                  onClick={() =>
                    work(async () => {
                      if (
                        !(await send("audit.export", {
                          format: "statistics-prompt",
                        }))
                      )
                        return;
                      await saveDocuments([
                        {
                          name: `통계해석_${purpose}_${to}.txt`,
                          blob: new Blob([prompt], {
                            type: "text/plain;charset=utf-8",
                          }),
                        },
                      ]);
                    })
                  }
                >
                  텍스트 저장
                </button>
              </div>
              <p role="status">{message}</p>
            </section>
          )}
          <details className="card">
            <summary>집계 기준 · 해석 방법</summary>
            {report.definitions.map((d) => (
              <p className="small" key={d}>
                {d}
              </p>
            ))}
          </details>
        </>
      )}
    </section>
  );
}
