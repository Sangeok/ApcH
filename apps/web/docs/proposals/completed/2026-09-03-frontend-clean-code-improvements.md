---
status: "completed"
proposal-size: "standard"
created-at: "2026-09-02"
approved-by: "HamSangEok"
approved-at: "2026-09-02"
approval-scope: "전체 (Phase 0~5)"
completed-at: "2026-09-03"
verification-summary: "Phase 0~5 각 종료마다 typecheck·lint·test·build 통과. 최종 70/70, lint 0, build 성공, 라우트 static/dynamic 표기 기준선과 동일"
closed-at: null
closed-by: null
closed-reason: null
owners: []
related:
  - "active/fsd-architecture-compliance-proposal.md"
  - "../conventions/fsd-architecture-guidelines.md"
  - "../conventions/tanstack-query-fsd-guidelines.md"
---

# apps/web 프론트엔드 클린코드 개선 제안 (5렌즈 오케스트레이션 검토)

## Summary

`frontend-clean-code-orchestrator` 스킬로 `apps/web`(HEAD `98ba430`, 2026-09-02) 전체를 검토했다. 응집도·결합도·예측가능성·가독성·TypeScript 제너럴리스트 다섯 렌즈가 서로의 출력을 보지 않고 독립적으로 코드를 읽어 119건의 원시 결함을 보고했고, 중립 품질 게이트가 근거·범위·심각도·최소 안전 변경을 검증해 **77건의 정규 항목(Must 1 · Should 28 · Consider 48)** 으로 정리했다(게이트 2라운드). 기각된 원시 결함은 없다. 4건은 원 렌즈가 권고안을 수정해 재제출했고 그중 2건은 게이트가 범위를 더 좁혀 수용했으며, 1건은 메인 루프의 실행 검증으로 확정했다.

이 문서는 77건 각각을 **파일:줄 근거 → 영향 → 최소 안전 변경(코드 포함) → 대안·선행 조건** 형태로 적어, 항목 단위로 바로 구현·검증할 수 있게 한다. 운영 결함 1건(Polar 고객 포털이 프로덕션에서도 sandbox를 가리킴)은 즉시 수정 대상이고, 나머지는 실행 순서(§Execution Plan)를 따라 단계별로 적용한다.

## Goal

- 실제 사용자 흐름을 깨는 결함(C-02, C-29, C-63, C-17 등)을 먼저 닫는다.
- 프로젝트 자체 규약(`fsd-architecture-guidelines.md`, `tanstack-query-fsd-guidelines.md`)과 코드가 어긋난 지점을 규약 쪽으로 되돌린다: 슬라이스 공개 API, 도메인 DB 접근 소유권, 쿼리 키 팩토리, mutation 소유권.
- 이름·시그니처·타입이 실제 동작을 말하도록 고쳐 다음 편집자가 잘못 추론할 여지를 줄인다.
- 죽은 코드와 중복 선언을 제거해 "누가 이걸 바꾸면 어디가 깨지나"의 답을 좁힌다.
- 작업 유형: 삭제 · 이동 · 시그니처 변경 · 리팩터링 · 의존성 선언 정정. 기능 추가는 없다.

## Proposal Size

`proposal-size`: standard

선택 근거:

- 삭제 작업(죽은 export, 미사용 패키지)이 포함된다.
- 라우팅(`privacy`/`terms` 라우트 그룹 이동), 인증(미들웨어 matcher), 결제(Polar 서버 선택, 체크아웃 성공 URL), 웹훅 입력 검증 흐름에 영향이 있다.
- barrel export(`entities/*/index.ts`, `features/*/index.ts`) 구조를 바꾼다.
- 변경 파일이 5개를 훨씬 넘는다(영향 영역 표 참조).
- 롤백이 단순 revert 이상인 항목(barrel 분할, 슬라이스 분할)이 있다.

## Current State

### 검토 방법

| 단계 | 내용 |
| --- | --- |
| 대상 | `apps/web/src/**/*.{ts,tsx}` 전부 + `next.config.js` + `src/env.js`. Tier 1(앱 코어)·Tier 2(마케팅 페이지)는 전문 읽기, Tier 3(`shared/ui/atoms/**`, shadcn 생성물)은 로컬 수정분만 확인 |
| 렌즈 | `frontend-cohesion`, `frontend-coupling`, `frontend-predictability`, `frontend-readability`, `typescript-clean-code` — 각각 독립 컨텍스트, 다른 렌즈 출력 미노출, 읽기 전용 |
| 원시 결함 | 응집도 23 · 결합도 19 · 예측가능성 25 · 가독성 25 · TS 27 = **119건** |
| 게이트 | 중립 에이전트가 근거 줄을 직접 열어 검증. 1라운드: accept 42 · merge-accept 68 · revise 4 · pending 1 · reject 0 → 정규 71건. 2라운드: 재제출 4건 수용(COH-10은 두 항목으로 분할, 2건은 범위 축소) + 검증 증거로 CPL-17 확정 → 정규 77건. 3라운드 불필요 |
| 메인 루프 검증 | 비변경 확인만 수행: 죽은 export grep, `npm ls`, `tsx` 별칭 해석 프로브, 외부 tsconfig로 `.mjs` 타입체크, SWC 바이너리·Next 소스 진단 문자열 grep. 저장소 트리는 검토 전후 동일 |
| 커버리지 | 다섯 렌즈 모두 Completed. **Full applicable-lens review** (N/A·Unavailable·Skipped 없음) |

### 기준선 (HEAD `98ba430`)

| 명령 | 결과 |
| --- | --- |
| `npm run typecheck -w apps/web` | 통과 (exit 0) |
| `npm run lint -w apps/web` | 경고·오류 0 |
| `npm test -w apps/web` | 67/67 통과 |

### 문제의 성격

코드는 컴파일·린트·테스트를 모두 통과하지만, 다음 유형의 결함이 도구에 잡히지 않은 채 남아 있다.

1. **운영 결함**: 고객 포털이 환경변수와 무관하게 sandbox 고정(C-02). 존재하지 않는 업로드 id 방문 시 404 대신 에러 경계(C-29). 빈 제목이 오면 메타데이터 메뉴가 꺼짐(C-63).
2. **규약 위반**: 엔티티 barrel이 `server-only` 모듈을 재수출해 클라이언트가 전부 내부 경로로 우회(C-07). 엔티티 간 peer 임포트 4건(C-75). 인라인 쿼리 키(C-14). mutation 캐시 정책이 페이지·위젯에 흩어짐(C-18, C-19).
3. **이름과 동작의 불일치**: 읽기 이름의 액션이 상태 쓰기와 Inngest 이벤트를 발생시킴(C-28). `| null` 선언인데 throw(C-29). `getAnalyticsIds`가 영구 식별자를 생성·저장(C-48). 사용하지 않는 `userId` 파라미터로 소유권 검사를 약속하는 함수(C-05).
4. **죽은 코드**: 소비자 0인 공개 export 11개 이상(C-05), 도달 불가 분기(C-16), 실행되지 않는 Suspense(C-41).
5. **중복 선언**: Modal 콜백 wire 타입 3벌(C-09), `resolveUserId` 2벌(C-24), `clipType` 라벨 2벌(C-22), 초 → `m:ss` 포매터 3벌(C-60).

기존 `active/fsd-architecture-compliance-proposal.md`(2026-04-18)가 지적한 위반의 상당수는 이미 해소됐다(엔티티 레이어 존재, `shared/hooks`·`shared/types` 제거). 이 문서의 FSD 관련 항목(C-07, C-08, C-06, C-75, C-76, C-40)은 그 문서의 후속으로 읽으면 된다.

## Scope

포함 범위:

- `apps/web/src/**` 전체의 TS/TSX, 테스트(`*.test.mjs`), `tsconfig.json`, `package.json` 의존성 선언.
- 77건의 정규 항목 각각의 최소 안전 변경.

제외 범위:

- `src/fsd/shared/ui/atoms/**`(shadcn 생성물) — 로컬 수정분(`dialog.tsx`·`sheet.tsx`의 `showCloseButton`/`overlayClassName`, `button.tsx`의 `icon-sm`)에 결함 없음. C-63의 부차 위치(`seo-page-hero.tsx:39`)만 선택 적용.
- `apps/admin`, `apps/backend`, `packages/db`. 단, C-05의 `setReportUser` 삭제는 admin이 독립 사본을 가짐을 확인했다(§Needs human judgment 1).
- 제품 결정이 필요한 변경(§Needs human judgment): 폴링 경로에서 reconcile 제거(PRD-1 원안), `outlineWidth` 정수/소수 규약, `dashboard_viewed` 세션당 1회 집계.
- 기능 추가, 성능 튜닝, 디자인 변경.

## Proposal

각 항목은 `C-NN`으로 식별한다. 심각도 정의: **Must** = 실제 결함·깨진 사용자 흐름·안전하지 않은 부수효과. **Should** = 지금 깨지지는 않지만 유지보수·테스트·예측가능성 비용이 분명함. **Consider** = 근거는 명확하고 변경은 작으나 급하지 않음. 렌즈 표기: 응집(Cohesion) · 결합(Coupling) · 예측(Predictability) · 가독(Readability) · TS(typescript-clean-code). 줄 번호는 HEAD `98ba430` 기준이다.

### MUST

#### C-02 — 고객 포털이 Polar sandbox에 고정됨 · [응집·가독·TS]

- **위치**: `src/app/api/portal/route.ts:14`; `src/app/api/checkout/route.ts:13`, `:6-11`; `src/fsd/shared/api/polar.ts:6`; `src/fsd/features/billing/config/index.ts:18`; 소비자 `src/fsd/features/billing/ui/SubscriptionStatus.tsx:93`
- **근거(검증)**: `portal/route.ts:14`는 리터럴 `server: "sandbox"`. 나머지 세 모듈은 각각 `env.POLAR_SERVER ?? "sandbox"`를 따로 계산한다. `SubscriptionStatus.tsx:93`이 모든 구독자를 `/api/portal`로 보낸다.
- **영향**: `POLAR_SERVER=production`이어도 "Manage Subscription"이 sandbox 테넌트를 연다. 환경 전환 시 네 파일을 찾아야 한다.
- **변경**:
  ```ts
  // src/fsd/shared/api/polar.ts
  export const POLAR_SERVER = env.POLAR_SERVER ?? "sandbox";
  export function getPolarClient(): Polar {
    polarInstance ??= new Polar({ accessToken: env.POLAR_ACCESS_TOKEN, server: POLAR_SERVER });
    ...
  }
  ```
  ```ts
  // src/app/api/portal/route.ts:14
  -  server: "sandbox",
  +  server: POLAR_SERVER,   // import { POLAR_SERVER } from "~/fsd/shared/api/polar";
  ```
  ```ts
  // src/app/api/checkout/route.ts:13
  -const polarServer = env.POLAR_SERVER ?? "sandbox";
  +import { POLAR_SERVER } from "~/fsd/shared/api/polar";  // 이후 server: POLAR_SERVER
  ```
  `features/billing/config/index.ts:18`은 C-03에서 처리.
- **동반 변경(선택)**: `checkout/route.ts:6-11`의 `getBaseUrl()`은 `https://apc-h.vercel.app`로 폴백하고 `shared/lib/site.ts:4`는 `https://a-pch.com`으로 폴백한다. `successUrl`을 `absoluteSiteUrl("/dashboard/billing?success=true&checkout_id={CHECKOUT_ID}")`로 바꾸고 `site.ts:1`의 `process.env.NEXT_PUBLIC_SITE_URL`을 `env.NEXT_PUBLIC_SITE_URL`로 바꾼다.
- **순서**: C-03보다 먼저(C-03이 `POLAR_SERVER`를 소비). C-49와 같은 파일.
- **확인**: 포털 라우트가 프로덕션 Polar를 가리키는지는 배포 실물에서만 확인된다 → `docs/release-checks.md` 등재 대상.

### SHOULD

#### C-01 — 대시보드 라우트의 파일 수준 `"use server"` 제거 · [응집·결합·예측·가독·TS]

- **위치**: `src/app/dashboard/page.tsx:1`
- **근거(검증)**: 1행이 `"use server";`. 저장소의 다른 네 곳은 모두 `features/*/api/index.ts`(문서화된 규약). 형제 라우트(`app/page.tsx`, `dashboard/billing/page.tsx`, `dashboard/uploads/[uploadedFileId]/page.tsx`, `login/page.tsx`)는 import로 시작한다. 설치된 Next 15.5.7의 SWC 바이너리에 진단 문자열 `Only async functions are allowed to be exported in a "use server" file.`이 존재함을 확인했다.
- **영향**: 페이지 컴포넌트가 이유 없이 서버 액션 매니페스트에 등록되고, 이 파일에 `export const metadata`/`dynamic`/`revalidate`(형제 라우트에 모두 있음)를 추가하는 순간 위 진단으로 빌드가 깨진다.
- **변경**: 1행과 뒤따르는 빈 줄 삭제. 나머지(`auth()`, `redirect()`, 엔티티 호출)는 서버 컴포넌트에서 그대로 동작한다.

#### C-03 — `getProductIds`가 검증된 env를 우회하고 unsound 캐스트를 씀 · [예측·가독·TS]

- **위치**: `src/fsd/features/billing/config/index.ts:17-20`; `src/fsd/features/billing/ui/PlanCard.tsx:16-17, 88, 103`; `src/env.js:30`
- **근거**: `(process.env.POLAR_SERVER ?? "sandbox") as keyof typeof POLAR_PRODUCT_IDS` — `env.js:30`이 이미 `z.enum(["sandbox","production"])`으로 검증하는데 raw `process.env`를 읽고, 캐스트가 `noUncheckedIndexedAccess`를 무력화한다. `PlanCard.tsx`(`"use client"`)가 이 모듈을 임포트하므로 함수가 브라우저 번들에 실린다. `PlanCard.tsx:88,103`의 `productIds &&`는 필수 non-nullable prop에 대한 죽은 가드.
- **영향**: 클라이언트에서 호출되면 `process.env.POLAR_SERVER`가 `undefined`라 프로덕션에서도 sandbox 상품 id를 조용히 반환한다. 하류의 방어 가드가 "이 타입은 믿을 수 없다"고 독자에게 가르친다.
- **변경**:
  ```ts
  // src/fsd/features/billing/config/index.ts
  import { POLAR_SERVER } from "~/fsd/shared/api/polar";   // C-02
  export function getProductIds(): ProductIds {
    return POLAR_PRODUCT_IDS[POLAR_SERVER];
  }
  ```
  ```tsx
  // PlanCard.tsx:88, :103
  -onClick={() => productIds && handleSubscribe(productIds.pro_monthly, "month")}
  +onClick={() => handleSubscribe(productIds.pro_monthly, "month")}
  ```
  `shared/api/polar.ts`가 `@polar-sh/sdk`를 임포트하므로 `config`를 SDK에서 떼어두고 싶으면 `POLAR_SERVER`를 `shared/config/constants.ts`에 두고 `polar.ts`가 그것을 소비해도 된다(C-02와 동시 결정).
- **대안(PRD-15)**: `getProductIds`/`POLAR_PRODUCT_IDS`를 `features/billing/api/product-ids.ts`(`import "server-only"`)로 옮겨 클라이언트 번들에서 완전히 제거. 검증된 `env` 접근자가 클라이언트 읽기를 시끄럽게 실패시키므로 채택하지 않았으나, C-08에서 `features/billing` barrel을 클라이언트 안전하게 유지해야 한다는 점은 기억할 것.
- **순서**: C-02 이후.

#### C-04 — `optimistic-` id 접두사가 선언되지 않은 파일 간 계약 · [응집·결합·예측·가독·TS]

- **위치**: `src/fsd/pages/dashboard/model/useUploadPodcast.ts:79`; `src/fsd/pages/dashboard/ui/index.tsx:76`; `src/fsd/pages/dashboard/ui/_component/QueueStatus.tsx:60`
- **근거(grep으로 정확히 3곳 확인)**: 생산자 `` id: `optimistic-${Date.now()}` ``, 소비자 두 곳 `file.id.startsWith("optimistic-")`. `UploadedFileSummary`(`entities/uploaded-file/model/types.ts:9-15`)에는 pending 표시가 없다.
- **영향**: 접두사를 바꾸거나 `crypto.randomUUID()`로 전환하면 낙관적 행이 실제 큐로 새고, `QueueStatus.tsx:86-96`의 "View details" 링크가 `/dashboard/uploads/optimistic-…`(404)로 활성화된다. 타입체크도 테스트도 잡지 못한다.
- **변경**: 새 파일 `src/fsd/entities/uploaded-file/model/optimistic-id.ts`
  ```ts
  const OPTIMISTIC_UPLOAD_ID_PREFIX = "optimistic-";
  export function createOptimisticUploadId(): string {
    return `${OPTIMISTIC_UPLOAD_ID_PREFIX}${Date.now()}`;
  }
  export function isOptimisticUploadId(id: string): boolean {
    return id.startsWith(OPTIMISTIC_UPLOAD_ID_PREFIX);
  }
  ```
  `useUploadPodcast.ts:79` → `id: createOptimisticUploadId()`; `ui/index.tsx:76` → `optimisticFiles.filter((f) => isOptimisticUploadId(f.id))`; `QueueStatus.tsx:60` → `const isOptimistic = isOptimisticUploadId(file.id);`. `entities/uploaded-file/index.ts`에서 재수출(C-07 이후 클라이언트에서 barrel 임포트 가능).
- **대안**: `pages/dashboard/model/`에 두는 안(CPL-12)은 개념이 엔티티 타입을 설명하고 C-19 이후에도 살아남아야 하므로 기각. 더 강한 안(PRD-9/COH-9): `OptimisticUploadedFileSummary = UploadedFileSummary & { readonly pending: true }`로 타입에 경계를 넣고 `"pending" in file`로 판별 — `ui/index.tsx:71-74`의 `useOptimistic` 리듀서를 손댈 때 함께 적용.

#### C-05 — 엔티티·피처 공개 API에서 죽은 export 삭제 · [응집·결합·예측·가독·TS]

- **위치(각각 repo-wide grep으로 정의+barrel 재수출만 존재함을 확인)**:

  | 심볼 | 정의 | barrel |
  | --- | --- | --- |
  | `findUploadedFileForProcessRequest` | `entities/uploaded-file/api/index.ts:471-489` | `entities/uploaded-file/index.ts:9` |
  | `markUploadedFileQueuedFromDispatch` | `api/index.ts:583-601` | `index.ts:23` |
  | `updateUploadedFileStatus` | `api/index.ts:886-920` | `index.ts:30` |
  | `updateUploadedFileLanguage` | `api/index.ts:922-932` | `index.ts:29` |
  | `setUploadedFileUploaded` | `api/index.ts:934-943` | `index.ts:27` |
  | `UploadedFileListFilters`, `uploadedFileKeys.list` | `entities/uploaded-file/model/query-keys.ts:1-5, 10-11` | — |
  | `recoverableDraftActionSchema` | `features/upload/model/schemas.ts:30-32` | — |
  | `processVideoSchema`, `ProcessVideoInput` | `features/clip/model/schemas.ts` 전체 | — |
  | `setReportUser`, `withIsolatedReportScope` | `shared/observability/report-error.ts:141-168` | `shared/observability/index.ts:5-6` |
  | `markProcessingDispatchSent`, `markProcessingDispatchDeadLetter` (내부 사용, barrel만 잉여) | `entities/processing-dispatch/api/index.ts` | `entities/processing-dispatch/index.ts:4-5` |
  | `addCustomClipDraftSchema`, `updateClipDraftSchema` (내부 사용, barrel만 잉여) | `features/clip-review/model/schemas.ts` | `features/clip-review/index.ts:7, 9` |

- **근거**: 위험한 둘 — `updateUploadedFileStatus`는 `api/index.ts:886-890`에 5줄 ⚠️ 경고("`processing` 설정에 쓰지 말 것")를 달고도 공개 barrel에 있다. `updateUploadedFileLanguage(uploadedFileId, userId, language)`는 `userId`를 본문에서 쓰지 않고 `where: { id: uploadedFileId }`로만 쓴다 — 같은 파일의 다른 `userId` 수신 함수(`:77`, `:460`, `:1290`)는 모두 소유권 필터로 쓴다. `features/clip/model/schemas.ts`는 `features/upload/model/schemas.ts:7-24`와 다른 방식(min/max 범위 vs Set 멤버십)으로 clip-count 규칙을 재유도한다.
- **영향**: 약 150줄이 살아 있는 API처럼 읽힌다. `updateUploadedFileLanguage`를 시그니처만 믿고 호출하면 다른 사용자의 행을 쓰게 되는데 타입·린트·테스트 어느 것도 잡지 않는다(`no-unused-vars`는 `after-used` 기본값이라 뒤에 오는 `language`가 쓰이므로 침묵).
- **변경**: 함수·스키마와 barrel 줄을 **하나씩** 삭제하고 그때마다 `npm run typecheck -w apps/web`. `markProcessingDispatch*`와 `*ClipDraftSchema`는 barrel 줄만 제거(함수·스키마 자체는 각 api 모듈이 내부에서 사용). `features/clip/model/` 디렉터리는 비게 되므로 함께 삭제(C-08의 `features/clip/index.ts` 생성과 같은 커밋 권장).
- **예외**:
  - `PROCESSING_DISPATCH_STATUSES`/`ProcessingDispatchStatus`는 삭제하지 **않고** C-70에서 연결한다.
  - `uploadedFileKeys.list`/`UploadedFileListFilters` 삭제는 C-42와 겹친다 — 먼저 도착하는 쪽에서 한 번만.
  - `setReportUser`/`withIsolatedReportScope`: `apps/admin/src/fsd/shared/observability/report-error.ts`는 **독립 사본**이고 소비자(`apps/admin/src/fsd/features/send-observability-test/api/send-observability-test-event.ts:7-8,29-31`)가 살아 있으므로 web 쪽 삭제는 admin에 영향 없음. 두 파일을 바이트 동일하게 유지하는 것이 관례라면 이 둘은 남긴다(§Needs human judgment 1).
  - `findUploadedFileForProcessRequest` 삭제로 C-29의 rename 목록에서 한 항목이 빠진다.
- **대안(기각)**: `updateUploadedFileLanguage`를 `updateMany({ where: { id, userId } })`로 고쳐 살리기 — 보존할 호출자가 없다.

#### C-07 — 엔티티 barrel이 `server-only` api를 재수출해 클라이언트가 전부 내부 경로로 우회 · [결합·응집]

- **위치**: `src/fsd/entities/uploaded-file/index.ts:1-31` + `api/index.ts:1`; 같은 구조 `entities/clip/index.ts:1-7`, `entities/clip-draft/index.ts:1-9`; 클라이언트 깊은 임포트 22곳/13모듈: `pages/dashboard/ui/index.tsx:8,13`; `pages/dashboard/ui/_component/QueueStatus.tsx:5`; `RecoverableUploadDrafts.tsx:11,12`; `pages/dashboard/model/useUploadPodcast.ts:6`; `pages/dashboard/model/types.ts:1`; `pages/upload-detail/ui/index.tsx:7,8,9`; `ProcessingTimeline.tsx:4`; `OriginalMediaCard.tsx:4,5`; `use-live-uploaded-file-detail.ts:4,5,6`; `pages/upload-detail/model/types.ts:1`; `features/upload/ui/index.tsx:14-17`; `features/upload/model/query-options.ts:2,3,7`; `use-reprocess-uploaded-file.ts:4`; `widgets/clip-display/ui/_component/ClipActions.tsx:17,18`; `widgets/clip-draft-review/model/use-clip-draft-review.ts:6,7`; `widgets/uploaded-file-list/ui/_component/UploadedFileCard.tsx:6`; `widgets/uploaded-file-list/model/types.ts:1`
- **근거(검증)**: `index.ts:1`이 `export { … } from "./api"`로 시작하고 `api/index.ts:1`이 `import "server-only"`. 그래서 barrel 임포터는 서버 5곳뿐(`inngest/functions.ts:16`, `app/dashboard/page.tsx:9`, `api/webhooks/modal/route.ts:6`, `features/upload/api/index.ts:32`, `entities/processing-dispatch/api/index.ts:10`)이고 클라이언트 13모듈은 전부 `…/model/*`·`…/ui/*`를 직접 임포트한다. `UploadedFileStatusBadge`는 index에 아예 없다.
- **영향**: 규약 §5.3의 공개 API가 클라이언트 절반에 대해 아무것도 보호하지 않는다. `model/` 파일 5개나 배지 컴포넌트 하나를 옮기면 13모듈을 고쳐야 한다 — 앱에서 가장 큰 변경 반경.
- **변경**: 런타임 기준으로 barrel을 나눈다.
  1. `entities/uploaded-file/index.ts:1-31`(`./api` 재수출 블록)을 새 파일 `entities/uploaded-file/server.ts`로 이동.
  2. 남은 `index.ts`(`:32-49`: `attempt-prefix`, `processing-status`, `model/types`)에 추가:
     ```ts
     export { uploadedFileKeys } from "./model/query-keys";
     export { ACTIVE_UPLOAD_POLLING_INTERVAL_MS } from "./model/polling";
     export * from "./model/clip-generation-outcome";
     export { UploadedFileStatusBadge } from "./ui/UploadedFileStatusBadge";
     export { createOptimisticUploadId, isOptimisticUploadId } from "./model/optimistic-id"; // C-04
     ```
  3. 서버 임포터 5곳을 `~/fsd/entities/uploaded-file/server`로, 클라이언트 22곳을 `~/fsd/entities/uploaded-file`로 바꾼다.
  4. `entities/clip`, `entities/clip-draft`에 동일 분할 적용.
- **충돌 해소**: COH-20(기존 index에 export를 더 추가하고 클라이언트에서 임포트)은 지금 깨지는 이유 그대로 빌드가 깨진다 → 권고 폐기, "공개 API가 장식"이라는 근거만 유지.
- **순서**: C-06, C-08, C-14, C-22보다 먼저(이들의 barrel 우회 주석이 사라진다). 검증은 **`npm run build -w apps/web`** — `server-only`는 typecheck가 아니라 빌드가 강제한다.

#### C-09 — Modal 콜백 wire 계약이 세 번 선언됨 · [응집·가독]

- **위치**: `src/inngest/client.ts:4-18, 37-44`; `src/inngest/functions.ts:40-78, 110-127, 129-170`; `src/app/api/webhooks/modal/route.ts:10-60, 88-131, 133-182`
- **근거**: 13필드 clip 형태가 두 이름으로 세 번 동일 선언. `toStrictNonNegativeInteger`는 `functions.ts:110`과 `route.ts:108`에 바이트 동일. snake_case↔camelCase 정규화가 필드별로 두 번 작성. `functions.ts:32`는 이미 `./client`에서 `AnalyzedMoment`를 임포트하면서 `ProcessVideoBackendClip`을 로컬로 가린다. `subtitleStatus`에는 두 사본 모두 snake_case 폴백이 없다 — 같은 누락이 두 번 도입됐다.
- **영향**: 백엔드 clip 필드 추가·개명에 세 디렉터리 세 편집. 하나를 빠뜨리면 두 ingest 경로(웹훅 직접 쓰기 `route.ts:271` vs Inngest `persistGeneratedClips` `functions.ts:216-233`) 중 하나에서 필드가 조용히 사라지고, 두 사본이 구조적으로 유효하므로 TS가 잡지 못한다.
- **변경**: 새 파일 `src/inngest/modal-contract.ts`(`server-only` 없음 — 라우트 핸들러와 Inngest 함수가 모두 임포트)에 `ProcessVideoBackendClip`, `RawProcessVideoBackendClip`, `RawAnalyzedMoment`, `toStrictNonNegativeInteger`, `toStrictPositiveInteger`, `normalizeBackendClip(s)`, `normalizeAnalyzedMoment`, `toModalErrorMessage`를 둔다. `client.ts:4-18`은 `import type { ProcessVideoBackendClip } from "./modal-contract"` + 재수출로 대체. `functions.ts:40-78, 110-170`과 `route.ts:10-60, 88-182` 삭제 후 임포트. `route.ts`에는 HTTP 봉투 전용인 `RawModalWebhookBody`/`NormalizedModalWebhookBody`/`normalizeBody`만 남긴다.
- **대안(RDB-5)**: `client.ts`에 정본을 두기 — 웹훅 라우트가 타입 때문에 Inngest 클라이언트 모듈을 임포트하게 되므로 기각.
- **순서**: C-30과 함께(둘 다 `normalizeClip`을 편집).

#### C-10 — `usePlayUrl`이 독립 필드 세 개를 반환하고 소비자마다 재요청 · [예측·가독·결합]

- **위치**: `src/fsd/shared/lib/use-play-url.ts:10-14, 25-26`; 소비자 `widgets/clip-display/ui/_component/ClipVideoPlayer.tsx:16-38`; `widgets/uploaded-file-list/ui/_component/UploadedFileCard.tsx:58-66`; `pages/upload-detail/ui/_component/OriginalMediaCard.tsx:23, 41`; `widgets/clip-draft-review/ui/index.tsx:98, 390`
- **근거(검증)**: `{ playUrl, isLoading, error }`는 `{ url, isLoading: true, error }` 조합을 허용한다. 소비자마다 상태를 다르게 재유도한다: `clip-draft-review/ui/index.tsx:390`은 `{playUrl && <video/>}`로 loading·error를 모두 버리고, `OriginalMediaCard.tsx:41`은 `error`를 무시해 presign 실패 시 영원히 빈 검은 상자를 그린다. `:26` `fetcherRef.current = fetcher`는 렌더 중 ref 쓰기. 추가로(CPL-4 검증) `OriginalMediaCard.tsx:23`과 `clip-draft-review/ui/index.tsx:98`이 같은 `usePlayUrl(uploadedFileId, getOriginalPlayUrl)`을 호출하며 `/dashboard/uploads/[id]`의 `review_pending` 상태에서 동시에 마운트되므로 마운트마다 동일 S3 presign이 두 번 나가고 만료도 따로 된다.
- **영향**: 소비자 넷, 해석 넷, 그중 하나는 실패 상태를 조용히 버린다. 렌더 단계 ref 쓰기는 React 19 동시 렌더링에서 불순한 렌더다.
- **변경**:
  ```ts
  // src/fsd/shared/lib/use-play-url.ts
  export type PlayUrlState =
    | { status: "idle" }                       // enabled === false
    | { status: "loading" }
    | { status: "ready"; url: string }
    | { status: "error"; message: string };
  // fetcherRef.current = fetcher; → useEffect(() => { fetcherRef.current = fetcher; });
  ```
  소비자 넷을 `switch (state.status)`로 바꾼다(`ClipVideoPlayer`는 `never` default 포함). `clip-draft-review/ui/index.tsx:390`은 `"error"`에 무엇을 보일지 결정해야 한다.
- **대안(CPL-4)**: `useQuery` 위에 재구현 — `uploadedFileKeys.playUrl(uploadedFileId)`와 새 `clipKeys.playUrl(clipId)` 키, `staleTime: (PRESIGNED_GET_URL_EXPIRY * 1000) / 2`. 판별 상태와 중복 presign 제거를 한 번에 얻지만 `S3_CONFIG.PRESIGNED_GET_URL_EXPIRY`를 `shared/api/s3.ts`(C-44에서 `server-only`가 됨)에서 `shared/config/constants.ts`로 먼저 옮겨야 한다. 채택 시 위 union 변경을 대체하고 소비자 갱신만 남는다.

#### C-11 — `ErrorDisplay`의 flag/data prop 쌍이 어긋나면 아무것도 그리지 않음 · [예측·가독]

- **위치**: `src/fsd/shared/ui/error-display/index.tsx:23-34, 63, 69, 77`; `not-found-display.tsx:12-19, 42, 50`; 호출자 `src/app/error.tsx:22-25`, `src/app/dashboard/error.tsx:23-25`, `src/app/dashboard/billing/error.tsx:23-27`, `src/app/dashboard/uploads/[uploadedFileId]/error.tsx:23-27`
- **근거(검증)**: `:63` `{showRetry && onRetry && (…)}` — `<ErrorDisplay showRetry />`는 타입을 통과하고 재시도 버튼을 그리지 않는다. `backHref`/`backLabel`은 `showBack`이 없으면 죽는다.
- **영향**: 라우트 에러 경계 넷이 의존한다. "에러 페이지는 뜨는데 복구 수단이 없음"이 리뷰에서 보이지 않고 런타임 오류도 없다.
- **변경**: 존재 자체가 플래그가 되도록
  ```ts
  interface ErrorDisplayProps {
    title?: string; description?: string; digest?: string;
    variant?: "full-page" | "section";
    retry?: { onRetry: () => void };            // 있으면 "Try again"
    back?: { href: string; label?: string };    // 있으면 "Go back"
    home?: boolean;                             // 동반 데이터 없음 → 플래그 유지
  }
  ```
  호출자: `showRetry onRetry={reset}` → `retry={{ onRetry: reset }}`; `showBack backHref="/dashboard" backLabel="Back to dashboard"` → `back={{ href: "/dashboard", label: "Back to dashboard" }}`. `NotFoundDisplay`(유일 소비자 `src/app/not-found.tsx:4`)도 같은 형태로.

#### C-14 — 트랜스크립트 쿼리가 위젯 이름의 인라인 키를 씀 · [결합·응집]

- **위치**: `src/fsd/widgets/clip-draft-review/model/use-clip-draft-review.ts:61-89`, 특히 `:62`
- **근거(검증)**: `queryKey: ["clip-draft-review", "transcript", uploadedFileId]`, `:63` `staleTime: Infinity`. 앱의 유일한 인라인 키. `tanstack-query-fsd-guidelines.md §13`이 인라인 키와 라우트/페이지 이름 첫 세그먼트를 모두 안티패턴으로 명시.
- **영향**: 리터럴을 복사하지 않고는 어떤 모듈도 이 캐시를 무효화할 수 없어, 재분석이 새 `transcriptS3Key`를 쓰더라도(`entities/uploaded-file/api/index.ts:767`) 세션 내내 이전 시도의 트랜스크립트로 단어 경계를 스냅한다.
- **변경**:
  ```ts
  // src/fsd/entities/uploaded-file/model/query-keys.ts
  transcript: (uploadedFileId: string) =>
    [...uploadedFileKeys.details(), uploadedFileId, "transcript"] as const,
  ```
  `use-clip-draft-review.ts:62` → `queryKey: uploadedFileKeys.transcript(uploadedFileId)`. `details()` 아래 중첩되므로 훅의 기존 `invalidateQueries({ queryKey: detailKey })`가 자동으로 덮는다.
- **대안(CPL-15)**: `entities/clip-draft/model/query-keys.ts`의 `clipDraftKeys` — C-07 전에는 barrel이 `server-only`라 파일 경로 임포트가 필요. 기존 파일 한 줄인 위 안이 더 작다.
- **후속(COH-6)**: 위젯의 mutation 다섯 개를 `features/clip-review/model/`로 옮기는 것은 C-18/C-19와 같은 계열의 별도 큰 변경.
- **순서**: C-15와 같은 쿼리 — 함께.

#### C-15 — 트랜스크립트 `queryFn`이 세 가지 실패를 빈 배열로 바꿈 · [예측]

- **위치**: `src/fsd/widgets/clip-draft-review/model/use-clip-draft-review.ts:64-88`; 소비자 `ui/_component/AddCustomClipPanel.tsx:80-82`; `ui/_component/ClipDraftCard.tsx:76-93, 135-149`
- **근거(검증)**: `if (!result.success) return []`, `if (!response.ok) return []`, `if (!Array.isArray(parsed)) return []`. 규약 §10은 queryFn이 throw해야 한다고 명시.
- **영향**: `isError`/`error`가 영구 false/null이라 presign 만료나 S3 403이 "Add a clip AI missed"를 무언으로 사라지게 하고(`AddCustomClipPanel`이 `null` 반환), ±0.5초 조정 버튼을 스냅 없는 스텝퍼로 바꾼다. UI·devtools 어디에도 신호가 없다.
- **변경**: 세 `return []`를 `throw new Error(result.error)` / `` throw new Error(`Transcript fetch failed: ${response.status}`) `` / `throw new Error("Transcript payload was not an array")`로. 훅 반환에 `transcriptError`(쿼리의 `isError`/`error`)를 추가하고 `AddCustomClipPanel`이 `null` 대신 "Transcript unavailable — custom clips are disabled" 상태를 그리게 한다.
- **순서**: C-14와 함께.

#### C-17 — 빈 상태 가드는 `clips`를, 그리드는 `optimisticClips`를 읽음 · [TS]

- **위치**: `src/fsd/widgets/clip-display/ui/index.tsx:22-26`
- **근거(검증)**: `if (clips.length === 0) return <p>No clips found</p>;` 뒤에 `{optimisticClips.map(…)}`.
- **영향**: 마지막 클립을 삭제하면 부모 쿼리가 refetch될 때까지 빈 상태 문구 없는 빈 그리드.
- **변경**: `if (optimisticClips.length === 0)`.
- **순서**: C-16, C-18과 같은 세 파일 — 함께.

#### C-18 — 클립 삭제 캐시 로직이 leaf `_component`에, 액션은 두 단계 prop drilling · [결합·응집·예측]

- **위치**: `widgets/clip-display/ui/index.tsx:5, 35`; `_component/ClipCard.tsx:26, 32, 132`; `_component/ClipActions.tsx:40, 57, 66-108, 164`; `features/clip/api/index.ts:34-56`
- **근거**: `deleteClip`이 시그니처를 그대로 반복하는 두 prop 인터페이스를 거쳐 내려오는데, 정작 호출하는 leaf는 이미 `useQueryClient`와 `uploadedFileKeys`를 직접 임포트한다. `ClipActions.tsx:78-101`이 `setQueryData` + `invalidateQueries` 둘을 소유 — 규약 §8.1 위반. `onDeleteSuccess`(`useOptimistic` 리듀서)는 `:90`에서 서버 확인 **후** 호출되므로 낙관적이지 않다(PRD-24).
- **영향**: `deleteClip` 시그니처 변경이 네 파일을 건드리고, 캐시 정책을 재사용·단독 테스트할 수 없으며, 실패 시 `useOptimistic`과 `setQueryData`가 어긋날 수 있다.
- **변경**: `features/upload/model/use-reprocess-uploaded-file.ts:1-29`를 본떠 새 파일
  ```ts
  // src/fsd/features/clip/model/use-delete-clip.ts
  "use client";
  export function useDeleteClip(uploadedFileId: string) {
    const queryClient = useQueryClient();
    return useMutation({
      mutationFn: async (clipId: string) => {
        const result = await deleteClip(clipId);
        if (!result.success) throw new Error(result.error);
      },
      onSuccess: async (_, clipId) => { /* ClipActions.tsx:78-101의 setQueryData 프룬 + detail·lists invalidate */ },
    });
  }
  ```
  `ClipActions`: `onDelete` prop(`:40`, `:54`) 삭제, `useDeleteClip()` 호출, `onDeleteSuccess`는 부모 소유 낙관적 콜백으로 **유지하되 `await` 앞으로** 이동(`startDeleting` 안이므로 transition 요건 충족), prop 이름을 `onOptimisticRemove`로. `ClipCard`: `onDelete` prop(`:26`, `:32`, `:132`) 삭제. `ui/index.tsx`: `deleteClip` 임포트(`:5`)와 prop(`:35`) 삭제.
- **대안(COH-5)**: 위젯의 `useOptimistic`까지 없애고 mutation `onMutate`로 낙관성을 옮기기 — 더 크고, 부모 콜백이 더 작은 올바른 형태라 기각.
- **순서**: C-16/C-17 이후. `features/clip/index.ts`(C-08) 또는 파일 경로 임포트 필요.

#### C-19 — 업로드 mutation 캐시 정책이 세 슬라이스에 중복 · [응집]

- **위치**: `pages/dashboard/model/useUploadPodcast.ts:59-65, 254`; `pages/dashboard/ui/_component/RecoverableUploadDrafts.tsx:43-58, 60-75`; `features/upload/ui/index.tsx:96-120`; 올바른 선례 `features/upload/model/use-reprocess-uploaded-file.ts:7-29`
- **근거**: `invalidateQueries({ queryKey: uploadedFileKeys.lists() }); router.refresh();`가 손으로 세 번, 여기에 `setQueriesData` 프룬과 `removeQueries`까지 하는 네 번째 삭제 정책. `deleteUploadedFile`이 세 파일에서 세 가지 다른 캐시 반응으로 호출된다. 규약 §8.1: `useQueryClient()`는 소유 피처의 model 훅 안에서.
- **영향**: 업로드 mutation이 무효화할 대상을 바꾸려면 세 슬라이스 네 호출처. 하나를 놓치면 대시보드가 stale. `pages/dashboard`가 업로드 액션 변경의 폭발 반경이 된다.
- **변경(범위 한정)**: `features/upload/model/use-delete-uploaded-file.ts`(현재 `features/upload/ui/index.tsx:103-115`의 `setQueriesData` 프룬 + `removeQueries(detail)` + `invalidateQueries(lists())`를 소유, 상세 페이지의 `router.push`를 위한 `{ onDeleted }` 옵션)와 `features/upload/model/use-resume-upload-draft.ts`(`scheduleUploadedFileProcessing` 래핑, `invalidateQueries(lists())` 소유)를 만들고 세 호출처를 재연결한다. `RecoverableUploadDrafts.tsx`에서는 `useQueryClient`/`uploadedFileKeys` 임포트가 사라진다.
- **후속(COH-4)**: `useUploadPodcast.ts`를 `features/upload/model/use-upload-podcast.ts`로 그대로 이동 — 기능 변화 없는 파일 이동이라 이번엔 제외.
- **순서**: C-08보다 먼저(barrel이 내보낼 심볼이 이동).

#### C-20 — 분석 메타데이터 허용 목록이 캐스트로만 묶여 있음 · [TS·예측]

- **위치**: `src/fsd/shared/analytics/lib/metadata.ts:3, 71-82`; 호출자 `app/api/analytics/events/route.ts:96-99`, `shared/analytics/lib/track-event.ts:61`
- **근거**: `ANALYTICS_METADATA_KEYS_BY_EVENT[eventName as keyof typeof …] ?? []`. `CLAUDE.md:74`가 이를 알려진 구멍으로 기록하고, `metadata.ts:18-20`은 이미 한 번 발생한 프로덕션 계측 누락(`reviewBeforeGenerate` 조용히 폐기)을 기록한다. 두 호출자 모두 이미 타입이 있는 `AnalyticsEventName`을 넘긴다. 현재 키 29개 = 계약의 이벤트 이름 29개.
- **영향**: 공유 계약에서 이벤트를 개명해도 컴파일이 통과하고 메타데이터 정의가 고아가 된다. 유일한 방어선이 런타임 테스트.
- **변경**:
  ```ts
  // metadata.ts
  import type { AnalyticsEventName } from "@repo/db";
  export const ANALYTICS_METADATA_KEYS_BY_EVENT = { … } as const satisfies Record<AnalyticsEventName, readonly string[]>;
  export function sanitizeAnalyticsMetadata(eventName: AnalyticsEventName, metadata: unknown) {
    const allowedKeys = ANALYTICS_METADATA_KEYS_BY_EVENT[eventName];   // 캐스트 삭제
  ```
  `npm run typecheck -w apps/web`가 누락 키를 즉시 알린다. `event-catalog.test.mjs:24-30`은 컴파일러와 중복이 되므로 남겨도 되고 지워도 된다.
- **후속(PRD-11)**: `trackAnalyticsEvent<E extends AnalyticsEventName>(name: E, metadata?: Partial<Record<AllowedMetadataKey<E>, …>>)`로 호출처마다 키를 바인딩 — 모든 호출처를 건드리므로 별도 작업. 조용히 버려지는 키를 컴파일 오류로 바꾸는 것이 그 작업의 가치다.

#### C-27 — `mutateAsync` 프라미스가 JSX 호출처 네 곳에서 버려짐 · [TS·예측]

- **위치**: `widgets/clip-draft-review/ui/index.tsx:288, 297, 332`; `_component/CaptionStyleDialog.tsx:25, 95-99`(`ClipDraftCard.tsx:59, 498` 경유); 훅 `model/use-clip-draft-review.ts:322-336`
- **근거**: 네 액션이 `mutateAsync(...)`를 반환하고 네 `mutationFn`이 실패한 `ActionResult`에서 throw한다. 호출처는 프라미스를 버리고 두 prop 선언은 `=> void`로 넓힌다. `eslint.config.js:32-35`가 `no-misused-promises`를 `checksVoidReturn.attributes: false`로 두어 린트가 잡지 못한다. 같은 위젯의 `ClipDraftCard.runSave:156-166`, `AddCustomClipPanel.handleAdd:63-78`는 처리한다.
- **영향**: 실패한 save/confirm/apply-to-all마다 unhandled rejection. mutation `onError` 토스트는 버려진 프라미스를 settle하지 않는다. 이 앱에는 클라이언트 Sentry 초기화가 없으므로(검증) 이 rejection은 브라우저 콘솔에만 남고 프로덕션 텔레메트리에는 잡히지 않는다.
- **변경**:
  ```ts
  // use-clip-draft-review.ts:322-336
  confirmAndGenerate: () => { confirmMutation.mutate(); },
  selectUpToBudget: (limit: number) => { setSelectionMutation.mutate(new Set(clipDrafts.slice(0, limit).map((d) => d.id))); },
  deselectAll: () => { setSelectionMutation.mutate(new Set<string>()); },
  applyStyleToAll: (style) => { applyStyleMutation.mutate(style); },
  ```
  `saveDraft`는 `mutateAsync` 유지(`runSave`가 로컬 `isSaving`을 위해 await).
- **대안(PRD-7)**: `onApplyToAll: (style) => Promise<void>`로 선언하고 `CaptionStyleDialog` 핸들러를 async로 만들어 resolve 후에만 닫기 — 실패한 일괄 저장에도 다이얼로그가 성공한 듯 닫히는 문제까지 고친다.

#### C-28 — 읽기 이름의 업로드 액션이 reconcile 쓰기를 수행 · [예측]

- **위치**: `features/upload/api/index.ts:483-493, 495-506, 508-517`; queryFn으로 사용 `features/upload/model/query-options.ts:18, 34, 45`; 폴링 `pages/upload-detail/model/use-live-uploaded-file-detail.ts:21-29`
- **근거(검증)**: 세 export 모두 반환 전에 `reconcileStaleUploadedFile(s)ForUser`를 호출한다. 그 reconciler는 `markUploadedFileAttemptFailed`를 쓰고 `worker_timeout`이면 `sendProcessingCancelEventBestEffort`(`entities/uploaded-file/api/index.ts:1013-1028`)로 Inngest cancel 이벤트를 보낸다. 쿼리는 7.5초마다 + focus + reconnect에 refetch.
- **영향**: 호출자는 순수 읽기로 추론해 `useQuery`·`refetch()`·focus refetch·RSC 렌더에 연결했다. 앞으로의 `prefetchQuery`, retry, Strict-Mode 이중 호출이 파이프라인 상태를 바꾼다.
- **변경**: `reconcileAndGetUploadedFileDetails` / `reconcileAndListCurrentUserUploadedFileSummaries` / `reconcileAndListCurrentUserActiveUploadedFileQueueState`로 개명하고 두 쓰기를 doc 주석에 명시. `query-options.ts`, `use-live-uploaded-file-detail.ts` 갱신.
- **대안(PRD-1, 미채택)**: 읽기와 reconcile을 분리해 RSC 페이지와 `reprocessUploadedFile`에서만 reconcile — 폴링 경로에서 시간 기반 reconcile이 사라져 사용자가 보고 있는 동안 stuck 업로드가 `failed`로 전이하지 않게 된다. 제품 결정 필요(§Needs human judgment 3).
- **순서**: C-67과 함께(같은 export의 반환 타입·주석).

#### C-29 — `getUploadedFileDetailsById`가 `| null`을 선언하지만 throw함 · [TS·예측]

- **위치**: `entities/uploaded-file/api/index.ts:376-380`, `:959-985`; `features/upload/api/index.ts:483-493`; 소비자 `src/app/dashboard/uploads/[uploadedFileId]/page.tsx:13-17`
- **근거(검증)**: `Promise<UploadedFileDetail | null>` 선언 + `findFirstOrThrow`. `| null`은 `status === "upload_pending"`(`:407-409`)에서만 도달. 먼저 실행되는 reconcile도 `:983-984`에서 `throw new Error("Uploaded file not found")`. 라우트는 타입을 그대로 믿는다: `if (!uploadedFileData) notFound();`.
- **영향**: 삭제된/타인의 업로드 id 방문이 `notFound()`에 도달하지 못하고 "Failed to load upload details" 경계로 떨어지며, 평범한 404에 Sentry `onRequestError`가 기록된다.
- **변경(둘 다 필요)**:
  ```ts
  // entities/uploaded-file/api/index.ts:380
  -const file = await db.uploadedFile.findFirstOrThrow({
  +const file = await db.uploadedFile.findFirst({
     where: { id: uploadedFileId, userId }, select: { … } });
  +if (!file) return null;
  ```
  ```ts
  // features/upload/api/index.ts:483-493
  const details = await getUploadedFileDetailsById(uploadedFileId, session.user.id);
  if (!details) return null;                       // reconcile 전에 존재 확인
  await reconcileStaleUploadedFileForUser(uploadedFileId, session.user.id);
  return getUploadedFileDetailsById(uploadedFileId, session.user.id);
  ```
  (또는 reconcile 호출을 감싸 "not found" throw를 `null`로 해석.)
- **후속(PRD-18)**: `findUploadedFileSourceState`, `findUploadedFileS3Key`, `findClipById`를 `…OrThrow`로 개명해 throw를 이름에 드러내기(`features/upload/api/index.ts:304,348,527`, `features/clip/api/index.ts:20,41` 호출처는 모두 try/catch 안). `findUploadedFileForProcessRequest`는 C-05가 삭제.

#### C-30 — Modal 웹훅: `req.json()` 미처리와 clip 요소 미검증 · [TS]

- **위치**: `src/app/api/webhooks/modal/route.ts:228, 133-157, 206-215`; 대조 `src/inngest/functions.ts:129-133`; 대조 `src/app/api/analytics/events/route.ts:57-61`
- **근거**: `const rawBody = (await req.json()) as RawModalWebhookBody;` — 잘못된 본문이면 throw → 500(+ Sentry) . `normalizeClip`은 요소가 객체인지 확인 없이 `rawClip.startSeconds` 등을 역참조하는데, 워커의 동일 함수는 `if (!clip || typeof clip !== "object") return null;`로 시작한다. `startSeconds: "abc"`도 `number | null` 타입으로 통과한다.
- **영향**: `{"clips":["oops"]}`가 구조적으로 유효한 `ModalWebhookClip`이 되어 `:271`에서 `Clip` 행에 기록된다. 이 라우트가 백엔드 clip 메타데이터의 유일한 ingress.
- **변경**:
  ```ts
  let rawBody: unknown;
  try { rawBody = await req.json(); } catch { return new Response("Bad Request", { status: 400 }); }
  const body = normalizeBody(rawBody as RawModalWebhookBody);
  ```
  ```ts
  function normalizeClip(clip: unknown): ModalWebhookClip | null {
    if (!clip || typeof clip !== "object") return null;
    const rawClip = clip as RawModalWebhookClip;
    const index = toStrictNonNegativeInteger(rawClip.index);
    if (index === null) return null;
    return { index,
      startSeconds: typeof rawClip.startSeconds === "number" ? rawClip.startSeconds
        : typeof rawClip.start_seconds === "number" ? rawClip.start_seconds : null,
      /* endSeconds 동일 */ … };
  }
  ```
  장기적으로는 Modal 콜백 zod 스키마 하나가 깔끔하지만 위 두 편집이 wire 계약을 건드리지 않는 최소 변경.
- **순서**: C-09가 `normalizeClip`을 이동시키므로 최종 소유 모듈에 가드를 적용.

#### C-31 — Polar 웹훅 메타데이터가 캐스트만으로 DB에 기록됨 · [TS]

- **위치**: `src/app/api/webhooks/polar/route.ts:33, 34, 41, 75, 76, 144`
- **근거**: `data.product?.metadata?.tier as string | undefined`, `Number(...) || 0`, `data.metadata?.userId as string | undefined`. `metadataUserId`는 검증 없이 `Subscription.userId`/`Order.userId`가 되고 `tier`는 `Subscription.planTier`가 된다.
- **영향**: 판매자 제어 메타데이터가 쓰레기 외래키를 쓰거나 rethrow하는 핸들러(`:67`, `:99`) 안에서 Prisma 오류를 내 Polar가 무한 재시도. `Number(x) || 0`은 `NaN`과 `0`을 구분하지 못한다.
- **변경**: 파일 로컬 헬퍼
  ```ts
  function asOptionalString(value: unknown): string | undefined {
    return typeof value === "string" && value.length > 0 ? value : undefined;
  }
  function asNonNegativeInt(value: unknown): number {
    const n = Number(value);
    return Number.isInteger(n) && n >= 0 ? n : 0;
  }
  function toProductMetadata(product: { metadata?: Record<string, unknown> } | null | undefined) {
    return { tier: asOptionalString(product?.metadata?.tier), monthlyCredits: asNonNegativeInt(product?.metadata?.monthlyCredits) };
  }
  ```
  `:33-34`와 `:75-76`(동일 두 줄이 두 번, COH-16)을 `toProductMetadata(data.product)`로, `:41`, `:144`를 `asOptionalString(data.metadata?.userId)`로.

#### C-32 — `parseJsonArray`의 기본 타입 술어가 unsound · [예측·TS]

- **위치**: `src/fsd/shared/lib/utils.ts:8-19`; 호출자 `widgets/clip-display/ui/_component/ClipCard.tsx:44-47`, `widgets/clip-display/model/useMetadataClipboard.ts:17-20`; 렌더 `YoutubeMetadataModal.tsx:171-181, 191`
- **근거(검증)**: 기본 가드 `(x): x is T => x !== null && x !== undefined` — non-nullish면 무엇이든 `T`라고 단언. 두 호출처 모두 `T = string`으로 기본값 사용, 입력은 검증 없는 백엔드 페이로드에서 `JSON.stringify`된 `Clip.youtubeHashtags`.
- **영향**: `hashtags`가 `string[]` 타입인데 객체를 담을 수 있다. `{tag}`(`:178`)는 "Objects are not valid as a React child"로 로컬 경계 없는 모달을 죽이고, `hashtags.join(" ")`(`:191`)은 `[object Object]`.
- **변경**:
  ```ts
  // utils.ts
  export function parseJsonArray<T>(value: string | null | undefined, guard: (item: unknown) => item is T): T[] { … }
  export const isNonEmptyString = (x: unknown): x is string => typeof x === "string" && x.length > 0;
  // ClipCard.tsx:45, useMetadataClipboard.ts:18
  parseJsonArray(clip.youtubeHashtags, isNonEmptyString)
  ```
  호출처가 정확히 둘이라 시그니처 변경이 닫혀 있다.

#### C-33 — `failureCode` 어휘에 공유 카탈로그가 없음 · [응집]

- **위치**: 생산자 `entities/uploaded-file/api/index.ts:135,148,157`, `entities/processing-dispatch/api/index.ts:28,265,282,289`, `features/upload/api/index.ts:203`, `src/inngest/functions.ts:355,375,680,696,735,823-824,940,990,1043`; 유일 소비자 `pages/upload-detail/ui/_component/ProcessingTimeline.tsx:94-125`; 병렬 어휘 `entities/uploaded-file/model/clip-generation-outcome.ts:1-16` → `pages/upload-detail/ui/index.tsx:100-115`
- **근거(grep 검증)**: `getFailureLabel`의 `dispatch_dead_letter`(`:100`)와 `incomplete_clips_generated`(`:120`)는 `src/` 어디에도 생산자가 없다 — 이미 드리프트. 같은 컬럼에 저장되는 partial-clip 코드 둘은 switch에 없고 다른 분기에서 처리된다.
- **영향**: `inngest/functions.ts`에 실패 경로를 추가해도 컴파일이 통과하고 사용자에게 라벨 없이 배포된다. 쓰는 쪽과 읽는 쪽을 묶는 것이 grep뿐.
- **변경**: 새 파일 `entities/uploaded-file/model/failure-code.ts`
  ```ts
  export const UPLOADED_FILE_FAILURE_LABELS = {
    dispatch_failed: "…", worker_timeout: "…", backend_failed: "…", analysis_timeout: "…", /* 실제 생산자가 있는 코드만 */
  } as const;
  export type UploadedFileFailureCode = keyof typeof UPLOADED_FILE_FAILURE_LABELS;
  export function getFailureLabel(code: string | null): string | null { … }
  ```
  `markUploadedFileAttemptFailed(uploadedFileId, attempt, failureCode: UploadedFileFailureCode, …)`(`api/index.ts:832-835`)로 파라미터 타입을 union으로 → 14개 호출처의 리터럴이 컴파일 검사됨. `ProcessingTimeline.tsx:94-125` 삭제 후 임포트. 고아 case 둘 제거. partial-clip 코드 둘도 같은 union에 포함(`clip-generation-outcome.ts`에서 재수출).
- **순서**: C-34보다 먼저.

#### C-42 — `uploadedFileKeys.lists()` 아래에 데이터 형태가 둘 · [결합]

- **위치**: `entities/uploaded-file/model/query-keys.ts:9-15`; `features/upload/ui/index.tsx:103-109`; `features/upload/model/query-options.ts:33, 44`; 무효화 6곳(`features/upload/ui/index.tsx:105,114`; `use-reprocess-uploaded-file.ts:24`; `useUploadPodcast.ts:61`; `RecoverableUploadDrafts.tsx:54,71`; `ClipActions.tsx:99`)
- **근거(검증)**: `currentUserList`(`UploadedFileSummary[]`)와 `currentUserActiveQueue`(객체)가 모두 `lists()` 아래. `features/upload/ui/index.tsx:103-109`는 `setQueriesData<UploadedFileSummary[]>`로 접두사 전체에 쓰며 `Array.isArray`만이 방어.
- **영향**: `lists()` 아래에 배열형 쿼리가 추가되면 업로드 삭제가 그것을 조용히 `.filter`한다. 6곳의 `invalidateQueries(lists())`가 7.5초 큐 폴도 무효화해 클립 삭제가 무관한 큐 refetch를 유발.
- **변경**:
  ```ts
  // query-keys.ts
  activeQueues: () => [...uploadedFileKeys.all, "active-queue"] as const,
  currentUserActiveQueue: (userId: string) => [...uploadedFileKeys.activeQueues(), userId] as const,
  ```
  `query-options.ts:44` 갱신. 큐를 실제로 바꾸는 두 곳(`use-reprocess-uploaded-file.ts:23-25`, `useUploadPodcast.ts:60-62`)에 `invalidateQueries({ queryKey: uploadedFileKeys.activeQueues() })` 추가. `features/upload/ui/index.tsx:106`의 `predicate` 제거. 죽은 `list`/`UploadedFileListFilters` 삭제(C-05와 한 번만).

#### C-54 — 업로드 정리 계약이 서로 모순되는 플래그 둘로 인코딩됨 · [가독·TS]

- **위치**: `src/fsd/pages/dashboard/model/useUploadPodcast.ts:71-258`, 특히 `:88-89, 124, 171, 198, 229, 253-255`
- **근거**: `createdFileId = null`(세 곳)은 "드래프트가 없다"가 아니라 "드래프트를 의도적으로 남긴다"이고, 유일한 목적은 `finally`의 삭제를 억제하는 것. `canAutoDeleteDraft`는 S3 객체가 **있을 때** `false`. 약 180줄 본문, 출구 여섯, `finally` 하나가 두 플래그에 분기.
- **영향**: "실패 시 이 업로드의 DB 행이 삭제되나?"에 답하려면 여섯 출구를 시뮬레이션해야 한다. `createdFileId = null` 없이 early return을 추가하면 사용자가 방금 "Resume"하라고 안내받은 복구 가능 드래프트가 조용히 삭제된다(`:188`, `:250`).
- **변경**:
  ```ts
  type DraftDisposition = "none" | "delete-on-exit" | "keep-for-recovery";
  let draftId: string | null = null;
  let disposition: DraftDisposition = "none";
  // prepareUpload 후: draftId = …; disposition = "delete-on-exit";
  // uploadFileToS3 후:              disposition = "keep-for-recovery";
  // 드래프트를 넘기는 경로:          disposition = "none";
  } finally {
    if (draftId && disposition === "delete-on-exit") { await deleteUploadedFile(draftId).catch(console.error); }
  }
  ```
- **후속(TSC-26)**: `:130-148`과 `:215-240`에 중복된 reconcile-and-report 복구 블록을 모듈 스코프 `recoverSchedulingState(uploadedFileId)`로 추출.

#### C-63 — `hasMetadata`가 `||` 자리에 `??`를 씀 · [TS]

- **위치**: `src/fsd/widgets/clip-display/ui/_component/ClipCard.tsx:49-51`
- **근거(검증)**: `Boolean(clip.youtubeTitle ?? clip.youtubeDescription ?? youtubeHashtags.length > 0)`. `Clip.youtubeTitle`은 `String?`이라 빈 문자열은 non-nullish → `""`에서 단락 → `false`.
- **영향**: 백엔드가 빈 제목을 보내면 설명·해시태그가 있어도 "YouTube Metadata" 메뉴(`ClipActions.tsx:147`)가 비활성.
- **변경**: `Boolean(clip.youtubeTitle) || Boolean(clip.youtubeDescription) || youtubeHashtags.length > 0`.
- **부차 위치(선택)**: `shared/ui/atoms/seo-page-hero.tsx:39`의 `{primaryCta ?? secondaryCta ? … : null}`은 우연히 맞게 동작하지만 같은 우선순위 함정 → `{primaryCta || secondaryCta ? … : null}`.

#### C-64 — `cancelSubscription`이 잡은 오류를 버림 · [TS]

- **위치**: `src/fsd/features/billing/api/index.ts:84-86`
- **근거**: 유일한 실패 지점(`polar.subscriptions.update`, `:78-83`)을 감싼 bare `} catch {`. `upload/api` 8곳, `clip/api` 2곳, `clip-review/api` 3곳은 모두 로깅한다.
- **영향**: 결제 핵심 서드파티 실패가 로그·Sentry에 보이지 않고 사용자 토스트만 남는다.
- **변경**:
  ```ts
  } catch (error) {
    reportError(error, { origin: "billing.cancelSubscription", userId });
    return failure("Failed to cancel subscription. Please try again.");
  }
  ```
  `import { reportError } from "~/fsd/shared/observability";`.

#### C-65 — `react-dropzone`을 임포트하지만 선언하지 않음 · [TS]

- **위치**: `src/fsd/pages/dashboard/ui/_component/UploadPodcast.tsx:17`; `apps/web/package.json:50`
- **근거(검증)**: `npm ls react-dropzone shadcn-dropzone -w apps/web` → `shadcn-dropzone@0.2.1 └── react-dropzone@14.3.8`. `shadcn-dropzone`은 `src/`에서 임포트되지 않는다. `shadcn-dropzone`의 `peerDependencies`는 `react: "^18"`(이 앱은 19).
- **영향**: 미사용 패키지 제거, 버전 상향, 엄격한 hoisting 모드 중 어느 것이든 대시보드 업로드 페이지 빌드가 깨진다.
- **변경**: `apps/web/package.json` — `"shadcn-dropzone": "^0.2.1"` 삭제, `"react-dropzone": "^14.3.8"` 추가. 임포트 경로 불변. `npm install` 후 `npm run build -w apps/web`.

#### C-73 — 헤더 위젯 둘이 같은 마크업을 중복하고 인증 상태가 서로 다름 · [응집·결합] (2라운드, COH-10 (a))

- **위치**: `src/fsd/widgets/site-header/ui/index.tsx:1-95`(`"use client"`, 인증 인지); `src/fsd/widgets/site-header/ui/public-header.tsx:1-38`(서버, 로그아웃 전용); 유일 소비자 각각 `pages/home/ui/index.tsx:1,26`, `(public-marketing)/layout.tsx:2,12`
- **근거(검증)**: `index.tsx:31-48`과 `public-header.tsx:9-26`은 로고 블록 + `PUBLIC_NAV_ITEMS` nav가 바이트 동일하고, 꼬리만 다르다 — `public-header.tsx:28-35`는 "Log in" `TrackedLink`, `index.tsx:50-92`는 같은 버튼 + `signOut`이 있는 아바타 `DropdownMenu`. `(public-marketing)` 그룹의 15개 `page.tsx`와 레이아웃에는 `auth()` 호출이 **없다**.
- **영향**: 로그인한 방문자가 `/`에서는 아바타를, `/features`·`/pricing`·`/guides`에서는 "Log in" 버튼을 본다 — 어느 컴포넌트를 임포트했는지의 우연. nav·로고 변경이 두 곳 편집.
- **변경(게이트 축소안)**:
  1. `index.tsx:61-91`의 드롭다운을 `widgets/site-header/ui/_component/HeaderAuthMenu.tsx`(`"use client"`, `signOut` 호출)로 추출.
  2. `public-header.tsx`에 로그아웃 기본값의 선택 props 부여:
     ```ts
     interface PublicHeaderProps { isLoggedIn?: boolean; email?: string | null; image?: string | null }
     ```
     `isLoggedIn`일 때만 `<HeaderAuthMenu>`를 렌더. `public-header.tsx` 자체는 서버 컴포넌트 유지.
  3. `widgets/site-header/ui/index.tsx` 삭제; `pages/home/ui/index.tsx:1,26`을 `<PublicHeader isLoggedIn={isLoggedIn} email={email} image={image} />`로.
  4. `(public-marketing)/layout.tsx:12`는 props·세션 없이 `<PublicHeader />` 유지 → 15 라우트는 static 그대로.
- **명시적으로 제외(게이트 정정)**: 렌즈 재제출안의 "`pages/home/ui/index.tsx:25-36` 중복 셸 삭제 + `app/page.tsx` → `app/(public-marketing)/page.tsx` 이동"은 서로 모순되어 **수용하지 않는다**. `:25-36`은 바로 위에서 갱신하라는 헤더 호출을 포함하고, `/`가 그룹 안으로 들어가면 레이아웃이 props 없는 `<PublicHeader />`를 공급하므로 유일하게 일관된 해석은 `/`의 로그인 아바타를 조용히 없애고 `app/page.tsx:27-39`의 `auth()` + `getHomeUserProfile`을 고아로 만든다. `pages/home/ui/index.tsx:16-24`의 그라디언트 장식은 헤더를 포함하는 바깥 `relative overflow-hidden` div 기준으로 배치되어 있어 레이아웃 `<main>` 안으로 옮기면 헤더 띠에서 멀어진다. → §Needs human judgment 5.
- **잔여**: `pages/home/ui/index.tsx:25`가 레이아웃의 `mx-auto flex min-h-screen w-full max-w-6xl flex-col px-6 pb-16` 클래스 문자열을 한 줄 반복한다(오늘의 4변형 문제 대비 한 줄).
- **주의**: 두 "Log in" 버튼을 합치면 `TrackedLink`의 `location` 값(`"site_header"` vs `"public_header"`)이 하나가 된다. 하나를 의도적으로 고를 것 — 허용 목록은 이 변화를 잡지 않는다(§Needs human judgment 9).
- **대안**: 15 마케팅 라우트 전부를 인증 인지로 — 레이아웃 `auth()`(15 static 라우트를 dynamic으로) 또는 클라이언트 아일랜드 + `app/providers.tsx:49-56`에 없는 `SessionProvider`. 제품 결정(§Needs human judgment 6).
- **순서**: C-72 이후; **C-43·C-37보다 먼저**. 검증: `npm run build -w apps/web`에서 15 라우트의 static/dynamic 표기 불변.

#### C-75 — 엔티티 간 오케스트레이션이 엔티티 레이어에 있음 · [결합] (2라운드, CPL-2)

- **위치**: `entities/uploaded-file/api/index.ts:6`(임포트), `:804-830`(`completeUploadedFileProcessingAttempt`); `entities/processing-dispatch/api/index.ts:4, 6-16`(임포트), `:142-293`(`dispatchProcessingRequestByIdOrFail`); barrel `entities/uploaded-file/index.ts:2`, `entities/processing-dispatch/index.ts:3, 7`; 호출자 `src/inngest/functions.ts:9, 710`, `features/upload/api/index.ts:8-10, 197`
- **근거(검증)**: `src/fsd/entities/**` 아래 엔티티 간 임포트는 이 네 곳뿐. `uploaded-file/api/index.ts:6`은 `~/fsd/entities/user`의 `decrementUserCreditsFloorZero`를 임포트해 `:827`에서 두 엔티티를 쓰는 `db.$transaction`에 사용. `processing-dispatch/api/index.ts:6-16`은 `~/fsd/entities/uploaded-file`, `…/model/attempt-prefix`, `~/fsd/entities/clip-draft`, `~/fsd/shared/observability`를 임포트해 모두 `dispatchProcessingRequestByIdOrFail` 안에서 소비 — 행 claim, 업로드 파일 상태 변경(`:168`), clip draft 읽기, Inngest 이벤트 발신, Sentry 보고.
- **영향**: peer 격리 규칙(`fsd-architecture-guidelines.md` §5.2, `CLAUDE.md:100`)과 "상위 레이어의 `api/`는 오케스트레이션 전용"(`guidelines:100`) 위반. `decrementUserCreditsFloorZero` 변경이 `inngest/functions.ts:707-727` 재테스트를 강제하고, `entities/processing-dispatch` 임포터는 모듈 셋 + `~/inngest/client`를 전이적으로 끌어온다.
- **목적지(규약 합치 검증)**: `guidelines:94`가 "사용자 행위 단위의 조합/저장"을 `features/<feature>/api/`에 둔다. `features/upload/api/`에는 현재 `index.ts`(1행 `"use server"`)만 있고, 그 파일이 `db`(`:6`)·`auth`(`:5`)·엔티티 함수 20여 개를 임포트해도 그것들이 액션이 되지 않는다 — 지시어는 **파일 단위**. 그래서 **`"use server"` 없는 형제 모듈**이 안전한 목적지다. `features/upload/api/index.ts`에 넣으면 `dispatchProcessingRequestByIdOrFail(dispatchId)`(auth 검사 없음)가 클라이언트 호출 가능한 RPC 엔드포인트가 된다.
- **변경(게이트 축소안)** — 두 파일 모두 1행 `import "server-only";`, `"use server"` **없음**:
  - **`features/upload/api/complete-processing-attempt.ts`** — `completeUploadedFileProcessingAttempt`를 `entities/uploaded-file/api/index.ts:804-830`에서 그대로 이동. 임포트: `db`(`~/server/db`), `markUploadedFileAttemptProcessed`(엔티티 barrel `:21`에 이미 있음), `decrementUserCreditsFloorZero`. `entities/uploaded-file/api/index.ts:6`, `:804-830`, barrel `index.ts:2` 삭제. 유일 호출자 `inngest/functions.ts:8-16` 임포트 블록에서 분리해 `import { completeUploadedFileProcessingAttempt } from "~/fsd/features/upload/api/complete-processing-attempt";`; `:710` 호출 불변.
  - **`features/upload/api/dispatch-processing.ts`** — `dispatchProcessingRequestByIdOrFail`(`:142-293`), private `deadLetterClaimedNonSentDispatch`(`:135-140`), `toErrorMessage`(`:34-36`), `DispatchProcessingResult` 타입(`:23-28`)을 이동. `entities/processing-dispatch/index.ts:3`(함수 제거), `:7`(타입 이동) 갱신. 호출자 `features/upload/api/index.ts:8-10` → `import { createProcessingDispatch } from "~/fsd/entities/processing-dispatch";` + `import { dispatchProcessingRequestByIdOrFail } from "./dispatch-processing";`; `:197` 호출 불변.
- **게이트 정정(렌즈 재제출안 대비)**: `findPendingProcessingDispatchById`(`:54-79`), `claimPendingProcessingDispatch`(`:81-100`), `PendingProcessingDispatch` 별칭(`:19-21`)은 **엔티티에 남기고 export한다**. 둘 다 단일 테이블 `db.processingDispatch` 읽기/쓰기라 피처로 옮기면 peer 격리 위반을 규칙 1(`guidelines:93`)과 `:192-193`의 안티패턴("features는 `prisma.X` 직접 호출 금지") 위반으로 바꿀 뿐이다. 역방향 엣지 없음 확인: `markProcessingDispatchSent`/`…DeadLetter`는 `dispatchId: string`을 받고, `deadLetterClaimedNonSentDispatch`는 엔티티로 하향 호출하며, `getClient`(`:30-32`)는 남는 함수만 쓴다. C-70의 `DISPATCH_STATUS` 여섯 지점도 전부 엔티티 안에 남는다.
- **방향 검사(검증)**: `src/inngest/`는 `app/api/inngest/route.ts`로만 도달하며 이미 `entities/*`·`shared/*`로 하향 임포트(`functions.ts:3-30`). `complete-processing-attempt.ts`는 `~/server/db`와 엔티티 둘만 임포트하고 `~/inngest/*`는 임포트하지 않으므로 새 엣지 `inngest/functions.ts → features/upload/api/*`는 하향이며 사이클 없음. `dispatch-processing.ts`는 `~/inngest/client`를 임포트하지만 `src/inngest/` 아래 어떤 파일도 그것을 임포트하지 않는다.
- **C-08과의 제약**: 두 모듈을 `features/upload/index.ts`에 **넣지 않는다**(클라이언트 임포트 barrel — `pages/upload-detail/ui/index.tsx:10`). 파일 경로 임포트 유지.
- **심각도**: 렌즈의 Must → Should. 라이브 결함 없는 규약 위반이며 C-07과 같은 등급.
- **순서**: **C-46보다 먼저**(C-46이 이동된 함수를 개명). C-76과 같은 두 파일(`entities/uploaded-file/index.ts`, `features/upload/api/index.ts` 임포트 블록)을 건드리므로 연달아.
- **검증**: `grep -n '"use server"' apps/web/src/fsd/features/upload/api/*.ts` → `index.ts:1`만; `grep -rn 'from "~/fsd/entities/' apps/web/src/fsd/entities` → 0건; `npm run typecheck && npm run build -w apps/web`.

### CONSIDER

근거가 명확하고 변경이 작지만 급하지 않은 항목. 각 항목은 위치·근거·변경만 적는다(영향은 근거 안에 요약).

#### C-06 — pass-through `model/types.ts` shim 삭제 · [결합]

- **위치**: `pages/dashboard/model/types.ts:1`, `widgets/uploaded-file-list/model/types.ts:1`, `pages/upload-detail/model/types.ts:1`(임포터 0)
- **근거**: 한 줄짜리 재수출 셋이 같은 `UploadedFileSummary`에 대해 한 페이지 슬라이스 안에서 네 가지 임포트 지정자를 만든다(`useUploadPodcast.ts:17`, `UploadPodcast.tsx:33`, `QueueStatus.tsx:15`, `pages/dashboard/ui/index.tsx:9-13`). 독자는 `../../model/types`를 보고 화면 전용 DTO라고 오해한다.
- **변경**: 세 파일 삭제, 임포터 6곳을 `~/fsd/entities/uploaded-file`로(C-07 전이라면 `…/model/types`). `verbatimModuleSyntax` 아래 타입 전용이라 런타임 영향 없음.
- **순서**: C-07 이후.

#### C-08 — 피처 공개 API 완성 · [결합]

- **위치**: `features/upload/index.ts:1-2`(심볼 2개 export) vs `~/fsd/features/upload/api` 깊은 임포터 7곳(`app/dashboard/uploads/[uploadedFileId]/page.tsx:2`, `useUploadPodcast.ts:16`, `RecoverableUploadDrafts.tsx:10`, `OriginalMediaCard.tsx:3`, `clip-draft-review/ui/index.tsx:6`, `use-clip-draft-review.ts:14`, `UploadedFileCard.tsx:7`) + `pages/dashboard/ui/index.tsx:14-17`(`model/query-options`); `features/clip/`에 `index.ts` 없음(`clip-display/ui/index.tsx:5`, `ClipCard.tsx:7`); `pages/pricing/ui/index.tsx:3` → `features/billing/config/plan-tiers`
- **변경**:
  ```ts
  // features/upload/index.ts 에 추가
  export { confirmClipDraftsAndGenerate, confirmUploadObjectExists, deleteUploadedFile, getOriginalPlayUrl,
    getUploadedFileDetails, prepareUpload, reconcileProcessingRequest, reconcileUploadConfirmation,
    reprocessUploadedFile, scheduleUploadedFileProcessing } from "./api";
  export { currentUserActiveUploadQueueQueryOptions, currentUserUploadedFileListQueryOptions } from "./model/query-options";
  export { useDeleteUploadedFile } from "./model/use-delete-uploaded-file";   // C-19
  export { useResumeUploadDraft } from "./model/use-resume-upload-draft";     // C-19
  ```
  ```ts
  // features/clip/index.ts (신규)
  export { deleteClip, getClipPlayUrl } from "./api";
  export { useDeleteClip } from "./model/use-delete-clip";                   // C-18
  ```
  일반 모듈을 통한 재수출은 `"use server"`가 원본 모듈에 있으므로 서버 액션 의미를 보존한다. 깊은 임포터를 barrel로 재연결.
- **주의**: `pages/pricing/ui/index.tsx:3`을 `features/billing/index.ts`로 돌리지 **말 것** — 그 barrel은 `getProductIds`를 내보낸다(C-03). 대신 `plan-tiers.ts`를 `shared/config/plan-tiers.ts`로 옮기거나(마케팅 페이지와 `PlanCard.tsx:16`이 함께 쓰는 순수 데이터) 깊은 임포트에 이유 주석을 남긴다. **C-75·C-76의 새 server-only 모듈(`complete-processing-attempt.ts`, `dispatch-processing.ts`, `reconcile-stale-processing.ts`)은 이 barrel에 넣지 않는다** — `pages/upload-detail/ui/index.tsx:10`이 클라이언트에서 이 barrel을 임포트한다.
- **순서**: C-19, C-18 이후.

#### C-12 — `isActiveProcessingStatus`에 narrowing 시그니처 부여 · [예측·가독]

- **위치**: `entities/uploaded-file/model/processing-status.ts:28-30`(plain `boolean`); 비공개 유사 이름 `isActiveProcessingStatusValue` `api/index.ts:115-121`(narrowing), 사용 `:989`
- **변경**:
  ```ts
  export type ActiveProcessingStatus = (typeof ACTIVE_PROCESSING_STATUSES)[number];
  export function isActiveProcessingStatus(status: string): status is ActiveProcessingStatus {
    return ACTIVE_PROCESSING_STATUS_SET.has(status);
  }
  ```
  `api/index.ts:115-121` 삭제, `:989`는 공개 술어 사용. 기존 호출자 5곳(`features/upload/api/index.ts:124,562`, `features/upload/ui/index.tsx:77`, `pages/dashboard/ui/index.tsx:50`, `use-live-uploaded-file-detail.ts:15`)은 영향 없음. C-76이 이 헬퍼를 `features/upload/api/reconcile-stale-processing.ts`로 이동시키므로 그 전에 하면 이동 대상이 하나 준다.

#### C-13 — `applyModalPayload`의 숨은 쓰기를 이름에 드러내고 죽은 `return` 삭제 · [TS·예측·가독]

- **위치**: `src/inngest/functions.ts:475-479, 482-502`; 호출 `:511, 537, 576`
- **근거**: `void` 함수가 루프 제어 변수 셋(`modalCallbackReceived`, `backendClips`, `backendFailureMessage`)을 다시 쓰고, 이 값들이 `resolveModalPollAction`(`:556-562`)과 종료 분기(`:658, 665, 669-673`)를 결정한다. 끝의 `return;`은 빈 꼬리를 지킨다.
- **변경**: `return;` 삭제; `applyModalPayload` → `recordModalPayloadIntoAttemptState`로 개명. `:490-493`의 한국어 주석(콜백당 1회 불변식)은 유지.
- **대안(PRD-19/RDB-14)**: 함수를 순수하게 만들어 `{ clips, failureMessage }`를 반환하고 호출처에서 대입 — 더 크며 기록만.

#### C-16 — 항상 true인 `allowDelete` prop 제거 · [가독]

- **위치**: `clip-display/ui/index.tsx:10, 15, 34`; `ClipCard.tsx:25, 32, 131`; `ClipActions.tsx:36, 50, 66-69, 164, 170-175`
- **근거(검증)**: 유일한 인스턴스는 `<ClipDisplay clips={clips} />`(`pages/upload-detail/ui/index.tsx:187`). `Lock` 아이콘, "Delete disabled" 라벨, `!allowDelete` 비활성 항, `"Visible clips cannot be deleted"` 가드가 모두 도달 불가이고, 그 토스트는 어떤 코드도 강제하지 않는 규칙을 말한다.
- **변경**: 세 컴포넌트에서 prop과 네 분기 삭제. `ClipActions`는 `disabled={isDeleting}`과 무조건 `<Trash/> Delete`만 남긴다. 필요해지면 규칙이 실제로 사는 곳(업로드 status)에서 `canDelete`를 계산해 재도입.
- **순서**: C-17, C-18과 같은 파일 — 함께.

#### C-21 — 포섭된 `/dashboard` 분기와 죽은 `/admin` 가드 삭제 · [가독·응집·결합]

- **위치**: `AnalyticsTracker.tsx:30-32`(`/dashboard/uploads/` → null)는 `:34-36`(`/dashboard` → null)에 완전히 포섭. `/admin` 필터 네 곳: `AnalyticsTracker.tsx:10, 59`; `track-event.ts:50`; `app/api/analytics/events/route.ts:83`. `src/app/admin`은 없다(`CLAUDE.md:21`).
- **변경**: `AnalyticsTracker.tsx:30-32` 삭제. 클라이언트 측 `/admin` 가드 셋 삭제. **서버 측 `events/route.ts:83`은 유지** — 임의의 클라이언트 입력을 서버에서 거르는 역할.
- **보류**: COH-21/CPL-18의 라우트→이벤트 테이블을 `app/providers.tsx`에서 주입하는 안 — 중앙에 한 번 마운트되는 작은 테이블에 비해 과하고 레이어 위반을 prop drilling으로 바꿀 뿐.

#### C-22 — 중복된 `clipType` 라벨 맵을 엔티티로 내리기 · [결합·응집]

- **위치**: `widgets/clip-display/model/clip-rationale.ts:1-17`과 `widgets/clip-draft-review/ui/_component/ClipDraftCard.tsx:22-30, 294`
- **근거**: 동일 맵 둘. 전자는 trim·null 가드, 후자는 bare lookup이라 공백 포함 값이 이미 두 화면에서 다르게 보인다. `clip-rationale.ts:3-4` 주석은 peer 임포트 금지를 이유로 드는데, 올바른 해법은 옆이 아니라 아래다.
- **변경**: `entities/clip/lib/clip-type-label.ts`에 `clipTypeLabel(clipType: string | null | undefined): string | null`(trim 버전 본문). `clip-rationale.ts:1-17` 삭제 후 `export { clipTypeLabel } from "~/fsd/entities/clip/lib/clip-type-label";`로 재수출(`hasClipRationale`은 위젯 표시 술어라 유지 → `clip-rationale.test.mjs:4` 무변경). `ClipDraftCard.tsx:22-30` 삭제, `:294` → `clipTypeLabel(draft.clipType)`. **파일 경로로 임포트**(`entities/clip/index.ts`는 C-07 전까지 `server-only` barrel). `clip-rationale.test.mjs`의 `clipTypeLabel` 케이스를 `entities/clip/lib/clip-type-label.test.mjs`로 이동.

#### C-23 — `handle-*` 웹훅 결과를 `ActionResult`로 통일 · [예측·가독]

- **위치**: `handle-order-created/api/index.ts:30, 35, 47`; `handle-subscription-active:43, 78`; `handle-subscription-canceled:17, 26`; `handle-subscription-updated:26, 48`; 소비자 `app/api/webhooks/polar/route.ts:49, 91, 113, 147`(+ `result.userId` `:60, :156`)
- **근거**: `{ ok, reason }` vs 앱 전역 `{ success, error }`. `ok` 형태에는 `success`가 없으므로 `if (!result.success)`가 항상 참 — 섞인 호출처가 타입을 통과한다. `use-reprocess-uploaded-file.ts:15` 등의 `result.error ?? "…"` 폴백(C-25)이 계약이 추론되지 않는다는 증거.
- **변경**: 네 핸들러가 `success({ userId, skipped })`/`failure("missing-user")`를 반환하고 네 체크를 `if (!result.success)`로, `result.userId`를 `result.data.userId`로. 동반(PRD-13): `widgets/clip-display/lib/copy-to-clipboard.ts:1-3`의 `ClipboardResult`를 `ActionResult<void>` 별칭으로.
- **순서**: C-24와 같이.

#### C-24 — `resolveUserId` 중복 제거 · [응집]

- **위치**: `handle-order-created/api/index.ts:14-24`와 `handle-subscription-active/api/index.ts:26-36`(입력 타입 이름만 다른 동일 본문)
- **변경**: `entities/user/api/index.ts`에 `resolvePolarCustomerUserId(input: { metadataUserId?: string; customerEmail?: string })`(본문은 `findUserIdByEmail` 호출뿐) 추가, `entities/user/index.ts`에서 export, 두 사본 삭제.

#### C-25 — 죽은 `result.error ?? "…"` 폴백 다섯 개 삭제 · [TS]

- **위치**: `features/upload/model/use-reprocess-uploaded-file.ts:15`; `features/upload/ui/index.tsx:53`; `pages/dashboard/ui/_component/RecoverableUploadDrafts.tsx:48, 65`; `widgets/clip-display/ui/_component/ClipActions.tsx:105`
- **근거**: `ActionResult`의 실패 분기는 `error: string` 필수. 폴백 문자열은 도달 불가이며 독자에게 계약을 의심하게 한다.
- **변경**: 다섯 곳의 `?? "…"` 삭제(`throw new Error(result.error)`, `toast.error(result.error)`).

#### C-26 — BillingPage 폴링 상수 호이스트, boolean 이름 정리 · [가독·TS·응집]

- **위치**: `features/billing/ui/BillingPage.tsx:20, 22, 25-26, 29-46, 78`; `CaptionStyleEditor.tsx:90-91`
- **근거(검증)**: `POLLING_INTERVAL_MS`/`POLLING_TIMEOUT_MS`가 컴포넌트 본문 안에 선언되고 dep 배열이 생략된 `useEffect`에서 읽힌다. `polling`은 "구독 활성화 대기 중, 배너 표시"를 뜻하고 `showSuccessBanner`는 배너·폴링·`checkout_returned_success` 이벤트 셋을 게이트한다.
- **변경**: 두 상수를 모듈 스코프로. `polling` → `isActivatingSubscription`, `showSuccessBanner` → `hasReturnedFromCheckout`, `subscriptionEnabled` → `isSubscriptionEnabled`(호출자 `app/dashboard/billing/page.tsx:25-26` 한 곳). `elapsed` 누적 대신 `MAX_SUBSCRIPTION_POLLS = TIMEOUT / INTERVAL` 카운트. `CaptionStyleEditor`: `PREVIEW_HEIGHT_PX` 호이스트, bare `1920`을 `/** 백엔드 ASS PlayResY (main.py). */ const ASS_PLAY_RES_Y = 1920;`로.
- **보류(COH-7)**: billing을 `billingKeys` + `queryOptions` + cancel mutation 훅으로 이전 — 근거보다 큰 재작성. "refresh 메커니즘 둘이 경합한다"는 관찰은 동기로만 기록.

#### C-34 — `failureCode`의 두 의미를 DTO 경계에서 판별 · [예측]

- **위치**: `entities/uploaded-file/api/index.ts:721-745, 804-830`(성공 경로에서 `failureCode: options?.noteCode ?? null`); `model/types.ts:33`(`failureCode: string | null`); `pages/upload-detail/ui/index.tsx:100`(노트로 읽음) vs `ProcessingTimeline.tsx:157-158`(실패 이유로 읽음)
- **변경**: `model/types.ts`의 `failureCode`를
  ```ts
  outcome:
    | { kind: "none" }
    | { kind: "failure"; failureCode: UploadedFileFailureCode }
    | { kind: "partial-success"; noteCode: PartialClipResultCode };
  ```
  로 바꾸고 `getUploadedFileDetailsById`(`api/index.ts:437-443`)에서 `status` + raw 컬럼으로 한 번 조립. 두 UI는 `outcome.kind`로 switch. DB 컬럼과 쓰기 시그니처는 그대로.
- **순서**: C-33 이후.

#### C-35 — 대시보드 두 데이터 경로가 동일하게 reconcile하도록 · [응집]

- **위치**: `app/dashboard/page.tsx:20-26`은 `reconcileUploadDraftsForUser`를 실행하지만 refetch 경로(`features/upload/api/index.ts:495-506`)는 하지 않는다.
- **근거**: 드래프트 승격/만료가 하드 내비게이션에서만 돌아, 클라이언트 refetch 뒤 `recoverableDrafts`(RSC prop, `pages/dashboard/ui/index.tsx:40,131`)가 이미 승격된 드래프트를 계속 보여줄 수 있다.
- **변경(최소)**: `reconcileUploadDraftsForUser`를 목록 액션 안으로 옮겨 두 경로를 일치시킨다.
- **대안(COH-8)**: `listCurrentUserDashboardData()` 하나가 두 reconcile을 소유하고 `{ uploadedFiles, recoverableDrafts }`를 반환, 페이지는 드래프트를 prop 대신 쿼리에서 읽음.

#### C-36 — `resources` 슬라이스를 라우트별 다섯 슬라이스로 분할 · [응집]

- **위치**: `pages/resources/ui/index.tsx:50, 99, 142, 192, 243`(`/about`, `/contact`, `/security`, `/how-it-works`, `/changelog`의 페이지 컴포넌트 다섯이 한 파일), `pages/resources/config/index.ts:1-218`, `pages/resources/model/types.ts:1-18`
- **변경**: `pages/{about,contact,security,how-it-works,changelog}/{ui,config}` 생성, 각 컴포넌트와 자기 상수만 그대로 이동. 공유 `ResourceCardGrid`(`ui/index.tsx:28-48`)와 `ResourceCard`/`ProcessStep` 타입은 `shared/ui/atoms/resource-card-grid.tsx`로. `productCapabilities`/`supportEmail`은 `shared/config/constants.ts`로. `(public-marketing)/{about,contact,security,how-it-works,changelog}/page.tsx` 임포트 갱신 후 `pages/resources/` 삭제. 동작 변화 없음.

#### C-37 — 공개 라우트 개명을 컴파일 오류로 · [응집]

- **위치**: `app/sitemap.ts:24-95`(리터럴 15), `widgets/site-footer/ui/index.tsx:3-46`(href 15), `widgets/site-header/config/public-nav.ts:1-6`(4), `app/robots.ts:9`
- **변경(범위 한정)**: `shared/config/public-routes.ts`에 `PUBLIC_ROUTES` 배열과 `PublicRoutePath` union을 두고 푸터 그룹·nav를 거기서 유도, 푸터/`TrackedLink`의 `href` prop을 `PublicRoutePath`로 타입. sitemap의 `changeFrequency`/`priority`/`lastModified`와 `robots.ts`(비공개 경로 열거)는 그대로 — 세 관심사를 과결합하지 않기 위해.

#### C-38 — 사실과 다른 제품 한계 문구 둘 정정 · [응집]

- **위치**: `shared/config/constants.ts:37-40`은 `MIN_SECONDS: 30, MAX_SECONDS: 90`. `src/app/terms/page.tsx:40-41` "typically between 30 and 60 seconds"(검증), `pages/youtube-shorts-generator/config/index.ts` `shortsFaq` "between 40 and 60 seconds"(능력 주장).
- **변경**: 위 둘 정정. 의도적으로 좁힌 마케팅 문구("40-60s" 타깃팅, 약 10파일)는 두되 `// 마케팅 목표값. 실제 상한은 CLIP_DURATION_LIMITS` 한 줄 주석.
- **보류(COH-13)**: 약 20곳에 `PRODUCT_LIMITS_COPY` 보간 — 편집 가능한 마케팅 카피를 의도적으로 다른 런타임 상수에 묶게 됨.

#### C-39 — 미들웨어 matcher를 인증 라우트 목록에 묶기 · [응집]

- **위치**: `server/auth/config.edge.ts:3-4`(`PROTECTED_ROUTES`/`AUTH_ROUTES`, 미export); `middleware.ts:6-8`(`matcher: ["/dashboard/:path*", "/login"]`)
- **근거**: `authorized` 콜백은 matcher가 허용한 경로에서만 돌므로, `PROTECTED_ROUTES`에만 추가하면 보호된 것처럼 읽히는 무방비 라우트가 생긴다. **검증**: Next는 `get-page-static-info.js:372,440`에서 `extractExportedConstValue(ast, 'config')`로 미들웨어 `config`를 정적 추출하고 리터럴이 아니면 `UnsupportedValueError`를 던진다 — 상수에서 matcher를 계산하는 대안은 불가.
- **변경**: `config.edge.ts:3-4`를 `export const … as const`로. `middleware.ts`의 `config` 바로 위에 둘을 임포트하고 주석:
  ```ts
  // ⚠️ matcher는 Next가 정적으로 추출하므로 계산해서 만들 수 없다.
  // PROTECTED_ROUTES/AUTH_ROUTES를 바꾸면 아래 배열도 함께 고칠 것.
  ```
  `src/middleware.test.mjs`(Node 러너) 추가: 두 목록의 모든 항목이 matcher 패턴 중 하나에 포섭됨을 단언. 조용한 드리프트가 실패 테스트로 바뀐다.

#### C-40 — 단일 테이블 UploadedFile 쓰기를 엔티티로 되돌리기 · [응집]

- **위치**: `features/upload/api/index.ts:89-105, 139-158, 408-420`(claim 트랜잭션이 라이프사이클 컬럼 7개를 손으로 씀); `features/clip-review/api/index.ts:32-35, 129-132`(자체 `db.uploadedFile.findFirst`, `entities/clip-draft/api/index.ts:42-65`에 같은 형태가 이미 있음)
- **변경**: `entities/uploaded-file/api`에 `claimNextProcessingAttempt(uploadedFileId, userId, allowedStatuses, currentAttempt, { tx, now })` → `{ claimed, attempt }`(`:139-158` 본문), `findUploadedFileForScheduling(uploadedFileId, userId, { tx })`(`:89-105`), `findUploadedFileReviewState(uploadedFileId, userId)` → `{ id, status, reviewAttempt, transcriptS3Key }`(clip-review 두 곳) 추가. `clip-review/api/index.ts`에서 `~/server/db` 임포트 제거. 신뢰도 Medium.

#### C-41 — 죽은 Suspense 경계 삭제 · [응집]

- **위치**: `pages/upload-detail/ui/index.tsx:181-193` — 이미 해석된 props를 받는 동기 `"use client"` 컴포넌트 `<ClipDisplay>`를 `<Suspense fallback="Loading clips...">`로 감쌈.
- **변경**: 래퍼 삭제, 조건은 유지. 선택: `ClipVideoPlayer.skeleton.tsx`를 만들어 `UploadedFileCard.tsx:58-60`과 `OriginalMediaCard.tsx:40-49`가 각자 placeholder를 만들지 않게.

#### C-43 — HomePage의 auth prop pass-through를 slot으로 · [결합]

- **위치**: `app/page.tsx:26-49`(fetch + prop 3); `pages/home/ui/index.tsx:8-14, 26`(한 줄에서 `SiteHeader`로 전달만)
- **변경**: `HomePageProps`를 `{ header: ReactNode }`로, `:26`을 `{header}`로. `app/page.tsx:43-50`에서 헤더를 렌더. **C-73 이후**에는 slot 내용이 `<PublicHeader isLoggedIn={isLoggedIn} email={email} image={image} />`(`SiteHeader`는 사라짐). C-73을 미룬다면 `<SiteHeader isLoggedIn={…} email={…} image={…} />`로 독립 적용 가능.
- **순서**: C-73 먼저.

#### C-44 — `shared/api` 세 모듈에 `import "server-only"` · [결합]

- **위치**: `shared/api/s3.ts`(AWS 키 `:24-26`, 버킷 `:38,52,64,84,94,110`), `shared/api/polar.ts`(`:11`), `shared/api/auth-guard.ts`(`~/server/auth`)
- **근거**: 여섯 `entities/*/api/index.ts`가 규약을 세웠는데 실제 비밀을 쥔 셋에는 없다. 지금 클라이언트 임포트는 없으므로 guard rail.
- **변경**: 세 파일 1행에 `import "server-only";`. C-10의 `useQuery` 대안을 채택한다면 먼저 `S3_CONFIG.PRESIGNED_GET_URL_EXPIRY`를 `shared/config/constants.ts`의 `PRESIGNED_URL_EXPIRY = { GET_SECONDS: 3600, PUT_SECONDS: 600 }`로 옮기고 `s3.ts:14-17`이 재유도(호출처 `features/upload/api/index.ts:255,534`, `features/clip/api/index.ts:24`, `features/clip-review/api/index.ts:43` 확인). 검증은 `npm run build -w apps/web`.

#### C-45 — 초기 active-queue 상태를 서버 컴포넌트가 공급 · [결합·가독]

- **위치**: `pages/dashboard/ui/index.tsx:49-59`(검증) — bare `slice(0, 25)`와 자체 `isActiveProcessingStatus` 필터로 서버 형태를 클라이언트에서 재구성, `entities/uploaded-file/api/index.ts:263-266, 270-274`의 복제.
- **변경**: `app/dashboard/page.tsx:23-26`의 `Promise.all`에 `listActiveUploadedFileQueueStateByUserId`를 추가하고 `initialActiveQueue` prop으로 전달. `pages/dashboard/ui/index.tsx`에 `initialActiveQueue: ActiveUploadedFileQueueState` prop 추가, `:49-59`와 `:8`의 임포트 삭제, `:65`·`:69`에서 사용. `:98`의 `router.refresh()`는 유지(크레딧 배지를 갱신하는 유일한 수단). 그 refresh가 `app/dashboard/page.tsx:20-21`의 두 DB 스윕도 재실행한다는 비용은 별도 재검토 항목.
- **대안(RDB-10)**: `ACTIVE_QUEUE_PREVIEW_LIMIT = 25` 공유 상수 — 리터럴만 고치고 status 필터 중복은 남는다.

#### C-46 — `dispatchProcessingRequestByIdOrFail` 개명, `not_found` 분리 · [예측]

- **위치**: `entities/processing-dispatch/api/index.ts:142`(이름), `:152-156`(claim 경합 → `not_found`), `:287-291`(throw 대신 `{status:"failed"}` 반환)
- **근거**: `OrFail`은 이 코드베이스에서 throw를 뜻하는 표식(`findFirstOrThrow` 6회). claim 경합은 존재하는 행에 `not_found`를 반환. **정정**: 경합 경로는 `try` 이전에 반환하므로 dead-letter되지 **않는다** — 결함은 이름·관측성이지 데이터 손실이 아니다.
- **변경**: `dispatchProcessingRequestById`로 개명, `DispatchProcessingResult`(`:23-28`)에 `{ status: "claim_lost" }` 추가, `:155`에서 반환. 호출자의 `!== "sent"` 체크(`features/upload/api/index.ts:199`)는 무변경.
- **순서**: **C-75 이후** — C-75가 `dispatchProcessingRequestByIdOrFail`과 `DispatchProcessingResult`를 `features/upload/api/dispatch-processing.ts`로 옮기므로 개명과 `claim_lost` variant는 거기서 적용한다.

#### C-47 — `upload()`의 위치 인자 넷을 옵션 객체로 · [예측]

- **위치**: `pages/dashboard/model/useUploadPodcast.ts:71-76, 260`; 유일 호출처 `UploadPodcast.tsx:110`; 같은 형태 `getSafeUploadMetadata:31-36`
- **근거**: 마지막 `reviewBeforeGenerate: boolean`이 dispatch 종류 `"analyze"` vs `"auto"`(`features/upload/api/index.ts:168-170`)를 고르는데 리터럴 호출 `upload(file, "English", 3, true)`에서는 추론 불가.
- **변경**: `upload(input: { file: File; language: string; clipCount: number; reviewBeforeGenerate: boolean })`; 호출처 `upload({ file, language, clipCount, reviewBeforeGenerate })`; `getSafeUploadMetadata`도 같은 형태.

#### C-48 — `getAnalyticsIds` → `getOrCreateAnalyticsIds` · [예측]

- **위치**: `shared/analytics/lib/anonymous-id.ts:15-29, 31-52`; barrel `shared/analytics/index.ts:6`; 유일 호출처 `track-event.ts:42`
- **근거**: 인자 없는 `get*`이 `localStorage`에 영구 추적 식별자를 생성·저장한다 — 읽기 동사 뒤의 프라이버시 관련 쓰기.
- **변경**: 정의·barrel·호출처 개명. 순수 읽기가 필요해지면 쓰지 않고 `null`을 반환하는 `peekAnalyticsIds()`를 별도 추가.

#### C-49 — `getUserPolarCustomerId`는 `string | null`을 반환해야 · [예측]

- **위치**: `entities/user/api/index.ts:33-40`(`?? ""`) vs 형제 `findUserIdByEmail:42-49`(`?? null`); `app/api/portal/route.ts:8-13`(로그인 안 됨을 세 번째 `""`로)
- **변경**: 본문을 `?? null`로. 포털 라우트에서 null을 명시적으로 처리(`/dashboard/billing`으로 redirect 또는 오류 응답), `""`를 Polar에 넘기지 않기.
- **순서**: C-02와 같은 파일 — 함께.

#### C-50 — Inngest 핸들러 결과 타입 하나로 선언 · [예측]

- **위치**: `src/inngest/functions.ts` — 반환 타입 선언 없이 16가지 즉석 객체 리터럴; `:858-865`는 `status: … : undefined`.
- **변경**:
  ```ts
  type ProcessingRunResult =
    | { outcome: "skipped"; reason: "not_queued" | "already_processing" | "attempt_no_longer_active" | "not_claimable" }
    | { outcome: "failed"; failureCode: UploadedFileFailureCode; error?: string }
    | { outcome: "completed"; status: "processed" | "review_pending"; draftCount?: number };
  ```
  두 핸들러에 반환 타입을 붙이고 `: undefined` 분기를 명시 variant로. 신뢰도 Medium, 기계적.

#### C-51 — `outlineWidth` 정수/소수 불변식 문서화 · [예측]

- **위치**: `shared/config/constants.ts:63`(기본값 `1.1`/`1.3`), `:90`(`outlineWidth: number | null`); `features/clip-review/model/schemas.ts:35-40`(`.int()`); `CaptionStyleEditor.tsx:206-240`(`Math.round` 우회)
- **변경(최소)**: 두 지점에 "언어 기본값은 표시 전용이며 직렬화되지 않는다"는 주석. `.int()` 제거 vs 브랜드 타입 선택은 백엔드 `resolve_caption_style`의 권위 범위 확인 후(§Needs human judgment 4) — 스키마를 맹목적으로 바꾸지 말 것.

#### C-52 — 분석 dedupe Set 상한 + 무의미한 exit 키 제거 · [TS·예측]

- **위치**: `shared/analytics/lib/track-event.ts:15, 34-40`; `AnalyticsTracker.tsx:54, 80`
- **근거**: 모듈 스코프 `Set`이 절대 비워지지 않음. `:80`의 키는 `Date.now()`를 포함해 내비게이션마다 영구 항목 추가(매칭 불가). `:54`의 키는 `dashboard_viewed`를 페이지 세션당 첫 방문에만 기록.
- **변경**:
  ```ts
  const MAX_DEDUPE_KEYS = 500;
  if (sentDedupeKeys.size >= MAX_DEDUPE_KEYS) sentDedupeKeys.clear();
  ```
  `AnalyticsTracker.tsx:80`의 `dedupeKey` 제거(`:65`의 로컬 `sent` 플래그가 effect당 1회를 이미 보장). `:15`에 페이지 세션 수명 주석. `dashboard_viewed` 과소 집계는 제품 질문(§Needs human judgment 5).
- **대안(PRD-23)**: 반환 타입 `"sent" | "deduped" | "unavailable" | "failed"`, 옵션 이름 `onceKey`.

#### C-53 — 모듈 스코프 `focusManager` 설치에 이름 부여 · [예측]

- **위치**: `app/providers.tsx:12-26` — import 시점의 bare 표현식이 앱 전체 쿼리의 focus-refetch 동작을 바꾼다(`use-live-uploaded-file-detail.ts:26-27`의 `"always"` 포함).
- **변경**: `installVisibilityFocusListener()`라는 이름 있는 함수로 감싸 한 번 호출 — 동작 동일, 자기 설명적. 대안: `Providers`의 `useEffect`로 이동(첫 focus 타이밍이 바뀜).

#### C-55 — 반복되는 업로드 분석 페이로드 추출 · [가독]

- **위치**: `UploadPodcast.tsx:84-89, 119-126, 135-142, 153-160` — `fileSizeMb: Math.round((file.size / 1024 / 1024) * 10) / 10` 네 번, 세 핸들러가 바뀐 옵션만 다른 15줄 동일 블록.
- **변경**:
  ```ts
  const toFileSizeMb = (file: File) => Math.round((file.size / 1024 / 1024) * 10) / 10;
  const trackOptionsChanged = (overrides: Partial<UploadOptions>) => {
    const file = files[0]; if (!file) return;
    void trackAnalyticsEvent("upload_options_changed", { fileType: file.type, fileSizeMb: toFileSizeMb(file), language, clipCount, reviewBeforeGenerate, ...overrides });
  };
  ```
  각 핸들러는 `setX(next); trackOptionsChanged({ x: next });` 두 줄. `useUploadPodcast.ts:31`의 `getSafeUploadMetadata` → `toUploadAnalyticsMetadata`로 개명하고 `toFileSizeMb` 사용.

#### C-56 — 거의 동일한 stale-reconcile 루프 셋 통합 · [가독]

- **위치**: `entities/uploaded-file/api/index.ts:1076-1152` — 같은 배열을 도는 23-28줄 루프 셋이 status·failure code·cancel 이벤트 여부만 다름. `:1128-1130`의 `hasProcessing` 가드는 `getStaleFailureCode:123-163`의 `hasProcessingUploadForQueuedState` 파라미터를 명령형으로 재구현하고 각 루프는 `false`를 넘겨 헬퍼의 queued 분기가 죽어 있다.
- **변경**:
  ```ts
  const STALE_RECONCILE_RULES = [
    { status: "processing",      failureCode: "worker_timeout",            cancelsWorker: true  },
    { status: "pending_enqueue", failureCode: "dispatch_timeout",          cancelsWorker: false },
    { status: "queued",          failureCode: "queued_worker_not_started", cancelsWorker: false },
  ] as const satisfies readonly { status: ActiveProcessingStatus; failureCode: UploadedFileFailureCode; cancelsWorker: boolean }[];
  ```
  루프 하나, `"queued"` 규칙은 `await hasProcessingUploadForUser(userId)`일 때 건너뛰고 같은 boolean을 `getStaleFailureCode`에 넘긴다.
- **순서**: **C-76 이후** — C-76이 이 세 루프를 `features/upload/api/reconcile-stale-processing.ts`로 그대로 옮긴다. 이동을 diff 가능한 verbatim move로 두기 위해 C-76을 먼저 하고 새 파일에서 이 통합을 적용한다.

#### C-57 — boolean 여섯 개에 `is`/`has`/`can`/`should` 접두사 · [가독]

- **위치·변경**: `ClipDraftCard.tsx:115` `styleOpen` → `isStyleDialogOpen`; `:121`·`AddCustomClipPanel.tsx:50` `withinLimits` → `isDurationWithinLimits`; `AddCustomClipPanel.tsx:36, 97` `open`/`setOpen` → `isPanelOpen`/`setIsPanelOpen`; `features/upload/ui/index.tsx:78` `anyPending` → `isAnyActionPending`; `AnalyticsTracker.tsx:65` `sent` → `hasSentExitEvent`; `UploadPodcast.tsx:255-257`:
  ```ts
  const hasClipCountCap = maxFeasibleClips >= 1;   // 0 = 길이 미상 또는 소스가 너무 짧음 (clip-count-budget.ts:16-18)
  const isOptionUnreachable = hasClipCountCap && option.value > maxFeasibleClips;
  <DropdownMenuItem disabled={isOptionUnreachable} …>
  ```

#### C-58 — 중첩 position 삼항을 record로 · [가독]

- **위치**: `CaptionStyleEditor.tsx:97-102` — `:21-28`의 `POSITION_LABELS`가 이미 매핑하는 3값 축을 삼항으로 다시 매핑, `"middle"`이 폴백에 암시됨.
- **변경**:
  ```ts
  const POSITION_JUSTIFY_CLASS: Record<(typeof CAPTION_STYLE_OPTIONS.POSITIONS)[number], string> = {
    top: "justify-start pt-6", middle: "justify-center", bottom: "justify-end pb-6",
  };
  const justifyClass = POSITION_JUSTIFY_CLASS[effectivePosition];
  ```

#### C-59 — `ClipDraftCard`에서 공유 클립 길이 술어 사용 · [가독]

- **위치**: `ClipDraftCard.tsx:120-123` — `shared/config/constants.ts:66`이 "30~90초 검증의 단일 지점"이라 자칭하고 `AddCustomClipPanel.tsx:50`과 서버 가드 둘이 따르는데, 여기만 `roundTenth`된 길이로 인라인 재유도 → 두 편집기가 0.05초 어긋남.
- **변경**: `const isDurationWithinLimits = isClipDurationWithinLimits(startSeconds, endSeconds);`(`:9`에 임포트 이미 있음). `duration`은 표시(`:308`)에만.

#### C-60 — 초 → 시계 포매터 하나로 · [가독]

- **위치**: `ClipDraftCard.tsx:69-74`("4:32.9"), `ScriptModal.tsx:38-45`("4:32", 컴포넌트 본문 안 선언), `UploadPodcast.tsx:52-57`("4:32")
- **변경**: `shared/lib/format-duration.ts`에 `formatSecondsAsClock(seconds: number, { decimals = 0 } = {}): string`. `ClipDraftCard:298`은 `{ decimals: 1 }`. `formatTimestamp`의 null 처리는 호출처 `ScriptModal:47-50`으로.

#### C-61 — 스크립트 클립보드 핸들러 중복 제거 · [가독]

- **위치**: `ClipCard.tsx:41-42, 59-70`와 `ScriptModal.tsx:22-23, 25-36` — 동일 파생·가드·토스트 문자열 셋, 둘 다 live.
- **변경**: `widgets/clip-display/model/use-script-clipboard.ts`(기존 `useMetadataClipboard` 옆)에 `useScriptClipboard(clip: Pick<Clip, "scriptText">)` → `{ scriptText, hasScript, copyScript }`. 두 컴포넌트가 호출, `ClipCard`는 `copyScript`를 `onCopyScript`로 내려보냄.

#### C-62 — 90일 분석 보존 기간에 이름 · [가독]

- **위치**: `entities/analytics-event/api/index.ts:20-22` — 매일 cron(`inngest/functions.ts:1056-1066`)이 영구 삭제하는 함수 안의 `90 * 24 * 60 * 60 * 1000`.
- **변경**: 모듈 스코프 `const ANALYTICS_EVENT_RETENTION_DAYS = 90;`. 선례: `entities/uploaded-file/model/stale-policy.ts:1-18`.

#### C-66 — 비디오 자동재생을 ref 콜백 밖으로 · [TS]

- **위치**: `widgets/uploaded-file-list/ui/_component/UploadedFileCard.tsx:66-77`(검증) — 인라인 화살표 ref는 렌더마다 detach/re-attach되어 `play()`를 재호출. 이 목록은 7.5초 큐 폴마다 리렌더.
- **변경**:
  ```tsx
  const videoRef = useRef<HTMLVideoElement>(null);
  useEffect(() => { if (!playUrl) return; void videoRef.current?.play().catch(() => undefined); }, [playUrl]);
  <video ref={videoRef} src={playUrl} controls playsInline preload="metadata" … />
  ```
  수동 확인: 업로드 하나가 `processing`일 때 카드 펼쳐 일시정지 후 15초(폴 두 번) 관찰.

#### C-67 — 타입 없는 `"use server"` 반환 둘 고정, throw하는 queryFn 설명 · [TS]

- **위치**: `features/upload/api/index.ts:299, 338`(이질 분기에서 추론되는 반환 — `useUploadPodcast.ts:133`이 `reconcileResult.data.uploaded`를 읽는 것은 두 성공 형태가 우연히 그 필드를 가져서); `:483, 495, 508`(queryFn이라 throw)
- **변경**: `:299`, `:338`에 `Promise<ActionResult<UploadLifecycleState>>` 명시. 세 queryFn export 위에 한 줄 주석:
  ```ts
  // TanStack queryFn 계약: 실패를 ActionResult가 아니라 throw로 알린다 (query.error로 이어져야 재시도·에러 경계가 동작한다).
  ```
- **순서**: C-28 개명과 함께.

#### C-68 — 잘못된 것을 단언하는 분석 테스트 둘 수정 · [TS]

- **위치**: `shared/analytics/event-catalog.test.mjs:9-15`(`length === 29` 하드코딩); `shared/analytics/lib/metadata.test.mjs:26-34`(키별 폐기라는 이름인데 전체 `undefined`만 단언 — `sanitizeAnalyticsMetadata`가 무조건 `undefined`를 반환해도 통과)
- **변경**:
  ```js
  - assert.equal(ANALYTICS_EVENT_NAMES.length, 29);
  + assert.ok(ANALYTICS_EVENT_NAMES.length > 0);
  ```
  ```js
  it("drops an allowed key whose value type is invalid, keeping the valid ones", () => {
    assert.deepEqual(sanitizeAnalyticsMetadata("cta_clicked", { location: "home_hero", cta: { label: "Create" } }), { location: "home_hero" });
  });
  ```

#### C-69 — 라우트 파일 16개에 `<JsonLd>` 컴포넌트 하나 · [TS]

- **위치**: `app/page.tsx:45-48` + `(public-marketing)` 15 라우트 — 모두 `dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}`. `JSON.stringify`는 `<`를 이스케이프하지 않아 `</script>`가 든 카피가 태그를 조기 종료(최고 노출 `guides/[slug]/page.tsx:95-103`, 자유 텍스트 가이드 본문 직렬화). 현재 콘텐츠는 1st-party 정적 설정이라 활성 XSS는 아님.
- **변경**:
  ```tsx
  // src/fsd/shared/ui/atoms/json-ld.tsx
  export function JsonLd({ data }: { data: unknown }) {
    return <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(data).replace(/</g, "\\u003c") }} />;
  }
  ```
  16곳을 `<JsonLd data={jsonLd} />`로.

#### C-70 — `ProcessingDispatchStatus`를 자기 쓰기에 연결 · [TS]

- **위치**: `entities/processing-dispatch/model/types.ts:1-9`(union 선언); 같은 슬라이스의 모든 쓰기는 bare 리터럴(`api/index.ts:49, 91, 111, 127`), 읽기도(`:57, 87`).
- **근거**: `"dead-letter"` 같은 오타가 컴파일을 통과하고 `findPendingProcessingDispatchById`가 회수할 수 없는 행을 만든다. 형제 슬라이스 `processing-status.ts`는 같은 패턴을 20곳 넘게 강제한다.
- **변경**:
  ```ts
  const DISPATCH_STATUS = { pending: "pending", sending: "sending", sent: "sent", deadLetter: "dead_letter" }
    as const satisfies Record<string, ProcessingDispatchStatus>;
  // status: DISPATCH_STATUS.pending / DISPATCH_STATUS.deadLetter …
  ```
  **C-05의 이 타입 삭제를 대체**(죽은 선언을 강제 불변식으로 바꾸는 쪽이 낫다). C-75(게이트 축소안)는 raw `db.processingDispatch` 헬퍼 둘을 엔티티에 남기므로 여섯 지점(`:49,57,87,91,111,127`)이 모두 엔티티 안에 남는다 — C-70과 C-75는 어느 순서든 충돌 없음.

#### C-71 — `window.confirm`을 기존 AlertDialog로 · [TS]

- **위치**: `features/billing/ui/SubscriptionStatus.tsx:39`, `features/upload/ui/index.tsx:45` — 가장 파괴적인 두 액션이 blocking `confirm()`. `widgets/clip-draft-review/ui/index.tsx:304-339`는 이미 `AlertDialog`를 쓰고 `shared/ui/atoms/alert-dialog.tsx`가 있다.
- **변경**: 그 패턴을 그대로 — `AlertDialog` > `AlertDialogTrigger asChild` > `AlertDialogContent`(`Title`/`Description`/`Footer`의 `Cancel`·`Action`). `upload/ui/index.tsx:38-60` `runAction`의 `confirmationMessage` 분기를 제거하고 확인을 `:157-164` JSX로 올린다. jsdom에서 테스트 불가능한 blocking 호출도 제거된다.

#### C-72 — `/privacy`·`/terms`가 마케팅 라우트 그룹 밖에 있음 · [응집] (2라운드, COH-10 (b))

- **위치**: `src/app/privacy/page.tsx:3, 8, 13-21, 419`; `src/app/terms/page.tsx:3, 8, 13-21` + 닫는 `<SiteFooter />`; 그룹 레이아웃 `src/app/(public-marketing)/layout.tsx:10-16`
- **근거(검증)**: 그룹에는 정확히 15개 `page.tsx`, `auth()`·dynamic API **0건**. 두 법률 페이지는 헤더 없이 자체 `max-w-3xl px-6 py-16` 래퍼 안에서 `&larr; AI Podcast Clipper` 백링크를 손으로 그리고(`:14-21`) 래퍼 **안**에서 `<SiteFooter />`를 닫는다. 라우트 그룹은 경로 세그먼트가 아니므로 이동해도 URL 불변.
- **변경**: `src/app/privacy/` → `src/app/(public-marketing)/privacy/`, `src/app/terms/` → `src/app/(public-marketing)/terms/`. 각 파일에서 `SiteFooter` 임포트(`:3`), 꼬리의 `<SiteFooter />`, 백링크 `<header>`(`:14-21`) 삭제. `max-w-3xl` 래퍼는 레이아웃 `<main>` 안의 내부 `div`로 유지하되 `px-6`은 제거(레이아웃이 이미 적용). `auth()`를 추가하지 않으므로 두 라우트는 static 유지.
- **검증된 부수 사항**: `alternates.canonical`을 `"/privacy"` → `absoluteSiteUrl("/privacy")`로 바꾸는 것은 **동작 차이 0**(`app/layout.tsx:14`의 `metadataBase: new URL(SITE_URL)`과 `shared/lib/site.ts:14-16`이 같은 `SITE_URL`로 해석). 15개 형제(`pricing/page.tsx:11` 등)와의 일관성만을 위해 적용.
- **순서**: **C-73보다 먼저**. C-38이 `src/app/terms/page.tsx:40-41`을 편집하므로 C-38을 먼저 하거나 새 경로로 재조준.
- **검증**: `npm run build -w apps/web` 라우트 목록에서 `/privacy`, `/terms`가 static(`○`)으로 남는지.

#### C-74 — 에러 경계 다섯이 같은 보고 effect를 손으로 씀 · [응집] (2라운드, COH-18)

- **위치**: `src/app/error.tsx:13-15`; `src/app/dashboard/error.tsx:13-15`; `src/app/dashboard/billing/error.tsx:13-15`; `src/app/dashboard/uploads/[uploadedFileId]/error.tsx:13-15`; `src/app/global-error.tsx:12-14`; 보조 `shared/observability/report-error.ts:1`, `shared/observability/index.ts:1-8`
- **근거(검증)**: 다섯 파일 모두 `"use client"`이며 문자열만 다른 동일 `useEffect(() => { console.error("<X> error boundary caught:", error); }, [error]);`. 어느 것도 `reportError`를 호출하지 않고 할 수도 없다 — `report-error.ts:1`이 `import "server-only"`. 클라이언트 Sentry 초기화는 없다(`src/sentry.server.config.ts`가 유일한 `Sentry.init`, `instrumentation.ts:4-6`이 `NEXT_RUNTIME === "nodejs"`로 게이트).
- **영향**: 경계 오류 기록 방식(로그 포맷조차) 변경이 다섯 디렉터리 다섯 파일 편집. 별도로, 클라이언트 렌더 오류는 오늘 Sentry에 보이지 않는다.
- **변경**: `src/fsd/shared/observability/use-report-boundary-error.ts`(`"use client"`, `server-only` **없음**)에
  ```ts
  export function useReportBoundaryError(error: Error & { digest?: string }, origin: string) {
    useEffect(() => { console.error(`${origin} error boundary caught:`, error); }, [error, origin]);
  }
  ```
  다섯 경계의 effect를 이 훅 호출로 교체하고 `useEffect` 임포트 제거. 기존 대문자 라벨(`"Root"`, `"Dashboard"`, `"Billing"`, `"Upload detail"`, `"Global"`)을 그대로 넘겨 로그 문자열을 바이트 동일하게 유지. `global-error.tsx`는 인라인 스타일을 유지한 채 훅만 사용.
- **게이트 정정**: 이 훅을 `shared/observability/index.ts`에서 export하지 **않는다** — 그 barrel은 `server-only`인 `./report-error`만 재수출하므로 `"use client"` `error.tsx`가 barrel을 임포트하면 빌드가 깨진다(C-07과 같은 실패 양상). `~/fsd/shared/observability/use-report-boundary-error` 파일 경로로 임포트. 대안: `shared/lib/`에 두어 `shared/observability/`를 구조적으로 서버 전용으로 유지.
- **후속(선행 조건 있음, 같이 넣지 말 것)**: 훅에 `Sentry.captureException`을 넣으려면 먼저 클라이언트 Sentry 초기화가 있어야 한다. (i) 클라이언트 init 추가 후 브라우저 이벤트가 Sentry에 도달함을 확인 → (ii) `report-error.ts:89-94`의 scope/tag 형태를 본떠 `origin` 태그와 함께 `captureException` 추가. `@sentry/nextjs` 10.68.0의 클라이언트 진입점(`instrumentation-client.ts` vs `sentry.client.config.ts`)과 `next.config.js:115-121` `withSentryConfig` 옵션은 버전 의존이며 이 검토에서 미검증(§Needs human judgment 7).
- **순서**: 독립. `shared/observability`가 나중에 C-07 방식으로 분할되면 훅을 클라이언트 안전 절반으로 옮기고 경로 임포트를 barrel로.

#### C-76 — stale-processing reconcile 정책이 엔티티에 있어 이벤트 전송을 끌어들임 · [결합] (2라운드, CPL-3)

- **위치**: `entities/uploaded-file/api/index.ts:4`(`import { inngest }`), `:165-185`(`sendProcessingCancelEventBestEffort`), `:959-1043`(`reconcileStaleUploadedFileForUser`), `:1045-1155`(`reconcileStaleUploadedFilesForUser`), private 헬퍼 `:111-113, 115-121, 123-163`; barrel `entities/uploaded-file/index.ts:24-25`; 호출자 `features/upload/api/index.ts:27-28, 343, 490, 503, 514, 593`, `app/dashboard/page.tsx:7, 20`
- **근거(검증)**: `:4`가 `~/inngest/client`를 임포트해 `:170`에서만 사용. worker-timeout 분기의 발신은 현재 **무조건**(`:1023-1028`, `:1095-1101`). 두 reconciler는 `PROCESSING_STALE_POLICY`를 읽고 실패 코드를 정하고 행을 failed로 표시하고 cancel 이벤트를 보낸다 — 엔티티 쿼리가 아니다.
- **영향**: 최하위 도메인 레이어가 `inngest/client.ts:46-109`의 이벤트 union에 컴파일 의존하고 `inngest/functions.ts:3-24`가 다시 그 레이어를 임포트해, "이벤트 계약을 바꾸면 누가 깨지나"를 양방향으로 걸어야 한다. 도달 범위는 **서버 전용**(가장 깊은 경로 `app/dashboard/page.tsx:9` → barrel → `api/index.ts:4`, RSC 렌더)이라 클라이언트 번들 비용·라이브 결함은 없다.
- **변경**: `src/fsd/features/upload/api/reconcile-stale-processing.ts` — 1행 `import "server-only";`, `"use server"` **없음**(C-75와 같은 제약). 모든 분기를 보존하며 그대로 이동: `sendProcessingCancelEventBestEffort`(`:165-185`)와 `:4`의 `import { inngest }`, 두 reconciler(`:959-1043`, `:1045-1155`), private 헬퍼 `isOlderThan`(`:111-113`), `isActiveProcessingStatusValue`(`:115-121`, C-12 적용 시 공개 술어로 대체), `getStaleFailureCode`(`:123-163`). 엔티티에 남기고 하향 임포트: `PROCESSING_STALE_POLICY`, `ACTIVE_PROCESSING_STATUSES`/`toProcessingStatus`, `markUploadedFileAttemptFailed`(`:832-863`), `hasProcessingUploadForUser`(`:945-957`, `:998`·`:1128`에서 사용), `StaleProcessingCandidate` 타입(`:39-48`, export로). reconciler의 raw Prisma 읽기 셋은 엔티티 finder로 대체해 규칙 1을 지킨다:
  - `findStaleProcessingCandidate(uploadedFileId, userId)` ← `:969-981`의 `findFirst`
  - `findUploadedFileFailureState(uploadedFileId, userId)` ← `:1030-1036`의 `findFirstOrThrow`
  - `listActiveProcessingCandidatesByUserId(userId, limit)` ← `:1051-1072`의 `findMany`

  `features/upload/api/index.ts:27-28`을 `"./reconcile-stale-processing"`로, `app/dashboard/page.tsx:7`을 `~/fsd/features/upload/api/reconcile-stale-processing`으로; 다섯 호출처(`:343, 490, 503, 514, 593`)와 `page.tsx:20`은 불변. barrel `entities/uploaded-file/index.ts:24-25` 제거. `reconcileUploadDraftsForUser`(`:1157-1283`, `page.tsx:21`)는 이벤트를 내지 않고 한 테이블만 만지므로 **엔티티에 남긴다**.
- **철회(게이트 동의)**: 1라운드의 DI 형태. 선택적 `onWorkerTimeout`은 무조건 cancel을 opt-in으로 바꿔, 빠뜨린 호출처가 폭주하는 Inngest 함수를 `stuckAlertMs`(90분, `model/stale-policy.ts:17`)까지 방치한다. 필수 파라미터는 조용한 누락은 막지만 여섯 호출처에 배선만 퍼뜨린다. 이동은 시그니처 변경이 전혀 없어 엄격히 낫다.
- **잔여(수용)**: `~/inngest/client`는 `~/server/db`와 같은 종류의 인프라로 남는다. C-75+C-76 이후 임포터는 `inngest/functions.ts`, `app/api/inngest/route.ts:2`, `app/api/webhooks/modal/route.ts:7-8`, 그리고 `features/upload/api/*` 어댑터 둘.
- **심각도**: 렌즈의 Should → Consider. 서버 전용 도달·런타임 결함 없음·실패는 모두 컴파일 오류(이벤트 개명 시 빌드가 시끄럽게 깨짐). 같은 계열의 C-40과 동급.
- **너무 크다고 판단되면**: **철회**하고 엔티티→전송 엣지를 알려진 편차로 기록. DI 형태로 대체하지 말 것.
- **순서**: **C-56보다 먼저**(C-56의 루프 셋이 이동 대상 함수 안). C-29의 non-fatal 처리를 이동 본문의 `throw new Error("Uploaded file not found")` 편집이 아니라 **호출자 측 가드**(`features/upload/api/index.ts:483-493`)로 구현하면 C-29·C-28과 독립. C-75와 같은 두 파일을 건드리므로 연달아.
- **검증**: 이동한 두 본문을 diff해 `:1023`·`:1095-1101`의 가드가 바이트 동일하고 시그니처에 새 옵션 파라미터가 **없음**을 확인; `grep -rn '~/inngest' apps/web/src/fsd/entities` → 0건; `grep -n '"use server"' apps/web/src/fsd/features/upload/api/*.ts` → `index.ts:1`만; `npm run typecheck && npm test && npm run build -w apps/web`.

#### C-77 — 유일한 슬라이스 간 테스트 임포트가 별칭을 우회하고 typecheck에 보이지 않음 · [결합] (2라운드, CPL-17)

- **위치**: `src/fsd/widgets/clip-draft-review/model/caption-presets.test.mjs:4, 5-8`; `apps/web/tsconfig.json:33-40`
- **근거(검증)**: `tsconfig.json` `include`에 `**/*.mjs`가 없어 열 개 `*.test.mjs`는 타입체크 대상이 아니다. `caption-presets.test.mjs:4`는 세 단계 위로 `.ts` 확장자를 박아 임포트(`"../../../features/clip-review/model/schemas.ts"`), `:5-8`도 `shared/config/constants.ts`를 같은 방식으로. 대상 파일을 옮기면 컴파일 신호 없이 위젯 테스트가 깨지고 오류 메시지는 위젯을 가리킨다 — `CLAUDE.md:77`이 이 테스트가 지키는 바인딩이라고 적은 바로 그 경우. **실행 검증 1**: `tsx --test`는 `.mjs` 임포터에서 `~/*` 별칭을 해석한다(프로브 `ALIAS_OK`).
- **변경(확정안)**: 슬라이스 간 임포트 두 줄만 별칭으로 — **barrel이 아니라 모듈**을 가리킨다:
  ```js
  // :4
  import { captionStyleSchema } from "~/fsd/features/clip-review/model/schemas";
  // :5-8
  import { CAPTION_STYLE_OPTIONS, /* … */ } from "~/fsd/shared/config/constants";
  ```
  `:9`(`"./caption-presets.ts"`)는 같은 디렉터리라 그대로. `npm test -w apps/web`(67/67)로 확인.
- **게이트 정정**: `~/fsd/features/clip-review` barrel로 돌리지 **않는다** — `features/clip-review/index.ts:1-5`가 `./api`를 재수출하고 그 파일은 1행 `"use server"`에 `~/server/db`, `~/fsd/shared/api/s3`, `~/fsd/shared/api/auth-guard`(→ `~/server/auth`)를 임포트한다. `tsx --test`에는 번들러가 없어 순수 스키마 단위 테스트가 Prisma를 인스턴스화하고 `~/env` 검증을 돌리게 된다. "공개 API 우회"라는 관찰은 맞지만 처방은 `features/clip-review`에 C-07 방식의 서버/클라이언트 barrel 분할이지 Node 테스트의 barrel 임포트가 아니다.
- **기각된 부분 권고**: `apps/web/tsconfig.json` `include`에 `"**/*.mjs"` 추가. **실행 검증 2**: 열 파일에서 15 오류 — TS5097 12건(`.ts` 확장자 임포트), TS7006 3건(`stuck-alert.test.mjs(8,30)`, `caption-presets.test.mjs(12,23)`, `selection-budget.test.mjs(9,16)`의 implicit any). main config에서 통과시키는 유일한 방법은 앱 전체 `"allowImportingTsExtensions": true`인데, 이는 테스트를 위해 프로덕션 컴파일 가드레일을 푸는 것이다(Next는 SWC로 컴파일하며 `.ts` 지정자를 받지 않는다).
- **선택 동반(테스트 타입체크가 필요할 때만, 별도)**: `apps/web/tsconfig.test.json`이 base를 `extends`하고 `"include": ["src/**/*.mjs"]`, `"allowImportingTsExtensions": true`(`noEmit`이 이미 true라 합법), `"typecheck:test": "tsc --noEmit -p tsconfig.test.json"` 스크립트, TS7006 세 지점에 JSDoc `@param`. 완화를 테스트로 한정(§Needs human judgment 8).
- **순서**: 독립. C-44의 `S3_CONFIG` 이동과는 `shared/config/constants.ts` export를 같이 건드리는 만큼만 조율.

## Affected Files

파일이 많아 영역 단위로 묶는다. 항목별 상세 목록은 §Proposal의 각 `C-NN`에 있다.

| 경로 또는 영역 | 작업 | 판단 근거 | 리스크 |
| --- | --- | --- | --- |
| `src/app/api/portal/route.ts`, `src/app/api/checkout/route.ts`, `src/fsd/shared/api/polar.ts`, `src/fsd/features/billing/config/index.ts` | update | Polar 서버 선택 단일화(C-02, C-03), 포털 sandbox 고정 해제 | **medium** — 결제 경로. 프로덕션 실물 확인 필요(`release-checks` 등재) |
| `src/app/dashboard/page.tsx` | update | `"use server"` 1행 삭제(C-01); `initialActiveQueue` 공급(C-45) | low — 서버 컴포넌트 기본값과 동일 |
| `src/fsd/entities/uploaded-file/{index.ts, server.ts(신규), api/index.ts, model/*}` | update/create/delete | barrel 런타임 분할(C-07), 죽은 export 삭제(C-05), `optimistic-id.ts`·`failure-code.ts` 신규(C-04, C-33), 쿼리 키 추가(C-14, C-42), `findFirst` 전환(C-29), 술어 narrowing(C-12) | **medium** — 임포트 경로 27곳 변경. `server-only`는 빌드에서만 검출 |
| `src/fsd/entities/{clip, clip-draft}/index.ts` (+ `server.ts` 신규) | update/create | 동일 barrel 분할(C-07) | low |
| `src/fsd/entities/processing-dispatch/{api,model,index}` | update | 상태 리터럴 → `DISPATCH_STATUS`(C-70), barrel 정리(C-05), `dispatchProcessingRequestByIdOrFail` 이동(C-75) 후 개명·`claim_lost`(C-46) | medium — C-75 → C-46 순서 |
| `src/fsd/entities/user/api/index.ts` | update | `resolvePolarCustomerUserId` 추가(C-24), `getUserPolarCustomerId` null 반환(C-49) | low |
| `src/fsd/features/upload/{api/index.ts, index.ts, model/*}` | update/create | 개명(C-28), null 처리(C-29), mutation 훅 신규(C-19), barrel 완성(C-08), 반환 타입(C-67), 죽은 스키마 삭제(C-05), server-only 형제 모듈 3개 신규(C-75, C-76) | **medium** — 603줄 액션 파일. `"use server"` 파일에는 액션만 두고 새 모듈은 `import "server-only"` |
| `src/fsd/features/clip/{index.ts(신규), model/}` | create/delete | `schemas.ts` 삭제(C-05), `use-delete-clip.ts` 신규(C-18), 공개 API(C-08) | low |
| `src/fsd/features/clip-review/{api,index}` | update | barrel 잉여 export 제거(C-05), 엔티티 finder 사용(C-40) | low |
| `src/fsd/features/billing/{api,ui,config}` | update | 오류 보고(C-64), `PlanCard` 가드 삭제(C-03), BillingPage 상수·이름(C-26), AlertDialog(C-71) | low |
| `src/fsd/features/handle-*/api/index.ts` | update | `ActionResult` 통일(C-23), `resolveUserId` 제거(C-24) | low — 소비자는 `polar/route.ts` 네 곳뿐 |
| `src/app/api/webhooks/{modal,polar}/route.ts` | update | 입력 검증(C-30, C-31), wire 타입 공유(C-09), 결과 체크 갱신(C-23) | medium — 외부 ingress. 웹훅 재전송으로 검증 |
| `src/inngest/{client.ts, functions.ts, modal-contract.ts(신규)}` | update/create | wire 계약 단일화(C-09), `applyModalPayload` 정리(C-13), 결과 타입(C-50), `failureCode` union(C-33) | medium — 워커 경로. 테스트 없음 → 수동 처리 1회 |
| `src/fsd/widgets/clip-display/**` | update | `allowDelete` 제거(C-16), 빈 상태 가드(C-17), delete 훅 사용(C-18), `hasMetadata`(C-63), `parseJsonArray` 가드(C-32), 스크립트 클립보드 훅(C-61), `clipTypeLabel` 재수출(C-22) | low |
| `src/fsd/widgets/clip-draft-review/**` | update | 쿼리 키·throw(C-14, C-15), `mutate` 전환(C-27), boolean 이름(C-57), position record(C-58), 길이 술어(C-59), 포매터(C-60), `outlineWidth` 주석(C-51) | low |
| `src/fsd/widgets/uploaded-file-list/**` | update | shim 삭제(C-06), 자동재생 effect(C-66), `usePlayUrl` 상태(C-10) | low |
| `src/fsd/pages/dashboard/**` | update | 낙관적 id 헬퍼(C-04), 정리 플래그 union(C-54), 옵션 객체(C-47), 분석 페이로드 추출(C-55), 초기 큐 prop(C-45), shim 삭제(C-06), mutation 훅 사용(C-19) | low |
| `src/fsd/pages/upload-detail/**` | update | `getFailureLabel` 이동(C-33), `outcome` switch(C-34), Suspense 삭제(C-41), `usePlayUrl` 상태(C-10), shim 삭제(C-06) | low |
| `src/fsd/pages/{resources → about,contact,security,how-it-works,changelog}` | move/delete | 슬라이스 분할(C-36) | low — 순수 이동 |
| `src/fsd/pages/home/ui/index.tsx`, `src/app/page.tsx`, `src/fsd/widgets/site-header/**` | update/delete | 헤더 위젯 병합(C-73: `site-header/ui/index.tsx` 삭제, `_component/HeaderAuthMenu.tsx` 신규) → 헤더 slot(C-43) | low — `/`의 로그인 헤더 유지 여부는 §판단 5 |
| `src/app/{privacy,terms}` → `src/app/(public-marketing)/{privacy,terms}` | move | 라우트 그룹 이동(C-72) — URL 불변 | low — 빌드 static/dynamic 목록 비교 |
| `src/fsd/shared/analytics/**`, `src/app/api/analytics/events/route.ts` | update | `satisfies` 바인딩(C-20), `/admin` 가드·중복 분기(C-21), dedupe 상한(C-52), `getOrCreateAnalyticsIds`(C-48), 테스트 수정(C-68) | low |
| `src/fsd/shared/{api/s3.ts, api/auth-guard.ts}` | update | `import "server-only"`(C-44) | low — 빌드로 검출 |
| `src/fsd/shared/lib/{utils.ts, use-play-url.ts, format-duration.ts(신규)}` | update/create | `parseJsonArray` 시그니처(C-32), `PlayUrlState`(C-10), 포매터(C-60) | low |
| `src/fsd/shared/ui/{error-display/*, atoms/json-ld.tsx(신규)}` | update/create | prop 형태(C-11), `<JsonLd>`(C-69) | low |
| `src/fsd/shared/observability/**` | update/create | 죽은 export 삭제(C-05, §판단 1), `use-report-boundary-error.ts`(C-74, barrel에 넣지 않음) | low |
| `src/app/{error,global-error}.tsx`, `src/app/dashboard/**/error.tsx` | update | `ErrorDisplay` 새 props(C-11), 공유 훅(C-74) | low |
| `src/middleware.ts`, `src/server/auth/config.edge.ts`, `src/middleware.test.mjs(신규)` | update/create | 라우트 목록 export + 주석 + 테스트(C-39) | low — matcher 리터럴 불변 |
| `src/app/sitemap.ts`, `src/fsd/widgets/site-footer/**`, `src/fsd/widgets/site-header/config/public-nav.ts`, `src/fsd/shared/config/public-routes.ts(신규)` | update/create | 공개 라우트 목록 단일화(C-37) | low |
| `src/app/terms/page.tsx`, `src/fsd/pages/youtube-shorts-generator/config/index.ts` (+ 마케팅 config 약 10파일 주석) | update | 사실 오류 문구 정정(C-38) | low — 문구 |
| `src/app/providers.tsx` | update | `installVisibilityFocusListener()`(C-53) | low |
| `apps/web/package.json` | update | `shadcn-dropzone` → `react-dropzone`(C-65) | low — `npm install` 후 빌드 |
| `caption-presets.test.mjs` (선택: `tsconfig.test.json` 신규) | update | 별칭 임포트로 재작성(C-77); main `tsconfig.json`은 건드리지 않음 | low |
| `src/fsd/entities/analytics-event/api/index.ts` | update | 보존 기간 상수(C-62) | low |
| `apps/web/CLAUDE.md`, `docs/conventions/*` | update | 테스트 수 갱신(현재 67), `ANALYTICS_METADATA_KEYS_BY_EVENT` 캐스트 문구 삭제(C-20 이후), 새 `server.ts` barrel 관례 기록 | low |

## Safety Analysis

이 제안은 검토 전용 파이프라인의 산출물이며 코드는 아직 바꾸지 않았다. 아래는 각 항목이 실행될 때 오탐이 생길 수 있는 경계와, 검토 단계에서 이미 확인한 내용이다.

확인한 항목:

- [x] **앱 진입점과 라우팅 경계** — `src/app/dashboard/page.tsx`의 `"use server"`는 유일한 라우트 사용처이며 default export만 있음(C-01). `privacy`/`terms` 라우트 그룹 이동은 URL을 바꾸지 않음(라우트 그룹은 경로 세그먼트가 아님). 미들웨어 matcher는 리터럴로 유지(C-39, Next 정적 추출 확인).
- [x] **정적 `import` / `export from`** — 죽은 export 12개는 `apps/web/src`·`packages/` 전체 grep(.ts/.tsx/.mjs)에서 정의+barrel만 존재함을 확인(C-05). `addCustomClipDraftSchema`/`updateClipDraftSchema`/`markProcessingDispatch*`는 내부 사용이 있어 barrel 줄만 제거.
- [x] **dynamic `import()` 또는 lazy loading** — 대상 심볼에 대한 동적 임포트 없음(`next.config.js`의 `await import("./src/env.js")`는 무관).
- [x] **barrel export 경유 참조** — barrel 분할(C-07)은 서버 임포터 5곳·클라이언트 22곳을 모두 열거했고, `features/upload/index.ts`는 클라이언트(`pages/upload-detail/ui/index.tsx:10`)가 임포트하므로 `server-only` 모듈을 넣지 않는다(C-75, C-76). `shared/observability/index.ts`도 `server-only`를 재수출하므로 클라이언트 훅(C-74)은 파일 경로로 임포트한다. `features/clip-review/index.ts`는 `"use server"` api를 재수출하므로 Node 테스트가 그 barrel을 임포트하면 Prisma·env 검증까지 딸려온다(C-77).
- [x] **테스트와 스크립트 참조** — `caption-presets.test.mjs:4`는 `features/clip-review/model/schemas.ts`를 상대 경로+`.ts` 확장자로 임포트(C-05의 `captionStyleSchema`는 유지). `clip-rationale.test.mjs:4`는 `clipTypeLabel` 재수출로 무변경(C-22). `tsx --test`가 `~/*` 별칭을 해석함을 프로브로 확인(C-77).
- [x] **정적 자산 URL / `public` 접근** — 해당 없음.
- [x] **타입 선언, 전역 선언, ambient module** — `ProcessingDispatchStatus`는 삭제 대신 연결(C-70). `PlayUrlState`·`ErrorDisplayProps` 변경은 소비자 4·5곳으로 닫혀 있음. `.mjs`를 tsconfig `include`에 넣으면 TS5097 12건·TS7006 3건이 발생하므로 `allowImportingTsExtensions` 또는 별도 `tsconfig.test.json`이 필요(외부 config로 사전 확인).
- [x] **런타임 side effect 또는 초기화 코드** — `focusManager` 설치는 이름만 붙이고 동작 유지(C-53). `reconcile*` 액션은 개명만 하고 폴링 경로의 쓰기는 유지(C-28). C-76은 cancel 이벤트 발신을 무조건으로 유지(옵션 파라미터 금지, 시그니처 불변).
- [x] **API, localStorage/sessionStorage, analytics, 외부 SDK 영향** — Polar: 포털 `server` 값이 바뀌므로 프로덕션에서 포털 링크 실물 확인 필요. `getOrCreateAnalyticsIds` 개명은 저장 키를 바꾸지 않음. 분석 dedupe 상한(C-52)은 500개 초과 시 재전송 가능성 있음(허용 범위). 웹훅 입력 검증(C-30, C-31)은 유효한 페이로드 동작을 바꾸지 않고 잘못된 페이로드만 400/무시로 바꿈.

## Approval

승인 메모:

- 승인 전.
- 승인 시 범위를 정해 주면 좋은 축: (1) Phase 0(운영 결함)만, (2) Phase 0~2(경계·죽은 코드까지), (3) 전체. 각 Phase는 독립 커밋·독립 PR로 닫을 수 있게 §Execution Plan을 짰다.
- §Needs human judgment의 5개 결정은 승인과 별개로 답을 주면 해당 항목의 변경 방향이 확정된다.

## Execution Plan

게이트가 정리한 의존 제약(§Appendix B)을 만족하는 순서다. Phase는 독립 커밋·독립 PR 단위이며, **각 Phase 끝에 §Verification Plan의 공통 검증 4종을 돌린다**. 한 Phase 안에서 `→`는 순서 강제, `·`는 순서 무관(같은 파일이면 연달아).

1. **Phase 0 — 운영 결함·한 줄 수정 (즉시, 항목별 독립 커밋 가능)**
   C-02 · C-49(같은 파일) → C-03 · C-01 · C-63 · C-64 · C-65(`npm install`) · C-32 · C-25 · C-30 · C-31 · C-29(호출자 측 가드 + `findFirst`) · C-16 · C-17(같은 세 파일).
   포함 근거: 실제 결함(C-02, C-29, C-63, C-17)과 신뢰 경계(C-30, C-31, C-32)를 먼저 닫는다. 모두 파일 이동 없음.

2. **Phase 1 — 죽은 코드·계약 정리 (저위험, typecheck로 검출)**
   C-05(§판단 1 결정 반영; `ProcessingDispatchStatus`는 제외; `uploadedFileKeys.list`는 여기서 삭제) · C-70 · C-21 · C-41 · C-12 · C-13 · C-23 → C-24 · C-62 · C-68 · C-77 · C-20 · C-04.
   C-05는 심볼 하나 삭제 → `npm run typecheck` 반복. C-12를 여기서 하면 C-76의 이동 대상(`isActiveProcessingStatusValue`)이 하나 준다.

3. **Phase 2 — 경계·소유권 (빌드 게이트: `npm run build`가 `server-only`·`"use server"` 규칙을 검출)**
   C-07 → C-06 → C-22 → C-44 → C-75 → C-76 → C-46 → C-56 → C-42 → C-19 → C-18 → C-08 → C-14 · C-15 → C-28 · C-67 → C-09.
   - C-07 이후 클라이언트가 `~/fsd/entities/uploaded-file` barrel을 임포트할 수 있으므로 C-06·C-22·C-14가 파일 경로 우회 없이 적용된다.
   - C-75·C-76은 `entities/uploaded-file/index.ts`와 `features/upload/api/index.ts` 임포트 블록을 같이 건드린다 — 연달아 한 PR.
   - C-46(개명·`claim_lost`)은 C-75가 만든 `dispatch-processing.ts`에서, C-56(루프 통합)은 C-76이 만든 `reconcile-stale-processing.ts`에서 적용.
   - C-08은 C-19·C-18이 만든 훅까지 barrel에 싣되 C-75·C-76의 server-only 모듈은 싣지 않는다.
   - C-09는 Phase 0에서 `route.ts`에 넣은 C-30의 가드를 `modal-contract.ts`로 함께 옮긴다.
   - Inngest 워커 경로는 자동 테스트가 없으므로 이 Phase 끝에 업로드 1건을 실제 처리해 확인(§Verification Plan 수동 표).

4. **Phase 3 — 예측가능성·타입 형태**
   C-11 · C-27 · C-33 → C-34 · C-10(union; C-44가 끝났으므로 CPL-4 대안도 선택 가능) · C-47 · C-48 · C-50 · C-52 · C-53 · C-54 · C-66 · C-71 · C-26 · C-39(+`middleware.test.mjs`) · C-45 · C-40 · C-35 · C-51(주석만) · C-69.
   C-10·C-11·C-33의 소비자 갱신은 각각 4·5·2곳으로 닫혀 있어 항목별 커밋 가능.

5. **Phase 4 — 가독성·마케팅 구조 (동작 변화 없음, 리뷰 부담 큼 → 별도 PR)**
   C-55 · C-57 · C-58 · C-59 · C-60 · C-61 · C-38 → C-72 → C-73(§판단 5·6·9 결정 후) → C-43 → C-37 · C-36 · C-74.
   빌드 출력의 static/dynamic 라우트 표기를 Phase 시작 전과 비교한다(C-72·C-73).

6. **Phase 5 — 문서 정합**
   `apps/web/CLAUDE.md`: 테스트 수(현재 67 → 변경 후 실측), 서버 액션·barrel(`index.ts`/`server.ts`) 관례, `ANALYTICS_METADATA_KEYS_BY_EVENT` 캐스트 서술 삭제(C-20 이후). `docs/conventions/fsd-architecture-guidelines.md`에 "엔티티 barrel은 클라이언트 안전 `index.ts`와 서버 전용 `server.ts`로 나눈다"를 추가. 이 문서를 `completed/`로 이동.

승인 범위를 좁힐 때의 권장 절단선: **Phase 0만** (운영 결함, 약 12항목, 반나절) → **Phase 0~2** (구조 정합까지) → **전체**.

## Verification Plan

실행할 검증(모든 Phase 공통, Phase 종료마다):

```bash
npm run typecheck -w apps/web
npm run lint -w apps/web
npm test -w apps/web
npm run build -w apps/web      # server-only 위반과 "use server" export 규칙은 빌드만 검출
```

항목별 추가 확인:

```bash
# C-05 / C-07 / CPL-2 / CPL-3 — 엔티티 레이어 청결
grep -rn 'from "~/fsd/entities/' apps/web/src/fsd/entities      # 0건이어야 함 (CPL-2 이후)
grep -rn '~/inngest' apps/web/src/fsd/entities                    # 0건이어야 함 (CPL-3 이후)
grep -n '"use server"' apps/web/src/fsd/features/upload/api/*.ts  # index.ts:1 만 매치

# C-05 — 죽은 export가 정말 사라졌는지
grep -rn "updateUploadedFileLanguage\|setUploadedFileUploaded\|updateUploadedFileStatus\|findUploadedFileForProcessRequest\|markUploadedFileQueuedFromDispatch\|recoverableDraftActionSchema\|processVideoSchema" apps/web/src   # 0건

# C-65 — 의존성
npm ls react-dropzone -w apps/web    # 직접 의존으로 잡혀야 함

# C-20 — satisfies 가 계약을 강제하는지 (의도적으로 키 하나를 지워 typecheck 실패를 확인한 뒤 되돌린다)
```

수동 확인(테스트가 못 덮는 범위 — `docs/release-checks.md` 등재 대상):

| 항목 | 확인 |
| --- | --- |
| C-02 | 프로덕션 `/dashboard/billing` → "Manage Subscription" 이 `polar.sh` 프로덕션 포털을 여는지(sandbox 아님) |
| C-29 | `/dashboard/uploads/<존재하지 않는 id>` 가 404(not-found) 화면인지 |
| C-63 | `youtubeTitle=""`인 클립에서 "YouTube Metadata" 메뉴가 활성인지(DB에서 값 비워 확인) |
| C-17 | 마지막 클립 삭제 직후 "No clips found"가 즉시 보이는지 |
| C-10 (CPL-4 대안 채택 시) | `review_pending` 상세 페이지에서 `getOriginalPlayUrl` POST가 1회인지 |
| C-30 | Modal 웹훅에 잘못된 JSON POST → 400 |
| C-66 | 업로드 처리 중 카드 비디오 일시정지 후 15초 동안 재생이 재개되지 않는지 |
| C-72 / C-73 | `/privacy`, `/terms`가 헤더·푸터와 함께 렌더되고, 빌드 출력에서 `(public-marketing)` 15 라우트와 두 법률 페이지의 static(`○`) 표기가 이동 전과 같은지 |
| C-75 / C-76 | 업로드 1건 실제 처리: `processVideo` 완료 → 크레딧 차감 → stale reconcile 동작(수동 타임아웃 유도) |
| C-39 | `npm test`에 `middleware.test.mjs`가 포함되어 통과하는지 |

검증 기준:

- 기준선(typecheck 통과, lint 0, test 67/67)이 Phase 종료마다 유지되고 `npm run build`가 통과한다.
- 기존 실패는 없다. Phase 실행 중 새 실패가 나면 해당 Phase의 항목에서만 원인을 찾는다(각 Phase는 독립 커밋).
- `npm test`의 테스트 수는 C-39(+1 파일), C-22(테스트 파일 이동), C-68(단언 변경)으로 바뀐다 — 변경 후 수를 `CLAUDE.md`에 반영.

## Verification Results

| 명령 | 결과 | 비고 |
| --- | --- | --- |
| `npm run typecheck -w apps/web` (기준선, HEAD `98ba430`) | 통과 | 검토 전 상태 |
| `npm run lint -w apps/web` (기준선) | 경고·오류 0 | `next lint` deprecation 안내만 출력 |
| `npm test -w apps/web` (기준선) | 67/67 통과 | `CLAUDE.md`의 "58개"는 낡은 수치 |
| `npx tsc --noEmit -p <외부 config: include에 src/**/*.mjs 추가>` | 15 오류 | CPL-17 사전 확인. TS5097 12건(`.ts` 확장자 임포트), TS7006 3건(implicit any). 저장소 파일 미변경 |
| `npx tsx --test src/__alias_probe__.test.mjs` (임시 untracked 파일, 삭제됨) | `ALIAS_OK` | `tsx`가 `.mjs`에서 `~/*` 별칭을 해석함 |
| `npm ls react-dropzone shadcn-dropzone -w apps/web` | `shadcn-dropzone@0.2.1 └── react-dropzone@14.3.8` | C-65 확인 |
| SWC 바이너리 grep `"Only async functions are allowed to be exported in a \"use server\" file"` | 1건 | C-01 빌드 함정 확인 |
| Next `get-page-static-info.js` `extractExportedConstValue(ast, 'config')` / `UnsupportedValueError` | 존재 | C-39 matcher 리터럴 제약 확인 |
| `npm run typecheck -w apps/web` (Phase 0~5 각 종료 시) | 통과 | |
| `npm run lint -w apps/web` (Phase 0~5 각 종료 시) | 경고·오류 0 | |
| `npm test -w apps/web` (최종) | 70/70 통과 | 12개 파일. C-39가 `middleware.test.mjs`(+3), C-22가 `clip-type-label.test.mjs`를 추가 |
| `npm run build -w apps/web` (Phase 0~5 각 종료 시) | 성공 | `server-only`·`"use server"` 규칙과 라우트 그룹 이동을 이 게이트가 잡는다 |
| 빌드 출력 static/dynamic 라우트 표기 대조 (Phase 3·4) | 기준선과 동일 | C-45·C-72·C-73이 마케팅 15 라우트를 dynamic으로 바꾸지 않았음을 확인 |
| `grep -rn 'from "~/fsd/entities/' apps/web/src/fsd/entities` | 0건 | CPL-2 |
| `grep -rn '~/inngest' apps/web/src/fsd/entities` | 0건 | CPL-3 |
| `grep -n '"use server"' apps/web/src/fsd/features/upload/api/*.ts` | `index.ts:1`만 매치 | C-75·C-76의 server-only 형제 모듈이 액션이 되지 않았음 |
| `grep -rn 'db\.uploadedFile' apps/web/src --exclude entities/uploaded-file/api` | 0건 | C-40. features에 남은 `db` 사용은 `$transaction` 셋뿐 |
| `grep -rn 'confirm('` (blocking) | 0건 | C-71 |
| C-37 방어선 실증 | 컴파일 오류 재현 | 푸터 href에 `"/securityy"` 주입 → `TS2820`, 되돌림 |
| C-33 방어선 실증 | 컴파일 검사 확인 | `markUploadedFileAttemptFailed` 호출 13곳의 리터럴이 union에 묶임 |

## Risks and Rollback

잔여 리스크:

- **C-02/C-03 (Polar)**: 포털이 프로덕션 테넌트를 가리키게 되는 것이 의도된 동작인지 실물에서만 확인된다. 반대로 지금까지 sandbox가 의도였다면 `POLAR_SERVER` 환경변수 값을 재검토해야 한다.
- **C-07 (barrel 분할)**: 27곳 임포트 변경. 하나라도 클라이언트에서 `server.ts`를 임포트하면 빌드가 깨진다(typecheck는 통과). 빌드를 Phase 게이트로 둔다.
- **C-28 (개명)**: 이름이 길어진다. 대안(읽기/reconcile 분리)은 제품 결정 후에만.
- **C-75/C-76 (서버 모듈 이동)**: Inngest 워커 경로에 자동 테스트가 없다. 이동 후 업로드 1건을 실제로 처리해 `processVideo` 완료·크레딧 차감·stale reconcile을 확인해야 한다.
- **C-52 (dedupe 상한)**: 500키 초과 세션에서 이벤트가 한 번 더 기록될 수 있다 — 통계상 무시 가능.
- **C-36/C-37/C-72/C-73 (마케팅 구조)**: 동작 변화는 없으나 파일 이동이 많아 리뷰 부담이 크다. 별도 PR 권장. C-73은 두 "Log in" 버튼의 `TrackedLink` `location` 값(`"site_header"` vs `"public_header"`)을 하나로 합치므로 분석 시계열이 끊긴다(§판단 9).
- **문서 드리프트**: `CLAUDE.md`의 서버 액션·barrel 서술과 테스트 수를 함께 갱신하지 않으면 `doc-auditor`가 잡는다.

롤백 방법:

- Phase 단위 커밋이므로 `git revert <phase-commit>`으로 되돌린다. 파일 이동(C-36, COH-10 (b), C-07의 `server.ts`)은 revert가 이동을 되돌리므로 추가 작업 없음.
- C-65는 `package.json`·`package-lock.json` revert 후 `npm install`.
- C-02는 환경변수와 무관하게 코드 revert만으로 sandbox 고정 상태로 돌아간다.

## Completion or Closure Notes

완료 기록:

- completed-at: 2026-09-03
- verification-summary: Phase 0~5 각 종료마다 typecheck·lint·test·build 4종 통과. 최종 테스트 70/70(기준선 67 + C-39 3건), lint 경고 0, build 성공. 빌드 출력의 static/dynamic 라우트 표기는 기준선과 동일하다 — C-45·C-72·C-73이 마케팅 15 라우트를 dynamic으로 바꾸지 않았다.
- implementation commits: `9dd6dfb`(Phase 0, 14건) · `8c06cfe`(Phase 1, 12건) · `3744025`(Phase 2-1) · `82031ee`(Phase 2-2) · `8789f26`(Phase 2-3) · `143157d`(Phase 3, 19건) · `4ad3cd1`(Phase 4, 13건). 기준선 `98ba430`부터 159 파일 변경(+4787 / -2760).
- changed files summary: 신규 파일 — `entities/uploaded-file/model/{failure-code,optimistic-id}.ts`, `entities/{uploaded-file,clip,clip-draft}/server.ts`, `entities/clip/lib/clip-type-label.ts`, `features/upload/api/{complete-processing-attempt,dispatch-processing,reconcile-stale-processing}.ts`, `features/upload/model/{use-delete-uploaded-file,use-resume-upload-draft}.ts`, `features/clip/model/use-delete-clip.ts`, `inngest/modal-contract.ts`, `shared/config/{public-routes,product-copy}.ts`, `shared/lib/format-duration.ts`, `shared/observability/use-report-boundary-error.ts`, `shared/ui/atoms/{json-ld,resource-card-grid}.tsx`, `widgets/clip-display/model/use-script-clipboard.ts`, `widgets/site-header/ui/_component/HeaderAuthMenu.tsx`, `middleware.test.mjs`. 삭제 — `pages/resources/**`, `widgets/site-header/ui/index.tsx`, `features/clip/model/schemas.ts`, `entities/*/model/types.ts` 패스스루 셋. 이동 — `app/{privacy,terms}` → `app/(public-marketing)/{privacy,terms}`.
- remaining follow-up:
  - **C-73 분석 연속성(§판단 9)** — 합쳐진 "Log in" 버튼의 `location`을 트래픽이 큰 쪽인 `"public_header"`로 **골랐다**. 홈(`/`)의 `"site_header"` 시계열은 여기로 합류한다. 분석 소유자가 다른 값을 원하면 `widgets/site-header/ui/public-header.tsx` 한 단어를 바꾼다.
  - **미실행 수동 확인** — §Verification Plan의 수동 표(프로덕션 Polar 포털, 404 화면, 빈 `youtubeTitle`, 마지막 클립 삭제, 웹훅 400, 자동재생 재개, 업로드 1건 실제 처리)는 배포 실물에서만 닫힌다. `docs/release-checks.md` 등재 대상.
  - **§판단 1·4·6·7·8** — 미결로 남는다. 각각 두 `report-error.ts` 동일성 관례(현재는 보존), `outlineWidth` 정수/소수 권위, 마케팅 라우트 인증 인지 여부, 클라이언트 Sentry 초기화, `.mjs` 테스트 타입체크 편입.
  - **후속 항목(계획서가 "보류"로 기록한 것)** — TSC-26(`useUploadPodcast`의 중복 복구 블록 추출), COH-7(billing을 `billingKeys` + `queryOptions`로), COH-13(`PRODUCT_LIMITS_COPY` 보간), C-74 후속(클라이언트 Sentry 도달 확인 후 `captureException`).

닫힘 기록(`status: "closed"`일 때 작성):

- closed-at: TBD
- closed-by: TBD
- closed-reason: TBD
- close summary: TBD
- remaining follow-up: TBD

## Review Checklist

- [x] 모든 `{placeholder}`를 처리했고, pending 문서의 완료/닫힘 전용 `TBD` 외에는 현재 상태에 맞게 갱신했다.
- [x] `status`는 `pending`, `completed`, `closed`만 사용했다.
- [x] 문서 위치와 `status`가 일치한다(`completed/` · `completed`).
- [x] `stage`는 pending 문서에서만 사용했다 — 완료 시 제거했다.
- [x] 승인 필드는 사용자의 전체 범위 구현 지시(2026-09-02)를 기록한다.
- [x] `proposal-size`는 `standard`이며 강제 조건(삭제·라우팅·결제·barrel·5개 이상 파일)에 해당한다.
- [x] 승인 기록은 front matter를 단일 기준으로 사용했다.
- [x] 변경 범위와 제외 범위가 명확하다.
- [x] 영향 파일별 작업과 판단 근거가 적혀 있다.
- [x] 안전성 분석에서 라우팅, import, 자산, 타입, 런타임 side effect를 확인했다.
- [x] 검증 명령과 성공 기준이 적혀 있다.
- [x] 검증 실패가 있다면 기존 실패와 신규 실패를 구분한다(기준선에 실패 없음).
- [x] 잔여 리스크를 명시했다.
- [x] 완료 문서 항목 — completed-at·verification-summary·구현 커밋·변경 파일 요약·잔여 후속을 채웠다.
- [ ] 닫힌 문서 항목 — 해당 없음(완료).
- [x] 정규 77건을 모두 처리했다. 계획서가 조건부·대안으로 둔 곳은 선택한 쪽과 이유를 코드 주석 또는 위 잔여 후속에 남겼다.

## Needs human judgment

게이트가 코드만으로 결정할 수 없다고 판단한 항목. 답이 나오면 해당 `C-NN`의 변경 방향이 확정된다.

1. **`setReportUser`/`withIsolatedReportScope` 삭제 (C-05 안)** — CPL-10·TSC-12는 삭제, RDB-13은 admin 사본과의 동일성 유지를 위해 보존. `apps/admin/src/fsd/shared/observability/report-error.ts`는 독립 파일이고 소비자(`send-observability-test-event.ts:7-8,29-31`)가 살아 있으므로 web 삭제가 admin을 깨지는 않는다. **질문**: 두 `report-error.ts`를 바이트 동일하게 유지하는 것이 관례인가? 그렇다면 web에도 남기고 C-05에서 이 항목을 뺀다. C-74 후속으로 web에 클라이언트 Sentry 전송을 넣으면 두 파일은 어차피 갈라진다.
2. **`ProcessingDispatchStatus`: 삭제 vs 연결 (C-05 vs C-70)** — 게이트는 C-70(연결)을 택했다. 죽은 선언을 강제 불변식으로 바꾸는 쪽이 낫고, C-75 축소안이 여섯 지점을 엔티티에 남겨 충돌이 없다. 이 문서는 두 지시를 동시에 싣지 않는다.
3. **C-28(개명) vs PRD-1 원안(읽기/reconcile 분리)** — 게이트는 개명을 택했다. 폴링 경로에서 reconcile을 빼면 stuck 업로드가 하드 내비게이션에서만 `failed`로 전이해, 지켜보는 사용자는 해소를 보지 못한다. 분리로 격상하려면 reconcile 트리거 위치에 대한 제품 결정이 필요하다.
4. **C-51 `outlineWidth` 정수 vs 소수** — 저장소 안에서 결정 불가. 수용된 변경은 문서화뿐이며 `.int()` 제거나 브랜드 타입은 백엔드 `resolve_caption_style`의 권위 범위 확인 후.
5. **C-73 범위: `/`가 인증 인지 헤더를 유지해야 하나?** — 게이트는 `app/page.tsx` 이동을 제외했다(재제출안의 두 지시가 모순, 유일한 정합 해석은 `/`를 로그아웃 헤더로 하향). 선택지: (a) `/`를 인증 인지로 유지하고 `pages/home/ui/index.tsx:25`와 그룹 레이아웃 사이의 한 줄 래퍼 중복을 수용, (b) `/`를 그룹으로 옮겨 props 없는 헤더를 받아들이고 `app/page.tsx:27-39`의 `auth()` + `getHomeUserProfile`을 죽은 코드로 삭제 — 헤더를 포함하는 div에 걸린 그라디언트 장식도 재확인.
6. **마케팅 15 라우트가 인증 상태를 보여야 하나?** — 레이아웃 `auth()`(현재 static인 15 SEO 라우트를 dynamic으로; 그룹에 `auth()` 0건 검증) 또는 클라이언트 아일랜드 + `app/providers.tsx:49-56`에 없는 `SessionProvider`. 제품/성능 결정. C-73은 현 동작을 의도적으로 유지한다.
7. **C-74 후속: 클라이언트 Sentry 초기화를 추가하나?** — 지금은 없어 클라이언트 렌더 오류가 보이지 않는다. 번들 크기·PII 스크러빙 영향이 있고, `@sentry/nextjs` 10.68.0의 클라이언트 진입점(`instrumentation-client.ts` vs `sentry.client.config.ts`)과 `next.config.js:115-121` 옵션은 이 검토에서 **미검증**. 소유자 결정 + 버전 확인 1회.
8. **C-77 동반: `.mjs` 테스트를 타입체크에 넣나?** — 게이트는 main `tsconfig.json` 완화를 기각. (a) 별칭 재작성만 하고 열 테스트는 타입체크 밖에 둔다, (b) `tsconfig.test.json` + `typecheck:test` 스크립트 + JSDoc 주석 3곳(새 빌드 표면, CI 배선), (c) 열 개 `*.test.mjs`를 `.ts`로 전환 — 가장 깔끔하나 가장 크고 이 검토 범위 밖.
9. **C-73 분석 연속성** — 두 헤더를 합치면 `TrackedLink` `location` 값(`"site_header"` vs `"public_header"`)이 하나가 되어 기존 분석 시계열이 끊긴다. 분석 소유자가 살아남을 값을 고를 것 — 허용 목록은 이 변화를 알리지 않는다.

## Appendix A — 원시 결함 → 정규 항목 매핑

렌즈 접두사: COH(응집) · CPL(결합) · PRD(예측) · RDB(가독) · TSC(TS). 119건 전부가 accept 또는 merge-accept이며 기각은 0건이다.

```
C-01: COH-23, CPL-7, PRD-4, RDB-2, TSC-1        C-02: COH-3, RDB-9, TSC-3
C-03: PRD-15, RDB-23, TSC-2                     C-04: COH-9, CPL-12, PRD-9, RDB-3, TSC-14
C-05: COH-19, CPL-10, CPL-19, PRD-2, RDB-12, RDB-13, TSC-12, TSC-13
C-06: CPL-6            C-07: CPL-1, COH-20      C-08: CPL-9
C-09: COH-1, RDB-5     C-10: PRD-6, RDB-6, CPL-4
C-11: PRD-16, RDB-7    C-12: PRD-17, RDB-22     C-13: TSC-23, PRD-19, RDB-14
C-14: CPL-15, COH-6    C-15: PRD-8              C-16: RDB-8
C-17: TSC-16           C-18: CPL-16, COH-5, PRD-24
C-19: COH-4            C-20: TSC-9, PRD-11      C-21: RDB-21, COH-21, CPL-18
C-22: CPL-13, COH-14   C-23: PRD-13, RDB-25     C-24: COH-16
C-25: TSC-18           C-26: RDB-15, TSC-21, COH-7
C-27: TSC-5, PRD-7     C-28: PRD-1              C-29: TSC-15, PRD-18
C-30: TSC-6            C-31: TSC-7              C-32: PRD-3, TSC-8
C-33: COH-2            C-34: PRD-22             C-35: COH-8
C-36: COH-11           C-37: COH-12             C-38: COH-13
C-39: COH-15           C-40: COH-17             C-41: COH-22
C-42: CPL-5            C-43: CPL-8              C-44: CPL-11
C-45: CPL-14, RDB-10   C-46: PRD-5              C-47: PRD-10
C-48: PRD-12           C-49: PRD-14             C-50: PRD-20
C-51: PRD-21           C-52: TSC-25, PRD-23     C-53: PRD-25
C-54: RDB-1, TSC-26    C-55: RDB-4              C-56: RDB-11
C-57: RDB-16           C-58: RDB-17             C-59: RDB-18
C-60: RDB-19           C-61: RDB-20             C-62: RDB-24
C-63: TSC-4            C-64: TSC-10             C-65: TSC-11
C-66: TSC-17           C-67: TSC-19             C-68: TSC-20
C-69: TSC-22           C-70: TSC-24             C-71: TSC-27
--- 2라운드 (재제출·검증 후) ---
C-72: COH-10 (b)       C-73: COH-10 (a)         C-74: COH-18
C-75: CPL-2            C-76: CPL-3              C-77: CPL-17
```

## Appendix B — 검토 과정과 의존 제약

### 라운드 기록

| 라운드 | 입력 | 결과 |
| --- | --- | --- |
| 렌즈 5개 (병렬, 독립) | 대상 코드 + 프로젝트 규약. 서로의 출력 미노출 | 원시 결함 119건. 다섯 렌즈 모두 Skill 도구로 스킬 로드, 커버리지 Applicable |
| 게이트 1 | 119건 + 범위 매니페스트 | accept 42 · merge-accept 68 · revise 4(COH-10, COH-18, CPL-2, CPL-3) · pending 1(CPL-17) · reject 0 → 정규 71건 |
| 메인 루프 검증 | 게이트 요청 + 미검증 런타임 주장 | 별칭 프로브(통과), 외부 tsconfig `.mjs` 타입체크(15오류), SWC `"use server"` 진단 문자열(존재), Next `config` 정적 추출(존재), 죽은 export grep, `npm ls`, 클라이언트 Sentry init 부재. 저장소 파일 미변경 |
| 렌즈 재제출 | 게이트 피드백을 원 렌즈에만 전달 | COH-10 → (a)/(b) 분할, 레이아웃 `auth()` 제거; COH-18 → 중복 제거로 축소; CPL-2 → server-only 형제 모듈; CPL-3 → DI 철회, 정책 이동 |
| 게이트 2 | 1라운드 표 + 재제출 4건 + 검증 증거 | 6건 신규 정규 항목(C-72~C-77), 4건은 게이트가 범위 추가 축소. 기존 항목 12건에 검증 문구 반영. 3라운드 불필요 |

### 의존 제약 (게이트 통합본)

**강제(정확성·빌드)**: C-02→C-03 · C-07→C-06 · C-07→C-08, C-14, C-22 · C-19→C-08 · C-18→C-08(또는 C-18에서 파일 경로 임포트) · C-16, C-17→C-18 · C-33→C-34 · C-75→C-46 · C-76→C-56 · C-72→C-73 · C-73→C-43 · C-44→C-10의 `useQuery` 대안(채택 시).

**권장(같은 파일·재작업 방지)**: C-09는 C-30과 함께 또는 먼저 · C-14와 C-15 · C-28과 C-67 · C-23과 C-24 · C-02와 C-49 · C-38은 C-72 전(또는 새 경로로 재조준) · C-73은 C-37 전 · C-75와 C-76 연달아 · C-29를 호출자 측 가드로 구현하면 C-76과 독립 · C-76과 C-28은 텍스트상 독립(같은 파일 편집만 조율) · C-74는 독립.

**대체 관계**: C-70이 C-05의 `ProcessingDispatchStatus` 삭제를 대체 · C-42와 C-05의 `uploadedFileKeys.list` 삭제는 한 번만 · C-07이 COH-20의 권고를 대체 · C-76이 CPL-3 1라운드 DI 형태를 대체.

### 커버리지

| 렌즈 | 상태 |
| --- | --- |
| 응집(`frontend-cohesion`) | Completed — 23건, 재제출 2건 모두 2라운드 수용 |
| 결합(`frontend-coupling`) | Completed — 19건, 재제출 2건·검증 1건 모두 2라운드 수용 |
| 예측(`frontend-predictability`) | Completed — 25건, 1라운드 해결 |
| 가독(`frontend-readability`) | Completed — 25건, 1라운드 해결 |
| TS(`typescript-clean-code`) | Completed — 27건, 1라운드 해결 |

**Full applicable-lens review** — Unavailable·Skipped·Gate-validated N/A 없음. 원시 119건 → 정규 77건(Must 1 · Should 28 · Consider 48).
