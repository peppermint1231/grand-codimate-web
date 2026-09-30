import { DETAIL_REVIEW_TOPIC } from "./consentDetailedPrecautions";
import { precautionFor, PRECAUTION_REVIEW_TOPIC } from "./consentPrecautions";
import { CONFIRMED_CLINIC_CONTACT } from "./clinicContact";
import { treatmentConsentDrafts } from "./treatmentConsents";

export type ConsentReviewGuide = {
  kind: "contact" | "procedure" | "contract" | "custom";
  confirmed?: boolean;
  reference?: string;
  instruction: string;
  example: string;
};
// Writing aids only. Never insert these into stored consent text automatically.
// Unconfirmed values keep the existing review marker, including after manual copying.
const fill = (label: string) => `[병원 확인: ${label}]`;
const procedureExamples: Record<string, string> = {
  toxin: `사용 제품은 ${fill("제품명·국내 허가 부위")}입니다. 이번 시술 부위와 부위별 용량은 ${fill("부위·용량")}이며 진료기록에 남깁니다. 재시술 간격은 ${fill("개인별 간격과 판단 기준")}입니다. 제품마다 단위가 달라 다른 독소 제품의 용량을 그대로 적용하지 않습니다.`,
  "ha-filler": `사용 제품·성분은 ${fill("제품명·성분")}, 국내 허가 부위와 이번 시술 부위는 ${fill("허가 부위·시술 부위")}입니다. 혈관 합병증이 의심되면 ${fill("병원의 즉시 진료·전원 연락 방법")}으로 대응합니다. 용해제 사용 가능 여부·한계·알레르기 위험은 ${fill("제품에 맞춘 설명")}입니다.`,
  "skin-injection": `이번에 사용하는 제제는 ${fill("제품별 성분·국내 허가 용도·투여 경로")}입니다. 제품별 결절·혈관 위험과 이상 반응 대처는 ${fill("제품별 위험과 연락 방법")}입니다. 제거 또는 용해 가능 여부는 ${fill("제제별 가능 여부와 한계")}로 설명합니다.`,
  "pigment-laser": `진단은 ${fill("병변 종류")}이며 ${fill("장비명·적응증")}으로 치료합니다. 다음 치료는 ${fill("피부 반응에 따른 간격과 재평가 방법")}에 결정합니다. 눈 보호 방법은 ${fill("장비·부위별 보호 방법")}, 병변별 상처 관리는 ${fill("세안·드레싱·외용제 안내")}입니다.`,
  "lesion-removal": `병변은 ${fill("진단·조직검사 필요 여부")}로 평가했습니다. 제거 방식과 마취는 ${fill("방법·마취 약제/방식")}입니다. 깊이·부위에 따른 재발 가능성과 추가 치료 계획은 ${fill("설명 내용")}이며, 상처 관리와 재내원 기준은 ${fill("교환·세안·재내원 안내")}입니다.`,
  fractional: `흉터 유형은 ${fill("유형")}이며, ${fill("박피성/비박피성 구분·레이저 종류")}을 사용합니다. 예상 회복과 생활 복귀 기준은 ${fill("환자·강도별 안내")}입니다. 예방 처방 필요 여부와 사후 관리는 ${fill("처방 여부·이유·관리 방법")}로 안내합니다.`,
  "hair-removal": `제모 부위는 ${fill("부위")}이며 피부·모발 상태에 맞춰 ${fill("장비명")}을 사용합니다. 면도·왁싱 등 준비 방법은 ${fill("실제 준비 지침")}입니다. 다음 시술은 ${fill("부위·피부 반응에 따른 일정")}에 평가하고, 샤워·태닝 등 생활 지침은 ${fill("개별 안내")}입니다.`,
  "vascular-acne-light": `진단은 ${fill("홍조/여드름 등 진단")}이며 사용 장비와 도포물질은 ${fill("장비·성분 또는 도포 없음")}입니다. 적용 방식은 ${fill("PTT/PDT/그 외 방식의 정확한 구분")}입니다. 광과민 여부와 차광·생활 지침은 ${fill("물질·방식별 안내")}입니다.`,
  "rf-microneedle": `장비·니들·고주파 모드와 팁은 ${fill("제품·모드·팁")}이며 국내 허가 목적은 ${fill("허가 목적")}입니다. 깊이와 제외 부위는 ${fill("부위별 계획·금기")}로 정합니다. 병용 약물이 있다면 ${fill("약물명·허가 경로·사용 근거와 추가 위험")}을 별도로 설명합니다.`,
  hifu: `사용 장비와 팁·깊이는 ${fill("국내 장비명·팁·깊이")}입니다. 사용설명서에 따른 시술 가능·제외 부위는 ${fill("해당 부위")}이며, 신경과 눈 주변을 보호하는 방법은 ${fill("병원 시술 기준")}입니다. 환자별 계획과 시행 내용은 진료기록에 남깁니다.`,
  "rf-lifting": `사용 장비·모드와 국내 허가 목적은 ${fill("장비명·모드·목적")}입니다. 흡입·냉각 사용 여부는 ${fill("실제 방식")}이며 시술 부위는 ${fill("부위")}입니다. 삽입물 등 사용 금기 확인과 제외 부위는 ${fill("제품 설명서 및 환자별 확인 내용")}로 안내합니다.`,
  threads: `사용 실은 ${fill("제품명·재질·수량")}이며 부위와 마취 방식은 ${fill("부위·마취")}입니다. 해당 부위의 신경·혈관 등 위험은 ${fill("부위별 설명")}입니다. 실 노출·이동 등 이상이 생겼을 때 진료·제거 가능 여부와 대응은 ${fill("병원 대응과 연락 방법")}입니다.`,
  peeling: `필링 제품·성분·농도와 목표 깊이는 ${fill("제품·성분·농도·깊이")}입니다. 시행하지 않아야 하는 상태는 ${fill("제품별 금기와 환자 확인 결과")}입니다. 예상 회복, 세안·화장·외용제 사용과 재내원 기준은 ${fill("깊이·반응별 안내")}입니다.`,
  subcision: `시술 방식은 ${fill("바늘/기구/가스 등 실제 방법")}이며 마취와 병용 제제는 ${fill("마취·제품 또는 병용 없음")}입니다. 기기·제품의 허가 목적과 이번 사용의 차이는 ${fill("허가 및 사용 근거")}로 설명합니다. 추가 위험과 이상 반응 대응은 ${fill("방식별 안내")}입니다.`,
  "fat-injection": `주입하는 성분과 혼합 여부는 ${fill("제품·모든 성분·혼합 여부")}입니다. 국내 허가 부위·경로와 실제 사용 부위·경로는 ${fill("각각의 내용")}입니다. 허가 외 사용이 있으면 ${fill("그 이유·근거·대안·부위별 추가 위험")}을 별도로 설명합니다.`,
  "iv-injection": `투여 약물·성분·목적·경로는 ${fill("약물별 내용")}입니다. 질환·복용약을 확인한 결과 금기·상호작용과 필요한 검사는 ${fill("확인 결과·검사 계획")}입니다. 투여 중 이상이 발생하면 ${fill("관찰·즉시 진료·응급 대응 체계")}로 대응합니다.`,
  repot: `대상 병변의 진단과 리팟 장비·방식은 ${fill("진단·장비·방식")}입니다. 드레싱 제품·교환 시점·세안 방법은 ${fill("상처 상태에 따른 지침")}입니다. 접착제 발진·진물 또는 드레싱 이탈 시 ${fill("연락·진료·교환 방법")}을 따르며, 재진 일정과 이후 색 변화 관리는 ${fill("재진·관리 계획")}입니다.`,
  juvegen: `이번 쥬브젠 시술의 실제 방식과 사용하는 기체·주입물은 ${fill("방법·제품명·성분·경로")}입니다. 허가 범위와 사용 근거는 ${fill("제품별 확인 내용")}이며 마취는 ${fill("마취 방식")}입니다. 재료별 결절·혈관 등 추가 위험과 대응, 리터치 조건·비용은 ${fill("환자에게 설명할 구체적 내용")}입니다.`,
  "eye-bag": `아이백이라는 상품명으로 시행하는 실제 시술은 ${fill("정확한 시술명·부위·방법")}입니다. 제품/기구·마취와 안구 보호는 ${fill("시술별 계획")}입니다. 시력 이상 등 발생 시 대응·전원 연락은 ${fill("실제 대응 체계")}입니다. 함께 설명하고 서명받을 양식은 ${fill("해당 시술의 별도 양식명")}입니다.`,
  scalp: `탈모 진단과 선택한 치료는 ${fill("진단·치료 방식")}입니다. 약물/기구·경로·허가 여부와 근거는 ${fill("제품별 확인 내용")}입니다. 추적 사진 촬영 목적과 치료 간격은 ${fill("기록·재평가 계획")}이며 샴푸·염색 등 생활 지침은 ${fill("치료 방식별 안내")}입니다.`,
  isotretinoin: `처방 제품과 최신 국내 허가사항·임신예방프로그램을 확인했습니다. 피임 방법과 치료 전·중·후 임신 검사 계획은 ${fill("환자별 방법·검사 시점")}입니다. 간 기능·지질 검사와 병용약 확인 계획은 ${fill("검사·상호작용 확인")}입니다. 수유 여부, 복용 중단 및 연락 기준은 ${fill("제품 허가사항과 담당의사 지침")}으로 설명합니다.`,
};

export function consentReviewGuide(
  draftKey: string | undefined,
  marker: string,
): ConsentReviewGuide {
  const topic = marker
    .replace(/^\[병원 확인\s*[:：]\s*/, "")
    .replace(/\]$/, "")
    .trim();
  if (topic === DETAIL_REVIEW_TOPIC)
    return {
      kind: "procedure",
      instruction:
        "기간·횟수·세안/운동·회복 경과 등 구체적인 문장은 이미 본문에 들어 있습니다. 실제 시술에 맞지 않는 항목만 수정하고 확정한 기준을 적으세요. 숫자를 모두 삭제하거나 포괄적인 개별 안내 문구로 바꾸지 않아도 됩니다.",
      example:
        "본문의 적용 범위와 기간을 검토했습니다. 조정한 항목: [병원 확인: 변경한 항목·최종 기간·예외 또는 조정 없음]. 기존 병원 안내와 다른 부분은 함께 정리했습니다.",
    };
  if (/^(리팟 드레싱|밴드 이탈|복용 전 1개월|기미 연고)/.test(topic))
    return {
      kind: "procedure",
      instruction:
        "해당 항목의 구체적 기준은 본문에 보존했습니다. 제품 지침·진료 절차와 맞춰 적용 조건과 예외를 채우세요.",
      example: `${topic}: ${fill("확인한 제품/절차·적용 조건·제한 및 예외·이상 시 대응")}`,
    };
  const precaution = precautionFor(draftKey);
  if (topic === PRECAUTION_REVIEW_TOPIC && precaution) {
    return {
      kind: "procedure",
      instruction:
        "추가된 행동 안내를 실제 시술·제품에 맞게 검토하고 아래 항목별 기간과 예외를 적으세요. 원문 참고값은 확정된 환자 지침이 아닙니다.",
      reference: precaution.reference,
      example: `${precaution.fields}: ${fill("항목별 허용/제한 기간·예외·예상 경과·재내원 기준")}
해당하지 않는 제한은 적용하지 않음을 명시하고, 기존 본문과 다른 지침이 있다면 함께 정리합니다.`,
    };
  }
  if (
    /^(연락처 및 진료시간 외 대응 방법|문의 연락처|해지\/정산 문의 방법)$/.test(
      topic,
    )
  ) {
    return {
      kind: "contact",
      confirmed: topic === "연락처 및 진료시간 외 대응 방법",
      instruction:
        topic === "연락처 및 진료시간 외 대응 방법"
          ? "병원에서 확정한 안내입니다. 이 연락처·운영시간 항목은 추가 검토 없이 아래 문구로 작성합니다."
          : "병원에서 확정한 연락처·운영시간입니다. 계약 접수 절차·처리기한은 별도로 확인합니다.",
      example:
        topic === "연락처 및 진료시간 외 대응 방법"
          ? CONFIRMED_CLINIC_CONTACT
          : `${CONFIRMED_CLINIC_CONTACT}
계약·해지·정산은 대표전화로 문의 후 ${fill("담당 부서·정식 신청 방법")}으로 접수해주세요. 계약 문의 접수 가능 시간은 ${fill("실제 접수 요일·시간")}이며, 신청에 필요한 정보와 처리 일정은 ${fill("필요 정보·회신/처리 기한")}입니다.`,
    };
  }
  if (draftKey === "doctor-plan" || draftKey === "membership") {
    const contract = (
      instruction: string,
      example: string,
    ): ConsentReviewGuide => ({ kind: "contract", instruction, example });
    if (/환급|정산·공제/.test(topic))
      return contract(
        "적용 법령·분쟁해결기준을 검토한 실제 정산 방식, 공제 근거, 신청 방법과 처리 기한을 적으세요. 임의의 공제율이나 환불 불가 문구를 넣지 마세요.",
        `해지 신청은 ${fill("접수 방법")}으로 받습니다. 실결제액·사용 내역·혜택 사용액을 구분해 정산서를 제공합니다. 환급액 산식은 ${fill("검토한 산식과 항목별 공제 근거")}이며 처리 기한은 ${fill("검토된 기한")}입니다.`,
      );
    if (/차감|사용 순서/.test(topic))
      return contract(
        "실결제한 금액과 추가 혜택을 어느 순서·비율로 차감하는지, 어디서 잔액을 확인하는지 적으세요.",
        `사용 시 ${fill("유상 금액·혜택 금액의 차감 순서 또는 비율")}로 차감합니다. 사용 후 두 종류의 잔액을 구분해 ${fill("영수증·문자 등 실제 확인 방법")}으로 안내합니다.`,
      );
    if (/보험|중복 할인/.test(topic))
      return contract(
        "적용되는 시술·제외 항목과 보험 진료·이벤트·중복 할인 조건을 각각 적으세요.",
        `이용 가능한 항목은 ${fill("시술/관리 목록")}이며 제외 항목은 ${fill("제외 목록 또는 없음")}입니다. 보험 진료 적용 여부는 ${fill("적용 여부·범위")}이고 이벤트·중복 할인은 ${fill("실제 중복 적용 기준")}에 따릅니다.`,
      );
    if (/기간|실제 계약 기준/.test(topic))
      return contract(
        "언제부터 언제까지인지와 일시 중지·연장·기간 만료 후 처리 방법을 적으세요. 날짜만 적고 잔액 처리 기준을 생략하지 마세요.",
        `이용기간은 ${fill("시작일 또는 시작 기준")}부터 ${fill("종료일 또는 기간")}까지입니다. 일시 중지·연장 신청은 ${fill("사유·신청 방법·연장 기준")}에 따르며, 만료 시 미사용분은 ${fill("검토된 처리·정산 기준")}으로 안내합니다.`,
      );
    if (/범위와 예외/.test(topic))
      return contract(
        "본인만 이용하는지, 가족 등에게 양도할 수 있는지, 예외가 있다면 승인 절차와 범위를 적으세요.",
        `이용자는 ${fill("본인 또는 허용 대상")}입니다. 양도·대리 사용 가능 여부는 ${fill("허용 여부와 범위")}이며 예외 신청 시 ${fill("확인 서류·승인 절차 또는 예외 없음")}을 적용합니다.`,
      );
  }
  const source = treatmentConsentDrafts.find((t) => t.key === draftKey);
  if (source && topic === source.review && procedureExamples[source.key])
    return {
      kind: "procedure",
      instruction: `의료진이 ${source.review}을 확인하고 환자에게 설명할 문장으로 적으세요. 용량·간격·기기 설정은 실제 제품 허가사항과 환자별 진료 판단에 맞춰 작성합니다.`,
      example: procedureExamples[source.key],
    };
  return {
    kind: "custom",
    instruction:
      "이 항목을 확인할 담당자와 실제 병원 기준을 정한 뒤, 환자가 무엇을 해야 하는지 구체적으로 적으세요. 해당하지 않으면 이유를 적습니다.",
    example: `확인할 내용은 ‘${topic}’입니다. 우리 병원의 적용 기준은 ${fill("확인된 기준")}이며 환자에게는 ${fill("실제 안내할 문장")}으로 설명합니다.`,
  };
}
