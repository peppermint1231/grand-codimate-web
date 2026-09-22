import { eventAvailability, type EventOriginInfo } from "./eventCatalog";
import { withBeautyRootLabels } from "./catalogClassification";
import { z } from "zod";
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
  id: string;
  label: string;
  unit: string;
  price: number | null;
  tax: string;
}
export interface PublicProduct {
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
  status: "new" | "converted";
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
    version: "2026-09-21";
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
          ...(p.webEvent &&
          p.active &&
          p.options.length === 1 &&
          !p.options[0].review &&
          p.options[0].tax !== "unknown" &&
          p.options[0].price === p.webEvent.salePrice
            ? {
                event: {
                  period: p.webEvent.period,
                  regularPrice: p.webEvent.regularPrice,
                  discountRate: p.webEvent.discountRate,
                  salePrice: p.webEvent.salePrice,
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
            id: o.id,
            label: o.label,
            unit: o.unit,
            price:
              p.active && !o.review && o.tax !== "unknown" ? o.price : null,
            tax:
              p.active && !o.review && o.tax !== "unknown" ? o.tax : "unknown",
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
export const inquiryInput = z.object({
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
});
