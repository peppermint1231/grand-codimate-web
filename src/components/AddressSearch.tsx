import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
export interface AddressResult {
  sido: string;
  sigungu: string;
  bname: string;
  bname1?: string;
}
export function neighborhood(data: AddressResult) {
  return [
    ...new Set(
      [data.sido, data.sigungu, data.bname1 || data.bname].filter(Boolean),
    ),
  ].join(" ");
}
type Provider = {
  Postcode: new (options: {
    oncomplete: (d: AddressResult) => void;
    width: string;
    height: string;
  }) => { embed: (target: HTMLElement) => void };
};
const provider = () =>
  (window as unknown as { kakao?: Provider; daum?: Provider }).kakao ||
  (window as unknown as { daum?: Provider }).daum;
let loading: Promise<void> | undefined;
function loadPostcode() {
  if (provider()?.Postcode) return Promise.resolve();
  return (loading ||= new Promise<void>((resolve, reject) => {
    const script = document.createElement("script");
    script.src =
      "https://t1.kakaocdn.net/mapjsapi/bundle/postcode/prod/postcode.v2.js";
    script.async = true;
    const timer = setTimeout(() => {
      loading = undefined;
      script.remove();
      reject(
        new Error(
          "주소 검색 연결이 지연됩니다. 주소를 직접 입력하거나 다시 시도하세요.",
        ),
      );
    }, 15000);
    script.onload = () => {
      clearTimeout(timer);
      if (provider()?.Postcode) resolve();
      else {
        loading = undefined;
        reject(new Error("주소 검색을 불러오지 못했습니다."));
      }
    };
    script.onerror = () => {
      clearTimeout(timer);
      loading = undefined;
      script.remove();
      reject(new Error("인터넷 연결을 확인하거나 동·읍·면을 직접 입력하세요."));
    };
    document.head.appendChild(script);
  }));
}
export function AddressSearch({
  value,
  onChange,
}: {
  value: string;
  onChange: (s: string) => void;
}) {
  const [opened, setOpened] = useState(false),
    [error, setError] = useState(""),
    [ready, setReady] = useState(false),
    ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!opened) return;
    let live = true;
    setError("");
    setReady(false);
    loadPostcode()
      .then(() => {
        if (!live || !ref.current) return;
        new (provider()!.Postcode)({
          width: "100%",
          height: "100%",
          oncomplete: (data) => {
            if (live) {
              onChange(neighborhood(data));
              setOpened(false);
            }
          },
        }).embed(ref.current);
        setReady(true);
      })
      .catch((e) => live && setError(e.message));
    return () => {
      live = false;
    };
  }, [opened]);
  return (
    <>
      <div className="address-input">
        <input
          aria-label="주소 (동까지)"
          required
          value={value}
          placeholder="주소 검색 또는 동·읍·면 입력"
          onChange={(e) => onChange(e.target.value)}
        />
        <button type="button" onClick={() => setOpened(true)}>
          주소 검색
        </button>
      </div>
      {opened &&
        createPortal(
          <div
            className="address-overlay"
            role="dialog"
            aria-modal="true"
            aria-label="주소 검색"
            onKeyDown={(e) => {
              if (e.key === "Escape") setOpened(false);
            }}
          >
            <div className="address-dialog">
              <div className="section-title">
                <h3>주소 검색</h3>
                <button
                  type="button"
                  autoFocus
                  onClick={() => setOpened(false)}
                >
                  닫기
                </button>
              </div>
              <p className="small">검색한 주소는 동·읍·면까지만 입력됩니다.</p>
              {!ready && !error && (
                <p role="status">주소 검색을 불러오는 중…</p>
              )}
              {error && <p role="alert">{error}</p>}
              <div
                ref={ref}
                style={{ height: "min(65vh, 520px)", minHeight: 320 }}
              />
            </div>
          </div>,
          document.body,
        )}
    </>
  );
}
