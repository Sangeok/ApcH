# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Repository Layout

This is an **npm workspaces monorepo**. This file describes `apps/web`.

```
ApcH/
├─ package.json          workspaces: ["apps/*", "packages/*"]
├─ .env                  단일본. 앱과 Prisma CLI가 공유
├─ apps/
│  ├─ web/               이 문서가 설명하는 앱 (a-pch.com)
│  ├─ admin/             어드민 앱 (admin.a-pch.com). 별도 Vercel 프로젝트
│  └─ backend/           Python (Modal). package.json 이 없어 워크스페이스 대상 아님
└─ packages/
   └─ db/                @repo/db — Prisma + analytics 계약
```

어드민 화면은 2026-08-02에 `apps/admin`으로 분리됐다. **web에는 `/admin` 라우트가 없다.** 어드민 관련 코드(`app/admin/`, `pages/admin-*`, `features/observability-test`, `shared/api/admin-guard.ts`, `env.ADMIN_EMAILS`, analytics 리포팅 집계)는 전부 제거됐으니 web에서 찾지 말 것.

두 앱은 `@repo/db`만 공유한다. UI 컴포넌트와 인증 설정은 각자 자기 것을 가진다 — 공유하지 않기로 한 결정이다(`docs/proposals/completed/2026-08-02-monorepo-admin-split.md` 결정 2).

## Project Overview

AI Podcast Clipper는 팟캐스트 영상을 AI 클립으로 만드는 Next.js 15 앱이다. 인증, S3 업로드, 클립 표시를 담당하고, 영상 처리는 Inngest 워커가 외부 Modal.run 엔드포인트를 호출해 비동기로 처리한다.

## Development Commands

**대부분 저장소 루트에서 실행한다.** 워크스페이스 플래그(`-w`)가 붙는 명령은 어디서 실행하든 동일하게 동작한다.

```bash
# 개발
npm run dev                      # web 개발 서버 (Turbopack, :3000)
npm run dev:admin                # admin 개발 서버 (Turbopack, :3001)
npm run inngest-dev -w apps/web  # Inngest 개발 서버 (:8288)

# 데이터베이스 — @repo/db 가 소유한다
npm run db:push -w @repo/db      # 스키마를 DB에 반영 (개발)
npm run db:generate -w @repo/db  # 마이그레이션 생성 (prisma migrate dev)
npm run db:migrate -w @repo/db   # 마이그레이션 적용 (prisma migrate deploy)
npm run db:studio -w @repo/db    # Prisma Studio

# 코드 품질
npm run check --workspaces       # lint + typecheck (전 워크스페이스)
npm run test --workspaces        # 테스트 (전 워크스페이스)
npm run check -w apps/web        # web만
npm run typecheck -w apps/web
npm run lint:fix -w apps/web
npm run format:write -w apps/web

# 빌드
npm run build --workspaces
npm run build -w apps/web
npm run preview -w apps/web      # 빌드 후 프로덕션 서버 기동
```

루트 `package.json`에 `db:push` / `db:migrate` / `db:studio` 축약이 있어 `npm run db:push`만으로도 된다.

### 테스트

Node 내장 러너를 `tsx`로 실행한다. `.test.mjs` 파일이 `.ts` 모듈을 임포트하는데, Node ESM은 확장자 없는 임포트를 해석하지 못하고 `@repo/db`는 CJS 디렉터리 임포트를 거쳐야 해서 bare node로는 돌지 않는다.

```bash
npm test -w apps/web
```

현재 14개 파일, 17 suite, 77개 테스트. 퍼널 집계 테스트(`reporting.test.mjs`)는 로직과 함께 `apps/admin`으로 갔다.

| 파일 | 지키는 것 |
|---|---|
| `shared/analytics/event-catalog.test.mjs` | shim이 `ANALYTICS_METADATA_KEYS_BY_EVENT` 재수출을 잃지 않는 것. **이 줄이 사라지면 타입 에러 없이 계측만 조용히 멈춘다** |
| `shared/analytics/lib/metadata.test.mjs` | 이벤트별 허용 메타데이터 키. `ANALYTICS_METADATA_KEYS_BY_EVENT`는 `as const satisfies Record<AnalyticsEventName, readonly string[]>`로 계약에 묶여 있어, 이벤트 이름 변경은 이제 컴파일 오류다. 이 테스트는 각 이벤트가 **어떤 키를 허용하는지**(값)를 지킨다 |
| `shared/analytics/lib/normalize-path.test.mjs` | 경로 정규화 |
| `widgets/clip-draft-review/model/selection-budget.test.mjs` | 클립 선택 예산 |
| `widgets/clip-draft-review/model/caption-presets.test.mjs` | 캡션 프리셋이 `captionStyleSchema` 안에 있는지와 `matchPresetId`. **프리셋은 리터럴 값 묶음이라 범위를 벗어나도 타입은 통과하고, Apply 할 때 zod가 런타임에 거부한다.** position을 무시하는 매칭도 여기서만 잡힌다 — 무너지면 위치를 바꾼 순간 프리셋 칩이 꺼진다 |
| `pages/dashboard/model/clip-count-budget.test.mjs` | 소스 재생 길이 → 구조적 클립 상한. `floor(D/30)` 경계, 옵션 최댓값(4) 클램프, 길이 미상(`null`·비유한·0 이하) 시 가드 없음(=4), 30초 미만 시 0. **`600초 → 4`는 회귀 테스트다** — 백로그가 FEAT-02의 원인으로 지목한 "10분 소스에 4개는 무리한 요청"이 사실이 아니고, 그 경우의 미달 생성은 `apps/backend` 하이라이트 탐지 문제임을 못박는다 |
| `entities/uploaded-file/model/clip-generation-outcome.test.mjs` | 부분 클립 결과 판정과 폴링 조기 탈출 판정. **노트 코드 두 개는 `failureCode` 컬럼에 저장되는데 union 타입이 그 상수 자신에서 파생된다.** 값을 바꾸면 타입은 그대로 통과하고 이미 저장된 행만 조용히 인식되지 않는다. `clipsFound >= expectedClipCount → null` 경계도 타입이 못 잡는다 — 무너지면 완전 성공에도 "일부만 생성됨" 안내가 뜬다 |
| `entities/clip/lib/clip-type-label.test.mjs` | `clipTypeLabel`의 라벨 매핑(`qa`→Q&A·`insight`→Insight·**모르는 값은 원본 그대로**·nullish/공백은 null). **백엔드가 `clipType`에 강제하는 enum이 없어**(`main.py:987`은 프롬프트의 요청일 뿐) 라벨이 미지의 값을 빈 칸으로 삼키지 않는 것을 잡는다 |
| `widgets/clip-display/model/clip-rationale.test.mjs` | 최종 클립 카드의 선택 근거 존재 판정. `hasClipRationale`은 비공백이 하나라도 있으면 true — 세 근거가 전부 비면 카드 블록 자체가 렌더되지 않는다 |
| `entities/uploaded-file/model/stuck-alert.test.mjs` | 처리 지연 경과 시간 계산(`stuckAlertElapsedMinutes`) |
| `middleware.test.mjs` | `PROTECTED_ROUTES`·`AUTH_ROUTES`의 모든 항목이 미들웨어 `matcher` 패턴에 포섭되는지. **`authorized` 콜백은 matcher가 통과시킨 경로에서만 돈다** — 목록에만 추가하면 보호된 것처럼 읽히는 무방비 라우트가 생긴다. Next가 `config`를 정적 추출하므로 matcher를 상수에서 계산할 수 없고, 타입도 둘을 묶어 주지 못한다 |
| `widgets/clip-display/model/subtitle-status.test.mjs` | 번역 폴백 상태 → 사용자 안내 매핑. `"partial-fallback"`/`"full-fallback"`만 안내를 내고 `"ok"`·미지값·nullish/공백은 null(정상 자막에 경고를 붙이지 않는다), padded 상태값도 `trim()`으로 매핑된다. **매핑 키는 백엔드 `translation_fallback.py` 상태 상수와 묶는 wire 계약이라 어긋나면 안내가 조용히 꺼진다** — 타입이 아니라 이 테스트가 그 회귀를 막는다 |
| `features/clip-review/model/transcript.test.mjs` | `parseTranscriptWords`의 분기 — 유효 배열 통과·타입 불일치/`null`/비객체 필터·비배열은 **`"Transcript payload was not an array"` 메시지로** throw. **메시지까지 단언하는 것이 요점이다**: 배열 가드를 지워도 비배열 입력은 `payload.filter is not a function`으로 throw하므로 "throw 여부"만 보는 테스트는 그 회귀를 통과시킨다(계획 검증에서 실제로 생존한 돌연변이) |
| `shared/lib/format-date.test.mjs` | `formatDate`/`formatDateTime`가 런타임 로케일·타임존과 무관하게 고정 출력을 내는지 + 수출된 두 포매터의 `resolvedOptions()`가 로케일 `"en"`·타임존 `"UTC"` **완전 일치**인지. **골든 문자열만으로는 부족하다**: 러너 TZ가 UTC면(CI·Vercel) `timeZone` 옵션을 지운 회귀가 그대로 통과하므로 테스트가 임포트보다 **먼저** `process.env.TZ`를 비-UTC로 강제하고 동적 임포트한다. 로케일도 en 계열 CI에서 `"en-US"`가 같은 문자열을 내므로 `resolvedOptions().locale` 완전 일치가 필요하다 — 그래서 포매터 상수를 수출한다 |

## Architecture

### Feature-Sliced Design (FSD)

`src/fsd/` 아래 5개 레이어.

| 레이어 | 슬라이스 |
|---|---|
| `pages/` | about, ai-podcast-clipper, changelog, compare, contact, dashboard, features, guides, home, how-it-works, podcast-to-shorts, pricing, product-tour, security, upload-detail, youtube-shorts-generator |
| `widgets/` | clip-display, clip-draft-review, dashboard-header, login-form, site-footer, site-header, uploaded-file-list |
| `features/` | auth, billing, clip, clip-review, handle-order-*, handle-subscription-*, upload |
| `entities/` | analytics-event, clip, clip-draft, order, processing-dispatch, subscription, uploaded-file, user |
| `shared/` | analytics, api, config, lib, observability, ui |

**규칙**

- 상위 레이어는 하위 레이어만 임포트한다 (역방향 금지)
- 같은 레이어 안에서의 peer 임포트 금지
- 각 슬라이스는 `ui/`, `model/`, `api/`, `lib/` 하위로 자족한다
- **서버 전용 접근이 있는 슬라이스는 루트 barrel을 둘로 나눈다** — `index.ts`는 클라이언트 안전(`model`·`lib`·`ui`), `server.ts`는 `import "server-only"` + `./api` 재수출. `api/`가 `server-only`인데 `index.ts`가 그걸 재수출하면 그 barrel을 임포트하는 모든 클라이언트 모듈의 **빌드**가 깨지고(타입 체크는 통과한다), 실제로는 클라이언트가 barrel을 우회해 공개 API 경계가 사라진다. `entities/{uploaded-file,clip,clip-draft}`가 이 형태다. 규약 전문은 `docs/conventions/fsd-architecture-guidelines.md`

### 서버 액션

`src/actions/` 디렉터리는 **없다.** 서버 액션은 각 feature 슬라이스의 `api/index.ts`에 `"use server"`와 함께 있다.

```
features/billing/api/index.ts            결제·체크아웃
features/clip/api/index.ts               클립 조회·삭제·URL 생성
features/clip-review/api/index.ts        생성 전 클립 검토
features/upload/api/index.ts             업로드 준비·확정·처리 스케줄링
```

인가는 **액션 본문 최상단**에서 강제한다. Server Action은 레이아웃과 무관하게 직접 POST로 호출되는 독립 엔드포인트라 레이아웃 가드로는 보호되지 않는다.

### 인증 (`src/server/auth/`)

- **Google OAuth 전용.** Credentials(이메일/비밀번호)는 2026-03-26에 제거됐다. bcrypt 의존성도 없다
- JWT 세션 전략 (`config.edge.ts:23`). Prisma adapter를 쓰지만 세션은 DB에 저장하지 않는다
- `config.edge.ts`는 Edge 런타임 호환용으로 Prisma·env 의존이 없다. `middleware.ts`가 이것만 쓰고, `config.ts`가 이를 확장한다
- 보호 경로는 `/dashboard`뿐이다. 어드민 판별(`ADMIN_EMAILS` 화이트리스트)은 `apps/admin`으로 갔다

### 데이터베이스

**Postgres (Neon)** + `@prisma/adapter-neon` 드라이버 어댑터. SQLite가 아니다.

- 스키마: `packages/db/prisma/schema.prisma`
- 생성 클라이언트: `packages/db/generated/prisma/` — **git 추적 대상이다**(27개 파일). `.gitignore`에 넣지 말 것. tmp 찌꺼기 규칙만 `packages/db/.gitignore`에 있다
- 모델: Account, Session, VerificationToken, User, UploadedFile, Clip, ClipDraft, ProcessingDispatch, Subscription, Order, AnalyticsEvent
- 크레딧: 기본 3, 클립당 1 차감

```typescript
import { db } from "~/server/db";   // 앱 내부 간접 계층 (@repo/db 재수출)
import { db } from "@repo/db";      // 패키지 직접
```

`~/server/db`는 한 줄짜리 shim이다. 둘 다 같은 인스턴스를 준다.

### `@repo/db` 공개 표면

```typescript
export { db }                          // Prisma 클라이언트
export { Prisma }                      // 네임스페이스 (값). instanceof 검사용
export type * from "generated/prisma"  // 모델 타입 (Clip, ClipDraft, ...)
export * from "./analytics-contract"   // 아래 참조
```

**`export type *`는 타입만 내보낸다.** 스키마에 enum을 추가하고 그 값을 런타임에 쓰려면 `export { SomeEnum }`을 명시적으로 추가해야 한다. 빠뜨리면 `undefined`가 되고 `tsc`가 잡지 못한다.

### analytics 계약 — 손댈 때 주의

`packages/db/src/analytics-contract.ts`가 이벤트 이름 29개, 퍼널 정의, 관련 타입을 **한 곳에서** 정의한다. web이 쓰고(기록), 앞으로 admin이 읽는다(집계).

`ANALYTICS_FUNNELS`의 `satisfies Record<FunnelId, readonly AnalyticsEventName[]>` 절이 "퍼널 단계는 실제 존재하는 이벤트 이름이어야 한다"를 컴파일 타임에 강제한다. **이 방어선은 양쪽이 같은 파일을 볼 때만 작동한다.** 계약을 복사해 두 벌로 만들면 한쪽에서 rename해도 다른 쪽은 통과하고, 대시보드가 에러 없이 0을 보여준다.

`ANALYTICS_METADATA_KEYS_BY_EVENT`는 web 전용이라 계약에 없다. `shared/analytics/event-catalog.ts`가 재수출한다.

### Inngest (`src/inngest/`)

- `client.ts` — 클라이언트와 앱 id
- `functions.ts` — `processVideo` 등. 사용자별 동시성 1 (userId 키), 재시도 1회
- 흐름: 크레딧 확인 → Modal 호출 → 응답 파싱 → Clip 레코드 생성 → 크레딧 차감
- 백엔드가 클립 메타데이터를 안 주면 S3 목록으로 폴백

### 환경 변수

`src/env.js`에서 `@t3-oss/env-nextjs` + Zod로 검증한다. 빌드 시점에 검증되므로 새 변수는 여기 스키마에 먼저 추가해야 한다.

**`.env`는 저장소 루트에 있다.** Next.js는 `process.cwd()` 기준으로만 `.env`를 자동 로드하는데 cwd가 `apps/web`이라, `next.config.js` 최상단에서 dotenv로 명시 로드한다.

```js
import { config as loadEnv } from "dotenv";
loadEnv({ path: "../../.env" });
await import("./src/env.js");
```

**`await import`를 정적 import로 되돌리면 안 된다.** ESM은 정적 import를 전부 본문보다 먼저 평가하므로, `src/env.js` 검증이 dotenv보다 먼저 돌아 `Invalid environment variables`가 난다.

## Path Aliases

`tsconfig.json`의 `baseUrl`은 `.`, 매핑은 `~/*` → `./src/*`.

- 앱 내부는 `~/*`를 쓴다. 슬라이스 경계를 넘는 상대 경로는 금지
- 패키지는 `@repo/db`로 임포트한다

## 배포 (Vercel)

| 설정 | 값 |
|---|---|
| Root Directory | **`apps/web`** |
| Region | `icn1` |

`next.config.js`에 두 가지가 함께 있어야 Prisma가 런타임에 동작한다.

```js
outputFileTracingRoot: path.join(__dirname, "../../"),  // 엔진을 빌드 산출물에 포함
webpack: (config, { isServer }) => {                     // 엔진을 번들 옆으로 복사
  if (isServer) config.plugins = [...config.plugins, new PrismaPlugin()];
  return config;
},
```

**둘 다 필요하다.** 생성 클라이언트가 빌드 시점 절대경로(`/vercel/path0/...`)를 파일에 박는데 런타임 함수 루트는 `/var/task/`다. 트레이싱만으로는 엔진이 번들에 들어가도 Prisma가 찾는 위치에 없다. 2026-08-01 배포에서 실측으로 확인했다.

`packages/db`의 `postinstall`이 리눅스 엔진을 생성한다. 커밋된 엔진은 Windows 전용이라 이것 없이는 배포가 런타임에 죽는다.

## Common Gotchas

- Prisma 클라이언트는 `packages/db/generated/prisma/`에 생성된다. `node_modules/@prisma/client`가 아니다
- 생성 클라이언트는 **생성 시점의 절대경로를 파일에 박는다.** 디렉터리를 옮기면 그 값이 재작성되고, 그 diff는 정상이다. `"version"`이나 런타임 코드가 바뀌면 그때만 문제다
- NextAuth는 Prisma adapter를 쓰지만 JWT 세션이다. DB에 세션 행이 쌓이지 않는다
- S3는 결과적 일관성이 있어 DB 레코드와 실제 객체를 함께 확인해야 한다
- `npm install` 후 `generated/prisma`가 CRLF로 바뀌어 20여 개 파일이 변경으로 뜰 수 있다. `git diff --ignore-cr-at-eol --numstat`가 0이면 내용 변화가 없는 것이므로 되돌린다
- `@repo/db`는 bare `node`로 임포트되지 않는다(확장자 없는 임포트 + Prisma CJS 디렉터리 임포트). 테스트는 `tsx`로 돌린다

## CRITICAL: File Editing on Windows

### ⚠️ MANDATORY: Always Use Backslashes on Windows for File Paths

**When using Edit or MultiEdit tools on Windows, you MUST use backslashes (`\`) in file paths, NOT forward slashes (`/`).**

#### ❌ WRONG - Will cause errors:

```
Edit(file_path: "D:/repos/project/file.tsx", ...)
MultiEdit(file_path: "D:/repos/project/file.tsx", ...)
```

#### ✅ CORRECT - Always works:

```
Edit(file_path: "D:\repos\project\file.tsx", ...)
MultiEdit(file_path: "D:\repos\project\file.tsx", ...)
```

Bash 도구에서는 반대로 정방향 슬래시를 쓴다. 그리고 Bash 도구에 PowerShell here-string(`@'...'@`) 문법을 쓰면 리터럴 `@`가 들어간다 — 커밋 메시지는 `git commit -F <파일>`로 넘긴다.
