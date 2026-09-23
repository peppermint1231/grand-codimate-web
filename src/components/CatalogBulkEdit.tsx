import { useState } from "react";
import type { Catalog, Option } from "../core/model";
import { bulkEditCatalogProducts } from "../core/catalogProducts";
import { catalogCommand } from "../lib/catalogShortcuts";

export function CatalogBulkEdit({
  catalog,
  ids,
  onChange,
}: {
  catalog: Catalog;
  ids: string[];
  onChange: (catalog: Catalog) => void;
}) {
  const [tax, setTax] = useState<Option["tax"] | "">("");
  const [visibility, setVisibility] = useState("");
  const [sale, setSale] = useState("");
  const [review, setReview] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const selected = catalog.products.filter((p) => ids.includes(p.id));
  const clearMessage = () => {
    setMessage("");
    setError("");
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
          상담 판매
          <select
            aria-label="일괄 상담 판매"
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
        <label className="check">
          <input
            type="checkbox"
            checked={review}
            onChange={(e) => {
              setReview(e.target.checked);
              clearMessage();
            }}
          />
          선택 상품 일괄 검토완료
        </label>
        <button
          type="button"
          className="primary"
          {...catalogCommand("bulkApply")}
          disabled={
            !selected.length || (!tax && !visibility && !review && !sale)
          }
          onClick={() => {
            clearMessage();
            try {
              onChange(
                bulkEditCatalogProducts(catalog, ids, {
                  ...(tax ? { tax } : {}),
                  ...(sale ? { active: sale === "active" } : {}),
                  ...(visibility
                    ? { publicVisible: visibility === "show" }
                    : {}),
                  completeReview: review,
                }),
              );
              setMessage(
                `${selected.length}개 상품에 적용했습니다. 초안을 저장하세요.`,
              );
              setTax("");
              setVisibility("");
              setSale("");
              setReview(false);
            } catch (e) {
              setError((e as Error).message);
            }
          }}
        >
          선택 상품 일괄 적용
        </button>
      </div>
      <p className="small">
        검색·폴더 밖의 선택 상품도 포함됩니다. 부가세와 검토완료는 모든 옵션에
        적용됩니다. 부가세 정책 변경 시 입력 가격은 유지됩니다. 상담에
        표시하려면 상담 판매를 활성화하세요. 초안 저장 후 ‘검증 후 게시’를
        눌러야 상담·맞춤 시술 찾기에 반영됩니다.
      </p>
      {message && <p role="status">{message}</p>}
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
    </section>
  );
}
