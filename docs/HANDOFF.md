# 메인 대화 인계 — 코디메이트 개발 중단 시점

## 메인 대화 재개 후 최신 상태 — 0.1.1

아래의 사이드채팅 중단 기록은 과거 시점이며 이 절이 우선합니다. 사용자 인계를 받아 메인 대화에서 개발을 재개했습니다.

- `vitest.config.ts`로 정본 테스트만 탐색하고 암호문 변조를 실제 바이트 XOR로 수정했습니다. 현재 **24/24 테스트와 TypeScript·Vite 빌드 통과**입니다.
- PDF 직접 다운로드에도 금액 열람·내보내기 권한을 검사하고, 금액 비공개 응답에서 할인값과 사유도 제거했습니다. 로컬 API 검증에 우회 차단 검사를 추가해 통과했습니다.
- 복구 서버의 OneDrive 연결 시 원본 계정 백업을 덮어쓰거나 임시 관리자를 추가하지 않습니다. 복구가 필요한 서버는 변경 요청을 보류합니다.
- 재구축 시 원본에 없는 계정·파일 인덱스·처리 완료 작업을 제거하고 세션을 만료시킵니다. 원본 관리자 계정으로 다시 로그인합니다. 다른 복구키·활성 관리자 누락 시 기존 서버 상태를 보존하는 회귀 테스트를 포함했습니다.
- 최신 소스로 `artifacts/codimate-0.1.1.apk`를 생성했습니다. versionCode 2이며 기존 영구 서명 키를 그대로 사용했습니다. APK 서명·SHA-256·기존 인증서 일치·내장 웹 파일과 dist 일치를 확인했습니다. 0.1.0 APK도 보존했습니다.
- 로컬 API·브라우저 검증 통과, `npm audit --omit=dev` 보고 취약점 0건입니다. 복구 회귀 테스트는 가짜 Graph 응답과 메모리 SQLite를 사용했으며 실제 OneDrive 시험을 대신하지 않습니다.
- [Cloudflare·Microsoft 최초 연결 안내](CLOUD-SETUP.md)를 추가했습니다. `scripts/prepare-production.mjs`는 비밀값을 출력하지 않고 기존 키를 덮어쓰지 않는 설정 준비 도구입니다.
- 실제 클라우드 배포·OneDrive 연결·태블릿 시험은 여전히 미실시입니다. 아래의 단가표 의미 검수, 게스트 사진 영속 보관, 대량 자료 검색, 관리 UI 보완 및 G마크 작업도 남아 있습니다.
- 루트가 정본이며 Git 최초 커밋·원격 게시도 아직 하지 않았습니다. 비밀 파일·개발 DB·기존 서명 키는 보존했습니다.

## 사이드채팅 중단 당시 기록

## 사용자 최신 요청과 중단 범위

사용자는 전체 통합 개발 계획 구현을 요청했다. 이후 **“Cloudflare·Microsoft 등록은 아직 없으므로 설정 안내가 필요하다. 현재 작업을 안전하게 중단하고 메인 대화로 인계할 요약을 작성하라. 변경사항은 보존하라”**고 요청했다.

따라서 추가 기능 개발·수정·배포는 중단했다. 이 문서 작성과 프로세스 종료, 로그 보존만 수행했다. 아직 운영 완성판이 아니며, 메인 대화에서 사용자의 재개 지시에 따라 이어가야 한다.

## 작업 위치·Git 상태

- 작업 폴더: `/home/ubuntu/projects/codimate`
- 브랜치: `master` — 초기 커밋이 없는 unborn 브랜치.
- Git 커밋·푸시·원격 배포는 하지 않았다. 모든 새 소스가 untracked 상태로 작업 폴더에 남아 있다. `git clean`, hard reset, 폴더 재생성 금지.
- 원격 목적지: `https://github.com/peppermint1231/grand-codimate-web`, `https://github.com/peppermint1231/grand-codimate-android`.
- 현재 로컬은 공통 웹/서버/Android를 같이 검증하는 구조다. 분리 준비 폴더가 있으나 아래 설명처럼 원본보다 오래되었다.
- 환경: Linux ARM64, Node 24, npm 11, Java/Android 도구는 별도 로컬 경로에 준비. sudo 없이 실행했다.

## 신규·수정 파일

처음에는 빈 저장소였으므로 아래 파일은 대부분 신규 작성이다. 전체 목록은 `docs/HANDOFF-FILES.txt`에 보존했다.

- `src/core/model.ts`: 환자·상담·가격표·금액 원장·등급·의견·서명·권한 타입.
- `src/core/domain.ts`: 서버와 UI 공통 할인/VAT 계산, 환자·상담 상태, 권한 검사, 수납/환불/정정, 등급, 가격표 검증/게시, 서명 검증.
- `src/core/excel.ts`: 단가표 카테고리별 XLSX, 통계 XLSX, 자료 교환 CSV.
- `src/App.tsx`, `src/style.css`, `src/main.tsx`: 환자목록/상세, 상담, 가격표 관리자, 통계, 설정, 복구자료 UI. App.tsx가 커서 후속 리팩터링 권장.
- `src/components/PhotoEditor.tsx`: 사진 렌더링·주석·회전·영역 자르기·undo/redo·서명.
- `src/lib/api.ts`: API, 작업 ID, 암호화 IndexedDB, 사진 대기 전송, 복구자료.
- `src/lib/documents.ts`: 한글 PDF·환자용 JPG·파일명.
- `src/lib/native.ts`: Capacitor 카메라/방향/Keystore/인쇄/APK 설치 브리지.
- `server/worker.ts`: Durable Object API, SQLite, 인증·세션·권한·중복 방지, 업로드/복구/백업/업데이트.
- `server/crypto.ts`: scrypt 비밀번호 해시, 압축 후 AES-GCM 암호화.
- `server/drive.ts`: 개인 OneDrive Microsoft OAuth/Graph 연결.
- `scripts/import-catalog.ts`, `verify-import.ts`: XLSX 변환과 원본 셀 대조.
- `scripts/verify-api.ts`, `verify-browser.ts`: 로컬 합성 자료 API/브라우저 검증.
- `scripts/setup-local.mjs`, `provision-signing.mjs`, `build-local-apk.mjs`, `export-repositories.mjs`: 초기 설정, 서명 키, APK 빌드, 두 저장소 준비 폴더.
- `tests/domain.test.ts`, `tests/excel.test.ts`, `tests/crypto.test.ts`.
- `android/`: Capacitor 프로젝트. `ClinicDevicePlugin.java`에 Keystore·인쇄·SHA-256 확인 후 APK 설치 구현. `MainActivity.java`에 플러그인 등록/스크린샷 방지. Manifest backup 비활성. `app/build.gradle` 환경변수 기반 release 서명.
- `.github/workflows/check.yml`, `deploy.yml`, `android.yml`: 검증, 설정된 웹 수동 배포, APK 수동 빌드.
- `package.json`, `package-lock.json`, `vite.config.ts`, `tsconfig.json`, `capacitor.config.ts`, `wrangler.jsonc`, `.gitignore`, `.env.example`, `index.html`.
- `public/fonts/NotoSansKR.ttf`, `OFL.txt`: 한글 PDF/화면용 글꼴 및 라이선스.
- `README.md`, `docs/IMPLEMENTATION.md`, `docs/OPERATIONS.md`: 실행·현황·설정/복구 안내. 최신 상태는 이 HANDOFF 문서를 우선한다.

## 구현된 범위와 실제 확인 범위

- 환자 등록·검색·기본정보·상담 스냅샷·중복 후보·관리자 병합·메모·타임라인.
- 환자별 계약/수납/환불/기여매출/미수금, 등급 정책과 수동 고정. 담당자·날짜·상담 상태 필터 추가.
- 사진/상담/견적 탭, 가로·세로 배치·분할선·비율, 사진 촬영/업로드/선별/주석/회전/자르기/비교.
- 상품 옵션 장바구니, 할인·부가세 공통 계산과 서버 검증. 과거 가격·환자 정보 보존.
- 관리자 JSON 초안 가져오기·옵션/가격/세금/설명/구성 편집·표 편집·여러 행 붙여넣기·선택 가격 조정·비활성·게시·복제 복원·카테고리 Excel·CSV.
- 의사 의견 요청/답변과 본인 주석 저장. 동의서 초안/게시/확인/서명/내용 해시·재서명 검사.
- 한글 병원용 PDF와 환자용 JPG, 인쇄 연결.
- 서버 계정/권한/세션, 작업 ID 중복 방지, 원본 OneDrive 커밋 이후 서버 확정, 원본 기반 재구축 코드.
- 암호화 기기 저장/상담 초안/대기열/사진, PWA 셸 캐시, 자동 잠금, 충돌 자료 나란히 보기.
- Android 카메라·회전·Keystore·인쇄·업데이트 연결 및 서명 APK 생성.

**OneDrive/Cloudflare 실서비스 연결은 전혀 검증하지 않았다.** 로컬 `.dev.vars`의 `REQUIRE_ONEDRIVE=false`로 개발 저장만 시험했다. UI도 개발 서버라고 표시한다. 실환자 데이터는 만들지 않았고 테스트 환자·검증 상품만 개발 DB에 생성했다.

## 원본 단가표·변환 결과

- 최초 원본은 CSV가 아닌 `/home/ubuntu/.codex/attachments/b1198983-caa7-4990-adfe-cf458cc0af4e/grand_price_chart.xlsx`.
- 전체 29개 시트, 1,058개 유효 행, 3,760개 비어 있지 않은 대표 셀을 보존·대조했다.
- 변환 결과: 상품 후보 494개, 가격 후보 1,043개.
- `private/catalog-import.json`, `private/catalog-import.report.json`.
- 상품/가격의 의미를 전부 확정한 것은 아니다. 원본 불규칙 표에서 추출한 **검토 후보**이고 전부 비활성/검토 필요다. 원본 설명/회차 자료는 references에 보존했다.
- 리팟 충돌 가격, 정가/이벤트/원내가 관계, 패키지/멤버십 구조화, 과세 기준의 실제 검수가 필요하다. 494개를 판매 가능한 상품 수로 설명하면 안 된다.

## 산출물

`artifacts/`는 Git 제외 디렉터리다.

- `artifacts/codimate-0.1.0.apk`: 약 13MB, release 서명, versionCode 1, versionName 0.1.0. 처음 실행 시 병원 HTTPS 서버 주소를 입력한다. 서버가 없어서 현재 운영 기능을 바로 사용할 수 있는 APK는 아니다.
- `artifacts/codimate-0.1.0.apk.sha256`, `apk-verification.txt`: 해시 및 APK Signature Scheme v2 검증 성공.
- **APK는 중단 시점의 최신 소스보다 이전 빌드다.** 이후 환자 필터/CSV/복구 UI/의존성/입력검증 등 변경이 있었으므로 재개 시 최신 소스로 웹 빌드 → cap sync → release 재빌드/검증해야 한다.
- `artifacts/코디메이트_단가표_검토초안.xlsx`: 카테고리별 내보내기 검토본. 실제 운영 게시본 아님.
- `artifacts/01-patients-landscape.png`~`04-catalog-admin.png`: 합성 환자 기반 화면 캡처.
- `artifacts/sample-consultation.pdf`, `sample-quote.jpg`: 합성 자료 출력 예시.
- `artifacts/import-verification.json`, `api-verification.json`, `browser-verification.json`.
- `artifacts/repositories/grand-codimate-web`, `grand-codimate-android`: 두 저장소 게시 준비 폴더. **루트 최신 소스보다 오래된 복사본이다. 정본은 프로젝트 루트다.** 재개 시 exporter를 다시 실행해야 한다.
- Android 준비 폴더의 `shared-revision.txt`는 미설정 placeholder다. 웹 저장소 실제 커밋 후 40자리 SHA를 넣어야 해당 workflow가 동작한다. 임의 SHA로 꾸미지 않았다.

## 테스트와 마지막 실패 — 반드시 읽을 것

이전에 성공한 검사:

1. `npm run check`: 정본 테스트 20개(도메인 17, Excel 1, 암호화 2)와 TypeScript/Vite/PWA 빌드 통과.
2. `npx tsx scripts/verify-import.ts <원본.xlsx>`: 29시트/3,760셀 대조 성공.
3. `npx tsx scripts/verify-api.ts`: 게시·환자 상담 연결·서버 가격 검증·사진 업로드 재시도·확정·분할 수납·중복 수납 차단·일부 환불·초과 환불 차단·취소/환불/내보내기 권한·금액 비공개 성공.
4. Playwright `scripts/verify-browser.ts`: 로그인·환자 등록·상담 저장·사진 업로드/회전·가로/세로·PDF/JPG·관리자 화면 성공. 사진 좌표 변환의 역행렬 round trip 검사 포함.
5. Android `assembleDebug` 및 서명된 `assembleRelease` 성공. apksigner verify 성공. 실기기 설치/실행 시험은 하지 않음.

**가장 마지막 `npm run check`는 실패했다. 성공으로 보고하면 안 된다.**

- `scripts/export-repositories.mjs`가 artifacts 아래에도 tests 복사본을 만들었는데 Vitest 기본 탐색에서 이를 제외하지 않아 20개가 아니라 40개를 실행했다.
- 결과: 6개 테스트 파일 중 5개 통과, 1개 실패 / 40개 중 39개 통과, 1개 실패.
- 실패: `artifacts/repositories/grand-codimate-web/tests/crypto.test.ts`의 변조 검사.
- 현재 테스트는 base64 암호문의 첫 글자를 무조건 `A`로 바꾼다. 원래 첫 글자가 `A`이면 변조하지 않은 셈이어서 복호화가 정상 성공하고 rejects assertion이 실패한다. 정본 `tests/crypto.test.ts`에도 같은 불안정한 테스트 코드가 있다.
- 재개 시 `vitest.config.ts` 또는 테스트 명령으로 `tests/**/*.test.ts`만 탐색하게 하고 artifacts를 제외한다. 변조는 디코딩한 암호문 바이트 하나에 XOR 1을 적용하는 식으로 실제 변경을 보장한다.
- 사용자가 중단을 요청했으므로 이 두 문제는 **고치지 않고 인계**한다.
- 마지막 check는 테스트 단계 실패로 끝났으므로 그 실행의 후속 TypeScript/Vite 빌드는 실행되지 않았다. 최신 입력검증 변경까지 포함한 전체 재검증이 필요하다.
- `docs/IMPLEMENTATION.md`의 “20개 통과”는 이전 성공 기록을 뜻한다. 최신 실패 판단은 이 문서/최종 로그를 우선한다.

전체 로그는 `/tmp/codimate-*.log`와 `artifacts/handoff-logs/`에 보존했다. 특히 `codimate-check.log`, `codimate-types.log`, `codimate-browser.log`, `codimate-api-check.log`, `codimate-gradle.log`, `codimate-release.log`.

## 종료한 명령·현재 프로세스 상태

중단 전 실행했던 서버/캐시:

- `npm run api` → Wrangler localhost:8787.
- `npm run dev` → Vite localhost:5173.
- Gradle 8.14.3 daemon, Kotlin compile daemon, esbuild/workerd 하위 프로세스.

사용자 요청 후 이 작업에서 시작한 프로세스에 SIGTERM을 보내 종료했다. 테스트/릴리스 빌드 명령은 이미 완료된 상태였다. `artifacts/handoff-processes.txt`에 최종 확인 결과를 기록했다. 종료 후 자동으로 재시작하지 않았다.

## 보존한 비밀·개발 데이터 — 값은 출력하지 말 것

- `.dev.vars`: 로컬 ENCRYPTION_KEY/SETUP_KEY, REQUIRE_ONEDRIVE=false. Git 제외/0600.
- `private/local-setup.json`: 생성한 로컬 관리자 로그인 정보. `private/test-session.json`: 개발 세션. 값은 채팅/로그/Git에 출력하지 말 것.
- `.wrangler/`: 로컬 SQLite와 개발 서버 상태. 삭제하지 말 것.
- `/home/ubuntu/.codex/keys/codimate/codimate-release.jks`: 이번에 만든 영구 release 서명 키.
- `/home/ubuntu/.codex/keys/codimate/signing.json`: 서명 키 경로/alias/password. 디렉터리 0700, 파일 0600으로 보존. **앱 업데이트에도 같은 키를 사용해야 한다.** 소스/공개 GitHub에 포함 금지.
- `private/`, `artifacts/`, `.dev.vars*`, `.wrangler/`, keystore, native 빌드 결과는 .gitignore에 포함되어 있다. 공개 GitHub에 실제 단가표·환자·인증정보를 올리지 않는다.

## 빌드 환경 재사용 정보

- Java: `/tmp/codimate-android-tools/root/usr/lib/jvm/java-21-openjdk-arm64`
- Android SDK: `/tmp/codimate-android-tools/sdk` (platform 36, build-tools 35/36)
- AAPT2 ARM 호스트용 실행 래퍼: `/tmp/codimate-android-tools/aapt2` — qemu-x86_64-static과 별도 x86 libc 사용.
- TLS trust store: 위 Java의 `lib/security/cacerts`; Java 도구는 명시적인 trustStore/기본 CA store password 옵션이 필요했다. 이것은 병원 서명 키 암호가 아니다.
- Playwright 브라우저 라이브러리: `LD_LIBRARY_PATH=/tmp/codimate-browser-deps/root/usr/lib/aarch64-linux-gnu`.
- Gradle/npm/Playwright 캐시는 보존했다. `/tmp` 도구는 환경 초기화 시 사라질 수 있다. GitHub Actions x86 러너에서는 이 qemu 래퍼가 필요 없다.

재개 명령 예시(지금 자동 실행하지 말 것):

```sh
# 1. 위 테스트 범위와 변조 테스트부터 수정 후
npm run check
# 2. 별도 터미널에서
npm run api
npm run dev
# 3. 통합 확인
npx tsx scripts/verify-api.ts
LD_LIBRARY_PATH=/tmp/codimate-browser-deps/root/usr/lib/aarch64-linux-gnu npx tsx scripts/verify-browser.ts
# 4. 최신 APK
npx cap sync android
JAVA_HOME=/tmp/codimate-android-tools/root/usr/lib/jvm/java-21-openjdk-arm64 \
JAVA_TOOL_OPTIONS='-Djavax.net.ssl.trustStore=/tmp/codimate-android-tools/root/usr/lib/jvm/java-21-openjdk-arm64/lib/security/cacerts -Djavax.net.ssl.trustStorePassword=changeit' \
CODIMATE_AAPT2=/tmp/codimate-android-tools/aapt2 \
node scripts/build-local-apk.mjs
```

## 남은 일·다음 담당자 우선순위

1. 사용자가 원하는 **Cloudflare 무료 계정/Workers·Microsoft 개인 계정용 앱 등록/OneDrive 연결 설정 안내**부터 준비. 아직 등록/주소/Client ID가 없다. 비밀키를 채팅으로 요구하지 않는다.
2. 마지막 테스트 범위/불안정 변조 검사를 수정하고 정본 전체 재검증. 최신 APK/저장소 준비 복사본을 다시 생성한다.
3. 실제 OneDrive 연결 뒤 태블릿 → OneDrive → PC 재열람, 중단·토큰 만료·용량 부족·중복 전송·원본 재구축을 검증한다. 현재 이 핵심 운영 목표는 아직 미검증이다.
4. 29시트 상품 의미·가격 관계·과세·패키지/멤버십을 정리/검수해 게시 가능한 SSOT로 완성한다. 지금은 검토 후보와 원본 추적 구조까지다.
5. 게스트 촬영 영속 암호화 보관, 게시 전 상세 변경 비교·상담 미리보기, 구조화 패키지/멤버십 UI, 관리자 인계 확정·조회 감사, 과거 메모 버전 UI 등을 보완한다.
6. 현재 서버는 전체 상태를 읽어 클라이언트에서 검색/통계 처리한다. 서버 페이지 검색/인덱스·장기 데이터 규모·복구 작업 분할이 남아 있다. 파일당 8MB 제한, PDF 파일명에 항상 ID 접미사가 붙는 차이도 있다.
7. 사진 원본 보존과 주석 변환, 오프라인 대기열, 권한 변경 후 복구, 서명 변경 후 재서명 경로를 실기기로 검증한다. 코드 구현과 운영 검증 완료를 구분한다.
8. 기존 G마크 원본을 확보/확인 후 날개 아이콘을 만든다. 지금 아이콘은 Capacitor 기본 개발 아이콘이고 UI 심볼은 임시다.
9. 병원 검토된 동의서·등급 기준 설정, 태블릿 2대·PC 1대·프린터 시험, 두 원격 저장소 게시/공통 커밋 고정/실제 웹 배포는 아직 안 했다.
10. 마지막 npm 설치에서 ExcelJS 하위 uuid를 `^11.1.1`로 override했다. 이전 audit의 uuid 취약점 대응이며 최신 production audit 및 전체 의존성 검증을 다시 확인할 것. 전체 install 출력에 dev 포함 moderate 5건이 남아 있었다.

추가 코드 리뷰 포인트: guest 사진은 현재 창 메모리뿐, 다운로드/조회 감사 전체 경로, 오래된 local draft를 최신 rev로 잘못 덮어쓰지 않는지, 복구 이후 계정/미디어/작업 ID 일관성, stale 서명 표현, 테스트 출력물의 실제 한글·다중 페이지 인쇄. 작업을 “완성” 또는 “실제 OneDrive 저장 검증 완료”로 설명하지 말 것.
