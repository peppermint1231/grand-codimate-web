import { useEffect, useState } from "react";
import { native, NativeClinic } from "../lib/native";
const key = "codimate.stylus-button";
const read = () => {
  try {
    return localStorage.getItem(key) !== "off";
  } catch {
    return true;
  }
};
export function useStylusButton() {
  const [enabled, setEnabled] = useState(read);
  useEffect(() => {
    const update = () => setEnabled(read());
    window.addEventListener("codimate:stylus-setting", update);
    window.addEventListener("storage", update);
    return () => {
      window.removeEventListener("codimate:stylus-setting", update);
      window.removeEventListener("storage", update);
    };
  }, []);
  return enabled;
}
export function StylusSettings() {
  const enabled = useStylusButton();
  const [error, setError] = useState("");
  return (
    <details className="stylus-settings">
      <summary>S펜 설정</summary>
      <label>
        <input
          type="checkbox"
          checked={enabled}
          onChange={(e) => {
            try {
              localStorage.setItem(key, e.target.checked ? "on" : "off");
              window.dispatchEvent(new Event("codimate:stylus-setting"));
            } catch {
              setError("기기 설정을 저장하지 못했습니다.");
            }
          }}
        />
        편집기에서 S펜 버튼을 누르는 동안 지우개 사용
      </label>
      <p className="small">
        편집기가 열린 동안 앱에 전달된 펜 버튼을 편집기에서 처리합니다. 갤럭시
        시스템의 에어 액션·에어 커맨드 설정은 자동으로 바뀌지 않습니다.
      </p>
      <p className="small">
        버튼을 누르면 다른 앱이나 메뉴가 열린다면 기기 설정 → 유용한 기능 →
        S펜에서 ‘에어 액션’과 ‘에어 커맨드 → 펜 버튼으로 에어 커맨드 열기’를
        확인하고 사용하지 않는 동작을 꺼주세요. 기종에 따라 항목명이 다를 수
        있습니다.
      </p>
      {native && (
        <button
          type="button"
          onClick={() =>
            void NativeClinic.openDeviceSettings().catch(() =>
              setError("기기의 설정 앱에서 유용한 기능 → S펜을 열어주세요."),
            )
          }
        >
          기기 설정 열기
        </button>
      )}
      {error && <p role="alert">{error}</p>}
    </details>
  );
}
