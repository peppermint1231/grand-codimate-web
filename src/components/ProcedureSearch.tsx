import { memo, useEffect, useRef, useState } from "react";
/** Keep keystrokes/IME local: rendering photos, quotes and product cards must not block input. */
export const ProcedureSearch = memo(function ProcedureSearch({
  value,
  onSearch,
}: {
  value: string;
  onSearch: (value: string) => void;
}) {
  const [text, setText] = useState(value),
    [composing, setComposing] = useState(false);
  const published = useRef(value);
  useEffect(() => {
    if (value !== published.current) {
      published.current = value;
      setText(value);
    }
  }, [value]);
  useEffect(() => {
    if (composing || text === value) return;
    const timer = setTimeout(() => {
      published.current = text;
      onSearch(text);
    }, 160);
    return () => clearTimeout(timer);
  }, [text, composing, value, onSearch]);
  return (
    <input
      aria-label="시술 검색"
      placeholder="시술 검색"
      value={text}
      onChange={(e) => setText(e.target.value)}
      onCompositionStart={() => setComposing(true)}
      onCompositionEnd={(e) => {
        setText(e.currentTarget.value);
        setComposing(false);
      }}
    />
  );
});
