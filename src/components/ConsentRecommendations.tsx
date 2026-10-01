import { recommendConsents } from "../core/consentRecommendations";
import type { Consent, Line } from "../core/model";
export function ConsentRecommendations({
  consents,
  lines,
  queue,
  current,
  choose,
}: {
  consents: Consent[];
  lines: Line[];
  queue: string[];
  current: string;
  choose: (ids: string[]) => void;
}) {
  const recommendations = recommendConsents(consents, lines);
  return (
    <section
      className="consent-recommendations"
      aria-label="장바구니 맞춤 동의서 추천"
    >
      <div className="section-title">
        <b>장바구니 맞춤 추천</b>
        {recommendations.length > 0 && (
          <button
            type="button"
            onClick={() => choose(recommendations.map((r) => r.template.id))}
          >
            추천 모두 선택 ({recommendations.length})
          </button>
        )}
      </div>
      <p className="small">
        게시된 양식에서 시술명·옵션·구성을 비교합니다. 실제 시술에 맞는지
        확인하세요. 선택해도 확인 체크나 환자 서명은 자동 입력되지 않습니다.
      </p>
      {!lines.length ? (
        <p className="small">
          장바구니에 시술을 담으면 관련 동의서를 추천합니다.
        </p>
      ) : !recommendations.length ? (
        <p className="small">
          일치하는 게시 양식이 없습니다. 아래 전체 양식에서 직접 선택하세요.
        </p>
      ) : (
        <div className="consent-recommendation-list">
          {recommendations.map((r) => (
            <article key={r.template.id}>
              <button
                type="button"
                aria-pressed={current === r.template.id}
                onClick={() => choose([r.template.id])}
              >
                {r.template.name}{" "}
                <small>
                  v{r.template.version} ·{" "}
                  {current === r.template.id ? "확인 중" : "선택·보기"}
                </small>
              </button>
              <small>{r.reasons.join(" / ")}</small>
            </article>
          ))}
        </div>
      )}
      {queue.length > 1 && (
        <p role="status" className="small">
          선택한 동의서 {queue.length}개 · 현재 양식을 서명 저장하면 다음
          양식으로 이동합니다.
        </p>
      )}
    </section>
  );
}
