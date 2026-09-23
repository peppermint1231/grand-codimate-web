import type { Consultation, QuoteConsent } from "./model";
export const QUOTE_CONSENT_VERSION = "2026-09-23-v1";
export const QUOTE_CONSENT_TEXT =
  "이 견적서는 환자 본인의 상담과 시술 선택을 위한 개별 안내 자료입니다. 환자 정보, 시술 구성과 할인 조건이 포함되어 있으므로 병원의 사전 동의 없이 온라인 게시, 제3자 전달 또는 재배포하지 않겠습니다. 본인이 보관하는 파일과 다운로드 링크도 주의하여 관리하겠습니다.";
export const QUOTE_SHARE_DAYS = 7;
export function quoteConsentContent(c: Consultation) {
  return JSON.stringify({
    consultationId: c.id,
    patient: { id: c.patientId, name: c.patient.name },
    category: c.category,
    quote: c.quote,
    version: QUOTE_CONSENT_VERSION,
    text: QUOTE_CONSENT_TEXT,
  });
}
export async function quoteContentHash(c: Consultation) {
  const bytes = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(quoteConsentContent(c)),
  );
  return Array.from(new Uint8Array(bytes), (b) =>
    b.toString(16).padStart(2, "0"),
  ).join("");
}
export async function validQuoteConsent(
  c: Consultation,
  consent?: QuoteConsent,
) {
  return (
    !!consent &&
    !c.cancelled &&
    consent.consultationId === c.id &&
    consent.version === QUOTE_CONSENT_VERSION &&
    consent.text === QUOTE_CONSENT_TEXT &&
    consent.contentHash === (await quoteContentHash(c))
  );
}
