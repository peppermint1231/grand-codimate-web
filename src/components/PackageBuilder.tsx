import { productType } from "../core/productType";
import { catalogNodes, folderPath } from "../core/catalogFolders";
import { useState } from "react";
import type { Catalog, Product, Option } from "../core/model";
import { money } from "../core/model";
import {
  balancePackage,
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
    [hovered, setHovered] = useState<number>();
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
  const move = (id: string, session: number) =>
    update({
      placements: value.placements.map((x) =>
        x.id === id ? { ...x, session } : x,
      ),
    });
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
        ...value.placements.filter((x) => x.blockId !== id),
        ...old.slice(0, block.quantity),
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
            <b>{money(packageTotal([b]))}원 +</b>
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
              1단위 {money(packageTotal([{ ...b, quantity: 1 }]))}원 ·{" "}
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
        끌거나 ‘이동할 회차’를 선택해 조정할 수 있습니다.
      </p>
      <div className="package-sessions">
        {Array.from({ length: value.sessions + 1 }, (_, session) => (
          <section
            key={session}
            data-package-session={session}
            className={hovered === session ? "package-drop-target" : ""}
            onDragOver={(e) => {
              e.preventDefault();
              setHovered(session);
            }}
            onDrop={(e) => {
              e.preventDefault();
              const id = e.dataTransfer.getData("application/codimate-package");
              if (id) move(id, session);
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
                <div className="package-chip" key={x.id}>
                  <button
                    type="button"
                    className="package-drag"
                    aria-label="블록 이동 손잡이"
                    draggable
                    onDragStart={(e) =>
                      e.dataTransfer.setData(
                        "application/codimate-package",
                        x.id,
                      )
                    }
                    onDragEnd={() => setHovered(undefined)}
                    onPointerMove={(e) => {
                      if (e.buttons) {
                        const target = document
                          .elementFromPoint(e.clientX, e.clientY)
                          ?.closest<HTMLElement>("[data-package-session]");
                        setHovered(
                          target
                            ? Number(target.dataset.packageSession)
                            : undefined,
                        );
                      }
                    }}
                    onPointerCancel={() => setHovered(undefined)}
                    onPointerDown={(e) => {
                      e.currentTarget.setPointerCapture(e.pointerId);
                    }}
                    onPointerUp={(e) => {
                      const target = document
                        .elementFromPoint(e.clientX, e.clientY)
                        ?.closest<HTMLElement>("[data-package-session]");
                      if (target)
                        move(x.id, Number(target.dataset.packageSession));
                      setHovered(undefined);
                    }}
                  >
                    ↕
                  </button>
                  <span>
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
        블록 합계 <strong>{money(packageTotal(value.blocks))}원</strong>{" "}
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
        ) <strong>{money(packageSale(value))}원</strong>
      </p>
    </div>
  );
}
