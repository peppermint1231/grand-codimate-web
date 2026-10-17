import { z } from "zod";
import type { State } from "./model";
import type { StateChange } from "./stateChanges";
export const deletionScopeSchema = z
  .object({
    profile: z.boolean(),
    consultations: z.boolean(),
    photos: z.boolean(),
    notes: z.boolean(),
    money: z.boolean(),
    documents: z.boolean(),
  })
  .strict();
export type DeletionScope = z.infer<typeof deletionScopeSchema>;
export const noDeletionScope: DeletionScope = {
  profile: false,
  consultations: false,
  photos: false,
  notes: false,
  money: false,
  documents: false,
};
export const deletionScopeLabels: Record<keyof DeletionScope, string> = {
  profile: "환자 기본정보까지 전체 삭제",
  consultations: "상담이력·견적 및 연결자료",
  photos: "상담 사진·주석",
  notes: "환자·상담 메모와 의사 의견",
  money: "수납·환불·VIP·포인트",
  documents: "동의서 서명·발급 문서",
};
export function normalizedDeletionScope(scope: DeletionScope): DeletionScope {
  if (scope.profile)
    return Object.fromEntries(
      Object.keys(scope).map((k) => [k, true]),
    ) as DeletionScope;
  if (scope.consultations)
    return { ...scope, photos: true, money: true, documents: true };
  // PDFs/JPGs can contain photos, notes or financial data, so revoke old exports too.
  return {
    ...scope,
    documents: scope.documents || scope.photos || scope.notes || scope.money,
  };
}
export const deletionItemsSchema = z
  .array(z.object({ id: z.string().min(1), rev: z.number().int().positive() }))
  .min(1)
  .max(30);
export type PatientPurgePlan = {
  patientIds: string[];
  consultationIds: string[];
  scope: DeletionScope;
  protectedMediaIds: string[];
  documentMediaIds?: string[];
  recordIds?: Partial<Record<keyof State, string[]>>;
  snapshots: { path: string; content?: string; consultationId?: string }[];
  inquiryIds: string[];
};
export function purgeChange(
  change: StateChange,
  plan: PatientPurgePlan,
): StateChange {
  const v = change.value as any;
  if (!v) return change;
  const linked = !!plan.recordIds?.[change.section]?.includes(change.id);
  const patient = linked || plan.patientIds.includes(v.patientId || v.id),
    consult = linked || plan.consultationIds.includes(v.consultationId || v.id),
    s = plan.scope;
  let value = v;
  if (change.section === "patients" && plan.patientIds.includes(v.id)) {
    if (s.profile) value = null;
    else if (s.money)
      value = {
        ...v,
        external: v.external ? { ...v.external, totalPaid: 0 } : undefined,
        importSummary: v.importSummary
          ? { ...v.importSummary, totalPaid: 0 }
          : undefined,
      };
  } else if (change.section === "consultations" && (patient || consult)) {
    if (s.consultations) value = null;
    else
      value = {
        ...v,
        ...(s.photos ? { photos: [] } : {}),
        ...(s.notes ? { memo: "" } : {}),
        ...(s.documents ? { documents: [] } : {}),
      };
  } else if (
    (change.section === "notes" && patient && s.notes) ||
    (change.section === "opinions" &&
      consult &&
      (s.notes || s.consultations)) ||
    (["signatures", "quoteConsents"].includes(change.section) &&
      consult &&
      s.documents) ||
    (["ledger", "vipAccounts", "benefitAccounts", "pointEntries"].includes(
      change.section,
    ) &&
      patient &&
      s.money) ||
    (change.section === "events" && patient)
  )
    value = null;
  return value === v ? change : { ...change, value };
}
export function applyPatientPurge(
  state: State,
  plan: PatientPurgePlan,
  now: string,
) {
  for (const section of Object.keys(state) as (keyof State)[]) {
    if (
      [
        "users",
        "catalogs",
        "catalogRevisions",
        "policies",
        "consents",
      ].includes(section)
    )
      continue;
    (state[section] as any[]) = (state[section] as any[]).flatMap((v) => {
      const next = purgeChange({ section, id: v.id, value: v }, plan)
        .value as any;
      if (next === null) return [];
      if (JSON.stringify(next) !== JSON.stringify(v))
        return [{ ...next, rev: v.rev + 1, updatedAt: now }];
      return [v];
    });
  }
}
