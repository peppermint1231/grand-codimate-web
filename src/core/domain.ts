import { catalogChanges } from "./catalogHistory";
import { folderError } from "./catalogFolders";
import { safeName } from "./storagePaths";
import { z } from "zod";
import {
  allowed,
  productCategory,
  emptyQuote,
  latestCatalog,
  latestCatalogs,
  catalogBook,
  catalogBooks,
  type State,
  type User,
  type Command,
  type Permission,
  type Quote,
  type Discount,
  type Line,
  type Patient,
  type Consultation,
  type Catalog,
  type Ledger,
  type Photo,
} from "./model";
export class DomainError extends Error {
  constructor(
    message: string,
    public status = 400,
  ) {
    super(message);
  }
}
export function ensure(ok: unknown, msg: string, status = 400): asserts ok {
  if (!ok) throw new DomainError(msg, status);
}
const amount = z.number().int().min(0).max(1_000_000_000);
const discountSchema = z.object({
  kind: z.enum(["amount", "percent"]),
  value: z.number().min(0).max(1_000_000_000),
});
const patientSchema = z.object({
  name: z.string().trim().min(1).max(80),
  sex: z.enum(["M", "F", "U"]),
  dob: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .refine(
      (v) =>
        !Number.isNaN(Date.parse(v)) &&
        new Date(v).toISOString().slice(0, 10) === v &&
        v <= new Date().toISOString().slice(0, 10),
      "생년월일을 확인하세요",
    ),
  phone: z
    .string()
    .transform((x) => x.replace(/\D/g, ""))
    .refine((x) => /^\d{9,11}$/.test(x), "전화번호를 확인하세요"),
  address: z.string().trim().min(1).max(160),
});
function discountOf(base: number, d: Discount) {
  ensure(Number.isFinite(d.value) && d.value >= 0, "할인을 확인하세요");
  ensure(
    d.kind !== "percent" || d.value <= 100,
    "할인은 100% 이하로 입력하세요",
  );
  const v =
    d.kind === "percent"
      ? Math.round((base * d.value) / 100)
      : Math.round(d.value);
  ensure(v <= base, "할인이 금액보다 큽니다");
  return v;
}
export function calculate(
  lines: Line[],
  discount: Discount,
  vat: "included" | "separate",
  reason = "",
): Quote {
  const bases = lines.map((l) => {
    ensure(
      ["exclusive", "inclusive", "exempt"].includes(l.tax),
      `${l.name}: 부가세 기준을 확인하세요`,
    );
    ensure(
      Number.isFinite(l.quantity) && l.quantity > 0 && l.quantity <= 1000,
      "수량을 확인하세요",
    );
    amount.parse(l.price);
    const b = Math.round(l.price * l.quantity);
    return b - discountOf(b, l.discount);
  });
  const subtotal = lines.reduce(
      (s, l) => s + Math.round(l.price * l.quantity),
      0,
    ),
    net = bases.reduce((a, b) => a + b, 0),
    global = discountOf(net, discount);
  const allocations = bases.map((b, i) => ({
    i,
    v: net ? Math.floor((global * b) / net) : 0,
    f: net ? ((global * b) / net) % 1 : 0,
  }));
  let remainder = global - allocations.reduce((a, b) => a + b.v, 0);
  for (const a of [...allocations].sort((a, b) => b.f - a.f || a.i - b.i)) {
    if (remainder-- > 0) a.v++;
  }
  let supply = 0,
    vatAmount = 0;
  lines.forEach((l, i) => {
    const value = bases[i] - allocations[i].v;
    if (l.tax === "exempt") supply += value;
    else if (l.tax === "inclusive" || vat === "included") {
      const tax = Math.round(value / 11);
      supply += value - tax;
      vatAmount += tax;
    } else {
      supply += value;
      vatAmount += Math.round(value * 0.1);
    }
  });
  return {
    lines,
    discount,
    vat,
    reason,
    subtotal,
    discountTotal: subtotal - net + global,
    supply,
    vatAmount,
    total: supply + vatAmount,
  };
}
export function renewalQuote(
  source: Consultation,
  catalog: Catalog | Catalog[] | undefined,
  id: string,
): Quote {
  ensure(
    source.kind !== "interim" && source.quote.lines.length > 0,
    "시술 견적이 있는 기존 상담을 선택하세요",
  );
  const lines = source.quote.lines.map((old, index) => {
    const catalogs = Array.isArray(catalog)
      ? catalog
      : catalog
        ? [catalog]
        : [];
    const matches = catalogs.filter(
      (c) =>
        (!old.book || catalogBook(c) === old.book) &&
        c.products.some((p) => p.id === old.productId && p.active),
    );
    ensure(
      matches.length <= 1,
      `${old.name}: 같은 상품 ID가 여러 단가표에 있습니다. 상담에서 다시 선택하세요`,
    );
    const matchedCatalog = matches[0];
    const product = matchedCatalog?.products.find(
      (x) => x.id === old.productId && x.active,
    );
    const option = product?.options.find(
      (x) => x.id === old.optionId && !x.review && x.price !== null,
    );
    ensure(
      product && option,
      `${old.name}: 현재 판매 단가·부가세를 검토·게시한 뒤 연장하세요`,
    );
    return {
      ...old,
      id: `${id}-${index}`,
      catalogVersion: matchedCatalog!.version,
      book: catalogBook(matchedCatalog!),
      name: product.name,
      label: option.label,
      price: option.price!,
      tax: option.tax,
      unit: option.unit,
      description: product.description,
      composition: product.composition,
      discount: { kind: "amount" as const, value: 0 },
    };
  });
  return calculate(lines, { kind: "amount", value: 0 }, source.quote.vat);
}
export function activeLedger(s: State) {
  const reversed = new Set(
    s.ledger.filter((l) => l.kind === "reversal").map((l) => l.originalId),
  );
  return s.ledger.filter((l) => l.kind !== "reversal" && !reversed.has(l.id));
}
export function metrics(s: State, patientId: string) {
  const entries = activeLedger(s).filter((l) => l.patientId === patientId);
  const receipts = entries
      .filter((l) => l.kind === "receipt")
      .reduce((a, l) => a + l.amount, 0),
    refunds = entries
      .filter((l) => l.kind === "refund")
      .reduce((a, l) => a + l.amount, 0);
  const contracts = s.consultations.filter(
    (c) => c.patientId === patientId && c.status === "P" && !c.cancelled,
  );
  const contract = contracts.reduce((a, c) => a + c.quote.total, 0);
  const outstanding = contracts.reduce((sum, c) => {
    const net = entries
      .filter((l) => l.consultationId === c.id)
      .reduce((a, l) => a + (l.kind === "receipt" ? l.amount : -l.amount), 0);
    return sum + Math.max(0, c.quote.total - net);
  }, 0);
  return {
    contract,
    receipts,
    refunds,
    revenue: receipts - refunds,
    outstanding,
  };
}
export function gradeFor(s: State, p: Patient) {
  const grades = s.policies[0]?.grades || [];
  if (p.gradeOverride) {
    const g = grades.find((g) => g.id === p.gradeOverride!.gradeId);
    if (g) return { ...g, manual: true };
  }
  const r = metrics(s, p.id).revenue;
  const g = [...grades]
    .sort((a, b) => b.minimum - a.minimum)
    .find((g) => r >= g.minimum);
  return g
    ? { ...g, manual: false }
    : {
        id: "none",
        name: "미분류",
        color: "#84918b",
        minimum: 0,
        manual: false,
      };
}
export function duplicates(
  s: State,
  p: { name: string; dob: string; phone: string },
) {
  return s.patients.filter(
    (x) =>
      !x.mergedInto &&
      !x.archived &&
      ((!!p.name.trim() &&
        !!p.dob &&
        x.name.replace(/\s/g, "") === p.name.replace(/\s/g, "") &&
        x.dob === p.dob) ||
        (!!p.phone.replace(/\D/g, "") &&
          x.phone.replace(/\D/g, "") === p.phone.replace(/\D/g, ""))),
  );
}
export function patientFor(s: State, id: string) {
  let p = s.patients.find((p) => p.id === id);
  const seen = new Set<string>();
  while (p?.mergedInto && !seen.has(p.id)) {
    seen.add(p.id);
    p = s.patients.find((x) => x.id === p!.mergedInto);
  }
  return p;
}
export function consentContent(c: Consultation) {
  return JSON.stringify({
    patient: c.patient,
    category: c.category,
    quote: c.quote,
    memo: c.memo,
    photos: c.photos,
  });
}
export async function sha(value: string) {
  return [
    ...new Uint8Array(
      await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value)),
    ),
  ]
    .map((x) => x.toString(16).padStart(2, "0"))
    .join("");
}
const photoSchema = z.object({
  id: z.string().min(1),
  name: z.string().max(200),
  mediaId: z.string().min(1),
  selected: z.boolean(),
  rotation: z.number().finite().min(-360).max(360),
  capturedAt: z.string().datetime().optional(),
  thumbnail: z
    .string()
    .max(60000)
    .regex(/^data:image\/jpeg;base64,[A-Za-z0-9+/=]+$/)
    .optional(),
  sourceConsultationId: z.string().optional(),
  sourcePhotoId: z.string().optional(),
  representative: z.boolean().optional(),
  viewportCrop: z
    .object({
      x: z.number().min(0).max(1),
      y: z.number().min(0).max(1),
      width: z.number().positive().max(1),
      height: z.number().positive().max(1),
    })
    .refine(
      (b) => b.x + b.width <= 1.000001 && b.y + b.height <= 1.000001,
      "자르기 영역을 확인하세요",
    )
    .optional(),
  crop: z
    .object({
      x: z.number().min(0).max(1),
      y: z.number().min(0).max(1),
      width: z.number().positive().max(1),
      height: z.number().positive().max(1),
    })
    .optional(),
  annotations: z
    .array(
      z.object({
        id: z.string(),
        tool: z.enum([
          "pen",
          "arrow",
          "rect",
          "ellipse",
          "text",
          "mosaic",
          "stamp",
        ]),
        points: z
          .array(
            z.object({
              x: z.number().min(0).max(1),
              y: z.number().min(0).max(1),
            }),
          )
          .max(10000),
        color: z.string().regex(/^#[a-fA-F0-9]{6}$/),
        width: z.number().min(1).max(30),
        text: z.string().max(500).optional(),
        authorId: z.string(),
        dashed: z.boolean().optional(),
        opacity: z.number().min(0).max(1).optional(),
        font: z
          .enum(["sans", "serif", "mono", "gaegu", "jua", "pen"])
          .optional(),
        fontSize: z.number().min(6).max(500).optional(),
        box: z
          .object({
            width: z.number().positive().max(1),
            height: z.number().positive().max(1),
          })
          .optional(),
      }),
    )
    .max(1000),
});
export function validateCatalog(c: Catalog, posting = false) {
  ensure(
    c &&
      c.schemaVersion === 1 &&
      Array.isArray(c.products) &&
      Array.isArray(c.references),
    "단가표 형식을 확인하세요",
  );
  ensure(!c.book || catalogBooks.includes(c.book), "단가표 구분을 확인하세요");
  const error = folderError(c);
  ensure(!error, error || "폴더를 확인하세요");
  const ids = new Set<string>();
  for (const p of c.products) {
    ensure(
      !p.careCategory || ["미용", "보험"].includes(p.careCategory),
      "상담 구분을 확인하세요",
    );
    ensure(
      typeof p.id === "string" &&
        p.id &&
        typeof p.name === "string" &&
        p.name.trim() &&
        typeof p.category === "string" &&
        p.category.trim() &&
        !ids.has(p.id),
      "상품 ID·이름·분류가 없거나 중복되었습니다",
    );
    ids.add(p.id);
    ensure(
      typeof p.description === "string" &&
        typeof p.composition === "string" &&
        Array.isArray(p.sources) &&
        typeof p.active === "boolean" &&
        (p.publicVisible === undefined || typeof p.publicVisible === "boolean"),
      "상품 설명·구성·출처·사용 여부를 확인하세요",
    );
    ensure(Array.isArray(p.options), "옵션이 필요합니다");
    for (const o of p.options) {
      ensure(
        Array.isArray(o.sources) &&
          Array.isArray(o.issues) &&
          typeof o.review === "boolean" &&
          typeof o.unit === "string",
        "옵션 검토·출처·단위를 확인하세요",
      );
      ensure(
        o.id && o.label && !ids.has(o.id),
        "옵션 ID·이름이 중복되거나 없습니다",
      );
      ids.add(o.id);
      if (o.price !== null) amount.parse(o.price);
      ensure(
        ["exclusive", "inclusive", "exempt", "unknown"].includes(o.tax),
        "부가세 기준을 확인하세요",
      );
      if (posting && p.active)
        ensure(
          !o.review && o.price !== null && o.tax !== "unknown",
          "판매 중 상품의 확인 필요 가격·부가세를 해결하세요",
        );
    }
  }
}
export async function applyCommand(
  input: State,
  user: User,
  cmd: Command,
  now = new Date().toISOString(),
): Promise<State> {
  ensure(user.active, "사용 중지된 계정입니다", 403);
  ensure(/^[\w-]{8,100}$/.test(cmd.id), "작업 ID가 필요합니다");
  ensure(
    !cmd.entityId || /^[\w-]{1,100}$/.test(cmd.entityId),
    "자료 ID 형식을 확인하세요",
  );
  ensure(
    cmd.payload &&
      typeof cmd.payload === "object" &&
      !Array.isArray(cmd.payload),
    "변경 내용을 확인하세요",
  );
  const s = structuredClone(input);
  s.catalogRevisions ||= [];
  const p = cmd.payload;
  const id = cmd.entityId || cmd.id;
  let patientId: string | undefined;
  let text = cmd.type;
  const need = (v: Permission) =>
    ensure(allowed(user, v), "이 작업의 권한이 없습니다", 403);
  const admin = () =>
    ensure(user.role === "admin", "관리자만 변경할 수 있습니다", 403);
  const find = <T extends { id: string; rev: number }>(list: T[]) => {
    const x = list.find((x) => x.id === id);
    ensure(x, "자료를 찾을 수 없습니다", 404);
    ensure(
      cmd.baseRev === x.rev,
      "다른 기기에서 수정되었습니다. 최신 자료와 내 변경을 비교하세요.",
      409,
    );
    return x;
  };
  const base = { id, rev: 1, createdAt: now, updatedAt: now };
  const touch = (x: { rev: number; updatedAt: string }) => {
    x.rev++;
    x.updatedAt = now;
  };
  const consultation = () => {
    const c = find(s.consultations);
    patientId = c.patientId;
    return c;
  };
  const edit = (c: Consultation) =>
    ensure(
      user.role === "admin" ||
        (c.ownerId === user.id && c.status === "H" && !c.cancelled),
      "이 상담을 수정할 권한이 없습니다",
      403,
    );
  const recordCatalog = (
    before: Catalog | undefined,
    after: Catalog,
    action: string,
  ) => {
    if (
      before &&
      !s.catalogRevisions.some(
        (r) => r.catalogId === before.id && r.snapshot.rev === before.rev,
      )
    )
      s.catalogRevisions.push({
        ...base,
        id: cmd.id + "-before",
        catalogId: before.id,
        book: catalogBook(before),
        actorId: before.authorId || user.id,
        action: "변경 전",
        changes: ["수정 전 단가표"],
        snapshot: structuredClone(before),
      });
    s.catalogRevisions.push({
      ...base,
      id: cmd.id,
      catalogId: after.id,
      book: catalogBook(after),
      actorId: user.id,
      action,
      changes: catalogChanges(before, after),
      snapshot: structuredClone(after),
    });
  };
  switch (cmd.type) {
    case "patient.create": {
      const d = patientSchema.parse(p);
      ensure(
        !s.patients.some((x) => x.id === id),
        "환자 ID가 이미 있습니다",
        409,
      );
      ensure(
        d.dob <= now.slice(0, 10) && !isNaN(Date.parse(d.dob)),
        "생년월일을 확인하세요",
      );
      const number = String(
        Math.max(0, ...s.patients.map((x) => Number(x.number) || 0)) + 1,
      ).padStart(6, "0");
      s.patients.push({
        ...base,
        ...d,
        number,
        storageName: safeName(`${number}${d.sex}${d.name}`),
        ownerId: user.id,
      });
      patientId = id;
      text = "환자 등록";
      break;
    }
    case "patient.update": {
      need("patient.edit");
      const x = find(s.patients);
      x.storageName ||= safeName(`${x.number || x.id}${x.sex}${x.name}`);
      Object.assign(x, patientSchema.parse(p));
      touch(x);
      patientId = id;
      text = "환자정보 수정";
      break;
    }
    case "patient.archive": {
      admin();
      const x = find(s.patients);
      ensure(!x.mergedInto, "병합된 환자는 변경할 수 없습니다");
      ensure(typeof p.archived === "boolean", "삭제·복원 상태를 확인하세요");
      x.archived = p.archived;
      touch(x);
      patientId = id;
      text = p.archived ? "환자 목록에서 삭제 (기록 보존)" : "환자 목록 복원";
      break;
    }
    case "patient.merge": {
      admin();
      const from = find(s.patients),
        target = patientFor(s, String(p.targetId));
      ensure(
        target &&
          !target.mergedInto &&
          target.id !== from.id &&
          !from.mergedInto &&
          !from.archived &&
          !target.archived,
        "병합 대상이 올바르지 않습니다",
      );
      ensure(String(p.reason || "").trim(), "병합 사유를 입력하세요");
      ensure(
        p.targetRev === undefined || p.targetRev === target.rev,
        "병합 대상이 다른 기기에서 수정되었습니다. 다시 확인하세요.",
        409,
      );
      from.mergedInto = target.id;
      touch(from);
      touch(target);
      for (const list of [s.consultations, s.notes, s.ledger])
        for (const x of list)
          if (x.patientId === from.id) {
            x.patientId = target.id;
            touch(x);
          }
      for (const x of s.events)
        if (x.patientId === from.id) x.patientId = target.id;
      patientId = target.id;
      text = `환자 병합: ${String(p.reason)}`;
      break;
    }
    case "note.save": {
      need("note.edit");
      const x = s.notes.find((x) => x.id === id);
      const d = z
        .object({
          patientId: z.string(),
          text: z.string().trim().min(1).max(10000),
          important: z.boolean(),
        })
        .parse(p);
      ensure(patientFor(s, d.patientId), "환자가 없습니다");
      if (x) {
        find(s.notes);
        ensure(
          x.authorId === user.id || user.role === "admin",
          "작성자만 메모를 수정할 수 있습니다",
          403,
        );
        ensure(x.patientId === d.patientId, "환자 연결을 변경할 수 없습니다");
        Object.assign(x, d);
        touch(x);
      } else {
        s.notes.push({ ...base, ...d, authorId: user.id });
      }
      patientId = d.patientId;
      text = "환자 메모 저장";
      break;
    }
    case "consultation.create": {
      ensure(
        !s.consultations.some((x) => x.id === id),
        "상담 ID가 이미 있습니다",
        409,
      );
      const patient = patientFor(s, String(p.patientId));
      ensure(patient && !patient.archived, "환자를 선택하세요");
      patientSchema.parse(patient);
      const cat = latestCatalog(s);
      const category = z.enum(["미용", "보험"]).parse(p.category);
      const kind = z
        .enum(["initial", "interim", "renewal"])
        .parse(p.kind || "initial");
      const source = p.sourceConsultationId
        ? s.consultations.find((x) => x.id === p.sourceConsultationId)
        : undefined;
      if (p.sourceConsultationId || kind !== "initial")
        ensure(
          source &&
            source.patientId === patient.id &&
            source.category === category &&
            !source.cancelled,
          "같은 환자·구분의 이전 상담을 선택하세요",
        );
      if (kind !== "initial") {
        ensure(
          source?.kind !== "interim",
          "시술 상담을 기준으로 중간·연장상담을 시작하세요",
        );
        if (p.sourceRev !== undefined)
          ensure(
            z.number().int().positive().parse(p.sourceRev) === source?.rev,
            "기준 상담이 변경되었습니다. 최신 내용을 확인하고 다시 시작하세요.",
            409,
          );
      }
      if (kind === "renewal")
        ensure(source?.status === "P", "성공 확정한 기존 상담을 선택하세요");
      const quote =
        kind === "renewal" && source
          ? renewalQuote(source, latestCatalogs(s), id)
          : emptyQuote();
      s.consultations.push({
        ...base,
        patientId: patient.id,
        patient: {
          name: patient.name,
          sex: patient.sex,
          dob: patient.dob,
          phone: patient.phone,
          address: patient.address,
        },
        ownerId: user.id,
        category,
        status: "H",
        cancelled: false,
        kind,
        sourceConsultationId: source?.id,
        sourceRev: source?.rev,
        photoColumns: source?.photoColumns || 2,
        catalogVersion: cat?.version || "",
        catalogVersions: Object.fromEntries(
          latestCatalogs(s).map((c) => [catalogBook(c), c.version]),
        ),
        quote,
        memo: "",
        photos: source
          ? source.photos.map((ph, index) => ({
              ...structuredClone(ph),
              id: `${id}-history-${index}`,
              selected: false,
              capturedAt: ph.capturedAt || source.createdAt,
              sourceConsultationId: source.id,
              sourcePhotoId: ph.id,
            }))
          : [],
        appointment: "",
        attendance: "미정",
        documents: [],
      });
      patientId = patient.id;
      text =
        kind === "interim"
          ? "중간상담 시작"
          : kind === "renewal"
            ? "연장상담 시작 · 현재 단가 적용"
            : "보류 상담 시작";
      break;
    }
    case "consultation.annotate": {
      const c = consultation();
      ensure(
        user.role === "doctor" || user.role === "admin",
        "의사 주석 권한이 필요합니다",
        403,
      );
      const incoming = z.array(photoSchema).parse(p.photos) as Photo[];
      ensure(
        incoming.length === c.photos.length,
        "사진 목록은 변경할 수 없습니다",
      );
      for (const photo of c.photos) {
        const changed = incoming.find((x) => x.id === photo.id);
        ensure(changed, "사진 목록은 변경할 수 없습니다");
        photo.annotations = [
          ...photo.annotations.filter((a) => a.authorId !== user.id),
          ...changed.annotations.filter((a) => a.authorId === user.id),
        ];
      }
      touch(c);
      text = "의사 주석 저장";
      break;
    }
    case "consultation.save": {
      const c = consultation();
      edit(c);
      if (c.status !== "H")
        ensure(
          String(p.reason || "").trim(),
          "확정 상담 수정 사유를 입력하세요",
        );
      const catalog = s.catalogs.find(
        (x) =>
          x.status === "published" &&
          x.version === (p.catalogVersion || c.catalogVersion),
      );
      ensure(!p.catalogVersion || catalog, "게시된 단가표 버전을 확인하세요");
      if (c.kind === "interim")
        ensure(
          !((p.lines || []) as unknown[]).length,
          "중간상담에는 견적을 추가하지 않습니다",
        );
      const raw = z
        .array(
          z.object({
            id: z.string(),
            productId: z.string(),
            optionId: z.string(),
            catalogVersion: z.string().optional(),
            book: z.enum(catalogBooks).optional(),
            quantity: z.number().positive().max(1000),
            discount: discountSchema,
          }),
        )
        .parse(p.lines || []);
      ensure(
        new Set(raw.map((l) => l.id)).size === raw.length &&
          raw.every((l) => l.id.trim()),
        "견적 항목 ID가 없거나 중복되었습니다",
      );
      const catalogVersions = z
        .record(z.enum(catalogBooks), z.string())
        .optional()
        .parse(p.catalogVersions);
      if (catalogVersions)
        for (const [book, version] of Object.entries(catalogVersions)) {
          ensure(
            s.catalogs.some(
              (x) =>
                x.status === "published" &&
                catalogBook(x) === book &&
                x.version === version,
            ),
            "게시된 단가표 버전을 확인하세요",
          );
        }
      const lines: Line[] = raw.map((l) => {
        const version =
          l.catalogVersion ||
          (l.book && catalogVersions?.[l.book]) ||
          catalog?.version;
        const lineCatalog = s.catalogs.find(
          (x) => x.status === "published" && x.version === version,
        );
        ensure(
          !l.book || (lineCatalog && catalogBook(lineCatalog) === l.book),
          "단가표 구분과 버전이 일치하지 않습니다",
        );
        const old = c.quote.lines.find(
          (x) =>
            x.id === l.id &&
            x.productId === l.productId &&
            x.optionId === l.optionId,
        );
        if (old && (old.catalogVersion || c.catalogVersion) === version)
          return { ...old, quantity: l.quantity, discount: l.discount };
        const product = lineCatalog?.products.find(
            (x) => x.id === l.productId && x.active,
          ),
          o = product?.options.find((x) => x.id === l.optionId);
        ensure(
          product && o && o.price !== null && !o.review,
          "검증·게시된 상품만 담을 수 있습니다",
        );
        return {
          ...l,
          catalogVersion: lineCatalog!.version,
          book: catalogBook(lineCatalog!),
          name: product.name,
          description: product.description,
          composition: product.composition,
          label: o.label,
          unit: o.unit,
          price: o.price,
          tax: o.tax,
        };
      });
      const quote = calculate(
        lines,
        discountSchema.parse(p.discount),
        z.enum(["separate", "included"]).parse(p.vat),
        String(p.reason || ""),
      );
      ensure(
        !quote.discountTotal || quote.reason.trim(),
        "할인 사유를 입력하세요",
      );
      c.quote = quote;
      c.catalogVersion = String(p.catalogVersion || c.catalogVersion);
      if (catalogVersions) c.catalogVersions = catalogVersions;
      c.memo = z
        .string()
        .max(20000)
        .parse(p.memo || "");
      const photos = z
        .array(photoSchema)
        .max(50)
        .parse(p.photos || []) as Photo[];
      for (const ph of photos)
        for (const a of ph.annotations) {
          const original =
            c.photos.find((x) => x.id === ph.id) ||
            s.consultations
              .find(
                (x) =>
                  x.id === ph.sourceConsultationId &&
                  x.patientId === c.patientId &&
                  x.category === c.category,
              )
              ?.photos.find(
                (x) => x.id === ph.sourcePhotoId && x.mediaId === ph.mediaId,
              );
          const old = original?.annotations.find((x) => x.id === a.id);
          ensure(
            a.authorId === user.id ||
              user.role === "admin" ||
              JSON.stringify(old) === JSON.stringify(a),
            "다른 작성자의 주석을 변경할 수 없습니다",
            403,
          );
        }
      if (user.role !== "admin")
        for (const previous of c.photos) {
          for (const a of previous.annotations.filter(
            (a) => a.authorId !== user.id,
          ))
            ensure(
              photos
                .find((ph) => ph.id === previous.id)
                ?.annotations.some(
                  (next) => JSON.stringify(next) === JSON.stringify(a),
                ),
              "다른 작성자의 주석을 삭제할 수 없습니다",
              403,
            );
        }
      ensure(
        new Set(photos.map((x) => x.id)).size === photos.length,
        "사진 ID가 중복됩니다",
      );
      c.photos = photos;
      c.photoColumns = z
        .number()
        .int()
        .min(1)
        .max(4)
        .parse(p.photoColumns || c.photoColumns || 2);
      c.documents = [];
      c.reason = String(p.reason || "");
      touch(c);
      text = "상담 내용 저장";
      break;
    }
    case "consultation.finalize": {
      const c = consultation();
      edit(c);
      ensure(
        c.status === "H" && !c.cancelled,
        "이미 확정되었거나 취소된 상담입니다",
        409,
      );
      const status = z.enum(["P", "F"]).parse(p.status);
      ensure(
        status !== "P" || c.kind === "interim" || c.quote.lines.length > 0,
        "성공 확정에는 견적이 필요합니다",
      );
      const docs = z.array(z.string()).parse(p.documents || []);
      for (const signature of s.signatures.filter(
        (x) => x.consultationId === c.id,
      )) {
        const template = s.consents.find((t) => t.id === signature.templateId);
        const newest = s.signatures
          .filter(
            (x) =>
              x.consultationId === c.id &&
              x.templateId === signature.templateId,
          )
          .at(-1);
        if (newest?.id === signature.id)
          ensure(
            template &&
              signature.contentHash ===
                (await sha(consentContent(c) + JSON.stringify(template))),
            "서명 후 상담 내용이 변경되었습니다. 다시 서명받으세요",
            409,
          );
      }
      c.documents = docs;
      c.status = status;
      if (c.kind !== "interim" && status === "P")
        c.packageProgress = { complete: false };
      if (c.kind === "renewal") {
        const source = s.consultations.find(
          (x) => x.id === c.sourceConsultationId,
        );
        ensure(
          source &&
            source.patientId === c.patientId &&
            source.category === c.category &&
            source.status === "P" &&
            source.kind !== "interim" &&
            !source.cancelled,
          "기준 상담이 취소되었거나 연장할 수 없는 상태입니다. 기준 상담을 확인하세요.",
          409,
        );
        const expectedRev = p.sourceRev ?? c.sourceRev;
        if (expectedRev !== undefined)
          ensure(
            z.number().int().positive().parse(expectedRev) === source.rev,
            "기준 상담이 다른 기기에서 변경되었습니다. 새로고침 후 최신 상태를 확인하고 다시 확정하세요.",
            409,
          );
        source.packageProgress = { complete: true };
        touch(source);
      }
      touch(c);
      text =
        c.kind === "interim"
          ? status === "P"
            ? "중간상담 완료"
            : "중간상담 중단"
          : c.kind === "renewal"
            ? status === "P"
              ? "연장 확정 · 기존 패키지 완료"
              : "연장 안 함 · 기존 패키지 완료"
            : status === "P"
              ? "계약·예약 성공 확정"
              : "상담 실패 확정";
      break;
    }
    case "consultation.package": {
      need("followup.edit");
      const c = consultation();
      ensure(
        c.status === "P" && !c.cancelled && c.kind !== "interim",
        "성공 확정한 시술 상담에서 패키지를 관리하세요",
      );
      c.packageProgress = { complete: z.boolean().parse(p.complete) };
      touch(c);
      text = c.packageProgress.complete
        ? "패키지 완료로 전환"
        : "패키지 진행 중으로 전환";
      break;
    }
    case "consultation.cancel": {
      admin();
      const c = consultation();
      ensure(String(p.reason || "").trim(), "취소 사유를 입력하세요");
      c.cancelled = true;
      c.reason = String(p.reason);
      touch(c);
      text = "계약 취소 (환불 별도)";
      break;
    }
    case "consultation.rewrite": {
      admin();
      const c = consultation();
      ensure(String(p.reason || "").trim(), "재작성 사유를 입력하세요");
      const clone = {
        ...structuredClone(c),
        ...base,
        id: cmd.id,
        status: "H" as const,
        cancelled: false,
        documents: [],
        reason: String(p.reason),
      };
      s.consultations.push(clone);
      text = "기존 상담을 참조한 재작성";
      break;
    }
    case "followup.save": {
      const c = consultation();
      need("followup.edit");
      ensure(
        c.ownerId === user.id ||
          user.role === "admin" ||
          user.permissions["followup.edit"] === true,
        "담당 상담만 변경 가능합니다",
        403,
      );
      c.appointment = z
        .string()
        .max(40)
        .parse(p.appointment || "");
      c.attendance = z
        .enum(["미정", "예약", "방문", "노쇼"])
        .parse(p.attendance);
      touch(c);
      text = "예약·방문 상태 변경";
      break;
    }
    case "ledger.create": {
      const kind = z.enum(["receipt", "refund", "reversal"]).parse(p.kind);
      need(
        kind === "receipt"
          ? "receipt.create"
          : kind === "refund"
            ? "refund.create"
            : "ledger.correct",
      );
      const c = s.consultations.find((c) => c.id === p.consultationId);
      ensure(c, "상담을 선택하세요");
      ensure(
        user.role === "admin" ||
          c.ownerId === user.id ||
          user.permissions["receipt.create"] === true,
        "담당 상담만 수납할 수 있습니다",
        403,
      );
      patientId = c.patientId;
      const d = z
        .object({
          amount: amount.refine((x) => x > 0),
          date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
          method: z.string().min(1).max(40),
          memo: z.string().max(2000),
        })
        .parse(p);
      const active = activeLedger(s);
      const original = s.ledger.find((l) => l.id === p.originalId);
      if (kind === "receipt")
        ensure(
          c.status === "P" && !c.cancelled,
          "유효한 성공 상담에 수납을 등록하세요",
        );
      if (kind !== "receipt") {
        ensure(
          original &&
            original.consultationId === c.id &&
            active.some((x) => x.id === original.id),
          "연결할 원수납·환불이 없습니다",
        );
        if (kind === "refund") {
          ensure(original.kind === "receipt", "원수납을 선택하세요");
          const refunded = active
            .filter((x) => x.kind === "refund" && x.originalId === original.id)
            .reduce((a, x) => a + x.amount, 0);
          ensure(
            d.amount <= original.amount - refunded,
            "환불 가능한 금액을 초과했습니다",
          );
        } else {
          ensure(
            d.amount === original.amount,
            "정정 취소는 원금액과 같아야 합니다",
          );
          ensure(
            original.kind !== "receipt" ||
              !active.some(
                (x) => x.kind === "refund" && x.originalId === original.id,
              ),
            "연결된 환불을 먼저 정정하세요",
          );
          ensure(d.memo.trim(), "정정 사유를 입력하세요");
        }
      }
      s.ledger.push({
        ...base,
        ...d,
        patientId: c.patientId,
        consultationId: c.id,
        kind,
        actorId: user.id,
        ...(kind !== "receipt" ? { originalId: original!.id } : {}),
      });
      text = {
        receipt: "수납 등록",
        refund: "환불 등록",
        reversal: "금액 기록 정정 취소",
      }[kind];
      break;
    }
    case "grade.policy": {
      admin();
      const grades = z
        .array(
          z.object({
            id: z.string(),
            name: z.string().min(1),
            color: z.string().regex(/^#[a-fA-F0-9]{6}$/),
            minimum: amount,
          }),
        )
        .parse(p.grades);
      ensure(
        new Set(grades.map((g) => g.id)).size === grades.length &&
          new Set(grades.map((g) => g.minimum)).size === grades.length,
        "등급 ID와 기준금액은 중복할 수 없습니다",
      );
      ensure(
        s.patients.every(
          (p) =>
            !p.gradeOverride ||
            grades.some((g) => g.id === p.gradeOverride!.gradeId),
        ),
        "고정 중인 등급을 먼저 해제하세요",
      );
      const old = s.policies[0];
      if (old)
        ensure(cmd.baseRev === old.rev, "등급 기준이 변경되었습니다", 409);
      s.policies = [
        { ...base, id: "grades", rev: (old?.rev || 0) + 1, grades },
      ];
      text = "환자 등급 기준 변경";
      break;
    }
    case "grade.override": {
      need("grade.edit");
      const x = find(s.patients);
      if (p.gradeId) {
        ensure(
          s.policies[0]?.grades.some((g) => g.id === p.gradeId),
          "등급을 확인하세요",
        );
        ensure(String(p.reason || "").trim(), "등급 지정 사유를 입력하세요");
        x.gradeOverride = {
          gradeId: String(p.gradeId),
          reason: String(p.reason),
          actorId: user.id,
        };
      } else delete x.gradeOverride;
      touch(x);
      patientId = x.id;
      text = p.gradeId ? "환자 등급 수동 고정" : "환자 등급 자동 산정 복귀";
      break;
    }
    case "catalog.save": {
      need("catalog.edit");
      const catalog = p.catalog as unknown as Catalog;
      validateCatalog(catalog);
      const old = s.catalogs.find((x) => x.id === id);
      if (old) {
        find(s.catalogs);
        ensure(old.status === "draft", "게시본은 변경할 수 없습니다");
        ensure(
          catalogBook(old) === catalogBook(catalog),
          "기존 단가표의 구분은 변경할 수 없습니다",
        );
        Object.assign(old, catalog, {
          id,
          rev: old.rev + 1,
          createdAt: old.createdAt,
          updatedAt: now,
          status: "draft",
          authorId: user.id,
        });
      } else {
        s.catalogs.push({
          ...catalog,
          ...base,
          status: "draft",
          authorId: user.id,
        });
      }
      recordCatalog(
        input.catalogs.find((c) => c.id === id) ||
          latestCatalog(input, catalogBook(catalog)),
        s.catalogs.find((c) => c.id === id)!,
        "초안 저장",
      );
      text = "단가표 초안 저장";
      break;
    }
    case "catalog.publish": {
      need("catalog.edit");
      const c = find(s.catalogs);
      ensure(c.status === "draft", "게시할 초안을 선택하세요");
      validateCatalog(c, true);
      c.status = "published";
      c.version = now + "-" + cmd.id.slice(0, 8);
      c.publishedAt = now;
      touch(c);
      recordCatalog(
        input.catalogs.find((x) => x.id === id),
        c,
        "게시",
      );
      text = "단가표 게시";
      break;
    }
    case "catalog.folders.commit":
    case "catalog.restore": {
      need("catalog.edit");
      const current = find(s.catalogs);
      const before = structuredClone(current);
      ensure(
        p.basePublishedId ===
          (latestCatalog(s, catalogBook(current))?.id || ""),
        "다른 기기에서 단가표를 게시했습니다. 최신 내용을 확인하세요",
        409,
      );
      ensure(
        current.status !== "published" ||
          latestCatalog(s, catalogBook(current))?.id === current.id,
        "최신 게시본에서 수정하세요",
        409,
      );
      let candidate: Catalog;
      if (cmd.type === "catalog.restore") {
        const revision = s.catalogRevisions.find((r) => r.id === p.revisionId);
        ensure(
          revision && revision.book === catalogBook(current),
          "복원할 단가표 이력을 확인하세요",
        );
        candidate = structuredClone(revision.snapshot);
      } else candidate = structuredClone(p.catalog as Catalog);
      ensure(
        catalogBook(candidate) === catalogBook(current),
        "같은 구분의 단가표만 적용할 수 있습니다",
      );
      const publish =
        cmd.type === "catalog.folders.commit" ||
        candidate.status === "published";
      validateCatalog(candidate, publish);
      ensure(
        !s.catalogs.some((c) => c.id === cmd.id),
        "저장 작업 ID가 이미 사용되었습니다",
        409,
      );
      candidate = {
        ...candidate,
        ...base,
        id: cmd.id,
        book: catalogBook(current),
        authorId: user.id,
        status: publish ? "published" : "draft",
        version: now + "-" + cmd.id.slice(0, 8),
        publishedAt: publish ? now : undefined,
      };
      s.catalogs.push(candidate);
      // An edited draft becomes an immutable archived draft; newer published version wins in the UI.
      recordCatalog(
        before,
        candidate,
        cmd.type === "catalog.restore"
          ? publish
            ? "이전 이력 복원"
            : "초안 이력 복원"
          : "폴더 수정 저장",
      );
      text =
        cmd.type === "catalog.restore"
          ? publish
            ? "단가표 이력 복원·게시"
            : "단가표 초안 이력 복원"
          : "폴더 수정·추천기 반영";
      break;
    }
    case "audit.export": {
      need("export");
      text =
        "자료 내보내기: " +
        z
          .enum([
            "consultation-pdf",
            "quote-jpg",
            "catalog-xlsx",
            "statistics-xlsx",
            "catalog-csv",
          ])
          .parse(p.format);
      break;
    }
    case "opinion.request": {
      const c = s.consultations.find((c) => c.id === p.consultationId);
      ensure(c && c.status === "H", "보류 상담을 선택하세요");
      ensure(
        s.users.some(
          (u) =>
            u.id === p.toId &&
            u.active &&
            (u.role === "doctor" || u.role === "admin"),
        ),
        "의사를 선택하세요",
      );
      s.opinions.push({
        ...base,
        consultationId: c.id,
        fromId: user.id,
        toId: String(p.toId),
        request: z.string().min(1).max(5000).parse(p.request),
        answer: "",
      });
      patientId = c.patientId;
      text = "의사 의견 요청";
      break;
    }
    case "opinion.answer": {
      const o = find(s.opinions);
      ensure(
        o.toId === user.id || user.role === "admin",
        "담당 의사만 답변할 수 있습니다",
        403,
      );
      const c = s.consultations.find((c) => c.id === o.consultationId);
      ensure(c && c.status === "H", "확정 상담에는 답변을 추가할 수 없습니다");
      o.answer = z.string().min(1).max(10000).parse(p.answer);
      o.answeredAt = now;
      touch(o);
      patientId = c.patientId;
      text = "의사 답변";
      break;
    }
    case "consent.save": {
      admin();
      const d = z
        .object({
          name: z.string().min(1),
          body: z.string().min(1).max(30000),
          checks: z.array(z.string().min(1)),
          productIds: z.array(z.string()),
          status: z.enum(["draft", "published"]),
        })
        .parse(p);
      const old = s.consents.find((x) => x.id === id);
      if (old) {
        find(s.consents);
        ensure(old.status === "draft", "게시된 양식은 복제해서 수정하세요");
        Object.assign(old, d);
        touch(old);
      } else s.consents.push({ ...base, ...d, version: 1 });
      text = "동의서 양식 저장";
      break;
    }
    case "signature.create": {
      ensure(
        !s.signatures.some((x) => x.id === id),
        "서명 ID가 이미 있습니다",
        409,
      );
      const c = s.consultations.find((c) => c.id === p.consultationId);
      ensure(c, "상담을 선택하세요");
      edit(c);
      const t = s.consents.find(
        (t) => t.id === p.templateId && t.status === "published",
      );
      ensure(t, "병원 검토·게시된 양식을 선택하세요");
      const checks = z.array(z.string()).parse(p.checks);
      ensure(
        t.checks.every((x) => checks.includes(x)),
        "필수 확인 항목을 확인하세요",
      );
      const contentHash = await sha(consentContent(c) + JSON.stringify(t));
      ensure(
        contentHash === p.contentHash,
        "상담 내용이 변경되어 다시 서명해야 합니다",
        409,
      );
      const image = z
        .string()
        .max(300000)
        .regex(/^data:image\/png;base64,/)
        .parse(p.image);
      s.signatures.push({
        ...base,
        consultationId: c.id,
        templateId: t.id,
        templateVersion: t.version,
        templateBody: t.body,
        signer: z.string().min(1).parse(p.signer),
        relationship: String(p.relationship || "본인"),
        checks,
        image,
        contentHash,
        actorId: user.id,
      });
      patientId = c.patientId;
      text = "동의서 서명";
      break;
    }
    default:
      throw new DomainError("지원하지 않는 작업입니다");
  }
  s.events.push({
    ...base,
    id: cmd.id,
    patientId,
    actorId: user.id,
    kind: cmd.type,
    text,
    operationId: cmd.id,
  });
  for (const patient of s.patients.filter((p) => !p.mergedInto)) {
    const before = input.patients.find((p) => p.id === patient.id);
    const old = before ? gradeFor(input, before) : null,
      next = gradeFor(s, patient);
    if (old && (old.id !== next.id || old.manual !== next.manual))
      s.events.push({
        ...base,
        id: cmd.id + "-grade-" + patient.id,
        patientId: patient.id,
        actorId: user.id,
        kind: "grade.changed",
        text: `등급: ${old.name} → ${next.name}${next.manual ? " (관리자 지정)" : ""}`,
        operationId: cmd.id,
      });
  }
  return s;
}
