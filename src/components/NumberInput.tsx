import { useRef, useState, type InputHTMLAttributes } from "react";

/** Keep an editable string while focused: a parent's Number("") must not reinsert 0. */
export function NumberInput({
  value,
  onChange,
  onFocus,
  onBlur,
  onPointerDown,
  onPointerUp,
  onPointerCancel,
  onKeyDown,
  onValueCommit,
  ...props
}: InputHTMLAttributes<HTMLInputElement> & {
  /** Structural edits (e.g. package session counts) apply only after editing finishes. */
  onValueCommit?: (value: string) => void;
}) {
  const [draft, setDraft] = useState<string | null>(null);
  const selectOnRelease = useRef(false);
  return (
    <input
      {...props}
      type="number"
      value={draft ?? value}
      onFocus={(event) => {
        if (!props.readOnly) {
          setDraft(event.currentTarget.value);
          event.currentTarget.select();
        }
        onFocus?.(event);
      }}
      onPointerDown={(event) => {
        selectOnRelease.current =
          document.activeElement !== event.currentTarget;
        onPointerDown?.(event);
      }}
      onPointerUp={(event) => {
        if (selectOnRelease.current && !props.readOnly)
          event.currentTarget.select();
        selectOnRelease.current = false;
        onPointerUp?.(event);
      }}
      onPointerCancel={(event) => {
        selectOnRelease.current = false;
        onPointerCancel?.(event);
      }}
      onChange={(event) => {
        setDraft(event.target.value);
        onChange?.(event);
      }}
      onKeyDown={(event) => {
        onKeyDown?.(event);
        if (!event.defaultPrevented && event.key === "Enter" && onValueCommit)
          event.currentTarget.blur();
      }}
      onBlur={(event) => {
        // Keep native validation; callers decide what an empty optional value means.
        if (draft !== null && draft !== "")
          onValueCommit?.(event.currentTarget.value);
        setDraft(null);
        selectOnRelease.current = false;
        onBlur?.(event);
      }}
    />
  );
}
