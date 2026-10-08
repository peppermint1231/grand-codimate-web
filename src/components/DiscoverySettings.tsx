import { useEffect, useState } from "react";
import {
  discoverySettings,
  type DiscoverySettings as Settings,
} from "../core/discoverySettings";
import {
  catalogBookDisplayOrder,
  catalogBookLabel,
  type State,
} from "../core/model";
import { productTypeLabels, type ProductType } from "../core/productType";
export function DiscoverySettings({
  state,
  save,
}: {
  state: State;
  save: (settings: Settings, rev?: number) => Promise<unknown>;
}) {
  const [value, setValue] = useState(() => discoverySettings(state)),
    [busy, setBusy] = useState(false),
    [message, setMessage] = useState("");
  const [dirty, setDirty] = useState(false),
    [baseRev, setBaseRev] = useState(state.policies[0]?.rev);
  useEffect(() => {
    if (!dirty) {
      setValue(discoverySettings(state));
      setBaseRev(state.policies[0]?.rev);
    }
  }, [state.policies, dirty]);
  const edit = (next: Settings) => {
    setDirty(true);
    setValue(next);
  };
  return (
    <details className="card">
      <summary>추천기 설정 · 상품유형과 가격 공개</summary>
      <p>
        SSOT별 기본 노출 유형을 선택하세요. 선택한 유형 중 상품별 ‘맞춤 시술
        찾기 표시’가 켜진 상품을 보여줍니다.
      </p>
      <div className="form-grid">
        {catalogBookDisplayOrder.map((book) => (
          <fieldset key={book}>
            <legend>{catalogBookLabel(book)} SSOT</legend>
            <div className="button-row">
              {Object.entries(productTypeLabels).map(([type, label]) => (
                <label className="check" key={type}>
                  <input
                    type="checkbox"
                    checked={value[book].types.includes(type as ProductType)}
                    onChange={(e) =>
                      edit({
                        ...value,
                        [book]: {
                          ...value[book],
                          types: e.target.checked
                            ? [...value[book].types, type as ProductType]
                            : value[book].types.filter((t) => t !== type),
                        },
                      })
                    }
                  />
                  {label}
                </label>
              ))}
            </div>
            <label>
              가격 표시
              <select
                value={value[book].showPrices ? "public" : "private"}
                onChange={(e) =>
                  edit({
                    ...value,
                    [book]: {
                      ...value[book],
                      showPrices: e.target.value === "public",
                    },
                  })
                }
              >
                <option value="public">공개 · 확정 가격 표시</option>
                <option value="private">비공개 · 맞춤 상담 후 안내</option>
              </select>
            </label>
          </fieldset>
        ))}
      </div>
      <p className="small">
        가격이 미확정이거나 판매 비활성인 상품은 가격 공개를 선택해도 상담 후
        안내로 표시합니다.
      </p>
      <button
        className="primary"
        disabled={busy}
        onClick={async () => {
          setBusy(true);
          setMessage("");
          try {
            const result = await save(value, baseRev);
            if (result) {
              setDirty(false);
              setMessage("추천기 설정을 저장했습니다.");
            }
          } catch (e) {
            setMessage((e as Error).message);
          } finally {
            setBusy(false);
          }
        }}
      >
        {busy ? "저장 중…" : "추천기 설정 저장"}
      </button>
      {message && <p role="status">{message}</p>}
    </details>
  );
}
