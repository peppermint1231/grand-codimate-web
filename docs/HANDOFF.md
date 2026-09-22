# 코디메이트 개발 인계

## 2026-09-22 상품 관리·취소·의견 요청 사진 — 0.10.1

[사용 안내](RELEASE-0.10.1.md). 상품 행/편집 창의 개별 삭제, 선택 도구 모음의 일괄 삭제를 추가했습니다. 초안에서만 삭제하며 이름·옵션 개수를 확인한 뒤 선택을 해제합니다. 기존 편집 undo/redo와 저장 이력을 재사용하며 과거 상담/게시본은 수정하지 않습니다. Delete는 상품 목록/모달별로 분리하고 글자 입력·폴더 편집·도움말 창을 보호합니다. ? 안내는 명령 레지스트리에서 자동 반영됩니다.

`catalogProducts.ts`는 실제 폴더 경로(링크 포함) 또는 상품명 검색을 기본으로 하고 폴더/상품 전용 모드를 제공합니다. 선택 폴더 필터는 유지하고 전체 폴더 검색으로 확장하는 버튼을 제공합니다. 검색·삭제·이력·키 조합 자동 검증 포함 180개 테스트를 통과했습니다. 최종 배포와 실제 브라우저 검증은 `artifacts/deployment-0.10.1.json`에 기록합니다.

편집 취소는 확인 후 현재 책의 임시 변경과 undo/선택을 지우고 수정 모드를 종료합니다. 수정 재개 버튼과 Alt+Escape 안내를 추가했습니다. `OpinionInbox`는 상담 링크·환자/상담자/요청자·모든 사진 썸네일·전체화면 보기/주석·기존 의견 입력을 제공합니다. `opinion.annotate`는 지정 의사/관리자와 의견/상담 rev, 보류 상태를 검사한 뒤 해당 사진의 본인 주석만 바꿉니다. JSON 필드 순서 차이로 다른 작성자의 원본 주석을 오인하지 않도록 schema로 정규화해 비교합니다. 이전 사진/타인 주석/기존 답변/금액은 유지합니다. 기존 PhotoEditor는 async 저장 성공/오류와 주석 전용 편집을 지원하고 기존 일반 사진 편집 흐름은 유지합니다. 주석 편집의 떠나기 확인 이벤트를 의견 요청 모달로 분리해 배경 단가표 편집 취소와 섞이지 않게 했습니다.


## 2026-09-22 홈페이지 통합 갱신 — 0.10.0

운영 완료: 웹 커밋 `afb519c1624c6604a688c349abc1bb9ee703d07c` 검사/배포 성공. 실제 홈페이지 전체 조회 36배너·663상품, 원본 포스터·모바일·양쪽 미리보기 확인. 통합 명령 `78647cc9-e8d6-42a7-be60-5806050c23db`로 미용/이벤트 두 초안을 OneDrive에 저장했고 동일 명령 재전송도 중복 없이 처리했습니다. 기존 전체 기록과 환자·상담 자료, 미용 상업 필드/배치, 기존 게시본은 보존했습니다. 미전송 0건. 마지막 운영 화면 확인에서 미용 게시 확인/미확인/혼합 색상과 두 최신 초안 표시를 검증했고 읽기 전용 검증 중 State 변경은 없습니다. 미용 907개(홈페이지 출처 연결 447개, 가격/부가세 대조 33개), 이벤트 184개이며 새로운 중복 후보 추가는 없습니다. 새 후보 활성화/게시를 자동 수행하지 않습니다.

APK 0.10.0/versionCode 26, 기존 서명 유지. 내장·운영 파일 46개와 공개 다운로드 SHA-256 `e865b4580809d88f9d011605a389b4e9e6107095e32735866311e001b0f53850` 일치 확인. 배포 전환 중 잠시 이전 HTML이 반환된 후 안정화된 결과를 다시 대조했습니다. 기록: `artifacts/deployment-0.10.0.json`, 실제 저장 전/후 `private/production0100-before.json`/`private/production0100-after.json`, 통합 명령 `private/combined-production-command0100.json`.

미용·이벤트 탭에서 하나의 홈페이지 갱신을 공유합니다. 전체 수집 결과를 한 번 미리 보고 `catalog.website.import` 한 명령으로 두 초안을 저장합니다. 서버는 최근 저장본 ID/rev와 게시본 ID를 양쪽 모두 검사하고 수집 자료를 검증한 뒤 후보를 재계산합니다. 기존 미용 상품의 상업 필드와 배치는 보존하고 `websiteListings`에 게시 여부·원문 가격·가격 차이를 기록합니다. 이전 홈페이지 후보의 출처를 연결하며 이름을 수정한 뒤에도 재갱신 시 중복 추가하지 않습니다. 신규 후보는 최신 저장 미용 분류를 사용합니다. 수정 이력 ID는 책별 접미사를 써 충돌하지 않습니다. 기존 불변 역사 공유/메모리 최적화를 유지합니다.

미용/이벤트 하위 폴더에 게시 확인·제외·미확인·혼합 색상을 적용합니다. 이벤트 대상에서 일반 상품으로 전환된 경우 판매 이벤트는 비활성화하되 홈페이지에는 계속 게시된 것으로 표시합니다. [사용 안내](RELEASE-0.10.0.md). 자동 검증 172개와 실자료 반복 대조를 통과했습니다. 실자료 미리보기는 미용 907개/이벤트 184개, 신규 중복 0개, 미용 가격/부가세 차이 확인 33개이며 자동 가격 수정은 없습니다. 브라우저/배포 최종 결과는 `artifacts/deployment-0.10.0.json`을 확인합니다.


## 2026-09-22 운영 분류·누락 후보 저장 및 메모리 수정 완료 — 0.9.4

웹 `03bd181e7611bb42553b71ea476d8bf770818c8d` GitHub 검사·Cloudflare 배포 성공. 미용 게시본의 16개 대분류 이름·순서·색상에 이벤트/추천기를 맞췄습니다. 홈페이지 전체 36개 배너·663개 상품 대조: 이벤트 182개(일반 실리프팅 배너의 EVENT 20개 포함), 일반 481개. 이벤트 초안은 기존 수동 2개를 포함해 184개이며 분류 확인 6개입니다. 일반 481개에서 기존 상품/옵션 일치 76개 및 홈페이지 내부 동일 이름·가격 중복 1개를 제외하고 404개 비활성 검토 후보를 미용 초안에 추가했습니다(기존 503개 보존, 총 907개, 분류 확인 5개). 이름이 같고 가격이 다른 항목 및 서로 다른 소수 용량·범위는 합치지 않습니다.

기존 미용 게시본·전체 기존 상품 가격/옵션/배치·환자/상담 자료·이력을 보존했습니다. 미용 초안 ID `78c1fa7d-c14e-42ba-87f9-5c38685e7ace`, 이벤트 초안 ID `4dd81079-bb33-49c6-b4ec-fdf9d11112e4`. 이벤트 기존 게시 상품 2개의 분류만 게시했고 새 후보 가격은 자동 게시·활성화하지 않았습니다. 운영 공개 API에서 미용/이벤트 16개 루트 일치·초안 미노출을 확인했습니다. 운영 브라우저의 전체 홈페이지 수집 15개 이벤트 배너·원본 포스터·가격·모바일 검증 성공. 마지막 검증은 읽기 전용이고 자료 변경 없음을 확인했습니다.

0.9.3 저장 시 발생한 메모리 제한을 0.9.4에서 수정한 뒤 원래 작업 ID 3개로 재개했습니다. 모두 OneDrive 저장 완료·미전송 0건. 자동 테스트 164개 및 불변 이력 공유·중복 상태 조회 방지 회귀 통과. APK 0.9.4/versionCode 25 기존 서명·내장/운영 자산 46개·공개 다운로드 SHA-256 `b607d10ef811eea7b94bef014d47fd3aa16177bfc2e61b1e2a5f707531f6a367` 일치. 최종 기록은 `artifacts/deployment-0.9.4.json`, 실행 및 후보 근거는 `private/website-alignment-commands.json`, `private/website-alignment-plan.json`입니다. [분류·게시 색상 사용 안내](RELEASE-0.9.3.md).

## 2026-09-22 미용 기준 분류·개별 EVENT·게시 색상 — 0.9.3

[0.9.3 안내](RELEASE-0.9.3.md). `catalogClassification.ts`는 현재 미용 게시본의 대분류와 실제 상품 배치에서 이벤트 목적지를 찾으며 불확실한 항목은 별도 검토 폴더에 둡니다. 고정된 예전 고민 ID로 되돌리지 않습니다. `websiteBeauty.ts`는 용량·회차를 보존한 상품/옵션 이름·원본 ID로 일반 홈페이지 누락 후보만 추가하며 기존 상품 필드는 유지합니다. 운영 대조 원본·분류 근거·실행 계획은 `private/website-catalog-current.json`, `private/website-alignment-plan.json`에 보관합니다.

수집기는 모든 배너 상세를 읽고 배너/분류/상품 이름의 이벤트·EVENT를 검사합니다. `offerName`은 사용자가 상품명을 변경해도 원문 이벤트 판정을 보존하고 `offerDescription`은 분류 근거에 사용합니다. 이벤트 하위 폴더 게시 색상은 상품의 원본 연결/누락 상태에서 계산하며 대분류 지정 색상을 유지합니다. 추천기에는 게시본만 제공하고 동일 ID의 이벤트 루트 이름·순서·색상을 최신 미용과 맞춥니다. 운영 이벤트/미용 초안 반영 및 배포 검증은 `artifacts/deployment-0.9.3.json`에 기록합니다.

## 2026-09-22 이벤트 수집 초기 로딩 경합 수정 — 0.9.2

운영 완료: 웹 커밋 `80679eecbdbea84c7667ede10c577a5e8c30ed16`의 GitHub 검사·Cloudflare 배포 성공. 운영에서 홈페이지 이벤트 배너 14개의 전체 미리보기, 기간·정가·할인율·할인가 및 원본 포스터 표시, 모바일 가로 넘침 없음을 확인했습니다. 운영 저장 0건·배포 전 전체 State 보존·미전송 0건입니다. 155개 자동 테스트와 초기 로딩 경합 재현 검증 통과. APK 0.9.2/versionCode 23 기존 인증서·내장 및 운영 웹 자산 46개·공개 다운로드 SHA-256 `6caba3f3b5b6d6e963a3563c6af5c3b7926adca54d061021eb089c9379bab7b3` 일치 확인. 배포 결과는 `artifacts/deployment-0.9.2.json`입니다. 운영 단가표의 실제 갱신 저장·검토·게시는 사용자가 진행합니다.

0.9.1 운영 검증에서 로그인 직후 `/state` 응답이 늦으면 이벤트 수집 도중 `current`가 없음→실제 단가표로 바뀌어 `EventCatalogRefresh`가 다시 생성되고 요청이 취소되는 문제를 발견했습니다. 수집 결과는 단가표와 독립적이고 미리보기 병합/저장 시 최신 기준을 재검사하므로 단가표 ID/rev 기반 React key를 제거했습니다. 단가표가 늦게 도착해도 수집을 이어가며, 다른 탭으로 나가면 기존처럼 취소합니다. `scripts/verify-event-loading-092.ts`에서 상태 응답/원본 응답을 의도적으로 겹쳐 재현하고 수정 후 미리보기 완료·저장 0건을 검증했습니다. APK versionCode 23, 버전 0.9.2로 배포합니다. [이벤트 갱신 사용법](RELEASE-0.9.1.md)은 동일합니다.

## 2026-09-22 홈페이지 이벤트 연동 — 0.9.1

[0.9.1 사용 안내](RELEASE-0.9.1.md). 이벤트 SSOT에 홈페이지 갱신 → 미리보기 → 갱신 초안 저장을 추가했습니다. 사용자 확정 규칙은 **배너명 또는 분류명에 ‘이벤트’가 포함**된 항목만 수집하는 것입니다. 일반 가격표는 제외하고 미용/보험 SSOT는 보존합니다. 2026-09-22 실제 14개 배너·162개 상품 수집/저장/포스터 표시를 로컬에서 검증했습니다.

`server/eventCatalog.ts`는 고정 grand4.co.kr 목록/상세 HTML만 Cheerio slim으로 해석합니다. 임의 URL·리다이렉트·2MB 초과·15초 초과·구조 불일치를 거절하고 이미지 본문은 요청하지 않습니다. Workers fetch는 `redirect: manual`을 사용해야 합니다. 이벤트 상세의 개별 옵션 ID/할인가/정가/할인율/기간/설명/포스터 URL을 분리합니다. `src/lib/eventSync.ts`는 페이지 순회·ID 중복 제거·2개 상세 요청 동시 처리·오류 시 전체 미리보기 중단을 담당합니다.

`Product.webEvent`에 원문 메타데이터를 저장하고 `Catalog.eventImport`에 확인시각/수를 기록합니다. `mergeWebsiteEvents`는 이벤트+상품 ID로 기존 상품을 대조하고 원문이 같으면 개별 검토/설정/배치를 유지합니다. 변경 상품은 비활성 검토 초안, 누락 상품은 비활성으로 보존합니다. 가져온 상품은 고민별 상위 폴더 아래 이벤트 폴더에 배치합니다. `catalog.events.import`는 권한·기준 revision·최신 이벤트 단가표·최신 게시본을 검사하고 새 초안 및 이력을 기존 OneDrive 저장 흐름으로 저장합니다. 상담 신규 선택과 추천기는 서울 기준 이벤트 기간을 검사하며 기존 상담 라인은 보존합니다.

검증 자료: `artifacts/events-browser-091.json`, `artifacts/check-091.log`, `artifacts/build-091.log`, 0.9.1은 초기 로딩 문제로 0.9.2로 대체했으며 최종 배포 결과는 `artifacts/deployment-0.9.2.json`. 테스트는 155개이며 원본·정가·할인율 파싱, 범위/미표기 보류, 이벤트 분류 필터, 재갱신·누락·기간·권한·동시 수정·공개 가격·기존 견적 보존을 포함합니다.

## 2026-09-22 직무·권한등급 분리 — 0.9.0

운영 완료: 웹 커밋 `263bf13528f798c4ffd255c1b92b83d801bff6a0`의 GitHub 검사·Cloudflare 배포 성공. 운영 화면에서 4개 직무·3개 등급, 최신 기본값(관리자 전체 허용 / 임원 통계 차단 / 일반 단가표·통계 차단), 자료별 내보내기 상태 연동을 확인했습니다. 실제 계정 저장 0건·기존 유효권한 및 전체 자료 보존·미전송 0건. 자동 테스트 140개 통과. APK 0.9.0/versionCode 21 기존 서명 인증서·내장 및 운영 웹 자산 46개·공개 다운로드 SHA-256 `ebd4c694f1f1455ec06d2f85154a2496af91347486d0aa8543463b048b244fa3` 일치 확인.

[0.9.0 사용 안내](RELEASE-0.9.0.md). 새 직무는 `doctor/coordinator/esthetician/desk`, `User.permissionLevel`은 `admin/executive/standard`입니다. 이전 `role=admin`은 호환 읽기 전용이며 직무 미지정으로 표시합니다. 세부 기본권한은 관리자 12개 허용, 임원은 `stats.read` 차단, 일반은 `catalog.edit`·`stats.read` 차단입니다. 단가표 CSV/XLSX는 `export`+`catalog.edit`, 통계 XLSX는 `export`+`stats.read`를 UI·서버에서 모두 검사합니다. 모든 등급에서 개별 override를 존중합니다. `isAdministrator`/`canUseExecutiveFeatures`를 API·도메인·UI에서 함께 사용하고, 임원에게는 환자 삭제/복원/병합·동의서 양식·백업/복구만 확대했습니다. 임상 의사 기능은 직무 의사 또는 관리자 등급을 검사합니다.

`normalizeUser`는 이전 계정을 읽을 때 레벨과 필요한 override를 만들어 유효권한을 보존하며 암호화 원본을 수정하지 않습니다. 원래 기본 허용이던 `receipt.create`/`followup.edit`를 명시적 true로 만들면 다른 담당자 상담 접근까지 확대되므로, 새 기본값과 다를 때만 override를 생성하고 기존 명시적 값을 보존합니다. 기존 관리자에서 무시되던 개별 false는 삭제해 기존 실제 허용을 보존합니다. 계정 저장 시 새 구조로 저장하고 호환 표시 플래그는 제거합니다. 자기 관리자 강등/중지 및 관리자 없는 복구를 차단합니다. 클라이언트 refresh에서도 최신 로그인 사용자 권한을 갱신합니다.

140개 테스트와 실제 로컬 계정 생성·재로그인 UI 검증 통과. 운영에서는 계정을 저장하지 않고 UI 및 이전 유효권한·환자/상담 데이터 보존을 검증합니다. 결과는 `artifacts/deployment-0.9.0.json` 참고.

## 2026-09-22 직원 권한 설명 — 0.8.6

운영 완료: 웹 커밋 `2ca2d96187557d6d2d626c424179cb995c6bebaa`의 GitHub·Cloudflare 검사 성공. 운영 설정에서 12개 설명, 역할별 기본값과 개별 설정 변경의 적용 상태, 관리자 예외와 계정 중지 상태, 모바일 표시를 확인했습니다. 실제 계정 저장 0건·전체 State 보존·미전송 0건. 기존 테스트 124개 통과. APK 0.8.6/versionCode 20 기존 서명 인증서·내장 및 운영 웹 자산 46개·공개 다운로드 SHA-256 `7b1fcce0749c546f1fd93ad13f29f026ce6f60372d02d0374516902c2b26c55a` 일치 확인.

[0.8.6 사용 안내](RELEASE-0.8.6.md). 사용자가 채팅 설명 대신 실제 설정 화면에서 설명이 보이도록 요청했습니다. `AccountPermissions`가 12개 권한의 설명과 역할 기본값·현재 적용 상태를 표시합니다. 판정은 기존 `allowed`를 재사용하며 권한 정책·저장 API를 변경하지 않았습니다. 관리자 우선 적용, 중지 계정 차단, 계정 저장 후 반영을 안내합니다. 설명과 선택지를 label/aria-describedby로 연결하고 모바일에서는 세로 배치합니다. 확인 자료는 `artifacts/permissions-local-086.json`, 운영·APK·배포 기록은 `artifacts/deployment-0.8.6.json`입니다.

## 2026-09-22 편집 단축키 확장·폴더 단계 이동 — 0.8.5

운영 완료: 웹 커밋 `204d7a53dd466a3d5b6d91a01586370734367f7f`의 GitHub 검사·Cloudflare 배포 성공. 실제 운영에서 편집 시에만 보이는 ? 안내, 키보드 폴더 생성 및 좌·우 단계 이동을 임시 실행한 뒤 취소했습니다. 전체 기존 State 보존·공개 미반영·미전송 0건 확인. 자동 테스트 124개와 새 단축키·기존 공유 링크 브라우저 검증 통과. APK 0.8.5/versionCode 19 기존 인증서·내장 및 운영 자산 46개·공개 다운로드 SHA-256 `65a80d071de1d5fca197cca3fc1a6b6f706b69e5e9a3e684592e409b89202b65` 일치 확인.

[0.8.5 사용 안내](RELEASE-0.8.5.md). 편집 모드에만 `?` 안내 배지를 표시하고 기존 상시 단축키 안내를 제거했습니다. `src/lib/catalogShortcuts.ts`의 명령 정의를 버튼 툴팁·단축키 처리·안내에서 함께 사용합니다. 현재 폴더/상품 목록 및 상품 모달별로 명령을 제한하고 입력·IME·확인 창을 보호합니다. 폴더 이름 입력 Enter의 IME 오작동도 방지합니다.

`folderArrowTarget`이 물리 형제 순서와 부모를 기준으로 Alt+방향키의 위치를 구하며, 실제 변경은 기존 `transferFolder`로 수행합니다. 위/아래는 형제 순서, 왼쪽은 부모 뒤로 꺼내기, 오른쪽은 이전 형제 안으로 넣기입니다. 링크의 가상 자식은 원본에서 이동해야 합니다. 경계에서 브라우저 히스토리 이동을 차단하고 이동 후 폴더 초점을 복원합니다. 전체 상품에서 신규 상품의 미지정 폴더로 저장이 실패하던 오류도 실제 첫 폴더를 지정해 해결했습니다.

검증 자료: `artifacts/catalog-shortcuts-085.json`, `artifacts/check-085.log`, `artifacts/links-regression-085.log`; 배포·APK·운영 확인 결과는 `artifacts/deployment-0.8.5.json`으로 기록합니다.

## 2026-09-22 공유 폴더 링크·단가표 단축키 — 0.8.4

운영 완료: 웹 커밋 `89138c0c6000070ecfac6bbd202bd9f8cd6d26c1`의 GitHub 검사·Cloudflare 배포 성공. 실제 단가표에서 키보드로 링크를 임시 생성하고 링크 아이콘으로 원본 이동한 뒤 취소했습니다. 저장 전 공개 미반영·전체 기존 State 보존·미전송 0건 확인. 운영 링크·단가표 저장은 하지 않았습니다. APK 0.8.4/versionCode 18 서명·기존 인증서·내장 및 운영 자산 46개·공개 다운로드 SHA-256 `bd6447737117a1b41c9fbaaa143f70733e91cce44c31e1e8ad35559ebbb13c58` 일치 확인.

[0.8.4 사용 안내](RELEASE-0.8.4.md). `CatalogFolder.linkTo`는 같은 단가표의 실제 폴더 ID를 참조합니다. 상품은 실제 원본 `folderId`에만 저장합니다. 표시 트리의 연결된 자식은 `~`로 구분한 가상 ID를 사용하며 저장 모델에는 넣지 않습니다. `displayFolderNodes`/`productFolderPaths`로 링크 위치에서도 계층·상품을 탐색하고 `sourceFolderId`로 실제 수정 위치를 해석합니다. 추천기 응답에 모든 분류 경로 `folders`를 추가하고 기존 `folder`를 유지합니다. 상품/옵션 ID는 그대로이며 다중 경로가 상품을 복제하지 않습니다.

링크 아이콘은 원본으로 이동합니다. 링크 삭제는 원본을 보존하고 원본 삭제/덮어쓰기 시 관련 링크를 경고 후 제거합니다. 원본 병합 시 참조를 다시 연결하고 복사 범위 내부 참조는 복사 원본으로 대응합니다. 서버에서 원본 부재·링크 체인·순환·깊이·비정상 상품 소속을 검사합니다. 표시 결과는 5,000개 노드로 제한합니다. Ctrl/Cmd+S, 폴더 F2/C/X/V/Alt+V/Delete, 상품 A 단축키와 상단 안내를 추가했습니다.

119개 자동 테스트와 `scripts/verify-catalog-links-084.ts` 통과. 기존 복원 테스트의 날짜 의존성을 고정된 저장 시각으로 수정했습니다. 운영 자료 보존·APK·배포 결과는 `artifacts/deployment-0.8.4.json` 참고.

## 2026-09-21 편집 실행 취소·저장 이력 선택 — 0.8.3

운영 완료: 웹 커밋 `3cb12d06ffe3bd2d4f799ec82cb34175e2eb6f28`의 GitHub 검사·Cloudflare 배포 성공. 실제 운영에서 폴더 이름 임시 편집의 undo/redo·취소, 이력 모달/Escape, 상품 검토 입력 가능, 전체 기존 State 보존·미전송 0건을 확인했습니다. 운영 단가표 저장·복원은 하지 않았습니다. APK 0.8.3/versionCode 17 서명·기존 인증서·내장 및 운영 자산 46개·공개 다운로드 SHA-256 `49147f9b704afd5cb3b69af84357bd08d0aefa86038f9615c3f456b5ec186260` 일치 확인.

[0.8.3 사용 안내](RELEASE-0.8.3.md). 상품 다중 선택 이동 성공 후 선택 해제(버튼/포인터 공통), 폴더·상품 편집의 40단계 되돌리기/다시 실행과 키보드, 저장 이력 목록 모달을 구현했습니다. `useCatalogUndo`는 단가표/버전/편집 모드별 작업에 적용하며 입력 묶음, 새 분기 시 redo 제거, 저장/취소 초기화를 지원합니다. 저장 시점을 복원하는 `CatalogHistory`는 별도 조회·선택·복원 창으로 내부 스크롤과 초점 복귀를 지원합니다. 서버 저장 형식은 그대로입니다.

`scripts/verify-catalog-undo-083.ts`에서 이동 두 방식의 선택 해제, 폴더와 상품 undo/redo·Ctrl/Meta 단축키·입력 묶음·새 분기·저장 초기화, 이력 창 크기/키보드/모바일/복원 완료를 검증했습니다. 배포 및 운영 자료 보존 결과는 `artifacts/deployment-0.8.3.json` 참고.

## 2026-09-21 단가표 목록 가독성·검토 진입 — 0.8.2

운영 완료: 웹 커밋 `34b0822ab38d013538e2b8c600ded76d3a25cbe8`의 GitHub 검사·Cloudflare 배포 성공. 운영에서 목록 접기/펼치기, 상품 검토 입력 활성화, 저장 전 공개 미반영·편집 취소·전체 기존 State 보존·미전송 0건 확인. APK 0.8.2/versionCode 16의 서명·기존 인증서·내장 및 운영 웹 자산 46개·공개 다운로드 SHA-256 `5a498706fa45ba3909456ce964c73ab8f4d6f987227596a0616bfbc997132eef` 일치 확인. 운영 상품 검토 저장이나 시험 접수는 수행하지 않았습니다.

[0.8.2 사용 안내](RELEASE-0.8.2.md). 폴더 제목·버튼 줄바꿈, 아이콘 제거·이름 텍스트 색상과 5개 프리셋, 폴더 계층/상품 분류/옵션 시각 구분, 양쪽 목록 전체 접기·펼치기를 추가했습니다. 폴더는 초기 접힘, 상품 옵션은 초기 펼침이며 하위 선택 상태가 접힘을 강제로 해제하지 않습니다. 게시 상품의 이름·검토 버튼을 누르면 로컬 수정 초안을 열고, 모달에서 초안 저장 후 별도 게시합니다. 폴더 작업 중이나 권한이 없으면 읽기 전용입니다. 검토 완료·판매 비활성 상태를 구분합니다.

`scripts/verify-catalog-ui-082.ts`에서 최소/기본 너비, 텍스트 색상·프리셋·공개 동기화, 접힘 기본값·선택 하위 접기, 게시본 상품 검토·초안 저장·재열람·게시, 태블릿·모바일 넘침 없음을 확인했습니다. 자동 테스트 113개 통과. 운영 자료는 테스트 저장 없이 확인하며 최종 배포는 `artifacts/deployment-0.8.2.json` 참고.

## 2026-09-21 폴더 편집·변경 이력 — 0.8.1

운영 완료: 웹 커밋 `0b4e18d7c7ef3e1592c383b3d890befc757ed1eb`의 GitHub 검사·Cloudflare 배포 성공. 새 패키지 설치 후 113개 테스트·빌드를 재검증했고 운영 웹 자산 46개와 APK 내장 자산이 로컬 빌드와 일치합니다. APK 0.8.1/versionCode 15 다운로드 SHA-256 `d5fce51056e6d97a1ef3039c90a08f8404cf6e3a55f71c3d1cade06e00f085a4`. 실제 관리 화면에서 폴더 이름을 임시 변경한 뒤 취소하여 저장 전 공개 미반영과 전체 기존 State 보존·미전송 0건을 확인했습니다. 운영 단가표 저장이나 시험 접수는 하지 않았습니다. 실제 미용 503상품/1,014옵션의 폴더 저장 이력 암호화 왕복도 로컬에서 확인했습니다(암호화 작업 크기 539,643바이트).

[0.8.1 사용 안내](RELEASE-0.8.1.md). 격벽 너비 조절, 명시적인 폴더 편집 모드, 인라인 이름·색상, 포인터 드래그 순서/부모 이동, 재귀 병합·덮어쓰기·복사·삭제 경고를 구현했습니다. `folderTree`가 있으면 최상위까지 편집한 구조를 사용하고 이전 자료는 기존 `folders`+기본 고민 목록으로 해석합니다. 폴더 저장은 새 게시본과 `catalogRevisions`를 한 암호화 작업으로 기록합니다. 초안 저장·게시·폴더 저장·복원에 변경 내역과 스냅샷을 남기며 초안 복원은 새 초안, 게시본 복원은 새 게시본입니다. 복원 스냅샷은 단가표 편집 권한자에게만 노출합니다.

추천기는 게시 구조의 이름·색·순서·세부 폴더를 사용합니다. 고민 ID는 단가표 구분을 포함하며 이전 웹 요청의 ID도 호환합니다. 환자 접수에 선택 당시 분류 이름을 저장합니다. 자동 검증 113개와 `scripts/verify-folders-081.ts` 브라우저 검증 통과. APK 0.8.1/versionCode 15 서명·내장 웹 자산 46개 확인. 실제 단가표 내용 변경 없이 기능 업데이트이며 운영 확인은 편집 후 취소 방식으로 진행합니다. 최종 배포 결과는 `artifacts/deployment-0.8.1.json`, `artifacts/folders-production-081.json` 참고.

## 2026-09-21 세 SSOT·맞춤 시술 찾기 — 0.8.0

운영 완료: 웹 커밋 `4e2d30018a69ab3d31cbcefa09b7b53d1e1dc76f`의 GitHub 검사·Cloudflare 배포 성공, 운영 HTML/자산과 로컬 빌드 일치, APK 0.8.0/versionCode 14 다운로드·동일 인증서·내장 자산 46개 일치를 확인했습니다. SHA-256 `4d9960c7afbd409011799902eaba9b9921a9725a645ab868f102310479b94da1`. 미용 503상품/1,014옵션, 보험 4/4, 이벤트 2/13 게시 완료(전부 가격 검토 대기·비활성 유지). 공개 후보 494개, 기존 임상 기록·게시본 보존, 저장 폴더 코디메이트, 미전송 0건. 운영 브라우저에서 3개 SSOT·환자용 목록·이벤트 13옵션·모바일 넘침 없음·웹/태블릿 링크를 확인했습니다. 실제 환자 접수나 가상 운영 상담은 생성하지 않았습니다. `artifacts/deployment-0.8.0.json`, `artifacts/production-browser-080.json`, `private/three-ssot/result.json` 참조.

[0.8.0 변경 기록](RELEASE-0.8.0.md) 참고. 첨부 `index.html`의 13개 고민·40개 질문을 기준으로 분류했으며 보험용 피부·손발톱 진료를 추가했습니다. 미용·보험·이벤트 독립 게시본, 구분별 상담 탭과 혼합 장바구니, 고정 상위 분류 아래 3단계 폴더와 다중 상품 손잡이 이동, 모든 옵션 인라인 표시를 구현했습니다. `Catalog.book` 없는 이전 자료는 미용으로 해석하며 가격 스냅샷은 유지합니다. 단가표 복구와 기존 저장 폴더 재연결은 유지합니다.

공개 `/discover`와 `?kiosk=1`은 같은 게시 SSOT에서 선택적으로 공개된 상품만 사용합니다. 내부 원본 근거는 공개 응답에 포함하지 않습니다. 접수는 OneDrive `_codimate/inquiries`의 암호화 가변 파일이며 30일 만료 정리·복구·재시도 중복 방지를 지원합니다. 직원 연결 시 한 작업으로 환자·상담을 만들고 미확정 항목은 메모에 남깁니다. 원내 태블릿은 3분 미입력 시 초기화합니다.

자동 테스트 104개, 웹 빌드, Worker 배포 사전 검사, `scripts/verify-discovery-080.ts`(서로 다른 단가표의 중복 ID 포함), 기존 `scripts/verify-workspace-050.ts` 사진 회귀 검증을 수행했습니다. 실제 단가 원본·등록 작업은 `private/three-ssot`, 브라우저 캡처는 `private/browser080`에 있습니다. 보험은 가격 미확정 초안 4개이며, 이벤트는 기존 원본의 명시적 이벤트 13개 옵션입니다. 배포/운영 등록 결과는 후속 검증 기록을 확인합니다.

## 2026-09-21 저장 폴더 설정 — 0.7.2

운영 완료: 웹 최종 커밋 `157c987fbd788b4418fea45b814aff3e154ffbdf`의 GitHub 검사·Cloudflare 배포가 성공했습니다. 기존 `코디메이트` 폴더를 검증해 앱 저장 경로를 재연결했고, 변경 전후 전체 운영 State 일치·기존 사진 3장 바이트 일치·미전송 0개를 확인했습니다(2026-09-21 04:59 UTC). APK 0.7.2/versionCode 13 다운로드·서명·기존 인증서·내장 자산 46개 일치도 확인했습니다. APK SHA-256 `7148b84fcb99a9ce6ccde005ff7da2b106d91873b7d5d3fa6200e0b5684aba76`. 단가표 암호화 기록의 현재 위치는 `코디메이트/_codimate/commits`입니다.

사용자가 설정에서 OneDrive 최상위 폴더 이름을 바꾸고 `상담`을 `코디메이트`로 변경하기를 요청했습니다. 설정 → 연결·복구에 현재 위치·이름 입력·미용/보험 경로 미리보기·변경 버튼을 추가했습니다. 관리자 전용 `/api/storage`는 대기 작업을 먼저 저장하고 폴더 전체를 ID로 이름 변경합니다. 기존 파일 ID와 모든 하위 자료를 유지하며 새로운 저장·복구 경로를 함께 변경합니다. 충돌·다른 기기의 설정 변경·복구 대기 상태에서는 변경을 차단합니다.

OneDrive 루트 `.codimate-storage.enc`에 폴더 ID를 암호화하여 이름 변경 전에 저장합니다. 서버에 변경 중인 폴더 ID를 기록하며 다음 인증 요청에서 실제 원격 이름을 조회해 응답 유실을 처리합니다. 새 서버는 OAuth 연결 때 locator로 현재 폴더를 찾아 복구합니다. 과거 미디어 경로·업로드 예약은 현재 루트로 해석하고 다운로드는 기존 파일 ID를 사용합니다. 과거 원본 JSON 내부의 경로 문자열은 당시 경로이며 현재 위치는 앱 설정에서 확인합니다.

운영 확인 시 OneDrive 폴더는 이미 `코디메이트`였고 앱 경로만 `상담`으로 남아 있었습니다. 외부 이름 변경 후 재연결 분기를 추가했습니다. 현재 서버의 저장 완료 작업 전체 파일명·최신 암호화 기록 내용·관리자 계정·기존 사진 ID의 상위 폴더를 대조해야 재연결할 수 있습니다. 검증 실패 시 기존 설정을 유지합니다.

자동 테스트 91개와 TypeScript·웹 빌드, 브라우저 입력 검증·저장·재열람·세로 화면 검증 통과. 브라우저에서 찾은 health 응답이 state의 저장 위치를 덮어쓰는 초기 로드 경쟁도 수정했습니다. `scripts/verify-storage-settings.ts`, `artifacts/storage-settings-browser.json` 참고. 배포·APK·운영 이름 변경 결과는 `artifacts/deployment-0.7.2.json`, `artifacts/storage-root-production.json`에 별도 기록합니다.

## 2026-09-21 운영 SSOT 등록·게시 완료

사용자가 등록·게시를 지시했고 비공개 관리자 인증 파일을 직접 입력했습니다. 입력된 아이디의 영문 o/숫자 0 오타를 사용자가 앞서 지정한 실제 등록 아이디로 바로잡아 로그인했습니다. 비밀번호·토큰은 출력하거나 Git에 포함하지 않습니다.

운영에 기존 게시 상품이 없음을 확인한 뒤 검토 항목 505개·옵션 1,027개를 등록·게시했습니다. 게시 catalog ID는 `71492ccd-761e-444c-8bcb-83d0f8b510ec`, 버전은 `2026-09-21T04:32:48.629Z-9a640b28`입니다. 게시 후 운영 API에서 최신 게시본·전체 상품 내용 일치, OneDrive 연결, 미전송 작업 0개를 확인했습니다. 부가세와 가격 확인은 미해결이므로 활성 판매 상품은 0개입니다. 운영 게시와 판매 활성화를 구분해야 합니다. 사용자 편집은 단가표 관리에서 게시본을 복제한 초안으로 진행합니다.

실행 도구는 `private/publish-reviewed-catalog.ts`, 결과는 `private/catalog-publish-result.json`, `artifacts/catalog-publish-status.json`입니다. 인증 정보는 `private/production-admin-auth.json`(권한 0600)에 있으며 값은 출력하지 않습니다. 검토 원본 JSON은 감사·재현을 위해 비활성 초안 그대로 보존했습니다. 아래의 미등록·인증 대기 설명은 이 등록 전 시점의 기록입니다.

## 2026-09-21 SSOT 후보 검토 — 0.7.1

[0.7.1 변경 기록](RELEASE-0.7.1.md)이 최신입니다. 사용자 지시는 후보 검토까지이며 부가세는 일괄 기준 없이 항목별 확인입니다. 원본 29시트·3,760셀과 기존 1,043개 가격 후보 전수를 대조했습니다. 검토 초안은 상품/안내 505개·옵션 1,027개, 부가세 미확정 1,026개, 부가세 외 확인 조건 190개 옵션, 고정 가격 미기재·범위 15개입니다. 모든 상품은 비활성이고 운영 단가표 등록·게시를 수행하지 않았습니다. 운영 관리자 로그인 세션은 확보하지 않은 상태입니다.

비공개 산출물: `private/catalog-reviewed.json`, `private/catalog-reviewed.report.json`, `private/단가표_후보검토_2026-09-21.xlsx`, `private/단가표_후보검토_2026-09-21.md`. 재현은 `private/review-catalog.py` → `private/review-catalog-finish.py` → `npx tsx private/verify-catalog-review.ts` → `npx tsx private/export-catalog-review.ts`입니다. 원본 값·출처·검토용 스크립트는 공개 저장소에 올리지 않습니다. `private/catalog-tax-policy.json`은 사용자의 항목별 부가세 확인 지시를 보관합니다.

모델에 `Option.tax = unknown`을 추가했습니다. 초안에는 허용하고 활성 상품 게시·견적 계산에서는 거부합니다. 원본 가져오기·새 옵션·붙여넣기는 미표기 부가세를 unknown으로 보관합니다. UI에는 검토 필터, 옵션별 원본 근거, 계산 단위 입력을 추가했습니다. 79개 테스트와 원본 가격/셀·기존 후보 전수 추적 검증, 실제 검토 초안의 로컬 UI 저장·재열람·수정·세로 화면 검증을 통과했습니다. 브라우저 재현은 `LD_LIBRARY_PATH=/tmp/codimate-browser-deps/root/usr/lib/aarch64-linux-gnu npx tsx private/verify-catalog-review-browser.ts`이며 운영 데이터로 시험하지 않습니다.

아래 0.7.0은 local `867b058`, web `c011077046726e31a3d71286c19747b0a8329bed`로 게시·검증을 완료했습니다. 아래는 과거 기록입니다.

## 2026-09-21 중간·연장상담 리뷰 — 0.7.0

[0.7.0 변경 기록](RELEASE-0.7.0.md)이 최신입니다. 기준 상담·현재 단가 미리보기, 연장 단위 갱신, 독립 사진 복사와 열 배치 유지, 중간 완료/중단 및 성공 건수 구분을 반영했습니다. `renewalQuote`를 시작창과 서버에서 함께 사용합니다. `Consultation.sourceRev`와 명령의 `sourceRev`로 기준 상담 생성/확정 충돌을 검사하며 취소된 기준 상담의 연장 확정을 차단합니다. 명시적으로 최신 상태를 다시 확인한 뒤에는 현재 버전으로 확정할 수 있습니다.

신규 `tests/followup-review.test.ts` 11개를 포함한 74개 자동 테스트, `scripts/verify-followup-070.ts` 브라우저 검증을 수행했습니다. 브라우저에서 독립 사진 편집, 미리보기·현재 단가, 다른 기기 변경 후 409 충돌, 새로고침 후 확정, 연장 거절, 수동 상태 재열람, 미용/보험 진행 상태를 확인했습니다. 증거는 `artifacts/followup-070-verification.json`, APK/배포는 `artifacts/apk-verification-0.7.0.txt`, `artifacts/deployment-0.7.0.json`입니다.

사용자가 SSOT 단가표의 준비 상태를 질문했습니다. 저장 구조와 수정 UI는 구현되어 있지만 원본 전체를 운영용으로 입력·검수·게시 완료한 것은 아니라고 답했습니다. 494개 상품/1,043개 가격은 비공개 변환 후보이며 후보 전체의 운영 등록 여부를 확인하지 않았습니다. 다음 우선 작업은 SSOT 후보의 관리 UI 연결과 실제 수정·저장·게시·상담 연동 검증입니다. 원본 가격·검토 목록을 공개 GitHub에 올리지 않습니다. 아래는 과거 버전 기록입니다.

## 2026-09-21 상담·견적 리뷰 — 0.6.0

[0.6.0 변경 기록](RELEASE-0.6.0.md)이 최신입니다. 상담 상품 검색·전체 상품 접근, 견적 계산 오류 시 이전 합계 노출/출력, 읽기 전용 화면의 할인 단위·확정·최신 단가 변경, 로그아웃 후 빈 화면을 수정했습니다. 서버에서 중복 견적 항목·상품 ID·게시본 버전도 검증합니다. 기존 계산 및 과세 정책은 유지합니다.

`tests/consultation-review.test.ts`의 신규 9개를 포함해 63개 자동 테스트가 통과했습니다. 신규 브라우저 검증은 `scripts/verify-consultation-060.ts`, 결과는 `artifacts/consultation-060-verification.json`입니다. 이전 견적 스냅샷은 새 단가표 게시 후에도 유지되며, 성공/실패 확정과 다른 직원의 읽기 전용 화면을 확인했습니다. APK·배포 증거는 `artifacts/apk-verification-0.6.0.txt`, `artifacts/deployment-0.6.0.json`에 기록합니다.

단가표 변환 후보의 확인 목록은 `private/catalog-review-060.md`입니다. 이 문서에는 원본 단가표 내용이 있으므로 공개 저장소에 게시하지 않습니다. 494개 상품·1,043개 가격 후보 모두 검토 대기이며, 실제 판매 가격 확정은 별도입니다. 다음 기능 리뷰 범위는 중간·연장상담과 패키지 진행 상태입니다. 아래는 과거 버전 기록입니다.

## 2026-09-21 사진 설정·터치 스크롤 수정 — 0.5.1

현재 구현 기준은 [0.5.1 변경 기록](RELEASE-0.5.1.md)입니다. 글자 크기 슬라이더와 투명도 백분율, 상담 종류 다음에 오는 이력 썸네일, 편집기 상단 저장 버튼을 추가했습니다. `PhotoEditor`의 같은 저장 버튼을 헤더 컨테이너에 포털로 표시하여 상태·권한·저장 동작을 공유합니다. 비교 뷰어는 사진 자체에서 드래그를 시작하지 않으며 이동 손잡이에서만 정렬합니다.

최신 브라우저 검증은 `scripts/verify-workspace-050.ts`에 추가했습니다. APK·배포 증거는 `artifacts/apk-verification-0.5.1.txt`, `artifacts/deployment-0.5.1.json`입니다. 아래는 과거 버전 기록입니다.

## 2026-09-21 사진 편집·비교·여러 대표사진 — 0.5.0

현재 구현 기준은 [0.5.0 변경 기록](RELEASE-0.5.0.md)입니다. 01 사진 탭은 명시적으로 편집을 열 때만 전체화면 편집기를 표시하며, 02 상담은 비교 뷰어를 기본으로 사용합니다. 드래그 순서 변경은 `PhotoOrder`에서 고정된 슬롯을 기준으로 미리보기 후 한 번 적용합니다. 텍스트는 저장과 같은 `paintPhoto`로 미리보기를 렌더링합니다. 대표사진의 단일 선택 제한을 제거했으며 이력은 여러 정사각형 contain 썸네일을 표시합니다.

54개 자동 테스트와 TypeScript·웹 빌드, 최신 브라우저 검증 `scripts/verify-workspace-050.ts`를 통과했습니다. 증거는 `artifacts/workspace-050-verification.json`, `artifacts/workspace-050-*.png`입니다. 0.4.0 브라우저 스크립트는 이전 UI 기준이므로 현재 흐름 검증에는 0.5.0 스크립트를 사용합니다. APK 서명·기존 인증서·내장 자산 검증은 `artifacts/apk-verification-0.5.0.txt`, 게시 검증은 `artifacts/deployment-0.5.0.json`에 기록합니다. 실제 Android 태블릿 설치·터치 확인은 별도입니다. 아래 절은 과거 버전 기록입니다.

## 2026-09-21 사진 편집 유실 방지 APK — 0.4.1

사용자의 APK 반영 요청에 따라 아래 사진 전환 회귀 수정을 0.4.1 / Android versionCode 7에 반영했습니다. [0.4.1 변경 기록·설치 링크](RELEASE-0.4.1.md)를 참고합니다. 기존 0.4.0과 서명 인증서 일치, 내장 웹 파일 46개 일치, APK 서명·버전 검증을 완료했습니다. APK는 17,529,841 bytes이며 SHA-256은 `cb29ff668bd1b205feb7fdc84b15397423f2a97b5d81b637f8bb2231ed482b10`입니다. 51개 자동 테스트·타입 검사·웹 빌드를 재확인했습니다. 게시 후 실제 다운로드·업데이트 API 확인은 `artifacts/deployment-0.4.1.json`에 기록합니다.

## 2026-09-19 이전 세션 인계·사진 전환 회귀 수정

이전 대화의 사용자 요청 33개·통합 개발 계획·최종 보고를 대조해 [세션 인계 문서](SESSION-HANDOFF-2026-09-19.md)에 정리했습니다. 이 절과 연결 문서가 현재 로컬 작업 상태의 기준이며, 아래는 버전별 과거 기록입니다.

사진 선택 해제/순서 변경 시 최초 편집 사진의 미저장 변경이 확인 없이 사라지는 문제를 재현하고 수정했습니다. 로그인 복원 검증의 Android 버전 모의값도 현재 릴리스 정보와 연결했습니다. 51개 자동 테스트·타입 검사·웹 빌드 및 수정된 사진 편집/로그인 복원 Chromium 검증을 통과했습니다. 이번 수정은 로컬에만 있으며 커밋·운영 배포·APK 재빌드는 하지 않았습니다. 실기기·실제 병원 OneDrive 검증은 남아 있습니다.

## 2026-09-19 사진 편집 흐름 개선 — 0.4.0

등록 아이디 선택, 새로고침/Android 앱 내 뒤로가기, 편집기 스크롤/좌측 선택 사진, 비교 전용 열 설정·화면 채움, 애니메이션 순서 변경, 텍스트 설정창, 모든 주석 선택/이동/수정, 사진별 저장 분리, 점선/고정 프레임 크롭, 대표사진·사진 삭제를 구현했습니다. 사용법과 실기기 체크리스트는 [0.4.0 변경 기록](RELEASE-0.4.0.md)을 참고합니다. 51개 테스트 및 최신 브라우저 시험 통과. APK 빌드·서명 검증 완료(versionCode 6). 기존 0.3.0과 서명 인증서 일치 및 내장 웹 파일 46개 일치.

- 웹 main `e823c89a63f3a27a5209baa1ba910e85e5041e03`, Worker `919b851f-6a65-462b-8398-f109d67ad4e5` 배포 완료. GitHub/Cloudflare 검사 성공, 원격 파일 22개 Git blob 일치, 운영 HTML·JS·CSS 일치, health 0.4.0 및 공개 업데이트 정보 확인. 아이디 목록 API의 최소 응답 형식도 확인했습니다.
- [APK 0.4.0 다운로드](https://raw.githubusercontent.com/peppermint1231/grand-codimate-web/main/releases/codimate-0.4.0.apk): 17,529,797 bytes, SHA-256 `4f15927368b37608a70f7d4f7de723ce808ed5689abecaefe7082e630678f13d`. 실제 HTTPS 다운로드 해시 일치. 배포 증거는 `artifacts/deployment-0.4.0.json`.
- 사진 편집은 PhotoEditor 내부 작업 상태 → 사진 편집 저장으로 상담 draft 반영 → 상담 저장으로 서버 반영의 세 단계입니다. 사진 draft는 상담을 나가면 마지막 상담 저장 상태로 돌아옵니다. 오프라인 상담 저장 명령은 기존 전송 큐에 유지합니다. 다른 작성자 주석이 있는 사진 삭제는 관리자만 가능합니다.
- 프레임 크롭은 기존 crop(원본 좌표)과 별개인 viewportCrop(회전 결과 좌표)을 저장해 원본/주석을 유지합니다. 선택 주석은 모든 점을 함께 이동·확대합니다. 대표사진은 Photo.representative이며 상담당 한 장으로 검증합니다.
- 최신 UI 시험 `scripts/verify-editor-040.ts`: 텍스트 크기 조절, 일반 주석 이동/수정/삭제, 두 손가락 이벤트, 투명 주석 설정에도 보이는 기본 크롭, 고정 프레임 회전/크기/출력, 사진 저장 분리, 대표사진/삭제를 확인했습니다. 화면/JSON 증거는 `artifacts/editor-040-*`. Android 로그인 복원 브리지 모의 시험도 재검증했습니다.
- Android MainActivity에 OnBackPressedDispatcher 연결을 추가했습니다. 실제 태블릿 시스템 뒤로가기·제스처와 병원 OneDrive 동작은 실기기 확인이 필요합니다. Android 원격 저장소는 별도 게시하지 않았으며 최신 소스와 web commit 고정 파일을 `artifacts/repositories/grand-codimate-android`에 준비했습니다.
- 실행한 개발 서버와 Gradle 데몬을 종료했습니다.

## 2026-09-19 UI·환자 관리·로그인 유지 — 0.3.0

사용자 요청 9개를 구현했습니다. [0.3.0 사용법·체크리스트](RELEASE-0.3.0.md)를 참고합니다. 15분 무활동 로그아웃을 제거하고 30일 세션 및 Android 암호화 토큰 복원을 추가했습니다. 환자 삭제는 기록 보존/복원, 병합은 관리자 승인·상담/수납/사진 연결 유지 방식입니다. 메뉴 접기, 썸네일 오버레이, 두 손가락 제스처, 이동/확대 가능한 텍스트 박스, 한글 폰트, Noto 이모지, 0도 복귀, 구분선 조절을 포함합니다.

46개 테스트, 타입 검사·웹 빌드·Worker dry-run과 `verify-workspace-030.ts`, `verify-login-restore.ts`, 기존 사진 흐름 회귀가 통과했습니다. 실제 브라우저의 두 손가락 이벤트, 텍스트 이동/크기 조절, 스탬프 이미지 출력, 가로/세로 구분선 이동을 확인했습니다. Android 로그인 복원은 브리지 모의 시험으로 확인했습니다.

- 웹 main `de7002f75f34fd795df144251311e6b9d2e30102`, Worker `e579b79c-634d-49c4-a3ff-778be96e1142` 배포 완료. GitHub/Cloudflare 검사 성공, 실제 HTML·JS·CSS·대표 폰트/스탬프가 로컬 빌드와 일치합니다. health는 0.3.0 / onedrive / configured=true / needsSetup=false입니다.
- [APK 0.3.0 다운로드](https://raw.githubusercontent.com/peppermint1231/grand-codimate-web/main/releases/codimate-0.3.0.apk): versionCode 5, 17,524,985 bytes, SHA-256 `23d7a0af8a3ca9da22d3f0eeb7a89d08d24bad70084118880d61524d9c024714`. 기존 0.2.1과 서명 인증서 일치, 서명 검증 및 내장 웹 자산 46개 일치, 실제 HTTPS 다운로드 해시를 확인했습니다. 공개 업데이트 API도 이 APK를 안내합니다.
- 설치 후 한 번 로그인해야 새 30일 세션과 Android 암호화 자격 증명 보관이 적용됩니다. 웹은 HttpOnly 쿠키, Android는 기존 Keystore seal/open을 사용합니다. 오프라인 보관 암호는 저장하지 않으며 설정에서 별도 잠금 해제할 수 있습니다.
- 실제 태블릿의 백그라운드 복귀/핀치/Keystore, 실제 병원 OneDrive 환자 병합은 추가 실기기 시험이 필요합니다. 환자 삭제는 복원 가능한 보관 처리이고, 병합은 관리자만 가능하며 원본 사진 파일은 이동/삭제하지 않고 상담 연결을 유지합니다.
- 배포 증거: `artifacts/deployment-0.3.0.json`, 브라우저 증거: `artifacts/workspace-030-verification.json`, `artifacts/login-restore-verification.json`. Android 원격 저장소는 별도 게시하지 않았습니다.

## 2026-09-19 Android 자동 업데이트 — 0.2.1

앱 시작 시 버전 자동 확인·나중에·수동 재확인·저장/전송 중 설치 차단을 구현했습니다. 공개 배포 API와 기존 앱 업데이트 API가 `releases/android-latest.json`을 기본으로 사용합니다. 관리자 게시 버전이 더 높으면 우선합니다. 현재 APK는 versionCode 4이며 SHA-256은 `db68ca684211a14bfa8d139cf791f9bea54bce1fb38cedf4c589d1028e89d8dc`입니다. 39개 테스트, 브리지 모의 브라우저 시험 및 APK 검증을 마쳤습니다. 웹 main `03f506280bae119d037fab3e06859a0fa21e16ed` 및 Worker `7feb57e4-6f3f-44b2-8bc9-26b68cf33726` 배포 완료. GitHub/Cloudflare 검사 성공, 실제 웹 자산·공개 업데이트 API·Android CORS·다운로드 APK 해시 일치를 확인했습니다. 기존 인증 업데이트 API도 로컬에서 0.2.1 반환을 확인했습니다. 사용 흐름과 실기기 확인 항목은 [0.2.1 변경 기록](RELEASE-0.2.1.md)을 참고합니다.


## 2026-09-19 사진·중간/연장상담 업데이트 — 0.2.0

**APK 다운로드 링크 수정:** 내부 파일 경로 대신 [HTTPS 다운로드](https://raw.githubusercontent.com/peppermint1231/grand-codimate-web/main/releases/codimate-0.2.0.apk)를 제공합니다. GitHub 게시 커밋 `6defa72cc19f804a681241114ee1351baa6c888b`. APK 자체는 기존 0.2.0과 동일하며 설치 파일을 웹 빌드에 포함하지 않도록 `releases/`에 분리했습니다.

이 절이 아래 0.1.1 기록보다 우선합니다. 사용자 웹 시험 피드백과 후속 주소 검색 요청을 반영했습니다. 상세 사용법·기존 자료 호환성은 [0.2.0 변경 기록](RELEASE-0.2.0.md)을 참고합니다.

- 사진 즉시 미리보기/백그라운드 업로드, 썸네일 선택과 자동 비교, 순서 이동·1~4열 저장, 확장 주석 도구·단축키, 중간/연장상담, 진행 상태 자동/수동 전환, 선택적 PDF, 환자별 폴더/촬영 시각 이름, 주소 검색을 구현했습니다.
- 사용자 선택에 따라 회차 숫자는 요구하지 않습니다. 성공하면 진행 중, 연장 성공 시 유지, 연장 미진행 시 완료이며 수동 전환도 가능합니다. 미용/보험은 분리합니다.
- 36개 자동 테스트, 타입 검사·웹 빌드, 로컬 API 시험과 실제 브라우저 흐름이 통과했습니다. 업로드를 4초 지연시킨 작은 합성 이미지 5장의 미리보기는 약 270ms였으며 대용량 실제 촬영 파일 속도를 보장하는 수치는 아닙니다.
- 추가 테스트: `tests/photo-followup.test.ts`, `tests/storage-workflow.test.ts`, `scripts/verify-photo-workflow.ts`. 증거는 `artifacts/photo-workflow-verification.json` 및 화면 캡처·PDF입니다.
- 로컬 브랜치 `codex/photo-followup`에 배포 기준 소스를 첫 커밋으로 보존했습니다. 원격 웹 main `d756c6590b4e29e4eb86bbb9d5cc4b6dd98a8a23` 게시 완료, GitHub 검사 및 Cloudflare 빌드 모두 성공입니다. 운영 Worker 버전은 `b13c53fe-982b-4bd7-8d7f-c73a17a698ab`입니다. 실제 HTML/JS/CSS가 로컬 빌드와 일치하고 health는 version=0.2.0, mode=onedrive, configured=true, needsSetup=false입니다.
- `artifacts/codimate-0.2.0.apk` 생성 완료(versionCode 3). 기존 0.1.1과 서명 인증서 일치, APK 서명 검증, 내장 웹 파일 12개와 dist 일치를 확인했습니다. SHA-256은 `1fe6cb84e2faa05cb1de4a18b56d9e6c26eae7e2ac0b9fef4de41cedc78572e5`입니다. Android 원격 저장소는 아직 따로 게시하지 않았습니다.
- 이전 웹 캐시가 남으면 상담을 저장하고 모든 코디메이트 탭을 닫았다가 다시 엽니다. 이번 버전부터 업데이트 적용 안내가 표시됩니다.
- 실제 병원 계정의 사진 이동·생성 및 개인정보 입력을 자동 시험하지 않았습니다. OneDrive 저장/복구 회귀는 모의 Graph로 확인했습니다. 이전 파일은 삭제하지 않으며 기존 상담을 다시 저장할 때 환자 폴더로 복사합니다.

## 메인 대화 재개 후 최신 상태 — 0.1.1

**클라우드 배포 후속 상태:** GitHub 연결 후 트리 변경 없는 커밋 `e680671298b8df135ecbde5a8c7045e2a0b1158a`으로 최초 빌드를 시작했고 Cloudflare 성공을 확인했습니다. 운영 버전 `aafb5f21-3512-4193-8a21-e1e7f88db800`입니다. 실제 웹 HTML·JS 및 `/api/health`가 정상이며 `mode=onedrive`, `configured=true`, `needsSetup=true`입니다. 다음 사용자 작업은 SETUP_KEY로 최초 관리자 생성 후 Microsoft 연결입니다. 실제 OneDrive 저장·복구 및 태블릿 검증은 아직 미실시입니다. 이 후속 상태가 아래 과거 배포 대기 기록보다 우선합니다.

아래의 사이드채팅 중단 기록은 과거 시점이며 이 절이 우선합니다. 사용자 인계를 받아 메인 대화에서 개발을 재개했습니다.

- `vitest.config.ts`로 정본 테스트만 탐색하고 암호문 변조를 실제 바이트 XOR로 수정했습니다. 현재 **24/24 테스트와 TypeScript·Vite 빌드 통과**입니다.
- PDF 직접 다운로드에도 금액 열람·내보내기 권한을 검사하고, 금액 비공개 응답에서 할인값과 사유도 제거했습니다. 로컬 API 검증에 우회 차단 검사를 추가해 통과했습니다.
- 복구 서버의 OneDrive 연결 시 원본 계정 백업을 덮어쓰거나 임시 관리자를 추가하지 않습니다. 복구가 필요한 서버는 변경 요청을 보류합니다.
- 재구축 시 원본에 없는 계정·파일 인덱스·처리 완료 작업을 제거하고 세션을 만료시킵니다. 원본 관리자 계정으로 다시 로그인합니다. 다른 복구키·활성 관리자 누락 시 기존 서버 상태를 보존하는 회귀 테스트를 포함했습니다.
- 최신 소스로 `artifacts/codimate-0.1.1.apk`를 생성했습니다. versionCode 2이며 기존 영구 서명 키를 그대로 사용했습니다. APK 서명·SHA-256·기존 인증서 일치·내장 웹 파일과 dist 일치를 확인했습니다. 0.1.0 APK도 보존했습니다.
- 로컬 API·브라우저 검증 통과, `npm audit --omit=dev` 보고 취약점 0건입니다. 복구 회귀 테스트는 가짜 Graph 응답과 메모리 SQLite를 사용했으며 실제 OneDrive 시험을 대신하지 않습니다.
- [Cloudflare·Microsoft 최초 연결 안내](CLOUD-SETUP.md)를 추가했습니다. `scripts/prepare-production.mjs`는 비밀값을 출력하지 않고 기존 키를 덮어쓰지 않는 설정 준비 도구입니다.
- 실제 클라우드 배포·OneDrive 연결·태블릿 시험은 여전히 미실시입니다. 아래의 단가표 의미 검수, 게스트 사진 영속 보관, 대량 자료 검색, 관리 UI 보완 및 G마크 작업도 남아 있습니다.
- 루트가 정본이며 루트 Git은 아직 최초 커밋 전입니다. 웹 저장소 `peppermint1231/grand-codimate-web`의 `main`에는 검증된 소스 48개를 최초 게시했습니다(기능 소스 커밋 `135ecbda50ee60c8e466dab94e0c4b1fa4326108`). Git 객체 해시로 게시본과 로컬 파일의 일치를 확인했습니다. Android 원격 저장소는 아직 게시하지 않았습니다.
- 운영 주소는 `https://grand-codimate.peppermint-3.workers.dev`, Microsoft Client ID는 `11716900-1b40-4192-9ca9-b7467519585d`입니다. 사용자는 네 가지 Cloudflare 런타임 Secret 등록 완료를 알려주었습니다. 운영 키는 Git 제외 `private/production-secrets.json`과 입력용 `private/cloudflare-setup-keys.txt`에 보존했습니다. Microsoft 암호는 사용자만 Cloudflare에 입력했으며 로컬 파일에는 빈 암호 항목도 남기지 않았습니다.
- Cloudflare 로컬 인증은 없으며, 다음 사용자 작업은 기존 Worker의 Settings → Builds → Connect에서 웹 저장소/main을 연결하는 것입니다. 빌드 `npm run check`, 배포 `npx wrangler deploy`, 루트 `/`, Node 24입니다. 실제 앱 배포와 OneDrive 검증은 아직 완료되지 않았습니다.
- 운영 APP_ORIGIN을 wrangler 설정에 반영했고 로컬 `.dev.vars`에는 localhost override를 유지했습니다. 한글 폰트는 공식 Google Fonts의 고정 커밋·SHA-256으로 최초 빌드 시 준비하며 기존 APK의 폰트와 동일함을 확인했습니다. 변경 후 24개 테스트·웹 빌드·Worker 배포 dry-run을 통과했습니다. 비밀 파일·개발 DB·기존 서명 키는 보존했습니다.

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

## 0.9.3 운영 저장 중 발견된 메모리 제한 — 0.9.4 수정

실제 운영 State 약 32MB 중 단가표/수정 이력이 대부분이었습니다. 이벤트 분류 게시 후 초안 저장에서 Durable Object 128MB 제한에 걸렸습니다. 첫 작업은 저장 완료, 두 번째는 암호화 작업 대기열에 보존되어 있었고 세 번째 미용 후보 저장은 미실행입니다. 기존 수정 이력은 삭제하지 않습니다.

`applyCommand`는 변경할 단가표만 복제하고 불변인 과거 단가표·이력 snapshot은 공유합니다. 변경 감지에서 동일 객체는 직렬화를 생략합니다. `flush()`는 단가표 저장 때 전체 State를 다시 읽지 않고, 상담 파일 저장에 필요한 환자만 ID로 조회합니다. 입력/수정 이력 불변성 및 전체 상태 중복 조회 방지 회귀 검증을 추가했습니다. 대기 작업은 동일 작업 ID로 재시도하여 중복 생성 없이 완료합니다. 최종 배포 및 운영 적용 증거는 `artifacts/deployment-0.9.4.json`입니다.
