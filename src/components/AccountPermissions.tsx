import { useId } from "react";
import {
  allowed,
  defaultPermission,
  permissionLevelOf,
  permissionLevelLabels,
  isAdministrator,
  canUseExecutiveFeatures,
  permissions,
  type Permission,
  type User,
} from "../core/model";

const descriptions: Record<Permission, { name: string; text: string }> = {
  "patient.edit": {
    name: "환자정보 편집",
    text: "기존 환자의 이름·연락처·생년월일·주소 등을 수정합니다. 신규 환자 등록, 삭제·복원·병합은 이 항목과 별도로 처리됩니다.",
  },
  "money.read": {
    name: "금액 열람",
    text: "상담 계약금액, 수납·환불 내역, 누적 기여매출과 미수금을 확인합니다. 금액을 변경하는 권한은 별도로 지정합니다.",
  },
  "receipt.create": {
    name: "수납 등록",
    text: "성공 확정한 유효 상담에 받은 금액·수납일·결제수단을 기록합니다. 담당 상담 조건이 함께 적용됩니다.",
  },
  "refund.create": {
    name: "환불 등록",
    text: "기존 수납에 연결해 환불 내역을 기록합니다. 남은 환불 가능 금액 안에서 등록하며 담당 상담 조건이 적용됩니다.",
  },
  "ledger.correct": {
    name: "금액 정정",
    text: "잘못된 수납·환불을 사유와 함께 정정 취소합니다. 원래 기록은 보존되며, 올바른 금액은 해당 등록 권한으로 다시 기록합니다.",
  },
  "note.read": {
    name: "환자 메모 열람",
    text: "환자별 메모와 중요 표시를 확인합니다. 메모를 새로 작성하거나 수정하려면 메모 작성 권한도 필요합니다.",
  },
  "note.edit": {
    name: "메모 작성",
    text: "환자 메모를 작성하고 본인이 작성한 메모를 수정합니다. 관리자는 다른 작성자의 메모도 수정할 수 있습니다. 작성 화면 이용에는 메모 열람도 필요합니다.",
  },
  "grade.edit": {
    name: "등급 지정",
    text: "개별 환자의 등급을 사유와 함께 수동 고정하거나 자동 산정으로 되돌립니다. 등급명·기준금액·색상 설정은 관리자 전용입니다.",
  },
  "catalog.edit": {
    name: "단가표 관리",
    text: "미용·보험·이벤트 단가표의 상품·옵션·가격·폴더를 편집합니다. 초안 저장, 게시, 수정 이력 복원까지 포함합니다.",
  },
  "stats.read": {
    name: "통계",
    text: "상담·기여매출·미수금과 담당자별 집계를 확인합니다. 금액 확인에는 금액 열람, 파일 다운로드에는 내보내기 권한도 필요합니다.",
  },
  export: {
    name: "내보내기",
    text: "상담 PDF·견적 이미지, 단가표 CSV·Excel, 통계 Excel을 내보냅니다. 단가표 내보내기는 단가표 관리, 통계 내보내기는 통계 권한도 함께 허용되어야 합니다. 해당 자료의 열람 권한도 필요합니다.",
  },
  "followup.edit": {
    name: "후속 상태 변경",
    text: "예약일과 미정·예약·방문·노쇼 상태, 패키지 진행·완료 상태를 변경합니다. 기본값은 담당 상담의 예약·방문 변경을 허용하며, 개별 허용 시 다른 담당자의 예약·방문 상태도 변경할 수 있습니다.",
  },
};

export function AccountPermissions({
  account,
  onChange,
}: {
  account: User;
  onChange: (account: User) => void;
}) {
  const prefix = useId();
  const level = permissionLevelOf(account);
  return (
    <section className="account-permissions" aria-label="직원 권한 설정">
      <h3>권한 설정</h3>
      <p className="permission-guide">
        ‘등급 기본값’은 선택한 권한등급의 허용·차단 값을 따릅니다. 직무 역할은
        기본값에 영향을 주지 않습니다. 세부권한의 개별 허용·차단은 모든 등급에서
        기본값보다 우선합니다. 아래 적용 상태는 현재 선택 기준이며, 계정 저장을
        눌러야 반영됩니다.
      </p>
      <p className="permission-guide">
        수납·환불 ‘등록’은 앱 장부에 내역을 기록하는 기능입니다. 계정
        생성·관리와 직원 권한 변경은 관리자 전용입니다.
      </p>
      {account.legacyPermissionDefaults && (
        <p className="permission-notice">
          기존 계정의 접근 범위를 개별 설정으로 유지했습니다. 새 권한등급의
          기본값을 사용하려면 아래 ‘등급 기본값 적용’을 누르세요.
        </p>
      )}
      <button
        type="button"
        className="permission-default-reset"
        onClick={() => {
          if (
            window.confirm(
              `${permissionLevelLabels[level]} 등급의 기본값으로 12개 세부권한을 바꿀까요? 계정 저장 후 반영됩니다.`,
            )
          )
            onChange({
              ...account,
              permissionLevel: level,
              legacyPermissionDefaults: false,
              permissions: {},
            });
        }}
      >
        등급 기본값 적용
      </button>
      <div className="permission-special-features">
        <section aria-label="관리자 전용 기능">
          <h4>
            관리자 전용 기능{" "}
            <small>
              {isAdministrator(account) ? "사용 가능" : "사용 불가"}
            </small>
          </h4>
          <ul>
            <li>
              직원 계정 생성·수정·중지, 비밀번호 재설정, 역할·권한등급·세부권한
              변경
            </li>
            <li>환자 등급명·기준금액·색상 설정</li>
            <li>상담 취소·재작성, 다른 담당자의 상담 수정</li>
            <li>
              다른 작성자의 메모·사진 주석 수정, 담당 의사 제한 없는 의견 답변
            </li>
            <li>OneDrive 연결·저장 폴더 변경, 앱 업데이트 게시</li>
          </ul>
        </section>
        <section aria-label="임원 전용 기능">
          <h4>
            임원 전용 기능{" "}
            <small>
              {canUseExecutiveFeatures(account) ? "사용 가능" : "사용 불가"}
            </small>
          </h4>
          <p>관리자도 함께 사용할 수 있는 등급 기본 기능입니다.</p>
          <ul>
            <li>환자 삭제·복원·병합</li>
            <li>동의서 양식 등록·수정·게시</li>
            <li>암호화 백업 내보내기·OneDrive 원본 복구</li>
          </ul>
        </section>
      </div>
      {!account.active && (
        <p className="permission-notice">
          사용 중지 계정은 로그인할 수 없으며, 아래 권한도 모두 차단됩니다. 등급
          기본값은 계정을 다시 사용할 때의 기준입니다.
        </p>
      )}
      {permissions.map((p) => {
        const { name, text } = descriptions[p];
        const defaultAllowed = defaultPermission(level, p);
        const effective = allowed(account, p);
        const id = `${prefix}-${p}`;
        return (
          <div className="permission" key={p}>
            <div className="permission-description">
              <label htmlFor={id}>{name}</label>
              <p id={`${id}-description`}>{text}</p>
              {p === "export" && (
                <p aria-label="자료별 내보내기 적용 상태">
                  단가표 내보내기:{" "}
                  {effective && allowed(account, "catalog.edit")
                    ? "허용"
                    : "차단"}
                  {" · "}통계 내보내기:{" "}
                  {effective && allowed(account, "stats.read")
                    ? "허용"
                    : "차단"}
                </p>
              )}
            </div>
            <div className="permission-control">
              <select
                id={id}
                aria-describedby={`${id}-description ${id}-effective`}
                value={
                  account.permissions[p] === undefined
                    ? "default"
                    : String(account.permissions[p])
                }
                onChange={(e) =>
                  onChange({
                    ...account,
                    permissions: {
                      ...account.permissions,
                      [p]:
                        e.target.value === "default"
                          ? undefined
                          : e.target.value === "true",
                    },
                  })
                }
              >
                <option value="default">
                  등급 기본값 · {defaultAllowed ? "허용" : "차단"}
                </option>
                <option value="true">허용</option>
                <option value="false">차단</option>
              </select>
              <small
                id={`${id}-effective`}
                className={`permission-effective ${effective ? "is-allowed" : "is-blocked"}`}
              >
                {account.active
                  ? `적용: ${effective ? "허용" : "차단"}`
                  : "적용: 계정 중지로 차단"}
              </small>
            </div>
          </div>
        );
      })}
    </section>
  );
}
