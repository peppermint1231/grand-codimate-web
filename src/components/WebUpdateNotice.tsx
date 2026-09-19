/// <reference types="vite-plugin-pwa/react" />
import { useRegisterSW } from "virtual:pwa-register/react";
export function WebUpdateNotice() {
  const {
    needRefresh: [ready, setReady],
    updateServiceWorker,
  } = useRegisterSW();
  if (!ready) return null;
  return (
    <div className="web-update-notice" role="status">
      <span>새 버전이 준비되었습니다. 상담 저장 후 적용하세요.</span>
      <button
        onClick={() => {
          if (
            window.confirm(
              "상담 내용을 저장했나요? 새 버전을 적용하면 화면을 다시 엽니다.",
            )
          )
            void updateServiceWorker(true);
        }}
      >
        업데이트 적용
      </button>
      <button onClick={() => setReady(false)}>나중에</button>
    </div>
  );
}
