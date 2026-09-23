import { useEffect, useRef, useState } from "react";
import type { Catalog } from "../core/model";

// Each editing session owns its stack; saved versions belong to CatalogHistory.
export function useCatalogUndo(
  scope: string,
  current: Catalog | undefined,
  enabled: boolean,
  restore: (c: Catalog) => void,
) {
  const stack = useRef<{
    scope: string;
    past: Catalog[];
    future: Catalog[];
    field: Element | null;
    at: number;
  }>({ scope, past: [], future: [], field: null, at: 0 });
  const [, refresh] = useState(0);
  if (stack.current.scope !== scope)
    stack.current = { scope, past: [], future: [], field: null, at: 0 };
  const reset = () => {
    stack.current = { scope, past: [], future: [], field: null, at: 0 };
    refresh((n) => n + 1);
  };
  const record = (next: Catalog) => {
    if (
      !enabled ||
      !current ||
      current.id !== next.id ||
      JSON.stringify(current) === JSON.stringify(next)
    )
      return;
    const s = stack.current,
      active = document.activeElement;
    const field =
      active instanceof HTMLTextAreaElement ||
      (active instanceof HTMLInputElement &&
        ["text", "number"].includes(active.type))
        ? active
        : null;
    const now = Date.now();
    if (!field || s.field !== field || now - s.at > 1000 || s.future.length)
      s.past = [...s.past.slice(-39), current];
    s.future = [];
    s.field = field;
    s.at = now;
  };
  const step = (redo: boolean) => {
    if (!enabled || !current) return;
    const s = stack.current,
      from = redo ? s.future : s.past,
      next = from.at(-1);
    if (!next) return;
    if (redo) {
      s.future = from.slice(0, -1);
      s.past = [...s.past, current];
    } else {
      s.past = from.slice(0, -1);
      s.future = [...s.future, current];
    }
    s.field = null;
    restore(next);
    refresh((n) => n + 1);
  };
  useEffect(() => {
    const endGroup = () => {
      stack.current.field = null;
    };
    const key = (e: KeyboardEvent) => {
      if (
        !enabled ||
        e.defaultPrevented ||
        e.isComposing ||
        e.altKey ||
        !(e.ctrlKey || e.metaKey)
      )
        return;
      const target = e.target instanceof HTMLElement ? e.target : null;
      if (
        document.querySelector(
          "[data-catalog-shortcuts-dialog], [data-catalog-history-dialog], [data-catalog-delete-dialog], .folder-inline-edit, .folder-decision",
        ) ||
        target?.closest(".folder-inline-edit")
      )
        return;
      // Search and uncommitted paste/name inputs keep their native text undo.
      if (
        target?.matches('input, textarea, select, [contenteditable="true"]') &&
        !target.closest(
          "[data-catalog-product-editor], .catalog-option-visible, .bulk-edit table",
        )
      )
        return;
      const k = e.code.startsWith("Key")
        ? e.code.slice(3).toLowerCase()
        : e.key.toLowerCase();
      if (k !== "z" && k !== "y") return;
      e.preventDefault();
      step(k === "y" || e.shiftKey);
    };
    document.addEventListener("keydown", key);
    document.addEventListener("focusout", endGroup);
    return () => {
      document.removeEventListener("keydown", key);
      document.removeEventListener("focusout", endGroup);
    };
  });
  return {
    record,
    reset,
    undo: () => step(false),
    redo: () => step(true),
    canUndo: enabled && !!stack.current.past.length,
    canRedo: enabled && !!stack.current.future.length,
  };
}
