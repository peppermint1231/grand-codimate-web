import { useState } from "react";
import { activeLedger, ledgerAvailable } from "../core/domain";
import { money, type State, type Patient } from "../core/model";

export function LedgerForm({
  state: s,
  patient: p,
  send,
}: {
  state: State;
  patient: Patient;
  send: (...args: any[]) => any;
}) {
  const [kind, setKind] = useState<"receipt" | "refund">("receipt");
  const [selected, setSelected] = useState(""),
    [original, setOriginal] = useState("");
  const [full, setFull] = useState(false),
    [amount, setAmount] = useState("");
  const consultations = s.consultations.filter(
    (c) =>
      c.patientId === p.id &&
      c.status === "P" &&
      (kind === "refund" || !c.cancelled),
  );
  const consultationId = consultations.some((c) => c.id === selected)
    ? selected
    : consultations[0]?.id || "";
  const receipts = activeLedger(s).filter(
    (l) =>
      l.consultationId === consultationId &&
      l.kind === "receipt" &&
      ledgerAvailable(s, consultationId, "refund", l.id) > 0,
  );
  const originalId = receipts.some((r) => r.id === original)
    ? original
    : receipts[0]?.id || "";
  const available = ledgerAvailable(s, consultationId, kind, originalId);
  return (
    <form
      className="card"
      onSubmit={async (e) => {
        e.preventDefault();
        const data = Object.fromEntries(new FormData(e.currentTarget));
        if (
          await send("ledger.create", {
            ...data,
            kind,
            consultationId,
            ...(kind === "refund" ? { originalId } : {}),
            amount: Number(full ? available : amount),
            fullAmount: full,
          })
        ) {
          setAmount("");
          setFull(false);
        }
      }}
    >
      <h3>금액 기록</h3>
      <label className="field">
        구분
        <select
          aria-label="구분"
          value={kind}
          onChange={(e) => {
            setKind(e.target.value as typeof kind);
            setAmount("");
          }}
        >
          <option value="receipt">수납</option>
          <option value="refund">환불</option>
        </select>
      </label>
      <label className="field">
        연결 상담
        <select
          aria-label="연결 상담"
          required
          value={consultationId}
          onChange={(e) => {
            setSelected(e.target.value);
            setOriginal("");
            setAmount("");
          }}
        >
          {!consultations.length && <option value="">연결할 상담 없음</option>}
          {consultations.map((c) => (
            <option key={c.id} value={c.id}>
              {c.createdAt.slice(0, 10)} · {c.category} · {money(c.quote.total)}
              {c.cancelled ? " (취소)" : ""}
            </option>
          ))}
        </select>
      </label>
      {kind === "refund" && (
        <label className="field">
          원수납
          <select
            aria-label="원수납"
            required
            value={originalId}
            onChange={(e) => {
              setOriginal(e.target.value);
              setAmount("");
            }}
          >
            {!receipts.length && (
              <option value="">환불 가능한 수납 없음</option>
            )}
            {receipts.map((r) => (
              <option key={r.id} value={r.id}>
                {r.date} · {money(r.amount)} · 환불 가능{" "}
                {money(ledgerAvailable(s, consultationId, "refund", r.id))}
              </option>
            ))}
          </select>
        </label>
      )}
      <div className="form-grid">
        <label className="field">
          금액
          <input
            name="amount"
            type="number"
            min={1}
            max={kind === "refund" ? available : undefined}
            required
            readOnly={full}
            value={full ? available : amount}
            onChange={(e) => setAmount(e.target.value)}
          />
        </label>
        <label className="check">
          <input
            type="checkbox"
            checked={full}
            disabled={!consultationId || available <= 0}
            onChange={(e) => {
              setFull(e.target.checked);
              setAmount(String(available));
            }}
          />
          전액 {kind === "refund" ? "환불" : "수납"} · {money(available)}
        </label>
        <label className="field">
          처리일
          <input
            name="date"
            type="date"
            defaultValue={new Intl.DateTimeFormat("sv-SE", {
              timeZone: "Asia/Seoul",
            }).format(new Date())}
            required
          />
        </label>
        <label className="field">
          방법
          <select name="method">
            <option>카드</option>
            <option>현금</option>
            <option>계좌이체</option>
            <option>기타</option>
          </select>
        </label>
        <label className="field">
          메모·사유
          <input name="memo" required={kind === "refund"} />
        </label>
      </div>
      <button
        className="primary"
        disabled={
          !consultationId ||
          (kind === "refund" && !originalId) ||
          (full && available <= 0)
        }
      >
        기록 확정
      </button>
      <p className="small">
        전액은{" "}
        {kind === "refund"
          ? "선택한 원수납에서 이미 환불한 금액을 뺀 잔액"
          : "이 상담의 계약금액에서 수납−환불을 뺀 미수 잔액"}
        입니다. 서버 확인 후 반영됩니다.
      </p>
    </form>
  );
}
