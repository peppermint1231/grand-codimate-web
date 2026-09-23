import { useEffect, useRef, useState } from "react";
import { api, lockVault } from "../lib/api";
import type { RestoreStatus } from "../../server/restoreJobs";
export function RestoreJobPanel() {
  const [job, setJob] = useState<RestoreStatus | null>(null),
    [running, setRunning] = useState(false),
    [error, setError] = useState("");
  const active = useRef(true);
  useEffect(() => {
    active.current = true;
    api("/restore-jobs")
      .then((d) => {
        if (active.current) setJob(d.job);
      })
      .catch((e) => {
        if (active.current) setError(e.message);
      });
    return () => {
      active.current = false;
    };
  }, []);
  const action = async (action: string, id = job?.id) => {
    const result = await api(
      "/restore-jobs",
      { method: "POST", body: JSON.stringify({ action, id }) },
      { operation: null },
    );
    if (active.current) setJob(result.job || null);
    return result;
  };
  const run = async () => {
    setRunning(true);
    setError("");
    try {
      let current = job || (await action("start")).job;
      while (active.current && current?.phase === "loading") {
        current = (await action("step", current.id)).job;
      }
    } catch (e) {
      setError((e as Error).message);
    } finally {
      if (active.current) setRunning(false);
    }
  };
  return (
    <section className="restore-job-panel">
      <h4>OneDrive 원본에서 재구축</h4>
      <p className="small">
        원본을 나누어 확인하고 완료 단계에서만 현재 자료를 교체합니다. 화면을
        닫아도 확인한 위치를 보존합니다. 확인 중에는 서버 변경 작업을 잠시
        제한합니다.
      </p>
      {job && (
        <>
          <progress max={job.total || 1} value={job.processed} />
          <p role="status">
            {Math.floor((job.processed / Math.max(1, job.total)) * 100)}% ·{" "}
            {job.processed}/{job.total}개 확인 ·{" "}
            {job.phase === "ready" ? "원본 확인 완료" : "원본 확인 중"}
          </p>
        </>
      )}
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      <div className="button-row">
        {job?.phase !== "ready" && (
          <button
            disabled={running}
            onClick={() => {
              if (
                job ||
                window.confirm(
                  "OneDrive 원본 확인을 시작할까요? 확인하는 동안 서버 변경이 제한됩니다.",
                )
              )
                void run();
            }}
          >
            {running ? "확인 중…" : job ? "이어서 확인" : "원본 확인 시작"}
          </button>
        )}
        {job && (
          <button
            disabled={running}
            onClick={async () => {
              if (
                window.confirm("복구 확인을 취소하고 현재 자료를 유지할까요?")
              )
                try {
                  await action("cancel");
                  setError("");
                } catch (e) {
                  setError((e as Error).message);
                }
            }}
          >
            취소 · 현재 자료 유지
          </button>
        )}
        {job?.phase === "ready" && (
          <button
            className="primary"
            disabled={running}
            onClick={async () => {
              if (
                !window.confirm(
                  "확인한 원본으로 현재 서버 자료와 계정을 교체할까요? 완료 후 원본 계정으로 다시 로그인해야 합니다.",
                )
              )
                return;
              setRunning(true);
              try {
                await action("commit");
                lockVault();
                window.location.reload();
              } catch (e) {
                setError((e as Error).message);
                setRunning(false);
              }
            }}
          >
            확인한 원본으로 복구 완료
          </button>
        )}
      </div>
    </section>
  );
}
