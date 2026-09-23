import { money, type Quote } from "../core/model";
import { catalogDiscount } from "../core/quotePrices";

export function QuoteTotals({
  quote,
  error,
}: {
  quote: Quote;
  error?: string;
}) {
  const fixedDiscount = catalogDiscount(quote.lines);
  return (
    <div className="quote-totals" aria-label="견적 합계">
      {error ? (
        <p className="error">입력값을 확인하면 금액이 계산됩니다.</p>
      ) : (
        <dl>
          <div>
            <dt>시술 금액</dt>
            <dd>{money(quote.subtotal)}</dd>
          </div>
          <div>
            <dt>할인 합계</dt>
            <dd>− {money(quote.discountTotal)}</dd>
          </div>
          {fixedDiscount > 0 && (
            <>
              <div className="quote-discount-detail">
                <dt>상품 할인</dt>
                <dd>− {money(fixedDiscount)}</dd>
              </div>
              <div className="quote-discount-detail">
                <dt>추가·전체 할인</dt>
                <dd>− {money(quote.discountTotal - fixedDiscount)}</dd>
              </div>
            </>
          )}
          <div>
            <dt>공급가액·면세금액</dt>
            <dd>{money(quote.supply)}</dd>
          </div>
          <div>
            <dt>부가세</dt>
            <dd>{money(quote.vatAmount)}</dd>
          </div>
        </dl>
      )}
      <div className="total">
        <span>최종 안내금액</span>
        <strong>{error ? "계산 불가" : money(quote.total)}</strong>
      </div>
      {!error && (
        <p className="small">
          시술 금액은 정가 기준이며, 할인 후 금액에 상품별 부가세 기준을
          적용합니다. 최종 금액은 공급가액·면세금액과 부가세의 합계입니다. 포함
          상품의 부가세를 다시 더하지 않습니다.
        </p>
      )}
    </div>
  );
}
