// One registry drives the help badge, button tooltips, and keyboard dispatch.
export const catalogCommands = {
  help: {
    label: "단축키 안내",
    keys: "?",
    scope: "공통",
    code: "Slash",
    shift: true,
  },
  folderNew: {
    label: "선택 폴더 아래 새 폴더",
    keys: "Alt+N",
    scope: "폴더 목록",
    code: "KeyN",
    alt: true,
  },
  folderMove: {
    label: "지정한 위치로 폴더 이동",
    keys: "Alt+M",
    scope: "폴더 목록",
    code: "KeyM",
    alt: true,
  },
  folderCopy: {
    label: "지정한 위치로 폴더 복사",
    keys: "Alt+C",
    scope: "폴더 목록",
    code: "KeyC",
    alt: true,
  },
  folderLink: {
    label: "지정한 위치에 폴더 링크",
    keys: "Alt+L",
    scope: "폴더 목록",
    code: "KeyL",
    alt: true,
  },
  folderOriginal: {
    label: "링크 원본 폴더로 이동",
    keys: "Alt+G",
    scope: "폴더 목록",
    code: "KeyG",
    alt: true,
  },
  folderRoot: {
    label: "최상위 위치 선택",
    keys: "Alt+Home",
    scope: "폴더 목록",
    code: "Home",
    alt: true,
  },
  folderUp: {
    label: "같은 단계에서 위로 이동",
    keys: "Alt+↑",
    scope: "폴더 목록",
    code: "ArrowUp",
    alt: true,
  },
  folderDown: {
    label: "같은 단계에서 아래로 이동",
    keys: "Alt+↓",
    scope: "폴더 목록",
    code: "ArrowDown",
    alt: true,
  },
  folderOut: {
    label: "상위 단계로 꺼내기 (부모 바로 뒤)",
    keys: "Alt+←",
    scope: "폴더 목록",
    code: "ArrowLeft",
    alt: true,
  },
  folderIn: {
    label: "이전 폴더의 하위로 넣기",
    keys: "Alt+→",
    scope: "폴더 목록",
    code: "ArrowRight",
    alt: true,
  },
  moveProducts: {
    label: "선택 상품을 지정한 폴더로 이동",
    keys: "Alt+P",
    scope: "폴더 목록",
    code: "KeyP",
    alt: true,
  },
  folderCancel: {
    label: "폴더 편집 취소 (확인 후)",
    keys: "Alt+Escape",
    scope: "폴더 목록",
    code: "Escape",
    alt: true,
  },
  collapse: {
    label: "모두 접기",
    keys: "Alt+1",
    scope: "폴더·상품 목록",
    code: "Digit1",
    alt: true,
  },
  expand: {
    label: "모두 펼치기",
    keys: "Alt+2",
    scope: "폴더·상품 목록",
    code: "Digit2",
    alt: true,
  },
  selectAll: {
    label: "현재 상품 목록 전체 선택",
    keys: "Ctrl/Cmd+A",
    scope: "상품 목록",
    code: "KeyA",
    mod: true,
  },
  selectNone: {
    label: "상품 선택 해제",
    keys: "Ctrl/Cmd+Shift+A",
    scope: "상품 목록",
    code: "KeyA",
    mod: true,
    shift: true,
  },
  productCancel: {
    label: "상품 편집 취소 (확인 후)",
    keys: "Alt+Escape",
    scope: "상품 목록",
    code: "Escape",
    alt: true,
  },
  productsDelete: {
    label: "선택 상품 삭제 (확인 후)",
    keys: "Delete",
    scope: "상품 목록",
    code: "Delete",
  },
  productDelete: {
    label: "현재 상품 삭제 (확인 후)",
    keys: "Delete",
    scope: "상품·옵션 편집 창",
    code: "Delete",
  },
  productNew: {
    label: "상품 추가",
    keys: "Alt+N",
    scope: "상품 목록",
    code: "KeyN",
    alt: true,
  },
  price: {
    label: "선택 가격 일괄 조정",
    keys: "Alt+R",
    scope: "상품 목록",
    code: "KeyR",
    alt: true,
  },
  deactivate: {
    label: "선택 상품 비활성화",
    keys: "Alt+D",
    scope: "상품 목록",
    code: "KeyD",
    alt: true,
  },
  pasteRows: {
    label: "엑셀 붙여넣기 후보 행 추가",
    keys: "Alt+V",
    scope: "상품 목록",
    code: "KeyV",
    alt: true,
  },
  publish: {
    label: "검증 후 게시 (기존 확인 절차 유지)",
    keys: "Ctrl/Cmd+Shift+Enter",
    scope: "상품 목록",
    code: "Enter",
    mod: true,
    shift: true,
  },
  optionNew: {
    label: "옵션 추가",
    keys: "Alt+N",
    scope: "상품·옵션 편집 창",
    code: "KeyN",
    alt: true,
  },
  productCopy: {
    label: "상품 복제",
    keys: "Alt+C",
    scope: "상품·옵션 편집 창",
    code: "KeyC",
    alt: true,
  },
  productKeep: {
    label: "편집 내용 유지하고 창 닫기",
    keys: "Alt+Enter",
    scope: "상품·옵션 편집 창",
    code: "Enter",
    alt: true,
  },
} as const;
export type CatalogCommand = keyof typeof catalogCommands;
export const catalogCommand = (id: CatalogCommand) => ({
  "data-catalog-command": id,
  title: `${catalogCommands[id].label} · ${catalogCommands[id].keys}`,
});
export function commandMatches(
  e: Pick<
    KeyboardEvent,
    "code" | "key" | "ctrlKey" | "metaKey" | "altKey" | "shiftKey"
  >,
  id: CatalogCommand,
) {
  const c: { code: string; alt?: boolean; shift?: boolean; mod?: boolean } =
    catalogCommands[id];
  return (
    (e.code === c.code || (id === "help" && e.key === "?")) &&
    !!(e.ctrlKey || e.metaKey) === !!c.mod &&
    e.altKey === !!c.alt &&
    e.shiftKey === !!c.shift
  );
}
export const catalogShortcutBlocked = () =>
  !!document.querySelector(
    "[data-catalog-shortcuts-dialog], [data-catalog-history-dialog], .folder-inline-edit, .folder-decision",
  );
export function dispatchCatalogCommand(e: KeyboardEvent) {
  if (
    e.defaultPrevented ||
    e.isComposing ||
    e.repeat ||
    catalogShortcutBlocked()
  )
    return;
  const target = e.target instanceof HTMLElement ? e.target : null;
  if (
    !target ||
    target.closest(
      'input:not([type="checkbox"]), textarea, select, [contenteditable]:not([contenteditable="false"])',
    )
  )
    return;
  const editor = document.querySelector<HTMLElement>("[data-catalog-editor]");
  if (!editor?.contains(target)) return;
  // A product modal is its own scope; never execute a command behind it.
  const product = editor.querySelector<HTMLElement>(
    "[data-catalog-product-editor]",
  );
  const scope =
    product || target.closest<HTMLElement>("[data-catalog-scope]") || editor;
  for (const id of Object.keys(catalogCommands) as CatalogCommand[]) {
    if (!commandMatches(e, id)) continue;
    const buttons = [
      ...(id === "productCancel" &&
      !product &&
      scope.dataset.catalogScope === "products"
        ? editor
        : id === "help"
          ? product || editor
          : scope
      ).querySelectorAll<HTMLButtonElement>(
        `button[data-catalog-command="${id}"]`,
      ),
    ];
    if (!buttons.length) continue;
    // Consume unavailable commands too, particularly Alt+Left/Right (browser history).
    e.preventDefault();
    const button = buttons.find((b) => {
      if (b.disabled || b.closest("fieldset:disabled")) return false;
      // Price/paste actions may be inside a collapsed bulk editor; reveal it first.
      return !!b.getClientRects().length || !!b.closest("details.bulk-edit");
    });
    if (!button) return;
    const details = button.closest("details.bulk-edit");
    if (details instanceof HTMLDetailsElement) details.open = true;
    // Collapsing can unmount the focused child; keep keyboard focus in this list.
    if (id === "collapse" || id === "expand") button.focus();
    button.click();
    return;
  }
}
