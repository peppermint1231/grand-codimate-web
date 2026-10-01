import type { Product, Option } from "../core/model";
import { money } from "../core/model";
import {
  coverageLabels,
  reimbursementLabels,
  type InsuranceInfo,
  insuranceSummary,
  insuranceDisclaimer,
} from "../core/insuranceCatalog";
export function InsuranceBadges({
  info,
  showUnknown = false,
}: {
  info?: InsuranceInfo;
  showUnknown?: boolean;
}) {
  if (!info && !showUnknown) return null;
  const value = info || {
    coverage: "unknown",
    reimbursement: "check",
    note: "",
  };
  return (
    <div
      className="insurance-badges"
      aria-label="급여·실비 안내"
      title={insuranceDisclaimer}
    >
      <span className={`insurance-badge insurance-${value.coverage}`}>
        {coverageLabels[value.coverage]}
      </span>
      <span className={`insurance-badge insurance-${value.reimbursement}`}>
        {reimbursementLabels[value.reimbursement]}
      </span>
    </div>
  );
}
export function InsuranceClaimHint({ option }: { option: Option }) {
  if (option.healthInsuranceAmount === undefined) return null;
  return (
    <small className="insurance-claim-hint">
      환자 본인부담금{" "}
      {option.price === null ? "확인 필요" : money(option.price)} · 공단 청구액{" "}
      {money(option.healthInsuranceAmount)} 별도(참고)
    </small>
  );
}
export function InsuranceEditor({
  product,
  disabled,
  onChange,
}: {
  product: Product;
  disabled: boolean;
  onChange: (p: Product) => void;
}) {
  const info = product.insurance || {
    coverage: "unknown",
    reimbursement: "check",
    note: "",
  };
  const change = (patch: Partial<InsuranceInfo>) =>
    onChange({ ...product, insurance: { ...info, ...patch } });
  return (
    <fieldset className="insurance-editor" disabled={disabled}>
      <legend>급여·실비 구분</legend>
      <div className="form-grid">
        <label>
          급여 구분
          <select
            aria-label="급여 구분"
            value={info.coverage}
            onChange={(e) =>
              change({
                coverage: e.target.value as InsuranceInfo["coverage"],
                reimbursement:
                  e.target.value === "covered" ? "eligible" : "check",
              })
            }
          >
            {Object.entries(coverageLabels).map(([key, label]) => (
              <option key={key} value={key}>
                {label}
              </option>
            ))}
          </select>
        </label>
        <label>
          실비 청구 가능 여부
          <select
            aria-label="실비 청구 가능 여부"
            value={info.reimbursement}
            onChange={(e) =>
              change({
                reimbursement: e.target.value as InsuranceInfo["reimbursement"],
              })
            }
          >
            {Object.entries(reimbursementLabels).map(([key, label]) => (
              <option key={key} value={key}>
                {label}
              </option>
            ))}
          </select>
        </label>
      </div>
      <label>
        실비 안내·확인 조건
        <textarea
          aria-label="실비 안내·확인 조건"
          value={info.note}
          onChange={(e) => change({ note: e.target.value })}
        />
      </label>
      <p className="small">
        {insuranceSummary(info)} · {insuranceDisclaimer}
      </p>
    </fieldset>
  );
}
