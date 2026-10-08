import { useState } from "react";
import { api } from "../lib/api";
export function ReadProtectionStatus() {
  const [data, setData] = useState<any>(),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  const refresh = async () => {
    setBusy(true);
    setError("");
    try {
      setData(await api("/read-protection"));
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <details
      className="card"
      onToggle={(e) => {
        if (e.currentTarget.open && !data && !busy) void refresh();
      }}
    >
      <summary>조회 보호 · 서버 상태</summary>
      <p>
        과도한 조회는 잠시 제한하고 저장과 로그인은 유지합니다. 이 수치는 앱이
        측정한 SQL 읽기이며 청구 금액은 아닙니다.
      </p>
      <button disabled={busy} onClick={() => void refresh()}>
        {busy ? "확인 중…" : "현재 상태 확인"}
      </button>
      {error && (
        <p role="alert" className="error">
          {error}
        </p>
      )}
      {data && (
        <>
          <p
            role={data.warning || data.circuits.length ? "alert" : "status"}
            className={data.warning || data.circuits.length ? "error" : ""}
          >
            {data.circuits.length
              ? "일부 조회를 잠시 제한 중입니다."
              : data.warning
                ? "조회량이 늘고 있습니다."
                : "조회 보호가 정상 작동 중입니다."}
          </p>
          <dl>
            <dt>이번 분 읽기</dt>
            <dd>
              {data.minuteReads.toLocaleString()} /{" "}
              {data.minuteLimit.toLocaleString()}
            </dd>
            <dt>최근 1시간 읽기 · 제한</dt>
            <dd>
              {data.lastHour.reads.toLocaleString()}행 · {data.lastHour.blocked}
              회
            </dd>
            <dt>환자 검색 색인</dt>
            <dd>
              {data.directory.ready
                ? "준비 완료"
                : `준비 중 · ${data.directory.processed.toLocaleString()}명 처리`}
              {data.directory.dirty ? " · 변경분 반영 대기" : ""}
            </dd>
          </dl>
        </>
      )}
    </details>
  );
}
