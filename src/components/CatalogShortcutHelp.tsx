import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useAppBack } from "../lib/navigation";
import { catalogCommand, catalogCommands } from "../lib/catalogShortcuts";
const manual = [
  { scope: "공통", label: "저장", keys: "Ctrl/Cmd+S" },
  { scope: "공통", label: "되돌리기", keys: "Ctrl/Cmd+Z" },
  { scope: "공통", label: "다시 실행", keys: "Ctrl/Cmd+Shift+Z / Ctrl+Y" },
  { scope: "폴더 목록", label: "이름·색상 편집", keys: "F2" },
  { scope: "폴더 목록", label: "복사 / 잘라내기", keys: "Ctrl/Cmd+C / X" },
  {
    scope: "폴더 목록",
    label: "선택 위치에 붙여넣기 / 링크 붙여넣기",
    keys: "Ctrl/Cmd+V / Ctrl/Cmd+Alt+V",
  },
  { scope: "폴더 목록", label: "삭제 확인 창", keys: "Delete" },
  {
    scope: "폴더 목록",
    label: "이름 적용 / 이름·확인 창 취소",
    keys: "Enter / Escape",
  },
];
export function CatalogShortcutHelp() {
  const [open, setOpen] = useState(false);
  const trigger = useRef<HTMLButtonElement>(null),
    dialog = useRef<HTMLElement>(null);
  useAppBack(open, () => setOpen(false), 100);
  useEffect(() => {
    if (!open) return;
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    dialog.current?.querySelector("button")?.focus();
    const key = (e: KeyboardEvent) => {
      // Modal isolation also blocks App save/undo and folder handlers underneath.
      if (e.key === "Escape") {
        e.preventDefault();
        setOpen(false);
      }
      if (e.key === "Tab") {
        e.preventDefault();
        dialog.current?.querySelector("button")?.focus();
      }
      e.stopPropagation();
    };
    document.addEventListener("keydown", key, true);
    return () => {
      document.body.style.overflow = overflow;
      document.removeEventListener("keydown", key, true);
      trigger.current?.focus();
    };
  }, [open]);
  return (
    <>
      <button
        {...catalogCommand("help")}
        ref={trigger}
        type="button"
        className="catalog-help-badge"
        aria-label="단축키 안내"
        aria-haspopup="dialog"
        aria-expanded={open}
        onClick={() => setOpen(true)}
      >
        ?
      </button>
      {open &&
        createPortal(
          <div
            className="overlay catalog-help-overlay"
            onClick={() => setOpen(false)}
          >
            <section
              ref={dialog}
              className="modal catalog-shortcuts-dialog"
              data-catalog-shortcuts-dialog
              role="dialog"
              aria-modal="true"
              aria-label="단가표 편집 단축키"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="section-title">
                <h2>단가표 편집 단축키</h2>
                <button onClick={() => setOpen(false)}>닫기</button>
              </div>
              <p>
                작업할 폴더나 상품 목록을 먼저 클릭하세요. Mac에서는 Ctrl 대신
                Cmd, Alt 대신 Option을 사용합니다.
              </p>
              <p className="small">
                입력칸에서는 글자 편집이 우선입니다. Tab으로 입력칸을 벗어나면
                편집 명령을 사용할 수 있습니다. 저장·되돌리기는 입력 중에도
                사용할 수 있으며, 폴더 이름은 Enter로 적용한 뒤 저장하세요.
              </p>
              {[
                "공통",
                "폴더 목록",
                "폴더·상품 목록",
                "상품 목록",
                "상품·옵션 편집 창",
              ].map((scope) => (
                <section key={scope} className="catalog-shortcut-group">
                  <h3>{scope}</h3>
                  <dl>
                    {[...manual, ...Object.values(catalogCommands)]
                      .filter((c) => c.scope === scope)
                      .map((c) => (
                        <div key={c.label}>
                          <dt>{c.label}</dt>
                          <dd>
                            <kbd>{c.keys}</kbd>
                          </dd>
                        </div>
                      ))}
                  </dl>
                </section>
              ))}
              <p className="small">
                폴더 이동·복사·링크 및 선택 상품 이동은 ‘이동·복사·링크할
                위치’를 먼저 지정하세요. Alt+←/→는 폴더 자체의 단계를
                변경합니다. 링크 아래 표시된 하위 폴더는 Alt+G로 원본에 이동해
                정리하세요. 삭제·충돌 확인은 생략되지 않으며, 폴더 저장 전까지
                게시 단가표는 바뀌지 않습니다.
              </p>
            </section>
          </div>,
          document.body,
        )}
    </>
  );
}
