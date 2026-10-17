import { useEffect, useState } from "react";
import { type Patient, type User, isAdministrator } from "../core/model";
import {
  deletionScopeLabels,
  noDeletionScope,
  normalizedDeletionScope,
  type DeletionScope,
} from "../core/patientDeletion";
import { useAppBack } from "../lib/navigation";
import { api } from "../lib/api";
import { trainingMode } from "../training/environment";
type Send = (
  type: string,
  payload: Record<string, unknown>,
) => Promise<unknown>;
export function PatientDeletionDialog({
  patients,
  user,
  send,
  close,
  done,
}: {
  patients: Patient[];
  user: User;
  send: Send;
  close: () => void;
  done: () => void;
}) {
  const [permanent, setPermanent] = useState(false),
    [scope, setScope] = useState(noDeletionScope),
    [confirmation, setConfirmation] = useState(""),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const selected = normalizedDeletionScope(scope),
    dismiss = () => {
      if (!busy) close();
    };
  useAppBack(true, dismiss, 85);
  return (
    <div className="overlay" onClick={dismiss}>
      <section
        className="modal patient-deletion-dialog"
        role="dialog"
        aria-modal="true"
        aria-label="환자 삭제 범위"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="section-title">
          <h2>환자 {patients.length}명 · 삭제 범위</h2>
          <button disabled={busy} onClick={dismiss}>
            닫기
          </button>
        </div>
        <p className="deletion-patients">
          {patients
            .map((p) => `${p.name} (${p.phone || "연락처 없음"})`)
            .join(" · ")}
        </p>
        <fieldset disabled={busy}>
          <label className="check">
            <input
              type="checkbox"
              checked={!permanent}
              onChange={() => {
                setPermanent(false);
                setConfirmation("");
              }}
            />
            삭제목록으로 이동 · 자료 보존
          </label>
          <p className="small">
            환자목록에서 제외하고 삭제된 환자 목록에서 복원할 수 있습니다.
            상담·수납·사진은 보존됩니다.
          </p>
          {isAdministrator(user) && (
            <label className="check danger">
              <input
                type="checkbox"
                checked={permanent}
                onChange={(e) => {
                  setPermanent(e.target.checked);
                  setConfirmation("");
                }}
              />
              삭제목록에도 남기지 않고 선택 자료 영구삭제 (관리자)
            </label>
          )}
          {permanent && (
            <div className="deletion-scope">
              <p>
                <b>체크한 자료만 복원할 수 없게 삭제합니다.</b> 기본정보를
                남기면 환자목록과 선택하지 않은 자료는 유지됩니다.
              </p>
              {(
                Object.keys(deletionScopeLabels) as (keyof DeletionScope)[]
              ).map((key) => (
                <label className="check" key={key}>
                  <input
                    type="checkbox"
                    checked={selected[key]}
                    disabled={
                      (key !== "profile" && scope.profile) ||
                      (["photos", "money", "documents"].includes(key) &&
                        scope.consultations) ||
                      (key === "documents" &&
                        (scope.photos || scope.notes || scope.money))
                    }
                    onChange={(e) =>
                      setScope({ ...scope, [key]: e.target.checked })
                    }
                  />
                  {deletionScopeLabels[key]}
                </label>
              ))}
              <p className="small">
                기본정보 전체삭제는 모든 연결자료를 포함합니다. 상담이력 삭제는
                연결된 사진·의견·서명·수납·포인트도 함께 삭제합니다.
                사진·메모·금액을 지우면 해당 내용이 포함된 기존 발급 문서와 QR
                링크도 폐기합니다. 통계 금액도 달라질 수 있습니다.
              </p>
              <p className="small">
                서버와 연결된 OneDrive 원본·백업을 정리합니다. 기기에
                보관·다운로드한 사본이나 외부 초진설문지 원본은 별도로 삭제해야 합니다.
              </p>
              <label className="field">
                확인 문구 ‘영구삭제’ 입력
                <input
                  autoComplete="off"
                  value={confirmation}
                  onChange={(e) => setConfirmation(e.target.value)}
                  placeholder="영구삭제"
                />
              </label>
            </div>
          )}
        </fieldset>
        {error && (
          <p className="error" role="alert">
            {error}
          </p>
        )}
        <button
          className={permanent ? "danger" : "primary"}
          disabled={
            busy ||
            (permanent &&
              (!Object.values(selected).some(Boolean) ||
                confirmation !== "영구삭제"))
          }
          onClick={async () => {
            if (permanent && !navigator.onLine) {
              setError("영구삭제는 서버 연결 후 실행하세요.");
              return;
            }
            if (
              !window.confirm(
                `${patients.length}명의 ${permanent ? "체크한 자료를 영구삭제합니다. 복원할 수 없습니다." : "환자정보를 삭제목록으로 이동합니다."}\n계속할까요?`,
              )
            )
              return;
            setBusy(true);
            setError("");
            try {
              const result = await send(
                permanent ? "patient.purge" : "patient.archiveBatch",
                {
                  items: patients.map((p) => ({ id: p.id, rev: p.rev })),
                  ...(permanent ? { scope: selected, confirmation } : {}),
                },
              );
              if (result) done();
              else setError("서버 처리 결과를 확인한 뒤 다시 시도하세요.");
            } catch (e) {
              setError((e as Error).message);
            } finally {
              setBusy(false);
            }
          }}
        >
          {busy
            ? "처리 중…"
            : permanent
              ? `${patients.length}명 선택 자료 영구삭제`
              : `${patients.length}명 삭제목록으로 이동`}
        </button>
      </section>
    </div>
  );
}
type Job = {
  id: string;
  phase: string;
  completed: number;
  error?: string;
  patientCount: number;
};
export function PatientDeletionProgress({ refresh }: { refresh: number }) {
  const [job, setJob] = useState<Job | null>(null),
    [error, setError] = useState(""),
    [retry, setRetry] = useState(0);
  useEffect(() => {
    if (trainingMode) return;
    let active = true,
      timer: ReturnType<typeof setTimeout>;
    const poll = async (step = false) => {
      try {
        const d = await api(
          "/patient-deletions",
          step ? { method: "POST" } : undefined,
        );
        if (!active) return;
        setJob(d.job);
        setError("");
        if (d.job && d.job.phase !== "done" && !d.job.error)
          timer = setTimeout(() => poll(true), 2500);
      } catch (e) {
        if (active) setError((e as Error).message);
      }
    };
    void poll();
    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [refresh, retry]);
  if (!job && !error) return null;
  return (
    <div className={job?.error || error ? "error" : "notice"} role="status">
      {job?.phase === "done"
        ? "영구삭제 완료 · 서버 원본·백업 정리를 마쳤습니다."
        : `영구삭제 자료 정리 중 · ${job?.patientCount || 0}명 · ${job?.completed || 0}개 확인`}
      {(job?.error || error) && (
        <>
          <p>정리를 완료하지 못했습니다: {job?.error || error}</p>
          <button
            onClick={async () => {
              try {
                setJob(
                  (await api("/patient-deletions", { method: "POST" })).job,
                );
                setRetry((x) => x + 1);
              } catch (e) {
                setError((e as Error).message);
              }
            }}
          >
            삭제 정리 재시도
          </button>
        </>
      )}
    </div>
  );
}
