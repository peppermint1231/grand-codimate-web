import * as holidayYears from "@hyunbinseo/holidays-kr/all";
import type { Patient } from "./model";
export const seoulToday = (now = Date.now()) =>
  new Date(now + 9 * 3600000).toISOString().slice(0, 10);
export function validDay(day: string) {
  return (
    /^\d{4}-\d{2}-\d{2}$/.test(day) &&
    Number.isFinite(Date.parse(day)) &&
    new Date(day).toISOString().slice(0, 10) === day
  );
}
export function closureReason(day: string, closedDates: string[] = []) {
  if (!validDay(day)) return "날짜를 확인해주세요";
  if (closedDates.includes(day)) return "병원 휴진일";
  const preset = (
    holidayYears as Record<string, Readonly<Record<string, readonly string[]>>>
  )["y" + day.slice(0, 4)];
  if (!preset) return "공휴일 달력 업데이트가 필요합니다";
  if (preset[day]) return preset[day].join(" · ");
  if (new Date(day + "T12:00:00Z").getUTCDay() === 0) return "일요일 휴진";
  return "";
}
export function consultationTimes(
  day: string,
  now = Date.now(),
  closedDates: string[] = [],
) {
  if (!validDay(day) || closureReason(day, closedDates)) return [];
  const dow = new Date(day + "T12:00:00Z").getUTCDay();
  if (dow === 0) return [];
  const slots: string[] = [];
  for (
    let minute = (dow === 6 ? 9 : 10) * 60;
    minute <= (dow === 6 ? 14 : 19) * 60;
    minute += 30
  ) {
    if (dow !== 6 && minute >= 13 * 60 && minute < 14 * 60) continue;
    const time =
      String(Math.floor(minute / 60)).padStart(2, "0") +
      ":" +
      String(minute % 60).padStart(2, "0");
    if (Date.parse(`${day}T${time}:00+09:00`) > now) slots.push(time);
  }
  return slots;
}
export function validRequestedSlot(
  day: string,
  time: string,
  now = Date.now(),
  closedDates: string[] = [],
) {
  return (
    day >= seoulToday(now) &&
    day <= seoulToday(now + 90 * 86400000) &&
    consultationTimes(day, now, closedDates).includes(time)
  );
}
export function patientCandidates(
  patients: Patient[],
  person: { name: string; phone: string },
) {
  const name = person.name.replace(/\s/g, ""),
    phone = person.phone.replace(/\D/g, "");
  return patients
    .filter((p) => !p.archived && !p.mergedInto)
    .map((p) => ({
      patient: p,
      score:
        (phone && p.phone.replace(/\D/g, "") === phone ? 2 : 0) +
        (name && p.name.replace(/\s/g, "") === name ? 1 : 0),
    }))
    .filter((x) => x.score > 0)
    .sort(
      (a, b) =>
        b.score - a.score || a.patient.name.localeCompare(b.patient.name, "ko"),
    )
    .slice(0, 8);
}
// Deliberately alternate distant hues; hashing hue alone clusters staff colors.
const coordinatorPalette = [
  "#2563eb",
  "#c2410c",
  "#7c3aed",
  "#047857",
  "#be185d",
  "#0e7490",
  "#a16207",
  "#4338ca",
  "#b91c1c",
  "#4d7c0f",
  "#a21caf",
  "#7c4a2d",
  "#0369a1",
  "#9f1239",
  "#115e59",
  "#6b21a8",
];
export function coordinatorColor(
  id: string,
  completed = false,
  roster: readonly string[] = [],
) {
  // Include inactive accounts so toggling activity cannot shift existing colors.
  // Sorting IDs makes the legend and events consistent across devices/list order.
  const ids = [...new Set([...roster, id])].sort();
  let hash = 2166136261;
  for (const ch of id) hash = Math.imul(hash ^ ch.charCodeAt(0), 16777619);
  const index = roster.length ? ids.indexOf(id) : hash >>> 0;
  const color = coordinatorPalette[index % coordinatorPalette.length];
  if (!completed) return color;
  return (
    "#" +
    [1, 3, 5]
      .map((i) =>
        Math.round(parseInt(color.slice(i, i + 2), 16) * 0.65)
          .toString(16)
          .padStart(2, "0"),
      )
      .join("")
  );
}
