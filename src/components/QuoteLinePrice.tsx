import { quoteLinePrices } from "../core/quotePrices";
import { money, type Line, type Quote } from "../core/model";

export function QuoteLinePrice({ line, quote }: { line: Line; quote?: Quote }) {
  const prices = quoteLinePrices(
    quote?.lines || [line],
    quote?.discount || { kind: "amount", value: 0 },
  );
  const p =
    prices[
      quote
        ? Math.max(
            0,
            quote.lines.findIndex((l) => l.id === line.id),
          )
        : 0
    ];
  if (Object.values(p).some((value) => !Number.isFinite(value) || value < 0))
    return <div className="quote-line-price">금액 입력값을 확인해주세요.</div>;
  return (
    <div className="quote-line-price">
      <span>시술 금액 {money(p.regular)}</span>
      {p.catalogDiscount > 0 && (
        <small>상품 할인 − {money(p.catalogDiscount)}</small>
      )}
      {p.itemDiscount > 0 && <small>항목 할인 − {money(p.itemDiscount)}</small>}
      {p.globalDiscount > 0 && (
        <small>전체 할인 배분 − {money(p.globalDiscount)}</small>
      )}
      {p.discountTotal > 0 && <strong>할인가 {money(p.discounted)}</strong>}
    </div>
  );
}
