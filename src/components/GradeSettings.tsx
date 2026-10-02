import { useEffect, useState } from "react";
import type { Grade, State } from "../core/model";
import { benefitSettings, type GradeBenefits } from "../core/gradeBenefits";
export function GradeSettings({
  state,
  send,
}: {
  state: State;
  send: (...args: any[]) => Promise<any>;
}) {
  const [grades, setGrades] = useState(state.policies[0]?.grades || []),
    [baseRev, setBaseRev] = useState(state.policies[0]?.rev),
    [dirty, setDirty] = useState(false),
    [busy, setBusy] = useState(false),
    [message, setMessage] = useState("");
  useEffect(() => {
    if (!dirty) {
      setGrades(state.policies[0]?.grades || []);
      setBaseRev(state.policies[0]?.rev);
    }
  }, [state.policies[0]?.rev, dirty]);
  const change = (items: Grade[]) => {
    setGrades(items);
    setDirty(true);
    setMessage("");
  };
  const update = (i: number, value: Partial<Grade>) =>
    change(grades.map((g, j) => (j === i ? { ...g, ...value } : g)));
  const fields: [keyof GradeBenefits, string][] = [
    ["welcome", "최초 등급 달성 포인트"],
    ["birthday", "생일 포인트"],
    ["annualThreshold", "기간 내 이용금액 기준 (원)"],
    ["annualReward", "이용금액 달성 포인트"],
    ["referralReward", "친구 소개 포인트"],
    ["annualMonths", "이용금액 집계기간 (개월)"],
    ["expiryMonths", "포인트 유효기간 (개월 · 0은 무기한)"],
  ];
  return (
    <section className="card grade-settings">
      <h3>환자 등급·세부 혜택</h3>
      <p>
        등급마다 지급량과 기간을 설정합니다. 혜택은 현재 해당하는 등급에서
        적용하며, VIP는 한 번 승급하면 영구 유지합니다.
      </p>
      {grades.map((g, i) => {
        const b = g.benefits || benefitSettings(state, g);
        return (
          <article className="grade-settings-row" key={g.id}>
            <div className="form-grid">
              <label className="field">
                등급명
                <input
                  value={g.name}
                  onChange={(e) => update(i, { name: e.target.value })}
                />
              </label>
              <label className="field">
                하한액 (원)
                <input
                  type="number"
                  min={0}
                  value={g.minimum}
                  onChange={(e) =>
                    update(i, { minimum: Number(e.target.value) })
                  }
                />
              </label>
              <label className="field">
                등급 색상
                <input
                  type="color"
                  value={g.color}
                  onChange={(e) => update(i, { color: e.target.value })}
                />
              </label>
            </div>
            <details>
              <summary>
                {g.name} 세부 혜택 ·{" "}
                {b.enabled ? "자동 지급 사용" : "자동 지급 안 함"}
              </summary>
              <label className="check">
                <input
                  type="checkbox"
                  checked={b.enabled}
                  onChange={(e) =>
                    update(i, { benefits: { ...b, enabled: e.target.checked } })
                  }
                />
                이 등급 자동 포인트 지급
              </label>
              <div className="form-grid">
                {fields.map(([key, label]) => (
                  <label className="field" key={key}>
                    {label}
                    <input
                      type="number"
                      min={
                        key === "annualMonths" || key === "annualThreshold"
                          ? 1
                          : 0
                      }
                      max={key.endsWith("Months") ? 120 : 1000000000}
                      value={String(b[key])}
                      onChange={(e) =>
                        update(i, {
                          benefits: { ...b, [key]: Number(e.target.value) },
                        })
                      }
                    />
                  </label>
                ))}
              </div>
              <label className="field">
                기타 혜택 안내
                <textarea
                  value={b.description}
                  onChange={(e) =>
                    update(i, {
                      benefits: { ...b, description: e.target.value },
                    })
                  }
                  placeholder="예: 우선 예약, 전용 상담 안내"
                />
              </label>
              <p className="small">
                집계는 등급 달성일부터 설정한 개월 단위이며 기간별 1회
                지급합니다. 금액·유효기간 변경은 이후 적립에만 적용하고 기존
                적립의 유효기간은 유지합니다. 만료가 가까운 포인트부터 사용하며
                사용 후 환불에도 원래 유효기간이 적용됩니다. 환불로 기존 적립을
                회수하지 않습니다.
              </p>
            </details>
            <button
              type="button"
              onClick={() => change(grades.filter((_, j) => j !== i))}
            >
              등급 삭제
            </button>
          </article>
        );
      })}
      {message && <p role="status">{message}</p>}
      <div className="button-row">
        <button
          onClick={() =>
            change([
              ...grades,
              {
                id: crypto.randomUUID(),
                name: "새 등급",
                minimum: 0,
                color: "#145d55",
              },
            ])
          }
        >
          등급 추가
        </button>
        <button
          className="primary"
          disabled={!dirty || busy}
          onClick={async () => {
            setBusy(true);
            try {
              if (await send("grade.policy", { grades }, "grades", baseRev)) {
                setDirty(false);
                setMessage("등급·혜택을 저장했습니다.");
              }
            } catch (e) {
              setMessage((e as Error).message);
            } finally {
              setBusy(false);
            }
          }}
        >
          등급·혜택 저장
        </button>
        <button
          disabled={busy}
          onClick={() => {
            setDirty(false);
            setGrades(state.policies[0]?.grades || []);
            setBaseRev(state.policies[0]?.rev);
            setMessage("");
          }}
        >
          변경 취소·최신 설정
        </button>
      </div>
    </section>
  );
}
