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
  evidence?: string;
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
add("start", { page: "home" }, [
  click(
    "상단의 글자 크기 설정을 눌러보세요.",
    label("UI 글자 크기 설정"),
    label("UI 글자 크기"),
  ),
  value("글자 크기를 110%로 조절해보세요.", label("UI 글자 크기"), "110"),
  click("닫기를 눌러 홈으로 돌아오세요.", {
    text: "닫기",
    scope: ".display-settings-overlay",
  }),
  click("홈의 환자목록으로 이동하세요.", css(".home-primary button.patients"), label("환자 검색")),
  value("환자 검색에 「이서연」를 입력하세요.", label("환자 검색"), "이서연"),
  click(
    "검색된 이서연 이름을 눌러 상세 화면을 여세요.",
    text("이서연"),
    text("정보 수정"),
  ),
]);
add("find-patient", { page: "patients" }, [
  value("이름 검색으로 이서연를 찾아보세요.", label("환자 검색"), "이서연"),
  click("이서연 상세를 여세요.", text("이서연"), text("정보 수정")),
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
  value("이름에 「김철수」을 입력하세요.", label("이름"), "김철수"),
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
    { name: "김철수", dob: "1990-01-01", phone: "01000000002", sex: "M" },
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
  {
    kind: "click",
    target: {
      label: "연습사진1.jpg 편집",
    },
    instruction: "1번 사진의 편집기를 여세요.",
  },
  {
    kind: "value",
    target: {
      label: "주석 굵기",
    },
    instruction: "펜 굵기를 8로 바꿔 미리보기 선을 확인하세요.",
    value: "8",
  },
  {
    kind: "value",
    target: {
      label: "주석 색상",
    },
    instruction: "주석 색상을 파란색 #2457c5로 바꾸세요.",
    value: "#2457c5",
  },
  {
    kind: "value",
    target: {
      label: "선 종류",
    },
    instruction: "선 종류를 점선으로 바꾸세요.",
    value: "dashed",
  },
  {
    kind: "value",
    target: {
      label: "주석 투명도",
    },
    instruction: "투명도를 20%로 바꾸세요.",
    value: "20",
  },
  {
    kind: "draw",
    target: {
      label: "사진 편집 캔버스",
    },
    instruction: "사진 위에 펜으로 선을 그리세요.",
    evidence: "pen",
  },
  {
    kind: "value",
    target: {
      label: "선 종류",
    },
    instruction: "선 종류를 실선으로 되돌리세요.",
    value: "solid",
  },
  {
    kind: "click",
    target: {
      label: "화살표",
    },
    instruction: "화살표 도구를 선택하세요.",
  },
  {
    kind: "draw",
    target: {
      label: "사진 편집 캔버스",
    },
    instruction: "사진 위를 끌어 화살표를 만드세요.",
    evidence: "arrow",
  },
  {
    kind: "click",
    target: {
      label: "사각형",
    },
    instruction: "사각형 도구를 선택하세요.",
  },
  {
    kind: "draw",
    target: {
      label: "사진 편집 캔버스",
    },
    instruction: "사진 위를 끌어 사각형을 만드세요.",
    evidence: "rect",
  },
  {
    kind: "click",
    target: {
      label: "원",
    },
    instruction: "원 도구를 선택하세요.",
  },
  {
    kind: "draw",
    target: {
      label: "사진 편집 캔버스",
    },
    instruction: "사진 위를 끌어 원을 만드세요.",
    evidence: "ellipse",
  },
  {
    kind: "click",
    target: {
      label: "모자이크",
    },
    instruction: "모자이크 도구를 선택하세요.",
  },
  {
    kind: "draw",
    target: {
      label: "사진 편집 캔버스",
    },
    instruction: "사진 위를 끌어 모자이크를 만드세요.",
    evidence: "mosaic",
  },
  {
    kind: "click",
    target: {
      label: "지우개",
    },
    instruction: "지우개 도구를 선택하세요.",
  },
  {
    kind: "draw",
    target: {
      label: "사진 편집 캔버스",
    },
    instruction: "방금 만든 모자이크 위를 문질러 지우세요.",
    evidence: "erase",
  },
  {
    kind: "click",
    target: {
      text: "실행취소",
    },
    instruction: "실행취소로 지운 주석을 복구하세요.",
  },
  {
    kind: "click",
    target: {
      text: "다시실행",
    },
    instruction: "다시실행으로 지우기를 다시 적용하세요.",
  },
  {
    kind: "click",
    target: {
      label: "글자",
    },
    instruction: "글자 도구를 선택하세요.",
  },
  {
    kind: "click",
    target: {
      label: "사진 편집 캔버스",
    },
    instruction: "사진의 빈 곳을 눌러 글자 입력창을 여세요.",
    result: {
      label: "텍스트 내용",
    },
  },
  {
    kind: "value",
    target: {
      label: "텍스트 내용",
    },
    instruction: "텍스트에 「경과 비교 부위」를 입력하세요.",
    value: "경과 비교 부위",
  },
  {
    kind: "value",
    target: {
      label: "주석 폰트",
    },
    instruction: "폰트를 명조체로 바꿔 미리보기를 확인하세요.",
    value: "serif",
  },
  {
    kind: "value",
    target: {
      label: "글자 크기",
    },
    instruction: "글자 크기를 36으로 조절하세요.",
    value: "36",
  },
  {
    kind: "click",
    target: {
      text: "글자 적용",
    },
    instruction: "글자 적용으로 사진에 넣으세요.",
  },
  {
    kind: "click",
    target: {
      label: "선택",
    },
    instruction: "선택 도구를 누르세요.",
  },
  {
    kind: "draw",
    target: {
      label: "사진 편집 캔버스",
    },
    instruction: "방금 넣은 글자의 가운데를 잡고 다른 위치로 옮기세요.",
    evidence: "move",
  },
  {
    kind: "draw",
    target: {
      label: "사진 편집 캔버스",
    },
    instruction: "선택한 글자의 오른쪽 아래 모서리를 끌어 크기를 조절하세요.",
    evidence: "resize",
  },
  {
    kind: "click",
    target: {
      label: "선택 주석 수정",
    },
    instruction: "선택 주석 수정을 눌러 글자를 다시 편집하세요.",
  },
  {
    kind: "value",
    target: {
      label: "텍스트 내용",
    },
    instruction: "텍스트를 「다음 방문 시 경과 비교」로 수정하세요.",
    value: "다음 방문 시 경과 비교",
  },
  {
    kind: "click",
    target: {
      text: "글자 적용",
    },
    instruction: "글자 적용으로 수정을 반영하세요.",
  },
  {
    kind: "click",
    target: {
      label: "선택 주석 삭제",
    },
    instruction: "선택 주석 삭제로 글자를 지우세요.",
  },
  {
    kind: "click",
    target: {
      text: "실행취소",
    },
    instruction: "실행취소로 글자를 복구하세요.",
  },
  {
    kind: "click",
    target: {
      label: "스탬프",
    },
    instruction: "스탬프 도구를 선택하세요.",
  },
  {
    kind: "click",
    target: {
      label: "스탬프 📍",
    },
    instruction: "핀 스탬프를 고르세요.",
  },
  {
    kind: "draw",
    target: {
      label: "사진 편집 캔버스",
    },
    instruction: "사진의 빈 곳을 눌러 스탬프를 넣으세요.",
    evidence: "stamp",
  },
  {
    kind: "click",
    target: {
      label: "선택 주석 수정",
    },
    instruction: "선택 주석 수정을 눌러 스탬프 설정을 여세요.",
  },
  {
    kind: "value",
    target: {
      label: "설정 투명도",
    },
    instruction: "설정 투명도를 30%로 조절하세요.",
    value: "30",
  },
  {
    kind: "click",
    target: {
      text: "주석 적용",
    },
    instruction: "주석 적용을 누르세요.",
  },
  {
    kind: "value",
    target: {
      label: "확대 축소",
    },
    instruction: "확대·축소를 45로 올리세요.",
    value: "45",
  },
  {
    kind: "click",
    target: {
      label: "이동",
    },
    instruction: "이동 도구를 선택하세요.",
  },
  {
    kind: "draw",
    target: {
      label: "사진 편집 캔버스",
    },
    instruction: "사진을 끌어 보이는 위치를 옮기세요.",
    evidence: "pan",
  },
  {
    kind: "click",
    target: {
      text: "화면 맞춤",
    },
    instruction: "화면 맞춤으로 전체 사진을 보세요.",
  },
  {
    kind: "click",
    target: {
      text: "원본 보기",
    },
    instruction: "원본 보기로 주석 없는 사진을 확인하세요.",
  },
  {
    kind: "click",
    target: {
      text: "주석 표시",
    },
    instruction: "주석 표시로 설명을 다시 보세요.",
  },
  {
    kind: "click",
    target: {
      text: "내 주석만",
    },
    instruction: "내 주석만을 눌러 작성자별 표시를 확인하세요.",
  },
  {
    kind: "click",
    target: {
      text: "전체 주석",
    },
    instruction: "전체 주석으로 모든 설명을 다시 보세요.",
  },
  {
    kind: "click",
    target: {
      text: "↷ 우 90°",
    },
    instruction: "우 90°로 사진을 회전하세요.",
  },
  {
    kind: "click",
    target: {
      text: "↶ 좌 90°",
    },
    instruction: "좌 90°로 되돌리세요.",
  },
  {
    kind: "value",
    target: {
      label: "자유회전",
    },
    instruction: "자유회전을 10°로 조절하세요.",
    value: "10",
  },
  {
    kind: "click",
    target: {
      text: "0° 원래 회전",
    },
    instruction: "0° 원래 회전을 누르세요.",
  },
  {
    kind: "click",
    target: {
      text: "영역 자르기",
    },
    instruction: "영역 자르기를 선택하세요.",
  },
  {
    kind: "draw",
    target: {
      label: "사진 편집 캔버스",
    },
    instruction: "사진에 남길 영역을 대각선으로 끌어 자르세요.",
    evidence: "crop",
  },
  {
    kind: "click",
    target: {
      text: "자르기 해제",
    },
    instruction: "자르기 해제로 원래 영역을 복원하세요.",
  },
  {
    kind: "click",
    target: {
      text: "영역 자르기 (포트레이트)",
    },
    instruction: "포트레이트 자르기를 열어 프레임을 확인하세요.",
  },
  {
    kind: "click",
    target: {
      text: "자르기 취소",
    },
    instruction: "자르기 취소를 눌러 변경 없이 닫으세요.",
  },
  {
    kind: "click",
    target: {
      text: "영역 자르기 (포트레이트)",
    },
    instruction: "포트레이트 자르기를 다시 여세요.",
  },
  {
    kind: "draw",
    target: {
      label: "포트레이트 자르기 프레임",
    },
    evidence: "frame",
    instruction: "프레임의 변이나 안쪽을 끌어 영역을 조절하세요.",
  },
  {
    kind: "click",
    target: {
      text: "자르기 적용",
    },
    instruction: "자르기 적용을 누르세요.",
  },
  {
    kind: "click",
    target: {
      text: "자르기 해제",
    },
    instruction: "자르기 해제로 전체 사진을 보세요.",
  },
  {
    kind: "click",
    target: {
      text: "S펜 설정",
    },
    instruction: "S펜 설정을 펼치세요.",
  },
  {
    kind: "click",
    target: {
      label: "편집기에서 S펜 버튼을 누르는 동안 지우개 사용",
    },
    instruction: "S펜 버튼 지우개 설정을 꺼보세요.",
  },
  {
    kind: "click",
    target: {
      label: "편집기에서 S펜 버튼을 누르는 동안 지우개 사용",
    },
    instruction: "S펜 버튼 지우개 설정을 다시 켜세요.",
  },
  {
    kind: "click",
    target: {
      text: "S펜 설정",
    },
    instruction: "S펜 설정을 접으세요.",
  },
  {
    kind: "click",
    target: {
      text: "PC 단축키·마우스 사용법",
    },
    instruction: "PC 단축키·마우스 사용법을 펼쳐보세요.",
  },
  {
    kind: "click",
    target: {
      text: "PC 단축키·마우스 사용법",
    },
    instruction: "단축키 안내를 접으세요.",
  },
  {
    kind: "click",
    target: {
      text: "크게 보기",
    },
    result: {
      label: "연습 크게 보기 닫기",
    },
    instruction: "크게 보기를 눌러 사진을 전체 화면으로 확인하세요.",
  },
  {
    kind: "click",
    target: {
      label: "연습 크게 보기 닫기",
    },
    instruction: "크게 보기 닫기를 눌러 편집 화면으로 돌아오세요.",
  },
  {
    kind: "click",
    target: {
      text: "사진 편집 저장",
    },
    instruction: "사진 편집 저장을 누르세요.",
  },
  {
    kind: "click",
    target: {
      text: "편집기 닫기",
    },
    instruction: "편집기 닫기를 누르세요.",
  },
  {
    kind: "command",
    target: {
      text: "보류·변경 저장",
    },
    instruction: "보류·변경 저장으로 상담까지 저장하세요.",
    command: "consultation.save",
  },
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
  click("정민호를 수신자로 선택하세요.", {
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
  click("최수진 계정을 선택하세요.", text("최수진")),
  value("이름을 「최수빈」로 바꿔보세요.", label("이름"), "최수빈"),
  command(
    "계정 저장을 누르세요. 연습 직원에게만 반영됩니다.",
    text("계정 저장"),
    "practice.users",
    { name: "최수빈" },
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
  click("목록의 이서연 상담 요청을 여세요.", css(".inquiry-request-open")),
  value(
    "담당 상담자로 최수진을 선택하세요.",
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
  value("서명자에 「이서연」를 입력하세요.", label("서명자"), "이서연"),
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

add("quick-consult", { page: "home" }, [
  click(
    "접수 전 상담이 필요합니다. 홈에서 바로상담을 여세요.",
    css(".home-primary button.quick"),
    text("미용 상담 시작"),
  ),
  command(
    "미용 상담을 먼저 시작하세요.",
    text("미용 상담 시작"),
    "consultation.quickCreate",
    { category: "미용" },
  ),
  click(
    "이제 접수 정보를 받았습니다. 환자정보 등록을 여세요.",
    text("환자정보 등록"),
    label("이름"),
  ),
  value("상황·접수 정보를 보고 이름을 입력하세요.", label("이름"), "김철수"),
  value("생년월일을 입력하세요.", label("생년월일"), "1990-01-01"),
  value("연락처를 입력하세요.", label("전화번호"), "01000000002"),
  value("성별을 선택하세요.", label("성별"), "M"),
  value(
    "주소를 입력하세요.",
    label("주소 (동까지)"),
    "강원특별자치도 춘천시 후평동",
  ),
  command(
    "저장해 방금 시작한 상담에 환자정보를 연결하세요.",
    { text: "저장", scope: ".modal" },
    "patient.quickRegister",
    { name: "김철수", dob: "1990-01-01", phone: "01000000002" },
  ),
]);

export const practiceRecipes = recipes;
export const practiceRecipe = (id: string) => recipes.find((r) => r.id === id);
