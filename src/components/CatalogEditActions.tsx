import { Undo2, Redo2 } from "lucide-react";
export function CatalogEditActions({
  actions,
}: {
  actions: {
    undo: () => void;
    redo: () => void;
    canUndo: boolean;
    canRedo: boolean;
  };
}) {
  return (
    <div
      className="catalog-edit-actions"
      role="group"
      aria-label="편집 되돌리기"
    >
      <button
        type="button"
        disabled={!actions.canUndo}
        onClick={actions.undo}
        title="되돌리기 · Ctrl/Cmd+Z"
      >
        <Undo2 size={16} />
        되돌리기
      </button>
      <button
        type="button"
        disabled={!actions.canRedo}
        onClick={actions.redo}
        title="다시 실행 · Ctrl/Cmd+Shift+Z 또는 Ctrl+Y"
      >
        <Redo2 size={16} />
        다시 실행
      </button>
      <small>Ctrl/Cmd+Z · Ctrl/Cmd+Shift+Z / Ctrl+Y</small>
    </div>
  );
}
