export type Role = "admin" | "coordinator" | "doctor";
export const permissions = [
  "patient.edit",
  "money.read",
  "receipt.create",
  "refund.create",
  "ledger.correct",
  "note.read",
  "note.edit",
  "grade.edit",
  "catalog.edit",
  "stats.read",
  "export",
  "followup.edit",
] as const;
export type Permission = (typeof permissions)[number];
export interface User {
  id: string;
  name: string;
  username: string;
  role: Role;
  active: boolean;
  permissions: Partial<Record<Permission, boolean>>;
}
export interface Base {
  id: string;
  rev: number;
  createdAt: string;
  updatedAt: string;
}
export interface Patient extends Base {
  number?: string;
  storageName?: string;
  name: string;
  sex: "M" | "F" | "U";
  dob: string;
  phone: string;
  address: string;
  ownerId: string;
  mergedInto?: string;
  gradeOverride?: { gradeId: string; reason: string; actorId: string };
  archived?: boolean;
}
export interface PatientNote extends Base {
  patientId: string;
  authorId: string;
  text: string;
  important: boolean;
}
export interface Source {
  sheet: string;
  cell: string;
  text: string;
}
export interface Option {
  id: string;
  label: string;
  price: number | null;
  tax: "exclusive" | "inclusive" | "exempt" | "unknown";
  review: boolean;
  issues: string[];
  sources: Source[];
  priceKind: "regular" | "clinic" | "event" | "quote";
  unit: string;
}
export interface Product extends Base {
  careCategory?: "미용" | "보험";
  category: string;
  name: string;
  description: string;
  composition: string;
  active: boolean;
  options: Option[];
  sources: Source[];
}
export interface Catalog extends Base {
  schemaVersion: 1;
  version: string;
  status: "draft" | "published";
  products: Product[];
  references: { sheet: string; rows: { row: number; cells: Source[] }[] }[];
  publishedAt?: string;
  authorId?: string;
}
export interface Discount {
  kind: "amount" | "percent";
  value: number;
}
export interface Line {
  description?: string;
  composition?: string;
  id: string;
  productId: string;
  optionId: string;
  name: string;
  label: string;
  unit: string;
  quantity: number;
  price: number;
  tax: Option["tax"];
  discount: Discount;
}
export interface Quote {
  lines: Line[];
  discount: Discount;
  vat: "separate" | "included";
  reason: string;
  subtotal: number;
  discountTotal: number;
  supply: number;
  vatAmount: number;
  total: number;
}
export interface Annotation {
  id: string;
  tool: "pen" | "arrow" | "rect" | "ellipse" | "text" | "mosaic" | "stamp";
  dashed?: boolean;
  opacity?: number;
  font?: "sans" | "serif" | "mono" | "gaegu" | "jua" | "pen";
  fontSize?: number;
  box?: { width: number; height: number };
  points: { x: number; y: number }[];
  color: string;
  width: number;
  text?: string;
  authorId: string;
}
export interface Photo {
  capturedAt?: string;
  thumbnail?: string;
  sourceConsultationId?: string;
  sourcePhotoId?: string;
  id: string;
  name: string;
  mediaId: string;
  selected: boolean;
  representative?: boolean;
  viewportCrop?: { x: number; y: number; width: number; height: number };
  rotation: number;
  crop?: { x: number; y: number; width: number; height: number };
  annotations: Annotation[];
}
export interface Consultation extends Base {
  kind?: "initial" | "interim" | "renewal";
  sourceConsultationId?: string;
  sourceRev?: number;
  photoColumns?: number;
  packageProgress?: { total?: number; used?: number; complete: boolean };
  patientId: string;
  patient: Pick<Patient, "name" | "sex" | "dob" | "phone" | "address">;
  ownerId: string;
  category: "미용" | "보험";
  status: "H" | "P" | "F";
  cancelled: boolean;
  catalogVersion: string;
  quote: Quote;
  memo: string;
  photos: Photo[];
  appointment: string;
  attendance: "미정" | "예약" | "방문" | "노쇼";
  documents: string[];
  reason?: string;
}
export interface Ledger extends Base {
  patientId: string;
  consultationId: string;
  kind: "receipt" | "refund" | "reversal";
  amount: number;
  originalId?: string;
  method: string;
  date: string;
  memo: string;
  actorId: string;
}
export interface Grade {
  id: string;
  name: string;
  color: string;
  minimum: number;
}
export interface Policy extends Base {
  grades: Grade[];
}
export interface Opinion extends Base {
  consultationId: string;
  fromId: string;
  toId: string;
  request: string;
  answer: string;
  answeredAt?: string;
}
export interface Consent extends Base {
  name: string;
  productIds: string[];
  body: string;
  checks: string[];
  status: "draft" | "published";
  version: number;
}
export interface Signature extends Base {
  consultationId: string;
  templateId: string;
  templateVersion: number;
  templateBody: string;
  signer: string;
  relationship: string;
  checks: string[];
  image: string;
  contentHash: string;
  actorId: string;
}
export interface Event extends Base {
  patientId?: string;
  actorId: string;
  kind: string;
  text: string;
  operationId: string;
}
export interface State {
  patients: Patient[];
  notes: PatientNote[];
  consultations: Consultation[];
  ledger: Ledger[];
  catalogs: Catalog[];
  policies: Policy[];
  opinions: Opinion[];
  consents: Consent[];
  signatures: Signature[];
  events: Event[];
  users: User[];
}
export interface Command {
  id: string;
  type: string;
  entityId?: string;
  baseRev?: number;
  payload: Record<string, unknown>;
}
export const emptyState = (): State => ({
  patients: [],
  notes: [],
  consultations: [],
  ledger: [],
  catalogs: [],
  policies: [],
  opinions: [],
  consents: [],
  signatures: [],
  events: [],
  users: [],
});
export const emptyQuote = (): Quote => ({
  lines: [],
  discount: { kind: "amount", value: 0 },
  vat: "separate",
  reason: "",
  subtotal: 0,
  discountTotal: 0,
  supply: 0,
  vatAmount: 0,
  total: 0,
});
export const latestCatalog = (s: State) =>
  s.catalogs
    .filter((c) => c.status === "published")
    .sort((a, b) =>
      (b.publishedAt || "").localeCompare(a.publishedAt || ""),
    )[0];
export const consultationKind = (c: Consultation) =>
  c.kind === "interim"
    ? "중간상담"
    : c.kind === "renewal"
      ? "연장상담"
      : "첫 상담";
export const packageActive = (c: Consultation) =>
  !c.cancelled &&
  c.status === "P" &&
  c.kind !== "interim" &&
  !c.packageProgress?.complete;
export function allowed(u: User, p: Permission) {
  if (!u.active) return false;
  if (u.role === "admin") return true;
  if (
    u.permissions[p] === undefined &&
    u.role === "doctor" &&
    ["money.read", "note.read", "note.edit", "export"].includes(p)
  )
    return true;
  return (
    u.permissions[p] ??
    ([
      "money.read",
      "note.read",
      "note.edit",
      "receipt.create",
      "followup.edit",
      "export",
    ].includes(p) &&
      u.role === "coordinator")
  );
}
export function age(dob: string, date = new Date()) {
  const now = new Date(
    date.toLocaleString("en-US", { timeZone: "Asia/Seoul" }),
  );
  const [y, m, d] = dob.split("-").map(Number);
  return (
    now.getFullYear() -
    y -
    (now.getMonth() + 1 < m || (now.getMonth() + 1 === m && now.getDate() < d)
      ? 1
      : 0)
  );
}
export const money = (v: number) =>
  new Intl.NumberFormat("ko-KR").format(v) + "원";

export const productCategory = (p: Product): "미용" | "보험" =>
  p.careCategory ||
  (/보험|lunula|루눌라|invt/i.test(p.category + " " + p.name)
    ? "보험"
    : "미용");
