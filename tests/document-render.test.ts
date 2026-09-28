import { readFile } from "node:fs/promises";
import { afterEach, expect, it, vi } from "vitest";
import { emptyQuote, type Consultation } from "../src/core/model";
import { catalogAdmin } from "./fixtures/catalogs";
import {
  QUOTE_CONSENT_TEXT,
  QUOTE_CONSENT_VERSION,
  quoteContentHash,
} from "../src/core/quoteConsent";
const consultation: Consultation = {
  id: "test",
  rev: 1,
  updatedAt: "2026-09-28T00:00:00Z",
  ownerId: "admin",
  catalogVersion: "test",
  appointment: "",
  attendance: "미정",
  documents: [],
  category: "미용",
  status: "H",
  cancelled: false,
  createdAt: "2026-09-28T00:00:00Z",
  patientId: "p",
  patient: {
    sex: "F",
    name: "견적검증",
    dob: "1990-01-01",
    phone: "",
    address: "",
  },
  quote: emptyQuote(),
  memo: "",
  photos: [],
};
afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});
it("retries a failed PDF font request in the same session and produces a readable PDF", async () => {
  vi.resetModules();
  const bytes = await readFile("public/fonts/NanumGothic-Regular.ttf");
  const fetch = vi
    .fn()
    .mockResolvedValueOnce(new Response("unavailable", { status: 503 }))
    .mockImplementation(async () => new Response(bytes));
  vi.stubGlobal("fetch", fetch);
  const { consultationPDF } = await import("../src/lib/documents");
  await expect(consultationPDF(consultation, catalogAdmin)).rejects.toThrow(
    "글꼴",
  );
  const pdf = await consultationPDF(consultation, catalogAdmin);
  expect(await pdf.slice(0, 5).text()).toBe("%PDF-");
  expect(pdf.size).toBeGreaterThan(100000);
  expect(fetch).toHaveBeenCalledTimes(2);
});
it.each(["<!DOCTYPE html><html></html>", ""])(
  "rejects an invalid successful font response without caching it",
  async (body) => {
    vi.resetModules();
    const fetch = vi.fn().mockImplementation(async () => new Response(body));
    vi.stubGlobal("fetch", fetch);
    const { consultationPDF } = await import("../src/lib/documents");
    await expect(consultationPDF(consultation, catalogAdmin)).rejects.toThrow(
      "글꼴 파일",
    );
    await expect(consultationPDF(consultation, catalogAdmin)).rejects.toThrow(
      "글꼴 파일",
    );
    expect(fetch).toHaveBeenCalledTimes(2);
  },
);
it("does not silently generate a patient JPG when the Korean export font is missing", async () => {
  const consent = {
    id: "consent",
    consultationId: "test",
    version: QUOTE_CONSENT_VERSION,
    text: QUOTE_CONSENT_TEXT,
    contentHash: await quoteContentHash(consultation),
  } as any;
  const load = vi.fn().mockResolvedValue([]);
  vi.stubGlobal("document", { fonts: { load, ready: Promise.resolve() } });
  const { quoteJPG } = await import("../src/lib/documents");
  await expect(quoteJPG(consultation, consent)).rejects.toThrow("한글 글꼴");
  expect(load).toHaveBeenCalledTimes(2);
});
