/** Clinic-confirmed wording supplied by the user on 2026-09-30. */
export const CONFIRMED_CLINIC_CONTACT = `그랜드아름다운의원 · 대표전화 1899-5109
주소: 강원특별자치도 춘천시 중앙로 68, 4층. 진료시간: 월~금 10:00~20:00(점심시간 13:00~14:00), 토요일 09:00~15:00(점심시간 없음).
일요일·공휴일 미운영, 진료시간 외 상담 미운영.`;

export function fillConfirmedClinicContact(body: string): string {
  return body.replace(
    /\[병원 확인\s*[:：]\s*연락처 및 진료시간 외 대응 방법\s*\]/g,
    CONFIRMED_CLINIC_CONTACT,
  );
}
