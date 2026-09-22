import { expect, it } from "vitest";
import {
  allowed,
  permissions,
  jobRoles,
  permissionLevels,
  normalizeUser,
  permissionLevelOf,
  isAdministrator,
  canUseExecutiveFeatures,
  emptyState,
  type User,
  type Command,
  type PermissionLevel,
} from "../src/core/model";
import { applyCommand } from "../src/core/domain";
const user = (level: PermissionLevel, role: User["role"] = "desk"): User => ({
  id: "employee",
  username: "employee",
  name: "직원",
  role,
  permissionLevel: level,
  active: true,
  permissions: {},
});
const cmd = (
  type: string,
  payload: Record<string, unknown> = {},
  entityId?: string,
  baseRev?: number,
): Command => ({ id: crypto.randomUUID(), type, payload, entityId, baseRev });
it("uses grade defaults independently of all four job roles", () => {
  for (const role of jobRoles)
    for (const level of permissionLevels) {
      const u = user(level, role);
      for (const p of permissions)
        expect(allowed(u, p), `${role}/${level}/${p}`).toBe(
          !(
            {
              admin: [],
              executive: ["stats.read"],
              standard: ["catalog.edit", "stats.read"],
            }[level] as string[]
          ).includes(p),
        );
      expect(isAdministrator(u)).toBe(level === "admin");
      expect(canUseExecutiveFeatures(u)).toBe(level !== "standard");
    }
});
it("honors fine-grained overrides at every grade and blocks all inactive accounts", () => {
  for (const level of permissionLevels) {
    const u = {
      ...user(level),
      permissions: { "catalog.edit": true, "refund.create": false },
    };
    expect(allowed(u, "catalog.edit")).toBe(true);
    expect(allowed(u, "refund.create")).toBe(false);
    const inactive = { ...u, active: false };
    for (const p of permissions) expect(allowed(inactive, p)).toBe(false);
    expect(isAdministrator(inactive)).toBe(false);
    expect(canUseExecutiveFeatures(inactive)).toBe(false);
  }
});
it("preserves old effective rights, including administrator overrides previously ignored, without modifying the original", () => {
  for (const role of ["admin", "doctor", "coordinator"] as const) {
    const old: User = {
      ...user("standard", role),
      permissionLevel: undefined,
      permissions: { "catalog.edit": true, "money.read": false },
    };
    const snapshot = structuredClone(old),
      next = normalizeUser(old);
    expect(next.permissionLevel).toBe(role === "admin" ? "admin" : "standard");
    expect(next.role).toBe(role); // Never guess the job of a legacy administrator.
    expect(next.legacyPermissionDefaults).toBe(true);
    for (const p of permissions) expect(allowed(next, p)).toBe(allowed(old, p));
    expect(old).toEqual(snapshot);
    expect(normalizeUser(next)).toBe(next);
  }
  const legacyDoctor = {
    ...user("standard", "doctor"),
    permissionLevel: undefined,
  };
  expect(
    permissions.filter((p) => allowed(normalizeUser(legacyDoctor), p)),
  ).toHaveLength(4);
});
it("never derives administrative authority from clinical job or legacy role after a grade is assigned", () => {
  expect(isAdministrator(user("standard", "doctor"))).toBe(false);
  expect(isAdministrator(user("standard", "admin"))).toBe(false);
  expect(permissionLevelOf(user("executive", "admin"))).toBe("executive");
  expect(isAdministrator({ ...user("admin"), role: "unknown" as any })).toBe(
    false,
  );
});
async function patients() {
  let s = emptyState();
  for (const id of ["patient-a", "patient-b"])
    s = await applyCommand(
      s,
      user("standard"),
      cmd(
        "patient.create",
        {
          name: id,
          sex: "F",
          dob: "1990-01-01",
          phone: "01012345678",
          address: "테스트",
        },
        id,
      ),
    );
  return s;
}
it("allows executive patient archive/restore/merge and consent management but denies these to standard staff", async () => {
  let s = await patients();
  const executive = user("executive"),
    standard = user("standard");
  await expect(
    applyCommand(
      s,
      standard,
      cmd("patient.archive", { archived: true }, "patient-a", 1),
    ),
  ).rejects.toMatchObject({ status: 403 });
  s = await applyCommand(
    s,
    executive,
    cmd("patient.archive", { archived: true }, "patient-a", 1),
  );
  expect(s.patients[0].archived).toBe(true);
  s = await applyCommand(
    s,
    executive,
    cmd("patient.archive", { archived: false }, "patient-a", 2),
  );
  s = await applyCommand(
    s,
    executive,
    cmd(
      "patient.merge",
      { targetId: "patient-b", targetRev: 1, reason: "중복" },
      "patient-a",
      3,
    ),
  );
  expect(s.patients[0].mergedInto).toBe("patient-b");
  const consent = cmd("consent.save", {
    name: "동의서",
    body: "설명",
    checks: [],
    productIds: [],
    status: "published",
  });
  await expect(applyCommand(s, standard, consent)).rejects.toMatchObject({
    status: 403,
  });
  s = await applyCommand(s, executive, consent);
  expect(s.consents[0].status).toBe("published");
});
it("keeps administrator-only consultation, policy and other-author note actions away from executives", async () => {
  const executive = user("executive"),
    administrator = user("admin", "esthetician");
  let s = await patients();
  s = await applyCommand(
    s,
    user("standard"),
    cmd(
      "consultation.create",
      { patientId: "patient-a", category: "미용" },
      "consult-a",
    ),
  );
  for (const type of [
    "grade.policy",
    "consultation.cancel",
    "consultation.rewrite",
  ])
    await expect(
      applyCommand(s, executive, cmd(type, { reason: "시험" }, "consult-a", 1)),
    ).rejects.toMatchObject({ status: 403 });
  const author = { ...user("standard"), id: "author" };
  s = await applyCommand(
    s,
    author,
    cmd(
      "note.save",
      { patientId: "patient-a", text: "메모", important: false },
      "note-a",
    ),
  );
  const change = cmd(
    "note.save",
    { patientId: "patient-a", text: "변경", important: false },
    "note-a",
    1,
  );
  await expect(applyCommand(s, executive, change)).rejects.toMatchObject({
    status: 403,
  });
  expect((await applyCommand(s, administrator, change)).notes[0].text).toBe(
    "변경",
  );
  expect(
    (
      await applyCommand(
        s,
        administrator,
        cmd("consultation.cancel", { reason: "시험" }, "consult-a", 1),
      )
    ).consultations[0].cancelled,
  ).toBe(true);
});

it("preserves legacy ownership restrictions while retaining explicit cross-owner grants", async () => {
  let s = await patients();
  s = await applyCommand(
    s,
    { ...user("standard"), id: "other-owner" },
    cmd(
      "consultation.create",
      { patientId: "patient-a", category: "미용" },
      "owned-elsewhere",
    ),
  );
  const old: User = {
    ...user("standard", "coordinator"),
    permissionLevel: undefined,
  };
  const next = normalizeUser(old);
  expect(next.permissions["receipt.create"]).toBeUndefined();
  expect(next.permissions["followup.edit"]).toBeUndefined();
  const follow = cmd(
    "followup.save",
    { appointment: "2026-09-25", attendance: "예약" },
    "owned-elsewhere",
    1,
  );
  await expect(applyCommand(s, old, follow)).rejects.toMatchObject({
    status: 403,
  });
  await expect(applyCommand(s, next, follow)).rejects.toMatchObject({
    status: 403,
  });
  const permitted = normalizeUser({
    ...old,
    permissions: { "followup.edit": true, "receipt.create": true },
  });
  expect(permitted.permissions["receipt.create"]).toBe(true);
  expect(
    (await applyCommand(s, permitted, follow)).consultations[0].attendance,
  ).toBe("예약");
});

it("keeps clinical annotation authority tied to doctor job or administrator grade", async () => {
  let s = await patients();
  s = await applyCommand(
    s,
    user("standard"),
    cmd(
      "consultation.create",
      { patientId: "patient-a", category: "미용" },
      "clinical-consult",
    ),
  );
  const annotate = cmd(
    "consultation.annotate",
    { photos: [] },
    "clinical-consult",
    1,
  );
  await expect(
    applyCommand(s, user("executive", "desk"), annotate),
  ).rejects.toMatchObject({ status: 403 });
  await expect(
    applyCommand(s, user("standard", "doctor"), annotate),
  ).resolves.toBeDefined();
  await expect(
    applyCommand(s, user("admin", "esthetician"), annotate),
  ).resolves.toBeDefined();
});
