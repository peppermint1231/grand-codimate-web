export type GuideTargetSpec = {
  label?: string;
  text?: string;
  selector?: string;
  scope?: string;
};
export type PracticeStep = {
  id: string;
  instruction: string;
  target: GuideTargetSpec;
  kind: "click" | "value" | "command" | "draw";
  value?: string;
  command?: string;
  check?: Record<string, unknown>;
  result?: GuideTargetSpec;
  prepare?: GuideTargetSpec[];
};
export type PracticeRecipe = {
  id: string;
  route: { page: string; patientId?: string; consultId?: string; tab?: string };
  steps: PracticeStep[];
};
const label = (label: string): GuideTargetSpec => ({ label }),
  text = (text: string): GuideTargetSpec => ({ text }),
  css = (selector: string): GuideTargetSpec => ({ selector });
const click = (
  instruction: string,
  target: GuideTargetSpec,
  result?: GuideTargetSpec,
): Omit<PracticeStep, "id"> => ({ instruction, target, kind: "click", result });
const value = (
  instruction: string,
  target: GuideTargetSpec,
  value: string,
): Omit<PracticeStep, "id"> => ({ instruction, target, kind: "value", value });
const command = (
  instruction: string,
  target: GuideTargetSpec,
  command: string,
  check?: Record<string, unknown>,
): Omit<PracticeStep, "id"> => ({
  instruction,
  target,
  kind: "command",
  command,
  check,
});
const patient = { page: "patients", patientId: "practice-patient" },
  consult = {
    page: "consult",
    patientId: "practice-patient",
    consultId: "practice-consult",
    tab: "consult",
  },
  catalog = { page: "catalog" },
  settings = { page: "settings" };
const recipes: PracticeRecipe[] = [];
function add(
  id: string,
  route: PracticeRecipe["route"],
  steps: Omit<PracticeStep, "id">[],
) {
  if (["product", "packages", "catalog-bulk"].includes(id))
    steps.unshift(
      click("단가표 수정을 눌러 편집을 시작하세요.", text("단가표 수정")),
    );
  if (id === "insurance-membership")
    steps.splice(1, 0, click("단가표 수정을 눌러주세요.", text("단가표 수정")));
  recipes.push({
    id,
    route,
    steps: steps.map((s, i) => ({ ...s, id: "practice-" + (i + 1) })),
  });
}
add("start", { page: "patients" }, [
  click(
    "상단의 글자 크기 설정을 눌러보세요.",
    label("UI 글자 크기 설정"),
    label("UI 글자 크기"),
  ),
  value("글자 크기를 110%로 조절해보세요.", label("UI 글자 크기"), "110"),
  click("닫기를 눌러 환자목록으로 돌아오세요.", {
    text: "닫기",
    scope: ".display-settings-overlay",
  }),
  value(
    "환자 검색에 「연습환자」를 입력하세요.",
    label("환자 검색"),
    "연습환자",
  ),
  click(
    "검색된 연습환자 이름을 눌러 상세 화면을 여세요.",
    text("연습환자"),
    text("정보 수정"),
  ),
]);
add("find-patient", { page: "patients" }, [
  value("이름 검색으로 연습환자를 찾아보세요.", label("환자 검색"), "연습환자"),
  click("연습환자 상세를 여세요.", text("연습환자"), text("정보 수정")),
  click(
    "정보 수정을 눌러 연락처·생년월일 확인 위치를 익히세요.",
    text("정보 수정"),
    label("전화번호"),
  ),
  value(
    "전화번호를 연습 번호 01000000001로 입력하세요.",
    label("전화번호"),
    "01000000001",
  ),
  command(
    "저장으로 가상 환자 정보를 반영해보세요.",
    { text: "저장", scope: ".modal" },
    "patient.update",
    { phone: "01000000001" },
  ),
]);
add("register", { page: "patients" }, [
  click("새 환자 등록을 누르세요.", text("새 환자 등록"), label("이름")),
  value("이름에 「신규연습」을 입력하세요.", label("이름"), "신규연습"),
  value("생년월일을 1990-01-01로 입력하세요.", label("생년월일"), "1990-01-01"),
  value(
    "전화번호를 01000000002로 입력하세요.",
    label("전화번호"),
    "01000000002",
  ),
  value("성별을 남성으로 선택하세요.", label("성별"), "M"),
  value(
    "주소에 「강원특별자치도 춘천시 후평동」을 입력하세요.",
    label("주소 (동까지)"),
    "강원특별자치도 춘천시 후평동",
  ),
  command(
    "저장 버튼으로 가상 환자를 등록하세요.",
    { text: "저장", scope: ".modal" },
    "patient.create",
    { name: "신규연습", dob: "1990-01-01", phone: "01000000002", sex: "M" },
  ),
]);
add("consult-start", patient, [
  click(
    "새 상담을 눌러 상담 시작 창을 여세요.",
    text("새 상담 시작"),
    label("상담 구분"),
  ),
  value("상담 구분을 미용으로 선택하세요.", label("상담 구분"), "미용"),
  command(
    "상담 시작을 누르세요. 가상 상담만 만들어집니다.",
    text("상담 시작"),
    "consultation.create",
  ),
  click("02 상담 탭으로 이동하세요.", text("02 상담"), label("장바구니 열기")),
  click(
    "장바구니를 열어 상담 화면의 구조를 확인하세요.",
    label("장바구니 열기"),
  ),
]);
add("photos", consult, [
  click(
    "1번 사진을 눌러 한 장 보기로 바꿔보세요.",
    label("1번 사진 한 장 보기"),
  ),
  click("사진 선택·추가를 눌러 사진 목록을 여세요.", label("사진 선택·추가")),
  click("연습사진 2의 선택을 바꿔보세요.", label("연습사진2.jpg 선택")),
  click("비교 크게 보기를 눌러보세요.", label("비교 크게 보기")),
]);
add("editor", { ...consult, tab: "photo" }, [
  click("연습사진 1의 편집 버튼을 누르세요.", label("연습사진1.jpg 편집")),
  {
    instruction:
      "강조된 사진 위에 선을 그려보세요. 실제 주석이 생기면 다음으로 넘어갑니다.",
    target: label("사진 편집 캔버스"),
    kind: "draw",
  },
  click(
    "사진 편집 저장을 눌러 작업 내용을 반영하세요.",
    text("사진 편집 저장"),
  ),
  click("편집기 닫기를 누르세요.", text("편집기 닫기")),
  command(
    "보류·변경 저장으로 가상 상담에 주석을 저장하세요.",
    text("보류·변경 저장"),
    "consultation.save",
  ),
]);
add("procedures", consult, [
  value(
    "시술 검색에 「연습토닝」을 입력하세요.",
    { selector: ".procedure-picker-toolbar input" },
    "연습토닝",
  ),
  click(
    "연습토닝 1회 옵션을 눌러 장바구니에 담으세요.",
    css(".product-list .option-row"),
  ),
  click("장바구니를 열어 담긴 항목을 확인하세요.", label("장바구니 열기")),
]);
add("pricing", consult, [
  click("장바구니를 여세요.", label("장바구니 열기")),
  value("전체 할인에 10000원을 입력하세요.", label("전체 할인"), "10000"),
  value(
    "할인 사유에 「연습 할인」을 입력하세요.",
    label("할인·변경 사유"),
    "연습 할인",
  ),
  click("장바구니를 닫으세요.", {
    text: "닫기",
    scope: ".cart-dialog-overlay",
  }),
  command(
    "보류·변경 저장을 눌러 할인 결과를 저장하세요.",
    text("보류·변경 저장"),
    "consultation.save",
  ),
]);
add("notes-opinions", consult, [
  click("상담메모 버튼을 누르세요.", label("상담메모 열기")),
  value(
    "메모에 「교육용 상담메모」를 입력하세요.",
    { selector: ".consultation-note-overlay textarea" },
    "교육용 상담메모",
  ),
  command("메모 저장을 누르세요.", text("상담메모 저장"), "consultation.save", {
    memo: "교육용 상담메모",
  }),
  click("의사 의견 요청 버튼을 누르세요.", label("의사 의견 요청 열기")),
  click("연습의사를 수신자로 선택하세요.", {
    selector: ".opinion-recipient-list label:last-child input",
  }),
  value(
    "요청 내용을 「교육용 의견 요청입니다.」로 입력하세요.",
    label("의사 의견 요청 내용"),
    "교육용 의견 요청입니다.",
  ),
  command(
    "요청 보내기를 누르세요. 연습 의사에게만 연결됩니다.",
    css(".consultation-note-overlay form button.primary"),
    "opinion.request",
  ),
]);
add("finish", consult, [
  command(
    "보류·변경 저장을 눌러 가상 상담을 저장하세요.",
    text("보류·변경 저장"),
    "consultation.save",
  ),
  click("견적서 탭으로 이동하세요.", text("03 견적서")),
  command(
    "성공 확정을 누르고 확인창에서 확인하세요. 실제 계약은 생성되지 않습니다.",
    text("성공 확정 · 진행 중"),
    "consultation.finalize",
    { status: "P" },
  ),
]);
add("payments", patient, [
  click("수납·환불 탭을 누르세요.", text("수납·환불")),
  value(
    "연결 상담에서 연습 상담을 선택하세요.",
    label("연결 상담"),
    "practice-paid",
  ),
  click(
    "전액을 체크해 미수납 금액을 자동 입력하세요.",
    css(".ledger-entry-form input[type=checkbox]"),
  ),
  command(
    "수납 기록을 저장하세요. 연습 금액만 반영됩니다.",
    text("기록 확정"),
    "ledger.create",
  ),
]);
add("followup", patient, [
  click("중간상담을 누르세요.", text("중간상담"), label("이어갈 이전 상담")),
  value(
    "진행 중인 연습 상담을 선택하세요.",
    label("이어갈 이전 상담"),
    "practice-paid",
  ),
  command(
    "중간상담 시작을 누르세요.",
    text("상담 시작"),
    "consultation.create",
    { kind: "interim" },
  ),
]);
add("catalog-basics", catalog, [
  click("미용 SSOT를 선택하세요.", {
    text: "미용 SSOT",
    scope: '[aria-label="단가표 구분"]',
  }),
  value(
    "단가표 검색에 「연습토닝」을 입력하세요.",
    label("단가표 검색"),
    "연습토닝",
  ),
  value("상품 필터를 비활성으로 바꿔보세요.", label("상품 필터"), "inactive"),
  value("상품 필터를 전체로 되돌려보세요.", label("상품 필터"), "all"),
]);
add("product", catalog, [
  click("상품 추가를 눌러 마법사를 여세요.", text("상품 추가")),
  value(
    "상품명에 「연습 신상품」을 입력하세요.",
    label("상품명"),
    "연습 신상품",
  ),
  value("상품 타입에서 일반 상품을 선택하세요.", label("상품 타입"), "single"),
  click("다음 단계로 이동하세요.", text("다음 단계")),
  value(
    "첫 옵션 가격에 50000원을 입력하세요.",
    { selector: '.wizard-option input[type="number"]' },
    "50000",
  ),
  click("다음 단계에서 구성을 미리 보세요.", text("다음 단계")),
  click(
    "상품 추가 완료를 눌러 편집 목록에 추가하세요.",
    text("상품 추가 완료"),
  ),
  command(
    "저장하고 적용을 눌러 가상 단가표에 반영하세요.",
    text("저장하고 적용"),
    "catalog.apply",
  ),
]);
add("catalog-bulk", catalog, [
  value(
    "단가표 검색에 연습토닝을 입력하세요.",
    label("단가표 검색"),
    "연습토닝",
  ),
  click("연습토닝의 선택 체크박스를 누르세요.", label("연습토닝 선택")),
  click(
    "선택 버튼 옆의 일괄 수정을 여세요.",
    css('[data-catalog-command="bulkOpen"]'),
  ),
  value(
    "선택 상품의 메뉴 판매를 비활성으로 설정하세요.",
    label("일괄 메뉴 판매"),
    "inactive",
  ),
  click("선택 상품 일괄 적용을 눌러보세요.", text("선택 상품 일괄 적용")),
  click("일괄 수정 창을 닫으세요.", text("닫기")),
  command(
    "저장하고 적용을 눌러 가상 판매 상태를 반영하세요.",
    text("저장하고 적용"),
    "catalog.apply",
  ),
]);
add("accounts", settings, [
  click("직원·권한 탭을 누르세요.", text("직원·권한")),
  click("연습직원 계정을 선택하세요.", text("연습직원")),
  value("이름을 「연습담당자」로 바꿔보세요.", label("이름"), "연습담당자"),
  command(
    "계정 저장을 누르세요. 연습 직원에게만 반영됩니다.",
    text("계정 저장"),
    "practice.users",
    { name: "연습담당자" },
  ),
]);
add("grades-admin", settings, [
  click("환자 등급 탭을 여세요.", text("환자 등급")),
  click("VIP 세부혜택을 펼치세요.", css(".grade-settings-row summary")),
  value(
    "생일 포인트를 60000으로 바꿔보세요.",
    { label: "생일 포인트", scope: ".grade-settings" },
    "60000",
  ),
  command(
    "등급·혜택 저장으로 변경을 반영하세요.",
    text("등급·혜택 저장"),
    "grade.policy",
  ),
]);
add("statistics", { page: "stats" }, [
  click("직원 성과 탭을 누르세요.", text("직원 성과")),
  click("환자·마케팅 탭으로 전환해보세요.", text("환자·마케팅")),
]);
add("marketing", { page: "stats" }, [
  click("환자·마케팅 탭을 누르세요.", text("환자·마케팅")),
  click(
    "베가스이관 배지를 눌러 환자군을 바꿔보세요.",
    css(".analytics-cohort-filters button:nth-of-type(2)"),
  ),
  click(
    "초진설문지(진료)를 선택해 비교 대상을 바꿔보세요.",
    text("초진설문지(진료)"),
  ),
]);
add("operations", settings, [
  click("연결·복구를 누르세요.", text("연결·복구")),
  value(
    "저장 폴더 이름에 「교육용보관함」을 입력하세요.",
    label("저장 폴더 이름"),
    "교육용보관함",
  ),
]);

add("requests", { page: "discovery" }, [
  click("상담요청 캘린더를 월별로 바꿔보세요.", text("월별")),
  click("일별 일정으로 바꿔보세요.", text("일별")),
  click("기본인 주별 보기로 돌아오세요.", text("주별")),
  click(
    "목록 필터에서 미배정을 눌러보세요.",
    css(".inquiry-filters button:nth-child(3)"),
  ),
  click("목록의 연습환자 상담 요청을 여세요.", css(".inquiry-request-open")),
  value(
    "담당 상담자로 연습직원을 선택하세요.",
    label("상담자"),
    "practice-staff",
  ),
  command(
    "연락 완료·일정 확정을 눌러 가상 요청을 배정하세요.",
    text("연락 완료 · 일정 확정"),
    "practice.schedule",
    { coordinatorId: "practice-staff", action: "confirm" },
  ),
  click(
    "전체 필터로 배정된 요청도 확인하세요.",
    css(".inquiry-filters button:first-child"),
  ),
  command(
    "가상 요청을 삭제하고 확인창에서 확인하세요.",
    css(".inquiry-request-actions .danger"),
    "practice.inquiryDelete",
    { action: "delete" },
  ),
]);
add("doctor", consult, [
  click("의견 달기를 눌러 요청 없이 의견을 작성하세요.", text("의견 달기")),
  value(
    "의견에 「가상 환자의 사진을 확인했습니다.」를 입력하세요.",
    label("의견 작성"),
    "가상 환자의 사진을 확인했습니다.",
  ),
  command(
    "의견 저장을 눌러 상담 사진 아래에 의견을 남기세요.",
    text("의견 저장"),
    "opinion.direct",
  ),
]);
add("quote-consent", { ...consult, tab: "quote" }, [
  value(
    "가상 동의서 양식을 선택하세요.",
    css(".treatment-consent-signing select"),
    "practice-consent",
  ),
  click(
    "모두 동의를 체크해 확인 항목을 연습하세요.",
    css(".treatment-consent-signing .consent-checks-all input"),
  ),
  value("서명자에 「연습환자」를 입력하세요.", label("서명자"), "연습환자"),
  {
    instruction: "아래 서명칸에 연습용 선을 그려주세요.",
    target: css(".treatment-consent-signing canvas.signature"),
    kind: "draw",
  },
  command(
    "서명 저장을 눌러 가상 동의서의 저장 흐름을 익히세요.",
    text("서명 저장"),
    "signature.create",
  ),
]);
add("points", patient, [
  click("환자 상세의 VIP·포인트 탭을 여세요.", css(".tabs button:last-child")),
  click("포인트 수동 조정을 펼치세요.", text("포인트 수동 조정")),
  value(
    "조정 포인트에 10000을 입력하세요.",
    label("조정 포인트 (+ 지급 / − 차감)"),
    "10000",
  ),
  value(
    "조정 사유에 「교육용 지급」을 입력하세요.",
    label("조정 사유"),
    "교육용 지급",
  ),
  command(
    "조정 기록을 눌러 가상 포인트 내역을 추가하세요.",
    text("조정 기록"),
    "points.adjust",
    { amount: 10000, reason: "교육용 지급" },
  ),
  command(
    "조회 QR 생성·보기를 누르세요. 연습용 QR로 실제 환자를 조회할 수는 없습니다.",
    text("조회 QR 생성·보기"),
    "practice.vipShare",
    { action: "create" },
  ),
  command(
    "링크 폐기를 누르고 확인하세요. 이전 QR을 폐기하는 흐름을 익힙니다.",
    text("링크 폐기"),
    "practice.vipShare",
    { action: "revoke" },
  ),
]);
add("recovery", { page: "patients" }, [
  click("복구 자료를 눌러 복구 도구 위치를 확인하세요.", text("복구 자료")),
]);
add("packages", catalog, [
  click("상품 추가를 눌러주세요.", text("상품 추가")),
  value(
    "상품명에 「연습 패키지」를 입력하세요.",
    label("상품명"),
    "연습 패키지",
  ),
  value("상품 타입을 패키지로 선택하세요.", label("상품 타입"), "package"),
  click("다음 단계로 이동하세요.", text("다음 단계")),
  value("이용기간을 180일로 입력하세요.", label("이용기간 (일)"), "180"),
  value("총 방문 회차를 5회로 설정하세요.", label("총 방문 회차"), "5"),
  click(
    "연습 블록을 눌러 패키지 구성에 추가하세요.",
    css(".package-library button"),
  ),
  value(
    "블록 총 수량을 5개로 입력하세요.",
    css('.package-builder input[aria-label$="총 수량"]'),
    "5",
  ),
  click(
    "균형 있게 자동 배치를 눌러 회차에 나누세요.",
    text("균형 있게 자동 배치"),
  ),
  value("할인율을 10%로 정하세요.", label("할인율 (%)"), "10"),
  click("다음 단계에서 패키지 가격과 구성을 확인하세요.", text("다음 단계")),
  click("상품 추가 완료를 누르세요.", text("상품 추가 완료")),
  command(
    "저장하고 적용을 눌러 가상 패키지를 저장하세요.",
    text("저장하고 적용"),
    "catalog.apply",
  ),
]);
add("homepage", catalog, [
  click("홈페이지 SSOT를 선택하세요.", {
    text: "홈페이지 SSOT",
    scope: '[aria-label="단가표 구분"]',
  }),
  click("홈페이지 기준 분류로 바꿔보세요.", text("홈페이지 분류")),
  click("고민별 분류로 돌아오세요.", text("고민별")),
]);
add("discovery-settings", { page: "discovery" }, [
  click("추천기 설정을 펼치세요.", text("추천기 설정 · 상품유형과 가격 공개")),
  value(
    "홈페이지 상품의 가격 표시를 공개로 선택하세요.",
    css("fieldset:first-child select"),
    "public",
  ),
  command(
    "추천기 설정을 가상 설정에 저장하세요.",
    text("추천기 설정 저장"),
    "discovery.settings",
  ),
]);
add("insurance-membership", catalog, [
  click("보험 SSOT를 선택하세요.", {
    text: "보험 SSOT",
    scope: '[aria-label="단가표 구분"]',
  }),
  click("상품 추가를 눌러주세요.", text("상품 추가")),
  value(
    "상품명에 「연습 멤버십」을 입력하세요.",
    label("상품명"),
    "연습 멤버십",
  ),
  value("상품 타입을 멤버십으로 선택하세요.", label("상품 타입"), "membership"),
  click("다음 단계로 이동해 등급 옵션을 설정하세요.", text("다음 단계")),
]);
add("consent-admin", settings, [
  click("동의서 양식 탭을 여세요.", text("동의서 양식")),
  click("새 양식 작성을 눌러주세요.", text("새 양식 작성")),
  value(
    "양식명에 「교육용 동의서」를 입력하세요.",
    label("양식명"),
    "교육용 동의서",
  ),
  value(
    "본문에 「가상 자료를 이용한 교육용 양식입니다.」를 입력하세요.",
    label("동의서 본문"),
    "가상 자료를 이용한 교육용 양식입니다.",
  ),
  command(
    "초안 저장을 누르세요. 연습 자료에만 보관됩니다.",
    text("초안 저장"),
    "consent.save",
  ),
]);

export const practiceRecipes = recipes;
export const practiceRecipe = (id: string) => recipes.find((r) => r.id === id);
