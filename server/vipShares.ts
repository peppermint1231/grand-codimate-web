import { open, seal } from "./crypto";
import { sha } from "../src/core/domain";
import { money, type State } from "../src/core/model";
import {
  annualCash,
  cashRevenue,
  pointBalance,
  seoulDay,
  vipAccount,
  vipPeriod,
  vipPolicy,
  vipTerms,
} from "../src/core/vipPoints";

export const vipShareSchema =
  "CREATE TABLE IF NOT EXISTS vip_shares(patientId TEXT PRIMARY KEY,id TEXT UNIQUE NOT NULL,value TEXT NOT NULL);";
export interface VipShare {
  id: string;
  token: string;
  patientId: string;
  actorId: string;
  createdAt: string;
}
export class VipShares {
  constructor(
    private sql: SqlStorage,
    private key: string,
  ) {}
  async forPatient(patientId: string) {
    const row = this.sql
      .exec<{ value: string }>(
        "SELECT value FROM vip_shares WHERE patientId=?",
        patientId,
      )
      .toArray()[0];
    return row ? open<VipShare>(row.value, this.key) : undefined;
  }
  async get(token: string) {
    if (!/^[a-f0-9]{64}$/.test(token)) return;
    const row = this.sql
      .exec<{ value: string }>(
        "SELECT value FROM vip_shares WHERE id=?",
        await sha(token),
      )
      .toArray()[0];
    return row ? open<VipShare>(row.value, this.key) : undefined;
  }
  async create(patientId: string, actorId: string) {
    const token = Array.from(crypto.getRandomValues(new Uint8Array(32)), (b) =>
      b.toString(16).padStart(2, "0"),
    ).join("");
    const share: VipShare = {
      id: await sha(token),
      token,
      patientId,
      actorId,
      createdAt: new Date().toISOString(),
    };
    this.sql.exec(
      "INSERT OR REPLACE INTO vip_shares VALUES(?,?,?)",
      patientId,
      share.id,
      await seal(share, this.key),
    );
    return share;
  }
  remove(patientId: string) {
    this.sql.exec("DELETE FROM vip_shares WHERE patientId=?", patientId);
  }
}

// Explicit patient-facing projection: never expose internal notes, staff reasons,
// treatment names, referral identities, phone numbers or database identifiers.
export function vipPortalData(
  state: State,
  patientId: string,
  now = new Date().toISOString(),
) {
  const patient = state.patients.find((p) => p.id === patientId);
  const account = vipAccount(state, patientId);
  if (!patient || patient.archived || patient.mergedInto || !account) return;
  const policy = vipPolicy(state),
    period = vipPeriod(account, now, policy.annualMonths || 12);
  const used = annualCash(state, account, period.from, period.to, now);
  const entries = state.pointEntries.filter((e) => e.patientId === patientId);
  const rewarded = entries.some(
    (e) =>
      e.benefitKey?.startsWith("annual:") &&
      (e.benefitKey === "annual:" + period.from ||
        (e.periodFrom &&
          e.periodTo &&
          e.periodFrom < period.to &&
          e.periodTo > period.from)),
  );
  return {
    name: [...patient.name].map((c, i) => (i === 0 ? c : "*")).join(""),
    balance: pointBalance(state, patientId, now),
    enrolled: seoulDay(account.enrolledAt),
    lifetime: cashRevenue(state, patientId, now),
    used,
    period,
    remaining: Math.max(0, policy.annualThreshold - used),
    rewarded,
    policy: {
      enabled: policy.enabled,
      welcome: policy.welcome,
      birthday: policy.birthday,
      annualMonths: policy.annualMonths || 12,
      annualThreshold: policy.annualThreshold,
      annualReward: policy.annualReward,
      referralReward: policy.referralReward,
      expiryMonths: policy.expiryMonths || 0,
    },
    history: entries
      .slice()
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
      .slice(0, 20)
      .map((e) => ({
        date: seoulDay(e.createdAt),
        amount: e.amount,
        expiresAt: e.expiresAt,
        label:
          e.kind === "use"
            ? "포인트 사용"
            : e.kind === "return"
              ? "포인트 반환"
              : e.kind === "expiry"
                ? "유효기간 만료"
                : e.kind === "grant"
                  ? "포인트 적립"
                  : "포인트 조정",
      })),
    updatedAt: new Date(now).toLocaleString("ko-KR", {
      timeZone: "Asia/Seoul",
    }),
  };
}
const escapeHTML = (v: unknown) =>
  String(v).replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ]!,
  );
export function vipPortalHTML(
  data: NonNullable<ReturnType<typeof vipPortalData>>,
) {
  const e = escapeHTML,
    p = data.policy;
  const points = (v: number) => v.toLocaleString("ko-KR") + " P";
  const end = new Date(data.period.to + "T00:00:00Z");
  end.setUTCDate(end.getUTCDate() - 1);
  return `<!doctype html><html lang="ko"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>나의 VIP 혜택 · 그랜드아름다운의원</title><style>
  *{box-sizing:border-box}body{margin:0;background:#f5f7f3;color:#203f3a;font:16px/1.6 system-ui,sans-serif}main{max-width:680px;margin:auto;padding:24px 16px 48px}header{display:flex;justify-content:space-between;gap:12px;align-items:center}header small{font-size:12px}h1{font-size:24px;margin:4px 0 20px}h2{font-size:18px;margin:0 0 12px}p{margin:8px 0}.card{border:1px solid #dce6df;border-radius:18px;background:white;padding:22px;margin:16px 0}.member{background:#144e45;color:white;border-color:#144e45}.badge{display:inline-block;color:#efd590;border:1px solid #b2a570;border-radius:20px;padding:2px 10px;font-size:13px}.balance{font-size:clamp(28px,8vw,42px);font-weight:750;overflow-wrap:anywhere}.muted,small{color:#647971;font-size:13px}.member small{color:#d0e0d9}.stats{display:grid;grid-template-columns:1fr 1fr;gap:12px}.stats strong{display:block;overflow-wrap:anywhere}progress{width:100%;height:16px;accent-color:#b69041;border:0;border-radius:8px;overflow:hidden}progress::-webkit-progress-bar{background:#e8eee8}progress::-webkit-progress-value{background:#b69041}progress::-moz-progress-bar{background:#b69041}.benefits{padding-left:20px}.benefits li{margin:10px 0}.history{padding:10px 0;border-bottom:1px solid #e8ede8;display:flex;gap:12px;justify-content:space-between}.history strong{white-space:nowrap}.history small{display:block}a{color:#145d55;text-decoration:none;border:1px solid #b6cdc3;border-radius:10px;padding:8px 12px;white-space:nowrap}summary{cursor:pointer;font-weight:650}.terms{font-size:13px;padding-left:20px}@media(max-width:360px){.card{padding:16px}.stats{grid-template-columns:1fr}}
  </style></head><body><main><header><small>그랜드아름다운의원</small><a href="">새로고침</a></header><h1>나의 VIP 혜택</h1>
  <section class="card member"><span class="badge">영구 VIP</span><p>${e(data.name)}님, 반갑습니다</p><small>사용 가능한 포인트</small><div class="balance">${points(data.balance)}</div><small>1P = 1원 · 본인만 사용 · VIP 승급일 ${e(data.enrolled)}</small></section>
  <section class="card"><h2>이번 기간 이용 실적</h2><p class="muted">${e(data.period.from)} ~ ${end.toISOString().slice(0, 10)} · ${p.annualMonths}개월</p><progress aria-label="VIP 이용 실적" value="${Math.max(0, Math.min(data.used, p.annualThreshold))}" max="${p.annualThreshold}"></progress><div class="stats"><div><small>현재 실적</small><strong>${money(data.used)}</strong></div><div><small>추가 적립 기준</small><strong>${money(p.annualThreshold)}</strong></div></div><p>${data.rewarded ? "이번 기간 추가 포인트 지급 완료" : data.remaining === 0 ? "이용 실적 달성 · 포인트 반영 상태는 병원에 확인해주세요" : `${money(data.remaining)} 더 이용하면 ${points(p.annualReward)} 추가 적립`}</p><p class="muted">누적 이용금액 ${money(data.lifetime)}<br>실제 수납에서 환불을 뺀 금액입니다. 포인트 결제는 실적에 포함되지 않으며, 최초 승급을 만든 수납은 첫 집계기간에 중복 반영하지 않습니다.</p></section>
  <section class="card"><h2>VIP 혜택 안내</h2>${!p.enabled ? "<p>자동 포인트 지급이 현재 중지되어 있습니다. 적용 여부는 병원에 문의해주세요.</p>" : ""}<ul class="benefits"><li>최초 승급 시 <b>${points(p.welcome)}</b> · 1회</li><li>매년 생일 <b>${points(p.birthday)}</b></li><li>${p.annualMonths}개월마다 ${money(p.annualThreshold)} 이용 시 <b>${points(p.annualReward)}</b> · 기간별 1회</li><li>소개한 새 환자의 첫 실제 수납 후 <b>${points(p.referralReward)}</b> · 1인당 1회</li></ul><p class="muted">새 적립 포인트: ${p.expiryMonths ? `유효기간 ${p.expiryMonths}개월` : "유효기간 없음"}. 기존 적립분에는 적립 당시 유효기간이 적용됩니다.</p></section>
  <section class="card"><details><summary>최근 포인트 내역 · 최대 20건</summary>${data.history.length ? data.history.map((h) => `<div class="history"><span>${e(h.label)}<small>${e(h.date)}${h.expiresAt ? " · 유효기간 " + e(h.expiresAt) : ""}</small></span><strong>${h.amount > 0 ? "+" : ""}${points(h.amount)}</strong></div>`).join("") : "<p>아직 포인트 내역이 없습니다.</p>"}</details></section>
  <section class="card"><details><summary>VIP 이용안내</summary><ul class="terms">${vipTerms.map((t) => `<li>${e(t)}</li>`).join("")}</ul></details></section><p class="muted">조회 시각 ${e(data.updatedAt)} (한국 시간)<br>QR·링크를 가진 사람은 이 화면을 볼 수 있습니다. 본인만 보관해주세요. 최신 내역은 새로고침하면 반영됩니다.</p></main></body></html>`;
}
