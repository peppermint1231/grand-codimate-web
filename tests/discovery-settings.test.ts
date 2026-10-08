import { it, expect } from "vitest";
import { threeCatalogs } from "./fixtures/catalogs";
import { emptyState, type User } from "../src/core/model";
import { publicProducts } from "../src/core/discovery";
import { discoverySettings } from "../src/core/discoverySettings";
import { applyCommand } from "../src/core/domain";
import { patientConcerns, patientMatches } from "../src/core/patientDiscovery";
import { intakeFields } from "../src/core/intake";
it("applies per-book product types and price policy on the server including event metadata", () => {
  const s = emptyState();
  s.catalogs = threeCatalogs();
  for (const c of s.catalogs)
    for (const p of c.products) {
      p.publicVisible = true;
      p.active = true;
    }
  const settings = discoverySettings(s);
  settings.미용.showPrices = true;
  settings.이벤트.showPrices = false;
  settings.보험.types = [];
  s.policies = [
    {
      id: "policy",
      rev: 1,
      createdAt: "",
      updatedAt: "",
      grades: [],
      discovery: settings,
    },
  ];
  const products = publicProducts(s);
  expect(
    products.some(
      (p) => p.book === "미용" && p.options.some((o) => o.price !== null),
    ),
  ).toBe(true);
  expect(products.some((p) => p.book === "보험")).toBe(false);
  for (const p of products.filter((p) => p.book === "이벤트")) {
    expect(p.priceVisible).toBe(false);
    expect(p.event).toBeUndefined();
    expect(
      p.options.every(
        (o) => o.price === null && o.tax === "unknown" && !o.event,
      ),
    ).toBe(true);
  }
});
it("saves settings with catalog permission and revision conflict protection", async () => {
  const s = emptyState(),
    settings = discoverySettings(s);
  const admin: User = {
    id: "a",
    name: "a",
    username: "a",
    role: "admin",
    active: true,
    permissions: {},
  };
  const c = {
    id: "settings",
    type: "discovery.settings",
    payload: { settings },
  };
  const saved = await applyCommand(s, admin, c);
  expect(saved.policies[0].discovery).toEqual(settings);
  await expect(
    applyCommand(saved, admin, { ...c, id: "new-settings", baseRev: 0 }),
  ).rejects.toThrow("설정이 변경");
  await expect(
    applyCommand(
      s,
      {
        ...admin,
        role: "coordinator",
        permissionLevel: "standard",
        permissions: { "catalog.edit": false },
      },
      c,
    ),
  ).rejects.toThrow("권한");
});
it("offers nail fungus only among medical concerns and preserves explicit questionnaire purpose without guessing", () => {
  expect(
    patientConcerns
      .find((c) => c.id === "patient:medical")
      ?.questions.map((q) => q.id),
  ).toEqual(["nail-health"]);
  for (const name of ["두드러기 피부염 수액", "대상포진 수액", "양성종양 제거"])
    expect(
      patientMatches({ name, description: "", options: [] } as any, []).some(
        (m) => m.concernId === "patient:medical",
      ),
    ).toBe(false);
  expect(
    intakeFields({ consultType: "피부질환 진료와 미용시술 상담 희망" })
      .intakeKind,
  ).toBe("beauty");
  expect(intakeFields({ consultType: "피부질환 진료만 희망" }).intakeKind).toBe(
    "medical",
  );
  expect(intakeFields({}).intakeKind).toBeUndefined();
});
