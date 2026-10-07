import { productType } from "../core/productType";
import { catalogNodes, folderPath } from "../core/catalogFolders";
import { useRef, useState } from "react";
import type { Catalog, Product, Option } from "../core/model";
import { money } from "../core/model";
import {
  balancePackage,
  movePackagePlacement,
  packageBlocks,
  packageTotal,
  packageSale,
  type PackagePlan,
} from "../core/packageBuilder";
export const blankPackage = (): PackagePlan => ({
  durationDays: 365,
  sessions: 5,
  blocks: [],
  placements: [],
  discountType: "percent",
  discountValue: 0,
});
export function PackageBuilder({
  catalogs,
  value,
  onChange,
  blockCatalog,
  onAddBlock,
}: {
  catalogs: Catalog[];
  blockCatalog?: Catalog;
  onAddBlock?: (p: Product) => void;
  value: PackagePlan;
  onChange: (p: PackagePlan) => void;
}) {
  const [category, setCategory] = useState(""),
    [search, setSearch] = useState("");
  const [limit, setLimit] = useState(60),
    [hovered, setHovered] = useState<{ session: number; beforeId?: string }>();
  const pointer = useRef<{ x: number; y: number; moved: boolean } | undefined>(
    undefined,
  );
  const nativeDrag = useRef(false);
  const [newBlock, setNewBlock] = useState({
      name: "",
      label: "1회",
      price: "",
      unit: "회",
      folderId:
        catalogNodes(blockCatalog || catalogs[0]).find((f) => !f.linkTo)?.id ||
        "",
    }),
    [blockError, setBlockError] = useState("");
  const blocks = packageBlocks(catalogs),
    categories = [...new Set(blocks.map((b) => b.category))].sort((a, b) =>
      a.localeCompare(b, "ko"),
    );
  const copyCandidates = catalogs.flatMap((c) =>
    c.products
      .filter((p) => productType(p) === "single")
      .flatMap((p) =>
        p.options
          .filter(
            (o) =>
              o.price !== null &&
              o.tax !== "unknown" &&
              !o.offering &&
              o.priceKind !== "quote",
          )
          .map((o) => ({ id: c.id + ":" + p.id + ":" + o.id, c, p, o })),
      ),
  );
  const available = blocks.filter(
    (b) =>
      (!category || b.category === category) &&
      b.name.toLocaleLowerCase().includes(search.toLocaleLowerCase()),
  );
  const update = (patch: Partial<PackagePlan>) =>
    onChange({ ...value, ...patch });
  const move = (id: string, session: number, beforeId?: string) =>
    update({
      placements: movePackagePlacement(value.placements, id, session, beforeId),
    });
  const dropTarget = (clientX: number, clientY: number) => {
    const section = document
      .elementFromPoint(clientX, clientY)
      ?.closest<HTMLElement>("[data-package-session]");
    if (!section) return;
    const rows = [
      ...section.querySelectorAll<HTMLElement>("[data-placement-id]"),
    ];
    const before = rows.find((row) => {
      const rect = row.getBoundingClientRect();
      return clientY < rect.top + rect.height / 2;
    });
    return {
      session: Number(section.dataset.packageSession),
      beforeId: before?.dataset.placementId,
    };
  };
  const quantity = (id: string, n: number) => {
    const next = value.blocks.map((b) =>
      b.id === id
        ? {
            ...b,
            quantity: Math.max(
              1,
              Math.min(
                100,
                1000 - value.placements.filter((x) => x.blockId !== id).length,
                n || 1,
              ),
            ),
          }
        : b,
    );
    const block = next.find((b) => b.id === id)!;
    const old = value.placements.filter((x) => x.blockId === id);
    update({
      blocks: next,
      placements: [
        ...value.placements.filter(
          (x) => x.blockId !== id || old.indexOf(x) < block.quantity,
        ),
        ...Array.from(
          { length: Math.max(0, block.quantity - old.length) },
          () => ({ id: crypto.randomUUID(), blockId: id, session: 0 }),
        ),
      ],
    });
  };
  return (
    <div className="package-builder">
      <div className="form-grid">
        <label className="field">
          이용기간 (일)
          <input
            type="number"
            min="1"
            max="3650"
            value={value.durationDays}
            onChange={(e) => update({ durationDays: Number(e.target.value) })}
          />
        </label>
        <label className="field">
          총 방문 회차
          <input
            type="number"
            min="1"
            max="100"
            value={value.sessions}
            onChange={(e) => {
              const sessions = Math.max(
                1,
                Math.min(100, Number(e.target.value) || 1),
              );
              update({
                sessions,
                placements: value.placements.map((x) => ({
                  ...x,
                  session: x.session > sessions ? 0 : x.session,
                })),
              });
            }}
          />
        </label>
      </div>
      <h4>① 개별 시술 블록 고르기</h4>
      <p className="small">
        [블록] 타입으로 등록한 개별 시술 옵션을 사용합니다. 패키지·멤버십·가격
        또는 부가세 미확정 항목은 제외합니다. 선택 시점의 가격으로 계산합니다.
        면세와 과세 항목은 별도 패키지로 구성해주세요.
      </p>
      {blockCatalog && onAddBlock && (
        <details className="quick-block">
          <summary>+ 필요한 블록 바로 만들기</summary>
          <p className="small">
            새 블록은 편집 중 단가표에도 비활성으로 추가됩니다. 단가표를
            저장해야 다른 기기에 반영됩니다.
          </p>
          <label className="field">
            기존 일반 상품에서 가져오기 (선택)
            <select
              aria-label="기존 일반 상품에서 블록 복사"
              defaultValue=""
              onChange={(e) => {
                const found = copyCandidates.find(
                  (x) => x.id === e.target.value,
                );
                if (found)
                  setNewBlock({
                    ...newBlock,
                    name: found.p.name,
                    label: found.o.label,
                    unit: found.o.unit,
                    price: String(
                      Math.round(
                        found.o.price! /
                          (found.o.tax === "inclusive" ? 1.1 : 1),
                      ),
                    ),
                    folderId:
                      found.c.id === blockCatalog.id
                        ? found.p.folderId || newBlock.folderId
                        : newBlock.folderId,
                  });
              }}
            >
              <option value="">직접 입력하거나 기존 시술 선택</option>
              {copyCandidates
                .filter((x) => x.o.tax !== "exempt")
                .map((x) => (
                  <option key={x.id} value={x.id}>
                    {x.p.name} · {x.o.label}
                  </option>
                ))}
            </select>
            <small>원래 상품은 유지하고, 별도 블록으로 복사합니다.</small>
          </label>
          <div className="form-grid">
            <label className="field">
              블록 상품명
              <input
                value={newBlock.name}
                maxLength={160}
                onChange={(e) =>
                  setNewBlock({ ...newBlock, name: e.target.value })
                }
              />
            </label>
            <label className="field">
              블록 폴더
              <select
                value={newBlock.folderId}
                onChange={(e) =>
                  setNewBlock({ ...newBlock, folderId: e.target.value })
                }
              >
                {catalogNodes(blockCatalog)
                  .filter((f) => !f.linkTo)
                  .map((f) => (
                    <option key={f.id} value={f.id}>
                      {folderPath(blockCatalog, f.id)
                        .map((x) => x.name)
                        .join(" / ")}
                    </option>
                  ))}
              </select>
            </label>
            <label className="field">
              블록 옵션명
              <input
                value={newBlock.label}
                maxLength={100}
                onChange={(e) =>
                  setNewBlock({ ...newBlock, label: e.target.value })
                }
              />
            </label>
            <label className="field">
              블록 단위
              <input
                value={newBlock.unit}
                maxLength={30}
                onChange={(e) =>
                  setNewBlock({ ...newBlock, unit: e.target.value })
                }
              />
            </label>
            <label className="field">
              블록 가격 (부가세 별도)
              <input
                type="number"
                min="0"
                value={newBlock.price}
                onChange={(e) =>
                  setNewBlock({ ...newBlock, price: e.target.value })
                }
              />
            </label>
          </div>
          <button
            type="button"
            onClick={() => {
              setBlockError("");
              const price = Number(newBlock.price);
              if (
                !newBlock.name.trim() ||
                !newBlock.label.trim() ||
                !newBlock.folderId ||
                newBlock.price === "" ||
                !Number.isSafeInteger(price) ||
                price < 0 ||
                price > 1e9
              ) {
                setBlockError(
                  "블록 이름·옵션·폴더와 올바른 가격을 입력해주세요.",
                );
                return;
              }
              if (
                value.blocks.length >= 100 ||
                value.placements.length >= 1000
              ) {
                setBlockError("패키지 구성 한도를 초과했습니다.");
                return;
              }
              const now = new Date().toISOString();
              const o: Option = {
                id: crypto.randomUUID(),
                label: newBlock.label.trim(),
                unit: newBlock.unit,
                price,
                tax: "exclusive",
                review: true,
                issues: [],
                sources: [],
                priceKind: "clinic",
              };
              const p: Product = {
                id: crypto.randomUUID(),
                rev: 1,
                createdAt: now,
                updatedAt: now,
                name: newBlock.name.trim(),
                description: "",
                composition: "",
                category: folderPath(blockCatalog, newBlock.folderId)
                  .map((f) => f.name)
                  .join(" / "),
                folderId: newBlock.folderId,
                active: false,
                publicVisible: false,
                productType: "block",
                sources: [],
                options: [o],
              };
              const b = packageBlocks([{ ...blockCatalog, products: [p] }])[0];
              if (!b) {
                setBlockError(
                  "패키지 이름이 아닌 개별 시술 이름으로 입력해주세요.",
                );
                return;
              }
              onAddBlock(p);
              update({
                blocks: [...value.blocks, b],
                placements: [
                  ...value.placements,
                  { id: crypto.randomUUID(), blockId: b.id, session: 0 },
                ],
              });
              setNewBlock({ ...newBlock, name: "", price: "" });
            }}
          >
            블록 등록하고 담기
          </button>
          {blockError && (
            <p role="alert" className="error">
              {blockError}
            </p>
          )}
        </details>
      )}
      <div className="form-grid">
        <label className="field">
          블록 카테고리
          <select
            value={category}
            onChange={(e) => {
              setCategory(e.target.value);
              setLimit(60);
            }}
          >
            <option value="">모든 카테고리</option>
            {categories.map((c) => (
              <option key={c}>{c}</option>
            ))}
          </select>
        </label>
        <label className="field">
          블록 검색
          <input
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setLimit(60);
            }}
            placeholder="시술명·옵션명"
          />
        </label>
      </div>
      <div className="package-library">
        {available.slice(0, limit).map((b) => (
          <button
            type="button"
            key={b.id}
            disabled={
              value.placements.length >= 1000 ||
              (value.blocks.length >= 100 &&
                !value.blocks.some((x) => x.id === b.id))
            }
            onClick={() => {
              if (value.blocks.some((x) => x.id === b.id)) {
                quantity(
                  b.id,
                  value.blocks.find((x) => x.id === b.id)!.quantity + 1,
                );
                return;
              }
              update({
                blocks: [...value.blocks, b],
                placements: [
                  ...value.placements,
                  { id: crypto.randomUUID(), blockId: b.id, session: 0 },
                ],
              });
            }}
          >
            <span>
              {b.name}
              <small>{b.category}</small>
            </span>
            <b>{money(packageTotal([b]))} +</b>
          </button>
        ))}
        {available.length > limit && (
          <button type="button" onClick={() => setLimit(limit + 60)}>
            블록 더 보기 ({limit}/{available.length})
          </button>
        )}
        {!available.length && (
          <p>
            해당하는 개별 상품이 없습니다. 일반 상품을 먼저 등록하거나 다른
            분류를 선택해주세요.
          </p>
        )}
      </div>
      <h4>② 총 사용 수량 정하기</h4>
      {value.blocks.map((b) => (
        <div className="package-quantity" key={b.id}>
          <span>
            {b.name}
            <small>
              1단위 {money(packageTotal([{ ...b, quantity: 1 }]))} ·{" "}
              {b.tax === "exempt" ? "면세" : "부가세 별도"}
            </small>
          </span>
          <label>
            수량
            <input
              aria-label={b.name + " 총 수량"}
              type="number"
              min="1"
              max="100"
              value={b.quantity}
              onChange={(e) => quantity(b.id, Number(e.target.value))}
            />
          </label>
          <button
            type="button"
            onClick={() =>
              update({
                blocks: value.blocks.filter((x) => x.id !== b.id),
                placements: value.placements.filter((x) => x.blockId !== b.id),
              })
            }
          >
            제거
          </button>
        </div>
      ))}
      <h4>③ 회차마다 배치하기</h4>
      <button
        type="button"
        disabled={!value.blocks.length}
        onClick={() =>
          update({ placements: balancePackage(value.blocks, value.sessions) })
        }
      >
        균형 있게 자동 배치
      </button>
      <p className="small">
        수량을 고르게 나눕니다. 시술 순서·간격은 직접 확인하세요. ↕ 손잡이를
        끌어 회차와 순서를 바꾸거나 ‘이동할 회차’를 선택하세요. 손잡이에 초점을
        둔 뒤 Alt+↑/↓로도 순서를 바꿀 수 있습니다.
      </p>
      <div className="package-sessions">
        {Array.from({ length: value.sessions + 1 }, (_, session) => (
          <section
            key={session}
            data-package-session={session}
            className={
              hovered?.session === session
                ? `package-drop-target ${!hovered.beforeId ? "package-drop-end" : ""}`
                : ""
            }
            onDragOver={(e) => {
              e.preventDefault();
              setHovered(dropTarget(e.clientX, e.clientY));
            }}
            onDrop={(e) => {
              e.preventDefault();
              const id = e.dataTransfer.getData("application/codimate-package");
              const target = dropTarget(e.clientX, e.clientY);
              if (id && target) move(id, target.session, target.beforeId);
              setHovered(undefined);
            }}
          >
            <h5>
              {session === 0 ? "아직 배치하지 않은 블록" : `${session}회차`}{" "}
              <small>
                {value.placements.filter((x) => x.session === session).length}개
              </small>
            </h5>
            {value.placements
              .filter((x) => x.session === session)
              .map((x) => (
                <div
                  className={`package-chip ${hovered?.beforeId === x.id ? "package-drop-before" : ""}`}
                  key={x.id}
                  data-placement-id={x.id}
                >
                  <button
                    type="button"
                    className="package-drag"
                    aria-label="블록 이동 손잡이"
                    draggable
                    title="끌어서 이동 · Alt+↑/↓로 순서 변경"
                    onKeyDown={(e) => {
                      if (
                        !e.altKey ||
                        !["ArrowUp", "ArrowDown"].includes(e.key)
                      )
                        return;
                      e.preventDefault();
                      const rows = value.placements.filter(
                        (p) => p.session === session,
                      );
                      const index = rows.findIndex((p) => p.id === x.id);
                      if (e.key === "ArrowUp" && index > 0)
                        move(x.id, session, rows[index - 1].id);
                      if (e.key === "ArrowDown" && index < rows.length - 1)
                        move(x.id, session, rows[index + 2]?.id);
                    }}
                    onDragStart={(e) => {
                      nativeDrag.current = true;
                      e.dataTransfer.effectAllowed = "move";
                      e.dataTransfer.setData(
                        "application/codimate-package",
                        x.id,
                      );
                    }}
                    onDragEnd={() => {
                      nativeDrag.current = false;
                      pointer.current = undefined;
                      setHovered(undefined);
                    }}
                    onPointerMove={(e) => {
                      const start = pointer.current;
                      if (!start || nativeDrag.current) return;
                      start.moved ||=
                        Math.hypot(e.clientX - start.x, e.clientY - start.y) >
                        6;
                      if (start.moved)
                        setHovered(dropTarget(e.clientX, e.clientY));
                    }}
                    onPointerCancel={() => {
                      pointer.current = undefined;
                      setHovered(undefined);
                    }}
                    onPointerDown={(e) => {
                      if (e.button !== 0) return;
                      nativeDrag.current = false;
                      pointer.current = {
                        x: e.clientX,
                        y: e.clientY,
                        moved: false,
                      };
                      e.currentTarget.setPointerCapture(e.pointerId);
                    }}
                    onPointerUp={(e) => {
                      if (pointer.current?.moved && !nativeDrag.current) {
                        const target = dropTarget(e.clientX, e.clientY);
                        if (target) move(x.id, target.session, target.beforeId);
                      }
                      pointer.current = undefined;
                      setHovered(undefined);
                    }}
                  >
                    ↕
                  </button>
                  <span
                    title={value.blocks.find((b) => b.id === x.blockId)?.name}
                  >
                    {value.blocks.find((b) => b.id === x.blockId)?.name}
                  </span>
                  <select
                    aria-label="이동할 회차"
                    value={session}
                    onChange={(e) => move(x.id, Number(e.target.value))}
                  >
                    {Array.from({ length: value.sessions + 1 }, (_, n) => (
                      <option key={n} value={n}>
                        {n === 0 ? "미배치" : `${n}회차`}
                      </option>
                    ))}
                  </select>
                </div>
              ))}
          </section>
        ))}
      </div>
      <h4>④ 패키지 가격 정하기</h4>
      <p>
        블록 합계 <strong>{money(packageTotal(value.blocks))}</strong>{" "}
        <small>면세 항목은 그대로, 과세 항목은 부가세 별도 금액으로 합산</small>
      </p>
      <div className="form-grid">
        <label className="field">
          할인 방식
          <select
            value={value.discountType}
            onChange={(e) =>
              update({
                discountType: e.target.value as PackagePlan["discountType"],
                discountValue: 0,
              })
            }
          >
            <option value="percent">할인율 (%)</option>
            <option value="amount">할인액 (원)</option>
          </select>
        </label>
        <label className="field">
          {value.discountType === "percent" ? "할인율 (%)" : "할인액 (원)"}
          <input
            type="number"
            min="0"
            max={
              value.discountType === "percent"
                ? 100
                : packageTotal(value.blocks)
            }
            value={value.discountValue}
            onChange={(e) => update({ discountValue: Number(e.target.value) })}
          />
        </label>
      </div>
      <p className="package-final-price">
        패키지 판매가 (
        {value.blocks.length > 0 &&
        value.blocks.every((b) => b.tax === "exempt")
          ? "면세"
          : "부가세 별도"}
        ) <strong>{money(packageSale(value))}</strong>
      </p>
    </div>
  );
}
