import { useState } from "react";
import {
  closureReason,
  consultationTimes,
  seoulToday,
} from "../core/appointments";
export function BookingPicker({
  date,
  time,
  closedDates,
  onChange,
}: {
  date: string;
  time: string;
  closedDates: string[];
  onChange: (date: string, time: string) => void;
}) {
  const today = seoulToday(),
    last = seoulToday(Date.now() + 90 * 86400000);
  const [month, setMonth] = useState((date || today).slice(0, 7));
  const first = new Date(month + "-01T12:00:00Z"),
    offset = first.getUTCDay(),
    days = new Date(
      Date.UTC(first.getUTCFullYear(), first.getUTCMonth() + 1, 0),
    ).getUTCDate();
  const shift = (n: number) =>
    setMonth(
      new Date(Date.UTC(first.getUTCFullYear(), first.getUTCMonth() + n, 1))
        .toISOString()
        .slice(0, 7),
    );
  const times = consultationTimes(date, Date.now(), closedDates);
  return (
    <section className="pd-booking" aria-label="상담 희망 일정">
      <h3>
        1. 상담 희망일을 골라주세요 <small>필수</small>
      </h3>
      <div className="pd-calendar-heading">
        <button
          type="button"
          aria-label="이전 달"
          disabled={month <= today.slice(0, 7)}
          onClick={() => shift(-1)}
        >
          ‹
        </button>
        <strong>{month.replace("-", "년 ")}월</strong>
        <button
          type="button"
          aria-label="다음 달"
          disabled={month >= last.slice(0, 7)}
          onClick={() => shift(1)}
        >
          ›
        </button>
      </div>
      <div className="pd-calendar-grid">
        {["일", "월", "화", "수", "목", "금", "토"].map((d) => (
          <small key={d}>{d}</small>
        ))}
        {Array.from({ length: offset }, (_, i) => (
          <span key={"blank" + i} />
        ))}
        {Array.from({ length: days }, (_, i) => {
          const day = month + "-" + String(i + 1).padStart(2, "0");
          const reason = closureReason(day, closedDates);
          const disabled =
            day < today ||
            day > last ||
            !consultationTimes(day, Date.now(), closedDates).length;
          return (
            <button
              type="button"
              key={day}
              disabled={disabled}
              title={reason}
              aria-label={day + (reason ? " " + reason : "")}
              aria-pressed={date === day}
              onClick={() => onChange(day, "")}
            >
              {i + 1}
              {day === today && <small>오늘</small>}
              {reason && <small>휴진</small>}
            </button>
          );
        })}
      </div>
      <h3>
        2. 희망 시간을 골라주세요 <small>필수</small>
      </h3>
      {!date ? (
        <p>날짜를 선택하면 가능한 시간이 나옵니다.</p>
      ) : (
        <>
          <p role="status">
            {date.replaceAll("-", ".")} {time || "시간을 선택해주세요"}
          </p>
          <div className="pd-time-grid">
            {times.map((t) => (
              <button
                type="button"
                aria-pressed={time === t}
                key={t}
                onClick={() => onChange(date, t)}
              >
                {t}
              </button>
            ))}
          </div>
          {!times.length && (
            <p>선택 가능한 시간이 없어요. 다른 날짜를 골라주세요.</p>
          )}
        </>
      )}
    </section>
  );
}
