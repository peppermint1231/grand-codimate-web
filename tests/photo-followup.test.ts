import { it, expect } from "vitest";
import { applyCommand, calculate } from "../src/core/domain";
import {
  emptyState,
  emptyQuote,
  packageActive,
  productCategory,
  type User,
  type State,
  type Photo,
} from "../src/core/model";
import { rotatedSize, annotationHit } from "../src/core/photoGeometry";
import { patientFolder, photoFileName } from "../src/core/storagePaths";
import { jpegCaptureDate } from "../src/core/photoDate";
const user: User = {
  id: "staff",
  username: "staff",
  name: "직원",
  role: "coordinator",
  active: true,
  permissions: {},
};
const admin: User = { ...user, id: "admin", role: "admin" };
const command = (
  type: string,
  payload: Record<string, unknown>,
  entityId?: string,
  baseRev?: number,
) => ({ id: crypto.randomUUID(), type, payload, entityId, baseRev });
const send = (
  s: State,
  type: string,
  p: Record<string, unknown>,
  id = "consult",
  rev?: number,
  actor = user,
) => applyCommand(s, actor, command(type, p, id, rev));
async function fixture() {
  let s = await send(
    emptyState(),
    "patient.create",
    {
      name: "테스트환자",
      sex: "M",
      dob: "1980-01-01",
      phone: "01000000000",
      address: "테스트동",
    },
    "patient",
  );
  s = await send(s, "consultation.create", {
    patientId: "patient",
    category: "미용",
  });
  const base = {
    id: "product",
    rev: 1,
    createdAt: "2026-01-01",
    updatedAt: "2026-01-01",
  };
  s.catalogs.push({
    ...base,
    id: "catalog",
    schemaVersion: 1,
    version: "current",
    status: "published",
    publishedAt: "2026-09-19",
    references: [],
    products: [
      {
        ...base,
        name: "기존 패키지",
        category: "미용",
        description: "",
        composition: "",
        active: true,
        sources: [],
        options: [
          {
            id: "option",
            label: "5회",
            price: 200000,
            tax: "inclusive",
            review: false,
            issues: [],
            sources: [],
            priceKind: "clinic",
            unit: "패키지",
          },
        ],
      },
    ],
  });
  s.consultations[0].quote = calculate(
    [
      {
        id: "line",
        productId: "product",
        optionId: "option",
        name: "기존 패키지",
        label: "5회",
        unit: "패키지",
        quantity: 1,
        price: 100000,
        tax: "inclusive",
        discount: { kind: "amount", value: 0 },
      },
    ],
    { kind: "amount", value: 10000 },
    "included",
    "과거 할인",
  );
  s.consultations[0].photos = [
    {
      id: "photo",
      name: "before.jpg",
      mediaId: "media",
      selected: true,
      rotation: 0,
      annotations: [
        {
          id: "mark",
          tool: "pen",
          points: [
            { x: 0.1, y: 0.1 },
            { x: 0.3, y: 0.3 },
          ],
          color: "#ff0000",
          width: 3,
          authorId: "doctor",
        },
      ],
    },
  ];
  return s;
}
it("success needs no PDF and starts package; renewal uses current prices, retains annotation provenance, and closes old package", async () => {
  let s = await fixture();
  s = await send(s, "consultation.finalize", { status: "P" }, "consult", 1);
  expect(s.consultations[0].documents).toEqual([]);
  expect(packageActive(s.consultations[0])).toBe(true);
  s = await send(
    s,
    "consultation.create",
    {
      patientId: "patient",
      category: "미용",
      kind: "renewal",
      sourceConsultationId: "consult",
    },
    "renewal",
  );
  const renewal = s.consultations[1];
  expect(renewal.quote.total).toBe(200000);
  expect(renewal.quote.discountTotal).toBe(0);
  expect(renewal.photos[0]).toMatchObject({
    sourceConsultationId: "consult",
    sourcePhotoId: "photo",
    selected: false,
    annotations: s.consultations[0].photos[0].annotations,
  });
  s = await send(s, "consultation.finalize", { status: "P" }, "renewal", 1);
  expect(packageActive(s.consultations[0])).toBe(false);
  expect(packageActive(s.consultations[1])).toBe(true);
});
it("declined renewal completes source; manual status override remains available", async () => {
  let s = await fixture();
  s = await send(s, "consultation.finalize", { status: "P" }, "consult", 1);
  s = await send(
    s,
    "consultation.create",
    {
      patientId: "patient",
      category: "미용",
      kind: "renewal",
      sourceConsultationId: "consult",
    },
    "renewal",
  );
  s = await send(s, "consultation.finalize", { status: "F" }, "renewal", 1);
  expect(packageActive(s.consultations[0])).toBe(false);
  s = await send(
    s,
    "consultation.package",
    { complete: false },
    "consult",
    s.consultations[0].rev,
  );
  expect(packageActive(s.consultations[0])).toBe(true);
});
it("interim consultation can complete without quotation and does not close source package", async () => {
  let s = await fixture();
  s = await send(s, "consultation.finalize", { status: "P" }, "consult", 1);
  s = await send(
    s,
    "consultation.create",
    {
      patientId: "patient",
      category: "미용",
      kind: "interim",
      sourceConsultationId: "consult",
    },
    "interim",
  );
  expect(s.consultations[1].quote.total).toBe(0);
  s = await send(s, "consultation.finalize", { status: "P" }, "interim", 1);
  expect(packageActive(s.consultations[0])).toBe(true);
  expect(packageActive(s.consultations[1])).toBe(false);
});
it("follow-up refuses different patient/category and unavailable renewal product", async () => {
  const s = await fixture();
  s.consultations[0].status = "P";
  await expect(
    send(
      s,
      "consultation.create",
      {
        patientId: "patient",
        category: "보험",
        kind: "renewal",
        sourceConsultationId: "consult",
      },
      "bad",
    ),
  ).rejects.toThrow("같은 환자");
  s.catalogs[0].products[0].active = false;
  await expect(
    send(
      s,
      "consultation.create",
      {
        patientId: "patient",
        category: "미용",
        kind: "renewal",
        sourceConsultationId: "consult",
      },
      "bad",
    ),
  ).rejects.toThrow("현재 판매");
});
it("photo selection, ordering, free rotation and styles round-trip; foreign annotations cannot be changed", async () => {
  let s = await fixture();
  s.consultations[0].quote = emptyQuote();
  const photo = s.consultations[0].photos[0];
  const own: Photo = {
    ...photo,
    id: "other",
    rotation: -47.5,
    selected: false,
    annotations: [
      {
        id: "own",
        tool: "mosaic",
        authorId: user.id,
        points: [
          { x: 0.2, y: 0.2 },
          { x: 0.4, y: 0.4 },
        ],
        color: "#000000",
        width: 9,
        opacity: 0.8,
        dashed: true,
        font: "serif",
      },
    ],
  };
  s = await send(
    s,
    "consultation.save",
    {
      ...emptyQuote(),
      photos: [own, photo],
      photoColumns: 4,
      memo: "경과 확인",
    },
    "consult",
    1,
  );
  expect(s.consultations[0].photos.map((x) => x.id)).toEqual([
    "other",
    "photo",
  ]);
  expect(s.consultations[0].photoColumns).toBe(4);
  expect(s.consultations[0].photos[0].annotations[0]).toMatchObject({
    opacity: 0.8,
    dashed: true,
    font: "serif",
    tool: "mosaic",
  });
  await expect(
    send(
      s,
      "consultation.save",
      { ...emptyQuote(), photos: [own, { ...photo, annotations: [] }] },
      "consult",
      2,
    ),
  ).rejects.toThrow("다른 작성자");
});
it("imported physician annotations remain uneditable for coordinator but can be preserved", async () => {
  let s = await fixture();
  s = await send(
    s,
    "consultation.create",
    { patientId: "patient", category: "미용" },
    "second",
  );
  const imported = {
    ...s.consultations[0].photos[0],
    id: "copy",
    sourceConsultationId: "consult",
    sourcePhotoId: "photo",
  };
  s = await send(
    s,
    "consultation.save",
    { ...emptyQuote(), photos: [imported] },
    "second",
    1,
  );
  expect(s.consultations[0].photos[0].id).toBe("photo");
  expect(s.consultations[1].photos[0].annotations[0].authorId).toBe("doctor");
  await expect(
    send(
      s,
      "consultation.save",
      {
        ...emptyQuote(),
        photos: [
          {
            ...imported,
            annotations: [{ ...imported.annotations[0], color: "#00ff00" }],
          },
        ],
      },
      "second",
      2,
    ),
  ).rejects.toThrow("다른 작성자");
});
it("patient folders are distinct by category and stable after patient rename; photo names use Seoul capture seconds", async () => {
  let s = await fixture();
  const folder = patientFolder(s.patients[0], "미용");
  expect(folder).toBe("상담/미용/000001M테스트환자");
  expect(patientFolder(s.patients[0], "보험")).toBe(
    "상담/보험/000001M테스트환자",
  );
  expect(
    photoFileName(s.patients[0], "2026-09-19T05:22:56Z", "image/jpeg"),
  ).toBe("260919_1422_56_M_테스트환자.jpg");
  s = await send(
    s,
    "patient.update",
    { ...s.patients[0], name: "이름변경" },
    "patient",
    1,
    admin,
  );
  expect(patientFolder(s.patients[0], "미용")).toBe(folder);
});
it("rotated bounds contain arbitrary rotations and eraser tests stroke rather than filled rectangle", () => {
  expect(rotatedSize(100, 200, 90).width).toBeCloseTo(200);
  expect(rotatedSize(100, 100, 45).height).toBeCloseTo(Math.sqrt(2) * 100);
  const a = {
    id: "rect",
    tool: "rect" as const,
    points: [
      { x: 0.1, y: 0.1 },
      { x: 0.9, y: 0.9 },
    ],
    color: "#000000",
    width: 3,
    authorId: user.id,
  };
  expect(annotationHit(a, { x: 0.1, y: 0.5 }, 1000, 1000, 8)).toBe(true);
  expect(annotationHit(a, { x: 0.5, y: 0.5 }, 1000, 1000, 8)).toBe(false);
});
it("insurance package routing accepts explicit categorization and lunula/INVT defaults", async () => {
  const s = await fixture(),
    p = s.catalogs[0].products[0];
  expect(productCategory({ ...p, name: "lunula 10회" })).toBe("보험");
  expect(productCategory({ ...p, name: "INVT 패키지" })).toBe("보험");
  expect(productCategory({ ...p, name: "INVT", careCategory: "미용" })).toBe(
    "미용",
  );
});
it("invalid/truncated EXIF never blocks photo attachment", () => {
  expect(
    jpegCaptureDate(new Uint8Array([255, 216, 255, 225, 0, 99]).buffer),
  ).toBeUndefined();
});
