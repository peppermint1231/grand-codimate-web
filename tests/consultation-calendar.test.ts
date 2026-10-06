import { expect, it } from "vitest";
import {
  calendarDays,
  calendarSwipe,
  shiftCalendar,
} from "../src/core/consultationCalendar";

it("shows Sunday-start weeks across month/year boundaries and a single selected day", () => {
  expect(calendarDays("2027-01-01", "week")).toEqual([
    "2026-12-27",
    "2026-12-28",
    "2026-12-29",
    "2026-12-30",
    "2026-12-31",
    "2027-01-01",
    "2027-01-02",
  ]);
  expect(calendarDays("2026-10-06", "day")).toEqual(["2026-10-06"]);
  const leap = calendarDays("2028-02-01", "month");
  expect(leap.filter(Boolean)).toHaveLength(29);
  expect(leap.at(-1)).toBe("2028-02-29");
});
it("moves by the active view without overflowing a shorter month", () => {
  expect(shiftCalendar("2027-01-31", "month", 1)).toBe("2027-02-28");
  expect(shiftCalendar("2026-12-30", "week", 1)).toBe("2027-01-06");
  expect(shiftCalendar("2027-01-01", "day", -1)).toBe("2026-12-31");
  expect(() => calendarDays("2026-02-30", "week")).toThrow();
});
it("separates intentional horizontal swipes from taps, vertical scrolling and diagonal dragging", () => {
  expect(calendarSwipe(-100, 15)).toBe(1);
  expect(calendarSwipe(100, 15)).toBe(-1);
  expect(calendarSwipe(12, 3)).toBe(0);
  expect(calendarSwipe(10, 130)).toBe(0);
  expect(calendarSwipe(80, 70)).toBe(0);
});
