import { useEffect, useState } from "react";
import { PhotoModal } from "./PhotoBoard";
import { useAppBack } from "../lib/navigation";

export function DisplaySettings() {
  const [open, setOpen] = useState(false);
  const [scale, setScale] = useState(() => {
    const saved = Number(localStorage.getItem("codimate-ui-font-scale"));
    return saved >= 80 && saved <= 120 ? saved : 100;
  });
  useEffect(() => {
    document.documentElement.style.setProperty(
      "--ui-font-scale",
      String(scale / 100),
    );
    localStorage.setItem("codimate-ui-font-scale", String(scale));
  }, [scale]);
  useAppBack(open, () => setOpen(false), 90);
  return (
    <>
      <button
        type="button"
        aria-label="UI 글자 크기 설정"
        title="글자 크기"
        onClick={() => setOpen(true)}
      >
        가 <small>{scale}%</small>
      </button>
      {open && (
        <PhotoModal
          label="UI 글자 크기 설정"
          className="overlay display-settings-overlay"
          close={() => setOpen(false)}
        >
          <section className="modal">
            <div className="section-title">
              <h2>글자 크기</h2>
              <button type="button" onClick={() => setOpen(false)}>
                닫기
              </button>
            </div>
            <p>
              작게 설정하면 더 많은 정보를 한눈에 볼 수 있습니다. 이 기기에 자동
              저장됩니다.
            </p>
            <label className="font-scale-control">
              글자 크기 <output>{scale}%</output>
              <input
                type="range"
                aria-label="UI 글자 크기"
                min={80}
                max={120}
                step={5}
                value={scale}
                onChange={(e) => setScale(Number(e.target.value))}
              />
            </label>
            <div className="button-row">
              {[
                [85, "작게"],
                [100, "기본"],
                [115, "크게"],
              ].map(([value, label]) => (
                <button
                  type="button"
                  key={value}
                  aria-pressed={scale === value}
                  onClick={() => setScale(Number(value))}
                >
                  {label} {value}%
                </button>
              ))}
            </div>
            <p className="font-scale-preview">
              상담 기록과 시술 정보를 이 크기로 표시합니다.
            </p>
            <small>
              사진 속 주석이나 PDF·JPG 출력 글자 크기는 바뀌지 않습니다.
            </small>
          </section>
        </PhotoModal>
      )}
    </>
  );
}
