import { useEffect, useState } from "react";
import { api } from "../lib/api";
import { topQuoteReasons } from "../core/quoteReasons";
import type { Consultation } from "../core/model";
export function QuoteReasonInput({
  value,
  onChange,
  disabled,
  consultations,
}: {
  value: string;
  onChange: (reason: string) => void;
  disabled: boolean;
  consultations: Consultation[];
}) {
  const [reasons, setReasons] = useState(() => topQuoteReasons(consultations));
  useEffect(() => {
    let active = true;
    setReasons(topQuoteReasons(consultations));
    api<{ reasons: ReturnType<typeof topQuoteReasons> }>("/quote-reasons")
      .then((r) => {
        if (active && Array.isArray(r.reasons)) setReasons(r.reasons);
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, [consultations]);
  return (
    <div className="quote-reason-input">
      <label>
        자주 쓰는 사유
        <select
          aria-label="자주 쓰는 할인·가격 사유"
          value=""
          disabled={disabled || !reasons.length}
          onChange={(e) => {
            if (e.target.value) onChange(e.target.value);
          }}
        >
          <option value="">
            {reasons.length
              ? "공통 사유 선택 · 빈도순 TOP 10"
              : "저장된 공통 사유가 없습니다"}
          </option>
          {reasons.map((r) => (
            <option key={r.reason} value={r.reason}>
              {r.reason} ({r.count}건)
            </option>
          ))}
        </select>
      </label>
      <label>
        할인·임의 가격 책정 사유
        <input
          aria-label="할인·변경 사유"
          value={value}
          disabled={disabled}
          onChange={(e) => onChange(e.target.value)}
          placeholder="직접 입력하거나 위에서 선택하세요"
        />
      </label>
      <small>
        모든 계정이 공유합니다. 같은 상담에서 같은 사유는 한 번 집계하며, 사유는
        내부에만 기록됩니다.
      </small>
    </div>
  );
}
