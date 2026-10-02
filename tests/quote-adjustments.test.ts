import { expect, it } from "vitest";
import { applyCommand, calculate, renewalQuote } from "../src/core/domain";
import {
  emptyState,
  emptyQuote,
  type Line,
  type Consultation,
  type User,
} from "../src/core/model";
import { quoteLinePrices } from "../src/core/quotePrices";
import { topQuoteReasons } from "../src/core/quoteReasons";
import { unreadOpinionReply, opinionPhotoLabel } from "../src/core/opinions";
import { visibleChanges } from "../src/core/stateChanges";
import { catalogAdmin, threeCatalogs } from "./fixtures/catalogs";
const zero = { kind: "amount" as const, value: 0 };
const base = { rev: 1, createdAt: "2026-09-29", updatedAt: "2026-09-29" };
const doctor: User = {
  ...catalogAdmin,
  id: "doctor",
  role: "doctor",
  permissionLevel: "standard",
};
function fixture() {
  const s = emptyState();
  s.catalogs = threeCatalogs();
  s.users = [catalogAdmin, doctor];
  s.consultations = [
    {
      ...base,
      id: "consult",
      patientId: "patient",
      patient: {
        name: "검증",
        sex: "F",
        dob: "1990-01-01",
        phone: "01000000000",
        address: "",
      },
      ownerId: catalogAdmin.id,
      category: "미용",
      status: "H",
      cancelled: false,
      catalogVersion: "version-0",
      quote: emptyQuote(),
      memo: "",
      photos: [
        {
          id: "photo1",
          name: "사진1",
          mediaId: "m1",
          selected: true,
          rotation: 0,
          annotations: [],
        },
        {
          id: "photo2",
          name: "사진2",
          mediaId: "m2",
          selected: true,
          rotation: 0,
          annotations: [],
        },
      ],
      appointment: "",
      attendance: "미정",
      documents: [],
    },
  ];
  return s;
}
const line: Line = {
  id: "line",
  productId: "product-0",
  optionId: "option-0",
  name: "시술",
  label: "기본",
  unit: "회",
  quantity: 2,
  price: 100000,
  regularPrice: 120000,
  tax: "exclusive",
  discount: { kind: "percent", value: 25 },
};
it("item and allocated global discounts reconcile with the quote, including VAT", () => {
  const q = calculate(
    [line],
    { kind: "percent", value: 10 },
    "separate",
    "소개",
  );
  expect(quoteLinePrices(q.lines, q.discount)[0]).toMatchObject({
    regular: 240000,
    catalogDiscount: 40000,
    itemDiscount: 50000,
    globalDiscount: 15000,
    discounted: 135000,
    discountTotal: 105000,
  });
  expect(q).toMatchObject({
    subtotal: 240000,
    discountTotal: 105000,
    supply: 135000,
    vatAmount: 13500,
    total: 148500,
  });
});
it("uses custom unit price for the visible amount without treating repricing as a discount", () => {
  const q = calculate(
    [{ ...line, customPrice: 80000 }],
    { kind: "percent", value: 10 },
    "separate",
    "내부 사유",
  );
  expect(quoteLinePrices(q.lines, q.discount)[0]).toMatchObject({
    regular: 160000,
    sale: 160000,
    catalogDiscount: 0,
    itemDiscount: 40000,
    globalDiscount: 12000,
    discounted: 108000,
  });
  expect(q.total).toBe(118800);
  expect(
    calculate(
      [{ ...line, customPrice: 150000, discount: zero }],
      zero,
      "separate",
      "협의",
    ).total,
  ).toBe(330000);
  expect(
    calculate(
      [{ ...line, customPrice: 0, discount: zero }],
      zero,
      "separate",
      "협의",
    ).total,
  ).toBe(0);
  for (const customPrice of [-1, 1.5, Infinity, 1_000_000_001])
    expect(() =>
      calculate([{ ...line, customPrice }], zero, "separate", "협의"),
    ).toThrow();
});
it("allocates every won exactly once across mixed tax treatments", () => {
  const lines = [
    {
      ...line,
      quantity: 1,
      price: 101,
      regularPrice: 101,
      tax: "inclusive" as const,
      discount: zero,
    },
    {
      ...line,
      id: "two",
      quantity: 1,
      price: 101,
      regularPrice: 101,
      tax: "exempt" as const,
      discount: zero,
    },
  ];
  const q = calculate(lines, { kind: "amount", value: 1 }, "separate", "사유");
  expect(
    quoteLinePrices(lines, q.discount).map((p) => p.globalDiscount),
  ).toEqual([1, 0]);
  expect(q.total).toBe(201);
});
it("requires reasons on the server, preserves catalog snapshots, and restores catalog price when unchecked", async () => {
  const payload = {
    lines: [{ ...line, quantity: 1, customPrice: 8000, discount: zero }],
    discount: zero,
    vat: "separate",
    photos: [],
    reason: "",
  };
  const command = (payload: any, rev = 1) => ({
    id: crypto.randomUUID(),
    type: "consultation.save",
    entityId: "consult",
    baseRev: rev,
    payload,
  });
  await expect(
    applyCommand(fixture(), catalogAdmin, command(payload)),
  ).rejects.toThrow("임의 가격");
  let s = await applyCommand(
    fixture(),
    catalogAdmin,
    command({ ...payload, reason: "  소개   할인 " }),
  );
  expect(s.consultations[0].quote.lines[0]).toMatchObject({
    price: 10000,
    customPrice: 8000,
  });
  expect(s.consultations[0].quote.total).toBe(8800);
  s = await applyCommand(
    s,
    catalogAdmin,
    command(
      {
        ...payload,
        lines: [{ ...payload.lines[0], customPrice: undefined }],
        reason: "재방문",
      },
      2,
    ),
  );
  expect(s.consultations[0].quote.total).toBe(11000);
  expect(s.consultations[0].quote.lines[0].customPrice).toBeUndefined();
  expect(topQuoteReasons(s.consultations).map((r) => r.reason)).toEqual(
    expect.arrayContaining(["소개 할인", "재방문"]),
  );
  const renewed = renewalQuote(
    {
      ...s.consultations[0],
      quote: {
        ...s.consultations[0].quote,
        lines: [{ ...s.consultations[0].quote.lines[0], customPrice: 1 }],
      },
    },
    s.catalogs,
    "renew",
  );
  expect(renewed.lines[0].customPrice).toBeUndefined();
  expect(renewed.total).toBe(11000);
});
it("ranks shared history by consultation frequency, limits ten, and masks it without money permission", () => {
  const c = fixture().consultations[0];
  const consultations = Array.from({ length: 15 }, (_, i) => ({
    ...c,
    id: "c" + i,
    quote: { ...c.quote, reason: "사유" + i },
    priceReasonHistory: ["공통", "공통", i < 7 ? "자주" : "공통"],
  }));
  const top = topQuoteReasons(consultations);
  expect(top).toHaveLength(10);
  expect(top.slice(0, 2)).toEqual([
    { reason: "공통", count: 15 },
    { reason: "자주", count: 7 },
  ]);
  const changes = visibleChanges(
    [{ section: "consultations", id: c.id, value: consultations[0] }],
    { ...doctor, permissions: { "money.read": false } },
  );
  expect((changes[0].value as Consultation).priceReasonHistory).toEqual([]);
});
it("lets a doctor write without a request, notify the owner, and keep photo numbers linked after reordering", async () => {
  const cmd = {
    id: crypto.randomUUID(),
    type: "opinion.direct",
    payload: {
      consultationId: "consult",
      consultationRev: 1,
      answer: "의사 직접 의견",
      answerPhotoComments: [{ photoId: "photo2", text: "이 부위 확인" }],
    },
  };
  const s = await applyCommand(fixture(), doctor, cmd);
  const o = s.opinions[0];
  expect(o).toMatchObject({
    direct: true,
    fromId: catalogAdmin.id,
    toId: doctor.id,
    request: "",
    answerRevision: 1,
  });
  expect(unreadOpinionReply(o, catalogAdmin.id, s.consultations)).toBe(true);
  expect(
    opinionPhotoLabel(
      [...s.consultations[0].photos].reverse(),
      o.answerPhotoComments![0].photoId,
    ),
  ).toBe("1번 사진");
  await expect(applyCommand(fixture(), catalogAdmin, cmd)).rejects.toThrow(
    "의사 계정",
  );
  await expect(
    applyCommand(fixture(), doctor, {
      ...cmd,
      payload: { ...cmd.payload, consultationRev: 2 },
    }),
  ).rejects.toThrow("상담이 변경");
  await expect(
    applyCommand(fixture(), doctor, {
      ...cmd,
      payload: { ...cmd.payload, answer: "", answerPhotoComments: [] },
    }),
  ).rejects.toThrow("의견");
  await expect(
    applyCommand(fixture(), doctor, {
      ...cmd,
      payload: {
        ...cmd.payload,
        answerPhotoComments: [{ photoId: "missing", text: "확인" }],
      },
    }),
  ).rejects.toThrow("없는 사진");
  const cancelled = fixture();
  cancelled.consultations[0].cancelled = true;
  await expect(applyCommand(cancelled, doctor, cmd)).rejects.toThrow(
    "취소된 상담",
  );
});

it("allows direct medical opinions on finalized consultations without changing the quotation", async () => {
  for (const status of ["P", "F"] as const) {
    const state = fixture();
    state.consultations[0].status = status;
    const after = await applyCommand(state, doctor, {
      id: crypto.randomUUID(),
      type: "opinion.direct",
      payload: {
        consultationId: "consult",
        consultationRev: 1,
        answer: "경과 의견",
      },
    });
    expect(after.consultations).toEqual(state.consultations);
    expect(after.opinions[0].answer).toBe("경과 의견");
  }
});

it("consultation-priced options require an explicit amount and reason, derived on the server", async () => {
  const s = fixture();
  Object.assign(s.catalogs[0].products[0].options[0], {
    price: null,
    priceKind: "quote",
  });
  const payload = {
    lines: [
      { ...line, quantity: 1, discount: zero, requiresCustomPrice: false },
    ],
    discount: zero,
    vat: "separate",
    photos: [],
    reason: "진료 후 결정",
  };
  const command = (p: any, rev = 1) => ({
    id: crypto.randomUUID(),
    type: "consultation.save",
    entityId: "consult",
    baseRev: rev,
    payload: p,
  });
  await expect(applyCommand(s, catalogAdmin, command(payload))).rejects.toThrow(
    "상담 가격을 입력하세요",
  );
  const priced = {
    ...payload,
    lines: [{ ...payload.lines[0], customPrice: 70000 }],
  };
  await expect(
    applyCommand(s, catalogAdmin, command({ ...priced, reason: "" })),
  ).rejects.toThrow("임의 가격");
  const saved = await applyCommand(s, catalogAdmin, command(priced));
  expect(saved.consultations[0].quote).toMatchObject({
    subtotal: 70000,
    total: 77000,
    discountTotal: 0,
  });
  expect(saved.consultations[0].quote.lines[0]).toMatchObject({
    requiresCustomPrice: true,
    price: 0,
    customPrice: 70000,
  });
  await expect(
    applyCommand(saved, catalogAdmin, command(payload, 2)),
  ).rejects.toThrow("상담 가격을 입력하세요");
  const renewed = renewalQuote(saved.consultations[0], s.catalogs, "renewal");
  expect(renewed.lines[0].renewalNotice).toContain("이전 상담");
  expect(renewed.lines[0].price).toBe(
    saved.consultations[0].quote.lines[0].customPrice,
  );
});

it("snapshots only the selected membership tier benefits and preserves them after catalog edits", async () => {
  const s = fixture();
  const p = s.catalogs[0].products[0];
  p.offering = {
    kind: "membership",
    items: [],
    terms: "공통 조건",
    creditAmount: 500000,
  };
  p.options[0].offering = {
    kind: "membership",
    items: [{ name: "GOLD 관리", quantity: 3, unit: "회" }],
    terms: "GOLD 조건",
    creditAmount: 1000000,
    bonusAmount: 100000,
    validityDays: 365,
  };
  p.options.push({
    ...p.options[0],
    id: "option-platinum",
    label: "PLATINUM",
    offering: {
      kind: "membership",
      items: [],
      terms: "PLATINUM 전용",
      creditAmount: 2000000,
    },
  });
  const payload = {
    lines: [{ ...line, quantity: 1, discount: zero }],
    discount: zero,
    vat: "separate",
    photos: [],
    reason: "",
  };
  const cmd = (rev = 1) => ({
    id: crypto.randomUUID(),
    type: "consultation.save",
    entityId: "consult",
    baseRev: rev,
    payload,
  });
  const saved = await applyCommand(s, catalogAdmin, cmd());
  const composition = saved.consultations[0].quote.lines[0].composition!;
  expect(composition).toContain("GOLD 관리 3회");
  expect(composition).toContain("기본 이용금액 1,000,000원");
  expect(composition).not.toContain("PLATINUM");
  expect(composition).not.toContain("500,000");
  saved.catalogs[0] = structuredClone(saved.catalogs[0]);
  saved.catalogs[0].products[0].options = [
    saved.catalogs[0].products[0].options[1],
  ];
  const resaved = await applyCommand(saved, catalogAdmin, cmd(2));
  expect(resaved.consultations[0].quote.lines[0].composition).toBe(composition);
});
