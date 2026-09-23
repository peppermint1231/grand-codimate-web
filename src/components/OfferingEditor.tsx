import type { Product } from "../core/model";
import { offeringSummary } from "../core/offerings";
export function OfferingEditor({
  product,
  disabled,
  onChange,
}: {
  product: Product;
  disabled: boolean;
  onChange: (p: Product) => void;
}) {
  const v = product.offering;
  const change = (patch: Partial<NonNullable<Product["offering"]>>) =>
    onChange({
      ...product,
      offering: { kind: "package", items: [], terms: "", ...v, ...patch },
    });
  return (
    <details className="offering-editor">
      <summary>패키지·멤버십 구조화 안내</summary>
      <label className="field">
        상품 유형
        <select
          disabled={disabled}
          value={v?.kind || "single"}
          onChange={(e) =>
            e.target.value === "single"
              ? onChange({ ...product, offering: undefined })
              : change({ kind: e.target.value as "package" | "membership" })
          }
        >
          <option value="single">일반 상품</option>
          <option value="package">패키지</option>
          <option value="membership">멤버십</option>
        </select>
      </label>
      {v && (
        <>
          <p className="small">
            상담과 견적서에 구성 안내로 표시됩니다. 회차 차감이나 포인트 결제는
            자동으로 처리하지 않습니다.
          </p>
          {v.items.map((item, i) => (
            <div className="inline-fields" key={i}>
              <input
                aria-label={`구성 ${i + 1} 이름`}
                disabled={disabled}
                value={item.name}
                placeholder="시술·혜택 이름"
                onChange={(e) =>
                  change({
                    items: v.items.map((x, j) =>
                      i === j ? { ...x, name: e.target.value } : x,
                    ),
                  })
                }
              />
              <input
                aria-label={`구성 ${i + 1} 수량`}
                disabled={disabled}
                type="number"
                min={1}
                max={10000}
                value={item.quantity}
                onChange={(e) =>
                  change({
                    items: v.items.map((x, j) =>
                      i === j ? { ...x, quantity: Number(e.target.value) } : x,
                    ),
                  })
                }
              />
              <input
                aria-label={`구성 ${i + 1} 단위`}
                disabled={disabled}
                value={item.unit}
                placeholder="회"
                onChange={(e) =>
                  change({
                    items: v.items.map((x, j) =>
                      i === j ? { ...x, unit: e.target.value } : x,
                    ),
                  })
                }
              />
              <button
                disabled={disabled}
                onClick={() =>
                  change({ items: v.items.filter((_, j) => i !== j) })
                }
              >
                삭제
              </button>
            </div>
          ))}
          <button
            disabled={disabled}
            onClick={() =>
              change({
                items: [...v.items, { name: "", quantity: 1, unit: "회" }],
              })
            }
          >
            구성 추가
          </button>
          <div className="form-grid">
            <label className="field">
              이용기간 (일 · 선택)
              <input
                type="number"
                disabled={disabled}
                min={1}
                max={3650}
                value={v.validityDays ?? ""}
                onChange={(e) =>
                  change({
                    validityDays: e.target.value
                      ? Number(e.target.value)
                      : undefined,
                  })
                }
              />
            </label>
            {v.kind === "membership" &&
              (["creditAmount", "bonusAmount"] as const).map((k, i) => (
                <label className="field" key={k}>
                  {i === 0 ? "기본 이용금액" : "추가 혜택 금액"}
                  <input
                    disabled={disabled}
                    type="number"
                    min={0}
                    value={v[k] ?? ""}
                    onChange={(e) =>
                      change({
                        [k]: e.target.value
                          ? Number(e.target.value)
                          : undefined,
                      })
                    }
                  />
                </label>
              ))}
          </div>
          <label className="field">
            이용 조건·주의사항
            <textarea
              disabled={disabled}
              value={v.terms}
              onChange={(e) => change({ terms: e.target.value })}
            />
          </label>
          <pre className="offering-preview">{offeringSummary(v)}</pre>
        </>
      )}
    </details>
  );
}
