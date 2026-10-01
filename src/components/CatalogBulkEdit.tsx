import { useEffect, useState } from "react";
import type { Catalog, Option } from "../core/model";
import { bulkEditCatalogProductsResult } from "../core/catalogProducts";
import { catalogCommand } from "../lib/catalogShortcuts";

export function CatalogBulkEdit({
  catalog,
  ids,
  onChange,
  onSelection,
  onPendingChange,
}: {
  catalog: Catalog;
  ids: string[];
  onChange: (catalog: Catalog) => void;
  onSelection: (ids: string[]) => void;
  onPendingChange?: (pending: boolean) => void;
}) {
  const [tax, setTax] = useState<Option["tax"] | "">("");
  const [visibility, setVisibility] = useState("");
  const [sale, setSale] = useState("");
  const [priceKind, setPriceKind] = useState<"" | "clinic" | "quote">("");
  const [message, setMessage] = useState("");
  const [skipped, setSkipped] = useState<
    ReturnType<typeof bulkEditCatalogProductsResult>["skipped"]
  >([]);
  const [error, setError] = useState("");
  const selected = catalog.products.filter((p) => ids.includes(p.id));
  useEffect(() => {
    onPendingChange?.(!!(tax || visibility || sale || priceKind));
  }, [tax, visibility, sale, priceKind, onPendingChange]);
  const clearMessage = () => {
    setMessage("");
    setError("");
    setSkipped([]);
  };
  return (
    <section className="catalog-bulk-settings" aria-label="선택 상품 일괄 수정">
      <h3>
        선택 상품 일괄 수정{" "}
        <small>
          {selected.length}개 상품 ·{" "}
          {selected.reduce((n, p) => n + p.options.length, 0)}개 옵션
        </small>
      </h3>
      <div className="catalog-bulk-fields">
        <label>
          메뉴 판매
          <select
            aria-label="일괄 메뉴 판매"
            value={sale}
            onChange={(e) => {
              setSale(e.target.value);
              clearMessage();
            }}
          >
            <option value="">변경 안 함</option>
            <option value="active">활성화 (상담 목록에 표시)</option>
            <option value="inactive">비활성화 (상담 목록에서 숨김)</option>
          </select>
        </label>
        <label>
          가격 방식
          <select
            aria-label="일괄 가격 방식"
            value={priceKind}
            onChange={(e) => {
              setPriceKind(e.target.value as typeof priceKind);
              clearMessage();
            }}
          >
            <option value="">변경 안 함</option>
            <option value="quote">상담 시 가격 입력</option>
            <option value="clinic">고정 가격</option>
          </select>
        </label>
        <label>
          부가세 정책
          <select
            aria-label="일괄 부가세 정책"
            value={tax}
            onChange={(e) => {
              setTax(e.target.value as typeof tax);
              clearMessage();
            }}
          >
            <option value="">변경 안 함</option>
            <option value="exclusive">별도</option>
            <option value="inclusive">포함</option>
            <option value="exempt">면세</option>
            <option value="unknown">확인 필요</option>
          </select>
        </label>
        <label>
          맞춤 시술 찾기
          <select
            aria-label="일괄 맞춤 시술 찾기 표시"
            value={visibility}
            onChange={(e) => {
              setVisibility(e.target.value);
              clearMessage();
            }}
          >
            <option value="">변경 안 함</option>
            <option value="show">표시</option>
            <option value="hide">숨김</option>
          </select>
        </label>
        <button
          type="button"
          className="primary"
          {...catalogCommand("bulkApply")}
          disabled={
            !selected.length || (!tax && !visibility && !sale && !priceKind)
          }
          onClick={() => {
            clearMessage();
            try {
              const result = bulkEditCatalogProductsResult(catalog, ids, {
                ...(tax ? { tax } : {}),
                ...(priceKind ? { priceKind } : {}),
                ...(sale ? { active: sale === "active" } : {}),
                ...(visibility ? { publicVisible: visibility === "show" } : {}),
              });
              if (result.appliedIds.length) onChange(result.catalog);
              setSkipped(result.skipped);
              setMessage(
                `${result.appliedIds.length}개 상품 적용 · ${result.skipped.length}개 미적용. ${result.appliedIds.length ? "완료된 변경은 유지됩니다. ‘저장하고 적용’을 누르세요." : "아래 항목을 보완한 뒤 다시 적용하세요."}`,
              );
              setTax("");
              setVisibility("");
              setSale("");
              setPriceKind("");
            } catch (e) {
              setError((e as Error).message);
            }
          }}
        >
          선택 상품 일괄 적용
        </button>
      </div>
      <p className="small">
        검색·폴더 밖의 선택 상품도 포함됩니다. 부가세 정책은 모든 옵션에
        적용됩니다. 부가세 정책 변경 시 입력 가격은 유지됩니다. 상담에
        표시하려면 메뉴 판매를 활성화하세요. ‘저장하고 적용’을 누르면 상담·맞춤
        시술 찾기에 반영됩니다.
      </p>
      {priceKind === "quote" && (
        <p className="small">
          선택 상품의 모든 옵션에 적용되며 기존 가격·정가는 지워집니다.
          장바구니에서 금액과 책정 사유를 입력해야 저장할 수 있습니다. 부가세는
          별도로 지정하세요. 옵션 없는 안내 상품에는 적용되지 않습니다.
        </p>
      )}
      {message && <p role="status">{message}</p>}
      {skipped.length > 0 && (
        <div
          className="catalog-bulk-skipped"
          role="region"
          aria-label="일괄 적용 미완료 상품"
        >
          <p>다음 상품은 입력 확인이 필요해 기존 상태를 유지했습니다.</p>
          <button
            type="button"
            onClick={() => onSelection(skipped.map((p) => p.id))}
          >
            미완료 상품만 선택 ({skipped.length}개)
          </button>
          <ul>
            {skipped.map((p) => (
              <li key={p.id}>
                <b>{p.name}</b> · {p.reasons.join(" / ")}
              </li>
            ))}
          </ul>
        </div>
      )}
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
    </section>
  );
}
