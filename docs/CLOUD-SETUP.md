# 코디메이트 최초 연결 안내

현재 APK는 병원 서버 연결 전 개발판입니다. Cloudflare 계정과 Microsoft 앱 등록이 준비되면 같은 소스로 운영 주소에 배포합니다. 아래 등록만으로 기존 초진설문지 앱의 설정이나 자료를 변경하지 않습니다.

확정된 운영 주소: `https://grand-codimate.peppermint-3.workers.dev`

2026-09-18 확인: HTTP 200, `Hello World!` 기본 Worker 응답. 코디메이트 소스 배포는 아직 하지 않았습니다. 아래 배포 명령과 Microsoft 리디렉션 주소에 확정 주소를 반영했습니다.

## 1. Cloudflare 무료 계정과 웹 주소

1. [Cloudflare 대시보드](https://dash.cloudflare.com/)에서 계정을 만들고 이메일을 확인합니다.
2. **Workers & Pages**로 이동해 무료 Workers 사용을 시작합니다. 유료 Workers 플랜이나 별도 도메인 구매는 필요하지 않습니다.
3. 계정의 `workers.dev` 하위 도메인을 확인·설정합니다. 코디메이트 Worker 이름은 `grand-codimate`입니다. 최종 주소는 `https://grand-codimate.peppermint-3.workers.dev` 형식입니다.
4. 계정 ID와 예정된 전체 HTTPS 주소를 기록합니다. 계정 ID·웹 주소는 비밀번호가 아니므로 설정 지원 시 전달해도 됩니다. API 토큰은 채팅에 보내지 않습니다.

직접 샘플 Worker를 먼저 만든 경우 이름을 `grand-codimate`로 맞춥니다. 소스를 배포하면 SQLite Durable Object도 저장소 설정으로 생성됩니다. 설정의 `REQUIRE_ONEDRIVE`는 운영에서 항상 `true`입니다.

[공식 대시보드 시작 안내](https://developers.cloudflare.com/workers/get-started/dashboard/), [workers.dev 주소 안내](https://developers.cloudflare.com/workers/configuration/routing/workers-dev/).

## 2. Microsoft 앱 등록

사용자가 전달한 등록 정보: 표시 이름 `코디메이트 OneDrive`, 애플리케이션(클라이언트) ID `11716900-1b40-4192-9ca9-b7467519585d`. 서버의 `MICROSOFT_CLIENT_ID`에는 이 값을 사용합니다. 클라이언트 암호·리디렉션 URI·권한의 실제 설정 상태는 아직 확인하지 않았습니다.

OneDrive를 소유한 개인 계정과 **앱을 등록할 권한이 있는 Microsoft Entra 디렉터리**는 구분됩니다. 개인 OneDrive 계정만으로 앱 등록 메뉴를 사용할 수 있다고 보장할 수 없습니다. 기존 초진설문지 앱을 관리하는 디렉터리가 있으면 그곳에 새 앱을 등록하는 방법을 우선 사용합니다. 등록 권한이 없거나 구독·디렉터리 선택에서 막히면 오류 문구만 전달해 주세요. 유료 서비스를 임의로 신청하지 않습니다.

1. [Microsoft Entra 관리 센터](https://entra.microsoft.com/) → **Entra ID → 앱 등록(App registrations) → 새 등록(New registration)**.
2. 이름은 **코디메이트 OneDrive**로 입력합니다.
3. 지원 계정 유형은 **개인 Microsoft 계정만(Personal accounts only)**을 선택합니다. 이 서버는 개인 계정용 `consumers` 인증을 사용합니다.
4. 인증(Authentication)에서 플랫폼 **Web**을 추가하고 다음 리디렉션 URI를 정확히 등록합니다.

   `https://grand-codimate.peppermint-3.workers.dev/api/onedrive/callback`

5. 개요의 **애플리케이션(클라이언트) ID**를 기록합니다. 디렉터리 ID·개체 ID와 혼동하지 않습니다.
6. **인증서 및 비밀(Certificates & secrets) → 새 클라이언트 암호**를 만들고 만료일을 기록합니다. 복사할 것은 **값(Value)**이며 비밀 ID가 아닙니다. 값은 병원 비밀번호 보관함과 서버 비밀 설정에만 입력합니다.
7. API 권한에서 **Microsoft Graph → 위임된 권한(Delegated permissions)**의 `Files.ReadWrite`, `offline_access`, `openid`를 확인합니다. 애플리케이션 권한이나 직원 Microsoft 계정은 필요하지 않습니다.

APK·웹 화면에서 Microsoft에 직접 접속하는 구조가 아니라 서버가 연결하므로 플랫폼은 SPA가 아닌 **Web**입니다. 기존 초진설문지 Client ID를 소스에서 복사하는 것만으로 연결되지 않습니다.

[Microsoft 앱 등록과 선행 조건](https://learn.microsoft.com/en-us/entra/identity-platform/quickstart-register-app), [리디렉션 URI 안내](https://learn.microsoft.com/en-us/entra/identity-platform/reply-url).

## 3. 비밀 설정과 최초 배포

현재 진행 상태: 사용자가 Cloudflare에 `MICROSOFT_CLIENT_ID`와 `MICROSOFT_CLIENT_SECRET` 등록 완료를 알려주었습니다. 이 작업 환경은 아직 Cloudflare에 로그인하지 않았으므로 원격 설정은 직접 검증하지 않았습니다. 운영 키는 Git 제외 파일 `private/production-secrets.json`에 생성했고, 입력용 파일 `private/cloudflare-setup-keys.txt`를 준비했습니다(두 파일 권한 0600). 입력용 파일에서 `ENCRYPTION_KEY`, `SETUP_KEY` 값을 각각 Cloudflare Secret에 등록하고 별도 보관합니다. Microsoft 암호는 Cloudflare에만 있으며 로컬 배포 파일에는 빈 암호 항목을 제거했습니다.

대시보드에서 Microsoft 비밀값을 직접 등록하려면 **Workers & Pages → grand-codimate → Settings → Variables and Secrets → Add**에서 유형 **Secret**으로 `MICROSOFT_CLIENT_ID`와 `MICROSOFT_CLIENT_SECRET`을 각각 추가하고 Deploy합니다. ID 값은 위에 기록된 클라이언트 ID, 암호 값은 Microsoft에서 생성한 Value입니다. 이후 CLI 배포에서 빈 Microsoft 값이 들어 있는 secrets-file을 업로드해 덮어쓰지 않습니다. 이 두 항목만으로 전체 운영 설정이 완료되는 것은 아니며 `ENCRYPTION_KEY`, `SETUP_KEY` 및 소스 배포도 필요합니다.

작업 폴더에서 실행합니다. 아래 명령은 안내이며 현재 실제 클라우드 배포는 수행하지 않았습니다.

```sh
node scripts/prepare-production.mjs
```

이 명령은 Git에서 제외된 `private/production-secrets.json`에 운영용 암호화 키와 최초 설정 키를 생성합니다. 기존 파일이 있으면 유지하며 값은 출력하지 않습니다. 처음부터 CLI로 설정한다면 파일에 `MICROSOFT_CLIENT_ID`, `MICROSOFT_CLIENT_SECRET`을 직접 입력합니다. 이미 Cloudflare에 등록한 항목은 로컬 파일에서 생략할 수 있으며, 빈 값으로 덮어쓰지 않습니다. `ENCRYPTION_KEY`는 OneDrive 복구에 필요하므로 별도로 안전하게 보관합니다. 키를 바꾸면 기존 자료를 읽을 수 없습니다.

Cloudflare 로그인과 배포는 계정 소유자가 인증할 수 있는 터미널에서 진행합니다.

```sh
npx wrangler login
npm run check
npx wrangler deploy --var 'APP_ORIGIN:https://grand-codimate.peppermint-3.workers.dev' --var 'REQUIRE_ONEDRIVE:true' --secrets-file private/production-secrets.json
```

APP_ORIGIN에는 마지막 `/`를 붙이지 않습니다. 배포 주소와 Microsoft 리디렉션 주소의 호스트가 같아야 합니다. OAuth 인증을 쓸 수 없는 원격 터미널은 제한된 Cloudflare API 토큰을 환경변수나 GitHub Secrets로 제공하되 채팅에 붙여넣지 않습니다.

GitHub 배포를 사용할 때는 먼저 준비된 웹 소스를 게시하고 `production` 환경의 Secrets에 `CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID`, Variables에 `CODIMATE_ORIGIN`을 등록합니다. Microsoft 비밀값과 암호화 키는 **Worker의 런타임 Secrets**에도 있어야 합니다. GitHub 배포 토큰과 병원 OneDrive 비밀값은 서로 다른 설정입니다.

[Cloudflare Secrets와 secrets-file 배포](https://developers.cloudflare.com/workers/configuration/secrets/).

## Cloudflare GitHub 연결로 배포하기

사용자가 네 가지 런타임 Secret 등록 완료를 알려주었습니다. 다음 경로는 로컬 Cloudflare 인증이나 별도 GitHub 배포 토큰 없이, 계정 소유자가 Cloudflare에서 저장소 접근을 허용해 사용하는 배포 방법입니다.

1. **Workers & Pages → grand-codimate → Settings → Build(s) → Connect**를 엽니다.
2. GitHub 연결을 허용하고 `peppermint1231/grand-codimate-web` 저장소를 선택합니다.
3. 운영 브랜치 `main`, 루트 디렉터리 `/`, 빌드 명령 `npm run check`, 배포 명령 `npx wrangler deploy`로 설정합니다.
4. 연결을 저장하고 빌드를 시작합니다. Node.js 버전은 저장소의 `.node-version`에서 24로 지정합니다.
5. 런타임 Secret은 기존 Worker에 저장된 값을 사용합니다. 빌드 변수에 Microsoft 암호나 복구키를 다시 입력할 필요가 없습니다.
6. 배포 성공 후 `/api/health`에서 `ok: true`, `mode: onedrive`, `configured: true`를 확인하고 최초 관리자 설정을 진행합니다. 이것만으로 실제 OneDrive 연결 시험이 끝난 것은 아닙니다.

[Cloudflare Workers Builds 연결 안내](https://developers.cloudflare.com/workers/ci-cd/builds/), [빌드 설정](https://developers.cloudflare.com/workers/ci-cd/builds/configuration/).

## 4. 앱에서 병원 저장소 연결

1. 배포 주소를 PC에서 열고 `SETUP_KEY`로 첫 관리자 계정을 생성합니다. 키는 설정 파일에서 확인해 앱에만 입력합니다.
2. 관리자 로그인 → 설정 → 연결 → **Microsoft 계정 연결**.
3. 병원 OneDrive를 소유한 개인 Microsoft 계정으로 로그인하고 요청 권한을 확인합니다.
4. 새 저장소이면 상담 폴더가 생성됩니다. 기존 코디메이트 백업이 있으면 재구축 안내가 표시되며 새 자료 변경은 제한됩니다.
5. 복구 서버에서는 동일한 `ENCRYPTION_KEY`를 사용하고 **OneDrive 원본에서 재구축**을 실행합니다. 완료되면 임시 관리자는 제거되고 모든 세션이 종료되므로 원본에 있던 관리자 계정으로 다시 로그인합니다.
6. 개발 단가표 초안은 관리자 화면에서 가져와 검토합니다. 후보를 일괄 판매 활성화하지 않습니다.
7. APK 첫 화면의 병원 서버 주소에도 같은 HTTPS 주소를 입력합니다.

초기 연결을 확인하는 동안 실제 환자정보 대신 합성 환자·사진을 사용합니다. 태블릿에서 저장한 상담·사진·문서를 PC에서 열고, 업로드 중 연결 끊기와 재시도, 새 서버 복구를 확인한 뒤 실제 자료로 전환합니다. 무료 한도·OneDrive 오류가 생겨도 운영 저장을 개발 모드로 바꾸지 않습니다.

## 준비 완료 후 전달할 내용

- 병원 웹 HTTPS 주소
- Microsoft 앱 등록 완료 여부와 Client ID
- 등록·연결 중 오류가 있으면 오류 문구

Microsoft 비밀번호, Client Secret, Cloudflare API 토큰, SETUP_KEY, 복구키, APK 서명 키는 보내지 않습니다. 이미 연결해 둔 계정의 로그인 화면은 계정 소유자가 직접 완료합니다.
