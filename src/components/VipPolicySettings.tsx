import { useState } from "react";
import type { State } from "../core/model";
import { defaultVipPolicy, vipPolicy } from "../core/vipPoints";
export function VipPolicySettings({
  state,
  send,
  work,
}: {
  state: State;
  send: (...args: any[]) => Promise<any>;
  work: (fn: () => Promise<any>) => any;
}) {
  const [value, setValue] = useState({ ...vipPolicy(state) }),
    [baseRev, setBaseRev] = useState(state.policies[0]?.rev),
    [saved, setSaved] = useState(false);
  const fields = [
    ["minimumRevenue", "VIP 누적 기여매출 기준 (원)"],
    ["welcome", "최초 승급 포인트"],
    ["birthday", "생일 포인트"],
    ["annualThreshold", "연간 이용금액 기준 (원)"],
    ["annualReward", "연간 달성 포인트"],
    ["referralReward", "친구 소개 포인트"],
  ] as const;
  return (
    <form
      className="card vip-policy"
      onSubmit={(e) => {
        e.preventDefault();
        work(async () => {
          const ok = await send(
            "vip.policy",
            { policy: { ...value, existingWelcome: true } },
            "grades",
            baseRev,
          );
          if (ok) setSaved(true);
        });
      }}
    >
      <h3>VIP 포인트 운영</h3>
      <p>
        수납 이력상 최초 VIP 승급일부터 {value.annualMonths || 12}개월씩 · 각
        기간 1회 지급 · 기존 VIP도 최초 적립 · 새 적립 유효기간{" "}
        {value.expiryMonths ? `${value.expiryMonths}개월` : "없음"}
      </p>
      <label className="check">
        <input
          type="checkbox"
          checked={value.enabled}
          onChange={(e) => {
            setValue((v) => ({ ...v, enabled: e.target.checked }));
            setSaved(false);
          }}
        />
        자동 혜택 지급
      </label>
      <div className="form-grid">
        {fields.map(([key, label]) => (
          <label className="field" key={key}>
            {label}
            <input
              type="number"
              min={
                key === "minimumRevenue" || key === "annualThreshold" ? 1 : 0
              }
              max={1_000_000_000}
              required
              value={value[key]}
              onChange={(e) => {
                setValue((v) => ({ ...v, [key]: Number(e.target.value) }));
                setSaved(false);
              }}
            />
          </label>
        ))}
      </div>
      <p className="small">
        최초 500만원 달성 후 영구 VIP를 유지합니다. 환불·수납 정정이나 연간
        이용금액 감소로 이미 적립한 포인트를 회수하지 않습니다.
      </p>
      <p className="small">
        친구 소개는 소개해 준 VIP에게 새 환자의 첫 실제 수납 후 지급합니다.
        포인트 결제는 실수납·기여매출에 포함하지 않습니다. 포인트 수납 환불은
        현금 지급 없이 포인트로 반환합니다.
      </p>
      <p className="small">
        이 설정의 금액 변경은 이후 새 혜택에 적용되며 이미 지급한 건의 약정
        포인트는 유지합니다. 자동 지급을 끄더라도 기존 잔액과 이력은 보존합니다.
      </p>
      <div className="button-row">
        <button className="primary" disabled={saved}>
          {saved ? "저장 완료" : "VIP 운영 설정 저장"}
        </button>
        <button
          type="button"
          onClick={() => {
            setValue({ ...vipPolicy(state) });
            setBaseRev(state.policies[0]?.rev);
            setSaved(false);
          }}
        >
          최신 설정 불러오기
        </button>
        <button
          type="button"
          onClick={() => {
            setValue({
              ...value,
              ...defaultVipPolicy,
              enabled: value.enabled,
              startedAt: value.startedAt,
            });
            setSaved(false);
          }}
        >
          기본 금액 입력
        </button>
      </div>
    </form>
  );
}
