import { useEffect, useRef, useState } from "react";
import { PhotoModal } from "./PhotoBoard";
import { useAppBack } from "../lib/navigation";

/** Navigation keeps its destination until the user saves or finalizes successfully. */
export function ConsultationExit({
  enabled,
  pending,
  canSucceed,
  finish,
}: {
  enabled: boolean;
  pending: boolean;
  canSucceed: boolean;
  finish: (status?: "P" | "F") => Promise<boolean>;
}) {
  const destination = useRef<(() => void) | null>(null);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const inFlight = useRef(false);
  const [error, setError] = useState("");
  const stay = () => {
    if (inFlight.current) return;
    destination.current = null;
    setOpen(false);
    setError("");
  };
  useAppBack(open, stay, 110);
  useEffect(() => {
    if (!enabled) return;
    const leave = (event: Event) => {
      event.preventDefault();
      if (!destination.current)
        destination.current = (event as CustomEvent<() => void>).detail;
      setOpen(true);
    };
    const unload = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("codimate:before-consult-leave", leave);
    window.addEventListener("beforeunload", unload);
    return () => {
      window.removeEventListener("codimate:before-consult-leave", leave);
      window.removeEventListener("beforeunload", unload);
    };
  }, [enabled]);
  const complete = async (status?: "P" | "F") => {
    if (inFlight.current) return;
    inFlight.current = true;
    setBusy(true);
    setError("");
    // A save changes the consultation revision and may remount this component.
    // Capture the destination before awaiting; navigate only after all commands succeed.
    const go = destination.current;
    try {
      if (await finish(status)) go?.();
      else
        setError(
          "저장 완료를 확인하지 못했습니다. 화면을 유지하고 다시 확인해주세요.",
        );
    } catch (e) {
      setError((e as Error).message);
    } finally {
      inFlight.current = false;
      setBusy(false);
    }
  };
  return open ? (
    <PhotoModal
      label="상담을 마치고 이동할까요?"
      className="overlay consultation-exit-overlay"
      close={stay}
    >
      <div className="card consultation-exit-dialog">
        <h2>상담을 마치고 이동할까요?</h2>
        <p>작성한 사진·장바구니·메모를 저장한 뒤 이동합니다.</p>
        {pending && (
          <p className="small">
            상담이 끝났다면 성공 또는 실패로 확정하세요. 중간상담은 완료·중단,
            연장상담은 연장 여부에 반영됩니다.
          </p>
        )}
        {error && (
          <p className="error" role="alert">
            {error}
          </p>
        )}
        <div className="button-row">
          <button
            disabled={busy}
            className="primary"
            onClick={() => void complete()}
          >
            {pending ? "보류·변경 저장 후 이동" : "변경 저장 후 이동"}
          </button>
          {pending && (
            <>
              <button
                disabled={busy || !canSucceed}
                onClick={() => void complete("P")}
              >
                상담 완료 · 성공
              </button>
              <button disabled={busy} onClick={() => void complete("F")}>
                상담 완료 · 실패
              </button>
            </>
          )}
          <button disabled={busy} onClick={stay}>
            계속 상담하기
          </button>
        </div>
        {pending && !canSucceed && (
          <p className="small">
            성공 확정에는 장바구니 상품과 유효한 기준 상담이 필요합니다.
          </p>
        )}
        <p className="small">
          브라우저 창 닫기·새로고침에는 브라우저의 기본 이탈 확인창이
          표시됩니다. 취소 후 상담 저장을 눌러주세요.
        </p>
      </div>
    </PhotoModal>
  ) : null;
}
