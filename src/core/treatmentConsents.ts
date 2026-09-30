import type { Consent } from "./model";

export const CONSENT_DRAFT_REVISION = "2026-09-30";
export const consentSources = {
  toxin: {
    title: "AAD · 보툴리눔 독소 시술",
    url: "https://www.aad.org/public/cosmetic/wrinkles/botulinum-toxin-faqs",
  },
  filler: {
    title: "FDA · 필러의 위험과 주의사항",
    url: "https://www.fda.gov/medical-devices/aesthetic-cosmetic-devices/dermal-fillers-soft-tissue-fillers",
  },
  laser: {
    title: "AAD · 흉터 레이저 치료 전 확인사항",
    url: "https://www.aad.org/public/cosmetic/scars-stretch-marks/laser-treatment-scar",
  },
  hair: {
    title: "AAD · 레이저 제모",
    url: "https://www.aad.org/public/cosmetic/hair-removal/laser-hair-removal-faqs",
  },
  peel: {
    title: "AAD · 화학적 필링",
    url: "https://www.aad.org/public/cosmetic/younger-looking/chemical-peels-faqs",
  },
  needle: {
    title: "FDA · 마이크로니들링",
    url: "https://www.fda.gov/medical-devices/aesthetic-cosmetic-devices/microneedling-devices",
  },
  rf: {
    title: "FDA · 고주파 마이크로니들링 안전성 안내",
    url: "https://www.fda.gov/medical-devices/safety-communications/potential-risks-certain-uses-radiofrequency-rf-microneedling-fda-safety-communication",
  },
  energy: {
    title: "FDA · 비침습 체형 시술",
    url: "https://www.fda.gov/medical-devices/aesthetic-cosmetic-devices/non-invasive-body-contouring-technologies",
  },
  ultrasound: {
    title: "FDA · 집속초음파 장비 자료 (개별 제품 자료)",
    url: "https://www.accessdata.fda.gov/cdrh_docs/pdf23/K233996.pdf",
  },
  thread: {
    title: "ASPS · 실리프팅",
    url: "https://www.plasticsurgery.org/cosmetic-procedures/thread-lift",
  },
  fat: {
    title: "FDA · 지방분해 주사의 승인 외 사용 위험 안내 (2026)",
    url: "https://www.fda.gov/drugs/drug-safety-communications/fda-approves-additional-information-labeling-kybella-deoxycholic-acid-injection-warning-adverse",
  },
  acne: {
    title: "AAD · 여드름 레이저·광 치료",
    url: "https://www.aad.org/public/diseases/acne/derm-treat/lasers-lights",
  },
  scar: {
    title: "AAD · 여드름 흉터 치료",
    url: "https://www.aad.org/public/diseases/acne/derm-treat/scars/treatment",
  },
  iv: {
    title: "NHS · 정맥 치료 합병증",
    url: "https://learninghub.nhs.uk/Resource/73305",
  },
} as const;
type SourceKey = keyof typeof consentSources;
type DraftSpec = {
  key: string;
  name: string;
  examples: string;
  purpose: string;
  risks: string;
  before: string;
  after: string;
  alternatives: string;
  review: string;
  sources: SourceKey[];
};
// Broad procedure families, not a claim that one consent covers all products in a package.
const specs: DraftSpec[] = [
  {
    key: "toxin",
    name: "보툴리눔 독소 주사",
    examples: "주름·턱·스킨·바디 보톡스, 다한증",
    purpose:
      "선택한 근육 또는 땀샘 부위에 약물을 주입하여 주름, 근육의 부피 또는 발한을 줄이는 것을 목표로 합니다. 효과의 정도와 유지기간은 개인과 부위에 따라 다릅니다.",
    risks:
      "주사 부위 통증·붓기·멍, 두통, 비대칭, 인접 근육의 약화나 눈꺼풀 처짐 등이 생길 수 있습니다. 드물게 전신 근력저하, 말하기·삼키기·호흡의 어려움 등 심각한 증상이 나타날 수 있습니다.",
    before:
      "신경근육 질환, 삼킴·호흡 장애, 이전 독소 주사 제품과 시기, 약물 알레르기 및 복용약을 알립니다.",
    after:
      "시술 부위를 강하게 누르거나 문지르지 말고 병원이 안내한 생활수칙을 따릅니다. 삼키기·말하기·호흡의 어려움이나 전신 근력저하는 즉시 응급 진료를 받습니다.",
    alternatives:
      "치료하지 않고 경과 관찰, 목적에 맞는 피부 관리·약물·다른 시술을 상담할 수 있습니다.",
    review:
      "제품명·국내 허가 부위·개인별 부위와 용량·재시술 간격·독소 제품 간 단위 차이",
    sources: ["toxin"],
  },
  {
    key: "ha-filler",
    name: "히알루론산 필러",
    examples: "입술·입꼬리·턱끝 등 HA 필러",
    purpose:
      "히알루론산 제제를 주입하여 선택한 부위의 볼륨 또는 윤곽을 보완합니다. 비히알루론산 제제에는 이 양식을 그대로 사용하지 않습니다.",
    risks:
      "붓기·멍·통증, 비대칭·울퉁불퉁함, 결절·염증·감염 및 지연성 반응이 생길 수 있습니다. 혈관이 막히면 피부 괴사, 시력 손상·실명 또는 뇌졸중 등 심각한 합병증이 발생할 수 있습니다. 추가 처치가 필요할 수 있습니다.",
    before:
      "이전 필러·실·수술의 종류와 부위, 알레르기, 감염이나 치과 치료 계획을 알립니다. 해당 제품이 실제로 히알루론산인지 확인합니다.",
    after:
      "갑작스러운 심한 통증, 창백하거나 얼룩진 피부, 시야 변화, 마비 등은 즉시 병원에 알리고 응급 진료를 받습니다. 히알루로니다제 사용 여부·한계 및 그 자체의 알레르기 위험은 의료진이 설명합니다.",
    alternatives:
      "시술하지 않기, 다른 윤곽·볼륨 교정 방법을 상담할 수 있습니다.",
    review: "제품·성분·허가 부위·혈관 합병증 대응과 전원 연락체계·용해제 설명",
    sources: ["filler"],
  },
  {
    key: "skin-injection",
    name: "스킨부스터·콜라겐 자극 주사",
    examples: "리쥬란, 쥬베룩, 울트라콜, 물광 등",
    purpose:
      "선택한 제품을 피부 또는 피하에 주입하여 피부 상태나 볼륨 개선을 목표로 합니다. 제품마다 성분·작용·허가 목적이 달라, 상품명만으로 동일한 효과나 안전성을 보장하지 않습니다.",
    risks:
      "통증·붓기·멍, 주사 자국·구진, 결절·염증·감염·알레르기, 비대칭 또는 지연성 반응이 생길 수 있습니다. 주입 물질과 부위에 따라 혈관 손상·폐색과 조직 손상 위험을 별도로 설명받습니다. 모든 제제가 용해제로 제거되는 것은 아닙니다.",
    before:
      "제품 성분에 대한 알레르기, 과거 주입 시술, 피부 감염, 면역 관련 질환과 치료를 알립니다.",
    after:
      "심한 통증이나 피부색 변화·시야 변화는 즉시 진료를 받습니다. 붓기·열감·결절이 지속되거나 악화되면 병원에 연락합니다.",
    alternatives:
      "시술하지 않기, 국소 피부 관리 또는 다른 피부 재생·볼륨 시술을 상담할 수 있습니다.",
    review:
      "제품별 성분·국내 허가 용도·투여 경로·결절 및 혈관 위험·제거 가능 여부를 각각 보완",
    sources: ["filler", "needle"],
  },
  {
    key: "pigment-laser",
    name: "색소·토닝·흑자 레이저",
    examples: "피코토닝, 레이저토닝, 리팟 흑자 치료",
    purpose:
      "병변의 진단 후 선택한 레이저로 색소 병변의 개선을 목표로 합니다. 병변 종류에 따라 반복 치료가 필요하거나 재발할 수 있으며 완전 제거를 보장하지 않습니다.",
    risks:
      "따가움·붉어짐·붓기, 물집·딱지·화상, 색소침착 또는 저색소침착, 흉터·감염이 생길 수 있습니다. 기미 등 일부 색소는 악화되거나 재발할 수 있습니다.",
    before:
      "최근 태닝·일광 노출, 광과민·흉터 체질, 복용약·피부염과 이전 레이저 반응을 알립니다. 모양이나 색이 변하는 병변은 먼저 진단받습니다.",
    after:
      "보호안경 등 눈 보호 지침을 따르고, 시술 후 자외선 차단과 지정한 상처 관리를 시행합니다. 딱지를 억지로 떼지 않으며 물집·악화되는 통증은 연락합니다.",
    alternatives:
      "경과 관찰, 자외선 차단·외용 치료, 다른 장비 또는 치료 방법을 상담할 수 있습니다.",
    review: "병변 진단·장비별 적응증·치료 간격·병변별 상처 관리·눈 보호",
    sources: ["laser", "hair"],
  },
  {
    key: "lesion-removal",
    name: "점·양성 피부병변 제거",
    examples: "점, 쥐젖 등 병변별 제거",
    purpose:
      "의사가 양성 여부를 평가한 피부병변을 레이저 등으로 제거합니다. 진단이 불명확한 병변은 조직검사 등 다른 평가가 먼저 필요할 수 있습니다.",
    risks:
      "통증·출혈·감염, 함몰 또는 돌출 흉터, 색 변화, 잔여 병변·재발이 생길 수 있으며 추가 치료가 필요할 수 있습니다.",
    before:
      "병변이 빠르게 자라거나 피가 나는 등의 변화, 흉터 체질, 출혈 위험 약물, 이전 제거 이력을 알립니다.",
    after:
      "안내받은 세척·드레싱·연고 사용과 자외선 차단을 따릅니다. 출혈이 멎지 않거나 붉어짐·고름·통증이 악화되면 진료를 받습니다.",
    alternatives:
      "경과 관찰, 조직검사·절제 등 진단과 병변에 맞는 방법을 상담할 수 있습니다.",
    review: "진단 및 조직검사 필요 여부·제거 방식·마취·재발 및 상처 관리 기준",
    sources: ["laser"],
  },
  {
    key: "fractional",
    name: "프락셔널·흉터 레이저",
    examples: "피코프락셀, 모공·여드름 흉터 레이저",
    purpose:
      "피부의 미세한 부위에 레이저 에너지를 전달하여 흉터·모공·피부결 개선을 목표로 합니다. 기존 흉터가 완전히 없어지지 않을 수 있습니다.",
    risks:
      "통증·붉어짐·부종·진물·딱지, 화상·감염, 색소 변화·새 흉터, 헤르페스 재활성화가 생길 수 있습니다.",
    before:
      "헤르페스, 켈로이드·색소침착 이력, 최근 약물·시술, 피부 감염을 알립니다.",
    after:
      "병원에서 정한 세안·화장·보습·드레싱과 자외선 차단 지침을 따릅니다. 악화되는 통증·수포·고름·발열이 있으면 연락합니다.",
    alternatives:
      "경과 관찰, 서브시전·약물·필링 등 흉터 유형에 맞는 방법을 상담할 수 있습니다.",
    review: "박피성 여부·레이저 종류·회복기간·예방 처방 필요성·흉터 유형",
    sources: ["laser", "scar"],
  },
  {
    key: "hair-removal",
    name: "레이저 제모",
    examples: "얼굴·겨드랑이·인중·다리 등 제모",
    purpose:
      "모낭에 레이저 에너지를 전달하여 털을 줄이는 것을 목표로 합니다. 모발의 색·굵기·호르몬 등에 따라 반응과 반복 횟수가 다르고 재성장할 수 있습니다.",
    risks:
      "붉어짐·부종·통증, 물집·화상·감염, 색소 변화·흉터가 생길 수 있습니다.",
    before:
      "태닝·광과민·복용약과 피부 질환을 알리고, 면도·왁싱 등 제모 준비 방법을 안내받습니다.",
    after:
      "시술 중 눈 보호 지침을 따릅니다. 냉각·자외선 차단 등 안내를 따르고 물집이나 악화되는 통증은 병원에 알립니다.",
    alternatives: "면도·다른 제모법 또는 치료하지 않기를 선택할 수 있습니다.",
    review: "피부·모발 타입·장비·시술 부위·준비와 재시술 일정",
    sources: ["hair"],
  },
  {
    key: "vascular-acne-light",
    name: "홍조·여드름 레이저·광 치료",
    examples: "V레이저, 제네시스, 피지선 레이저·PTT",
    purpose:
      "선택한 레이저·광 또는 광열 방식으로 홍조·혈관 또는 여드름의 개선을 목표로 합니다. 같은 상품군 안에서도 치료 방식과 사용 물질이 다릅니다.",
    risks:
      "따가움·통증·홍반·부종, 멍·물집·화상·딱지, 색소 변화·흉터가 생길 수 있습니다. 사용 물질에 따른 자극·알레르기와 광과민 위험을 추가 설명받습니다.",
    before: "광과민, 피부 감염, 복용약, 최근 태닝과 이전 시술 반응을 알립니다.",
    after:
      "치료 방식에 맞는 빛 노출 제한·자외선 차단·피부 관리를 안내받고, 물집·심한 통증·악화되는 피부 증상은 연락합니다.",
    alternatives:
      "경과 관찰, 여드름·홍조의 외용약이나 내복약 등 다른 치료를 상담할 수 있습니다.",
    review: "홍조/여드름별 진단·장비·도포물질·PTT/PDT 구별·물질별 광과민 지침",
    sources: ["acne"],
  },
  {
    key: "rf-microneedle",
    name: "마이크로니들·고주파 니들",
    examples: "포텐자 등 고주파 니들 시술",
    purpose:
      "미세침과, 해당 장비에 따라 고주파 에너지를 이용하여 피부 상태 개선을 목표로 합니다. 약물 주입을 병행하는 경우 별도 설명과 동의가 필요합니다.",
    risks:
      "통증·출혈·붉어짐·붓기, 감염·색소 변화·흉터가 생길 수 있습니다. 고주파를 사용하는 경우 화상·지방 소실·신경 손상 등 심각한 합병증도 보고되어 있습니다.",
    before:
      "켈로이드, 감염·헤르페스, 출혈 위험 약물, 삽입형 전자장치·금속 등을 알립니다.",
    after:
      "일회용 팁과 피부 관리 지침을 확인하고 심한 통증·화상·감각 이상 또는 감염 증상이 있으면 진료를 받습니다.",
    alternatives:
      "시술하지 않기, 다른 레이저·피부 관리·흉터 치료를 상담할 수 있습니다.",
    review: "니들·고주파 모드·국내 허가 목적·병용 약물 허가·팁·깊이·금기",
    sources: ["needle", "rf"],
  },
  {
    key: "hifu",
    name: "집속초음파 리프팅",
    examples: "슈링크, 리프테라 등",
    purpose:
      "선택한 깊이에 집속초음파 에너지를 전달하여 처짐·탄력 개선을 목표로 합니다. 결과와 유지기간에는 개인차가 있습니다.",
    risks:
      "통증·붉어짐·부종·멍, 화상, 감각 변화·일시적 근력 저하, 원치 않는 윤곽 변화 등이 생길 수 있습니다. 부위와 장비에 따른 위험을 추가 설명받습니다.",
    before:
      "치료 부위의 감염·상처, 임플란트·삽입물, 과거 수술·필러·실 시술과 신경 증상을 알립니다.",
    after:
      "병원에서 안내한 관리를 따르고 지속되는 감각 저하·비대칭·근력 저하 또는 화상은 즉시 연락합니다.",
    alternatives:
      "시술하지 않기, 다른 탄력 시술 또는 수술적 방법을 상담할 수 있습니다.",
    review:
      "해당 국내 장비의 사용설명서·팁/깊이·시술 가능 부위·신경 및 눈 주변 보호",
    sources: ["ultrasound", "energy"],
  },
  {
    key: "rf-lifting",
    name: "비침습 고주파·흡입 리프팅",
    examples: "볼뉴머, 인모드 FX 등",
    purpose:
      "고주파 열에너지와 장비에 따라 흡입 등을 이용하여 탄력 또는 윤곽 개선을 목표로 합니다. 체중 감량 치료를 대신하지 않습니다.",
    risks:
      "통증·붉어짐·붓기·멍, 물집·화상·색소 변화·흉터, 감각 이상 또는 원치 않는 윤곽 변화가 생길 수 있습니다.",
    before:
      "심박조율기 등 삽입형 전자장치, 금속 삽입물, 감각 저하, 치료 부위의 상처와 이전 시술을 알립니다.",
    after:
      "과도한 열 자극을 피하는 등 안내를 따르고 물집·심한 통증·지속되는 감각 변화는 연락합니다.",
    alternatives: "시술하지 않기, 다른 탄력·윤곽 치료를 상담할 수 있습니다.",
    review: "장비·모드별 허가 목적·흡입 여부·냉각·삽입물 금기·시술 부위",
    sources: ["energy"],
  },
  {
    key: "threads",
    name: "실리프팅",
    examples: "민트실, 모노실, 코·눈밑 등 부위별 실",
    purpose:
      "선택한 부위에 의료용 실을 삽입하여 조직 지지 또는 윤곽 개선을 목표로 합니다. 실 종류·부위에 따라 방법과 효과가 달라집니다.",
    risks:
      "통증·붓기·멍, 감염, 실이 만져지거나 보임·노출, 피부 패임·비대칭·윤곽 불규칙, 지속되는 불편감 등이 생길 수 있고 실 제거·추가 처치가 필요할 수 있습니다.",
    before: "이전 실·필러·수술, 출혈 위험 약물, 알레르기·피부 감염을 알립니다.",
    after:
      "압박·마사지·큰 움직임 등 제한사항을 안내받습니다. 노출된 실을 직접 당기지 말고 고름·발열·심한 통증은 병원에 연락합니다.",
    alternatives:
      "치료하지 않기, 에너지 기반 시술 또는 수술적 방법을 상담할 수 있습니다.",
    review: "실의 제품·재질·수량·부위별 해부학적 위험·마취·제거 및 합병증 대응",
    sources: ["thread"],
  },
  {
    key: "peeling",
    name: "필링·스케일링",
    examples: "아쿠아필, 라라필, 산소필, 각질 관리",
    purpose:
      "선택한 제품과 방법으로 각질·피지 또는 피부결 개선을 목표로 합니다. 화학적 필링과 장비 관리의 강도·회복기간은 다릅니다.",
    risks:
      "따가움·붉어짐·건조·각질 탈락, 자극성 또는 알레르기 반응, 화상·감염·색소 변화·흉터가 생길 수 있습니다.",
    before:
      "성분 알레르기, 헤르페스·피부염, 최근 레티노이드 등 약물과 시술을 알립니다.",
    after:
      "각질을 억지로 벗기지 않고 안내받은 보습·자외선 차단을 따릅니다. 심한 통증·수포·진물은 연락합니다.",
    alternatives:
      "일상 피부 관리, 외용 치료 또는 시술하지 않기를 선택할 수 있습니다.",
    review: "제품·성분·농도·깊이·금기·회복기간·사후 관리",
    sources: ["peel"],
  },
  {
    key: "subcision",
    name: "흉터 유착 박리·서브시전",
    examples: "에어서브시전, 쥬브젠 등 흉터 복합치료",
    purpose:
      "흉터의 형태에 따라 피부 아래 유착을 박리하여 패인 흉터 개선을 목표로 합니다. 가스·약물·레이저 등을 병행하면 각각의 추가 설명이 필요합니다.",
    risks:
      "통증·출혈·멍·혈종·붓기, 감염, 결절·색소 변화·새 흉터, 혈관·신경 손상이나 윤곽 불규칙이 생길 수 있습니다.",
    before: "흉터 체질, 출혈 위험 약물, 이전 시술과 감염을 알립니다.",
    after:
      "드레싱·압박 등 개별 안내를 따릅니다. 빠르게 커지는 붓기·멎지 않는 출혈·발열·지속되는 감각 이상은 연락합니다.",
    alternatives:
      "시술하지 않기, 흉터 유형에 따라 레이저·필링·절제 등 다른 치료를 상담할 수 있습니다.",
    review: "바늘/기구/가스 등 실제 방식·마취·병용 제제·기기별 허가 및 합병증",
    sources: ["scar"],
  },
  {
    key: "fat-injection",
    name: "지방분해·윤곽 주사",
    examples: "얼굴·바디 지방파괴 주사, 윤곽 주사",
    purpose:
      "설명받은 성분을 선택한 부위에 주사하여 국소 윤곽 개선을 목표로 합니다. 전신 비만 치료나 체중 감량을 보장하지 않습니다.",
    risks:
      "통증·붓기·멍·결절, 감염·궤양·괴사·흉터, 신경 손상·비대칭 등이 생길 수 있습니다. 성분·부위에 따라 삼킴 장애 등 추가 위험을 설명받습니다.",
    before:
      "제품·혼합 성분과 허가된 부위인지 확인하고, 삼킴 장애·이전 수술·알레르기·복용약을 알립니다.",
    after:
      "악화되는 통증·피부색 변화·궤양·고름, 비대칭이나 삼킴·호흡 장애가 있으면 즉시 진료를 받습니다.",
    alternatives:
      "생활습관·의학적 비만 치료, 다른 국소 윤곽 시술 또는 치료하지 않기를 상담할 수 있습니다.",
    review:
      "정확한 성분·혼합 여부·국내 허가 부위/경로·허가 외 사용 근거·부위별 대안과 위험",
    sources: ["fat"],
  },
  {
    key: "iv-injection",
    name: "수액·영양 주사",
    examples: "영양수액, 백옥주사 등 성분별 주사",
    purpose:
      "진료 후 결정한 약물을 정맥 등 설명받은 경로로 투여합니다. 미용·피로 등의 상품명이 특정 효과를 보장하지 않으며 성분별 필요성과 근거를 설명받습니다.",
    risks:
      "주사 부위 통증·멍, 혈관염·감염, 혈관 밖 누출에 따른 조직 손상, 약물 알레르기·아나필락시스 등이 생길 수 있습니다. 약물과 환자 상태에 따른 전신 부작용을 별도로 설명받습니다.",
    before:
      "약물 알레르기·과거 주사 반응, 심장·신장·간 질환, 임신·수유, 복용약을 알립니다.",
    after:
      "투여 중 통증·부종·발진·어지러움·가슴 불편·호흡곤란이 있으면 즉시 의료진에게 알립니다. 귀가 후 호흡곤란·의식저하 등은 응급 진료를 받습니다.",
    alternatives:
      "투여하지 않기, 경구 치료·수분 섭취 등 진단에 맞는 방법을 상담할 수 있습니다.",
    review: "실제 약물·성분·투여 목적/경로·금기·상호작용·필요 검사·응급 대응",
    sources: ["iv"],
  },
];
const commonChecks = [
  "시술 목적·방법·부위와 사용하는 제품 또는 장비에 대해 설명을 들었습니다.",
  "기대 효과의 한계·개인차와 주요 부작용·대처 방법을 설명받았습니다.",
  "시술하지 않는 선택을 포함한 대안과 예상 회복·사후 관리를 설명받았습니다.",
  "질환·복용약·알레르기·임신 가능성 및 과거 시술 이력을 의료진에게 알렸습니다.",
  "질문할 기회가 있었고 답변을 이해했으며 자발적으로 시술에 동의합니다.",
];
function bodyFor(s: DraftSpec): string {
  return `${s.name} 설명 및 동의서\n\n1. 시술 목적과 방법\n${s.purpose}\n구체적인 진단·시술 부위·제품/장비·시술 계획 및 설명한 의사와 시술 의사는 진료기록과 함께 확인합니다.\n\n2. 기대 효과와 대안\n결과·회복기간·유지기간에는 개인차가 있으며 반복 또는 추가 치료가 필요할 수 있습니다.\n${s.alternatives}\n\n3. 발생 가능한 부작용과 위험\n${s.risks}\n\n4. 시술 전 알릴 사항\n${s.before}\n임신 가능성·수유, 알레르기, 복용약·건강기능식품 및 기저질환을 알립니다. 약물 중단이나 변경은 담당 의사와 상의합니다.\n\n5. 시술 후 관리와 연락\n${s.after}\n호흡곤란·의식저하 등 응급 증상은 지체하지 말고 119 또는 가까운 응급실을 이용합니다.\n병원 연락처와 야간·휴일 안내: [병원 확인: 연락처 및 진료시간 외 대응 방법]\n시술별 추가 안내: [병원 확인: ${s.review}]\n\n6. 환자의 선택\n충분한 설명과 질문·답변 후 시술 여부를 선택할 수 있고, 시술 전 동의를 철회할 수 있습니다. 추가 비용·일정·환불 기준은 별도 안내를 확인합니다. 이 동의는 진료상 책임을 면제하거나 환자의 권리를 포기한다는 뜻이 아닙니다. 사진의 홍보 활용이나 제3자 제공에 대한 동의는 포함하지 않습니다.\n\n7. 확인과 서명\n환자별 시술 계획과 설명 내용을 확인한 후 아래 확인 항목과 서명란을 작성합니다. 법정대리인 등의 동의가 필요한 경우에는 병원이 적용 절차와 서명 권한을 확인합니다.`;
}
export const treatmentConsentDrafts = specs.map((s) => ({
  ...s,
  body: bodyFor(s),
  checks: [...commonChecks],
}));
export function consentPublishIssues(
  t: Pick<Consent, "name" | "body" | "checks">,
): string[] {
  const issues: string[] = [];
  if (!t.name.trim() || !t.body.trim())
    issues.push("양식명과 본문을 입력하세요.");
  if (/\[병원 확인\s*[:：]/.test(t.body))
    issues.push("본문의 [병원 확인: …] 항목을 실제 병원 기준으로 작성하세요.");
  if (!t.checks.length || t.checks.some((x) => !x.trim()))
    issues.push("환자가 확인할 항목을 한 개 이상 입력하세요.");
  return issues;
}
