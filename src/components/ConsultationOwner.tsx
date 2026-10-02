import { useState } from "react";
import {
  isAdministrator,
  type Consultation,
  type State,
  type User,
} from "../core/model";
export function ConsultationOwner({
  state,
  consult,
  user,
  send,
  disabled = false,
}: {
  state: State;
  consult: Consultation;
  user: User;
  send: (...args: any[]) => Promise<any>;
  disabled?: boolean;
}) {
  const [owner, setOwner] = useState(consult.ownerId),
    [reason, setReason] = useState(""),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  const canChange = isAdministrator(user) || consult.ownerId === user.id;
  return (
    <div
      className="consultation-owner"
      onClick={(e) => e.stopPropagation()}
      onKeyDown={(e) => e.stopPropagation()}
    >
      <span>
        상담자{" "}
        <b>
          {state.users.find((u) => u.id === consult.ownerId)?.name ||
            "이전 직원"}
        </b>
      </span>
      {canChange && (
        <details>
          <summary>상담자 변경</summary>
          <form
            onSubmit={async (e) => {
              e.preventDefault();
              setBusy(true);
              setError("");
              try {
                if (
                  await send(
                    "consultation.owner",
                    { ownerId: owner, reason },
                    consult.id,
                    consult.rev,
                  )
                ) {
                  setReason("");
                  (e.target as HTMLFormElement)
                    .closest("details")
                    ?.removeAttribute("open");
                }
              } catch (e) {
                setError((e as Error).message);
              } finally {
                setBusy(false);
              }
            }}
          >
            <label className="field">
              새 상담자
              <select
                aria-label="새 상담자"
                value={owner}
                onChange={(e) => setOwner(e.target.value)}
              >
                {state.users
                  .filter((u) => u.active)
                  .map((u) => (
                    <option key={u.id} value={u.id}>
                      {u.name}
                    </option>
                  ))}
              </select>
            </label>
            <label className="field">
              변경 사유
              <input
                required
                value={reason}
                onChange={(e) => setReason(e.target.value)}
              />
            </label>
            <small>
              이 상담의 성과 통계는 새 상담자에게 귀속됩니다. 수납 입력자·과거
              요청 작성자는 유지됩니다.
            </small>
            {disabled && <p>작성 중인 상담을 먼저 저장하세요.</p>}
            {error && <p role="alert">{error}</p>}
            <button
              type="button"
              onClick={(e) =>
                e.currentTarget.closest("details")?.removeAttribute("open")
              }
            >
              취소
            </button>
            <button
              disabled={disabled || busy || owner === consult.ownerId}
              type="submit"
            >
              상담자 변경 저장
            </button>
          </form>
        </details>
      )}
    </div>
  );
}
