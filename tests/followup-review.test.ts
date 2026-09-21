import { expect, it } from "vitest";
import { applyCommand, calculate } from "../src/core/domain";
import {
  emptyState,
  emptyQuote,
  packageActive,
  type User,
  type State,
  type Consultation,
} from "../src/core/model";
const owner: User = {
  id: "followup-owner",
  username: "owner",
  name: "검증직원",
  role: "coordinator",
  active: true,
  permissions: {},
};
const admin: User = { ...owner, id: "followup-admin", role: "admin" };
const send = (
  s: State,
  type: string,
  payload: Record<string, unknown>,
  entityId: string,
  baseRev?: number,
  actor = owner,
) =>
  applyCommand(s, actor, {
    id: crypto.randomUUID(),
    type,
    payload,
    entityId,
    baseRev,
  });
async function fixture() {
  let s = emptyState();
  s.users = [owner, admin];
  s = await send(
    s,
    "patient.create",
    {
      name: "연장검증",
      sex: "F",
      dob: "1990-01-01",
      phone: "01000000000",
      address: "검증동",
    },
    "patient",
  );
  const base = {
    id: "catalog",
    rev: 1,
    createdAt: "2026-09-21",
    updatedAt: "2026-09-21",
  };
  s.catalogs = [
    {
      ...base,
      version: "current",
      schemaVersion: 1,
      status: "published",
      publishedAt: "2026-09-21",
      references: [],
      products: [
        {
          ...base,
          id: "product",
          category: "미용",
          careCategory: "미용",
          name: "최신 시술",
          description: "새 설명",
          composition: "새 구성",
          active: true,
          sources: [],
          options: [
            {
              id: "option",
              label: "새 옵션",
              price: 20000,
              tax: "inclusive",
              unit: "회",
              review: false,
              issues: [],
              sources: [],
              priceKind: "regular",
            },
          ],
        },
      ],
    },
  ];
  s = await send(
    s,
    "consultation.create",
    { patientId: "patient", category: "미용" },
    "source",
  );
  const c = s.consultations[0];
  c.quote = calculate(
    [
      {
        id: "line",
        productId: "product",
        optionId: "option",
        name: "예전 시술",
        label: "예전 옵션",
        unit: "패키지",
        quantity: 2,
        price: 10000,
        tax: "inclusive",
        discount: { kind: "percent", value: 10 },
      },
    ],
    { kind: "amount", value: 1000 },
    "included",
    "과거 할인",
  );
  c.photoColumns = 4;
  c.photos = [
    {
      id: "photo",
      name: "original.png",
      mediaId: "media",
      rotation: 15,
      selected: true,
      annotations: [
        {
          id: "mark",
          tool: "pen",
          authorId: owner.id,
          points: [{ x: 0.1, y: 0.2 }],
          width: 3,
          color: "#ff0000",
        },
      ],
    },
  ];
  return send(s, "consultation.finalize", { status: "P" }, "source", c.rev);
}
const create = (
  s: State,
  id = "renewal",
  kind: Consultation["kind"] = "renewal",
  extra = {},
) =>
  send(
    s,
    "consultation.create",
    {
      patientId: "patient",
      category: "미용",
      kind,
      sourceConsultationId: "source",
      ...extra,
    },
    id,
  );
it("renewal refreshes every selling field and unit, preserves quantity and removes discounts", async () => {
  const s = await create(await fixture()),
    c = s.consultations[1];
  expect(c.quote.lines[0]).toMatchObject({
    name: "최신 시술",
    label: "새 옵션",
    unit: "회",
    quantity: 2,
    price: 20000,
    description: "새 설명",
    composition: "새 구성",
    discount: { kind: "amount", value: 0 },
  });
  expect(c.quote).toMatchObject({ total: 40000, discountTotal: 0, reason: "" });
});
it("follow-up photos retain layout and independent annotation snapshots", async () => {
  const s = await create(await fixture(), "interim", "interim");
  expect(s.consultations[1].photoColumns).toBe(4);
  expect(s.consultations[1].photos[0]).toMatchObject({
    selected: false,
    rotation: 15,
    sourceConsultationId: "source",
    sourcePhotoId: "photo",
  });
  s.consultations[1].photos[0].annotations[0].points[0].x = 0.8;
  expect(s.consultations[0].photos[0].annotations[0].points[0].x).toBe(0.1);
});
it.each(["renewal", "interim"] as const)(
  "%s cannot use an interim record as its package source",
  async (kind) => {
    const s = await fixture();
    s.consultations[0].kind = "interim";
    s.consultations[0].quote = emptyQuote();
    await expect(create(s, "followup", kind)).rejects.toThrow();
  },
);
it("creation checks the revision of the source shown in the selection dialog", async () => {
  await expect(
    create(await fixture(), "renewal", "renewal", { sourceRev: 1 }),
  ).rejects.toThrow("변경");
});
it.each(["P", "F"] as const)(
  "renewal %s cannot finalize against a cancelled source",
  async (status) => {
    let s = await create(await fixture());
    s = await send(
      s,
      "consultation.cancel",
      { reason: "취소" },
      "source",
      s.consultations[0].rev,
      admin,
    );
    await expect(
      send(s, "consultation.finalize", { status }, "renewal", 1),
    ).rejects.toThrow();
    expect(s.consultations[1].status).toBe("H");
  },
);
it("two open renewals cannot silently overwrite each other's source state", async () => {
  let s = await create(await fixture(), "first");
  s = await create(s, "second");
  s = await send(s, "consultation.finalize", { status: "P" }, "first", 1);
  await expect(
    send(s, "consultation.finalize", { status: "F" }, "second", 1),
  ).rejects.toThrow("변경");
  expect(packageActive(s.consultations[1])).toBe(true);
  // A user can review the new state and explicitly submit its current revision.
  const next = await send(
    s,
    "consultation.finalize",
    { status: "F", sourceRev: s.consultations[0].rev },
    "second",
    1,
  );
  expect(packageActive(next.consultations[1])).toBe(true);
});
it("a stale explicit source revision is rejected without completing either package", async () => {
  let s = await create(await fixture());
  s = await send(s, "consultation.package", { complete: true }, "source", 2);
  await expect(
    send(
      s,
      "consultation.finalize",
      { status: "P", sourceRev: 2 },
      "renewal",
      1,
    ),
  ).rejects.toThrow("변경");
  expect(s.consultations[1].status).toBe("H");
});
it("interim saves and completion preserve source photos, quote and active state", async () => {
  let s = await create(await fixture(), "interim", "interim");
  const source = structuredClone(s.consultations[0]);
  const photo = structuredClone(s.consultations[1].photos[0]);
  photo.selected = true;
  photo.rotation = 45;
  photo.annotations[0].color = "#00ff00";
  s = await send(
    s,
    "consultation.save",
    { ...emptyQuote(), photos: [photo], memo: "중간 경과", photoColumns: 4 },
    "interim",
    1,
  );
  s = await send(s, "consultation.finalize", { status: "P" }, "interim", 2);
  expect(s.consultations[0]).toEqual(source);
  expect(packageActive(s.consultations[0])).toBe(true);
  expect(packageActive(s.consultations[1])).toBe(false);
});
it("manual package changes respect permission and revision and preserve another category", async () => {
  const s = await fixture();
  s.consultations.push({
    ...structuredClone(s.consultations[0]),
    id: "insurance",
    category: "보험",
  });
  const changed = await send(
    s,
    "consultation.package",
    { complete: true },
    "source",
    2,
  );
  expect(packageActive(changed.consultations[0])).toBe(false);
  expect(packageActive(changed.consultations[1])).toBe(true);
  await expect(
    send(changed, "consultation.package", { complete: false }, "source", 2),
  ).rejects.toThrow("다른 기기");
  await expect(
    send(s, "consultation.package", { complete: true }, "source", 2, {
      ...owner,
      permissions: { "followup.edit": false },
    }),
  ).rejects.toThrow("권한");
});
