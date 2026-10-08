import { useEffect, useRef, useState } from "react";
import { api } from "../lib/api";
type Status = {
  configured: boolean;
  cursor: number;
  total: number;
  done: boolean;
  updated: string;
  unclassified: number;
};
export function IntakeStatisticsSync({
  onComplete,
}: {
  onComplete: () => void;
}) {
  const [status, setStatus] = useState<Status>(),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const controller = useRef<AbortController | undefined>(undefined),
    callback = useRef(onComplete);
  callback.current = onComplete;
  async function sync(signal: AbortSignal) {
    setBusy(true);
    setError("");
    try {
      for (;;) {
        const next = await api<Status>(
          "/intake/analytics-sync",
          { method: "POST", body: "{}", signal },
          { operation: null },
        );
        if (signal.aborted) return;
        setStatus(next);
        if (next.done) {
          callback.current();
          break;
        }
      }
    } catch (e) {
      if (!signal.aborted) setError((e as Error).message);
    } finally {
      if (!signal.aborted) setBusy(false);
    }
  }
  useEffect(() => {
    const c = new AbortController();
    controller.current = c;
    void api<Status>("/intake/analytics-status", { signal: c.signal })
      .then((s) => {
        if (c.signal.aborted) return;
        setStatus(s);
        if (s.configured && !s.done) void sync(c.signal);
      })
      .catch((e) => {
        if (!c.signal.aborted) setError(e.message);
      });
    return () => c.abort();
  }, []);
  return (
    <div className="card">
      <div className="button-row">
        <strong>초진설문지 통계</strong>
        <button
          type="button"
          disabled={busy || !status?.configured}
          onClick={() => {
            controller.current?.abort();
            const c = new AbortController();
            controller.current = c;
            void sync(c.signal);
          }}
        >
          {busy ? "설문지 요약 갱신 중…" : "설문지 통계 갱신"}
        </button>
      </div>
      {busy && (
        <>
          <progress
            aria-label="설문지 통계 진행률"
            max={100}
            value={
              status?.total
                ? Math.min(99, (100 * status.cursor) / status.total)
                : undefined
            }
          />
          <p role="status">
            {status?.total
              ? `${status.cursor.toLocaleString()} / ${status.total.toLocaleString()}건`
              : "원본 목록을 확인하고 있습니다."}{" "}
            · 화면을 나가도 완료한 부분부터 이어서 진행합니다. 갱신 중에는
            이전·일부 결과가 보일 수 있습니다.
          </p>
        </>
      )}
      {status?.configured === false && (
        <p className="small">
          초진설문지 연동 설정 후 등록 전 설문 제출자도 집계할 수 있습니다.
        </p>
      )}
      {status?.done && !busy && (
        <p className="small">
          설문지 {status.total.toLocaleString()}건 확인 ·{" "}
          {new Date(status.updated).toLocaleString("ko-KR")} 갱신. 새
          설문지·수정사항은 갱신 버튼으로 반영합니다.
        </p>
      )}
      {!!status?.unclassified && (
        <p className="small">
          상담 구분이 비어 있는 설문 {status.unclassified}건은 미용·진료를
          추정하지 않고 환자군 집계에서 제외합니다.
        </p>
      )}
      {error && <p role="alert">{error} · 완료한 작업은 보존됩니다.</p>}
    </div>
  );
}
