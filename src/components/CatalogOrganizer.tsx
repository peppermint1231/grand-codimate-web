import { CatalogBulkEdit } from "./CatalogBulkEdit";
import { PhotoModal } from "./PhotoBoard";
import { InsuranceBadges, InsuranceClaimHint } from "./InsuranceInfo";
import { eventOptionPrices } from "../core/eventPrices";
import { EventSourceInfo, WebsiteSourceInfo, EventPrice } from "./EventCatalog";
import { websiteFolderPresence } from "../core/websitePresence";
import { catalogCommand } from "../lib/catalogShortcuts";
import { useRef, useState } from "react";
import { ChevronRight, GripVertical, Trash2 } from "lucide-react";
import { money, catalogBook, type Catalog, type Product } from "../core/model";
import {
  folderPath,
  moveProducts,
  productFolder,
  productFolderPaths,
} from "../core/catalogFolders";
import { needsProductReview as needsReview } from "../core/catalogProducts";
type Work = (fn: () => Promise<unknown>) => unknown;
export function CatalogProductRows({
  catalog,
  products,
  selectedFolder = "",
  editable,
  folderEditing = false,
  selectedIds,
  onSelection,
  onChange,
  onEdit,
  onDelete,
  onSave,
  work,
}: {
  catalog: Catalog;
  products: Product[];
  selectedFolder?: string;
  editable: boolean;
  folderEditing?: boolean;
  selectedIds: string[];
  onSelection: (ids: string[]) => void;
  onChange: (catalog: Catalog) => void;
  onEdit: (id: string) => void;
  onDelete: (ids: string[]) => void;
  onSave?: () => Promise<boolean>;
  work: Work;
}) {
  const drag = useRef<{
    ids: string[];
    x: number;
    y: number;
    moved: boolean;
  } | null>(null);
  const [bulkOpen, setBulkOpen] = useState(false);
  const [bulkBusy, setBulkBusy] = useState(false);
  const [bulkPending, setBulkPending] = useState(false);
  const [dragLabel, setDragLabel] = useState("");
  const [allClosed, setAllClosed] = useState(false);
  const [exceptions, setExceptions] = useState<string[]>([]);
  const isOpen = (id: string) =>
    allClosed ? exceptions.includes(id) : !exceptions.includes(id);
  const toggle = (id: string) =>
    setExceptions((ids) =>
      ids.includes(id) ? ids.filter((x) => x !== id) : [...ids, id],
    );
  const groups = new Map<string, Product[]>();
  products.forEach((p) => {
    const path =
      selectedFolder &&
      productFolderPaths(catalog, p).find((path) =>
        path.some((f) => f.id === selectedFolder),
      );
    const id = path ? path.at(-1)!.id : productFolder(catalog, p);
    groups.set(id, [...(groups.get(id) || []), p]);
  });
  const change = (next: Product) =>
    onChange({
      ...catalog,
      products: catalog.products.map((p) => (p.id === next.id ? next : p)),
    });
  return (
    <div className="catalog-product-rows" role="region" aria-label="상품 목록">
      <div className="product-list-heading">
        <h3>
          상품 목록 <small>{products.length}개</small>
        </h3>
        <div className="catalog-fold-controls">
          <button
            {...catalogCommand("collapse")}
            type="button"
            onClick={() => {
              setAllClosed(true);
              setExceptions([]);
            }}
          >
            모두 접기
          </button>
          <button
            {...catalogCommand("expand")}
            type="button"
            onClick={() => {
              setAllClosed(false);
              setExceptions([]);
            }}
          >
            모두 펼치기
          </button>
        </div>
      </div>
      {(editable || folderEditing) && (
        <div className="button-row catalog-selection-toolbar">
          <button
            type="button"
            {...catalogCommand("selectAll")}
            onClick={() => onSelection(products.map((p) => p.id))}
          >
            현재 목록 선택
          </button>
          <button
            type="button"
            {...catalogCommand("selectUnreviewed")}
            disabled={!products.some(needsReview)}
            onClick={() =>
              onSelection(products.filter(needsReview).map((p) => p.id))
            }
          >
            미검토 항목만 선택 ({products.filter(needsReview).length}개)
          </button>
          <button
            {...catalogCommand("selectNone")}
            type="button"
            onClick={() => onSelection([])}
          >
            선택 해제
          </button>
          {editable && (
            <button
              type="button"
              className="primary"
              disabled={!selectedIds.length}
              {...catalogCommand("bulkOpen")}
              onClick={() => {
                setBulkPending(false);
                setBulkOpen(true);
              }}
            >
              일괄 수정 ({selectedIds.length}개)
            </button>
          )}
          {editable && (
            <button
              type="button"
              className="catalog-delete-button"
              {...catalogCommand("productsDelete")}
              disabled={!selectedIds.length}
              onClick={() => onDelete(selectedIds)}
            >
              <Trash2 size={16} /> 선택 상품 삭제
              {selectedIds.length ? ` (${selectedIds.length})` : ""}
            </button>
          )}
          <span>
            {selectedIds.length}개 선택
            {selectedIds.some((id) => !products.some((p) => p.id === id))
              ? ` · 현재 목록 밖 ${selectedIds.filter((id) => !products.some((p) => p.id === id)).length}개 포함`
              : ""}
          </span>
        </div>
      )}
      {bulkOpen && editable && (
        <PhotoModal
          label="선택 상품 일괄 수정"
          close={() => {
            if (!bulkBusy) setBulkOpen(false);
          }}
          className="overlay catalog-bulk-overlay"
        >
          <section className="catalog-bulk-dialog" data-catalog-bulk-editor>
            <div className="section-title">
              <h2>선택 상품 일괄 수정</h2>
              <button disabled={bulkBusy} onClick={() => setBulkOpen(false)}>
                닫기
              </button>
            </div>
            <fieldset disabled={bulkBusy} className="catalog-bulk-fieldset">
              <CatalogBulkEdit
                catalog={catalog}
                ids={selectedIds}
                onChange={onChange}
                onSelection={onSelection}
                onPendingChange={setBulkPending}
              />
            </fieldset>
            {onSave && (
              <div className="catalog-bulk-footer">
                <button disabled={bulkBusy} onClick={() => setBulkOpen(false)}>
                  목록에서 계속 수정
                </button>
                <button
                  className="primary"
                  {...catalogCommand("publish")}
                  disabled={bulkBusy || bulkPending}
                  title={
                    bulkPending
                      ? "선택 상품 일괄 적용을 먼저 누르세요"
                      : undefined
                  }
                  onClick={() =>
                    work(async () => {
                      setBulkBusy(true);
                      try {
                        if (await onSave()) setBulkOpen(false);
                      } finally {
                        setBulkBusy(false);
                      }
                    })
                  }
                >
                  {bulkBusy ? "저장 중…" : "저장하고 적용"}
                </button>
              </div>
            )}
          </section>
        </PhotoModal>
      )}
      {dragLabel && (
        <div className="catalog-drag-status" role="status">
          {dragLabel}
        </div>
      )}
      {[...groups].map(([folderId, items]) => (
        <section className="catalog-product-group" key={folderId}>
          <div className="catalog-group-path">
            {folderPath(catalog, folderId).map((f, i) => (
              <span
                key={f.id}
                className={i === 0 ? "group-root" : "group-child"}
                title={websiteFolderPresence(catalog, f.id)?.label}
                style={{
                  color:
                    i > 0
                      ? websiteFolderPresence(catalog, f.id)?.color ||
                        f.color ||
                        "#155e59"
                      : f.color || "#155e59",
                }}
              >
                {i > 0 && <ChevronRight size={12} />}
                {f.name}
              </span>
            ))}
            {!folderPath(catalog, folderId).length && (
              <span className="group-root">미분류</span>
            )}
            <small>{items.length}개 상품</small>
          </div>
          {items.map((p) => (
            <article className="catalog-product-row" key={p.id}>
              <div className="catalog-product-heading">
                <button
                  type="button"
                  className="product-expander"
                  aria-label={
                    p.name + (isOpen(p.id) ? " 옵션 접기" : " 옵션 펼치기")
                  }
                  aria-expanded={isOpen(p.id)}
                  onClick={() => toggle(p.id)}
                >
                  <ChevronRight
                    size={17}
                    style={{
                      transform: isOpen(p.id) ? "rotate(90deg)" : undefined,
                    }}
                  />
                </button>
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
                          work(async () => {
                            onChange(moveProducts(catalog, d.ids, target));
                            onSelection([]);
                          });
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
                    옵션 {p.options.length}개 ·{" "}
                    {p.active ? "판매 활성" : "판매 비활성"}
                  </small>
                </button>
                {editable && (
                  <button
                    type="button"
                    className={"badge " + (p.active ? "P" : "H")}
                    aria-label={`${p.name} 메뉴 판매 ${p.active ? "활성" : "비활성"}`}
                    aria-pressed={p.active}
                    onClick={() => change({ ...p, active: !p.active })}
                  >
                    {p.active ? "판매 활성" : "판매 비활성"}
                  </button>
                )}
                <button
                  type="button"
                  className={
                    "badge catalog-review-button " + (p.active ? "P" : "H")
                  }
                  aria-label={
                    p.name + " " + (needsReview(p) ? "검토하기" : "상세 편집")
                  }
                  onClick={() => onEdit(p.id)}
                >
                  {needsReview(p) ? "검토 중 · 검토하기" : "상세 편집"}
                </button>
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
                {editable && (
                  <button
                    type="button"
                    className="catalog-delete-button"
                    aria-label={p.name + " 삭제"}
                    title="상품 삭제 · 편집 창에서는 Delete"
                    onClick={() => onDelete([p.id])}
                  >
                    <Trash2 size={16} /> 삭제
                  </button>
                )}
              </div>
              <InsuranceBadges
                info={p.insurance}
                showUnknown={catalogBook(catalog) === "보험"}
              />
              <WebsiteSourceInfo product={p} />
              {p.webEvent && (
                <EventSourceInfo
                  info={p.webEvent}
                  salePrice={p.options[0]?.price}
                  regularPrice={
                    p.options[0]
                      ? eventOptionPrices(p, p.options[0]).regularPrice
                      : undefined
                  }
                  compact
                />
              )}
              {isOpen(p.id) && (
                <div className="catalog-options-visible">
                  {p.options.map((o) => (
                    <div
                      className={
                        "catalog-option-visible" +
                        (catalogBook(catalog) === "이벤트" ||
                        p.webEvent ||
                        o.priceKind === "event" ||
                        o.regularPrice !== undefined
                          ? " event-option"
                          : "")
                      }
                      key={o.id}
                    >
                      <span>
                        <b>{o.label}</b>
                        <InsuranceClaimHint option={o} />
                        <small>
                          {o.unit}
                          {o.review ? " · 검토 필요" : ""}
                        </small>
                      </span>
                      {editable ? (
                        <>
                          {(catalogBook(catalog) === "이벤트" ||
                            p.webEvent ||
                            o.priceKind === "event" ||
                            o.regularPrice !== undefined) && (
                            <label className="event-regular-input">
                              정가 (원)
                              <input
                                type="number"
                                min={0}
                                step={1}
                                aria-label={`${p.name} ${o.label} 정가`}
                                value={
                                  eventOptionPrices(p, o).regularPrice ?? ""
                                }
                                placeholder="정가 미확정"
                                onChange={(e) =>
                                  change({
                                    ...p,
                                    options: p.options.map((x) =>
                                      x.id === o.id
                                        ? {
                                            ...x,
                                            regularPrice:
                                              e.target.value === ""
                                                ? null
                                                : Number(e.target.value),
                                          }
                                        : x,
                                    ),
                                  })
                                }
                              />
                            </label>
                          )}
                          <label className="catalog-price-input">
                            {p.insurance?.coverage === "covered"
                              ? "환자 본인부담금 (원)"
                              : catalogBook(catalog) === "이벤트" ||
                                  p.webEvent ||
                                  o.priceKind === "event" ||
                                  o.regularPrice !== undefined
                                ? "판매가 (원)"
                                : "가격 (원)"}
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
                          </label>
                          <select
                            aria-label={`${p.name} ${o.label} 부가세`}
                            value={o.tax}
                            onChange={(e) =>
                              change({
                                ...p,
                                options: p.options.map((x) =>
                                  x.id === o.id
                                    ? {
                                        ...x,
                                        tax: e.target.value as typeof o.tax,
                                      }
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
                      {(catalogBook(catalog) === "이벤트" ||
                        p.webEvent ||
                        o.priceKind === "event" ||
                        o.regularPrice !== undefined) && (
                        <div className="event-price-preview">
                          <EventPrice {...eventOptionPrices(p, o)} />
                        </div>
                      )}
                    </div>
                  ))}
                  {!p.options.length && (
                    <p className="small">상품 상세에서 옵션을 추가하세요.</p>
                  )}
                </div>
              )}
            </article>
          ))}
        </section>
      ))}
      {!products.length && (
        <p className="small">조건에 맞는 상품이 없습니다.</p>
      )}
    </div>
  );
}
