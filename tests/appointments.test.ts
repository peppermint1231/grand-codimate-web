import { expect, it } from "vitest";
import {
  consultationTimes,
  validRequestedSlot,
  patientCandidates,
  seoulToday,
  coordinatorColor,
} from "../src/core/appointments";
import { inquiryInput } from "../src/core/discovery";
import { stylusErasing } from "../src/core/stylus";
import type { Patient } from "../src/core/model";
const now = Date.parse("2026-10-06T00:00:00+09:00");
it("offers Seoul business hours through one hour before closing, excluding lunch and Sunday", () => {
  expect(consultationTimes("2026-10-07", now).at(-1)).toBe("19:00");
  expect(consultationTimes("2026-10-07", now)).not.toContain("13:30");
  expect(consultationTimes("2026-10-10", now)).toContain("13:30");
  expect(consultationTimes("2026-10-10", now).at(-1)).toBe("14:00");
  expect(consultationTimes("2026-10-11", now)).toEqual([]);
  expect(validRequestedSlot("2026-10-07", "19:30", now)).toBe(false);
  expect(validRequestedSlot("2026-10-07", "19:00", now)).toBe(true);
  expect(validRequestedSlot("2027-10-07", "19:00", now)).toBe(false);
  expect(consultationTimes("2026-02-30", now)).toEqual([]);
  expect(
    consultationTimes("2026-10-06", Date.parse("2026-10-06T19:01:00+09:00")),
  ).toEqual([]);
  expect(seoulToday(Date.parse("2026-10-05T16:00:00Z"))).toBe("2026-10-06");
});
it("ranks returning candidates by phone and name without silently linking or including deleted patients", () => {
  const people = [
    { id: "name", name: "홍길동", phone: "01099999999" },
    { id: "both", name: "홍 길동", phone: "010-1234-5678" },
    { id: "phone", name: "다른이름", phone: "01012345678" },
    { id: "deleted", name: "홍길동", phone: "01012345678", archived: true },
  ] as Patient[];
  expect(
    patientCandidates(people, { name: "홍길동", phone: "01012345678" }).map(
      (x) => x.patient.id,
    ),
  ).toEqual(["both", "phone", "name"]);
  expect(patientCandidates(people, { name: "", phone: "" })).toEqual([]);
  const roster = Array.from({ length: 16 }, (_, i) => "staff-" + i);
  const colors = roster.map((id) => coordinatorColor(id, false, roster));
  expect(new Set(colors).size).toBe(roster.length);
  expect(coordinatorColor("staff-2", false, roster)).toBe(
    coordinatorColor("staff-2", false, [...roster].reverse()),
  );
  expect(coordinatorColor("staff-2", true, roster)).not.toBe(
    coordinatorColor("staff-2", false, roster),
  );
});
it("recognizes only stylus barrel/eraser buttons, not mouse right-click or ordinary pen pressure", () => {
  expect(stylusErasing({ pointerType: "pen", buttons: 3, button: 2 })).toBe(
    true,
  );
  expect(stylusErasing({ pointerType: "pen", buttons: 32, button: 5 })).toBe(
    true,
  );
  expect(stylusErasing({ pointerType: "pen", buttons: 1, button: 0 })).toBe(
    false,
  );
  expect(stylusErasing({ pointerType: "pen", buttons: 0, button: 2 })).toBe(
    false,
  );
  expect(stylusErasing({ pointerType: "mouse", buttons: 2, button: 2 })).toBe(
    false,
  );
});
it("blocks Korean public and substitute holidays as well as clinic closures", () => {
  expect(consultationTimes("2026-10-09", now)).toEqual([]);
  expect(consultationTimes("2026-10-05", Date.parse("2026-10-01"))).toEqual([]);
  expect(consultationTimes("2027-02-09", Date.parse("2027-02-01"))).toEqual([]);
  expect(consultationTimes("2026-10-07", now, ["2026-10-07"])).toEqual([]);
  expect(consultationTimes("2028-01-03", Date.parse("2028-01-01"))).toEqual([]); // no unchecked year fallback
});
