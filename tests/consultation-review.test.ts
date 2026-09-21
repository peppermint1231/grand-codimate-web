import { expect, it } from "vitest";
import { applyCommand, calculate } from "../src/core/domain";
import {
  emptyState,
  type User,
  type Line,
  type Catalog,
  type Command,
} from "../src/core/model";
const admin: User = {
  id: "review-admin",
  name: "관리자",
  username: "review-admin",
  role: "admin",
  active: true,
  permissions: {},
};
const owner: User = { ...admin, id: "review-owner", role: "coordinator" };
const other: User = { ...owner, id: "review-other" };
const cmd = (
  type: string,
  payload: Record<string, unknown>,
  entityId?: string,
  baseRev?: number,
): Command => ({ id: crypto.randomUUID(), type, payload, entityId, baseRev });
const line = (
  id: string,
  tax: Line["tax"],
  price: number,
  patch: Partial<Line> = {},
): Line => ({
  id,
  productId: "product-" + id,
  optionId: "option-" + id,
  name: id,
  label: "기본",
  unit: "회",
  quantity: 1,
  price,
  tax,
  discount: { kind: "amount", value: 0 },
  ...patch,
});
async function fixture() {
  let s = emptyState();
  s.users = [admin, owner, other];
  s = await applyCommand(
    s,
    owner,
    cmd(
      "patient.create",
      {
        name: "견적검증",
        sex: "F",
        dob: "1990-01-01",
        phone: "01000000000",
        address: "시험동",
      },
      "review-patient",
    ),
  );
  const catalog: Catalog = {
    id: "review-catalog",
    rev: 1,
    createdAt: "2026-09-21",
    updatedAt: "2026-09-21",
    schemaVersion: 1,
    version: "review-v1",
    status: "published",
    publishedAt: "2026-09-21",
    references: [],
    products: [
      {
        id: "product-a",
        rev: 1,
        createdAt: "2026-09-21",
        updatedAt: "2026-09-21",
        name: "검증 시술",
        category: "검증",
        careCategory: "미용",
        description: "설명",
        composition: "구성",
        active: true,
        sources: [],
        options: [
          {
            id: "option-a",
            label: "기본",
            price: 10000,
            tax: "exclusive",
            unit: "회",
            priceKind: "regular",
            review: false,
            issues: [],
            sources: [],
          },
        ],
      },
    ],
  };
  s.catalogs = [catalog];
  return applyCommand(
    s,
    owner,
    cmd(
      "consultation.create",
      { patientId: "review-patient", category: "미용" },
      "review-consult",
    ),
  );
}
const payload = {
  lines: [line("a", "exclusive", 1)],
  discount: { kind: "amount", value: 0 },
  vat: "separate",
  photos: [],
  reason: "",
};
it("mixed tax lines apply item discounts before proportionally distributing a global discount", () => {
  const q = calculate(
    [
      line("a", "exclusive", 10000, {
        quantity: 2,
        discount: { kind: "percent", value: 10 },
      }),
      line("b", "inclusive", 11000, {
        discount: { kind: "amount", value: 1000 },
      }),
      line("c", "exempt", 5000),
    ],
    { kind: "percent", value: 10 },
    "separate",
    "검증",
  );
  expect(q).toMatchObject({
    subtotal: 36000,
    discountTotal: 6300,
    supply: 28882,
    vatAmount: 2438,
    total: 31320,
  });
  expect(q.supply + q.vatAmount).toBe(q.total);
});
it("fractional quantities and one-won allocations retain whole-won totals", () => {
  expect(
    calculate(
      [line("a", "inclusive", 101, { quantity: 0.5 })],
      { kind: "amount", value: 0 },
      "included",
    ).total,
  ).toBe(51);
  const q = calculate(
    [
      line("a", "exclusive", 1),
      line("b", "inclusive", 1),
      line("c", "exempt", 1),
    ],
    { kind: "amount", value: 1 },
    "separate",
  );
  expect(q).toMatchObject({
    subtotal: 3,
    discountTotal: 1,
    supply: 2,
    vatAmount: 0,
    total: 2,
  });
});
it("server prices ignore client prices and preserve saved catalog snapshots", async () => {
  const initial = await fixture();
  let s = await applyCommand(
    initial,
    owner,
    cmd("consultation.save", payload, "review-consult", 1),
  );
  expect(s.consultations[0].quote).toMatchObject({
    total: 11000,
    lines: [{ price: 10000, description: "설명", composition: "구성" }],
  });
  s.catalogs = [
    ...s.catalogs,
    {
      ...s.catalogs[0],
      id: "next",
      version: "review-v2",
      publishedAt: "2026-09-22",
      products: s.catalogs[0].products.map((p) => ({
        ...p,
        options: p.options.map((o) => ({ ...o, price: 20000 })),
      })),
    },
  ];
  s = await applyCommand(
    s,
    owner,
    cmd(
      "consultation.save",
      { ...payload, lines: [{ ...payload.lines[0], quantity: 2 }] },
      "review-consult",
      2,
    ),
  );
  expect(s.consultations[0].quote.total).toBe(22000);
  expect(s.consultations[0].catalogVersion).toBe("review-v1");
});
it("rejects duplicate cart line IDs rather than charging duplicated hidden entries", async () => {
  await expect(
    applyCommand(
      await fixture(),
      owner,
      cmd(
        "consultation.save",
        { ...payload, lines: [payload.lines[0], payload.lines[0]] },
        "review-consult",
        1,
      ),
    ),
  ).rejects.toThrow("중복");
});
it("rejects a mismatched product identity on an existing line", async () => {
  const s = await applyCommand(
    await fixture(),
    owner,
    cmd("consultation.save", payload, "review-consult", 1),
  );
  await expect(
    applyCommand(
      s,
      owner,
      cmd(
        "consultation.save",
        {
          ...payload,
          lines: [{ ...payload.lines[0], productId: "other-product" }],
        },
        "review-consult",
        2,
      ),
    ),
  ).rejects.toThrow();
});
it("rejects nonexistent catalog versions even for an empty cart", async () => {
  await expect(
    applyCommand(
      await fixture(),
      owner,
      cmd(
        "consultation.save",
        { ...payload, lines: [], catalogVersion: "missing" },
        "review-consult",
        1,
      ),
    ),
  ).rejects.toThrow();
});
it("requires a discount reason and blocks stale or foreign saves", async () => {
  const s = await fixture();
  await expect(
    applyCommand(
      s,
      owner,
      cmd(
        "consultation.save",
        { ...payload, discount: { kind: "percent", value: 10 } },
        "review-consult",
        1,
      ),
    ),
  ).rejects.toThrow("사유");
  await expect(
    applyCommand(
      s,
      other,
      cmd("consultation.save", payload, "review-consult", 1),
    ),
  ).rejects.toThrow("권한");
  await expect(
    applyCommand(
      s,
      owner,
      cmd("consultation.save", payload, "review-consult", 0),
    ),
  ).rejects.toThrow("다른 기기");
});
it.each(["P", "F"] as const)(
  "owner can finalize %s once and cannot edit the finalized quote",
  async (status) => {
    let s = await applyCommand(
      await fixture(),
      owner,
      cmd("consultation.save", payload, "review-consult", 1),
    );
    s = await applyCommand(
      s,
      owner,
      cmd("consultation.finalize", { status }, "review-consult", 2),
    );
    expect(s.consultations[0].status).toBe(status);
    await expect(
      applyCommand(
        s,
        owner,
        cmd(
          "consultation.save",
          { ...payload, reason: "수정" },
          "review-consult",
          3,
        ),
      ),
    ).rejects.toThrow("권한");
    await expect(
      applyCommand(
        s,
        admin,
        cmd("consultation.finalize", { status }, "review-consult", 3),
      ),
    ).rejects.toThrow("이미 확정");
  },
);
