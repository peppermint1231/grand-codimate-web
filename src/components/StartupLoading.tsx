import { BrandMark } from "./BrandMark";
import "./StartupLoading.css";
export function StartupLoading({
  reconnecting = false,
}: {
  reconnecting?: boolean;
}) {
  return (
    <main
      className="codimate-startup"
      aria-busy="true"
      aria-label="코디메이트 시작 중"
    >
      <div className="startup-glow" aria-hidden="true" />
      <section className="startup-content" role="status" aria-live="polite">
        <div className="startup-mark" aria-hidden="true">
          <BrandMark size={88} />
          <i />
          <i />
        </div>
        <p className="startup-wordmark">CODIMATE</p>
        <h1>상담을 이어주는 공간</h1>
        <p className="startup-message">
          {reconnecting
            ? "연결을 확인하고 있어요"
            : "오늘의 상담을 준비하고 있어요"}
        </p>
        <div className="startup-dots" aria-hidden="true">
          <i />
          <i />
          <i />
        </div>
        <small>코디메이트</small>
      </section>
    </main>
  );
}
