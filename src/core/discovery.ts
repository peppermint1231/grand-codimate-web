import { eventAvailability, type EventOriginInfo } from "./eventCatalog";
import { eventOptionPrices } from "./eventPrices";
import { withBeautyRootLabels } from "./catalogClassification";
import { z } from "zod";
import { validRequestedSlot } from "./appointments";
import { patientMatches } from "./patientDiscovery";
import {
  latestCatalogs,
  latestCatalog,
  catalogBook,
  type CatalogBook,
  type State,
  type Patient,
} from "./model";
import { concerns as baseConcerns } from "./concerns";
import {
  catalogNodes,
  folderPath,
  productFolder,
  productFolderPaths,
} from "./catalogFolders";
export interface PublicOption {
  event?: ReturnType<typeof eventOptionPrices>;
  id: string;
  label: string;
  unit: string;
  price: number | null;
  tax: string;
}
export interface PublicProduct {
  matches?: { concernId: string; answerIds: string[] }[];
  event?: Pick<
    EventOriginInfo,
    "period" | "regularPrice" | "discountRate" | "salePrice"
  >;
  id: string;
  name: string;
  book: CatalogBook;
  catalogVersion: string;
  folder: { id: string; name: string; color?: string }[];
  folders?: { id: string; name: string; color?: string }[][];
  options: PublicOption[];
}
export interface Inquiry {
  id: string;
  createdAt: string;
  expiresAt: string;
  status: "new" | "converted" | "cancelled";
  rev?: number;
  visitType?: "first" | "returning";
  requests?: string;
  requestedDate?: string;
  requestedTime?: string;
  schedule?: {
    date: string;
    time: string;
    coordinatorId: string;
    confirmed: boolean;
    updatedBy: string;
    updatedAt: string;
  };
  digest: string;
  person: Pick<Patient, "name" | "phone" | "sex" | "dob" | "address">;
  selections: {
    productId: string;
    optionId: string;
    catalogVersion: string;
    book: CatalogBook;
    name: string;
    label: string;
  }[];
  concerns: string[];
  concernLabels?: string[];
  answerLabels?: string[];
  answers: string[];
  consent: {
    personal: true;
    sensitive: true;
    version: "2026-09-21" | "2026-10-06";
    at: string;
  };
  patientId?: string;
  consultationId?: string;
}
export function publicProducts(state: State): PublicProduct[] {
  return latestCatalogs(state)
    .map((c) => withBeautyRootLabels(c, latestCatalog(state, "미용")))
    .flatMap((c) =>
      c.products
        .filter(
          (p) => p.publicVisible && eventAvailability(p.webEvent) === "current",
        )
        .map((p) => ({
          id: p.id,
          name: p.name,
          matches: patientMatches(p, productFolderPaths(c, p)),
          ...(catalogBook(c) === "이벤트" &&
          p.active &&
          p.options.length === 1 &&
          p.options[0].tax !== "unknown" &&
          p.options[0].price !== null
            ? {
                event: {
                  period: p.webEvent?.period || "",
                  ...eventOptionPrices(p, p.options[0]),
                },
              }
            : {}),
          book: catalogBook(c),
          catalogVersion: c.version,
          folder: folderPath(c, productFolder(c, p)).map((f) => ({
            id: f.id,
            name: f.name,
            color: f.color,
          })),
          folders: productFolderPaths(c, p).map((path) =>
            path.map((f) => ({ id: f.id, name: f.name, color: f.color })),
          ),
          options: p.options.map((o) => ({
            ...(catalogBook(c) === "이벤트" &&
            p.active &&
            o.tax !== "unknown" &&
            o.price !== null
              ? { event: eventOptionPrices(p, o) }
              : {}),
            id: o.id,
            label:
              catalogBook(c) === "이벤트" &&
              /^홈페이지\s*가격$/.test(o.label.trim())
                ? "이벤트가"
                : o.label,
            unit: o.unit,
            price:
              catalogBook(c) === "이벤트" && p.active && o.tax !== "unknown"
                ? o.price
                : null,
            tax:
              catalogBook(c) === "이벤트" && p.active && o.tax !== "unknown"
                ? o.tax
                : "unknown",
          })),
        })),
    );
}
export interface PublicCategory {
  id: string;
  folderId: string;
  book: CatalogBook;
  name: string;
  color?: string;
  questions: { id: string; label: string }[];
}
export function publicCategories(state: State): PublicCategory[] {
  return latestCatalogs(state)
    .map((c) => withBeautyRootLabels(c, latestCatalog(state, "미용")))
    .flatMap((c) =>
      catalogNodes(c)
        .filter((f) => !f.parentId)
        .map((f) => ({
          id: catalogBook(c) + ":" + f.id,
          folderId: f.id,
          book: catalogBook(c),
          name: f.name,
          color: f.color,
          questions: [
            ...(baseConcerns.find(
              (x) => x.id === (f.linkTo || f.id) && x.name === f.name,
            )?.questions || []),
          ],
        })),
    );
}
export const inquiryInput = z
  .object({
    visitType: z.enum(["first", "returning"]).optional(),
    requestedDate: z.string().max(10).optional(),
    requestedTime: z.string().max(5).optional(),
    requests: z.string().trim().max(2000).default(""),
    token: z.string().max(2000),
    person: z.object({
      name: z.string().trim().min(1).max(80),
      phone: z
        .string()
        .transform((s) => s.replace(/\D/g, ""))
        .refine((s) => /^\d{9,11}$/.test(s)),
      sex: z.enum(["M", "F", "U"]).default("U"),
      dob: z
        .string()
        .max(10)
        .refine(
          (v) =>
            !v ||
            (/^\d{4}-\d{2}-\d{2}$/.test(v) &&
              !Number.isNaN(Date.parse(v)) &&
              new Date(v).toISOString().slice(0, 10) === v &&
              v <= new Date().toISOString().slice(0, 10)),
          "생년월일을 확인하세요",
        )
        .default(""),
      address: z.string().trim().max(160).default(""),
    }),
    selections: z
      .array(
        z.object({
          productId: z.string().max(100),
          optionId: z.string().max(100),
          catalogVersion: z.string().max(150),
        }),
      )
      .max(30),
    concerns: z.array(z.string().max(140)).max(100),
    answers: z.array(z.string().max(100)).max(50),
    personalConsent: z.literal(true),
    sensitiveConsent: z.literal(true),
  })
  .superRefine((v, ctx) => {
    if (!v.visitType) return; // Compatible with requests from the previous app.
    if (!validRequestedSlot(v.requestedDate || "", v.requestedTime || ""))
      ctx.addIssue({
        code: "custom",
        path: ["requestedTime"],
        message: "상담 가능한 날짜와 시간을 선택해주세요",
      });
    if (v.visitType === "first") {
      if (!v.person.dob)
        ctx.addIssue({
          code: "custom",
          path: ["person", "dob"],
          message: "처음 방문은 생년월일이 필요합니다",
        });
      if (!v.person.address)
        ctx.addIssue({
          code: "custom",
          path: ["person", "address"],
          message: "주소를 동까지 입력해주세요",
        });
    }
  });
