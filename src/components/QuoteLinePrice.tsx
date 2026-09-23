import { linePrices } from "../core/quotePrices";
import { money, type Line } from "../core/model";

export function QuoteLinePrice({ line }: { line: Line }) {
  const { regular, sale, catalogDiscount } = linePrices(line);
  return (
    <div className="quote-line-price">
      <span>시술 금액 {money(regular)}</span>
      {catalogDiscount > 0 && (
        <>
          <small>상품 할인 − {money(catalogDiscount)}</small>
          <strong>할인가 {money(sale)}</strong>
        </>
      )}
    </div>
  );
}
