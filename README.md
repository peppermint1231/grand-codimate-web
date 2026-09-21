# 코디메이트

[0.8.3 폴더 편집·단가표 변경 이력](docs/RELEASE-0.8.3.md)

안드로이드 태블릿과 PC 웹에서 사용하는 병원 상담 통합 개발판. 실제 사용 전 [구현·검증 현황](docs/IMPLEMENTATION.md)과 [운영·복구 안내](docs/OPERATIONS.md)를 확인한다.

Cloudflare·Microsoft 계정 등록부터 시작하려면 [최초 연결 안내](docs/CLOUD-SETUP.md)를 따른다.

## 로컬 실행

Node.js 24, Java 21(Android 빌드)을 사용한다.

첫 빌드와 개발 서버 실행 시 공식 Google Fonts의 고정된 버전에서 한글 폰트를 내려받고 SHA-256을 확인한다. 이후에는 검증된 로컬 파일을 재사용하며, 폰트 라이선스는 `public/fonts/OFL.txt`에 포함되어 있다.

```sh
npm ci
node scripts/setup-local.mjs
npm run build
npm run api
# 별도 터미널
npm run dev
```

브라우저에서 http://localhost:5173 접속. 초기 등록 키는 로컬 생성 스크립트가 만든 `private/local-bootstrap.json`에 있다. `.dev.vars`의 `REQUIRE_ONEDRIVE=false`는 **로컬 개발만** 위한 설정이다. 개발판은 실제 OneDrive 저장 완료라고 표시하지 않는다.

```sh
npm run catalog:import -- /path/to/grand_price_chart.xlsx private/catalog-import.json
npm run check
npm run android:sync
```

관리자 → 단가표 관리 → JSON 초안 가져오기 → 원본과 대조 → 검토 완료 및 판매 활성화 → 초안 저장 → 게시. Excel은 게시본에서 생성한다. 단가표와 환자자료는 GitHub에 커밋하지 않는다.

## 구성

- `src/core/`: 타입, 계산·권한·상태 변경 규칙, Excel 출력
- `src/components/`: 사진 에디터·서명
- `src/lib/`: API, 암호화 오프라인 저장, 문서·네이티브 연결
- `server/`: Workers API, 암호화, Microsoft Graph 연결
- `android/`: Capacitor Android 셸과 Keystore·인쇄·APK 설치 플러그인
- `scripts/`: XLSX 변환·개발 설정·브라우저 검증
- `.github/workflows/`: 검증·배포·APK 빌드

운영 연결이 없는 APK는 첫 실행 시 병원 HTTPS 서버 주소를 입력한다. 주소가 없는 상태에서는 환자·가격 자료가 포함되지 않는다. 운영 계정/실제 기기를 사용하는 최종 인수 시험은 아직 수행하지 않았다.
