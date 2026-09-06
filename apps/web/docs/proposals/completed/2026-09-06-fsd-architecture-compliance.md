---
status: "completed"
stage: null
proposal-size: "standard"
created-at: "2026-04-18"
approved-by: "HamSangEok"
approved-at: "2026-09-06"
approval-scope: "잔여 항목 셋(FEAT-31·33·34)을 파이프라인 게이트①②로 개별 승인"
completed-at: "2026-09-06"
verification-summary: "잔여 넷 중 셋을 FEAT-31·33·34로 이행, 나머지 하나(V11b billing 3건)는 FEAT-33에 흡수. 경계 자동 검출(verify:fsd, W1~W8) 도입으로 재발이 CI에서 막힌다 — check 배선 EXIT 0, 셀프테스트 11/11, 감시 지점 음성 시험(W5·W4) 각 EXIT 1 실증"
closed-at: null
closed-by: null
closed-reason: null
owners: []
related: []
---

# Proposal: FSD 아키텍처 가이드라인 준수화 (FSD Compliance)

## 📌 배경 및 문제 상황 (Background & Problem)

현재 프로젝트는 `src/fsd/` 하위에 Feature-Sliced Design(FSD)을 부분적으로 적용하고 있습니다. 그러나 내부 가이드라인(`docs/conventions/fsd-architecture-guidelines.md`) 및 FSD 공식 규격(https://feature-sliced.design/)에 대조해 보면, **의존성 방향 위반**, **Public API 부재**, **안티패턴 세그먼트**, **도메인 DB 접근의 상위 레이어 유출** 등 누적된 규칙 위반이 확인됩니다.

FSD의 가치는 "응집도 높음 + 결합도 낮음"에 있고, 그 전제 조건은 **계층의 선형 흐름**과 **슬라이스 격리**입니다. 현재 상태에서는 다음과 같은 리스크가 존재합니다.

- `shared` 레이어가 상위 레이어(`features/clip`)에 역의존하여 **순환 의존 및 트리 셰이킹 저하** 위험.
- `entities/` 레이어가 통째로 부재하여 **도메인 타입과 DB 접근 책임**이 widgets/features에 흩어짐.
- `src/app/**/page.tsx`·`src/inngest/functions.ts`·`src/app/api/webhooks/**/route.ts`에서 **Prisma 도메인 쿼리가 직접 수행**되어, 가이드라인 §5.4(전역 인프라 예외)를 초과한 범위로 유출.
- 슬라이스 루트 `index.ts`가 단 한 개도 없어 **Public API 경계**가 붕괴 → 외부에서 세그먼트 내부 경로를 직접 참조.
- `shared/types/`, `shared/hooks/`, `pages/dashboard/hooks/`, `features/billing/constants/` 등 **세그먼트 네이밍 안티패턴** 존재.

본 문서는 코드 변경 없이 **현 구조를 감사**하고, **우선순위별 개선안**과 **마이그레이션 단계**를 제안합니다.

---

## 🔍 현재 구조 감사 결과 (Audit)

### 현재 `src/fsd/` 트리

```
src/
├── app/                             # Next.js App Router (FSD 외부)
├── fsd/
│   ├── features/
│   │   ├── billing/                 # api, constants, model, ui
│   │   ├── clip/                    # api, model (UI 없음)
│   │   └── upload/                  # api, ui
│   ├── pages/
│   │   ├── dashboard/               # constants, hooks, model, ui
│   │   ├── home/                    # constants, model, ui
│   │   └── upload-detail/           # model, ui
│   ├── shared/
│   │   ├── api/                     # auth-guard, polar, result, s3
│   │   ├── config/                  # constants.ts
│   │   ├── hooks/                   # ⚠ 안티패턴 세그먼트
│   │   ├── lib/                     # seo, triggerDownload, utils
│   │   ├── types/                   # ⚠ 가이드라인 금지 세그먼트
│   │   └── ui/                      # atoms, error-display
│   └── widgets/
│       ├── clip-display/
│       ├── dashboard-header/
│       ├── login-form/                  # Google OAuth 단일 버튼 (signup 경로 없음)
│       ├── site-footer/
│       ├── site-header/
│       └── uploaded-file-list/
├── inngest/                         # 워커 — DB 직접 접근 중
└── server/                          # auth, db client
```

### 위반 사항 요약

| # | 우선순위 | 유형 | 위치 | 위반 규칙 |
|---|---------|------|------|---------|
| V1 | **Critical** | 역방향 의존 | `src/fsd/shared/hooks/useClipPlayUrl.ts:2` | §5.1 — `shared`는 어떤 레이어도 import 금지 |
| V2 | **Critical** | 레이어 부재 | `src/fsd/`에 `entities/` 없음 | §2.5 — 도메인 엔티티 레이어 표준 |
| V3 | **Critical** | 상위 레이어 DB 직접 조회 | `src/app/dashboard/page.tsx:16`, `src/app/page.tsx:31`, `src/app/dashboard/layout.tsx:26` | §5.4 — 페이지/앱 레이어는 도메인 쿼리 소유 금지 |
| V4 | **Critical** | 상위 레이어 DB 직접 조회 | `src/inngest/functions.ts:45,70,161,179,193,201,212,224` | §5.4 — 비즈니스 쿼리를 워커가 직접 수행 |
| V5 | **Critical** | 상위 레이어 DB 직접 조회 | `src/app/api/webhooks/polar/route.ts:14,50,53,61,67,93,101,119,145,181,211,216` | §5.4 — 웹훅 라우트의 CRUD 직접 수행 |
| V6 | **Critical** | 상위 레이어 DB 직접 조회 | `src/app/api/portal/route.ts:12` | §5.4 |
| V7 | **High** | 금지 세그먼트 | `src/fsd/shared/types/processing-status.ts` | §2.6 — `shared/types` 폴더 금지 |
| V8 | **High** | 안티패턴 세그먼트 | `src/fsd/shared/hooks/`, `src/fsd/pages/dashboard/hooks/` | §4 — 세그먼트는 형태(hooks/types)가 아닌 **목적**으로 명명 |
| V9 | **High** | 비표준 세그먼트 | `src/fsd/features/billing/constants/`, `src/fsd/pages/dashboard/constants/`, `src/fsd/pages/home/constants/` | §4 — 표준 세그먼트는 `ui, model, api, lib, config` |
| V10 | **High** | Public API 부재 | 모든 슬라이스 루트 `index.ts` 없음 | §5.3 — 각 슬라이스는 `index.ts`로 외부 경계 제공 |
| V11a | **High** | Public API 위반(크로스 슬라이스) | `src/fsd/pages/upload-detail/ui/index.tsx:13` → `~/fsd/features/upload/ui`, `src/fsd/widgets/clip-display/ui/index.tsx:6` → `~/fsd/features/clip/api` | §5.3 — 외부 슬라이스의 세그먼트 내부 직접 참조 금지 |
| V11b | **Medium** | 인트라 슬라이스 절대경로 자기참조 | `src/fsd/features/billing/ui/PlanCard.tsx:15-16` → `~/fsd/features/billing/constants`, `src/fsd/features/billing/api/index.ts:9` → 동일 슬라이스 | §5.3은 외부 경계에만 적용되므로 **Public API 위반은 아니나**, 같은 슬라이스 내부는 상대경로(`../config`)로 명시해 슬라이스 경계를 가독적으로 드러내는 것이 권장 |
| V12 | **Medium** | Widget의 도메인 API 직결 | `src/fsd/widgets/uploaded-file-list/ui/_component/UploadedFileCard.tsx:8` → `features/upload/api/getOriginalPlayUrl` 직접 호출 | §2.3 Widget은 조합 계층 — 원본 영상 재생 URL은 도메인 쿼리이므로 `entities/uploaded-file` 또는 공용 훅을 경유해야 함 (CRUD 액션 자체는 `features/upload/ui/UploadedFileActions`가 이미 분리 소유 중) |
| V13 | **Medium** | 인증 로직 배치 불명확 | `src/app/login/page.tsx` → `widgets/login-form`(Google OAuth 버튼), `src/app/signup/page.tsx`는 `/login`으로 redirect. **실제 인증은 Google OAuth 단일 방식**이며 `signup`·bcrypt·Zod 스키마 기반 Credentials 플로우는 **존재하지 않음**. 현재 구조는 동작하나, `features/auth` 슬라이스 부재로 "로그인 트리거 책임"이 위젯 UI 내부로 숨음 | 도메인 응집도 |
| V14 | **Medium** | Feature 모호성 | `src/fsd/features/clip/`에 UI 없음 — `processVideo`, `getClipPlayUrl`, `deleteClip` 만 보유. 이 중 `processVideo`는 업로드·클립 엔티티를 조합하는 "행위"(Feature 성격), `getClipPlayUrl`·`deleteClip`의 DB 부분은 "단일 엔티티 CRUD"(Entity 성격) → 책임 혼재 | §6 FAQ |
| V15 | **Low** | 문서 부채 | `CLAUDE.md:47-58` → 실재하지 않는 `entity/auth/model/schemas` 단수형 경로와 `constants/ subfolders` 기술. `CLAUDE.md:64-65` → **"SQLite database"** 및 **"Credentials provider with bcrypt password hashing"** 기술이지만 실제는 PostgreSQL(`prisma/schema.prisma:10`의 `provider = "postgresql"`) + Google OAuth 전용(`widgets/login-form/ui/index.tsx:32`의 `signIn("google")`). `CLAUDE.md:84-91` → 실재하지 않는 `src/actions/` 디렉토리 기술 (실제 서버 액션은 `src/fsd/features/**/api/` 및 `src/fsd/shared/api/`에 위치) | 문서 정합성 |

### 주요 코드 증거 스니펫

**V1 — shared → features 역방향 의존**
```ts
// src/fsd/shared/hooks/useClipPlayUrl.ts
import { usePlayUrl } from "~/fsd/shared/hooks/usePlayUrl";
import { getClipPlayUrl } from "~/fsd/features/clip/api";  // ❌ shared는 features import 금지
```

**V3 — 페이지에서 도메인 DB 직접 조회**
```ts
// src/app/dashboard/page.tsx:16
const userData = await db.user.findUniqueOrThrow({
  where: { id: session.user.id },
  select: { uploadedFiles: { ... } },
});
```

**V4 — Inngest 워커의 Prisma 직접 호출**
```ts
// src/inngest/functions.ts:45,161,193
const uploadedFile = await db.uploadedFile.findUniqueOrThrow({ ... });
await db.clip.createMany({ data: createData });
await db.$executeRaw`UPDATE "User" SET "credits" = GREATEST("credits" - ${clipsFound}, 0) WHERE "id" = ${userId}`;
```

**V7 — 금지 세그먼트**
```ts
// src/fsd/shared/types/processing-status.ts
export type ProcessingStatus = "queued" | "processing" | "processed" | "failed" | "no credits";
```

**V11a — 크로스 슬라이스 Public API 우회**
```ts
// src/fsd/pages/upload-detail/ui/index.tsx:13
import UploadedFileActions from "~/fsd/features/upload/ui";   // ❌ 외부 슬라이스의 세그먼트 직접 참조
// ✅ 기대: import { UploadedFileActions } from "~/fsd/features/upload"
```

**V13 — 인증은 Google OAuth 단일 방식**
```ts
// src/fsd/widgets/login-form/ui/index.tsx:32
onClick={() => signIn("google", { callbackUrl: "/dashboard" })}

// src/app/signup/page.tsx (전체)
export default function Page() { redirect("/login"); }
// → bcrypt·Zod 기반 signup 플로우는 존재하지 않음. V13의 해결책도 이 전제에 맞춰야 함.
```

---

## 💡 제안하는 해결책 (Proposed Solution)

우선순위별로 단계적 개선안을 제시합니다. **각 단계는 독립적으로 배포 가능**하며, 이전 단계가 다음 단계의 전제 조건입니다.

### 3-1. [Critical] `entities/` 레이어 신설 및 도메인 DB 접근 위임

도메인 DB 접근 책임을 **가장 낮은 적절한 레이어**로 내립니다(가이드라인 §4.1).

**신설할 엔티티 슬라이스**

| 슬라이스 | 책임 (**단일 테이블 CRUD만**) | 기존 코드의 이전 대상 |
|---------|--------------------------------|---------------------|
| `entities/user/` | `findUnique`, `update`(credits, polarCustomerId), `decrementCreditsFloorZero`(raw SQL 예외, R3), `api/queries/find-user-for-dashboard` (R2) | `src/app/dashboard/{page,layout}.tsx`, `src/app/page.tsx`의 `db.user.*`, `src/app/api/portal/route.ts:12`, `src/app/api/webhooks/polar/route.ts:14,93,101,137`의 `db.user.*`, `src/inngest/functions.ts:193`의 `$executeRaw` |
| `entities/uploaded-file/` | `findById`, `findFirst`, `create`, `update`(status·uploaded·language), `delete` | `src/inngest/functions.ts:45,70,201,212,224`, `src/fsd/features/upload/api`의 `db.uploadedFile.*` (단, S3 presigned URL 조합은 feature 잔존 — R4) |
| `entities/clip/` | `createMany`, `findById`, `deleteById`, `deleteMany(where uploadedFileId)` | `src/inngest/functions.ts:161,179`, `src/fsd/features/clip/api`·`src/fsd/features/upload/api`의 순수 `db.clip.*` CRUD만 (S3 오케스트레이션은 feature 잔존 — R4) |
| `entities/subscription/` | `findByPolarId`, `findByUserId`, `upsert`, `update`, `deleteByUserId` | `src/app/api/webhooks/polar/route.ts:50,53,61,67,119,145,181`, `src/fsd/features/billing/api:80,100`의 `db.subscription.*` |
| `entities/order/` | `findByPolarId`, `create`, `api/queries/list-recent-orders-by-user` (R2) | `src/app/api/webhooks/polar/route.ts:211,216`, `features/billing/api`의 order 조회 |

> **중요**: 웹훅의 `onSubscriptionActive`는 "기존 구독 충돌 감지 + 구 구독 삭제 + upsert + 크레딧 증액"을 한 흐름으로 묶는 **다중 엔티티 시나리오**이므로 `entities/subscription`에 통째로 넣지 않습니다. 위 표의 이전 대상은 **단일 CRUD 호출만**이고, 이들을 조합하는 로직은 `features/handle-subscription-active` 등 Feature 슬라이스로 승격합니다.

**각 엔티티 세그먼트 구성**

```
entities/uploaded-file/
├── api/                            # plain ES module (NO "use server" directive)
│   ├── get-uploaded-file.ts        # 단일 조회
│   ├── list-uploaded-files.ts      # 사용자별 목록
│   ├── create-uploaded-file.ts
│   ├── update-status.ts            # status 전이 (queued|processing|processed|failed|no credits)
│   └── delete-uploaded-file.ts
├── model/
│   ├── types.ts                    # UploadedFileSummary, UploadedFile 도메인 타입
│   └── processing-status.ts        # ← shared/types에서 이전
├── ui/                             # (선택, 신설 시) 현재 dumb 컴포넌트 없음. 필요해지면 widgets 내부의 Badge 사용처에서 추출해 `entities/uploaded-file/ui/UploadedFileBadge.tsx` 신설 가능
└── index.ts                        # Public API
```

> **`"use server"` 지시어 배치 규칙 (신설)**: entity `api/*.ts` 파일들은 **plain ES module**로 유지하며 **`"use server"`를 선언하지 않는다**. 이들은 server-only contexts(Inngest worker, route handler, webhook, feature 서버 액션)에서만 호출된다. client component에서 직접 호출되어야 하는 Server Action은 feature(예: `features/upload/api/index.ts` 상단 `"use server"`)가 entity 함수를 감싸는 형태로 제공한다. entity `api/` 파일에 `"use server"`를 넣으면 같은 파일에서 타입/상수를 재export할 때 "only async functions can be exported" 제약에 걸리며, client 번들 경계 추적이 복잡해진다.
>
> **`server-only` 가드 필수 (신설, P2 보완)**: entity `api/*.ts`는 `"use server"`가 없으므로 client component가 실수로 import하면 `~/server/db`(Prisma client)가 client 번들에 포함된다. `no-restricted-imports`로 `~/server/db`만 막는 것으로는 불충분하다 — 웹훅 DTO 어댑터, S3 SDK, `polar` SDK 등 entity가 import할 수 있는 다른 server-only 의존성이 함께 유출되기 때문이다. 각 entity `api/*.ts` 파일 **상단에 `import "server-only";`** 를 필수로 선언한다. 이 import는 Next.js가 client 번들 포함 시 빌드 타임에 에러를 발생시키므로 실수 import가 CI에서 즉시 감지된다.
>
> **⚠ 패키지 설치 선행 필수 (P11 신설)**: `server-only`는 Next.js 15.5.7의 direct dependency에 **포함되지 않는다**. 현재 프로젝트의 `package.json` / `npm ls server-only` 확인 결과 미설치 상태이며, 이 상태에서 `import "server-only";`를 추가하면 **빌드 즉시 실패**(Module not found). 따라서 Phase 1 시작 전 선행 작업으로 `npm install server-only` 실행이 필요하다. 이 설치 한 줄은 Phase 0 (패키지 선행 설치) 서브스텝으로 분리하며, 본문 아래 Phase 0 섹션 참조. Phase 1 체크리스트에 **"모든 `entities/**/api/**/*.ts` 파일 1행에 `import "server-only";`가 존재"** 항목 추가.

**상위 레이어 리팩터 예시**

```ts
// before — src/app/dashboard/page.tsx
const userData = await db.user.findUniqueOrThrow({ ... });

// after
import { getDashboardUser } from "~/fsd/entities/user";
const userData = await getDashboardUser(session.user.id);
```

```ts
// before — src/inngest/functions.ts
await db.clip.createMany({ data: createData });

// after
import { createClipsBulk } from "~/fsd/entities/clip";
await createClipsBulk(createData);
```

**예외 유지**: `src/server/auth/config.ts`의 `db.user.findUnique()`는 가이드라인 §5.4의 "인증 세션 부트스트랩"에 해당하므로 그대로 유지합니다.

**Entity vs Feature 경계 규칙** (guideline §5.4 + §6 FAQ 재천명)

| 성격 | 레이어 | 예시 |
|------|-------|------|
| 단일 테이블 CRUD (findUnique/update/delete) | `entities/<domain>/api` | `entities/subscription/api/upsert-subscription.ts` |
| 여러 엔티티를 조합한 비즈니스 시나리오 | `features/<action>/api` | `features/handle-subscription-lifecycle`가 `entities/subscription` + `entities/user` + `entities/order` + `shared/api/polar` 조율 |
| 워커·웹훅·route handler의 진입점 | 상위 레이어(API route, Inngest function) | **Feature의 조합 함수만 호출**. 엔티티 API 여러 개를 직접 조합하지 않음 |

이 규칙을 적용하면 `src/app/api/webhooks/polar/route.ts`의 `onSubscriptionActive`·`onSubscriptionUpdated`·`onOrderCreated`는 각각 `features/handle-subscription-active`, `features/handle-subscription-updated`, `features/handle-order-created`로 옮겨지고, 웹훅 핸들러는 **입력 파싱 + 해당 feature 호출**만 담당합니다. 이는 가이드라인 §5.4의 "Entity 내에서는 다른 Entity를 import 할 수 없습니다" 제약과 자연스럽게 부합합니다.

**기존 Feature의 재정립**: `features/upload/api/deleteUploadedFileWithClips`는 이미 올바른 Feature 형태(엔티티 조합 + S3 오케스트레이션)이므로 Phase 1에서 내부 `db.*` 호출만 엔티티 API 경유로 교체합니다.

**`~/server/db` 임포트 스코프 규칙** (신설)
- **허용**: `src/fsd/entities/**/api/**`, `src/server/auth/**` (부트스트랩 예외)
- **금지**: `widgets/`, `pages/`, `features/`, `shared/`, `src/app/**`, `src/inngest/**`
- Phase 2의 ESLint/steiger 규칙으로 자동 강제 (아래 3-4 참조).

**Inngest 워커에 대한 예외 판단**: `src/inngest/functions.ts`는 "프레임워크 진입점" 성격이지만, 실제 `check-credits`·`create-clips-in-db`·`deduct-credits`·`set-status-*` 스텝은 **비즈니스 쿼리**이므로 §5.4의 예외에 해당하지 않습니다. 각 스텝의 Prisma 호출부를 엔티티 API로 대체하되, `step.run()` 경계와 retry/concurrency 설정(`limit: 1, key: "event.data.userId"`)은 워커 쪽에 그대로 유지합니다.

### 3-2. [Critical] `shared`의 역방향 의존 해소

- 범용 훅인 `usePlayUrl`은 특정 도메인에 의존하지 않으므로 `src/fsd/shared/lib/use-play-url.ts`로 이전.
- `useClipPlayUrl`은 **entities로 이전하지 않는다**. 이유: 내부에서 `getClipPlayUrl`을 호출해야 하는데, R4에 따라 `getClipPlayUrl`은 `features/clip/api`에 유지된다(DB + S3 오케스트레이션이므로 Feature 성격). 만약 `useClipPlayUrl`을 `entities/clip/model/`로 옮기면 `entities → features` 업워드 import가 되어 V1과 동형의 단방향 위반이 재발한다.
- 따라서 다음 두 경로 중 택일한다:
  - **경로 A (권장, 최소 diff)**: 얇은 래퍼인 `useClipPlayUrl`은 **제거**한다. 호출처(`widgets/clip-display` 등)가 `usePlayUrl(clipId, getClipPlayUrl)` 패턴을 직접 사용한다. 이는 `UploadedFileCard.tsx:30`이 이미 `usePlayUrl(file.id, getOriginalPlayUrl)` 형태로 쓰는 방식과 동일하다.
  - **경로 B**: 래퍼를 유지하되 `features/clip/model/use-clip-play-url.ts`에 둔다. 같은 슬라이스 내부의 `api`를 import하므로 단방향 규칙 준수(feature는 자기 슬라이스의 세그먼트들을 참조 가능). 다만 래퍼의 존재 가치가 "`usePlayUrl + getClipPlayUrl` 바인딩 한 줄"에 불과하므로 경로 A가 더 단순하다.
- `usePlayUrl`이 위치한 `shared/lib/use-play-url.ts`는 도메인 API(feature)를 **파라미터로 주입받는 제너릭 훅**이므로, shared가 feature를 직접 import하지 않아 §5.1 규칙을 위반하지 않는다.

### 3-3. [High] 세그먼트 네이밍 안티패턴 정리

| 현재 위치 | 이전 위치 | 근거 |
|----------|---------|------|
| `src/fsd/shared/types/processing-status.ts` | `src/fsd/entities/uploaded-file/model/processing-status.ts` | §2.6 `shared/types` 금지 + 도메인 응집도 |
| `src/fsd/shared/hooks/usePlayUrl.ts` | `src/fsd/shared/lib/use-play-url.ts` | §4 "형태가 아닌 목적" |
| `src/fsd/shared/hooks/useClipPlayUrl.ts` | **삭제 (경로 A, 권장)** 또는 `src/fsd/features/clip/model/use-clip-play-url.ts` (경로 B) | §4 + §5.1 동시 해결. `entities/clip/model/`로 이동하는 이전 안은 `getClipPlayUrl`이 `features/clip/api`에 남아있기 때문에 업워드 import가 되어 철회 (3-2 재참조) |
| `src/fsd/pages/dashboard/hooks/useUploadPodcast.ts` | `src/fsd/pages/dashboard/model/use-upload-podcast.ts` | §4 |
| `src/fsd/features/billing/constants/` | `src/fsd/features/billing/config/` | §4 표준 세그먼트 |
| `src/fsd/pages/dashboard/constants/` | `src/fsd/pages/dashboard/config/` | §4 |
| `src/fsd/pages/home/constants/` | `src/fsd/pages/home/config/` | §4 |

### 3-4. [High] 슬라이스 루트 `index.ts` 추가 (Public API 표준화)

모든 슬라이스에 루트 `index.ts`를 추가하고, 외부에서는 반드시 이 경계를 통해서만 import하도록 정리합니다.

**대상 슬라이스** (기존 12 + 신설 5 = 총 17, Phase 3-5 시점에 `features/auth`·`features/handle-*` 신설 후 최대 +5)
- `widgets/*` (6): `clip-display`, `dashboard-header`, `login-form`, `site-footer`, `site-header`, `uploaded-file-list`
- `features/*` (3, Phase 3-5에서 `auth` 및 `handle-subscription-*`·`handle-order-created` 추가): `billing`, `clip`, `upload`
- `pages/*` (3): `dashboard`, `home`, `upload-detail`
- `entities/*` (5, Phase 1에서 신설): `user`, `uploaded-file`, `clip`, `subscription`, `order`

> **Default export → Named export 선행 변환 (필수 서브스텝)**: 현재 다음 10개 `ui/index.tsx` 파일이 모두 default export이다 (`grep -n "export default" src/fsd/**/ui/index.tsx` 기준 10건).
> `widgets/{clip-display,dashboard-header,login-form,site-footer,site-header,uploaded-file-list}/ui/index.tsx`, `features/upload/ui/index.tsx`, `pages/{dashboard,home,upload-detail}/ui/index.tsx`.
> 슬라이스 루트에서 named re-export(`export { ClipDisplay } from "./ui";`)를 사용하려면 **대응하는 `ui/index.tsx`의 default export를 named export로 변환**하거나, **배럴에서 `export { default as ClipDisplay } from "./ui";` 패턴**을 사용해야 한다. 변환하지 않고 named re-export만 추가하면 TS2305("Module has no exported member") 오류가 발생한다. Phase 2 step 4 작업 순서에 이 변환을 **step 4 직전**에 수행하도록 포함한다.

**예시**

```ts
// src/fsd/features/billing/index.ts
// 전제: Phase 2 step 3-1 타입 재배치 완료 후. `PlanTier`/`ProductIds`는 constants/ 에서
// model/types.ts로 이전된 상태여야 함.
export { getBillingData, cancelSubscription, getCheckoutUrl } from "./api";
export { PLAN_TIERS } from "./config";
export type { BillingPageData, SubscriptionInfo, OrderInfo, PlanTier, ProductIds } from "./model/types";
export { BillingPage } from "./ui/BillingPage";   // BillingPage는 이미 named export
```

```ts
// src/fsd/widgets/clip-display/index.ts
// 전제: ./ui/index.tsx 의 `export default function ClipDisplay(...)` 를 named export
// (`export function ClipDisplay(...)`)로 선행 변환했거나, 아래처럼 `default as` 패턴을 사용한다.
export { default as ClipDisplay } from "./ui";   // default export 유지 시
// export { ClipDisplay } from "./ui";          // named export로 변환 시
```

**`"use server"` 배럴 파일 제약 (신설, P8 보완)**

`features/*/api/index.ts`는 client component가 server action으로 호출하기 위해 파일 상단 `"use server"`를 **유지**해야 한다. 그러나 슬라이스 루트 배럴 `features/*/index.ts`에 `"use server"`를 선언하면 **동일 파일에서 상수·타입·UI를 함께 re-export할 때 TS1253 "A 'use server' file can only export async functions"가 발생**한다. 배럴에서 `"use server"` 없이 async function을 re-export하는 경로는 Next.js 15에서 원본 파일의 `"use server"` 경계를 따라가지만, 번들러가 특정 조건에서 server action의 client 직렬화 identity를 유실하는 사례가 보고되어 있어 **프로덕션에서 "`X is not a function`" 런타임 실패**로 이어질 수 있다.

**권장 패턴 — feature Public API surface 이원화**

```ts
// features/billing/index.ts   ("use server" 없음. 상수·타입·UI만 re-export)
export { PLAN_TIERS } from "./config";
export type { BillingPageData, SubscriptionInfo, OrderInfo, PlanTier, ProductIds } from "./model/types";
export { BillingPage } from "./ui/BillingPage";
// ❌ getBillingData 등 server action을 여기서 re-export하지 않는다.
```

Server action은 **`features/<slice>/api` 경로 직접 import를 공식 surface**로 둔다.

```ts
// 호출부 예시
import { getBillingData, cancelSubscription } from "~/fsd/features/billing/api";        // server action
import { PLAN_TIERS, BillingPage, type PlanTier } from "~/fsd/features/billing";         // 상수·타입·UI
```

이 패턴은 3-4의 "슬라이스 루트 `index.ts` 표준화" 원칙을 지키면서도 `"use server"` 제약을 우회한다. widgets·pages·entities 슬라이스는 `"use server"` 파일을 포함하지 않으므로 일반 배럴(`export { X } from "./ui"` 등)을 그대로 사용한다.

Phase 2 step 4·5 체크리스트에 다음 항목 추가:
- [ ] `features/*/index.ts`에 `"use server"` 선언이 **없음**(`rg -n '^\"use server\"' src/fsd/features/*/index.ts` 결과 0건).
- [ ] `features/*/index.ts`가 async function을 re-export하지 **않음** — server action은 `features/<slice>/api` 경로로만 노출.
- [ ] 호출부의 server action import가 모두 `~/fsd/features/<slice>/api` 경로(또는 `api/<file>` 세부 경로)로 정리됨.

**import 정리 (V11 해소)**

FSD 슬라이스 내부 참조뿐 아니라 **상위 레이어(`src/app/**`)의 진입점 import**도 함께 교체해야 한다. 현재 default import를 사용하는 대표 위치:
- `src/app/dashboard/page.tsx:4` — `import DashboardView from "~/fsd/pages/dashboard/ui";`
- `src/app/dashboard/layout.tsx:4` — `import DashboardHeader from "~/fsd/widgets/dashboard-header/ui";`
- `src/app/login/page.tsx:3` — `import LoginForm from "~/fsd/widgets/login-form/ui";`
- `src/app/page.tsx:2` — `import HomePage from "~/fsd/pages/home/ui";`

```ts
// before
import UploadedFileActions from "~/fsd/features/upload/ui";
import { deleteClip } from "~/fsd/features/clip/api";
import { PLAN_TIERS } from "~/fsd/features/billing/constants";
import DashboardView from "~/fsd/pages/dashboard/ui";

// after
import { UploadedFileActions } from "~/fsd/features/upload";
import { deleteClip } from "~/fsd/features/clip";
import { PLAN_TIERS } from "~/fsd/features/billing";
import { DashboardView } from "~/fsd/pages/dashboard";
```

`steiger` 또는 ESLint 규칙(`@feature-sliced/eslint-config`)으로 경계 위반을 **자동 검출**하도록 CI에 추가하는 것을 권장합니다.

### 3-5. [Medium] Widget/Feature 재분류 · 구조 정리

| 현재 | 제안 | 이유 |
|------|------|------|
| `widgets/uploaded-file-list/ui/_component/UploadedFileCard.tsx` → `features/upload/api/getOriginalPlayUrl` 직접 호출 | **현행 호출 방식 유지** (`usePlayUrl(fileId, getOriginalPlayUrl)` 주입형). 단 `getOriginalPlayUrl`을 `entities`로 내리지 않음(R4). "위젯이 feature API를 공용 훅에 주입하는 패턴"을 `docs/conventions/fsd-architecture-guidelines.md`에 명문화 | V12는 R4로 재해석 |
| `features/clip/` 슬라이스 이름 | **P4 보완: R4와 충돌 해소**. 단순 흡수 옵션은 철회한다. R4에 따라 `getClipPlayUrl`·`deleteClip`은 "DB + S3 오케스트레이션"이므로 Feature 잔존이 필수인데, 이를 `features/upload`로 옮기면 "upload" 슬라이스가 clip 재생·삭제까지 책임져 **슬라이스 이름-책임 불일치**가 재발한다. **확정안: `features/clip/`을 그대로 유지**하되, `processVideo`만 `features/clip/api/trigger-clip-generation.ts`로 파일 분리하고 기존 파일 내 `processVideo` 정의는 삭제. 슬라이스 이름 변경 없음. UI가 없는 것은 V14에서 "문제"로 보지 않고 "DB+외부 서비스 조합만 소유하는 feature 슬라이스는 UI 없이 `api`·`model`만 가질 수 있다"는 조항을 가이드라인에 명문화 | V14 + R4 정합성 |
| `features/clip/model/schemas.ts` (`processVideoSchema`) | 위 확정안에 따라 **파일 이동 없이 제자리 유지**. `trigger-clip-generation.ts`에서 `~/fsd/features/clip/model/schemas`를 동일 슬라이스 상대경로(`../model/schemas`)로 import | 구조 유지 |
| `UploadedFileSummary` 타입 (현 상태: canonical 정의는 `widgets/uploaded-file-list/model/types.ts` 한 곳, `pages/dashboard/model/types.ts`는 이미 re-export, `features/upload/api`와 `src/app/dashboard/page.tsx`의 `formattedFiles.map`은 동일한 모양의 **인라인 객체 리터럴**을 구성) | **`entities/uploaded-file/model/types.ts`에 단일 canonical 정의로 이전**. 기존 widgets canonical과 pages re-export를 Phase 2에서 entities 경유 re-export로 갱신한 뒤, Phase 3에서 호출처를 엔티티 Public API 직접 참조로 교체하며 re-export 라인을 삭제. `src/app/dashboard/page.tsx`의 인라인 map은 `formattedFiles: UploadedFileSummary[]`로 타입 주석을 달아 드리프트 감시 | 드리프트 방지 |
| `features/billing/index.ts` Public API 설계 | `PlanTier`·`ProductIds`는 실제로는 현재 `features/billing/constants/index.ts`에 있음. Phase 2에서 `constants/ → config/` 리네이밍 + 타입을 `model/types.ts`로 이동한 **후에** Public API index 작성. 이동 누락 방지를 위해 Phase 2 step 3과 step 4 사이에 "타입 재배치" 서브스텝 삽입 | 예시-구현 불일치 해소 |
| `src/app/login/`, `src/app/signup/` 배치 | `widgets/login-form`은 그대로 두고, **Google OAuth 트리거 행위**를 **`features/auth/lib/sign-in-with-google.ts`** 로 승격(`signIn("google", { callbackUrl })` 한 줄). `signIn`은 `next-auth/react`의 **클라이언트 전용 함수**이므로 `api/` 세그먼트(`"use server"` 서버 액션 관례)가 아닌 **`lib/` 세그먼트**에 배치해야 한다. **P3 보완: 서버 실수 import 방지 가드 필수**. 파일 상단에 **`import "client-only";`** 를 선언한다. `"use client"` directive만으로는 서버 컴포넌트에서 import 시 빌드 타임 차단이 보장되지 않지만, `client-only` import는 Next.js 번들러가 server 환경에서 import 시도할 때 즉시 에러를 발생시킨다. 두 가드는 중복이 아니며 병행 권장 — `"use client"`는 number of client boundaries를, `client-only`는 server-side import를 각각 차단. widget은 버튼 UI만, feature가 "무엇을 하는가"를 명시. **signup·bcrypt·Zod 스키마는 제안에서 제거** (실제 플로우에 없음). `src/app/signup/page.tsx`의 redirect 역할은 그대로 유지하되 **`robots: { index: false, follow: false }` 메타 추가**(SEO 노출 방지, 제안 범위 내 곁가지 수정). **⚠ 패키지 확인 (P11 신설 연계)**: `client-only`는 현재 `styled-jsx@5.1.6` → `next`의 **transitive dependency로만 존재**(`npm ls client-only` 기준 0.0.1). Next 업그레이드로 styled-jsx가 떨어지면 이 간접 의존성이 사라져 빌드 실패가 발생할 수 있으므로, Phase 0 선행 설치 단계에서 `npm install client-only`를 명시해 **직접 의존성으로 고정**한다 | V13 + 부차 SEO 보정 |
| `features/handle-subscription-*`의 Polar payload 타입 | Feature 함수 시그니처에 `@polar-sh/nextjs` 내부 payload 타입을 직접 노출하지 않음. **Feature 파라미터는 우리 도메인 DTO**로 정의. 핸들러별 최소 DTO 필드 (현 `src/app/api/webhooks/polar/route.ts`의 사용처 실측): `handle-subscription-active({ polarId, userId, productId, tier, monthlyCredits, recurringInterval, periodStart, periodEnd, polarCustomerId })` / `handle-subscription-updated({ polarId, productId, tier, monthlyCredits, recurringInterval, periodStart, periodEnd, cancelAtPeriodEnd, canceledAt, status })` / `handle-subscription-canceled({ polarId, canceledAt })` / `handle-order-created({ polarId, userId, productName, amount, currency })`. 웹훅 라우트에서 `payload → DTO` 어댑터 함수를 거쳐 호출. 어댑터는 라우트 파일 내 로컬 함수 | SDK 결합 최소화 |

### 3-5b. [Critical] 핵심 설계 긴장과 해결 규칙

엔티티 원칙을 순진하게 적용하면 **런타임 성능 회귀** 또는 **엔티티 원칙 자기모순**이 발생합니다. 구현 진입 전에 아래 규칙을 확정합니다.

#### 규칙 R1 — 다중 엔티티 관계 쿼리는 Feature가 소유

Prisma `include/select`로 묶여있던 쿼리를 엔티티 단위 호출로 분해하면 **단일 쿼리 1회가 N회 round-trip으로 증가**합니다. `getBillingData`의 `db.user.findUnique({ select: { credits, subscription, orders } })`를 3개 엔티티 호출로 쪼개면 N+1 회귀입니다.

**규칙**:
- 엔티티 API는 "해당 엔티티 단일 테이블을 **주 테이블**(쿼리 루트)로 하는 쿼리"를 소유. 관계 쿼리(`include`/`select` 중첩)가 하나의 주 테이블 루트를 가진다면 그 엔티티 API에 두어도 무방 (예: `entities/user/api/find-user-with-billing.ts`가 `user + subscription + orders`를 한 번에 조회).
- **주 테이블 결정 기준**: Prisma 쿼리의 `db.<model>.findX()` 에서 `<model>`이 주 테이블. 따라서 `db.user.findUnique({ select: { orders: {...} } })`는 `entities/user`에, `db.order.findMany({ where: { userId } })`는 `entities/order`에 배치한다.
- 관계 쿼리 작성 시 **선언적 타입 힌트**를 주석으로 남겨 select 드리프트를 가시화. (`// Returns user with subscription? + orders[]`)
- 반대로 여러 엔티티를 **독립 쿼리로 조합**하는 로직은 Feature에 배치 (예: 웹훅의 `findByPolarId` + `findByUserId` 비교).
- "단일 테이블 CRUD"는 **쓰기 메서드**(update/delete/create)에 엄격 적용. **읽기 메서드**(find/list)는 관계 select를 허용.
- **복합 쓰기 예외**: `onSubscriptionActive`의 `upsert`처럼 create/update 필드셋이 다르고 단일 테이블 쓰기에 해당하는 경우는 엔티티의 **specialized 쓰기 메서드**(예: `entities/subscription/api/upsert-active-subscription.ts(dto)`) 로 승격한다. 일반 `create/update`와 분리해 "이 메서드가 무엇을 하는지" 이름으로 드러낸다. Feature가 엔티티 여러 쓰기를 조합해야 한다면 `db.$transaction` 래퍼를 feature가 소유한다(3-5b R1 하단 규칙, Caveats 참조).

#### 규칙 R2 — 페이지 전용 집계 쿼리의 배치

`dashboard/page.tsx`의 `user → uploadedFiles → _count.clips` 중첩 select는 뷰 전용 DTO를 만듭니다. 엔티티에 넣으면 엔티티가 페이지에 결합되고, feature로 옮기면 관계 쿼리를 재작성해야 합니다.

**규칙**:
- **읽기 전용 집계 쿼리 전용 서브 세그먼트** `entities/<domain>/api/queries/`를 허용. 일반 CRUD(`entities/<domain>/api/`)와 구분.
  ```
  entities/user/api/
  ├── find-user.ts              # 범용
  ├── update-credits.ts         # 범용 쓰기
  └── queries/
      └── find-user-for-dashboard.ts   # 페이지 전용 복합 select
  ```
- **`api/` 루트 vs `api/queries/` 구분 기준**: 반환 타입이 **범용 Prisma `GetPayload<typeof xxxSelect>` 형태로 재사용 가능**하면 `api/` 루트에 둔다. 반환 타입이 **특정 페이지/위젯을 위한 DTO 모양(필드 재구성·필드명 재명명·파생값 포함)**이면 `api/queries/`에 둔다. 즉 "호출처가 1곳인 복합 select"는 `queries/`, "여러 호출처가 공유할 수 있는 관계 쿼리"는 루트.
- `queries/` 파일은 **반환 타입을 명시적으로 `export`** 하여 호출처가 `ReturnType`에 의존하지 않도록 함. `Prisma.UserGetPayload<typeof dashboardUserSelect>` 또는 `satisfies` 패턴 사용.
- 다른 엔티티 타입을 반환해야 한다면(예: user에 subscription 중첩) **기본 전략은 `Prisma.<Model>GetPayload<{ select: typeof <selectConst> }>` 타입 유틸**을 사용해 select에서 직접 shape을 추론한다. Prisma의 generated 타입(`generated/prisma`)만 참조하므로 **FSD 레이어의 cross-entity import가 발생하지 않아 steiger `forbidden-imports`와 충돌하지 않는다**.
  ```ts
  // entities/user/api/queries/find-user-for-dashboard.ts
  import { Prisma } from "generated/prisma";
  import { db } from "~/server/db";

  const dashboardUserSelect = Prisma.validator<Prisma.UserSelect>()({
    credits: true,
    uploadedFiles: {
      select: { id: true, displayName: true, status: true, _count: { select: { clips: true } } },
    },
  });
  export type DashboardUser = Prisma.UserGetPayload<{ select: typeof dashboardUserSelect }>;
  export async function findUserForDashboard(userId: string): Promise<DashboardUser | null> {
    return db.user.findUnique({ where: { id: userId }, select: dashboardUserSelect });
  }
  ```
- **Prisma 타입만으로 표현 불가능한 프로젝트 도메인 타입**(파생 계산값, 브랜드 타입, 여러 엔티티에서 공유되는 유니온 등)은 `shared/lib/domain-types/<name>.ts`에 둔다. `shared/types/`는 §2.6에 의해 금지되므로 이 경로를 사용한다.
- 위 두 전략으로도 회피 불가능한 cross-entity import가 필요한 경우에만, **Phase 2 step 6의 `steiger.config.ts` 예외 경로(`entities/**/api/queries/**`)를 통해 해제**하고 해당 파일 상단에 `// @fsd-allow cross-entity-type-import: <reason>` 의도 주석을 필수로 남긴다.
- 이 규칙은 FSD "Entity 내에서는 다른 Entity를 import 할 수 없습니다"에 대한 **프로젝트 전용 예외**로 본 문서에서 공식화. `docs/conventions/fsd-architecture-guidelines.md` Phase 4에서 동반 갱신.
- **DTO 매핑 의무 (P6 보완)**: `Prisma.<Model>GetPayload<...>`는 DB schema 모양이 **widgets/pages로 직통 전파**되므로, 스키마 컬럼 추가·삭제·renaming이 상위 레이어 타입에 즉시 파급된다. 이는 §3의 "도메인 응집도 향상"·"경계 확립" 효과와 상충한다. 따라서 `api/queries/*.ts`는 다음 두 가지 반환 경로 중 하나를 **반드시** 선택한다:
  - **경로 Q1 (권장, domain DTO 매핑)**: 파일 내부에서 Prisma `select` 결과를 도메인 DTO 타입(예: `DashboardUserView`)으로 한 번 매핑해 반환한다. DTO는 `entities/<domain>/model/types.ts`에 정의하며, DTO 필드명은 UI 관점(예: `clipCount` — `_count.clips`를 평탄화)을 쓴다. 스키마 변경 시 매핑 지점 한 곳만 수정하면 상위 레이어 타입이 안정적으로 유지된다.
  - **경로 Q2 (Prisma 타입 직결, 예외)**: 1) 호출처가 **1곳**이고 2) 매핑 overhead가 명백히 낭비인 **얇은 read-through**(예: `user.findUnique({ select: { credits: true } })` 같은 단일 필드 조회)인 경우에 한해 `Prisma.<Model>GetPayload<...>`를 그대로 반환해도 된다. 이 경우 파일 상단에 `// @fsd-prisma-type-passthrough: <reason>` 주석을 필수로 남겨 의도를 드러낸다.
  - `queries/` 루트(집계 쿼리)는 원칙적으로 **Q1**, `api/` 루트(범용 CRUD read)는 호출처 수에 따라 Q1 또는 Q2 선택. 쓰기(create/update/delete)는 반환이 없거나 영향 row 개수만 반환하므로 본 규칙 밖.
  - Phase 1 체크리스트에 "모든 신설 `api/queries/*.ts`의 반환 타입이 Q1 또는 Q2 주석 중 하나를 충족" 항목 추가.
  - **Phase 1 예외 (신설, P9 보완)**: Q1(도메인 DTO 매핑)은 `_count.clips` → `clipCount` 같은 **필드 shape 변경**을 동반하므로 Phase 1에 강제하면 상위 레이어(`dashboard/page.tsx`의 `formattedFiles.map`, widgets·pages의 `UploadedFileSummary` 접근자) 연쇄 수정이 발생해 "호출 경로만 교체, 런타임 동작 변경 없음"이라는 Phase 1 스코프가 깨진다. 따라서 **Phase 1에서는 `queries/` 루트에 한해 Q2(Prisma 타입 직결 + passthrough 주석)를 전면 허용**한다. Q1 매핑으로의 전환은 **Phase 2의 별도 서브스텝**(세그먼트 네이밍 정리 및 `UploadedFileSummary` canonical 이전과 묶는다 — 아래 Phase 2 step 1-1 참조)으로 이관. Phase 1의 passthrough 주석은 **만료 조건을 명시**: `// @fsd-prisma-type-passthrough: phase-1-shape-parity, TODO: convert to Q1 in phase 2`. Phase 2 완료 체크리스트에 "모든 `phase-1-shape-parity` 주석이 제거되었고 `queries/` 반환 타입이 도메인 DTO" 항목을 포함.

#### 규칙 R3 — Prisma로 표현 불가능한 원자 쓰기는 raw SQL 유지

`db.$executeRaw` `UPDATE User SET credits = GREATEST(credits - n, 0)`는 **음수 방지가 있는 원자 감산**입니다. `{ credits: { decrement: n } }`는 음수 허용, read-then-update는 race에 노출. 대안:
- **본 제안의 적용 경로(단기)**: `entities/user/api/decrement-credits-floor-zero.ts` 한 파일에서만 `db.$executeRaw` 호출 허용. 이 엔티티 메서드는 "raw SQL을 쓰는 이유" 주석을 필수로 남김.
- `features/` 나 워커에서는 직접 raw SQL 금지.

> **범위 밖 (별도 제안서 예고)**: DB 스키마에 CHECK 제약(`CHECK (credits >= 0)`)을 추가하고 Prisma `decrement`로 대체하는 중장기 개선은 DB 마이그레이션이 필요하므로 본 제안에 포함하지 않습니다. 이 경로는 별도 제안서로 다루며, 본 제안은 단기 경로만 구현합니다.

#### 규칙 R4 — DB+외부 서비스 오케스트레이션은 Feature

`getClipPlayUrl`·`getOriginalPlayUrl`은 "DB 조회 + S3 presigned URL 생성", `deleteClip`은 "DB 조회 + S3 삭제 + 폴더 정리 + DB 삭제"입니다. 이들은 **단일 테이블 CRUD가 아니므로 엔티티에 배치 불가**. V12/V14 해설에 이 충돌이 있었음을 인정하고 교정합니다.

**교정된 배치**:
| 함수 | 현재 위치 | 목표 위치 |
|-----|---------|---------|
| `getClipPlayUrl` | `features/clip/api` | **`features/clip/api`에 유지** (Feature). 엔티티 쪽에는 `entities/clip/api/find-clip-by-id.ts`(순수 CRUD)만 신설해서 feature가 호출 |
| `deleteClip` | `features/clip/api` | **`features/clip/api`에 유지** (Feature). 엔티티 쪽에는 `entities/clip/api/delete-clip-by-id.ts`(순수 delete) 신설 |
| `getOriginalPlayUrl` | `features/upload/api` | **`features/upload/api`에 유지** (V12의 "엔티티로 이전"은 철회). 엔티티 쪽에는 `entities/uploaded-file/api/find-uploaded-file-by-id.ts` 신설해서 feature가 호출 |

위젯의 V12 위반은 "`entities/uploaded-file/api`로 이전"이 아니라 **feature를 그대로 호출하되 위젯이 직접 부르지 않고 공용 훅(`shared/lib/use-play-url`)에 주입**하는 형태로 해소합니다. 위젯은 이미 `usePlayUrl(fileId, getOriginalPlayUrl)`처럼 feature API를 주입형으로 호출하므로(UploadedFileCard.tsx:30), 현행 구조가 사실상 거의 올바릅니다. 정리는 **`shared/lib/use-play-url`가 도메인 API를 주입받는 방식의 주입 방향을 문서화**하는 수준으로 충분합니다.

#### 규칙 R5 — Inngest `step.run` 경계 설정 기준

- **한 `step.run` = 하나의 retry 단위**. 외부 I/O(HTTP, DB write, S3)가 있는 최소 묶음으로 한 step을 구성.
- **엔티티 분해 후에도 원래 step 경계 유지**: 예를 들어 기존 `create-clips-in-db` step 안의 "backend metadata 분기 + S3 fallback + createMany" 로직은 엔티티 호출 1~2개가 있어도 **여전히 한 step으로 유지**. 엔티티 호출 개수만큼 step을 쪼개지 말 것.
- **read-only 조회는 step 밖 가능**: 순수 read(`find-uploaded-file-by-id`)는 `step.run` 외부 호출 허용 (Inngest는 이를 non-deterministic으로 간주하지 않음). 단, **write는 반드시 `step.run` 안에서**.
- `step.run`의 문자열 id는 기존 값을 변경하지 않음 (`check-credits`, `create-clips-in-db`, `deduct-credits`, `set-status-processed` 등). Inngest는 id로 step 실행 상태를 추적하므로 **id 변경은 in-flight 이벤트의 재실행 실패**를 유발.

#### 규칙 R6 — 웹훅 콜백 순서 보존 (코드 가드)

`features/handle-subscription-active`로 옮긴 후 기존 3단계 순서를 가드하기 위해:
- Feature 함수 내부에 **단계 주석과 `// STEP N:` 번호** 고정.
- 가능하면 함수 단일화 대신 `discoverConflict()` → `resolveConflict()` → `applyUpsert()` → `rechargeCredits()`로 **순서가 타입으로 드러나는** 작은 서브함수 분리.
- 단위 테스트 없이도 **코드 리뷰가 순서를 볼 수 있는 구조** 확보.

#### 규칙 R7 — 엔티티 쓰기 API의 테넌트 스코프 필수

현재 코드의 다수 쓰기 호출이 `where: { id, userId }` 형태로 **primary key + 소유자 userId 복합 필터**를 사용해 소유권을 강제한다 (`features/clip/api/index.ts:48-51,76-79,100-105,131-133`, `features/upload/api/index.ts` 다수). 엔티티 CRUD로 단순 분해하면서 시그니처를 `updateStatus(id, status)`처럼 축소하면 **`userId` 필터가 조용히 사라져 cross-tenant 접근 버그**(다른 사용자의 레코드를 조작·조회)가 발생한다.

**규칙**:
- 모든 entity **쓰기 API**(create/update/delete)는 시그니처에 **`userId: string` 인자를 필수**로 받는다. 구현부의 Prisma `where`에 반드시 `{ id, userId }`(또는 unique 복합 키의 해당 소유자 필드)를 포함한다.
- User 엔티티 자신의 쓰기처럼 **대상 테이블이 곧 소유자**인 경우는 `id`(= `userId`)만 받아도 된다.
- Polar 웹훅처럼 **소유자 결정자가 외부 식별자**(`polarCustomerId`, `polarSubscriptionId`)인 경우는 외부 식별자를 인자로 받고 `where`에 해당 unique 키를 사용. `userId`를 별도로 요구하지 않는다.
- **읽기 API**도 원칙적으로 `userId` 스코프를 기본으로 둔다. 예외: Inngest 워커의 `check-credits` step은 "`uploadedFileId` → 소유자 역추적"이 목적이므로 `userId` 없는 `findUploadedFileWithOwner(id)` 형태를 허용(함수명으로 의도 노출).
- 엔티티 API에서 `findUnique`의 `where`가 **복합 필터**(예: `{ id, userId }`)일 때 기본 동작은 **Prisma 4.5+의 extended unique filter로 `findUniqueOrThrow`를 그대로 유지**하는 것이다. 현 프로젝트의 Prisma schema에는 `Clip`·`UploadedFile`에 `@@unique([id, userId])`가 **존재하지 않음**에도 불구하고 `db.clip.findUniqueOrThrow({ where: { id, userId } })`가 TS 컴파일을 통과하고 있는 이유가 이 확장 문법이다 (`id`가 단독 unique면 `userId`를 추가 필터로 받음). 따라서 entity API로 옮길 때도 **동일 시그니처·동일 호출을 유지**하여 Prisma가 던지는 `PrismaClientKnownRequestError(code: "P2025")` / `NotFoundError`를 보존한다.
- **Prisma 버전 전제 명시 (P12 신설)**: 위 "extended unique filter"는 Prisma 5.0에서 GA된 기능이며, 본 프로젝트는 `@prisma/client@^6.19.1`이므로 현재 보장된다. 향후 Prisma major 업그레이드(특히 downgrade 시나리오, 또는 다른 ORM으로의 이전) 시 이 동작이 사라지면 entity API의 `findUniqueOrThrow({ where: { id, userId } })` 호출이 컴파일 실패 또는 런타임 에러 계약 변경을 일으킨다. `docs/conventions/fsd-architecture-guidelines.md`에 "entity API는 Prisma `extendedWhereUnique` GA 동작을 전제하며, Prisma 업그레이드/다운그레이드 시 회귀 감시 지점으로 본다"는 한 줄을 남긴다. Phase 4 문서 갱신 체크리스트에 포함.
- **`findFirst` + null-throw 전환은 TS가 실제로 차단할 때만** 수행한다 (`tsc` 에러가 재현되는 경우에 한함). 임의 전환 시 다음 회귀가 발생한다:
  - 에러 타입이 `PrismaClientKnownRequestError`에서 일반 `Error`로 바뀌어 `instanceof` 분기/로그 포맷이 어긋난다.
  - Inngest `try/catch → set-status-failed` 경로의 에러 메시지 문자열이 바뀌어 대시보드·모니터링의 문자열 매칭이 깨질 수 있다.
  - R7 본문의 "테넌트 스코프 회귀 스모크" 기대 동작(유저 B 세션으로 유저 A id 호출 시 `NotFoundError`)이 일반 `Error`로 바뀌어 검증 기준이 변한다.
- 전환이 불가피한 경우에만 엔티티 API 이름에 `OrThrow` 접미사를 붙이고, 내부에서 `throw new Error(...)` 대신 **`throw new Prisma.PrismaClientKnownRequestError("...", { code: "P2025", clientVersion: ... })` 또는 본 프로젝트 전용 `NotFoundError` 클래스**를 던져 호출처의 에러 분기 계약을 명시적으로 유지한다. Phase 1 체크리스트에 "전환한 경우 에러 타입 보존 증명" 항목을 추가한다.

**신설 entity API 시그니처 예시**:
```ts
// entities/uploaded-file/api/update-uploaded-file-status.ts
export async function updateUploadedFileStatus(
  id: string,
  userId: string,            // ← 필수. 생략하면 cross-tenant 버그
  status: ProcessingStatus,
): Promise<void> {
  await db.uploadedFile.update({
    where: { id, userId },   // ← 복합 필터 보존
    data: { status },
  });
}

// entities/clip/api/delete-clip-by-id-or-throw.ts
export async function deleteClipByIdOrThrow(id: string, userId: string): Promise<void> {
  const clip = await db.clip.findFirst({ where: { id, userId }, select: { id: true } });
  if (!clip) throw new Error(`Clip not found: ${id}`);
  await db.clip.delete({ where: { id: clip.id } });
}
```

Phase 1 체크리스트에 이 규칙 검증 항목을 추가한다(아래 체크리스트 참조).

#### 규칙 R8 — 트랜잭션 경계의 entity API 시그니처 계약 (신설, P7 보완)

현재 `features/upload/api/index.ts:162-165,203-209`는 **배열 `db.$transaction([...])`** 패턴을 사용한다.

```ts
// 현행
await db.$transaction([
  db.clip.deleteMany({ where: { uploadedFileId } }),
  db.uploadedFile.delete({ where: { id: uploadedFileId, userId } }),
]);
```

배열 인자는 **`PrismaPromise<T>`(미실행 쿼리 빌더)**만 받는다. 한편 Phase 1 체크리스트는 "엔티티 API가 완결된 `Promise<void>`를 반환"을 요구한다. 두 요구를 동시에 충족할 수 없어 구현자가 임의 판단하면 Phase 1 "런타임 동작 변경 없음"과 R7 테넌트 스코프 양쪽에 회귀가 발생한다. **Phase 1 시작 전에 아래 확정 경로(T-A)를 고정**한다.

**확정 경로 T-A (권장) — 인터랙티브 트랜잭션 + entity API `tx` 주입**

- 배열 `$transaction([...])`을 **인터랙티브 `$transaction(async (tx) => { ... })`** 로 전환.
- 트랜잭션에 참여하는 entity API는 **선택적 `tx?: Prisma.TransactionClient` 인자를 마지막 위치**에 받아 내부에서 `(tx ?? db).<model>.<op>(...)` 형태로 호출.

  ```ts
  // entities/uploaded-file/api/delete-uploaded-file-by-id.ts
  import "server-only";
  import type { Prisma } from "generated/prisma";
  import { db } from "~/server/db";

  export async function deleteUploadedFileById(
    id: string,
    userId: string,                       // R7 테넌트 스코프 보존
    tx?: Prisma.TransactionClient,
  ): Promise<void> {
    await (tx ?? db).uploadedFile.delete({ where: { id, userId } });
  }
  ```

- Feature는 `tx`를 주입해 한 트랜잭션 경계 안에서 여러 entity API를 조합한다.

  ```ts
  // features/upload/api/delete-uploaded-file-with-clips.ts
  await db.$transaction(async (tx) => {
    await deleteClipsByUploadedFile(uploadedFileId, userId, tx);
    await deleteUploadedFileById(uploadedFileId, userId, tx);
  });
  ```

- `maxWait`·`timeout`은 Prisma 기본값 유지. 배열 → 인터랙티브 전환의 round-trip 오버헤드는 파일 삭제·리프로세스 호출 빈도상 무시 가능.

**비권장 경로 — 채택하지 않음**

- **T-B (엔티티가 `PrismaPromise` 반환)**: Phase 1 체크리스트 "완결된 Promise 반환"과 충돌. 엔티티 API 시그니처 이질성 유발. 채택 금지.
- **T-C (트랜잭션 대상에서만 feature가 `db.*` 직접 호출)**: ESLint Block B 허용 목록에 entity-equivalent CRUD가 중복 배치되어 "entity가 단일 테이블 CRUD 소유" 규칙의 예외 면적이 커짐. 채택 금지.

**`tx` 주입 규칙 세부**

- `tx` 인자는 **항상 마지막 위치**, 타입은 `tx?: Prisma.TransactionClient`, 기본값 `undefined`.
- 호출부가 `tx`를 넘기지 않으면 `db`로 단독 실행 — 기존 호출 경로와 동일 동작.
- entity API는 **자체에서 `db.$transaction`을 열지 않는다**(인터랙티브 트랜잭션 중첩 금지).
- 동시 실행 중인 두 트랜잭션의 `tx`를 교차 주입 금지(Prisma 런타임 에러).

**raw SQL 경로의 `tx` 전파 (P13 신설, R3 연계)**

R3에서 규정한 `entities/user/api/decrement-credits-floor-zero.ts`의 `db.$executeRaw` 경로는 Feature가 "여러 엔티티 쓰기 + 크레딧 감산"을 한 트랜잭션 경계로 묶을 때 함께 참여해야 한다. R8의 `tx` 주입 패턴을 raw SQL에도 동일하게 적용한다.

```ts
// entities/user/api/decrement-credits-floor-zero.ts
import "server-only";
import type { Prisma } from "generated/prisma";
import { db } from "~/server/db";

// 이 함수만 raw SQL 사용 허용 (R3). `GREATEST(credits - n, 0)`으로
// 음수 방지 원자 감산을 DB 엔진에 위임 — Prisma `decrement`는 음수 허용.
export async function decrementCreditsFloorZero(
  userId: string,
  amount: number,
  tx?: Prisma.TransactionClient,
): Promise<void> {
  await (tx ?? db).$executeRaw`
    UPDATE "User" SET "credits" = GREATEST("credits" - ${amount}, 0)
    WHERE "id" = ${userId}
  `;
}
```

Phase 1에서는 Inngest의 `deduct-credits` step이 이 함수를 `tx` 없이 호출(step 경계가 곧 retry 경계이므로 단독 실행). Phase 3에서 Feature가 `db.$transaction(async (tx) => { ... })` 내부에서 이 함수를 `tx` 주입해 호출할 수 있다. Prisma의 `$executeRaw`는 `TransactionClient`에서도 동일 시그니처를 갖는다.

**외부 I/O는 트랜잭션 외부 (P14 신설, T-A 보완)**

T-A 예시는 entity API 2개를 `$transaction(async (tx) => ...)` 내부에 배치하지만, 현재 `deleteUploadedFileWithClips`·`deleteClip`·`reprocessUploadedFile` 구현은 **S3 삭제를 DB 트랜잭션 외부에 두고 있다**(`features/upload/api/index.ts:158-165`의 호출 순서: `removeGeneratedClipsFromS3 → db.$transaction([...])`). 이 순서는 의도적이며 보존해야 한다.

**규칙**:

- `db.$transaction(async (tx) => { ... })` **콜백 내부에는 DB 쿼리만** 둔다. S3/Polar/Inngest `send`/HTTP fetch 등 외부 네트워크 I/O는 콜백 외부에 배치한다.
- 외부 I/O를 콜백 내부에 넣으면 **DB 커넥션이 수 초~수십 초 동안 홀드**되어 커넥션 풀 고갈·Neon serverless 타임아웃(현 프로젝트는 `@prisma/adapter-neon` 사용) 등의 장애로 전파된다.
- "외부 I/O → DB 트랜잭션" 순서(현행)는 "S3 정리는 성공했지만 DB 삭제가 롤백" 상황에서 orphan S3 객체가 남을 수 있으나, 반대 순서("DB 트랜잭션 → S3")는 "DB는 삭제됐지만 S3 호출이 네트워크 실패"로 orphan이 남을 수 있어 어느 쪽도 완벽 원자성은 아니다. 현행 순서는 "DB 레코드 없이 S3만 있는 상태는 주기적 스윕으로 탐지 가능, 반대는 사용자 UX에서 감지 불가"라는 운영 비대칭을 근거로 한다 — Phase 1에서 이 순서를 **무변경 유지**.
- T-A 전환 예시 코드를 Phase 1 구현자에게 제시할 때는 아래 형태로 **S3 호출을 콜백 외부에 명시적으로 둔 before/after**로 제공한다.

```ts
// features/upload/api/delete-uploaded-file-with-clips.ts (after)
const uploadedFile = await findUploadedFileS3Key(uploadedFileId, userId);
if (!uploadedFile) return failure("Uploaded file not found");

// ⚠ S3 삭제는 트랜잭션 외부. 현행 순서 보존.
await removeGeneratedClipsFromS3(uploadedFile.s3Key, { includeOriginal: true });

await db.$transaction(async (tx) => {
  await deleteClipsByUploadedFile(uploadedFileId, userId, tx);
  await deleteUploadedFileById(uploadedFileId, userId, tx);
});
```

Phase 1 체크리스트에 "`db.$transaction` 콜백 본문이 DB 호출만 포함(S3·Polar·Inngest `send`·HTTP fetch 0건)" 항목을 추가.

**Phase 1 체크리스트 보강 (아래 Phase 1 체크리스트에도 반영)**

- [ ] `deleteUploadedFileWithClips`·`reprocessUploadedFile`의 `db.$transaction([...])` 배열 호출이 인터랙티브 `db.$transaction(async (tx) => ...)`로 전환됨.
- [ ] 트랜잭션에 참여하는 entity API 시그니처가 `(..., userId, tx?: Prisma.TransactionClient)` 형태이고, 구현부가 `(tx ?? db).<model>.<op>(...)` 패턴을 사용.
- [ ] entity API 내부에 `db.$transaction` 재진입 없음 — `rg -n "\\\$transaction" src/fsd/entities` 결과가 비어 있음.
- [ ] `db.$transaction` 콜백 본문에 외부 I/O(S3·Polar SDK·Inngest `send`·HTTP fetch) 호출이 0건임 — `rg -n "removeGeneratedClipsFromS3\|deleteS3Object\|inngest\.send\|polar\." src/fsd/features/**/api/**` 결과가 트랜잭션 콜백 외부에만 위치.
- [ ] `decrementCreditsFloorZero`가 `(userId, amount, tx?)` 시그니처를 갖고, 내부 `$executeRaw`가 `(tx ?? db).$executeRaw` 패턴 사용.
- [ ] 로컬 스모크: 파일 삭제/리프로세스 흐름이 트랜잭션 롤백 의미를 보존(중간 실패 시 Clip/UploadedFile 부분 커밋 없음).

---

### 3-6. [Low] 문서 부채 정리

`CLAUDE.md` 갱신:
- **`Uses Prisma adapter with SQLite database` → `Uses Prisma adapter with PostgreSQL database`로 교체** (실제 `prisma/schema.prisma:10`의 `provider = "postgresql"` 반영)
- **`Credentials provider with bcrypt password hashing` → `Google OAuth provider (NextAuth.js)`로 교체** (V15 핵심, 실제 `src/server/auth/config.ts:32-36`의 `Google(...)` 단일 provider 반영)
- `Database (Prisma + SQLite)` 섹션 헤더도 `Database (Prisma + PostgreSQL)`로 교체
- `### Server Actions (src/actions/)` 섹션 전체 제거 또는 실제 배치(`src/fsd/features/**/api/`, `src/fsd/shared/api/`) 반영으로 교체 (실재하지 않는 `src/actions/`·`auth.ts`·`s3.ts`·`generation.ts`·`uploaded-files.ts` 경로 기술 제거)
- `entity/` 단수형 및 `auth/model/schemas` 경로 제거 (bcrypt/Credentials 플로우가 없으므로 해당 schemas도 불필요). 새 `entities/` 레이어 목록으로 교체
- "Each slice is self-contained with ui/, model/, constants/ subfolders" → `config/`로 수정 (FSD 표준 세그먼트 반영)
- 신설 `entities/` 레이어와 슬라이스 목록(user·uploaded-file·clip·subscription·order), `~/server/db` 임포트 스코프 규칙, Public API 경유 import 규칙 반영

---

## 📂 목표 디렉토리 구조 (Target Structure)

```
src/fsd/
├── app/                             # (선택) Providers/Global styles
├── pages/
│   ├── dashboard/{ui, model, config, index.ts}
│   ├── home/{ui, model, config, index.ts}
│   └── upload-detail/{ui, model, index.ts}
├── widgets/
│   ├── login-form/{ui, index.ts}             # 기존 유지 (Google OAuth 버튼 UI)
│   ├── clip-display/{ui, model, lib, index.ts}
│   ├── dashboard-header/{ui, model, index.ts}
│   ├── site-footer/{ui, index.ts}
│   ├── site-header/{ui, index.ts}
│   └── uploaded-file-list/{ui, model, index.ts}
├── features/
│   ├── auth/{lib, index.ts}                         # signIn("google") 클라이언트 래퍼 — `"use client"` 필요 (api/ 아님)
│   ├── billing/{ui, model, api, config, index.ts}   # constants→config
│   ├── clip/{api, model, index.ts}                  # processVideo(조합 행위)만 잔존
│   ├── handle-subscription-active/{api, index.ts}   # 웹훅 조율 Feature (신설)
│   ├── handle-subscription-updated/{api, index.ts}
│   ├── handle-subscription-canceled/{api, index.ts}
│   ├── handle-order-created/{api, index.ts}
│   └── upload/{ui, api, index.ts}                   # deleteUploadedFileWithClips 등 조합 행위
├── entities/                                         # ← 전면 신설
│   ├── user/
│   │   ├── api/                                     # 범용 CRUD + decrement-credits-floor-zero(raw SQL, R3)
│   │   │   └── queries/                             # 페이지 전용 집계 쿼리 (R2)
│   │   ├── model/{types.ts}
│   │   └── index.ts
│   ├── uploaded-file/{api, model, index.ts}         # CRUD만 (S3 조합은 features/upload, R4)
│   ├── clip/{api, model, index.ts}                  # CRUD만 (S3 조합은 features/clip|upload, R4)
│   ├── subscription/{api, model, index.ts}
│   └── order/{api, model(+queries), index.ts}
└── shared/
    ├── api/                         # auth-guard, polar, result, s3
    ├── config/                      # constants.ts (전역)
    ├── lib/                         # seo, trigger-download, utils, use-play-url
    └── ui/                          # atoms, error-display
    # ❌ types/ 제거   # ❌ hooks/ 제거
```

### Before / After 비교 (의존성 흐름)

```
[Before]
app/page.tsx ──▶ db.user.*                             (도메인 쿼리 직접 소유 ❌)
shared/hooks/useClipPlayUrl ──▶ features/clip/api       (역방향 ❌)
app/api/webhooks/polar/route.ts ──▶ db.subscription.*   (웹훅 핸들러가 다중 엔티티 직접 조율 ❌)
inngest/functions.ts ──▶ db.uploadedFile/clip/$executeRaw (워커가 비즈니스 쿼리 직접 소유 ❌)

[After]
app/page.tsx ──▶ pages/home ──▶ entities/user                                   ✅
widgets/clip-display ──▶ shared/lib/use-play-url (fetcher 주입) + features/clip/api
   └─ 3-2 경로 A: useClipPlayUrl 래퍼 제거, 호출처가 usePlayUrl + getClipPlayUrl 직접 결합  ✅
   └─ 3-2 경로 B: features/clip/model/use-clip-play-url (같은 슬라이스 내 api 참조)          ✅
app/api/webhooks/polar/route.ts ──▶ features/handle-subscription-active
   └─ features ──▶ entities/subscription + entities/user + entities/order      ✅
inngest/functions.ts (step.run id·경계·concurrency 유지, 반환값 primitive 유지)
   └─ entities/uploaded-file + entities/clip + entities/user                    ✅
```

---

## 🗺️ 마이그레이션 단계 (Migration Phases)

각 Phase는 **독립 PR로 배포 가능**하며 이전 Phase가 완료된 후 진행합니다.

### Phase 0 — 패키지 선행 설치 (P11 신설, Blocker)

Phase 1/3의 `import "server-only";` / `import "client-only";` 가드는 해당 패키지가 프로젝트의 dependencies에 **명시적으로 존재**해야 동작한다. 현재 프로젝트 상태(`npm ls` 기준):

- `server-only`: **미설치** — Next.js 15.5.7의 direct dependency가 아니므로 `import "server-only";` 추가 시 **빌드 즉시 실패**.
- `client-only`: `styled-jsx@5.1.6` → `next`의 **transitive dep(0.0.1)만 존재** — styled-jsx가 떨어지는 미래의 Next 업그레이드 시 사라질 수 있어 불안정.

**작업**:

```bash
npm install server-only client-only
```

**검증 체크리스트**:

- [ ] `npm ls server-only` 결과가 `ai-podcast-clipper-frontend` 직속 의존성으로 표시됨.
- [ ] `npm ls client-only` 결과가 `ai-podcast-clipper-frontend` 직속 의존성으로 표시됨 (transitive 외에 top-level에도 표시).
- [ ] `package.json`의 `dependencies`에 두 패키지가 명시됨.

Phase 0 완료 후 Phase 1 진입 가능. 이 PR은 한 줄 스크립트 + `package.json`/`package-lock.json` 변경만 포함하므로 리뷰 비용이 거의 없다.

### Phase 1 — `entities/` 레이어 신설 + shared 역방향 의존 제거 (Critical)

1. `src/fsd/entities/` 디렉토리 생성 및 5개 슬라이스 뼈대 구성. `queries/` 서브 세그먼트(R2)는 필요 시점에만 생성.
2. `src/inngest/functions.ts`의 Prisma 호출을 `entities/uploaded-file/api`, `entities/clip/api`, `entities/user/api`로 이전. **`step.run` id와 경계는 변경 금지**(R5). credits 감산은 `entities/user/api/decrement-credits-floor-zero.ts`(R3)로 이전하되 내부는 기존 `db.$executeRaw` 그대로 유지.
3. `src/app/dashboard/{page,layout}.tsx`, `src/app/page.tsx`의 도메인 쿼리는 **관계 select를 유지한 채** `entities/user/api/queries/*`로 이전(R1, R2). 필드 재편집을 하지 않음으로써 반환 타입 드리프트 회피.
4. `src/app/api/portal/route.ts`, `src/app/api/webhooks/polar/route.ts`의 Prisma 호출을 해당 엔티티 API로 위임. 웹훅 핸들러는 아직 핸들러 내부에 로직을 유지(Phase 3에서 feature 승격). 엔티티 API 호출만 교체.
5. `shared/hooks/usePlayUrl.ts` → `shared/lib/use-play-url.ts`로 이전. `shared/hooks/useClipPlayUrl.ts`는 **3-2 경로 A(권장)에 따라 삭제**하고 호출처를 `usePlayUrl(clipId, getClipPlayUrl)` 직접 호출 패턴으로 전환. 래퍼를 유지하려면 경로 B대로 `features/clip/model/use-clip-play-url.ts`로 이전. **`entities/clip/model/`로는 이전하지 않는다** (V1과 동형의 업워드 import 발생 방지).
6. `features/clip/api`의 **순수 CRUD 부분만** `entities/clip/api`로 이전(R4). `getClipPlayUrl`·`deleteClip`은 feature에 유지하고, 내부의 `db.clip.*` 호출만 엔티티 API로 대체.
7. `features/upload/api`의 `deleteUploadedFileWithClips`·`reprocessUploadedFile` 내부 `db.*` 호출도 엔티티 API 경유로 교체. `db.$transaction([...])` 경계는 feature가 계속 소유.

**검증 체크리스트** (타입·런타임 동치성 증명)

- [ ] `npm run check` 통과 (ESLint + tsc)
- [ ] 엔티티 API 반환 타입이 기존 Prisma `select`된 형태와 **타입 레벨로 동일**한지 `satisfies`/`Prisma.<Model>GetPayload<typeof select>`로 증명 — 특히 `dashboard/page.tsx`의 `formattedFiles.map` 입력(`_count.clips`, `uploadedFiles[]` 중첩), `dashboard/layout.tsx`의 `{email, credits, image}`, 웹훅의 `subscription.currentPeriodEnd` Date, `getBillingData`의 `user + subscription? + orders[]` 전체
- [ ] **관계 쿼리 보존**(R1): `getBillingData`, `dashboard/page.tsx`의 `user+uploadedFiles+_count`는 한 번의 `findUnique`로 유지. 3회 쿼리로 분해하지 말 것. 쿼리 수를 before/after 대조(예: Prisma `log: ['query']` 일시 활성화)
- [ ] Inngest `step.run()` **id와 경계 유지**(R5): `check-credits`, `set-status-processing`, `send-to-modal`, `wait-for-modal-result`, `create-clips-in-db`, `deduct-credits`, `set-status-processed`, `set-status-no-credits`, `set-status-failed` 9개 step id 무변경. 엔티티 write 호출은 반드시 `step.run()` 내부
- [ ] Inngest concurrency `{ limit: 1, key: "event.data.userId" }` 보존 (Phase 1에서 이 설정에 손대지 않음)
- [ ] Polar 웹훅 `onSubscriptionActive`의 3단계 로직(existingByPolarId/existingByUser 감지 → 구 구독 삭제 → upsert) 순서 보존 — Phase 1에서는 핸들러 내부에 그대로 두고, Phase 3에서 feature 승격 시 R6의 서브함수 분리 적용
- [ ] `db.$executeRaw` credits 감산(`GREATEST(credits - n, 0)`)은 R3에 따라 **`entities/user/api/decrement-credits-floor-zero.ts` 내부에서만** raw SQL 유지. features/워커에서 raw 직접 호출 금지
- [ ] `deleteUploadedFileWithClips`의 `db.$transaction([clip.deleteMany, uploadedFile.delete])` 원자성 보존 — Feature가 트랜잭션 경계를 소유하며, 엔티티 API는 개별 쿼리 빌더를 반환하는 형태가 아닌 **완결된 Promise**를 반환. 즉 feature가 트랜잭션을 쓰려면 `db.$transaction` 직접 사용 허용(예외)
- [ ] **엔티티 API의 예외 의미 보존**: 엔티티 API는 기존 `db.*` 호출과 동일한 예외 동작(예: `findUniqueOrThrow`의 `NotFoundError`, unique 제약 `P2002`)을 **그대로 bubble-up** 해야 함. 중간에서 catch 후 void로 흡수하지 말 것. 이는 Inngest `retries: 1` 정책 및 `try/catch → set-status-failed` 경로가 기존 동작을 그대로 유지하기 위한 전제이며, Caveats의 "런타임 동작 변경 없음" 조건에 해당
- [ ] **Inngest `step.run()` 반환값 JSON 직렬화 안전성**: 현재 9개 step의 반환값은 모두 primitive(`{userId, credits, s3Key}`, `{clipsFound}` 등)만 포함한다. entity API를 도입한 뒤에도 **Prisma 객체·Date·Map·Set을 `step.run()` 반환으로 넘기지 않도록** 한다. Inngest v3는 Date를 ISO 문자열로 직렬화하지만 역직렬화는 여전히 문자열이 되므로 TypeScript 타입과 런타임 값이 어긋나는 silent data corruption이 발생한다. Entity API가 Prisma 타입을 반환하더라도 **step.run 내부에서 필요한 primitive 필드만 구조분해하여 반환**한다. 예: `const { userId, credits } = await findUserForWorker(id); return { userId, credits };`
- [ ] **entity api/** 파일 상단에 `"use server"`를 **추가하지 않았는지** 확인. entity API는 plain ES module로 유지한다 (3-1 "`use server` 지시어 배치 규칙" 참조). client-callable이 되어야 하는 경로는 feature가 소유한다
- [ ] **entity api/ 파일 `server-only` 가드**(P2): 모든 `src/fsd/entities/**/api/**/*.ts` 파일 1행에 `import "server-only";`가 존재. `rg -L -g 'src/fsd/entities/**/api/**/*.ts' '^import "server-only";'` 결과가 비어 있어야 함(모든 파일이 매치). 누락 파일이 client component에 실수 import되면 Prisma client가 client 번들에 유출된다
- [ ] **Prisma 에러 타입 보존**(R7 보완): `findUniqueOrThrow` → `findFirst` 전환은 TS가 실제로 차단할 때만 수행. 전환한 파일 목록을 PR 설명에 명시하고, 각 파일에서 `throw`되는 에러 타입이 원본 `PrismaClientKnownRequestError(code: "P2025")` 계약을 유지하는지 증명(테스트 또는 수동 reproduction). 전환 0건이 기본 상태
- [ ] **DTO 매핑 의무**(R2 P6 보완): 신설 `entities/**/api/queries/*.ts` 각 파일이 Q1(domain DTO 매핑) 또는 Q2(`// @fsd-prisma-type-passthrough` 주석) 중 하나를 충족. Q2 사용 시 주석 없으면 리뷰 reject
- [ ] **테넌트 스코프 필터 보존**(R7): 모든 entity 쓰기 API의 시그니처에 `userId: string` 인자가 존재하고, 구현부의 Prisma `where`에 `{ id, userId }`(또는 외부 식별자 기반 unique 키)가 포함되어 있음을 확인. 교체 전후 `rg -n "where:\s*\{[^}]*userId" src/fsd/features src/inngest src/app` 결과가 동등 또는 확장(엔티티 API 이동분만큼 증가)인지 비교. 특히 `features/clip/api/index.ts`·`features/upload/api/index.ts`의 기존 `where: { id, userId }` 호출 전수 대응을 표로 정리해 누락 방지
- [ ] **테넌트 필터 회귀 스모크**: 로컬에서 유저 A가 업로드한 파일의 `id`를 유저 B 세션으로 `deleteUploadedFileWithClips`/`deleteClip` 호출 시 **Prisma가 0행 매치로 실패**하는지 확인. `findUniqueOrThrow` 경로라면 `NotFoundError`, `findFirst` 경로라면 호출자가 `null` 체크로 throw. 이전과 동일한 에러 경로를 유지해야 함
- [ ] `UploadedFileSummary` 타입 canonical **이전은 Phase 2로 이관** (P10 보완). Phase 1에서는 기존 canonical(`widgets/uploaded-file-list/model/types.ts`)을 **그대로 유지**하고, entity API 반환 shape이 canonical 타입과 **구조적으로 동치임을 `satisfies` 또는 `Prisma.<Model>GetPayload`로 증명**하는 선에서 마무리. widgets·pages의 `export type` re-export 체인 정리, `src/app/dashboard/page.tsx`의 `formattedFiles.map` 타입 주석, entities로의 canonical 이전은 **Phase 2 step 1-1에서 일괄 수행**. 이렇게 분리하면 Phase 1 PR이 "DB 경로 교체" 단일 관심사로 좁아져 회귀 영향 범위가 명확해진다
- [ ] 수동 회귀: 업로드 → Inngest 처리 → 클립 생성/삭제 → 리프로세스 → 빌링 구독 → 포털 → 웹훅 수신 6개 플로우를 순서대로 실행하여 각 엔티티 API 호출 경로 검증

**Phase 1 sub-PR 분할 옵션 (P16 신설)**

Phase 1 단일 PR은 entities 5개 신설 + Inngest 전체 전환 + 웹훅/포털 route 2~3개 + dashboard page/layout + features/clip|upload 내부 교체 + 체크리스트 15+개를 포함해 **리뷰 부담이 크다**. "각 Phase 독립 배포" 원칙은 유지하되, Phase 1 내부를 아래와 같이 **엔티티 슬라이스별 sub-PR**로 나누어 배포할 수 있다. 각 sub-PR은 "호출 경로 교체, 동일 동작" 단일 관심사를 유지한다.

| sub-PR | 범위 | 영향 파일 |
|--------|-----|---------|
| 1.a | `entities/user` 신설 + 페이지/route/워커의 `db.user.*` 경로 교체 | `src/app/{dashboard/page,dashboard/layout,page}.tsx`, `src/app/api/portal/route.ts`, `src/app/api/webhooks/polar/route.ts`의 user 쿼리, `src/inngest/functions.ts`의 credits 감산 |
| 1.b | `entities/uploaded-file` 신설 + `features/upload/api`의 `db.uploadedFile.*` 경로 교체 | `src/fsd/features/upload/api/index.ts`, `src/inngest/functions.ts`의 uploadedFile 쿼리 |
| 1.c | `entities/clip` 신설 + `features/clip/api`·Inngest의 `db.clip.*` 경로 교체. R8의 인터랙티브 트랜잭션 전환 (1.b와 함께 배포해야 `deleteUploadedFileWithClips` 무결성 유지) | `src/fsd/features/clip/api/index.ts`, `src/fsd/features/upload/api/index.ts`의 트랜잭션 래퍼, `src/inngest/functions.ts`의 clip 쿼리 |
| 1.d | `entities/subscription` + `entities/order` 신설 + Polar 웹훅의 `db.*` 경로 교체 (핸들러 내부 로직은 유지, entity 호출만 교체) | `src/app/api/webhooks/polar/route.ts`, `src/fsd/features/billing/api/index.ts` |
| 1.e | shared 역방향 의존 해소 (`shared/hooks/usePlayUrl` → `shared/lib/use-play-url`, `useClipPlayUrl` 삭제 또는 이전) | `src/fsd/shared/hooks/**`, `src/fsd/widgets/clip-display/**`, 호출처 |

**sub-PR 의존성**: 1.b와 1.c는 동시 배포(트랜잭션 무결성). 1.a/1.d/1.e는 서로 독립. 1.a~1.d는 Phase 1 완료 조건인 "모든 체크리스트 통과" 시점에 수렴하도록 마지막 sub-PR에서 통합 회귀 테스트를 수행한다.

단일 PR 배포를 선호하는 경우 위 분할 없이 Phase 1 전체를 묶어도 되며, 이는 리뷰·롤백 정책에 따른 선택이다.

### Phase 2 — 세그먼트 네이밍 정리 + Public API 표준화 (High)

1. `shared/types/processing-status.ts` 삭제 → `entities/uploaded-file/model/processing-status.ts`로 이전, 참조처 5곳(`pages/dashboard/ui`, `pages/upload-detail/**`, `app/dashboard/page.tsx` 등) 갱신.
1-1. **`UploadedFileSummary` canonical 이전 및 Q1 DTO 매핑 전환 (P9·P10 보완)**: Phase 1에서 유보된 shape 정리를 한 PR로 일괄 처리.
   - Canonical을 `widgets/uploaded-file-list/model/types.ts` → `entities/uploaded-file/model/types.ts`로 이전. widgets/pages의 기존 정의는 `export type { UploadedFileSummary } from "~/fsd/entities/uploaded-file"` re-export로 교체.
   - `entities/user/api/queries/find-user-for-dashboard.ts` 등 Phase 1에서 `// @fsd-prisma-type-passthrough: phase-1-shape-parity` 주석으로 Q2 표기된 `queries/` 파일을 **Q1(domain DTO 매핑)** 으로 전환. 예: `_count.clips` → `clipCount` 평탄화.
   - `src/app/dashboard/page.tsx`의 `formattedFiles.map`에서 `file._count.clips` 접근자를 `file.clipCount`로 교체하고 결과에 `: UploadedFileSummary[]` 타입 주석 추가.
   - `rg -n "phase-1-shape-parity" src/` 결과가 비어 있어야 Phase 2 완료 조건 충족.
2. `shared/hooks/`, `pages/dashboard/hooks/` 삭제, 내용물 이전.
3. `features/billing/constants/`, `pages/dashboard/constants/`, `pages/home/constants/` → `config/`로 리네이밍. 내용이 실제 "설정/피처 플래그/전역 상수" 성격이 아니면 해당 슬라이스의 `model/types.ts` 또는 `lib/`로 재분류 판단.
3-1. **타입 재배치**: `features/billing/constants/index.ts`에 정의된 `PlanTier`, `ProductIds` 타입을 `features/billing/model/types.ts`로 이동. `config/`에는 런타임 상수(`PLAN_TIERS`, `POLAR_PRODUCT_IDS`, `getProductIds` 등)만 잔존.
3-2. **Default export → Named export 변환 + import 사이트 전수 탐색**:
   - **Step A — 접근 방식 선택** (둘 중 하나, 권장은 배럴 패턴):
     - **(권장) 배럴 패턴**: `ui/index.tsx`의 default export는 **유지**하고, 슬라이스 루트 `index.ts`에서만 `export { default as <Name> } from "./ui"` 형태로 re-export. 슬라이스 내부의 기존 `import Foo from "./ui"` 자기 참조는 건드리지 않아도 됨 → **수정 범위가 슬라이스 외부 import 사이트로만 국한**. diff 최소.
     - **(대안) 완전 named 변환**: `ui/index.tsx`를 `export function <Name>`로 변환. 슬라이스 **내부 자기 참조**(예: widget 내부에서 다른 widget을 default import하는 경우, page가 여러 widget을 default import하는 경우)까지 모두 named import로 교체 필요.
   - **Step B — import 사이트 전수 탐색** (어느 접근이든 필수, step 4 이전에 수행):
     - ripgrep sweep 1: `rg -n 'import\s+\w+\s+from\s+"~/fsd/[^"]+/(ui|model|api|config|lib)"' src/` — `src/fsd/**` 내부 slice간 default/named import와 `src/app/**` 진입점 import를 모두 나열.
     - ripgrep sweep 2: `rg -n 'import\s+\w+\s+from\s+"\.\./(?:\.\./)*ui"' src/fsd/` — 상대경로 default import(슬라이스 내부 자기 참조).
     - 결과 파일 전체를 변환 대상 목록으로 고정. 제안서에 기술된 `src/app/**`의 4곳(3-4 "import 정리 (V11 해소)" 섹션)은 **하한선**이며 실제 목록은 sweep 결과로 확정.
     - 변환 후 `npm run typecheck`가 TS2613("Module has no default export") / TS2305("Module has no exported member") 없이 통과해야 **step 4(슬라이스 루트 `index.ts` 생성)로 진행 가능**.
   - **권장 접근(배럴 패턴) 선택 시 실제 수정 대상**: 통상 `src/app/**`의 진입점 4곳 + slice간 default import 수곳(sweep으로 확인).
4. 모든 슬라이스에 루트 `index.ts` 생성. 현재 스코프 기준 12개(widgets 6 + features 3 + pages 3), Phase 1에서 신설된 entities 5개 포함 시 17개, Phase 3-5에서 `features/clip`가 `features/upload`에 흡수되면 -1. **Public API 작성 시 실제 파일·심볼 존재를 확인한 뒤 export** (V11 예시의 경로 불일치, 함수명 오기재 재발 방지 — 예: `getBillingData` vs `getBillingPageData`).
5. 세그먼트 내부 직접 import를 슬라이스 루트 import로 일괄 교체. **`src/app/**` 진입점 파일(`page.tsx`, `layout.tsx`, `route.ts`)의 default import도 이 단계에서 named import로 함께 교체**한다(위 "import 정리 (V11 해소)" 섹션의 4곳 참조).
5-1. **인트라 슬라이스 자기참조 정리**(V11b): 같은 슬라이스 내 `~/fsd/features/billing/<segment>` 형식 참조는 상대경로(`../config`, `./types`)로 교체. 일괄 codemod 스크립트 또는 수동 치환.
6. **권장**: `steiger` 도입하여 CI에서 경계 검증. **"설정 최소" 대신 R2/R7/Phase 1~2 interim 상태를 수용하는 최소 설정 파일**을 함께 커밋한다. steiger 기본 ruleset은 FSD 표준을 그대로 강제하므로, R2 예외 경로·Phase 1~2의 진입점 interim 상태와 충돌해 CI가 실패한다.

   ```ts
   // steiger.config.ts (프로젝트 루트, 플러그인 API는 steiger 버전에 맞춰 조정)
   import { defineConfig } from "steiger";
   import fsd from "@feature-sliced/steiger-plugin";

   export default defineConfig([
     ...fsd.configs.recommended,
     {
       // R2 예외 (영구): 기본 전략(Prisma.<Model>GetPayload)으로 cross-entity 타입 의존을 회피한다.
       // 그래도 불가피한 경우에만 이 경로의 forbidden-imports를 해제.
       files: ["src/fsd/entities/**/api/queries/**"],
       rules: {
         "fsd/forbidden-imports": "off",
       },
     },
     {
       // 3-4 "Public API surface 이원화" 예외 (영구, P15 신설):
       // `features/*/index.ts` 배럴은 `"use server"` 제약으로 server action을 re-export할 수 없어
       // server action의 공식 import surface를 `~/fsd/features/<slice>/api`로 둔다.
       // 이 import 패턴을 steiger의 public-api 룰이 "slice 내부 세그먼트 직접 참조"(V11a 유형)로
       // 오탐하지 않도록 `features/*/api` 경로를 public-api 규칙에서 제외한다.
       // (widgets·pages·entities는 `"use server"` 파일을 포함하지 않으므로 이 예외 불필요.)
       files: ["src/fsd/features/*/api/**"],
       rules: {
         "fsd/public-api": "off",
       },
     },
     {
       // Phase 1~2 interim (한시적): 진입점(웹훅/route/워커)이 entity를 여러 개 직접 조합하는 것을 허용.
       // 3-1의 "진입점은 feature의 조합 함수만 호출" 규칙은 Phase 3 완료 시점에 발효.
       // Phase 3 완료 후 이 블록을 **삭제**해 규칙을 완전 활성화.
       files: [
         "src/app/api/webhooks/**",
         "src/app/api/portal/**",
         "src/inngest/functions.ts",
       ],
       rules: {
         "fsd/public-api": "warn",
         "fsd/forbidden-imports": "warn",
       },
     },
   ]);
   ```

   위 설정에서 **첫 번째·두 번째 예외 블록은 영구**(R2 공식 예외, 3-4 Public API 이원화 예외), **세 번째 예외 블록은 한시적**(Phase 3에서 제거)이다. 각 블록에 주석으로 수명을 명시해 향후 삭제 대상이 혼동되지 않도록 한다.
7. **추가**: ESLint `no-restricted-imports`로 `~/server/db` 임포트 화이트리스트 적용 — `entities/**/api/**`, `server/auth/**`, 그리고 Caveats에서 예외로 허용한 `features/**/api/**`의 **트랜잭션 래퍼 파일**(예: `features/upload/api/delete-uploaded-file-with-clips.ts`, `features/upload/api/reprocess-uploaded-file.ts`) 외 차단. 현재 프로젝트는 `eslint.config.js`가 `tseslint.config(...)` flat config 형태이므로, 아래 **두 개의 config 원소를 flat config 배열에 순차 append**한다.

   **P5 보완 — `ignores` 대신 rule-level override 사용**: 이전 예시는 허용 파일 목록을 `ignores`에 두었으나, flat config의 `ignores`는 해당 config 블록 **전체**를 그 파일에 비활성화한다. 향후 이 블록에 다른 rule(예: `no-restricted-syntax`, persona 전용 규칙)이 추가되면 허용 파일들이 그 rule까지 함께 skip해 **의도치 않은 규칙 누수**가 발생한다. 따라서 "광범위하게 rule을 켜는 블록" 다음에 "허용 파일만 그 rule을 끄는 블록"을 두어 **override로 정밀 제어**한다.

   ```js
   // eslint.config.js 에 추가되는 flat config 원소 (개념 예시, 순서 보존 필수)
   // --- Block A: 전 파일에 규칙 활성화 ---
   {
     files: ["src/**/*.{ts,tsx}"],
     rules: {
       "no-restricted-imports": ["error", {
         paths: [{
           name: "~/server/db",
           message: "Use entities/<domain>/api instead. Transaction wrappers must be explicitly allowed in eslint.config.js.",
         }],
       }],
     },
   },
   // --- Block B: 허용 파일에 한해 해당 rule만 off (override) ---
   {
     files: [
       "src/fsd/entities/**/api/**/*.{ts,tsx}",
       "src/server/auth/**/*.{ts,tsx}",
       // features의 트랜잭션 래퍼만 명시 허용 (목록은 실제 파일 경로로 유지)
       "src/fsd/features/upload/api/delete-uploaded-file-with-clips.ts",
       "src/fsd/features/upload/api/reprocess-uploaded-file.ts",
     ],
     rules: {
       "no-restricted-imports": "off",
     },
   }
   ```

   이렇게 하면 Block A에 나중에 다른 rule을 추가해도 **Block B는 여전히 `no-restricted-imports`만 끄므로** 허용 파일이 새 rule의 적용 대상이 된다. Phase 3에서 웹훅 핸들러를 `features/handle-*`로 승격한 뒤에는 해당 파일도 Block B `files`에 추가해야 할 수 있으므로(예: `features/handle-subscription-active/api/index.ts`가 `db.$transaction`을 사용한다면) 허용 목록은 **파일별로 명시**한다. 디렉토리 와일드카드는 노이즈를 키우므로 entity `api/`와 `server/auth/` 외에는 지양.

   **진입점 규칙(3-1)과의 충돌 방지**: 제안서 3-1은 "진입점은 feature의 조합 함수만 호출"을 규정하지만 Phase 1~2의 웹훅/route/워커는 entity를 직접 조합하는 **interim 상태**다. Phase 2 시점에서는 이 규칙을 ESLint로 강제하지 않고, `~/server/db` 금지 규칙만 활성화한다(`~/server/db` 자체는 진입점이 import하지 않으므로 영향 없음). 진입점이 여러 entity `api/`를 import하는 것에 대한 별도 제약은 **Phase 3 완료 체크리스트 및 steiger 예외 블록 삭제**로 대신한다.

### Phase 3 — Widget/Feature 재분류 (Medium)

1. **V12 재해석 적용**(R4): `widgets/uploaded-file-list/ui/_component/UploadedFileCard.tsx`의 `usePlayUrl(fileId, getOriginalPlayUrl)` 패턴을 그대로 두되, `getOriginalPlayUrl`은 `features/upload/api`에 유지. 별도 코드 변경 없음. 가이드라인 문서에 "Widget → 공용 훅(주입형) → Feature API" 패턴을 명문화.
2. `features/clip/` **슬라이스 유지** (3-5 P4 보완 확정안): `processVideo` 정의를 `features/clip/api/index.ts`에서 `features/clip/api/trigger-clip-generation.ts`로 **같은 슬라이스 내부 이동**. `getClipPlayUrl`·`deleteClip`은 R4에 따라 `features/clip/api/`에 그대로 잔존. 호출처의 import는 슬라이스 루트 Public API(`~/fsd/features/clip`) 경유로 이미 추상화되어 있으므로 파일 이동이 외부에 노출되지 않음. 슬라이스 이름·Public API surface 변경 없음.
3. `features/auth/` 신설 — `signIn("google", { callbackUrl })` 한 줄을 래핑하는 **`features/auth/lib/sign-in-with-google.ts`** (client-side helper, `api/` 아님). 파일 상단 `"use client"` 또는 호출처가 이미 client component이므로 plain client helper로 배치. `widgets/login-form`의 onClick이 이 함수를 호출하도록 변경. **bcrypt·Zod·signup 경로는 건드리지 않음** (애초에 존재하지 않음). `src/app/signup/page.tsx`에 `robots: { index: false, follow: false }` 메타 추가.
4. `src/app/api/webhooks/polar/route.ts`의 핸들러 4개(`onSubscriptionActive/Updated/Canceled`, `onOrderCreated`)를 각각 `features/handle-*/api`로 이전. 웹훅 라우트는 `Webhooks({...})` 등록 + `payload → DTO` 어댑터 + feature 호출만 담당. **Feature 시그니처는 프로젝트 DTO**로 설계해 Polar SDK 타입 결합 차단.
5. 각 `features/handle-*` 함수 내부에 R6의 서브함수 분리 적용(`discoverConflict → resolveConflict → applyUpsert → rechargeCredits`).
6. `src/inngest/functions.ts`의 각 `step.run` 내부를 재검토하여, 여러 entity API를 직접 조합하는 step이 있다면 feature 조합 함수(예: `features/clip-pipeline/api/create-clips-from-modal-response.ts`)로 승격. `step.run` **id와 경계는 R5에 따라 불변** 유지.

**검증 체크리스트** (Phase 3 완료 시점, 3-1의 진입점 규칙 발효 조건)

- [ ] `src/app/api/webhooks/polar/route.ts`가 `~/fsd/entities/*`를 **직접 import하지 않는다**. 오직 `~/fsd/features/handle-*` 조합 함수만 호출. `rg -n '~/fsd/entities' src/app/api/webhooks` 결과가 비어 있어야 함.
- [ ] `src/app/api/portal/route.ts` 및 기타 `src/app/api/**/route.ts`도 동일 조건 — entity 직접 import 0건.
- [ ] `src/inngest/functions.ts`의 각 `step.run` 내부가 **단일 entity API 호출** 또는 **단일 feature 조합 함수 호출**만 수행. 여러 entity를 직접 조합하는 step 0건.
- [ ] `steiger.config.ts`의 "Phase 1~2 interim" 예외 블록(`files: ["src/app/api/webhooks/**", "src/app/api/portal/**", "src/inngest/functions.ts"]`)을 **삭제**. `npx steiger src/fsd`가 통과해야 함.
- [ ] `eslint.config.js`의 `no-restricted-imports` `ignores` 목록에서 Phase 3으로 feature에 흡수된 파일·경로 정리(예: `features/handle-*/api/*.ts`가 `db.$transaction`을 사용하는 경우 추가, 역할이 끝난 파일 제거).
- [ ] 수동 회귀: Phase 1 체크리스트의 6개 플로우(업로드 → Inngest → 클립 생성/삭제 → 리프로세스 → 빌링 → 웹훅)를 재실행하여 feature 조합 경로로 교체된 후에도 동일 동작 유지.

### Phase 4 — 문서 갱신 (Low)

1. `CLAUDE.md` 업데이트 — 잘못된 경로(`src/actions/`, `entity/auth/...`) 수정, 새 `entities/` 레이어 반영.
2. `docs/conventions/fsd-architecture-guidelines.md`에 본 프로젝트 전용 예시 및 엔티티 슬라이스 목록 추가.

---

## 🎯 기대 효과 (Expected Outcomes)

1. **의존성 선형화**: `shared ← entities ← features ← widgets ← pages ← app`의 단방향 흐름이 완전히 성립하여, 순환·역방향 import가 원천 차단됩니다.
2. **도메인 응집도 향상**: User·UploadedFile·Clip·Subscription 도메인의 DB/타입/UI가 각 엔티티 슬라이스에 모여 변경 비용이 낮아집니다.
3. **Public API 경계 확립**: 각 슬라이스의 외부 노출 표면이 `index.ts` 한 곳으로 수렴하여 리팩터링 시 블랙박스 안전성 확보.
4. **상위 레이어 단순화**: `src/app/**/page.tsx`, `src/inngest/functions.ts`, `src/app/api/**/route.ts`가 Prisma에서 분리되어 **테스트 용이**해지고, 스키마 변경이 entity 하나만 수정하면 끝나는 구조.
5. **자동화된 가드**: ESLint + steiger 도입으로 **사람의 기억력에 의존하지 않는** 아키텍처 규율.
6. **문서 부채 해소**: `CLAUDE.md`와 실제 구조가 일치하여 신규 코드 작성 시 AI/사람 모두 혼란 감소.

---

## ⚠️ 주의사항 및 범위 제외 (Caveats & Out of Scope)

- **라우트 경로 불변**: Next.js App Router의 URL(`/dashboard`, `/login`, `/api/webhooks/polar` 등)은 변경하지 않습니다. FSD 재구성은 `src/fsd/` 내부에서만 수행합니다.
- **단계별 배포**: Phase 1~4를 한 번에 배포하지 않고 **독립 PR**로 나눕니다. 각 Phase 완료 후 회귀 테스트 가능한 상태를 유지합니다.
- **롤백 전략**: 각 Phase(및 Phase 1의 sub-PR 1.a~1.e)는 **독립 PR = 독립 `git revert` 단위**다. Phase 1은 "런타임 동작 변경 없음"을 체크리스트로 강제하므로 revert가 안전하다(entity API를 경유한 호출 → 직접 `db.*` 호출로 되돌아가도 동등). Phase 0(패키지 설치)은 Phase 1~3에서 추가된 `import "server-only"` / `import "client-only"` 가드 파일이 모두 revert된 뒤에만 revert 가능 — 선후행 의존이 있으므로 **Phase 0 revert는 항상 마지막**. Phase 2의 `eslint.config.js` / `steiger.config.ts` 변경은 Phase 3 interim 예외 블록에 의존하므로, Phase 3 revert 시 Phase 2의 interim 블록도 함께 복원해야 한다(ESLint 실패로 CI가 깨지는 상황 방지). 프로덕션에서 장애 감지 시 가장 최근 배포된 PR을 우선 revert하고, 필요 시 의존 순서의 역순으로 추가 revert.
- **서비스 규모 고려**: 본 제안은 현 프로젝트 규모(1인 운영 SaaS)에 맞추어 엔터프라이즈급 절차(법률 자문, 대규모 리팩터링 위원회 등)는 포함하지 않습니다. 필요 시 개인 개발자가 Phase 단위로 순차 적용 가능.
- **Phase 1은 런타임 동작 변경이 없어야 함**: DB 스키마/쿼리 자체는 동일하게 유지하고, **호출 경로만** entity API를 경유하도록 리팩터. 회귀 위험은 import 누락과 `select` 누락(`select: { email, credits, image }`처럼 partial select 대응 누락)에 집중됩니다. Phase 1 검증 체크리스트로 커버합니다.
- **트랜잭션 경계는 Feature 책임**: 원자성이 필요한 다중 쓰기(`db.$transaction`, raw SQL 원자 감산)는 엔티티 메서드로 쪼개지 말고 Feature에서 `db.$transaction`을 사용해 엔티티 호출을 감쌉니다. 엔티티는 여전히 개별 쿼리만 제공. Feature가 `~/server/db`를 import하는 **유일한 예외**는 이 `db.$transaction` 래핑 목적이며, ESLint 허용 목록에 `features/**/api/**` 일부 파일을 명시적으로 추가해야 할 수 있음.
- **R1~R6 규칙 준수**: 3-5b의 설계 긴장 해결 규칙(R1: 관계 쿼리는 엔티티가 소유 가능, R2: 페이지 전용 쿼리는 `api/queries/` 서브 세그먼트, R3: raw SQL은 전용 엔티티 파일에서만, R4: DB+외부 조합은 Feature, R5: Inngest step id 불변, R6: 웹훅 순서 가드)은 각 Phase의 전제입니다. 구현 중 규칙을 깨야 하는 상황이 발견되면 **구현을 중단하고 본 제안서를 먼저 갱신**합니다.
- **성능 회귀 감시**: Phase 1 구현 중 Prisma `log: ['query']`를 일시 활성화하여 before/after 쿼리 수가 동일한지 확인합니다. 관계 쿼리가 의도치 않게 분해되었다면 엔티티 함수 시그니처를 조정.
- **인증 재설계 범위**: 현재 `signup` 플로우는 단순 redirect이며 bcrypt Credentials 흐름이 없습니다. 본 제안도 이를 신설하지 않습니다. 만약 추후 이메일/비밀번호 signup을 도입한다면 **별도 제안서**로 다룹니다.
- **ESLint/steiger 도입**: 자동 가드가 가치 있고, Phase 2에서 `steiger` 실행 한 줄과 `no-restricted-imports` 한 룰 추가는 수동 리뷰보다 확실하게 재발을 막습니다. 가능한 한 포함하는 것을 권장합니다.
- **린트 규칙의 단계적 활성화**: steiger/ESLint는 Phase 2에서 도입하되 **Phase 1~2 interim 상태를 수용하는 설정**을 함께 커밋한다(Phase 2 step 6의 `steiger.config.ts` 두 번째 예외 블록). Phase 3 완료 시점에 진입점이 feature 조합 함수로 전환된 후 해당 예외 블록을 **삭제**해 3-1의 "진입점은 feature의 조합 함수만 호출" 규칙을 완전 활성화한다. R2(entity→entity 타입 참조)는 **기본 전략인 `Prisma.<Model>GetPayload` 타입 유틸**로 회피를 우선 시도하고, 불가피한 경우만 영구 예외 경로(`entities/**/api/queries/**`)를 통해 허용한다.
- **테넌트 스코프 필수 (R7)**: 엔티티 쓰기 API는 반드시 `userId` 인자를 받고 Prisma `where`에 `{ id, userId }`(또는 외부 식별자 기반 unique 키)를 포함한다. 현재 `features/clip/api`·`features/upload/api`의 `where: { id, userId }` 복합 필터를 전수 보존해야 하며, 누락 시 **cross-tenant 접근 버그**(다른 사용자의 레코드를 조작·조회 가능)가 발생한다. Phase 1 체크리스트의 R7 회귀 스모크 테스트(유저 A의 id를 유저 B 세션으로 호출 시 실패 확인)를 반드시 수행한다.
- **Default → named export 변환 범위 식별**: Phase 2 step 3-2의 **ripgrep 전수 탐색**(`src/fsd/**` 내부 slice간 default import + `src/app/**` 진입점 import 모두)을 step 4 이전에 반드시 수행한다. 제안서에 나열된 `src/app/**`의 4곳은 하한선이며 실제 수정 대상은 sweep 결과로 확정한다. 누락 시 Phase 2 step 5에서 TS2613/TS2305 오류가 광범위하게 발생한다.
- **`server-only` / `client-only` 패키지 설치 선행 (P11)**: 두 패키지 모두 Next.js 15.5.7의 direct dependency에 포함되지 않는다(`server-only` 미설치, `client-only`는 styled-jsx transitive dep 0.0.1). Phase 0에서 `npm install server-only client-only`를 수행해 `package.json`에 직접 의존성으로 고정한 뒤 Phase 1·3의 가드 import를 추가한다. 선행 설치 누락 시 빌드 즉시 실패.
- **외부 I/O는 `db.$transaction` 콜백 외부 (P14)**: S3/Polar/Inngest `send`/HTTP fetch 등 장기 외부 I/O를 `$transaction` 콜백 내부에 넣으면 DB 커넥션이 수 초 이상 홀드되어 커넥션 풀 고갈·Neon serverless 타임아웃을 유발한다. 현행 `deleteUploadedFileWithClips`의 "S3 삭제 → DB 트랜잭션" 순서는 의도적이며 Phase 1에서 무변경 유지. R8 T-A 전환 시 구현자가 이 경계를 실수로 흐리지 않도록 Phase 1 체크리스트에 명시.
- **`features/*/api` Public API 이원화의 steiger 예외 (P15)**: 3-4에서 server action의 공식 import surface를 `~/fsd/features/<slice>/api`로 둔 결과, steiger의 public-api 룰이 이를 "slice 내부 세그먼트 직접 참조"(V11a 유형)로 오탐할 수 있다. Phase 2 step 6의 `steiger.config.ts`에 `files: ["src/fsd/features/*/api/**"]` 영구 예외 블록을 포함해야 오탐이 사라진다. widgets·pages·entities는 `"use server"` 파일을 포함하지 않으므로 이 예외 불필요.

### 코드-대조 검증에서 발견된 보정 사항 요약

본 제안서는 실제 코드베이스와 대조하여 아래 문제점을 식별하고 각 해당 섹션에서 보정했다. 구현 시 해당 섹션을 우선 확인한다.

| ID | 이슈 | 원인 | 보정 위치 |
|----|-----|------|---------|
| P1 | `findUniqueOrThrow` → `findFirst` 임의 전환 시 Prisma 에러 타입 회귀 | Prisma 4.5+ extended unique filter로 `{ id, userId }`가 schema에 `@@unique([id, userId])` 없이도 통과하므로 전환이 불필요. 전환 시 `PrismaClientKnownRequestError(P2025)` → 일반 `Error`로 에러 분기 계약이 깨짐 | 3-5b R7 강화, Phase 1 체크리스트 |
| P2 | entity `api/` 파일이 client 번들로 유출 | `"use server"` 미선언 + `server-only` 가드 부재 시, client component가 실수 import하면 Prisma client가 client 번들에 포함. `no-restricted-imports`는 `~/server/db`만 막아 entity 경로 자체를 차단하지 못함 | 3-1 `"use server"` 규칙 블록에 `server-only` 필수화 추가, Phase 1 체크리스트 |
| P3 | `features/auth/lib/sign-in-with-google.ts`의 서버 실수 import | `next-auth/react`의 `signIn`은 client 전용인데 `lib/` 배치만으로는 server 환경 import를 빌드 타임에 차단하지 못함 | 3-5 "인증 배치" 행에 `import "client-only";` 필수화 추가 |
| P4 | `features/clip` 흡수 시 R4와의 책임 충돌 | `getClipPlayUrl`·`deleteClip`이 R4에 따라 Feature 잔존인데 `features/upload`로 흡수하면 "upload" 슬라이스가 clip 재생·삭제 책임까지 지게 되어 이름-책임 불일치 재발 | 3-5 `features/clip` 행 확정안 재작성(흡수 철회, 파일 분리로 대체), Phase 3 step 2 |
| P5 | ESLint flat config `ignores` 남용 | `ignores`는 해당 config 블록 **전체**를 비활성화 — 향후 같은 블록에 rule 추가 시 허용 파일들이 새 rule도 함께 skip해 정밀도 누수 | Phase 2 step 7을 Block A(활성화) + Block B(rule-level override) 패턴으로 재설계 |
| P6 | `Prisma.<Model>GetPayload<...>` 직결로 인한 cross-entity 타입 누수 | `api/queries/*`가 Prisma 타입을 widgets/pages로 직통 반환하면 DB schema 변경이 UI 타입으로 즉시 전파되어 "도메인 응집도·경계" 효과와 상충 | 3-5b R2에 DTO 매핑 의무(Q1/Q2) 조항 추가, Phase 1 체크리스트 |
| P7 | `db.$transaction([...])` 배열 API와 entity API "완결된 Promise 반환" 원칙의 충돌 | `deleteUploadedFileWithClips`·`reprocessUploadedFile`가 사용하는 배열 트랜잭션은 `PrismaPromise<T>`(미실행 쿼리 빌더)만 받는데, entity API가 `Promise<void>`를 반환하면 배열에 넣을 수 없음. 제안서에 트랜잭션 경계 전환 방식이 명시되지 않아 구현자가 임의 선택 시 Phase 1 "동작 변경 없음"·R7 테넌트 스코프 회귀 위험 | 3-5b R8 신설(T-A 인터랙티브 트랜잭션 + `tx` 주입 확정), Phase 1 체크리스트 보강 |
| P8 | `features/*/index.ts` 배럴이 `"use server"` 제약으로 async + const/type 혼합 re-export 불가 | 배럴에 `"use server"` 선언 시 TS1253, 선언 생략 시 Next.js 번들러의 server action 직렬화 identity 유실 가능성 | 3-4에 Public API surface 이원화 패턴(`features/*/index.ts`는 상수·타입·UI만, server action은 `features/*/api` 경로 직접 import) 추가, Phase 2 step 4·5 체크리스트 |
| P9 | R2 Q1(도메인 DTO 매핑) 강제가 Phase 1 "런타임 동작 변경 없음" 원칙과 상충 | `_count.clips` → `clipCount` 평탄화는 상위 레이어 접근자 연쇄 수정을 유발. `dashboard/page.tsx`의 `formattedFiles.map` 등 Phase 1 스코프를 초과 | 3-5b R2에 Phase 1 예외 조항 추가(`queries/`는 Phase 1에서 Q2 passthrough 허용, Phase 2 step 1-1에서 Q1 전환) |
| P10 | Phase 1 스코프에 `UploadedFileSummary` canonical 이전이 포함되어 Phase 2와 중복 | Phase 1 체크리스트가 "DB 경로 교체"와 "타입 canonical 이전"을 동시에 요구해 PR 부피 증가 + 회귀 영향 범위 확대. "각 Phase 독립 배포" 원칙과 긴장 | Phase 1 체크리스트를 "shape 동치 증명만"으로 축소, Phase 2 step 1-1 신설(canonical 이전 + Q1 전환 일괄) |
| P11 | `server-only` / `client-only` 패키지 미설치 상태에서 가드 import 시 **빌드 즉시 실패** | 제안서 초판이 "Next.js 13+ 기본 의존성에 포함"이라 기재했으나 실제로는 Next.js 15.5.7의 direct dep가 아님. `npm ls` 확인 결과 `server-only` 미설치, `client-only`는 styled-jsx transitive dep 0.0.1로만 존재 | Phase 0 신설(`npm install server-only client-only`), 3-1 P2 블록 수정, 3-5 V13 행 수정, Caveats |
| P12 | Prisma `extendedWhereUnique` 전제의 암묵성 | R7이 `{ id, userId }` 복합 필터 동작을 Prisma 5.0 GA 기능에 의존하는데, 이 전제가 R7 블록에 한 줄로만 기재되고 장기 감시 지점으로 문서화되지 않음. 향후 Prisma major 업/다운그레이드 시 회귀 탐지가 지연 | 3-5b R7에 Prisma 버전 전제 명시 조항 추가, Phase 4 문서 갱신 체크리스트 |
| P13 | R3 `$executeRaw`(credits 감산) 경로가 R8의 `tx` 주입과 단절 | R3은 `$executeRaw` 유지, R8은 entity API의 `tx?: Prisma.TransactionClient` 주입을 규정하나, raw SQL 경로의 `tx` 전파 패턴을 명시하지 않아 Phase 3 이후 feature 승격 시 구현자가 임의 선택 | 3-5b R8 하단 "raw SQL 경로의 `tx` 전파" 블록 신설 |
| P14 | `db.$transaction` 콜백 내부에 외부 I/O 혼입 위험 | R8 T-A 예시가 entity API 2개 호출만 보여주고 S3/Polar/Inngest 호출의 위치를 명시하지 않아, 구현자가 `removeGeneratedClipsFromS3`를 콜백 내부로 옮기면 DB 커넥션이 수 초 홀드되어 Neon serverless 타임아웃 유발 | 3-5b R8 하단 "외부 I/O는 트랜잭션 외부" 블록 신설, Phase 1 체크리스트, Caveats |
| P15 | steiger의 public-api 룰이 `features/*/api` 직접 import를 오탐 | 3-4의 "Public API surface 이원화"는 server action의 공식 경로를 `~/fsd/features/<slice>/api`로 두나, steiger 기본 룰은 이를 V11a 유형(slice 내부 세그먼트 직접 참조) 위반으로 오탐 | Phase 2 step 6의 `steiger.config.ts`에 `files: ["src/fsd/features/*/api/**"]` 영구 예외 블록 추가 |
| P16 | Phase 1 단일 PR의 리뷰 부담 | entities 5개 신설 + 진입점 10+ 파일 교체 + 체크리스트 15+ 항목을 1 PR에 묶으면 리뷰·롤백 비용이 크다 — "단일 관심사"라는 스코프 설명과 실제 diff 규모의 긴장 | Phase 1 하단에 sub-PR 분할 옵션(1.a~1.e) 신설 |

---

## 📎 참고 (References)

- 내부 가이드라인: `docs/conventions/fsd-architecture-guidelines.md`
- 선행 제안 문서: `docs/proposals/api-layer-separation-proposal.md` (Server Actions/Queries 분리 — Phase 1과 병행 가능)
- FSD 공식 문서: https://feature-sliced.design/
- 아키텍처 경계 린터: https://github.com/feature-sliced/steiger

---

## Audit (2026-08-03)

이 문서의 위반 항목을 현재 코드와 대조했다. 대부분 해소됐고 네 가지가
남았다. 남은 것만 보면 되므로 처음부터 다시 감사하지 않아도 된다.

### 해소됨

| 항목 | 확인 |
| --- | --- |
| V-Critical `entities/` 레이어 신설 | 8개 슬라이스 존재 (analytics-event, clip, clip-draft, order, processing-dispatch, subscription, uploaded-file, user) |
| V8 안티패턴 세그먼트 | `shared/types`, `shared/hooks`, `pages/dashboard/hooks`, `features/billing/constants` 네 곳 모두 사라짐 |
| `features/billing/constants/` → `config/` | 현재 세그먼트는 api, config, model, ui |
| V11a 인용된 두 위반 | `pages/upload-detail/ui/index.tsx:13`, `widgets/clip-display/ui/index.tsx:6` 모두 해당 import 없음 |
| 3-4 슬라이스 Public API (일부) | entities 8/8, features 8/9 |

### 남음

**1. `widgets/` 슬라이스에 `index.ts`가 하나도 없다 (0/7)**

clip-display, clip-draft-review, dashboard-header, login-form, site-footer,
site-header, uploaded-file-list.

**2. 크로스 슬라이스 세그먼트 직접 참조**

```
entities/processing-dispatch/api/index.ts:14  → entities/uploaded-file/model/attempt-prefix
features/upload/model/query-options.ts:2,3,7  → entities/uploaded-file/model/{polling,query-keys,types}
features/upload/model/use-reprocess-uploaded-file.ts:4 → entities/uploaded-file/model/query-keys
```

`entities/uploaded-file/index.ts`는 존재하므로 Public API를 거치도록 바꿀 수 있다.

**3. V11b 인트라 슬라이스 절대경로 자기참조**

```
features/billing/ui/PlanCard.tsx:14          → ~/fsd/features/billing/api
features/billing/ui/SubscriptionStatus.tsx:15 → ~/fsd/features/billing/api
features/billing/ui/OrderHistory.tsx:16       → ~/fsd/features/billing/model/types
```

§5.3 위반은 아니지만 문서가 상대경로를 권장한 항목이다.

**4. 경계 자동 검출 미도입**

`steiger`도 `@feature-sliced/eslint-config`도 의존성과 eslint 설정 어디에도
없다. 3-5의 CI 권장이 미적용이다.

### 재대조 (2026-09-03, 클린코드 개선 77건 이후)

위 「남음」 목록은 2026-08-03 시점이다. `2026-09-03-frontend-clean-code-improvements.md`
(커밋 `9dd6dfb`~`a75dcd6`)가 그중 일부를 닫았고 일부는 줄번호만 밀렸다. 스냅샷은
그대로 두고 현재 상태를 여기에 적는다.

| 남음 | 2026-09-03 상태 |
| --- | --- |
| 1. `widgets/` `index.ts` 0/7 | **그대로 0/7.** 클린코드 검토는 widgets barrel을 항목으로 올리지 않았다 |
| 2. 크로스 슬라이스 세그먼트 직접 참조 3건 | **세 건 모두 해소.** C-07이 `entities/uploaded-file`을 클라이언트 안전 `index.ts`와 `server.ts`로 나눠 barrel 임포트가 가능해졌고, C-06·C-08이 깊은 임포트를 barrel로 되돌렸다. 현재 `grep -rn 'from "~/fsd/entities/' src/fsd/entities` 0건 |
| 3. V11b 인트라 슬라이스 절대경로 3건 | **그대로 위반.** 줄만 밀렸다 — `SubscriptionStatus.tsx:15` → `:26`(C-71이 AlertDialog 임포트를 추가). `PlanCard.tsx:14`·`OrderHistory.tsx:16`은 변동 없음 |
| 4. 경계 자동 검출 미도입 | **그대로 미도입** |

위 확인 표의 `3-4 슬라이스 Public API | entities 8/8, features 8/9`도 낡았다 —
C-08이 `features/clip/index.ts`를 만들어 현재 **features 9/9**다.

---

## Completion or Closure Notes (2026-09-06)

**이 문서는 수행 기록이다.** 본문의 「제안하는 해결책」·「마이그레이션 단계」는 2026-04-18 작성
시점의 계획이며, 실제 이행 경로는 아래와 같다. 현재 상태를 알려면 본문보다 「Audit (2026-08-03)」과
그 아래 「재대조 (2026-09-03)」, 그리고 이 절을 읽는 것이 빠르다.

### 실제로 무엇이 닫았나

제안서 Phase 1~4의 상당 부분은 **이 제안서를 실행해서가 아니라 다른 경로로** 닫혔다.
`entities/` 레이어 신설, 상위 레이어의 DB 직접 조회 제거(V3~V6), 금지·안티패턴 세그먼트 정리
(V7·V8·V9), 크로스 슬라이스 Public API 위반(V11a) 등은 2026-09-03 클린코드 개선 77건
(커밋 `9dd6dfb`~`a75dcd6`)이 처리했다. 「Audit (2026-08-03)」이 그 시점의 잔여를 넷으로 좁혔고,
「재대조 (2026-09-03)」가 그중 하나(크로스 슬라이스 세그먼트 직접 참조)를 닫힌 것으로 기록했다.

남은 셋을 파이프라인 항목으로 등재해 이행했다.

| 잔여 항목 | 이행 |
| --- | --- |
| widgets 배럴 0/7 (3-4) | **FEAT-33** — 배럴 7개 신설, 슬라이스 밖 참조 9곳을 배럴 경유로 교체 |
| V11b 인트라 슬라이스 절대경로 자기참조 | **FEAT-33**에 흡수 — 제안서가 열거한 billing 3건 + 같은 부류로 확인된 clip-display 7건, 총 10건을 상대경로로 |
| 경계 자동 검출 미도입 (Phase 2 step 6·7) | **FEAT-34** — `scripts/verify-fsd-boundaries.mjs`(규칙 W1~W8) + 셀프테스트, `check`에 배선 |

덧붙여 **FEAT-31**(엔티티 배럴 다섯의 런타임 분할)이 같은 흐름에서 나왔다 — 제안서가 열거하지
않았지만 같은 Public API 부류의 잠복 결함이었다(배럴이 `import "server-only"`인 `./api`를
재수출해, 첫 클라이언트 임포터가 빌드를 깨는 상태).

### 원래 설계 중 채택하지 않은 것

- **`steiger` 도입**(Phase 2 step 6): 채택하지 않았다. web `pages`에 배럴이 하나도 없어 기본
  ruleset이 즉시 대량 위반을 내고, 디렉터리 스코프라 `src/app`→widgets 위반을 못 본다. 대신
  `apps/admin/scripts/verify-fsd-boundaries.mjs`(저장소 선례)를 web 관례로 이식했다 — 신규
  의존성 0.
- **`steiger.config.ts`의 예외 셋**: R2 경로(`entities/**/api/queries/**`)는 web에 그 디렉터리가
  없어 죽은 설정이 되므로 넣지 않았다. 진입점의 entity 직접 조합 허용은 **규칙 스코프로 구현**해
  만료 예정 예외 블록을 두지 않았다(Phase 3에서 삭제할 잔재가 없다). `features/*/api` 직접
  임포트 예외(P15)만 실재해 Public entry 정의에 반영했다.
- **ESLint `no-restricted-imports`**(Phase 2 step 7): 단독으로는 불충분해 채택하지 않았다.
  배럴의 `./api` 재수출과 "임포터의 소속 슬라이스" 판정은 경로 룰로 표현되지 않는다. 후속으로
  에디터 즉시 피드백 목적의 보완은 가능하다.

### 검증

FEAT-31·33·34 각각 `plan-verifier` 독립 무편집 패스로 클린 판정을 받았고(2·3·4사이클),
구현 후 메인 루프가 인수 조건 다섯을 직접 재현했다. FEAT-34는 감시 지점 음성 시험까지 실증했다 —
엔티티 배럴에 `./api` 재수출을 심으면 `[W5]` EXIT 1, `src/app`에서 widgets 내부를 임포트하면
`[W4]` EXIT 1, 되돌리면 통과. `npm run check`(verify 앞단 포함) EXIT 0, 셀프테스트 11/11,
`npm test` 77/77, `npm run build` EXIT 0.

### 남은 것

- **배포 후 확인**: FEAT-31·33·34의 「못 덮는 범위」가 `docs/release-checks.md`에 등재돼 있다.
  FEAT-31·33이 남긴 감시 지점 두 줄은 FEAT-34 도입으로 `대체(FEAT-34)` 처리된다.
- **후속 정리 후보**(이 제안서 범위 밖): `pages` 슬라이스 내부의 인트라 절대경로 자기참조 4건
  (`UploadPodcast.tsx:26·27`, `upload-detail/ui/index.tsx:10·11`). V11b와 같은 부류이나 소프트
  권장이고 `verify:fsd`가 강제하지 않는다.
