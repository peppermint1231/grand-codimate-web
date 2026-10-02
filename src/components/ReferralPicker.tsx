import { useState } from "react";
import type { State } from "../core/model";
import { currentBenefitGrade, benefitSettings } from "../core/gradeBenefits";
export function ReferralPicker({
  state,
  value,
  onChange,
  disabled = false,
}: {
  state: State;
  value: string;
  onChange: (id: string) => void;
  disabled?: boolean;
}) {
  const [query, setQuery] = useState("");
  const referralLabel = (id: string) => {
    const g = currentBenefitGrade(state, id, new Date().toISOString());
    const b = g && benefitSettings(state, g);
    return b?.enabled && b.referralReward > 0
      ? `${g!.name} 소개 혜택 ${b.referralReward.toLocaleString()}P`
      : "현재 자동 소개 혜택 없음";
  };
  const selected = state.patients.find((p) => p.id === value);
  const normalized = query.trim().toLowerCase();
  const rows = normalized
    ? state.patients
        .filter(
          (p) =>
            !p.archived &&
            !p.mergedInto &&
            [p.name, p.number, p.phone].some((v) =>
              v?.toLowerCase().includes(normalized),
            ),
        )
        .slice(0, 12)
    : [];
  return (
    <fieldset className="referral-picker" disabled={disabled}>
      <legend>친구 소개 (선택)</legend>
      {selected ? (
        <div className="button-row">
          <b>
            {selected.name} · {selected.number} · {selected.phone.slice(-4)}
          </b>
          <span>{referralLabel(selected.id)}</span>
          {!disabled && (
            <button
              type="button"
              onClick={() => {
                onChange("");
                setQuery("");
              }}
            >
              선택 해제
            </button>
          )}
        </div>
      ) : (
        <>
          <label className="field">
            소개해 준 환자 검색
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="이름·환자번호·전화번호"
              autoComplete="off"
            />
          </label>
          <div className="referral-results">
            {rows.map((p) => (
              <button
                type="button"
                className="list-row"
                key={p.id}
                onClick={() => {
                  onChange(p.id);
                  setQuery("");
                }}
              >
                <span>
                  <b>{p.name}</b>
                  <small>
                    {p.number} · {p.dob} · 연락처 끝 {p.phone.slice(-4)}
                  </small>
                </span>
                <span>{referralLabel(p.id)}</span>
              </button>
            ))}
            {normalized && !rows.length && <p>검색 결과가 없습니다.</p>}
          </div>
        </>
      )}
      <p className="small">
        포인트는 소개해 준 환자의 등급별 혜택에 따라 지급합니다. 새 환자의 첫
        실제 수납 후 1회 지급되며, 등록만으로 지급되지는 않습니다.
      </p>
    </fieldset>
  );
}
