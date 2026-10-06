import { validDay } from "./appointments";

export type CalendarView = "month" | "week" | "day";
const date = (day: string) => {
  if (!validDay(day)) throw new Error("캘린더 날짜를 확인하세요");
  return new Date(day + "T12:00:00Z");
};
const key = (d: Date) => d.toISOString().slice(0, 10);
export function shiftCalendar(
  day: string,
  view: CalendarView,
  direction: number,
) {
  const d = date(day);
  if (view === "month") {
    const original = d.getUTCDate();
    d.setUTCDate(1);
    d.setUTCMonth(d.getUTCMonth() + direction);
    const last = new Date(
      Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0),
    ).getUTCDate();
    d.setUTCDate(Math.min(original, last));
  } else d.setUTCDate(d.getUTCDate() + direction * (view === "week" ? 7 : 1));
  return key(d);
}
export function calendarDays(day: string, view: CalendarView): string[] {
  const d = date(day);
  if (view === "day") return [day];
  if (view === "week") {
    d.setUTCDate(d.getUTCDate() - d.getUTCDay());
    return Array.from({ length: 7 }, (_, i) => shiftCalendar(key(d), "day", i));
  }
  d.setUTCDate(1);
  const offset = d.getUTCDay();
  const count = new Date(
    Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0),
  ).getUTCDate();
  return [
    ...Array.from({ length: offset }, () => ""),
    ...Array.from({ length: count }, (_, i) => shiftCalendar(key(d), "day", i)),
  ];
}
export function calendarSwipe(dx: number, dy: number): -1 | 0 | 1 {
  return Math.abs(dx) >= 65 && Math.abs(dx) > Math.abs(dy) * 1.5
    ? dx < 0
      ? 1
      : -1
    : 0;
}
