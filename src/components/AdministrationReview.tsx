import { useEffect, useState } from "react";
import { api } from "../lib/api";
import type { State, User } from "../core/model";
type Entry = {
  id: string;
  at: string;
  actorId: string;
  action: string;
  targetId: string;
  detail: string;
  backedUp: boolean;
};
const labels: Record<string, string> = {
  "patient.view": "환자 상세 열람",
  "consultation.view": "상담 상세 열람",
  "statistics.view": "통계 열람",
  "admin.handover.request": "관리자 인계 요청",
  "admin.handover.complete": "관리자 인계 완료",
};
export function AdministrationReview({
  state,
  user,
  work,
  refresh,
}: {
  state: State;
  user: User;
  work: (fn: () => Promise<unknown>) => unknown;
  refresh: () => Promise<unknown>;
}) {
  const [entries, setEntries] = useState<Entry[]>([]),
    [next, setNext] = useState<string | null>(null),
    [error, setError] = useState(""),
    [loading, setLoading] = useState(false);
  const load = async (before = "") => {
    setLoading(true);
    setError("");
    try {
      const d = await api("/access-log?" + new URLSearchParams({ before }));
      setEntries(d.entries);
      setNext(d.next);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => {
    void load();
  }, []);
  return (
    <div className="detail-grid">
      <section className="card">
        <div className="section-title">
          <h3>조회·관리자 인계 기록</h3>
          <button disabled={loading} onClick={() => void load()}>
            최신 기록
          </button>
        </div>
        <p className="small">
          기능 적용 이후 환자·상담 상세 및 통계 열람을 기록합니다. 기록은 서버에
          암호화 저장되고 OneDrive에 순차 보관됩니다.
        </p>
        {error && <p role="alert">{error}</p>}
        <div className="analytics-table-scroll">
          <table>
            <thead>
              <tr>
                <th>시각</th>
                <th>직원</th>
                <th>작업</th>
                <th>대상·사유</th>
                <th>백업</th>
              </tr>
            </thead>
            <tbody>
              {entries.map((e) => (
                <tr key={e.id}>
                  <td>{new Date(e.at).toLocaleString("ko-KR")}</td>
                  <td>
                    {state.users.find((u) => u.id === e.actorId)?.name ||
                      e.actorId}
                  </td>
                  <td>{labels[e.action] || e.action}</td>
                  <td>
                    {e.targetId}
                    <small>{e.detail}</small>
                  </td>
                  <td>{e.backedUp ? "보관 완료" : "보관 대기"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <button disabled={!next || loading} onClick={() => void load(next!)}>
          이전 기록 50개
        </button>
      </section>
      <section className="card">
        <h3>관리자 인계</h3>
        <p>
          선택한 직원에게 관리자 기본권한을 적용하고 인계 사유를 기록합니다.
        </p>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            const data = new FormData(e.currentTarget),
              target = state.users.find((u) => u.id === data.get("targetId"));
            if (
              !window.confirm(
                `${target?.name} 직원에게 관리자 권한을 인계할까요?`,
              )
            )
              return;
            work(async () => {
              await api("/admin-handover", {
                method: "POST",
                body: JSON.stringify({
                  targetId: data.get("targetId"),
                  reason: data.get("reason"),
                  password: data.get("password"),
                  keepAdministrator: data.get("keepAdministrator") === "on",
                }),
              });
              await refresh();
              await load();
            });
          }}
        >
          <label className="field">
            인계받을 직원
            <select name="targetId" required defaultValue="">
              <option value="">직원 선택</option>
              {state.users
                .filter((u) => u.active && u.id !== user.id)
                .map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.name}
                  </option>
                ))}
            </select>
          </label>
          <label className="field">
            인계 사유
            <textarea name="reason" required minLength={2} maxLength={1000} />
          </label>
          <label className="field">
            현재 관리자 비밀번호
            <input
              name="password"
              type="password"
              autoComplete="current-password"
              required
            />
          </label>
          <label className="check">
            <input type="checkbox" name="keepAdministrator" defaultChecked />내
            관리자 권한 유지
          </label>
          <p className="small">
            해제하면 인계 성공 후 내 권한등급은 임원으로 바뀝니다. 인계받는
            직원의 직무는 그대로 유지됩니다.
          </p>
          <button className="primary">관리자 인계 확정</button>
        </form>
      </section>
    </div>
  );
}
