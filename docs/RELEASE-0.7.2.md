# 코디메이트 0.7.2

설정 → 연결·복구에 OneDrive 저장 폴더 설정을 추가했습니다. 현재 위치와 변경 후 미용·보험 경로를 확인하고 `코디메이트로 입력` → `저장 폴더 변경`을 누르면 최상위 폴더의 이름을 변경합니다. 관리자만 변경할 수 있으며 병원 전체에 적용됩니다.

기존 사진·상담 기록·단가표·계정·복구 기록을 포함한 폴더 전체를 이름 변경합니다. 기존 파일 ID를 유지하며 새 저장과 복구는 변경된 경로를 사용합니다. 같은 이름의 다른 파일·폴더는 덮어쓰지 않습니다. 미전송 작업 저장이 실패하면 이름 변경도 진행하지 않습니다.

OneDrive에서 먼저 폴더 이름을 바꿔 이전 위치가 없는 경우, 보관된 작업 기록 전체 목록·최신 기록 내용·현재 관리자 계정·기존 사진의 실제 소속 폴더를 대조한 뒤 앱 저장 경로를 다시 연결합니다.

이름 변경 응답이 유실되면 다음 요청에서 폴더 ID로 실제 위치를 확인합니다. 새 서버 복구를 위해 OneDrive 최상위의 `.codimate-storage.enc`에 암호화한 폴더 ID를 보관합니다. 이 파일도 백업에 포함해야 합니다. 과거 기록 안의 경로는 기록 당시 이름일 수 있으며 앱은 파일 ID와 현재 저장 폴더를 사용합니다.

이름 변경은 Microsoft Graph의 [파일·폴더 메타데이터 수정 API](https://learn.microsoft.com/en-us/graph/api/driveitem-update?view=graph-rest-1.0)를 사용합니다.

검증: 자동 테스트 91개, TypeScript·웹 빌드, 설정의 입력 검증·저장·새로고침·세로 화면 브라우저 검증. 재현: `scripts/verify-storage-settings.ts`. OneDrive 모의 서버에서 기존 사진 조회·새 업로드·중복 이름·통신 중단·복구 경로·관리자 권한을 검증했습니다.

[Android APK 다운로드](https://raw.githubusercontent.com/peppermint1231/grand-codimate-web/main/releases/codimate-0.7.2.apk) · versionCode 13.
