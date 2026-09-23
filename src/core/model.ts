import type { EventOriginInfo } from "./eventCatalog";
export const jobRoles = [
  "doctor",
  "coordinator",
  "esthetician",
  "desk",
] as const;
export type JobRole = (typeof jobRoles)[number];
// "admin" is accepted only when reading accounts saved before job/level separation.
export type Role = JobRole | "admin";
export const permissionLevels = ["admin", "executive", "standard"] as const;
export type PermissionLevel = (typeof permissionLevels)[number];
export const jobRoleLabels: Record<Role, string> = {
  doctor: "의사",
  coordinator: "코디네이터",
  esthetician: "피부관리사",
  desk: "데스크",
  admin: "직무 미지정",
};
export const permissionLevelLabels: Record<PermissionLevel, string> = {
  admin: "관리자",
  executive: "임원",
  standard: "일반",
};
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
  permissionLevel?: PermissionLevel;
  legacyPermissionDefaults?: boolean;
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
  acquisitionSource?: string;
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
  editedBy?: string;
  versions?: {
    rev: number;
    text: string;
    important: boolean;
    updatedAt: string;
    actorId: string;
  }[];
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
  regularPrice?: number | null;
  tax: "exclusive" | "inclusive" | "exempt" | "unknown";
  review: boolean;
  issues: string[];
  sources: Source[];
  priceKind: "regular" | "clinic" | "event" | "quote";
  unit: string;
}
export interface Product extends Base {
  offering?: import("./offerings").Offering;
  websiteListings?: WebsiteListing[];
  webEvent?: EventOriginInfo;
  folderId?: string;
  publicVisible?: boolean;
  careCategory?: "미용" | "보험";
  category: string;
  name: string;
  description: string;
  composition: string;
  active: boolean;
  options: Option[];
  sources: Source[];
}
export interface WebsiteListing {
  pageId: string;
  offerId: string;
  optionId?: string;
  name: string;
  description: string;
  url: string;
  book: "미용" | "이벤트";
  price: number | null;
  regularPrice: number | null;
  tax: Option["tax"];
  checkedAt: string;
  missing: boolean;
  changed: boolean;
  priceDiffers: boolean;
}
export interface Catalog extends Base {
  /** Client read projection; must fetch the complete record before editing. */
  workspaceOnly?: boolean;
  websiteImport?: {
    sourceUrl: string;
    checkedAt: string;
    pageCount: number;
    offerCount: number;
  };
  eventImport?: {
    sourceUrl: string;
    checkedAt: string;
    eventCount: number;
    offerCount: number;
  };
  book?: CatalogBook;
  folders?: CatalogFolder[];
  folderTree?: CatalogFolder[];
  schemaVersion: 1;
  version: string;
  status: "draft" | "published";
  products: Product[];
  references: { sheet: string; rows: { row: number; cells: Source[] }[] }[];
  publishedAt?: string;
  authorId?: string;
}
export interface CatalogRevision extends Base {
  catalogId: string;
  book: CatalogBook;
  actorId: string;
  action: string;
  changes: string[];
  snapshot: Catalog;
}
export interface Discount {
  kind: "amount" | "percent";
  value: number;
}
export interface Line {
  categorySnapshot?: string;
  /** Unit list price at selection; price remains the actual sale price. */
  regularPrice?: number;
  catalogVersion?: string;
  book?: CatalogBook;
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
  intakeSource?: {
    receiptId: string;
    receivedAt: string;
    consentVersion: string;
    personalConsent: boolean;
    sensitiveConsent: boolean;
  };
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
  catalogVersions?: Partial<Record<CatalogBook, string>>;
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
  answerPhotoComments?: { photoId: string; photoName: string; text: string }[];
  answeredAt?: string;
  answerRevision?: number;
  answerReadBy?: Record<string, string>;
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
export interface QuoteConsent extends Base {
  consultationId: string;
  actorId: string;
  signer: string;
  image: string;
  version: string;
  text: string;
  contentHash: string;
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
  catalogRevisions: CatalogRevision[];
  policies: Policy[];
  opinions: Opinion[];
  consents: Consent[];
  signatures: Signature[];
  quoteConsents: QuoteConsent[];
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
  catalogRevisions: [],
  policies: [],
  opinions: [],
  consents: [],
  signatures: [],
  quoteConsents: [],
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
export const catalogBooks = ["미용", "보험", "이벤트"] as const;
export type CatalogBook = (typeof catalogBooks)[number];
export interface CatalogFolder {
  linkTo?: string;
  color?: string;
  id: string;
  parentId: string;
  name: string;
}
export const catalogBook = (catalog: Catalog): CatalogBook =>
  catalog.book || "미용";
export const latestCatalog = (s: State, book: CatalogBook = "미용") =>
  s.catalogs
    .filter((c) => c.status === "published" && catalogBook(c) === book)
    .sort((a, b) =>
      (b.publishedAt || "").localeCompare(a.publishedAt || ""),
    )[0];
export const latestCatalogs = (s: State) =>
  catalogBooks
    .map((book) => latestCatalog(s, book))
    .filter((c): c is Catalog => !!c);
export const consultationKind = (c: Consultation) =>
  c.kind === "interim"
    ? "중간상담"
    : c.kind === "renewal"
      ? "연장상담"
      : "첫 상담";
export const packageActive = (
  c: Pick<Consultation, "cancelled" | "status" | "kind" | "packageProgress">,
) =>
  !c.cancelled &&
  c.status === "P" &&
  c.kind !== "interim" &&
  !c.packageProgress?.complete;
export function permissionLevelOf(
  u: Pick<User, "role" | "permissionLevel">,
): PermissionLevel {
  if (u.permissionLevel !== undefined)
    return permissionLevels.includes(u.permissionLevel)
      ? u.permissionLevel
      : "standard";
  return u.role === "admin" ? "admin" : "standard";
}
const validUserRole = (u: Pick<User, "role">) =>
  u.role === "admin" || jobRoles.includes(u.role);
export const isAdministrator = (
  u: Pick<User, "role" | "permissionLevel" | "active">,
) => u.active && validUserRole(u) && permissionLevelOf(u) === "admin";
export const canUseExecutiveFeatures = (
  u: Pick<User, "role" | "permissionLevel" | "active">,
) =>
  u.active &&
  validUserRole(u) &&
  ["admin", "executive"].includes(permissionLevelOf(u));
export const defaultPermission = (level: PermissionLevel, p: Permission) =>
  level === "admin" ||
  (p !== "stats.read" && (level !== "standard" || p !== "catalog.edit"));
function legacyAllowed(u: User, p: Permission) {
  if (u.role === "admin") return true;
  return (
    u.permissions[p] ??
    (u.role === "doctor"
      ? ["money.read", "note.read", "note.edit", "export"].includes(p)
      : u.role === "coordinator" &&
        [
          "money.read",
          "note.read",
          "note.edit",
          "receipt.create",
          "followup.edit",
          "export",
        ].includes(p))
  );
}
// Normalize on read; keep the encrypted source untouched until an administrator saves.
// Preserve old effective rights and whether cross-owner access was explicitly granted.
// Only differing defaults need overrides; writing a default receipt/followup true
// as an explicit grant would accidentally expand access to other staff's consultations.
export function normalizeUser<T extends User>(u: T): T {
  if (u.permissionLevel !== undefined) return u;
  return {
    ...u,
    permissionLevel: permissionLevelOf(u),
    legacyPermissionDefaults: true,
    permissions: Object.fromEntries(
      permissions.flatMap((p) => {
        const value = legacyAllowed(u, p);
        return u.role !== "admin" &&
          (u.permissions[p] !== undefined ||
            value !== defaultPermission(permissionLevelOf(u), p))
          ? [[p, value]]
          : [];
      }),
    ),
  };
}
export function allowed(u: User, p: Permission) {
  if (!u.active || !validUserRole(u)) return false;
  if (u.permissionLevel === undefined) return legacyAllowed(u, p);
  return u.permissions[p] ?? defaultPermission(permissionLevelOf(u), p);
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
