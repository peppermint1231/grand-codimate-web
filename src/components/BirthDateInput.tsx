import { useId, useRef } from "react";
import { CalendarDays } from "lucide-react";
import { formatBirthDate } from "../core/phone";
import "./BirthDateInput.css";
export function BirthDateInput({
  value,
  onChange,
}: {
  value: string;
  onChange: (value: string) => void;
}) {
  const id = useId(),
    input = useRef<HTMLInputElement>(null),
    calendar = useRef<HTMLInputElement>(null);
  const latest = new Date().toISOString().slice(0, 10);
  const update = (next: string) => {
    const formatted = formatBirthDate(next);
    if (input.current)
      input.current.setCustomValidity(
        formatted.length === 10 &&
          (Number.isNaN(Date.parse(formatted)) ||
            new Date(formatted).toISOString().slice(0, 10) !== formatted ||
            formatted > latest)
          ? "실제 생년월일을 확인해주세요."
          : "",
      );
    onChange(formatted);
  };
  return (
    <div className="field birth-date-field">
      <label htmlFor={id}>생년월일</label>
      <div className="birth-date-controls">
        <input
          ref={input}
          id={id}
          type="text"
          inputMode="numeric"
          autoComplete="bday"
          required
          pattern="[0-9]{4}-[0-9]{2}-[0-9]{2}"
          maxLength={10}
          placeholder="1992-12-12"
          value={value}
          onChange={(e) => update(e.target.value)}
          aria-describedby={id + "-hint"}
          aria-keyshortcuts="Alt+ArrowDown"
          onKeyDown={(e) => {
            if (e.altKey && e.key === "ArrowDown") {
              e.preventDefault();
              try {
                calendar.current?.showPicker?.();
              } catch {
                calendar.current?.focus();
              }
            }
          }}
        />
        <span className="birth-date-calendar">
          <CalendarDays size={20} aria-hidden="true" />
          <input
            type="date"
            ref={calendar}
            tabIndex={-1}
            aria-label="생년월일 달력으로 선택"
            title="달력으로 선택"
            value={/^\d{4}-\d{2}-\d{2}$/.test(value) ? value : ""}
            max={latest}
            onChange={(e) => update(e.target.value)}
            onClick={(e) => {
              try {
                e.currentTarget.showPicker?.();
              } catch {
                /* The native date input still works when showPicker is unavailable. */
              }
            }}
          />
        </span>
      </div>
      <small id={id + "-hint"}>
        숫자 8자리로 입력하거나 달력에서 선택하세요. Tab: 다음 입력 · Alt+↓:
        달력
      </small>
    </div>
  );
}
