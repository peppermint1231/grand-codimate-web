import { catalogRegularPrice } from "../core/quotePrices";
import { useState } from "react";
import { PhotoModal } from "./PhotoBoard";
import { catalogChanges } from "../core/catalogHistory";
import { calculate } from "../core/domain";
import { catalogBook, money, type Catalog, type Line } from "../core/model";
import { productComposition } from "../core/offerings";
export function CatalogPublishReview({
  catalog,
  previous,
  close,
  publish,
}: {
  catalog: Catalog;
  previous?: Catalog;
  close: () => void;
  publish: () => Promise<unknown>;
}) {
  const [search, setSearch] = useState(""),
    [lines, setLines] = useState<Line[]>([]),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const changes = catalogChanges(previous, catalog),
    quote = calculate(lines, { kind: "amount", value: 0 }, "separate");
  return (
    <PhotoModal
      label="게시 전 검토 · 상담 미리보기"
      className="overlay catalog-publish-overlay"
      close={close}
    >
      <section className="catalog-publish-dialog">
        <div className="section-title">
          <h2>게시 전 검토 · 상담 미리보기</h2>
          <button onClick={close} disabled={busy}>
            닫기
          </button>
        </div>
        <p>
          {catalogBook(catalog)} · 활성 상품{" "}
          {catalog.products.filter((p) => p.active).length}개
        </p>
        <details open>
          <summary>기존 게시본과 변경 {changes.length}건</summary>
          <ul className="catalog-publish-changes">
            {changes.map((c, i) => (
              <li key={i}>{c}</li>
            ))}
          </ul>
        </details>
        <h3>상담 미리보기</h3>
        <p className="small">
          시술을 눌러 금액과 구성을 확인하세요. 실제 상담이나 장바구니에
          저장되지 않습니다.
        </p>
        <input
          aria-label="미리보기 상품 검색"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="상품 검색"
        />
        <div className="catalog-publish-preview">
          {catalog.products
            .filter((p) => p.active && p.name.includes(search))
            .map((p) => (
              <article key={p.id}>
                <b>{p.name}</b>
                {productComposition(p) && (
                  <p className="small">{productComposition(p)}</p>
                )}
                {p.options.map((o) => (
                  <button
                    key={o.id}
                    disabled={
                      o.price === null || o.review || o.tax === "unknown"
                    }
                    onClick={() =>
                      setLines((v) => [
                        ...v,
                        {
                          id: crypto.randomUUID(),
                          productId: p.id,
                          optionId: o.id,
                          name: p.name,
                          label: o.label,
                          unit: o.unit,
                          quantity: 1,
                          price: o.price!,
                          regularPrice: catalogRegularPrice(p, o),
                          tax: o.tax,
                          discount: { kind: "amount", value: 0 },
                        },
                      ])
                    }
                  >
                    {o.label} · {o.price === null ? "미확정" : money(o.price)} ·{" "}
                    {o.tax === "exclusive"
                      ? "VAT 별도"
                      : o.tax === "inclusive"
                        ? "VAT 포함"
                        : o.tax === "exempt"
                          ? "면세"
                          : "VAT 확인 필요"}
                    {o.review ? " · 검토 필요" : ""}
                  </button>
                ))}
              </article>
            ))}
        </div>
        <p className="total">
          미리보기 {lines.length}개 · {money(quote.total)}
          <button onClick={() => setLines([])}>비우기</button>
        </p>
        {error && (
          <p className="error" role="alert">
            {error}
          </p>
        )}
        <button
          className="primary"
          disabled={busy}
          onClick={async () => {
            setBusy(true);
            setError("");
            try {
              if (await publish()) close();
            } catch (e) {
              setError((e as Error).message);
            } finally {
              setBusy(false);
            }
          }}
        >
          {busy ? "게시 중…" : "검토 완료 · 게시"}
        </button>
      </section>
    </PhotoModal>
  );
}
