import { useRef, useState } from "react";
import { GripVertical } from "lucide-react";
import { money, type Catalog, type Product } from "../core/model";
import {
  folderPath,
  moveProducts,
  productFolder,
} from "../core/catalogFolders";
type Work = (fn: () => Promise<unknown>) => unknown;
export function CatalogProductRows({
  catalog,
  products,
  editable,
  folderEditing = false,
  selectedIds,
  onSelection,
  onChange,
  onEdit,
  work,
}: {
  catalog: Catalog;
  products: Product[];
  editable: boolean;
  folderEditing?: boolean;
  selectedIds: string[];
  onSelection: (ids: string[]) => void;
  onChange: (catalog: Catalog) => void;
  onEdit: (id: string) => void;
  work: Work;
}) {
  const drag = useRef<{
    ids: string[];
    x: number;
    y: number;
    moved: boolean;
  } | null>(null);
  const [dragLabel, setDragLabel] = useState("");
  const change = (next: Product) =>
    onChange({
      ...catalog,
      products: catalog.products.map((p) => (p.id === next.id ? next : p)),
    });
  return (
    <div className="catalog-product-rows">
      {(editable || folderEditing) && (
        <div className="button-row">
          <button
            type="button"
            onClick={() => onSelection(products.map((p) => p.id))}
          >
            현재 목록 선택
          </button>
          <button type="button" onClick={() => onSelection([])}>
            선택 해제
          </button>
          <span>
            {selectedIds.length}개 선택 · 이동 손잡이를 폴더로 끌어놓으세요
          </span>
        </div>
      )}
      {dragLabel && (
        <div className="catalog-drag-status" role="status">
          {dragLabel}
        </div>
      )}
      {products.map((p) => (
        <article className="catalog-product-row" key={p.id}>
          <div className="catalog-product-heading">
            {(editable || folderEditing) && (
              <>
                <input
                  type="checkbox"
                  aria-label={p.name + " 선택"}
                  checked={selectedIds.includes(p.id)}
                  onChange={(e) =>
                    onSelection(
                      e.target.checked
                        ? [...selectedIds, p.id]
                        : selectedIds.filter((id) => id !== p.id),
                    )
                  }
                />
                <button
                  type="button"
                  className="catalog-move-handle"
                  aria-label={p.name + " 이동"}
                  onPointerDown={(e) => {
                    if (e.button !== 0) return;
                    const ids = selectedIds.includes(p.id)
                      ? selectedIds
                      : [p.id];
                    onSelection(ids);
                    drag.current = {
                      ids,
                      x: e.clientX,
                      y: e.clientY,
                      moved: false,
                    };
                    e.currentTarget.setPointerCapture(e.pointerId);
                  }}
                  onPointerMove={(e) => {
                    const d = drag.current;
                    if (!d) return;
                    d.moved ||=
                      Math.hypot(e.clientX - d.x, e.clientY - d.y) > 7;
                    if (d.moved) {
                      const target = document
                        .elementFromPoint(e.clientX, e.clientY)
                        ?.closest<HTMLElement>("[data-folder-target]");
                      setDragLabel(
                        `${d.ids.length}개 상품 → ${target?.innerText || "이동할 폴더 위에 놓으세요"}`,
                      );
                    }
                  }}
                  onPointerUp={(e) => {
                    const d = drag.current;
                    drag.current = null;
                    setDragLabel("");
                    if (!d?.moved) return;
                    const target = document
                      .elementFromPoint(e.clientX, e.clientY)
                      ?.closest<HTMLElement>("[data-folder-target]")
                      ?.dataset.folderTarget;
                    if (target)
                      work(async () =>
                        onChange(moveProducts(catalog, d.ids, target)),
                      );
                  }}
                  onPointerCancel={() => {
                    drag.current = null;
                    setDragLabel("");
                  }}
                >
                  <GripVertical size={18} />
                </button>
              </>
            )}
            <button
              type="button"
              className="catalog-product-title"
              onClick={() => onEdit(p.id)}
            >
              <b>{p.name}</b>
              <small>
                {folderPath(catalog, productFolder(catalog, p))
                  .map((x) => x.name)
                  .join(" / ")}
              </small>
            </button>
            <span className={"badge " + (p.active ? "P" : "H")}>
              {p.active ? "판매 중" : "검토 중"}
            </span>
            {editable && (
              <label className="check">
                <input
                  type="checkbox"
                  checked={!!p.publicVisible}
                  onChange={(e) =>
                    change({ ...p, publicVisible: e.target.checked })
                  }
                />
                맞춤 시술 찾기에 표시
              </label>
            )}
          </div>
          <div className="catalog-options-visible">
            {p.options.map((o) => (
              <div className="catalog-option-visible" key={o.id}>
                <span>
                  <b>{o.label}</b>
                  <small>
                    {o.unit}
                    {o.review ? " · 검토 필요" : ""}
                  </small>
                </span>
                {editable ? (
                  <>
                    <input
                      type="number"
                      min={0}
                      aria-label={`${p.name} ${o.label} 가격`}
                      value={o.price ?? ""}
                      placeholder="가격 미확정"
                      onChange={(e) =>
                        change({
                          ...p,
                          options: p.options.map((x) =>
                            x.id === o.id
                              ? {
                                  ...x,
                                  price:
                                    e.target.value === ""
                                      ? null
                                      : Number(e.target.value),
                                }
                              : x,
                          ),
                        })
                      }
                    />
                    <select
                      aria-label={`${p.name} ${o.label} 부가세`}
                      value={o.tax}
                      onChange={(e) =>
                        change({
                          ...p,
                          options: p.options.map((x) =>
                            x.id === o.id
                              ? { ...x, tax: e.target.value as typeof o.tax }
                              : x,
                          ),
                        })
                      }
                    >
                      <option value="unknown">부가세 미확정</option>
                      <option value="exclusive">별도</option>
                      <option value="inclusive">포함</option>
                      <option value="exempt">면세</option>
                    </select>
                  </>
                ) : (
                  <>
                    <strong>
                      {o.price === null ? "가격 미확정" : money(o.price)}
                    </strong>
                    <span>
                      {
                        {
                          unknown: "부가세 미확정",
                          exclusive: "VAT 별도",
                          inclusive: "VAT 포함",
                          exempt: "면세",
                        }[o.tax]
                      }
                    </span>
                  </>
                )}
              </div>
            ))}
            {!p.options.length && (
              <p className="small">상품 상세에서 옵션을 추가하세요.</p>
            )}
          </div>
        </article>
      ))}
    </div>
  );
}
