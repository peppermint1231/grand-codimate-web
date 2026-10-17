import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { X, History } from "lucide-react";
import releases from "../data/releaseHistory.json";
import { version } from "../../package.json";
import { useAppBack } from "../lib/navigation";
import "./ReleaseHistory.css";

/** Bundled release notes remain readable offline and never fetch patient data. */
export function ReleaseHistory() {
  const [open, setOpen] = useState(false);
  const dialog = useRef<HTMLDialogElement>(null);
  useAppBack(open, () => setOpen(false), 90);
  useEffect(() => {
    if (open) dialog.current?.showModal();
    else dialog.current?.close();
  }, [open]);
  return (
    <>
      <button
        className="release-history-trigger"
        aria-label="업데이트 내역 보기"
        title="업데이트 내역"
        aria-haspopup="dialog"
        aria-expanded={open}
        onClick={() => setOpen(true)}
      >
        <span>
          <History size={16} aria-hidden="true" />
        </span>
      </button>
      {createPortal(
        <dialog
          ref={dialog}
          className="release-history-dialog"
          aria-labelledby="release-history-title"
          onCancel={() => setOpen(false)}
          onClose={() => setOpen(false)}
          onClick={(event) => {
            if (event.target !== event.currentTarget) return;
            const bounds = event.currentTarget.getBoundingClientRect();
            if (
              event.clientX < bounds.left ||
              event.clientX > bounds.right ||
              event.clientY < bounds.top ||
              event.clientY > bounds.bottom
            )
              setOpen(false);
          }}
        >
          <header className="release-history-heading">
            <div>
              <h2 id="release-history-title">업데이트 내역</h2>
              <p>현재 화면 버전 {version}</p>
            </div>
            <button
              autoFocus
              aria-label="업데이트 내역 닫기"
              onClick={() => setOpen(false)}
            >
              <X size={20} />
            </button>
          </header>
          <div className="release-history-list">
            {releases.map((release) => (
              <article
                key={release.version}
                className={release.version === version ? "current" : ""}
              >
                <div className="release-history-meta">
                  <strong>v{release.version}</strong>
                  {release.version === version && <span>현재 버전</span>}
                  <time dateTime={release.date}>
                    {release.date.replaceAll("-", ".")}
                  </time>
                </div>
                <ul>
                  {release.changes.map((change, i) => (
                    <li key={i}>{change}</li>
                  ))}
                </ul>
              </article>
            ))}
          </div>
        </dialog>,
        document.body,
      )}
    </>
  );
}
