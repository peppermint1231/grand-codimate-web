import { pointBalance } from "../core/vipPoints";
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
  const [method, setMethod] = useState("카드");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
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
  const originalReceipt = receipts.find((r) => r.id === originalId);
  const isPoint =
    kind === "receipt"
      ? method === "VIP 포인트"
      : originalReceipt?.tender === "points";
  const balance = pointBalance(s, p.id);
  const maximum =
    kind === "receipt" && isPoint
      ? Math.min(available, Math.max(0, balance))
      : available;
  return (
    <form
      className="card"
      onSubmit={async (e) => {
        e.preventDefault();
        const data = Object.fromEntries(new FormData(e.currentTarget));
        setError("");
        setSaving(true);
        try {
          if (
            await send("ledger.create", {
              ...data,
              kind,
              consultationId,
              ...(kind === "refund" ? { originalId } : {}),
              method: isPoint ? "VIP 포인트" : method,
              amount: Number(full ? maximum : amount),
              fullAmount: full && (!isPoint || maximum === available),
            })
          ) {
            setAmount("");
            setFull(false);
          }
        } catch (e) {
          setError(
            e instanceof Error ? e.message : "수납을 저장하지 못했습니다",
          );
        } finally {
          setSaving(false);
        }
      }}
    >
      <h3>금액 기록</h3>
      {error && (
        <p role="alert" className="warning-panel">
          {error}
        </p>
      )}
      <label className="field">
        구분
        <select
          aria-label="구분"
          value={kind}
          onChange={(e) => {
            setKind(e.target.value as typeof kind);
            setMethod("카드");
            setFull(false);
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
              setMethod("카드");
              setFull(false);
              setAmount("");
            }}
          >
            {!receipts.length && (
              <option value="">환불 가능한 수납 없음</option>
            )}
            {receipts.map((r) => (
              <option key={r.id} value={r.id}>
                {r.date} · {r.method} · {money(r.amount)} · 환불 가능{" "}
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
            max={kind === "refund" || isPoint ? maximum : undefined}
            required
            readOnly={full}
            value={full ? maximum : amount}
            onChange={(e) => setAmount(e.target.value)}
          />
        </label>
        <label className="check">
          <input
            type="checkbox"
            checked={full}
            disabled={!consultationId || maximum <= 0}
            onChange={(e) => {
              setFull(e.target.checked);
              setAmount(String(maximum));
            }}
          />
          {isPoint && kind === "receipt"
            ? "사용 가능한 포인트 전액"
            : `전액 ${kind === "refund" ? "환불" : "수납"}`}{" "}
          · {money(maximum)}
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
          <select
            aria-label="방법"
            name="method"
            value={isPoint && kind === "refund" ? "VIP 포인트" : method}
            disabled={kind === "refund" && isPoint}
            onChange={(e) => {
              setMethod(e.target.value);
              setFull(false);
              setAmount("");
            }}
          >
            <option>카드</option>
            <option>현금</option>
            <option>계좌이체</option>
            <option>기타</option>
            {(kind === "receipt" || isPoint) && <option>VIP 포인트</option>}
          </select>
        </label>
        <label className="field">
          메모·사유
          <input name="memo" required={kind === "refund"} />
        </label>
      </div>
      {isPoint && (
        <p className="small">
          {kind === "refund"
            ? "현금으로 환불되지 않으며 환자의 포인트로 반환됩니다."
            : `보유 ${balance.toLocaleString()}P · 1P = 1원 · 미수납 ${available.toLocaleString()}원`}
        </p>
      )}
      <button
        className="primary"
        disabled={
          saving ||
          !consultationId ||
          (kind === "refund" && !originalId) ||
          (full && maximum <= 0)
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
