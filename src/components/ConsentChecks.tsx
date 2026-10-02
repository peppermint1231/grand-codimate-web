import { useEffect, useRef } from "react";

export function ConsentChecks({
  items,
  selected,
  onChange,
  disabled = false,
}: {
  items: string[];
  selected: string[];
  onChange: (value: string[]) => void;
  disabled?: boolean;
}) {
  const allRef = useRef<HTMLInputElement>(null);
  const unique = [...new Set(items)];
  const count = unique.filter((item) => selected.includes(item)).length;
  const all = unique.length > 0 && count === unique.length;
  useEffect(() => {
    if (allRef.current) allRef.current.indeterminate = count > 0 && !all;
  }, [count, all]);
  return (
    <fieldset className="consent-checks" disabled={disabled}>
      <legend>필수 확인 항목</legend>
      <label className="check consent-checks-all">
        <input
          ref={allRef}
          type="checkbox"
          checked={all}
          disabled={!unique.length}
          onChange={(e) => onChange(e.target.checked ? unique : [])}
        />
        <strong>모두 동의</strong>
        <span className="small">
          {count}/{unique.length} 확인
        </span>
      </label>
      {unique.map((item) => (
        <label className="check" key={item}>
          <input
            type="checkbox"
            checked={selected.includes(item)}
            onChange={(e) =>
              onChange(
                e.target.checked
                  ? [...new Set([...selected, item])]
                  : selected.filter((value) => value !== item),
              )
            }
          />
          {item}
        </label>
      ))}
    </fieldset>
  );
}
