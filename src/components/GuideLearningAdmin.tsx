import { useEffect, useState } from "react";
import { api } from "../lib/api";
import type { GuideAccountReport } from "../core/guideLearningReport";
import type { GuideTrack } from "../core/userGuide";
export function GuideLearningAdmin() {
  const [rows, setRows] = useState<GuideAccountReport[]>([]),
    [loading, setLoading] = useState(true),
    [error, setError] = useState(""),
    [query, setQuery] = useState(""),
    [inactive, setInactive] = useState(false),
    [selected, setSelected] = useState(""),
    [track, setTrack] = useState<GuideTrack>("staff"),
    [reload, setReload] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setError("");
    void api<{ accounts: GuideAccountReport[] }>(
      "/guide-progress/accounts",
      {
        signal: AbortSignal.any([
          controller.signal,
          AbortSignal.timeout(15000),
        ]),
      },
      { operation: null },
    )
      .then((r) => {
        if (!controller.signal.aborted) setRows(r.accounts);
      })
      .catch((e) => {
        if (!controller.signal.aborted) setError(e.message);
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [reload]);
  const visible = rows.filter(
    (r) =>
      (inactive || r.active) &&
      r.name.replace(/\s/g, "").includes(query.replace(/\s/g, "")),
  );
  const current = visible.find((r) => r.id === selected) || visible[0];
  return (
    <section className="guide-admin-report" aria-label="직원 학습 현황">
      <div className="guide-admin-heading">
        <div>
          <h2>계정별 사용법 학습 진도</h2>
          <p>
            현재 안내 버전 기준입니다. 학습 완료와 새 안내 확인은 별도로
            표시합니다.
          </p>
        </div>
        <button disabled={loading} onClick={() => setReload((v) => v + 1)}>
          현황 새로고침
        </button>
      </div>
      <div className="guide-admin-tools">
        <input
          type="search"
          aria-label="학습 현황 직원 검색"
          placeholder="직원 이름 검색"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        <label>
          <input
            type="checkbox"
            checked={inactive}
            onChange={(e) => setInactive(e.target.checked)}
          />{" "}
          비활성 계정 포함
        </label>
      </div>
      {error && <p role="alert">{error}</p>}
      {loading && <p role="status">계정별 진도를 불러오는 중입니다.</p>}
      {!loading && !error && (
        <>
          <p>
            {visible.length}개 계정 · 계정을 선택하면 과정별 진도를 볼 수
            있습니다.
          </p>
          <div className="guide-admin-accounts">
            {visible.map((r) => (
              <button
                key={r.id}
                aria-pressed={r.id === current?.id}
                onClick={() => setSelected(r.id)}
              >
                <strong>
                  {r.name}
                  {!r.active && " · 비활성"}
                </strong>
                <span>
                  실무자 {r.staff.completed}/{r.staff.total} · 관리자{" "}
                  {r.admin.completed}/{r.admin.total}
                </span>
                <small>미확인 안내 {r.unread}개</small>
              </button>
            ))}
          </div>
          {!current && <p>해당하는 계정이 없습니다.</p>}
          {current && (
            <div className="guide-admin-detail">
              <h3>{current.name} · 과정별 진도</h3>
              <div
                className="guide-admin-tracks"
                role="group"
                aria-label="직원 학습 과정"
              >
                <button
                  aria-pressed={track === "staff"}
                  onClick={() => setTrack("staff")}
                >
                  실무자 과정
                </button>
                <button
                  aria-pressed={track === "admin"}
                  onClick={() => setTrack("admin")}
                >
                  관리자 과정
                </button>
              </div>
              <p className="small">
                관리자 과정은 담당 업무에 따라 학습합니다. 이전 버전의 완료는
                현재 버전의 완료로 계산하지 않습니다.
              </p>
              <ul>
                {current.lessons
                  .filter((l) => l.track === track)
                  .map((l) => (
                    <li key={l.id}>
                      <div>
                        <strong>{l.title}</strong>
                        <small>
                          {l.acknowledged ? "안내 확인함" : "안내 미확인"}
                        </small>
                      </div>
                      <span
                        className={
                          "guide-learning-state " + (l.completed ? "done" : "")
                        }
                      >
                        {l.completed
                          ? "학습 완료"
                          : l.revised
                            ? "수정 후 재학습 필요"
                            : l.steps
                              ? `진행 중 ${l.steps}/${l.total}단계`
                              : "미시작"}
                      </span>
                      <progress
                        value={l.completed ? l.total : l.steps}
                        max={l.total || 1}
                        aria-label={l.title + " 학습 진도"}
                      />
                    </li>
                  ))}
              </ul>
            </div>
          )}
        </>
      )}
    </section>
  );
}
