import { benefitSettings, currentBenefitGrade } from "../core/gradeBenefits";
import { VipPatientQR } from "./VipPatientQR";
import { useEffect, useState } from "react";
import {
  allowed,
  money,
  type Patient,
  type State,
  type User,
} from "../core/model";
import {
  annualCash,
  cashRevenue,
  pointBalance,
  seoulDay,
  vipAccount,
  vipEligible,
  vipPeriod,
  vipPolicy,
  vipTerms,
} from "../core/vipPoints";

export function PatientPoints({
  state,
  patient,
  user,
  send,
  openMoney,
}: {
  state: State;
  patient: Patient;
  user: User;
  send: (...args: any[]) => Promise<any>;
  openMoney: () => void;
}) {
  const [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [amount, setAmount] = useState(""),
    [reason, setReason] = useState(""),
    [page, setPage] = useState(0);
  useEffect(() => {
    setPage(0);
  }, [patient.id]);
  const grade = currentBenefitGrade(
    state,
    patient.id,
    new Date().toISOString(),
  );
  const generic = grade && grade.name.toUpperCase() !== "VIP";
  const policy = generic
      ? {
          ...vipPolicy(state),
          ...benefitSettings(state, grade),
          minimumRevenue: grade.minimum,
        }
      : vipPolicy(state),
    account = vipAccount(state, patient.id),
    balance = pointBalance(state, patient.id),
    now = new Date().toISOString();
  const active = vipEligible(state, patient),
    benefitAccount =
      account ||
      state.benefitAccounts?.find(
        (a) =>
          a.patientId === patient.id &&
          a.gradeId === grade?.id &&
          !a.mergedInto,
      ),
    period = benefitAccount
      ? vipPeriod(benefitAccount, now, policy.annualMonths || 12)
      : undefined;
  const used =
    benefitAccount && period
      ? annualCash(
          state,
          { ...benefitAccount, cardNumber: "" },
          period.from,
          period.to,
        )
      : 0;
  const rows = (state.pointEntries || [])
    .filter((e) => e.patientId === patient.id)
    .slice()
    .reverse();
  const run = async (fn: () => Promise<any>) => {
    setBusy(true);
    setError("");
    try {
      if ((await fn()) === false)
        setError("기기에 대기 중입니다. 서버 전송 완료 후 잔액을 확인하세요.");
    } catch (e) {
      setError(e instanceof Error ? e.message : "처리하지 못했습니다");
    } finally {
      setBusy(false);
    }
  };
  return (
    <section className="patient-points" aria-label="VIP 포인트">
      {error && (
        <p role="alert" className="warning-panel">
          {error}
        </p>
      )}
      <div className="detail-grid">
        <div className="card vip-card">
          <div className="button-row">
            <h3>{generic ? grade.name + " 등급 포인트" : "VIP 멤버십"}</h3>
            <span className="badge">
              {generic
                ? grade.name
                : account
                  ? active
                    ? "영구 VIP"
                    : "현재 적립 조건 미충족"
                  : "VIP 승급 전"}
            </span>
          </div>
          <strong className="points-balance">
            {balance.toLocaleString("ko-KR")} P
          </strong>
          <p>
            1P = 1원 ·{" "}
            {policy.expiryMonths
              ? `새 적립 유효기간 ${policy.expiryMonths}개월`
              : "유효기간 없음"}{" "}
            · 본인만 사용
          </p>
          {balance < 0 && (
            <p className="warning-panel">
              수동 조정으로 차감할 포인트가 남아 있습니다. 이후 적립금에서
              상계하며, 이 잔액을 현금 청구하지 않습니다.
            </p>
          )}
          <button className="primary" onClick={openMoney}>
            수납에서 포인트 사용·반환
          </button>
          {account ? (
            <>
              <p>
                VIP 승급일 {seoulDay(account.enrolledAt)} · 카드번호{" "}
                {account.cardNumber}
              </p>
              <p>인증용 카드 · 결제 기능 없음</p>
              <p>
                {account.cardIssuedAt
                  ? `카드 발급 기록: ${seoulDay(account.cardIssuedAt)}`
                  : "카드 발급 대기"}
              </p>
              {allowed(user, "grade.edit") && (
                <button
                  disabled={busy || !!account.cardIssuedAt}
                  onClick={() =>
                    void run(() =>
                      send("vip.card", {}, account.id, account.rev),
                    )
                  }
                >
                  {account.cardIssuedAt
                    ? "카드 발급 기록 완료"
                    : "카드 발급 기록"}
                </button>
              )}
            </>
          ) : (
            <p>
              누적 기여매출 {money(cashRevenue(state, patient.id))} /{" "}
              {generic ? grade.name : "VIP"} 기준 {money(policy.minimumRevenue)}
            </p>
          )}
          {!policy.enabled && (
            <p className="small">
              자동 지급이 아직 시작되지 않았습니다. 설정의 VIP 포인트 운영을
              확인하세요.
            </p>
          )}
        </div>
        <div className="card">
          <h3>자동 혜택</h3>
          <ul>
            <li>
              첫 {generic ? grade.name : "VIP"} 승급{" "}
              {policy.welcome.toLocaleString()}P · 최초 1회
            </li>
            <li>
              매년 생일 {policy.birthday.toLocaleString()}P · 등록된 생년월일
              기준
            </li>
            <li>
              승급일부터 {policy.annualMonths || 12}개월마다 이용금액{" "}
              {money(policy.annualThreshold)} 달성 시{" "}
              {policy.annualReward.toLocaleString()}P · 기간별 1회
            </li>
            <li>
              소개한 새 환자의 첫 실제 수납 후{" "}
              {policy.referralReward.toLocaleString()}P · 1인당 1회
            </li>
          </ul>
          {period && (
            <>
              <p>
                이번 기간 {period.from} ~ {period.to} 전날
              </p>
              <progress
                aria-label="VIP 연간 이용 실적"
                value={Math.max(0, Math.min(used, policy.annualThreshold))}
                max={policy.annualThreshold}
              />
              <p>
                {money(used)} / {money(policy.annualThreshold)}
              </p>
            </>
          )}
          <p className="small">
            포인트 결제는 기여매출·연간 이용 실적에서 제외합니다. 첫 승급을 만든
            기존 수납은 첫 연간 실적에 중복 산입하지 않습니다. 도입 전
            생일·종료된 연간 기간은 소급 적립하지 않습니다. 2월 29일 생일은
            평년에 2월 28일 적용합니다. VIP는 영구 유지되며 환불·연간 실적
            감소로 기존 적립을 회수하지 않습니다.
          </p>
          {grade?.benefits?.description && <p>{grade.benefits.description}</p>}
          {patient.referredByPatientId && (
            <p>
              소개해 준 환자:{" "}
              {state.patients.find((p) => p.id === patient.referredByPatientId)
                ?.name || "연결 환자"}
            </p>
          )}
          <details>
            <summary>VIP 이용안내</summary>
            <ul>
              {vipTerms.map((t) => (
                <li key={t}>{t}</li>
              ))}
            </ul>
          </details>
        </div>
      </div>
      {account &&
        active &&
        allowed(user, "money.read") &&
        allowed(user, "export") && (
          <VipPatientQR key={patient.id} patientId={patient.id} />
        )}
      <div className="card">
        <h3>포인트 지급·사용 이력</h3>
        {!rows.length ? (
          <p>포인트 이력이 없습니다.</p>
        ) : (
          <>
            <div className="point-history">
              {rows.slice(page * 15, (page + 1) * 15).map((e) => (
                <article className="list-row" key={e.id}>
                  <span>
                    <b>{e.reason}</b>
                    <small>
                      {new Date(e.createdAt).toLocaleString("ko-KR", {
                        timeZone: "Asia/Seoul",
                      })}{" "}
                      {e.expiresAt && ` · 유효기간 ${e.expiresAt}까지`} ·{" "}
                      {e.benefitKey
                        ? "자동 처리"
                        : state.users.find((u) => u.id === e.actorId)?.name ||
                          "담당자"}
                      {e.sourcePatientId
                        ? " · 소개 환자 " +
                          (state.patients.find(
                            (p) => p.id === e.sourcePatientId,
                          )?.name || "연결 환자")
                        : ""}
                    </small>
                  </span>
                  <strong
                    className={e.amount < 0 ? "points-minus" : "points-plus"}
                  >
                    {e.amount > 0 ? "+" : ""}
                    {e.amount.toLocaleString()} P
                  </strong>
                </article>
              ))}
            </div>
            <div className="button-row">
              <button disabled={!page} onClick={() => setPage((p) => p - 1)}>
                이전
              </button>
              <span>
                {page + 1} / {Math.max(1, Math.ceil(rows.length / 15))}
              </span>
              <button
                disabled={(page + 1) * 15 >= rows.length}
                onClick={() => setPage((p) => p + 1)}
              >
                다음
              </button>
            </div>
          </>
        )}
      </div>
      {allowed(user, "ledger.correct") && (
        <details className="card">
          <summary>포인트 수동 조정</summary>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              void run(async () => {
                const ok = await send("points.adjust", {
                  patientId: patient.id,
                  amount: Number(amount),
                  reason,
                  expectedBalance: balance,
                });
                if (ok) {
                  setAmount("");
                  setReason("");
                }
                return ok;
              });
            }}
          >
            <div className="form-grid">
              <label className="field">
                조정 포인트 (+ 지급 / − 차감)
                <input
                  type="number"
                  required
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                />
              </label>
              <label className="field">
                조정 사유
                <input
                  required
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                />
              </label>
            </div>
            <button disabled={busy || !Number(amount) || !reason.trim()}>
              조정 기록
            </button>
          </form>
        </details>
      )}
    </section>
  );
}
