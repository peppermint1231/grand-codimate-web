import { z } from "zod";
export const importedPatientPrefix = "vegas-";
const day = z
  .string()
  .refine(
    (v) =>
      !v ||
      (/^\d{4}-\d{2}-\d{2}$/.test(v) &&
        !Number.isNaN(Date.parse(v)) &&
        new Date(v).toISOString().slice(0, 10) === v &&
        v <= new Date().toISOString().slice(0, 10)),
    "날짜를 확인하세요",
  );
export const addressRegionSchema = z.object({
  sido: z.string().trim().max(30),
  sigungu: z.string().trim().max(50),
  neighborhood: z.string().trim().min(1).max(50),
  basis: z.enum(["search", "source-text", "confirmed-map"]),
});
export const patientImportSchema = z
  .object({
    rows: z
      .array(
        z
          .object({
            id: z.string().regex(/^vegas-[a-f0-9]{32}$/),
            number: z.string().regex(/^V\d{8}$/),
            name: z.string().trim().min(1).max(80),
            sex: z.enum(["M", "F", "U"]),
            dob: day,
            phone: z.string().regex(/^\d{9,11}$/),
            address: z.string().trim().max(160),
            addressRegion: addressRegionSchema.optional(),
            acquisitionSource: z.string().trim().max(80),
            external: z
              .object({
                source: z.literal("vegas"),
                fileHash: z.string().regex(/^[a-f0-9]{64}$/),
                rows: z.array(z.number().int().min(2)).min(1).max(100),
                firstVisit: day,
                lastVisit: day,
                totalPaid: z.number().finite().min(0).nullable(),
                visitCount: z.number().int().min(0).nullable(),
                issues: z.array(z.string().max(100)).max(12),
              })
              .strict(),
          })
          .strict(),
      )
      .min(1)
      .max(250),
  })
  .strict();

/** Admin reconciliation of an existing record; identity and revision are checked in the domain. */
export const patientEnrichmentSchema = z
  .object({
    rows: z
      .array(
        patientImportSchema.shape.rows.element
          .omit({ number: true })
          .extend({
            id: z.string().min(1).max(100),
            expectedRev: z.number().int().min(1),
          })
          .strict(),
      )
      .min(1)
      .max(250),
  })
  .strict();
