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
export function coordinatorColor(id: string, completed = false) {
  let hash = 2166136261;
  for (const ch of id) hash = Math.imul(hash ^ ch.charCodeAt(0), 16777619);
  hash = Math.imul(hash ^ (hash >>> 16), 0x85ebca6b);
  hash = Math.imul(hash ^ (hash >>> 13), 0xc2b2ae35);
  hash = (hash ^ (hash >>> 16)) >>> 0;
  return `hsl(${hash % 360} 55% ${completed ? 27 : 40}%)`;
}
