# 운영 연결·백업·복구

## 배포 전 설정

계정 등록부터 필요한 경우 [Cloudflare·Microsoft 최초 연결 안내](CLOUD-SETUP.md)를 먼저 확인한다.

1. 무료 Cloudflare 계정에서 Workers/Durable Objects SQLite를 사용한다. 요금제를 유료로 변경하지 않는다. API 토큰은 해당 계정 Workers 배포에 필요한 권한만 부여한다.
2. GitHub 저장소의 production 환경에 `CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID`를 secret으로, `CODIMATE_ORIGIN`을 HTTPS 웹 주소 변수로 설정한다. 배포 워크플로를 실행한다.
3. 운영 서버에 `wrangler secret put ENCRYPTION_KEY`, `SETUP_KEY`, `MICROSOFT_CLIENT_ID`, `MICROSOFT_CLIENT_SECRET`을 각각 입력한다. ENCRYPTION_KEY는 32바이트 난수의 base64 문자열이다. **별도 보관한 이 키가 OneDrive 원본 복구키다.** 로컬 개발 키를 운영에 재사용하지 않는다.
4. Microsoft Entra 앱에 개인 Microsoft 계정 로그인을 허용하고 Web 리디렉션 URI를 `https://병원주소/api/onedrive/callback`으로 등록한다. 위임 권한 `Files.ReadWrite`, `offline_access`를 사용한다. 병원 개인 OneDrive 소유 관리자가 직접 로그인한다.
5. 첫 화면에서 SETUP_KEY로 관리자 생성 후 설정 → OneDrive 연결. 직원 계정은 코디메이트 관리자가 만든다. Microsoft 토큰은 직원 앱에 보내지 않는다.
6. 운영 환경은 `REQUIRE_ONEDRIVE=true`를 유지한다. Cloudflare 무료 한도 또는 OneDrive 장애 때 저장 확정이 실패하면 기기 대기 자료를 보존하고 재시도한다. 로컬 개발의 false 설정으로 장애를 우회하지 않는다.
7. 29시트 단가표 초안을 관리자에게 가져와 판매 옵션·과세 기준·충돌 가격을 검토한다. 등급 기준 미설정이면 미분류다. 동의서는 병원 검토 후 게시한다.

Cloudflare 무료/SQLite 제한은 [공식 제한 문서](https://developers.cloudflare.com/durable-objects/platform/limits/)를 따른다. 현재 레코드 크기 제한에 맞춰 압축 후 암호화하며, 전체 병원 자료의 검색/집계 규모는 실제 사용량으로 확인해야 한다.

## Android 서명과 설치

`ANDROID_KEYSTORE`, `ANDROID_STORE_PASSWORD`, `ANDROID_KEY_PASSWORD`, `ANDROID_KEY_ALIAS` 환경변수로 영구 병원 키를 지정한다. GitHub에서는 키 파일을 base64로 인코딩한 `ANDROID_KEYSTORE_B64`를 secret에 넣는다. APK와 키는 공개 저장소에 함께 올리지 않는다. 버전 코드는 매번 증가시킨다.

```sh
npm run android:sync
android/gradlew -p android assembleRelease --console=plain
```

APK 설치 후 첫 화면에 운영 HTTPS 웹 주소를 입력한다. 설정의 APK 게시 화면에는 빌드된 APK 주소·버전·SHA-256을 입력한다. 앱은 파일을 내려받아 해시를 검사한 후 Android 설치 화면으로 연결한다. 기존 설치를 삭제하지 않아야 암호화 기기 자료와 키가 유지된다. 실제 Android 기기에서 업그레이드 보존 검증 후 직원에게 배포한다.

## 저장 상태

- 기기 초안 저장됨: 신뢰 기기 보관이 켜진 현재 기기에만 있는 변경이다.
- 동기화 대기: 서버 전송이 완료되지 않은 작업이다. 같은 작업 ID로 재전송한다.
- OneDrive에 저장했습니다: 필요한 원본 커밋의 OneDrive 업로드 확인 후 서버 인덱스가 반영되었다.
- 개발 서버: OneDrive 미연결 테스트 저장이며 병원 운영 완료 상태가 아니다.

인터넷이 끊겼을 때 이전 온라인 세션의 12시간 이내에 보관 암호로 잠금 해제할 수 있다. 웹은 신뢰하는 병원 기기에서만 암호화 보관을 켠다. 계정 비밀번호와 기기 보관 암호는 별개다. 기기 보관 암호 분실 시 기기 미전송분은 복호화할 수 없다. 계정이 비활성화되면 서버 확정은 막히며 기기 자료를 삭제하지 않는다.

## OneDrive 원본과 복구

- `상담/미용`, `상담/보험`: PDF와 상담별 사진.
- `상담/_codimate/commits`: 변경 원본. 작업 ID·처리자·내용 해시와 자료 변경분을 압축·암호화한 파일. 서버 반영 전에 기록한다.
- `상담/_codimate/media`: 사진/PDF의 환자 상담 연결 메타데이터.
- `상담/_codimate/accounts`: 비밀번호 해시 및 계정 권한의 암호화 백업.

복구 순서:

1. OneDrive 폴더 사본과 복구키를 별도로 보존한다. 덮어쓰기 전에 기존 서버 백업도 보관한다.
2. 새 서버에 **동일한 ENCRYPTION_KEY**를 설정하고 임시 복구 관리자 생성 후 같은 OneDrive를 연결한다.
3. 대기 서버 작업이 있으면 먼저 재시도한다. 설정 → 원본에서 재구축 실행.
4. 커밋을 순서대로 읽어 자료와 중복 방지 작업 ID를 복구하고 사진/계정 연결 정보를 복원한다. 원본에 없는 임시 계정·미디어 인덱스·완료 작업은 제거한다. 활성 관리자 없는 백업이나 다른 키로 암호화된 백업은 기존 서버에 반영하지 않는다.
5. 복구 완료 시 모든 서버 세션이 만료되므로 **원본에 있던 관리자 계정**으로 다시 로그인한다. 기존 기기의 미전송 자료는 삭제하지 않는다. 기기에서 다시 보낸 완료 작업은 실적으로 재계산되지 않는다.
6. 환자 수·상담 수·수납/환불 총액·등급·서명·사진 원본을 백업과 대조한다. 이 과정의 실제 클라우드 복구 시험이 운영 전 필수다.

관리자의 암호화 백업 내보내기는 서버 색인/계정/미디어 연결의 추가 보관 수단이다. 사진/PDF 원본은 OneDrive 사본으로 별도 백업해야 한다. OneDrive 동기화 자체가 삭제·랜섬웨어에 대한 독립 백업을 대신하지 않는다.

## 두 GitHub 저장소 구성

현재 작업 폴더는 웹/서버/Android를 함께 검증하는 형태다. `node scripts/export-repositories.mjs`가 `artifacts/repositories/`에 두 저장소의 게시 준비 폴더를 만든다. 실제 원격 게시 전 아래처럼 분리한다.

- `grand-codimate-web`: 이 프로젝트에서 Android를 제외한 공통 코드와 서버, 웹 배포 workflow.
- `grand-codimate-android`: Android 폴더, 공통 웹 저장소의 **40자리 커밋 SHA**를 저장하는 `shared-revision.txt`, APK workflow.
- Android workflow에서 해당 SHA의 웹 저장소를 체크아웃해 `npm ci && npm run build`를 실행하고 native 폴더를 결합한 뒤 `cap sync android`와 Gradle을 실행한다. main 브랜치의 최신 내용을 자동 추적하지 않는다.

Android 준비 폴더의 `shared-revision.txt`는 의도적으로 미설정 상태이며 웹 원격 커밋 생성 뒤 실제 SHA를 넣어야 빌드된다. 현재 두 원격 저장소에 대한 코드 게시·Secrets 설정·실제 배포는 수행하지 않았다. 소스 압축 파일에 `private`, `.dev.vars`, `.wrangler`, 실제 단가표, 환자자료, 서명 키를 포함하지 않는다.
