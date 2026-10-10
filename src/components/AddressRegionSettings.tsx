import { useState } from "react";
import { api } from "../lib/api";
type Status = {
  configured: boolean;
  directoryReady: boolean;
  scan: { processed: number; done: number };
  counts: Record<string, number>;
  error: string;
};
export function AddressRegionSettings() {
  const [data, setData] = useState<Status>(),
    [key, setKey] = useState(""),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  async function request(body?: object) {
    setBusy(true);
    setError("");
    try {
      setData(
        await api<Status>(
          "/address-regions",
          body ? { method: "POST", body: JSON.stringify(body) } : undefined,
        ),
      );
      if (body) setKey("");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <details
      className="card"
      onToggle={(e) => {
        if (e.currentTarget.open && !data && !busy) void request();
      }}
    >
      <summary>주소 자동 연결 · 동 단위 통계</summary>
      <p>
        춘천의 동·읍·면만 입력한 주소도 집계합니다. 도로명은 건물번호까지
        일치하는 지번 주소의 동·읍·면에 연결하며, 원래 입력한 주소는 유지합니다.
      </p>
      <p className="small">
        같은 도로명·건물번호는 한 번 조회한 결과를 재사용합니다. 조회 서비스에는
        이름·전화번호·상세 동호수 없이 도로명과 건물번호만 전달합니다. 일치하는
        주소를 확인하지 못하면 계속 ‘확인 필요’로 표시합니다.
      </p>
      {data && (
        <>
          <p role="status">
            {data.configured
              ? "도로명 자동 조회 연결됨"
              : "도로명 자동 조회 연결 필요"}{" "}
            ·{" "}
            {!data.scan.done
              ? `기존 주소 점검 중 · ${data.scan.processed.toLocaleString()}명`
              : !data.configured
                ? "주소 목록 점검 완료 · 조회 키 연결 필요"
                : data.error
                  ? "자동 조회 중단 · 연결 설정 확인 필요"
                  : data.counts.pending || data.counts.applying
                    ? "주소 목록 점검 완료 · 조회·통계 반영 진행 중"
                    : "자동 처리 종료 · 미연결 주소는 확인 필요"}
          </p>
          <p className="small">
            도로명 주소 기준: 연결 {data.counts.resolved || 0}개 · 조회 대기{" "}
            {data.counts.pending || 0}개 · 통계 반영 중{" "}
            {data.counts.applying || 0}개 · 조회 결과 미연결{" "}
            {(data.counts.unresolved || 0) +
              (data.counts.failed || 0) +
              (data.counts.blocked || 0)}
            개
          </p>
          <p className="small">
            위 수치는 도로명 조회 대상으로 인식한 주소 기준입니다. 자동 처리
            종료가 모든 환자의 지역 연결 완료를 뜻하지는 않습니다. 주소 누락,
            건물번호 누락 또는 조회 결과가 불명확한 주소는 ‘주소 확인 필요’로
            남습니다.
          </p>
        </>
      )}
      <form
        onSubmit={(e) => {
          e.preventDefault();
          void request({ key: key.trim(), restart: true });
        }}
      >
        <label className="field">
          카카오 로컬 REST API 키
          <input
            type="password"
            autoComplete="new-password"
            value={key}
            onChange={(e) => setKey(e.target.value)}
            placeholder={
              data?.configured
                ? "키가 저장되어 있습니다 · 변경할 때만 입력"
                : "REST API 키 입력"
            }
          />
        </label>
        <div className="button-row">
          <button type="submit" disabled={busy || !key.trim()}>
            연결 저장 · 자동 매칭 시작
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={() => void request({ restart: true })}
          >
            기존 주소 다시 점검
          </button>
          <button type="button" disabled={busy} onClick={() => void request()}>
            진행 상태 확인
          </button>
          {data?.configured && (
            <button
              type="button"
              disabled={busy}
              onClick={() => void request({ remove: true })}
            >
              조회 연결 해제
            </button>
          )}
        </div>
      </form>
      <p className="small">
        <a
          href="https://developers.kakao.com/docs/latest/ko/local/dev-guide"
          target="_blank"
          rel="noreferrer"
        >
          카카오 로컬 API 안내
        </a>{" "}
        · 키는 서버에 암호화하여 보관하고 다시 표시하지 않습니다. 연결 후에는
        화면을 닫아도 백그라운드에서 순차 처리합니다.
      </p>
      {(error || data?.error) && (
        <p role="alert" className="error">
          {error || data?.error}
        </p>
      )}
    </details>
  );
}
