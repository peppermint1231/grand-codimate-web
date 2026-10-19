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
                서버와 현재 연결된 OneDrive에서 앱이 추적하는 원본·변경 이력
                백업을 정리합니다. 정리 완료는 모든 장소의 사본 삭제를 뜻하지
                않습니다. 정리 중에는 백업 내보내기·복구·저장 폴더 변경·다른 OneDrive로
                연결 변경을 진행할 수 없습니다.
              </p>
              <details className="small">
                <summary>별도로 확인할 사본과 다시 나타날 수 있는 경우</summary>
                <ul>
                  <li>
                    모든 사용 기기의 암호화 보관·초안·전송 대기·복구 자료를
                    확인하세요. 로그아웃과 새로고침만으로 기기 사본이 모두
                    삭제되지는 않습니다.
                  </li>
                  <li>
                    다운로드한 PDF·사진·암호화 백업, OneDrive 밖으로 복사한
                    파일, 이전 저장 폴더 사본과 휴지통은 따로 정리하세요.
                  </li>
                  <li>
                    외부 초진설문지와 해당 앱·기기의 원본은 따로 정리하세요.
                    원본이 남아 있으면 검색·통계에 남거나 다시 가져올 수
                    있습니다.
                  </li>
                  <li>
                    삭제 전 백업을 복원하거나 기기의 이전 내용을 새 기록으로
                    입력하면 다시 저장될 수 있습니다. 복구 전에 삭제 대상이 없는
                    원본인지 확인하세요.
                  </li>
                  <li>
                    통합 전 환자 기본정보, 앱에서 추적하지 못하는 이전 사진
                    원본·수동 사본, 조회 기록은 별도 점검 대상입니다. 다른
                    환자와 공유된 파일은 보존됩니다.
                  </li>
                </ul>
              </details>
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
        ? "앱이 추적하는 서버·OneDrive 자료 정리 완료 · 기기·다운로드·외부 설문·별도 백업 사본은 따로 확인하세요."
        : `${job?.error || error ? "영구삭제 자료 정리 중단" : "영구삭제 자료 정리 중"} · ${job?.patientCount || 0}명 · ${job?.completed || 0}개 확인`}
      {(job?.error || error) && (
        <>
          <p>정리를 완료하지 못했습니다: {job?.error || error}</p>
          <p>
            확인 건수는 삭제 완료 건수가 아닙니다. 정리가 완료될 때까지
            OneDrive 원본·백업이 남아 있을 수 있습니다. 원인을 해결한 뒤
            삭제 정리 재시도를 누르면 저장된 진행 지점부터 이어서 처리합니다.
          </p>
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
