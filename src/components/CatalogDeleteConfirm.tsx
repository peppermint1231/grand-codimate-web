import { useEffect, useRef, type ReactNode } from "react";
import { useAppBack } from "../lib/navigation";

export function CatalogDeleteConfirm({
  title,
  children,
  confirmLabel = "삭제 확인",
  onConfirm,
  onCancel,
}: {
  title: string;
  children: ReactNode;
  confirmLabel?: string;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const confirm = useRef<HTMLButtonElement>(null);
  useAppBack(true, onCancel, 100);
  useEffect(() => {
    const previous = document.activeElement;
    confirm.current?.focus();
    return () => {
      if (previous instanceof HTMLElement && previous.isConnected)
        previous.focus();
    };
  }, []);
  return (
    <div
      className="overlay catalog-delete-overlay"
      data-catalog-delete-dialog
      onClick={onCancel}
    >
      <section
        className="modal"
        role="alertdialog"
        aria-modal="true"
        aria-label={title}
        onClick={(e) => e.stopPropagation()}
        onKeyDownCapture={(e) => {
          e.stopPropagation();
          if (e.key === "Escape") {
            e.preventDefault();
            onCancel();
          }
          if (e.key === "Enter" && (e.repeat || e.nativeEvent.isComposing))
            e.preventDefault();
          if (e.key === "Tab") {
            const buttons = [
              ...e.currentTarget.querySelectorAll<HTMLButtonElement>("button"),
            ];
            const i = buttons.indexOf(
              document.activeElement as HTMLButtonElement,
            );
            e.preventDefault();
            buttons[
              (i + (e.shiftKey ? buttons.length - 1 : 1)) % buttons.length
            ]?.focus();
          }
        }}
      >
        <h2>{title}</h2>
        {children}
        <p className="small">
          Enter: 삭제 확인 · Esc: 취소 · 저장 전에는 되돌릴 수 있습니다.
        </p>
        <div className="button-row">
          <button type="button" onClick={onCancel}>
            취소
          </button>
          <button
            type="button"
            ref={confirm}
            className="primary"
            onClick={onConfirm}
          >
            {confirmLabel}
          </button>
        </div>
      </section>
    </div>
  );
}
