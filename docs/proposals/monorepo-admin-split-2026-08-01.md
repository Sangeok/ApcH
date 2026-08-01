# 모노레포 전환 + 어드민 앱 분리 배포 개발 문서

Date: 2026-08-01
Status: **Proposed** — 미해결 질문 없음(§Open Questions). 구현 계획서 작성 대기.

분류: **refactoring/infra** — 사용자 대면 동작을 바꾸지 않는 것이 목적이다. 어드민 화면의 기능은 그대로 두고 배포 경계와 저장소 구조만 바꾼다. 유일한 동작 변화는 어드민 접근 경로(`a-pch.com/admin/*` → `admin.a-pch.com/*`)와 어드민 로그인 방식이다.

---

## 1. 배경/동기

### 비즈니스 맥락 (사용자 브리프)

어드민 페이지를 본격적으로 도입하려는데, 지금은 서비스 웹 안에 같이 들어 있다. 이를 별도 웹사이트로 분리 배포하고, 분리하는 김에 저장소를 모노레포 형식으로 정리하고 싶다.

### 기술적 맥락 (코드베이스에서 확인한 현재 상태)

**저장소 구조** — 워크스페이스 설정 없이 폴더만 나뉜 단일 저장소다.

```
ApcH/
├─ ai-podcast-clipper-frontend/   # Next.js 15.5.7 / T3 / npm 10.9.2
├─ ai-podcast-clipper-backend/    # Python (Modal)
└─ docs/proposals/
```

- `ai-podcast-clipper-frontend/.npmrc`: `legacy-peer-deps=true`
- `ai-podcast-clipper-frontend/vercel.json`: `framework: nextjs`, `regions: ["icn1"]`
- 루트에 `package.json`이 없다. Vercel은 `ai-podcast-clipper-frontend`를 Root Directory로 잡고 있다.

**어드민의 현재 위치** — 라우트는 3개 파일뿐이고 로직은 FSD 레이어에 흩어져 있다.

| 파일 | 역할 |
|---|---|
| `src/app/admin/layout.tsx` | `requireAdmin()` 호출, 헤더, `<Toaster />` |
| `src/app/admin/analytics/page.tsx` | 4개 리포트 병렬 조회 → `AdminAnalyticsPage` |
| `src/app/admin/observability/page.tsx` | `ObservabilityTestPanel` |

어드민이 끌어쓰는 것:

- `~/fsd/shared/api/admin-guard` → `~/env`(`ADMIN_EMAILS`), `~/server/auth`
- `~/fsd/entities/analytics-event` → `~/server/db`, `generated/prisma`, `~/fsd/shared/analytics/event-catalog`
- `~/fsd/pages/admin-analytics/*`, `~/fsd/pages/admin-observability/*`
- `~/fsd/features/observability-test` → `~/fsd/shared/observability`, `~/fsd/shared/api/result`
- `~/fsd/shared/ui/atoms/{button,card,table,badge,sonner}` → `~/fsd/shared/lib/utils`(`cn`)

**인증** — NextAuth v5 beta, JWT 세션 전략.

- `src/server/auth/config.ts`: Google provider + `PrismaAdapter(db)` + `signIn`/`session`/`jwt` 콜백
- `src/server/auth/config.edge.ts`: Edge 호환 설정. `PROTECTED_ROUTES = ["/dashboard", "/admin"]`
- `src/middleware.ts`: matcher `["/dashboard/:path*", "/admin/:path*", "/login"]`
- 관리자 판별은 DB 역할이 아니라 `env.ADMIN_EMAILS` 콤마 구분 화이트리스트 (`admin-guard.ts`)

**결합 실측** (`src` 아래 TS/TSX 231개 기준)

| 임포트 | 파일 수 |
|---|---|
| `generated/prisma` | 23 |
| `~/env` | 14 |
| `~/server/auth` | 12 |
| `~/server/db` | 11 |
| `~/fsd/shared/analytics/*` | 19 |

`generated/prisma`는 베어 스펙파이어처럼 보이지만 실제로는 `tsconfig.json`의 `baseUrl: "."`으로 해석되는 경로다. Prisma 산출물이 이동하면 23개 파일이 전부 깨진다.

**analytics 계약의 양방향 의존** — 이 전환에서 가장 조심해야 할 지점이다.

```
shared/analytics/event-catalog.ts
  ANALYTICS_EVENT_NAMES (28개), type AnalyticsEventName
        │
   ┌────┴─────┐
   ↓ 쓰기      ↓ 읽기
 web 19개    entities/analytics-event/model/funnels.ts
 track-event   ANALYTICS_FUNNELS
   ↓             satisfies Record<FunnelId, readonly AnalyticsEventName[]>
 DB AnalyticsEvent ──→ model/reporting.ts ──→ 어드민 대시보드
```

`funnels.ts:31`의 `satisfies` 절이 "퍼널 단계는 실제 존재하는 이벤트 이름이어야 한다"를 컴파일 타임에 강제한다. 이 방어선은 **쓰는 쪽과 읽는 쪽이 같은 `AnalyticsEventName`을 볼 때만** 작동한다.

이 코드베이스는 이미 같은 유형(에러 없이 숫자만 틀리는)의 버그를 두 번 겪었다:

- `funnels.ts:26-29` — "activation에 섞으면 auto 모드 사용자가 첫 검토 스텝에서 걸려 그 뒤 `clip_viewed`가 영구히 0이 된다"
- `shared/analytics/lib/metadata.ts:21-23` — "`reviewBeforeGenerate`는 이미 싣고 있었으나 허용 목록에 없어 조용히 버려지고 있었다"

**`entities/analytics-event`는 통째로 이동할 수 없다.** `api/index.ts`의 6개 export가 양쪽으로 갈린다.

| export | 사용처 | 이동 대상 |
|---|---|---|
| `recordAnalyticsEvent` | `app/api/analytics/events/route.ts` | web 잔류 |
| `cleanupExpiredAnalyticsEvents` | `src/inngest/functions.ts:19` | web 잔류 |
| `getAnalyticsOverview` | `app/admin/analytics/page.tsx` | admin 이동 |
| `getFunnelReport` | 〃 | admin 이동 |
| `getDropOffReport` | 〃 | admin 이동 |
| `getRecentFailureEvents` | 〃 | admin 이동 |

`model/reporting.ts`는 임포트가 하나도 없는 순수 함수 모듈이라 admin으로 그대로 옮겨진다.

---

## 2. 목표 상태

### 목표

1. 루트가 npm workspaces 모노레포가 된다. lockfile은 하나다.
2. 어드민이 `admin.a-pch.com`으로 독립 배포된다 (Vercel 프로젝트 2개).
3. web과 admin이 **같은 Prisma 스키마 하나**와 **같은 analytics 계약 하나**를 본다.
4. admin 배포에 주입되는 시크릿이 실제로 필요한 것만으로 줄어든다. AWS·Polar·Modal 시크릿은 admin에 들어가지 않는다.
5. 전환 과정에서 기존 사용자의 세션이 끊기지 않는다.

### 비목표

- 어드민 화면의 기능/디자인 변경. 지금 있는 2개 화면을 그대로 옮긴다.
- Turborepo 도입. 앱 2개 규모에서 빌드 캐시 이득이 설정 비용을 넘지 않는다. 나중에 얹을 수 있다.
- Python 백엔드 이동. npm workspaces와 무관하고, 옮기면 Modal 배포 경로만 흔들린다.
- FSD 레이어 구조 개편. `apps/web` 내부는 그대로 둔다.
- `ADMIN_EMAILS` 화이트리스트를 DB 역할 기반으로 바꾸는 것.
- UI 컴포넌트 공유 패키지화. admin이 쓰는 atom 5개는 복사한다.

### 성공 기준

1. 루트에서 `npm install` 한 번으로 두 앱이 설치되고, `npm run build -w apps/web`·`-w apps/admin`이 통과한다.
2. `apps/web`의 프로덕션 배포가 전환 전과 동일하게 동작한다. 기존 로그인 세션이 유지된다.
3. `admin.a-pch.com/analytics`에서 관리자 이메일로 로그인하면 대시보드가 보이고, 비관리자 계정은 404를 받는다.
4. `a-pch.com/admin/*`이 404가 된다.
5. `apps/admin`의 Vercel 환경변수 목록에 `AWS_*`, `S3_BUCKET_NAME`, `POLAR_*`, `PROCESS_VIDEO_ENDPOINT*`, `MODAL_WEBHOOK_SECRET`이 하나도 없다.
6. web에서 이벤트 이름을 바꾸면 admin의 퍼널 정의가 **컴파일 에러로** 깨진다 (조용히 0이 되지 않는다).

---

## 3. 대안 분석

### 결정 1: 어드민 배포 형태

| 안 | 내용 | 판단 |
|---|---|---|
| 안 | 판단 |
|---|---|
| A. 서브도메인 — `admin.a-pch.com` = 별도 Vercel 프로젝트 | **채택** |
| B. 완전 별개 도메인 — `apch-admin.vercel.app` 등 | A와 실질 차이가 없으면서 도메인 관리만 늘어남 |
| C. 같은 도메인 + rewrite — `a-pch.com/admin/*`를 프록시 | 배포는 갈라지지만 라우팅 결합이 남고 web이 admin의 가용성에 묶인다 |

A를 고른 이유: 배포·롤백·환경변수·CSP·robots를 완전히 독립시킬 수 있다.

**서브도메인 이름은 `admin.`으로 한다.** 채점(가중치: 관리자 UX ×2, 관례 일치 ×2, 노출 최소화 ×1, 설정 비용 ×2):

| 안 | 관리자 UX | 관례 일치 | 노출 최소화 | 설정 비용 | 합계 (35) |
|---|---|---|---|---|---|
| **`admin.`** | 5→10 | 5→10 | 2→2 | 5→10 | **32** |
| `ops.`/`console.` | 4→8 | 3→6 | 3→3 | 5→10 | 27 |
| 서브도메인 없이 `*.vercel.app` | 2→4 | 2→4 | 4→4 | 5→10 | 22 |

노출 최소화에 가중치 1만 준 것은 의도적이다. 어드민은 Google OAuth와 `signIn` 콜백의 이메일 화이트리스트 뒤에 있어 **URL을 알아도 진입할 수 없다.** obscurity는 여기서 실질 방어가 아니라 부수 효과이므로, 이 항목에 높은 가중치를 주면 채점이 결론을 정당화하는 도구가 된다.

세 안 모두 **추가 도메인 구매가 필요 없다.** `a-pch.com`을 이미 소유하고 있으므로 서브도메인은 무제한으로 만들 수 있고, 비용은 0이다.

### 결정 2: 어드민 세션 — 쿠키 공유 vs 자체 로그인

서브도메인을 고르면 자연히 "쿠키 `domain=.a-pch.com`으로 세션 공유"를 떠올리게 된다. 검토 결과 **채택하지 않는다.**

**쿠키 공유의 비용**

1. NextAuth v5는 프로덕션에서 `__Secure-authjs.session-token`을 **domain 속성 없이(host-only)** 굽는다. 여기에 domain을 붙이면 브라우저는 이름은 같고 스코프가 다른 **별개 쿠키**로 취급한다. 두 쿠키가 공존하며 로그아웃 시 한쪽만 지워지는 상태가 만들어진다. 이를 피하려면 기존 쿠키를 명시적으로 만료시켜야 하고, 그 순간 **전 사용자가 강제 로그아웃**된다.
2. NextAuth v5의 기본 `redirect` 콜백은 same-origin URL만 허용한다. 로그인 후 admin으로 돌아오는 `callbackUrl`이 잘리므로 web에 서브도메인 allowlist를 추가해야 한다.
3. admin에는 로그인 페이지가 없다. `authConfigEdge.pages.signIn = "/login"`은 상대 경로라 `admin.a-pch.com/login`(404)으로 간다. admin 쪽 `pages.signIn`을 절대 URL로 분기해야 한다.
4. 로컬 개발에서 `localhost:3000`/`localhost:3001`은 쿠키를 공유하지 못한다. `*.localhost` 세팅이 추가로 필요하다.
5. `AUTH_SECRET`이 두 배포에 공유되어야 하므로 시크릿 회전 절차가 두 곳에 묶인다.

**얻는 것**: 관리자가 로그인을 한 번 덜 한다.

어드민 사용자는 `ADMIN_EMAILS`에 등재된 1~2명이다. 비용이 이득을 크게 초과한다.

**채택: admin이 자체 NextAuth 인스턴스를 갖는다.**

- Google provider + JWT 전략, **`PrismaAdapter` 없음**
- `ADMIN_EMAILS` 화이트리스트는 `signIn` 콜백에서 검사 (통과 못 하면 로그인 자체를 거부)
- 위 5개 비용이 전부 사라진다. web의 인증 코드는 **한 줄도 바뀌지 않는다**
- 부수 효과(이득): 어드민 로그인이 `User`/`Account` 테이블에 레코드를 만들지 않는다
- 비용: admin에 Google 버튼 하나짜리 로그인 페이지, Google Console에 redirect URI 1개 추가

### 결정 3: 공유 패키지 범위

| 대상 | 공유? | 근거 |
|---|---|---|
| Prisma 스키마 + 클라이언트 | **필수** | 두 앱이 같은 DB를 읽는다. 스키마가 두 벌이면 마이그레이션이 갈라진다 |
| analytics 계약 (이벤트 이름·퍼널·타입) | **필수** | §1의 `satisfies` 방어선이 복사하는 순간 무력화된다 |
| auth | 불필요 | 결정 2에 따라 admin이 자체 구현(약 40줄). 공유할 표면이 없다 |
| tsconfig/eslint/prettier/tailwind preset | 불필요 | 앱 2개에서는 복사로 충분하다. 필요해지면 그때 뽑는다 (YAGNI) |
| UI atoms | 불필요 | admin이 쓰는 건 5개. 복사가 `@repo/ui` 도입보다 싸다 |

**결론: 패키지는 `packages/db` 하나.** analytics 계약도 여기에 둔다. `AnalyticsEvent` 모델이 같은 스키마에 있으므로 배치가 어색하지 않고, 패키지 수를 늘리지 않는다.

### 결정 4: 모노레포 툴링

**npm workspaces만 채택.** 현재 npm 10.9.2를 그대로 쓴다.

- pnpm 전환은 `legacy-peer-deps=true`에 의존하는 현재 의존성 트리를 strict node_modules에서 다시 맞춰야 한다. 얻는 것 대비 위험이 크다.
- Turborepo는 앱 2개에서 체감 이득이 없다. `turbo.json`만 추가하면 언제든 얹을 수 있다.

### 결정 5: `generated/prisma` 23개 임포트를 어떻게 처리할 것인가

| 안 | 내용 | 판단 |
|---|---|---|
| A. tsconfig `paths` 별칭 유지 | `"generated/prisma": ["../../packages/db/generated/prisma"]` | 패키지 경계를 넘는 딥 경로 별칭이 영구히 남는다. Vercel 파일 트레이싱·Turbopack에서 미묘한 문제 여지 |
| B. 일괄 치환 | `from "generated/prisma"` → `from "@repo/db"` | **채택** |

23개 파일이지만 임포트 경로 문자열 치환이고, `tsc --noEmit`이 누락을 100% 잡는다. 별칭을 남기지 않는 쪽이 이후 유지보수가 단순하다.

반면 `~/server/db`(11개)와 `~/fsd/shared/analytics/event-catalog`(19개)는 **재수출 shim을 남긴다.** 앱 내부의 정당한 간접 계층이고, shim이 1~2줄이라 비용이 없다.

### 결정 6: admin의 Sentry 구성

가중치: 운영 유지비 ×3, admin 장애 관측 ×2, 이슈 구분·알림 유연성 ×2, 쿼터 소모 ×1.

| 안 | 유지비 | 관측 | 구분 | 쿼터 | 합계 (40) |
|---|---|---|---|---|---|
| **같은 프로젝트 + `app` 태그** | 4→12 | 5→10 | 4→8 | 4→4 | **34** |
| admin에 Sentry 없음 | 5→15 | 2→4 | 3→6 | 5→5 | 30 |
| 별도 Sentry 프로젝트 | 2→6 | 5→10 | 5→10 | 3→3 | 29 |

**채택: 같은 프로젝트 + `initialScope: { tags: { app: "admin" } }`.**

"Sentry 없음"과의 차이가 4점뿐이다. 이 안은 실제로 진지하게 검토했다 — `@sentry/nextjs` 의존성, `instrumentation.ts`, `sentry.server.config.ts`, `SENTRY_*` env가 전부 빠져 admin이 확실히 가벼워지고, admin은 관리자 본인만 쓰므로 "사용자가 겪은 에러를 내가 못 본다"는 Sentry의 존재 이유가 성립하지 않는다.

뒤집은 근거는 하나다. **admin은 Neon DB를 직접 쿼리한다.** 연결 실패나 타임아웃이 나면 화면에는 Next.js 에러 페이지만 뜨고, 원인을 보려면 Vercel 함수 로그를 뒤져야 한다. Sentry가 이미 조직에 있으므로 태그 한 줄로 스택 추적이 남는다 — 한계 비용이 그만큼 낮다.

별도 프로젝트가 가장 낮은 것은 얻는 것이 "이슈 목록 분리"뿐인데 admin 볼륨이 거의 0이라 분리할 대상이 없기 때문이다. 부수 이득도 하나 잃는다 — 같은 DSN을 쓰면 admin의 테스트 패널이 **web과 같은 DSN·네트워크·조직 수신 상태**를 함께 검증한다.

> **쿼터에 대한 정정**: Sentry 무료 플랜의 이벤트 쿼터는 조직 단위 풀이므로 프로젝트를 쪼개도 총량은 같다. 쿼터는 이 결정의 변수가 아니다.

### 결정 7: 어드민 인증 강도

`ADMIN_EMAILS`에서 계정을 제거해도 **기존 JWT는 만료 전까지 유효하다.** NextAuth 기본 `maxAge`는 30일이다(§7 리스크 7).

가중치: 보안 이득 ×2, 관리자 UX 마찰 ×2, 구현·운영 비용 ×2, 플랜 독립성 ×1.

| 안 | 보안 | UX | 비용 | 플랜 | 합계 (35) |
|---|---|---|---|---|---|
| **화이트리스트 + 세션 8시간** | 5→10 | 4→8 | 5→10 | 5→5 | **33** |
| 화이트리스트만 | 3→6 | 5→10 | 5→10 | 5→5 | 31 |
| + Vercel 배포 보호(비밀번호) | 5→10 | 2→4 | 3→6 | 2→2 | 22 |

**채택: Google 전용(web과 동일) + `session.maxAge = 60 * 60 * 8`.**

한 줄로 노출 창이 30일에서 8시간으로 줄어든다. Google 세션이 살아있으면 재로그인은 버튼 클릭 한 번이라 마찰이 작다. Vercel 배포 보호는 Pro 플랜 의존이고 OAuth 콜백 경로 예외가 필요하며, 이미 Google 계정 + 화이트리스트 두 겹이 있는 상태에서 세 번째 겹의 한계 이득이 작다.

### 결정 8: `DATABASE_URL` 검증 책임의 위치

`next.config.js`가 `import "./src/env.js"`로 **빌드 시작 시점에** 검증을 트리거한다는 제약이 이 결정을 지배한다. 검증을 패키지로만 옮기면 그 시점이 런타임까지 밀려, 누락을 배포 후에야 알게 된다.

가중치: 단일 진실 ×2, 빌드 타임 조기 검증 ×3, `env.js` 가독성 ×1, 구현 비용 ×2.

| 안 | 단일 진실 | 빌드 검증 | 가독성 | 비용 | 합계 (40) |
|---|---|---|---|---|---|
| **각 앱만 검증, 패키지는 안 함** | 3→6 | 5→15 | 5→5 | 5→10 | **36** |
| 둘 다 검증 | 2→4 | 5→15 | 5→5 | 5→10 | 34 |
| `packages/db`만 검증 | 5→10 | 2→6 | 2→2 | 5→10 | 28 |

**채택: `packages/db`는 env를 검증하지 않는다.** `process.env.DATABASE_URL`을 그대로 읽고, 검증은 각 앱의 `env.js`가 한다. `packages/db/src/env.ts` 파일 자체가 필요 없어진다.

두 앱에 같은 변수 선언이 남지만 이는 드리프트가 아니다 — 각 앱이 자기 의존을 선언하는 것이고, `apps/admin/src/env.js`만 봐도 그 앱이 DB를 쓴다는 사실이 드러난다.

유일한 구멍은 `prisma migrate deploy`를 `packages/db`에서 직접 실행할 때 앱 검증이 돌지 않는다는 점인데, Prisma CLI 자체가 `DATABASE_URL` 없이는 에러를 내므로 실질 위험이 없다.

### 결정 9: admin의 `next-themes` 채택 여부

**채택하지 않는다.** 코드 확인 결과 web에서도 실질적으로 죽은 의존성이다.

- `next-themes`를 쓰는 곳은 `shared/ui/atoms/sonner.tsx:10`의 `useTheme()` 단 하나
- `app/providers.tsx`에 **`ThemeProvider`가 없다** → provider 없이 호출되므로 `theme`은 항상 기본값
- `styles/globals.css:92`에 `.dark` 클래스는 있으나 이를 토글하는 코드가 없다

admin으로 sonner atom을 복사할 때 `useTheme()` 호출을 제거하고 `theme="system"`으로 고정한다. 의존성 하나가 빠진다.

> web의 죽은 `next-themes` 의존성 정리는 이 문서의 범위 밖이다. 별건으로 다룬다.

### 결정 10: `.env` 배치

Phase 2 이후 `prisma db push`/`migrate`는 `packages/db`를 cwd로 실행되는데, 현재 `.env`는 `apps/web/.env` 하나뿐이고 git 미추적이다.

가중치: 시크릿 드리프트 방지 ×3, 패키지 경계 일관성 ×2, 로컬 개발 편의 ×2, 구현 비용 ×2.

| 안 | 드리프트 | 경계 | 로컬 편의 | 비용 | 합계 (45) |
|---|---|---|---|---|---|
| **루트 `.env` 유일본 + 앱이 dotenv로 로드** | 5→15 | 5→10 | 4→8 | 4→8 | **41** |
| 마이그레이션 CLI를 `apps/web`에 남김 | 5→15 | 2→4 | 5→10 | 5→10 | 39 |
| `packages/db`에 별도 `.env` | 1→3 | 5→10 | 4→8 | 5→10 | 31 |

**별도 `.env` 안을 배제하는 이유**: `DATABASE_URL`이 두 파일에 존재하면 한쪽만 바꿨을 때 로컬 앱과 마이그레이션이 서로 다른 DB를 보게 된다. **조용히 틀린 DB에 push할 수 있고**, 되돌리기 어려운 종류의 사고다. 드리프트 항목에 가장 높은 가중치를 준 이유가 이것이다.

**"CLI를 web에 남김"과의 2점 차이**는 경계 일관성에서 나온다. 그 안은 `packages/db`가 스키마를 소유하면서 스키마 명령은 `apps/web`에 있는 상태를 만든다. 결정 3에서 세운 "DB 자산은 패키지가 소유한다"가 흐려지고, admin이 나중에 마이그레이션을 돌려야 할 때 다시 갈라진다. 다만 차이가 작으므로, `dotenv` 선로드가 실제로 번거롭다고 판단되면 뒤집을 만한 선택지다.

구현 세부(Next.js가 루트 `.env`를 자동 로드하지 않는 문제 포함)는 §4.1.1에 있다.

---

## 4. 구현 계획

### 4.0 목표 디렉터리 구조

```
ApcH/
├─ package.json                  # private, workspaces: ["apps/*", "packages/*"]
├─ .npmrc                        # legacy-peer-deps=true  ← frontend에서 승격
├─ .env                          # 유일본 (gitignore). 결정 10
├─ .env.example                  # 커밋 대상
├─ package-lock.json             # 단일 lockfile
├─ apps/
│  ├─ web/                       # 기존 ai-podcast-clipper-frontend
│  └─ admin/                     # 신규
├─ packages/
│  └─ db/
│     ├─ package.json            # name: "@repo/db"
│     ├─ tsconfig.json
│     ├─ prisma/schema.prisma
│     ├─ generated/prisma/       # ⚠️ git 추적 대상. gitignore 하지 않는다 (아래)
│     └─ src/
│        ├─ index.ts             # db + Prisma 타입 재수출 + analytics 계약 재수출
│        ├─ client.ts            # 기존 src/server/db.ts (env 검증 없음 — 결정 8)
│        └─ analytics-contract.ts
├─ ai-podcast-clipper-backend/   # 이동 없음
└─ docs/proposals/
```

> **`generated/prisma`는 커밋 대상이다.** 이 저장소는 Prisma 산출물 27개 파일을 의도적으로 추적한다. 근거는 `.gitignore:19-20`의 주석("generated/prisma는 커밋 대상이지만 이 찌꺼기는 제외한다")과 `git ls-files`로 확인한 27개 추적 파일이다. `git mv`로 함께 옮기고 **추적을 유지한다.** `.gitignore`에서 갱신할 것은 `generated/prisma/*.tmp*` 규칙의 경로뿐이다.
>
> (초안은 `CLAUDE.md:80`도 근거로 들었으나 그 줄은 "Generated client in `generated/prisma/` (not `node_modules`)"로 **생성 위치만 서술**하며 git 추적과 무관하다. 인용에서 뺐다.)
>
> 커밋된 엔진은 `query_engine-windows.dll.node`(21MB, Windows 전용)와 `query_engine_bg.wasm`이다. **Linux 엔진은 커밋되어 있지 않으므로 Vercel 배포는 `postinstall`의 `prisma generate`에 의존한다.** 이 의존은 현행과 동일하며, Phase 2 게이트에서 명시적으로 확인한다(§5).

### 4.1 루트 워크스페이스

**신규 `package.json`**

```json
{
  "name": "apch",
  "private": true,
  "workspaces": ["apps/*", "packages/*"],
  "scripts": {
    "dev": "npm run dev -w apps/web",
    "dev:admin": "npm run dev -w apps/admin",
    "build": "npm run build --workspaces --if-present",
    "check": "npm run check --workspaces --if-present",
    "test": "npm run test --workspaces --if-present",
    "db:push": "npm run db:push -w @repo/db",
    "db:migrate": "npm run db:migrate -w @repo/db",
    "db:studio": "npm run db:studio -w @repo/db"
  },
  "packageManager": "npm@10.9.2"
}
```

**신규 루트 `.npmrc`**: `legacy-peer-deps=true` (`apps/web/.npmrc`는 삭제)

`ai-podcast-clipper-frontend` → `apps/web`은 `git mv`로 옮겨 히스토리를 보존한다.

**테스트 러너 배선** — 현재 프로젝트에 `test` 스크립트가 없다. `.test.mjs` 파일이 4개 있으나 실행 경로가 없어서 아무도 돌리지 않는다.

```
현존 테스트 (실행 경로 없음)
  src/fsd/entities/analytics-event/model/reporting.test.mjs
  src/fsd/shared/analytics/lib/metadata.test.mjs
  src/fsd/shared/analytics/lib/normalize-path.test.mjs
  src/fsd/widgets/clip-draft-review/model/selection-budget.test.mjs
```

각 앱 `package.json`에 아래를 추가한다. Node 내장 러너를 쓰므로 의존성이 늘지 않는다.

```json
"test": "node --test \"src/**/*.test.mjs\""
```

**이 배선은 Phase 1의 필수 항목이다.** §8이 `reporting.test.mjs` 통과를 게이트로 삼는데, 배선 없이는 그 게이트를 실행할 수 없다.

### 4.1.1 `.env` 배치 (결정 10)

Phase 2 이후 `prisma db push`/`migrate`는 `packages/db`를 cwd로 실행되는데 거기에는 `.env`가 없다. 현재 `.env`는 `apps/web/.env` 하나뿐이고 git 미추적이다.

**`.env`를 저장소 루트로 올려 유일본으로 둔다.** 시크릿이 한 곳에만 있어 드리프트가 생기지 않는다.

단, **Next.js는 `.env`를 `process.cwd()`에서 읽는다.** `npm run dev -w apps/web`은 cwd가 `apps/web`이므로 루트 `.env`를 자동으로 로드하지 않는다. 각 앱의 `next.config.js` 최상단에서 명시적으로 로드한다.

```js
// apps/web/next.config.js  (apps/admin도 동일)
// dotenv 로드가 env.js 검증보다 먼저 실행되어야 한다.
// import 순서가 곧 실행 순서이므로 이 두 줄의 위치를 바꾸면 안 된다.
import { config } from "dotenv";
config({ path: "../../.env" });

import "./src/env.js";
```

- 각 앱에 `dotenv`를 devDependency로 추가한다
- Prisma CLI는 cwd 상위를 탐색하므로 `packages/db`에서는 추가 설정이 필요 없다
- Vercel은 환경변수를 프로세스에 직접 주입하므로 프로덕션에는 영향이 없다 (`.env` 파일이 없어도 `dotenv`가 조용히 통과한다)
- `.env`는 git 미추적이므로 **Phase 1에서 수동으로 이동해야 한다.** `git mv`는 이 파일을 옮기지 않는다

> **`NEXT_PUBLIC_*` 인라이닝 확인이 필요하다.** 이 방식은 Next의 앱별 `.env` 관례를 우회한다. web에는 `NEXT_PUBLIC_SITE_URL`과 `NEXT_PUBLIC_SUBSCRIPTION_ENABLED`가 있고, Next는 이들을 빌드 시점에 클라이언트 번들로 인라인한다. dotenv가 `process.env`를 채우는 시점이 그 인라이닝보다 앞서야 한다. 프로덕션은 Vercel이 직접 주입하므로 무관하지만 **로컬 개발과 Phase 0 검증에서 확인한다**(§5 Phase 0 확인 d). 인라이닝이 실패하면 앱별 `.env`로 되돌리고 결정 10을 재검토한다.

### 4.2 `packages/db`

**`packages/db/package.json`**

```json
{
  "name": "@repo/db",
  "version": "0.0.0",
  "private": true,
  "type": "module",
  "main": "./src/index.ts",
  "types": "./src/index.ts",
  "exports": { ".": "./src/index.ts" },
  "scripts": {
    "postinstall": "prisma generate",
    "db:generate:client": "prisma generate",
    "db:push": "prisma db push",
    "db:migrate": "prisma migrate deploy",
    "db:generate": "prisma migrate dev",
    "db:studio": "prisma studio"
  },
  "dependencies": {
    "@prisma/adapter-neon": "^7.5.0",
    "@prisma/client": "^6.19.1"
  },
  "devDependencies": { "prisma": "^6.19.1" }
}
```

트랜스파일하지 않고 TS 소스를 그대로 노출한다(`main`이 `.ts`). Next.js가 워크스페이스 패키지를 컴파일하도록 두 앱의 `next.config.js`에 `transpilePackages: ["@repo/db"]`를 추가한다.

**`packages/db/tsconfig.json`**

```json
{
  "compilerOptions": {
    "target": "es2022",
    "lib": ["ES2022"],
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "strict": true,
    "noUncheckedIndexedAccess": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "isolatedModules": true,
    "verbatimModuleSyntax": true,
    "resolveJsonModule": true,
    "noEmit": true
  },
  "include": ["src/**/*.ts"],
  "exclude": ["node_modules", "generated"]
}
```

`exclude`에 `generated`가 있는 것이 중요하다. `generated/prisma/index.d.ts`는 825KB이고, web의 `tsconfig.json`도 같은 이유로 `"exclude": ["node_modules", "generated"]`를 갖고 있다. 이걸 빼면 `strict`/`noUncheckedIndexedAccess` 아래에서 Prisma 생성 코드가 재검사되며 예상 못 한 에러가 난다.

**이동 대상**

| 이동 전 | 이동 후 | 방법 |
|---|---|---|
| `apps/web/prisma/schema.prisma` | `packages/db/prisma/schema.prisma` | `git mv` |
| `apps/web/generated/` | `packages/db/generated/` | `git mv` (**추적 유지**) |
| `apps/web/src/server/db.ts` | `packages/db/src/client.ts` | `git mv` |

`schema.prisma`의 `generator.output`은 `"../generated/prisma"`로 유지한다(패키지 기준 상대 경로라 값 변경 없음).

**`packages/db/src/client.ts`** — 현행 `src/server/db.ts`에서 `~/env` 의존만 걷어낸다. 검증은 각 앱의 `env.js`가 하므로(결정 8) 이 패키지는 `process.env`를 직접 읽는다.

```ts
import { PrismaNeon } from "@prisma/adapter-neon";
import { PrismaClient } from "../generated/prisma";

// 검증 책임은 앱에 있다(결정 8). 여기서 다시 검증하면
// 스키마가 세 곳으로 갈라지고, next.config.js가 트리거하는
// 빌드 타임 검증이 이미 누락을 잡는다.
const createPrismaClient = () => {
  const adapter = new PrismaNeon({
    connectionString: process.env.DATABASE_URL!,
  });
  return new PrismaClient({
    adapter,
    log:
      process.env.NODE_ENV === "development"
        ? ["query", "error", "warn"]
        : ["error"],
  });
};

const globalForPrisma = globalThis as unknown as {
  prisma: ReturnType<typeof createPrismaClient> | undefined;
};

export const db = globalForPrisma.prisma ?? createPrismaClient();

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = db;
```

`globalForPrisma` 캐시와 `PrismaNeon` 어댑터 사용은 현행과 동일하다.

**`packages/db/src/index.ts`**

```ts
export { db } from "./client";
export type * from "../generated/prisma";
export { Prisma } from "../generated/prisma";
export * from "./analytics-contract";
```

> **`export type *`는 타입만 내보낸다.** 오늘은 값으로 쓰이는 것이 `Prisma` 네임스페이스뿐이라(`Prisma.PrismaClientKnownRequestError` 2곳) 문제가 없다. 그러나 나중에 스키마에 **enum을 추가하고 그 값을 런타임에 쓰면** 재수출되지 않아 `undefined`가 된다. 그런 사용은 `import type`으로 깨끗해 `tsc`가 잡지 못한다 — §8 #2가 경고하는 것과 같은 실패 계열이다. enum을 도입하는 시점에 `export { SomeEnum } from "../generated/prisma"`를 명시적으로 추가해야 한다.

**`apps/web`에서 `postinstall: "prisma generate"` 제거.** 워크스페이스 설치 시 `packages/db`의 postinstall이 대신 돈다.

**`.gitignore`** — `generated/` 자체를 무시하면 **안 된다**(§4.0). 파일 이동에 맞춰 규칙 소유자만 옮긴다.

| 파일 | 조치 |
|---|---|
| `apps/web/.gitignore` | `generated/prisma/*.tmp*` 규칙 **제거** (해당 디렉터리가 더 이상 없다) |
| `packages/db/.gitignore` | **신규.** `generated/prisma/*.tmp*` 한 줄. Windows에서 `prisma generate`가 남기는 21MB 찌꺼기를 막는 기존 규칙을 그대로 이어받는다 |
| 루트 `.gitignore` | **신규.** `.env`, `.env*.local`. `.env`가 루트로 올라오므로(결정 10) 무시 규칙도 루트에 있어야 한다 |

`apps/web/.gitignore`의 `.env` 규칙은 남겨둔다. 앱 디렉터리에 `.env`가 실수로 다시 생겨도 커밋되지 않게 하는 방어선이다.

### 4.3 analytics 계약 분리

**`packages/db/src/analytics-contract.ts`** — 다음 3개 소스를 합친다.

1. `apps/web/src/fsd/shared/analytics/event-catalog.ts`의 `ANALYTICS_EVENT_NAMES`, `AnalyticsEventName`
   - **`ANALYTICS_METADATA_KEYS_BY_EVENT` 재수출(`event-catalog.ts:34`)은 가져오지 않는다.** 이 상수는 `recordAnalyticsEvent`만 쓰는 web 전용이다. `lib/metadata.ts`는 web에 남는다.
2. `apps/web/src/fsd/entities/analytics-event/model/funnels.ts` 전체 (`ANALYTICS_FUNNELS`, `FUNNEL_LABELS`)
3. `apps/web/src/fsd/entities/analytics-event/model/types.ts` 전체

`satisfies Record<FunnelId, readonly AnalyticsEventName[]>` 절은 그대로 유지된다. 세 조각이 한 파일에 모이므로 오히려 강해진다.

**web 쪽 shim** — `apps/web/src/fsd/shared/analytics/event-catalog.ts`

```ts
export { ANALYTICS_EVENT_NAMES } from "@repo/db";
export type { AnalyticsEventName } from "@repo/db";
export { ANALYTICS_METADATA_KEYS_BY_EVENT } from "./lib/metadata";
```

→ web의 19개 사용처 무수정.

`apps/web/src/fsd/entities/analytics-event/model/{funnels,types}.ts`도 `@repo/db` 재수출 shim으로 남긴다.

### 4.4 `apps/web` 잔여 조정

| 항목 | 조치 |
|---|---|
| `generated/prisma` 임포트 23개 | `from "@repo/db"`로 일괄 치환 |
| `src/server/db.ts` | `export { db } from "@repo/db";` shim |
| `package.json` | `prisma`/`@prisma/*` 의존성 제거, `"@repo/db": "*"` 추가, `postinstall`·`db:*` 스크립트 제거 |
| `next.config.js` | `transpilePackages: ["@repo/db"]` + **`outputFileTracingRoot`(§4.9, 필수)** 추가. `serverExternalPackages: ["@prisma/adapter-neon"]`은 유지. **최상단에 `dotenv` 선로드 2줄 추가** (§4.1.1) |
| `package.json` (2) | `"test": "node --test \"src/**/*.test.mjs\""` 추가, `dotenv` devDependency 추가 |
| `src/env.js` | **변경 없음.** `DATABASE_URL`/`DATABASE_URL_UNPOOLED` 검증을 그대로 유지한다 — 결정 8에 따라 검증 책임이 앱에 있다 |

**Phase 4까지 미룰 것** (admin 배포가 뜬 뒤에 제거해야 어드민 공백이 없다):

- `src/middleware.ts:7` matcher에서 `"/admin/:path*"` 제거
- `src/server/auth/config.edge.ts:3` `PROTECTED_ROUTES`에서 `"/admin"` 제거
- `src/app/admin/` 삭제
- `src/fsd/pages/admin-analytics/`, `src/fsd/pages/admin-observability/`, `src/fsd/features/observability-test/` 삭제
- `src/fsd/shared/api/admin-guard.ts` 삭제
- `src/fsd/entities/analytics-event/api/index.ts`에서 리포팅 4개 함수 제거 (record/cleanup만 남김)
- `src/fsd/entities/analytics-event/model/reporting.ts`·`reporting.test.mjs` 삭제
- `src/env.js`에서 `ADMIN_EMAILS` 제거

### 4.5 `apps/admin` 신설

**라우트 매핑** — 서브도메인이 이미 admin을 뜻하므로 `/admin` prefix를 제거한다.

| 이동 전 | 이동 후 |
|---|---|
| `a-pch.com/admin/analytics` | `admin.a-pch.com/analytics` |
| `a-pch.com/admin/observability` | `admin.a-pch.com/observability` |

**`apps/admin/package.json` 의존성** — 복사한 atom들이 전이 의존성을 끌고 온다. Phase 3 빌드가 하나씩 터뜨리게 두지 않는다.

```jsonc
"dependencies": {
  "@repo/db": "*",
  "next": "15.5.7",
  "react": "^19.0.0",
  "react-dom": "^19.0.0",
  "next-auth": "5.0.0-beta.25",
  "@sentry/nextjs": "^10.68.0",
  "@t3-oss/env-nextjs": "^0.12.0",
  "zod": "^3.25.76",
  "server-only": "^0.0.1",
  // 복사한 atom이 요구하는 것
  "@radix-ui/react-slot": "^1.2.4",   // button, badge
  "class-variance-authority": "^0.7.1", // button, badge
  "clsx": "^2.1.1",                    // cn
  "tailwind-merge": "^3.4.0",          // cn
  "sonner": "^2.0.7",                  // Toaster
  "lucide-react": "^0.553.0"           // 아이콘 사용 시
  // next-themes는 넣지 않는다 (결정 9)
},
"devDependencies": {
  "dotenv": "^16",                     // 결정 10
  "typescript": "^5.8.2",
  "@types/node": "^20.14.10",
  "@types/react": "^19.0.0",
  "@types/react-dom": "^19.0.0",
  "tailwindcss": "^4.0.15",
  "@tailwindcss/postcss": "^4.0.15",
  "postcss": "^8.5.3",
  "tw-animate-css": "^1.4.0",
  "eslint": "^9.23.0",
  "eslint-config-next": "^15.2.3",
  "prettier": "^3.5.3",
  "prettier-plugin-tailwindcss": "^0.6.11"
}
```

버전은 web의 `package.json`과 맞춘다. 워크스페이스 호이스팅이 같은 버전을 공유하므로 어긋나면 중복 설치가 생긴다.

**파일 구성**

```
apps/admin/
├─ package.json
├─ next.config.js
├─ tsconfig.json            # paths: { "~/*": ["./src/*"] }
├─ postcss.config.js, eslint.config.js, prettier.config.js
├─ vercel.json              # regions: ["icn1"]
└─ src/
   ├─ env.js                # 아래 목록만
   ├─ middleware.ts
   ├─ instrumentation.ts
   ├─ sentry.server.config.ts
   ├─ styles/globals.css    # web에서 복사
   ├─ auth/
   │  ├─ config.edge.ts     # Edge 호환. session/pages/authorized만
   │  ├─ config.ts          # config.edge + Google provider + ADMIN_EMAILS signIn 게이트
   │  ├─ index.ts           # NextAuth() 인스턴스, cache(auth)
   │  └─ guard.ts           # requireAdmin()
   ├─ app/
   │  ├─ layout.tsx         # 기존 app/admin/layout.tsx 기반
   │  ├─ page.tsx           # /analytics로 redirect
   │  ├─ login/page.tsx     # 신규. Google 버튼 1개
   │  ├─ analytics/page.tsx
   │  ├─ observability/page.tsx
   │  ├─ api/auth/[...nextauth]/route.ts
   │  └─ robots.ts          # 전체 disallow
   ├─ analytics/
   │  ├─ reporting.ts       # web에서 이동 (순수 함수, 임포트 없음)
   │  ├─ reporting.test.mjs # web에서 이동
   │  └─ queries.ts         # getAnalyticsOverview / getFunnelReport /
   │                        #   getDropOffReport / getRecentFailureEvents
   ├─ observability/
   │  ├─ report-error.ts    # web shared/observability에서 복사
   │  ├─ index.ts
   │  └─ test-action.ts     # features/observability-test/api에서 이동
   ├─ lib/
   │  ├─ result.ts          # shared/api/result.ts 복사 (서버 액션이 사용)
   │  └─ utils.ts           # shared/lib/utils.ts 복사 (cn)
   └─ ui/
      ├─ analytics-page.tsx # pages/admin-analytics/ui/index.tsx
      ├─ format-rate.ts     # pages/admin-analytics/lib
      ├─ types.ts           # pages/admin-analytics/model
      ├─ observability-panel.tsx
      └─ atoms/             # button, card, table, badge, sonner 복사
```

admin 내부는 FSD를 적용하지 않는다. 화면 2개 규모에서 레이어 규칙은 비용만 된다.

**atom 복사 시 주의** — `sonner.tsx`는 `useTheme()`(`next-themes`)을 호출하지만, web에도 `ThemeProvider`가 없어 항상 기본값을 반환한다(결정 9). 복사할 때 `useTheme()` 호출을 제거하고 `theme="system"`으로 고정한다. `apps/admin`은 `next-themes`를 의존성에 넣지 않는다.

**`queries.ts`** — 현행 `entities/analytics-event/api/index.ts`에서 리포팅 4개 함수와 그 상수(`RANGE_DAYS`, `FAILURE_EVENT_NAMES`)를 옮긴다. `db`는 `@repo/db`에서, 이벤트 이름·퍼널·타입도 `@repo/db`에서 가져온다.

**`apps/admin/src/env.js`** — 필요한 것만.

```
server: DATABASE_URL, DATABASE_URL_UNPOOLED?, NODE_ENV,
        AUTH_SECRET, AUTH_URL?, AUTH_GOOGLE_ID, AUTH_GOOGLE_SECRET,
        ADMIN_EMAILS, SENTRY_DSN?, SENTRY_AUTH_TOKEN?
client: (없음)
```

`DATABASE_URL` 검증이 여기 있는 것은 의도적이다 — 결정 8에 따라 검증 책임이 앱에 있고, `next.config.js`의 `import "./src/env.js"`가 빌드 시작 시점에 이를 트리거한다.

`SENTRY_ORG`/`SENTRY_PROJECT`는 `env.js`가 아니라 `next.config.js`가 직접 읽으므로(web과 동일 구조) 이 목록에 없다. Vercel 환경변수로는 주입해야 한다.

`AWS_*`, `S3_BUCKET_NAME`, `PROCESS_VIDEO_ENDPOINT*`, `POLAR_*`, `INNGEST_*`, `CLOUDFRONT_*`, `MODAL_WEBHOOK_SECRET`, `NEXT_PUBLIC_*`는 넣지 않는다.

**`next.config.js`** — web에서 복사하되 줄인다.

- `transpilePackages: ["@repo/db"]`, `serverExternalPackages: ["@prisma/adapter-neon"]`, **`outputFileTracingRoot`(§4.9)**
- `images.remotePatterns`: Google 프로필 이미지를 안 쓰면 제거
- CSP: `frame-src`에서 Polar 제거, `img-src`/`media-src`/`connect-src`에서 S3·Inngest·Polar 제거. `connect-src`는 `'self'` + Neon만
- 나머지 보안 헤더(`X-Frame-Options: DENY` 등)는 그대로

**`middleware.ts`**

```ts
import NextAuth from "next-auth";
import { authConfigEdge } from "~/auth/config.edge";

export default NextAuth(authConfigEdge).auth;

// /login도 matcher에 포함된다. 제외하지 않는 이유는 이미 로그인한 사용자를
// /analytics로 되돌려보내기 위해서다. 미인증 사용자가 /login에서 다시
// /login으로 튕기지 않도록 authorized 콜백이 AUTH_ROUTES를 명시 처리한다(§4.6).
export const config = {
  matcher: ["/((?!api|_next/static|_next/image|favicon.ico).*)"],
};
```

`/login`을 제외한 전 경로를 보호한다.

### 4.6 `apps/admin` 인증

web과 동일하게 Edge/Node 2단 구성을 따른다. `config.ts`가 `~/env`(Node 런타임)에 의존하므로 middleware는 Edge 호환 설정만 본다.

**`src/auth/config.edge.ts`** — Prisma·env 의존 없음. middleware가 이것만 쓴다.

```ts
import type { NextAuthConfig } from "next-auth";

const AUTH_ROUTES = ["/login"];

export const authConfigEdge = {
  providers: [],
  session: {
    strategy: "jwt",
    // 결정 7. ADMIN_EMAILS에서 제거한 계정의 기존 JWT가 유효한 창을
    // 기본 30일에서 8시간으로 줄인다. 이 값이 §7 리스크 7의 완화책이다.
    maxAge: 60 * 60 * 8,
  },
  pages: { signIn: "/login" },
  callbacks: {
    // ⚠️ `authorized: ({ auth }) => !!auth?.user`로 축약하면 안 된다.
    // matcher가 /login을 포함하므로, 미인증 요청이 false를 받으면
    // NextAuth가 pages.signIn(= /login)으로 리다이렉트하고 미들웨어가
    // 다시 돌아 false를 받는다. 무한 리다이렉트가 된다.
    // web의 config.edge.ts가 AUTH_ROUTES를 명시 처리하는 것과 같은 이유다.
    authorized({ auth, request: { nextUrl } }) {
      const isLoggedIn = !!auth?.user;
      const isAuthRoute = AUTH_ROUTES.some((route) =>
        nextUrl.pathname.startsWith(route),
      );

      if (isAuthRoute) {
        return isLoggedIn
          ? Response.redirect(new URL("/analytics", nextUrl))
          : true;
      }

      return isLoggedIn;
    },
  },
} satisfies NextAuthConfig;
```

admin은 web과 달리 `PROTECTED_ROUTES` 목록이 없다. `/login`을 뺀 **전 경로가 보호 대상**이므로 기본값이 `return isLoggedIn`이다.

**`src/auth/config.ts`** — Edge 설정을 확장한다.

```ts
import Google from "next-auth/providers/google";
import type { NextAuthConfig } from "next-auth";
import { env } from "~/env";
import { authConfigEdge } from "./config.edge";

function getAdminEmailSet() {
  return new Set(
    (env.ADMIN_EMAILS ?? "")
      .split(",").map((e) => e.trim().toLowerCase()).filter(Boolean),
  );
}

export const authConfig = {
  ...authConfigEdge,
  providers: [Google],
  callbacks: {
    ...authConfigEdge.callbacks,
    // 화이트리스트 밖 계정은 로그인 자체를 거부한다.
    // 세션이 만들어지지 않으므로 guard는 2차 방어선이 된다.
    signIn: ({ user }) => {
      const email = user.email?.toLowerCase();
      return !!email && getAdminEmailSet().has(email);
    },
    session: ({ session, token }) => ({
      ...session,
      user: { ...session.user, id: token.sub },
    }),
  },
} satisfies NextAuthConfig;
```

`adapter`가 없다. Google 로그인 + JWT 전략은 어댑터 없이 동작하며, 어드민 로그인이 DB에 레코드를 만들지 않는다.

**`src/auth/index.ts`** — web의 `server/auth/index.ts`와 동일 패턴. `NextAuth(authConfig)`에서 `auth`/`handlers`/`signIn`/`signOut`을 꺼내고 `auth`는 `cache()`로 감싼다.

**`src/auth/guard.ts`** — 현행 `admin-guard.ts`와 동일한 시그니처(`requireAdmin()` → `{ userId, email }`)를 유지해, 옮겨오는 페이지·서버 액션의 호출부를 바꾸지 않는다. `signIn`에서 이미 걸렀지만 화이트리스트 재검사를 남긴다 — `ADMIN_EMAILS`에서 제거된 계정의 기존 JWT가 만료 전까지 유효하기 때문이다.

### 4.7 `apps/admin` 관측(Sentry)

**web과 같은 Sentry 프로젝트를 쓴다**(결정 6). `SENTRY_DSN`·`SENTRY_ORG`·`SENTRY_PROJECT`·`SENTRY_AUTH_TOKEN` 모두 web과 동일한 값을 주입하고, 구분은 태그로 한다.

`instrumentation.ts`는 web과 동일. `sentry.server.config.ts`는 **복사가 아니라 축소**가 필요하다 — 현행 파일의 `getEndpointHost()`가 `env.PROCESS_VIDEO_ENDPOINT`를 읽는데 admin에는 이 변수가 없다.

```ts
import * as Sentry from "@sentry/nextjs";
import { env } from "~/env";

Sentry.init({
  dsn: env.SENTRY_DSN,
  environment: process.env.VERCEL_ENV ?? "development",
  // web과 같은 프로젝트로 들어오므로 태그로 갈라 본다.
  // 알림 규칙도 이 태그를 조건으로 분기할 수 있다.
  initialScope: { tags: { app: "admin" } },
  sendDefaultPii: false,
  tracesSampleRate: 0,
});
```

web 대비 제거되는 것:

- `SCRUB_RULES`(X-Amz-Signature/Credential/Security-Token) — admin은 presigned URL을 만들지 않는다
- `ENDPOINT_HOST` 치환과 `env.PROCESS_VIDEO_ENDPOINT` 의존 — admin은 Modal을 호출하지 않는다
- `beforeSend` — 스크럽 대상이 없으므로 두지 않는다

**소스맵 릴리스 구분** — 두 앱이 같은 Sentry 프로젝트에 소스맵을 올린다. `@sentry/nextjs`는 릴리스를 커밋 SHA로 잡으므로, 같은 커밋에서 두 앱이 배포되면 동일 릴리스에 소스맵 두 벌이 올라가 스택 추적 매핑이 엉킬 수 있다. `apps/admin/next.config.js`의 `withSentryConfig`에 `dist`를 지정해 갈라놓는다.

```js
export default withSentryConfig(config, {
  authToken: process.env.SENTRY_AUTH_TOKEN,
  sourcemaps: { deleteSourcemapsAfterUpload: true },
  silent: true,
  dist: "admin",   // web은 지정하지 않음(기본값 유지)
});
```

> **테스트 패널이 검증하는 범위** — `sendObservabilityTestEvent`가 보내는 페이로드(`kind: "stuck-processing"`, `uploadedFileId: "observability-test"`)에는 시크릿이 없다. 따라서 이 패널은 **스크럽 규칙을 검증하지 않고**, 해당 앱의 DSN·네트워크 도달·`flush`·`environment` 태그만 검증한다. admin으로 옮기면 검증 대상도 admin으로 바뀐다. 다만 결정 6에 따라 DSN이 web과 같으므로 DSN 유효성·Sentry 조직 수신 여부 같은 **공통 실패는 계속 잡힌다.** web 전용 설정(스크럽 규칙)은 검증 범위 밖이다.
>
> **그리고 web에는 이 패널을 대체할 실전 경로가 생각보다 적다.** `reportPipelineFailure` 호출부는 전수조사 결과 **3곳**이고, 그중 하나가 이 테스트 패널 자신이다. 패널이 admin으로 떠나면 web에 남는 것은 두 곳뿐이다.
>
> ```
> entities/processing-dispatch/api/index.ts:280   dispatch 실패 시
> inngest/functions.ts:1051                        파이프라인 실패 / stuck 감지 시
> ```
>
> 둘 다 **장애가 나야만 발화한다.** 정상 운영이 이어지면 web의 Sentry 전송 경로는 오랫동안 한 번도 태워지지 않은 채 남고, DSN 회전이나 SDK 메이저 업그레이드 후 그것이 깨졌는지 알 방법이 없다. 실제로 장애가 났을 때 알림이 오지 않아서 두 번 아프게 된다.
>
> 이 문서는 이 공백을 **허용된 한계로 남긴다.** 결정 6에 따라 DSN이 공유되므로 "Sentry 조직이 이벤트를 받는가"는 admin 패널로 확인되고, 나머지(web의 `beforeSend` 체인)는 web 전용이다. 이 공백이 실제로 문제가 되면 web에 진단용 route handler를 하나 두는 것이 가장 싼 해법이다(§Open Questions 후속 과제).

### 4.8 Vercel 설정

| | web (기존 프로젝트) | admin (신규) |
|---|---|---|
| Root Directory | `apps/web` | `apps/admin` |
| Install Command | 기본값 (루트에서 워크스페이스 설치) | 기본값 |
| Build Command | 기본값 (`next build`) | 기본값 |
| 도메인 | `a-pch.com` | `admin.a-pch.com` |
| 환경변수 | 현행 유지 | §4.5 목록만 |
| `SENTRY_*` | 현행 유지 | web과 **동일 값** (결정 6) |

Vercel은 npm workspaces를 감지해 저장소 루트에서 설치하고 Root Directory에서 빌드한다.

**Prisma 클라이언트 생성 경로에 주의한다.** 커밋된 엔진은 Windows 전용이므로(§4.0) Vercel(Linux)은 `packages/db`의 `postinstall`이 실행한 `prisma generate` 산출물이 있어야 런타임이 동작한다. npm이 캐시 상태에 따라 postinstall을 건너뛸 수 있으므로 **양쪽 프로젝트의 첫 배포에서 빌드 로그에 `prisma generate`가 찍히는지 확인한다**(Phase 2·4 게이트). 확인되지 않으면 Build Command를 아래로 명시한다.

```
npm run db:generate:client -w @repo/db && next build
```

(`db:generate:client`는 `prisma generate`를 부르는 스크립트다. `db:generate`는 `prisma migrate dev`라서 다른 명령이다.)

**서브도메인 연결** — `a-pch.com`은 Vercel Domains에서 구매했고 nameserver를 Vercel이 자동 관리한다는 서술이 `ai-podcast-clipper-frontend/docs/specs/custom-domain-a-pch-setup-proposal.md` §1.1에 있다. 사실이면 외부 레지스트라에서 CNAME을 넣는 작업이 없다.

> ⚠️ **이 근거는 git으로 검증되지 않는다.** 해당 문서는 `.gitignore:55`(`/docs/*`)로 **추적되지 않는 로컬 전용 파일**이다(`ai-podcast-clipper-frontend/docs/` 아래 추적 파일은 `conventions/tanstack-query-fsd-guidelines.md` 하나뿐). 또한 작성일이 2026-04-17이고 당시 상태를 "구매 완료, 프로젝트 미연결"로 적고 있어, 현재 연결 상태를 보증하지 않는다.
>
> **Phase 4 착수 전에 Vercel 대시보드에서 직접 확인한다**: `a-pch.com`이 web 프로젝트에 연결되어 있는가, nameserver가 `ns1/ns2.vercel-dns.com`인가. 외부 레지스트라 관리 상태라면 서브도메인 추가에 DNS 레코드 작업이 추가된다.

```
Vercel → admin 프로젝트 → Settings → Domains → Add
  admin.a-pch.com
```

DNS 레코드 생성과 TLS 인증서 발급까지 Vercel이 처리한다. **추가 도메인 구매 비용은 없다.**

Google Cloud Console → OAuth 클라이언트에 승인된 리디렉션 URI 추가:
`https://admin.a-pch.com/api/auth/callback/google`

### 4.9 Prisma 엔진 파일 트레이싱 (이 계획의 최대 위험)

**이 절이 Phase 2를 프로덕션 장애로 만들 수 있는 유일한 경로다.** 초안은 "postinstall이 도는가"만 다루고 이 문제를 놓쳤다.

**문제**

생성된 클라이언트는 엔진을 **두 후보 경로**에서 찾는다. `generated/prisma/index.js`를 직접 열어보면 `__dirname` 기반과 `process.cwd()` 기반이 함께 있다.

```js
// generated/prisma/index.js:379 (실제 코드)
path.join(process.cwd(), "generated/prisma/query_engine-windows.dll.node")

// generated/prisma/index.js:306
"engineType": "library"     // wasm이 아니라 네이티브 바이너리 경로다
```

Vercel에서 web 함수의 `process.cwd()`는 Root Directory인 `apps/web`이다. 이동 후 엔진은 `packages/db/generated/prisma/`에 있으므로 **cwd 후보가 존재하지 않는 디렉터리를 가리킨다.**

그러면 해석은 전적으로 Next/Vercel 출력 파일 트레이싱(`@vercel/nft`)이 **앱 Root Directory 바깥의** 엔진 파일을 함수 번들로 끌어오는 데 달린다. Next의 기본 트레이싱 루트는 앱 디렉터리다. 현재 `next.config.js`에는 트레이싱 설정이 하나도 없다.

**실패 양상이 고약하다**

```
next build          → 성공한다 (빌드는 라이브 쿼리를 실행하지 않는다)
Vercel 배포          → 성공한다
첫 DB 접근 요청      → 500 "Query Engine not found"
```

빌드 성공을 게이트로 삼으면 잡히지 않는다. **양쪽 앱에 모두 해당한다.**

**대응 3단**

1. **`outputFileTracingRoot`를 저장소 루트로 지정한다.** 두 앱의 `next.config.js`에 넣는다.

```js
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const config = {
  // 워크스페이스 패키지의 파일을 함수 번들에 포함시키려면
  // 트레이싱 루트가 앱 디렉터리가 아니라 저장소 루트여야 한다.
  outputFileTracingRoot: path.join(__dirname, "../../"),
  transpilePackages: ["@repo/db"],
  serverExternalPackages: ["@prisma/adapter-neon"],
  // ...
};
```

2. **Phase 0에서 실제 쿼리로 검증한다** (§5 Phase 0의 확인 c). 빌드 성공이 아니라 **DB를 읽는 페이지가 200을 반환하는지**를 본다.

3. 그래도 실패하면 `@prisma/nextjs-monorepo-workaround-plugin`을 붙인다. 이 플러그인은 엔진을 앱 디렉터리로 복사해 cwd 후보를 되살린다. 1번으로 해결되면 쓰지 않는다.

> 이 프로젝트가 `@prisma/adapter-neon` 드라이버 어댑터를 쓰므로 엔진이 필요 없다고 생각하기 쉽다. 그렇지 않다. `engineType`이 `"library"`이고, 어댑터는 연결 계층을 대체할 뿐 쿼리 엔진을 대체하지 않는다. 커밋된 엔진이 Windows 전용이라는 사실(§4.0)과 합치면, Linux 엔진은 `prisma generate`가 만들고 그것이 번들에 들어가야 한다는 조건이 둘 다 성립해야 한다.

---

## 5. 실행 순서

각 Phase 끝의 게이트를 통과하지 못하면 다음 Phase로 넘어가지 않는다.

> **"Phase 1~3은 프로덕션 영향이 없다"고 말하지 않는다.** 초안은 그렇게 썼으나 사실이 아니다. *사용자 대면 동작 불변*과 *프로덕션 미접촉*은 다르다.
>
> - **Phase 1은 라이브 Vercel 프로젝트를 변경한다.** Root Directory는 프로젝트 단위 설정이라 프리뷰와 프로덕션을 함께 지배하고, git revert로 되돌아가지 않는다.
> - **Phase 1은 lockfile을 재생성한다.** 루트 설치가 모든 `^` 범위를 재해석하므로 전이 의존성 버전이 달라질 수 있다. 프로덕션 빌드 입력이 바뀐다.
> - **Phase 2는 Prisma가 재배치된 상태로 프로덕션 web을 재배포한다.** 엔진 해석이 깨지면 빌드는 통과하고 런타임에 전면 500이 난다(§4.9).
>
> 정확한 표현은 이렇다. **비가역 지점은 없다**(세션·쿠키·DB를 건드리지 않는다). 그러나 **Phase 1과 2는 프로덕션 배포이며, 깨지면 라이브가 얼어붙는다.** 그래서 Phase 0을 둔다.

### Phase 0: 일회용 프로젝트로 선검증 (라이브 미접촉)

Phase 1의 게이트를 "프리뷰 배포 성공"으로 두려던 초안은 성립하지 않는다. Root Directory가 프로젝트 단위라, `apps/web` 레이아웃의 프리뷰를 보려면 **이미 라이브 프로젝트의 설정을 바꿔야 한다.** 검증과 노출이 분리되지 않는다.

라이브를 건드리지 않고 검증하려면 별도 프로젝트가 필요하다.

1. 작업 브랜치에서 Phase 1·2의 코드 변경을 모두 수행한다 (아직 라이브 설정은 손대지 않는다)
2. Vercel에 **일회용 프로젝트**를 만든다. 같은 저장소, 그 브랜치, Root Directory `apps/web`, 프로덕션과 같은 환경변수
3. 아래를 순서대로 확인한다

| # | 확인 | 실패 시 의미 |
|---|---|---|
| a | 빌드 로그에 저장소 루트에서의 워크스페이스 설치가 보이는가 | Vercel이 Root Directory를 cwd로 설치한다는 뜻. `"@repo/db": "*"`가 해석되지 않는다. Install Command를 명시해야 한다 |
| b | 빌드 로그에 `prisma generate`가 찍히는가 | postinstall이 캐시로 건너뛰어졌다. Build Command 명시로 전환 (§4.8) |
| c | **DB를 실제로 쿼리하는 페이지가 200을 반환하는가** | 엔진 트레이싱 실패 (§4.9). 이 확인이 Phase 0의 존재 이유다 |
| d | `NEXT_PUBLIC_SITE_URL`이 클라이언트 번들에 인라인되었는가 | 루트 `.env` + dotenv 선로드가 Next의 클라이언트 인라이닝보다 늦게 돌았다 (§4.1.1) |

4. 전부 통과하면 일회용 프로젝트를 삭제하고 Phase 1로 넘어간다

**c가 핵심이다.** `next build`는 라이브 쿼리를 실행하지 않으므로 엔진이 없어도 성공한다. 빌드 성공을 게이트로 삼으면 이 실패를 잡지 못한다.

**게이트**: a~d 전부 통과. 하나라도 실패하면 원인을 고치고 Phase 0을 다시 돌린다. 라이브는 이 단계에서 전혀 영향받지 않는다.

### Phase 1: 워크스페이스화 (라이브 Vercel 프로젝트 설정 변경 포함)

1. 루트 `package.json`, `.npmrc`, `.gitignore` 생성
2. `git mv ai-podcast-clipper-frontend apps/web`
3. `apps/web/.npmrc` 삭제
4. **`apps/web/{node_modules,.next,tsconfig.tsbuildinfo}` 삭제** — 아래 참조
5. **`apps/web/.env`를 루트로 이동** (git 미추적이라 `git mv`가 옮기지 않는다). `.env.example`도 루트로
6. 두 앱에 `dotenv` devDependency 추가, `apps/web/next.config.js`에 선로드 2줄 (§4.1.1)
7. `apps/web/package.json`에 `test` 스크립트 추가 (§4.1)
8. `apps/web/package-lock.json` 삭제 후 루트에서 `npm install`
9. Vercel web 프로젝트의 Root Directory를 `apps/web`으로 변경

> **4번을 건너뛰면 안 된다.** `git mv`는 디렉터리 rename이라 `node_modules`가 통째로 따라온다. 워크스페이스 설치는 의존성을 루트로 호이스팅하는데, 남아 있는 중첩 `node_modules`가 그것을 가린다. 증상이 "로컬은 되는데 Vercel은 깨짐"으로 나타나 진단이 오래 걸린다.

**게이트**: 루트에서 `npm run check -w apps/web`, `npm test -w apps/web`, `npm run build -w apps/web` 통과. `npm run dev -w apps/web`이 루트 `.env`를 읽는지 확인. 프리뷰 배포 성공 및 로그인/업로드 스모크 테스트 통과.

### Phase 2: `packages/db` 추출 + analytics 계약 분리

1. `packages/db` 스캐폴딩 (`package.json`, `tsconfig.json` — §4.2에 내용 명시)
2. `git mv`로 `prisma/`, `generated/`, `src/server/db.ts` 이동 → `client.ts` 작성
   - **`generated/`는 추적을 유지한다.** gitignore 하지 않는다 (§4.0)
3. `analytics-contract.ts` 작성 (§4.3). `ANALYTICS_METADATA_KEYS_BY_EVENT` 재수출 분리
4. web: `generated/prisma` → `@repo/db` 일괄 치환 (23개)
5. web: `server/db.ts`, `shared/analytics/event-catalog.ts`, `entities/analytics-event/model/{funnels,types}.ts`를 shim으로 축소
6. web: `package.json` 의존성/스크립트 정리, `next.config.js`에 `transpilePackages`
7. `.gitignore` 소유자 이동 (§4.2 표): `packages/db/.gitignore` 신규, `apps/web/.gitignore`에서 tmp 규칙 제거
8. `event-catalog` shim 회귀 테스트 작성 (§8)

**게이트**
- `npm run check --workspaces` 통과 (치환 누락은 여기서 전부 드러난다)
- `npm test --workspaces` 통과 — `reporting.test.mjs` 포함
- `npm run db:push -w @repo/db`가 루트 `.env`를 찾는지 확인 (결정 10)
- 프리뷰 배포 후 어드민 화면 `/admin/analytics`가 여전히 정상 동작
- **빌드 로그에 `prisma generate`가 찍히는지 확인** (§4.8). 없으면 Build Command 명시로 전환

> Vercel 빌드 캐시 주의: Prisma 산출물 경로가 바뀌므로 이 Phase의 첫 배포는 캐시를 비우고 돌린다.

### Phase 3: `apps/admin` 신설 (아직 미배포)

1. Next 15 앱 스캐폴딩 + 설정 파일 (§4.5). `dotenv` 선로드와 `test` 스크립트 포함
2. 자체 인증 **4파일** 작성 (§4.6) — `config.edge.ts`, `config.ts`, `index.ts`, `guard.ts`
3. 로그인 페이지 작성 (`?error=AccessDenied` 문구 처리 포함)
4. 화면·쿼리·관측 코드 이동/복사 (§4.5 파일 구성)
5. atoms 5개 + `cn` 복사. sonner에서 `useTheme()` 제거 (결정 9)
6. Sentry 설정 축소본 + `dist: "admin"` 작성 (§4.7)
7. `getAdminEmailSet` 파싱 테스트 작성 (§8)

**게이트**: 로컬에서 `npm run build -w apps/admin`, `npm test -w apps/admin` 통과. `npm run dev:admin`으로 기동해 아래를 각각 확인한다.

| # | 확인 | 실패 시 의심할 곳 |
|---|---|---|
| a | 미인증으로 `/analytics` → `/login`으로 1회 리다이렉트 | — |
| b | **`/login`에서 리다이렉트 루프가 없을 것** | `config.edge.ts`의 `authorized` (§4.6 주석) |
| c | 관리자 계정 Google 로그인 → 대시보드 렌더 | `signIn` 콜백, `ADMIN_EMAILS` |
| d | 비관리자 계정 → `/login?error=AccessDenied` 문구 | `signIn` 콜백 |
| e | 로그인 상태로 `/login` 방문 → `/analytics`로 리다이렉트 | `authorized`의 `isAuthRoute` 분기 |

### Phase 4: 배포 및 web 정리

1. Google Console에 admin redirect URI 추가
2. Vercel admin 프로젝트 생성, Root Directory `apps/admin`, 환경변수 주입, `admin.a-pch.com` 연결
3. admin 배포 후 프로덕션에서 게이트 재확인
4. **admin이 정상 확인된 뒤에** web에서 admin 잔재 제거 (§4.4 하단 목록)
5. `apps/web/src/fsd/entities/analytics-event/api/index.ts`에서 리포팅 함수 제거
6. CLAUDE.md, README 갱신

**게이트**
- `admin.a-pch.com/analytics` 정상, Phase 3의 a~e를 프로덕션에서 재확인
- admin 첫 배포 로그에 `prisma generate` 확인 (§4.8)
- `a-pch.com/admin/analytics` 404
- web 기존 세션 유지 확인
- `apps/admin` Vercel 환경변수 목록에 AWS/Polar/Modal 키 없음
- `npm run check --workspaces`, `npm test --workspaces` 통과

---

## 6. 영향 범위

| 영역 | 영향 |
|---|---|
| 저장소 루트 | `package.json`, `.npmrc`, `package-lock.json` 신규 |
| `apps/web` 소스 | `generated/prisma` 임포트 23개 치환. shim 4개. Phase 4에서 어드민 관련 파일 삭제 |
| `apps/web` 사용자 대면 동작 | **없음**. 인증·라우팅·쿠키 미변경 |
| `apps/web` 배포 파이프라인 | **변경됨.** Root Directory, lockfile, Prisma 위치, 파일 트레이싱. Phase 1·2는 프로덕션 배포다 |
| Prisma | 스키마 위치 이동. 마이그레이션 실행 주체가 `@repo/db`로 이동 |
| Vercel | web 프로젝트 Root Directory 변경. admin 프로젝트 신규 |
| Google OAuth | redirect URI 1개 추가 |
| 사용자 세션 | **영향 없음** (결정 2) |
| 어드민 URL | `a-pch.com/admin/*` → `admin.a-pch.com/*`. 관리자 북마크 갱신 필요 |
| 어드민 로그인 | web 세션 재사용 → admin에서 별도 Google 로그인. 세션 8시간이므로 하루 1회 수준 |
| Sentry | 프로젝트 신규 생성 없음. admin 이벤트에 `app: "admin"` 태그가 붙어 들어옴 |
| `ai-podcast-clipper-backend` | 없음 |

---

## 7. 리스크 + 롤백 전략

### 리스크

0. **[최대 위험] Prisma 엔진이 함수 번들에 포함되지 않아 런타임 500** (Phase 1·2, 양쪽 앱)
   빌드와 배포가 **성공한 뒤** 첫 DB 접근에서 터진다. 빌드 게이트로는 잡히지 않는다.
   대응: `outputFileTracingRoot` 지정(§4.9) + **Phase 0에서 실제 쿼리로 검증**. 그래도 실패하면 `@prisma/nextjs-monorepo-workaround-plugin`.

1. **Vercel Root Directory 변경 중 배포 중단** (Phase 1)
   Root Directory는 프로젝트 단위라 프리뷰만 따로 검증할 수 없고, git revert로도 되돌아가지 않는다.
   대응: **Phase 0에서 일회용 프로젝트로 선검증**. 라이브 전환은 저트래픽 시간대에 수행하고 즉시 재배포. 실패 시 설정 원복 + 커밋 revert(설정 원복은 수동이다).

2. **Vercel이 워크스페이스를 감지하지 못하고 Root Directory를 cwd로 설치** (Phase 1)
   `"@repo/db": "*"`가 해석되지 않아 빌드가 즉사한다. 이 계획 전체가 이 동작에 의존한다.
   대응: Phase 0 확인 a. 실패 시 Install Command를 `npm install --workspaces` 형태로 명시.

3. **Prisma 산출물 경로 변경으로 Vercel 빌드 캐시 오염** (Phase 2)
   대응: 첫 배포는 캐시 없이 실행. `@repo/db`의 `postinstall`이 실행되는지 빌드 로그에서 확인.

4. **lockfile 재생성으로 전이 의존성 버전이 바뀜** (Phase 1)
   루트 설치가 모든 `^` 범위를 재해석한다. 프로덕션 빌드 입력이 달라진다.
   대응: Phase 0의 일회용 프로젝트가 새 lockfile로 빌드되므로 여기서 드러난다. `git diff`로 lockfile 변화 폭을 훑고, 메이저 이동이 있으면 개별 검토.

5. **`generated/prisma` 치환 누락** (Phase 2)
   대응: `tsc --noEmit`이 전수 검출한다. 게이트를 통과하지 못하면 진행하지 않는다.

6. **analytics 계약 분리 시 `ANALYTICS_METADATA_KEYS_BY_EVENT` 재수출을 같이 옮겨버림** (Phase 2)
   증상: `packages/db`가 web 전용 metadata에 의존하게 되어 순환/불필요 결합 발생. 반대로 shim에서 빠뜨리면 **타입 에러 없이 계측만 조용히 멈춘다.**
   대응: §4.3의 shim 형태를 그대로 지킨다. §8 신규 테스트 2번이 이 경로를 막는다.

7. **admin 배포 전에 web에서 admin 라우트를 지워 어드민 공백 발생**
   대응: 삭제는 Phase 4의 마지막 단계로 못 박는다. Phase 3까지 web의 `/admin`은 그대로 동작한다.

8. **admin `signIn` 콜백 거부 시 UX가 불친절함**
   NextAuth는 `signIn`이 false를 반환하면 `/login?error=AccessDenied`로 보낸다. 로그인 페이지에서 이 에러를 문구로 처리한다.

9. **`ADMIN_EMAILS`에서 제거된 계정의 JWT가 만료 전까지 유효**
   대응 3중. (a) `session.maxAge = 8시간`으로 노출 창을 기본 30일에서 줄인다(결정 7). (b) `requireAdmin()`에 화이트리스트 재검사를 남긴다(§4.6) — 다음 요청부터 차단된다. (c) 즉시·전면 차단이 필요하면 `AUTH_SECRET` 회전.

### 롤백 전략

| Phase | 롤백 | 라이브 영향 |
|---|---|---|
| 0 | 일회용 Vercel 프로젝트 삭제. 브랜치 폐기 | **없음** |
| 1 | 커밋 revert + **Vercel Root Directory 수동 원복** | 배포 중단 가능 |
| 2 | 커밋 revert | 배포 중단 가능. 엔진 트레이싱 실패 시 런타임 500 |
| 3 | `apps/admin` 디렉터리 삭제. web은 손대지 않았으므로 무영향 | 없음 |
| 4 | admin 도메인 연결 해제 + web 정리 커밋 revert → `a-pch.com/admin/*` 복구 | 어드민만 |

**비가역 지점은 없다.** 쿠키·세션·DB 스키마를 건드리지 않으므로 되돌려도 사용자 데이터에 흔적이 남지 않는다.

**다만 "되돌릴 수 있음"이 "무해"는 아니다.**

- Vercel **Root Directory는 프로젝트 레벨 공유 상태**라 git revert 범위 밖이다. 코드를 되돌려도 설정을 수동으로 원복해야 하고, 그 사이 배포되는 커밋은 어긋난 레이아웃으로 빌드된다
- Phase 1/2 배포가 깨지면 라이브는 마지막 성공 배포를 계속 서빙하지만 **새 배포를 못 올린다.** 급한 수정이 필요한 상황이 겹치면 대가가 크다

이 두 가지를 Phase 0으로 완화한다. Phase 0에서 잡히는 실패는 라이브 프로젝트에 닿기 전에 잡힌다.

---

## 8. 검증 전략

### 자동 검증

**선행 조건: 테스트 러너 배선** — 현재 프로젝트에 `test` 스크립트가 없어서 `.test.mjs` 4개가 아무도 실행하지 않는 상태다. §4.1의 배선이 Phase 1에 들어가야 이 절의 나머지가 성립한다. 배선 없이는 아래 게이트가 전부 문구뿐이다.

- 모든 Phase: `npm run check --workspaces` (`next lint` + `tsc --noEmit`)
- 모든 Phase: `npm test --workspaces`
- `reporting.test.mjs` — admin으로 이동한 뒤에도 통과해야 한다. 퍼널 집계 로직이 이동 중 변형되지 않았음을 보장하는 유일한 테스트다
- `metadata.test.mjs`, `normalize-path.test.mjs`, `selection-budget.test.mjs` — web 잔류. 계약 분리 후에도 통과

### 신규 테스트 (필수)

| # | 파일 | 유형 | 검증 | 회귀? |
|---|---|---|---|---|
| 1 | `apps/admin/src/analytics/reporting.test.mjs` | unit | 기존 파일 이동. 전량 통과 | **예** |
| 2 | `apps/web/src/fsd/shared/analytics/event-catalog.test.mjs` | unit | shim이 `ANALYTICS_EVENT_NAMES`(28개)와 `ANALYTICS_METADATA_KEYS_BY_EVENT`를 **모두** 내보내는지 | **예** |
| 3 | `apps/admin/src/auth/admin-emails.test.mjs` | unit | `getAdminEmailSet` 파싱: 공백, 빈 문자열, 트레일링 콤마, 대소문자 혼재 | 아니오 |

**2번이 회귀인 이유**: §4.3이 `event-catalog.ts`의 재수출을 둘로 쪼갠다. 한쪽을 빠뜨려도 **타입 에러가 나지 않을 수 있다** — 사용처가 `import type`이면 컴파일은 통과하고, 값으로 쓰는 곳만 런타임에 `undefined`를 받는다. 계측이 조용히 멈추는 경로이므로 타입 검사에 기댈 수 없다.

```js
// apps/web/src/fsd/shared/analytics/event-catalog.test.mjs
import assert from "node:assert/strict";
import { test } from "node:test";
import {
  ANALYTICS_EVENT_NAMES,
  ANALYTICS_METADATA_KEYS_BY_EVENT,
} from "./event-catalog.ts";

test("shim이 이벤트 이름 28개를 그대로 내보낸다", () => {
  assert.equal(ANALYTICS_EVENT_NAMES.length, 28);
  assert.ok(ANALYTICS_EVENT_NAMES.includes("clip_review_confirmed"));
});

test("shim이 metadata 재수출을 유지한다", () => {
  assert.ok(ANALYTICS_METADATA_KEYS_BY_EVENT);
  // 모든 이벤트 이름이 metadata 키 목록에 존재해야 한다.
  for (const name of ANALYTICS_EVENT_NAMES) {
    assert.ok(name in ANALYTICS_METADATA_KEYS_BY_EVENT, `missing: ${name}`);
  }
});
```

> `.test.mjs`에서 `.ts`를 직접 임포트할 수 없다면, Node 22의 `--experimental-strip-types`를 쓰거나 이 테스트만 `.test.ts` + `tsx`로 돌린다. Phase 1에서 러너를 배선할 때 어느 쪽인지 확정한다.

### 수동 검증

**Phase 1·2 (web 회귀)**

1. 로그인 → 대시보드 → 파일 업로드 → 처리 스케줄링
2. 업로드 상세에서 클립 검토(Review) 화면 진입
3. 빌링 페이지 진입 (Polar 체크아웃 링크 생성)
4. `/admin/analytics`에서 퍼널 4종이 전환 전과 같은 수치를 보이는지 대조
5. **계측이 살아있는지 확인** — 위 1~3을 수행한 뒤 `AnalyticsEvent` 테이블에 새 행이 쌓이는지 본다. `event-catalog` shim이 깨지면 여기서만 드러난다

**Phase 3·4 (admin)**

1. 미인증 상태로 `admin.a-pch.com/analytics` → `/login` 리다이렉트
2. `ADMIN_EMAILS` 등재 계정 Google 로그인 → 대시보드 렌더
3. 미등재 계정 로그인 시도 → 거부 및 에러 문구 표시
4. `range`/`funnel` 쿼리 파라미터 전환 동작
5. `/observability`에서 테스트 이벤트 전송 → Sentry에 도달하고 **`app: "admin"` 태그가 붙었는지** 확인 (결정 6)
6. 로그인 직후 세션 쿠키의 만료가 **약 8시간 뒤**인지 확인 (결정 7). 브라우저 개발자도구 → Application → Cookies
7. `a-pch.com/admin/analytics` → 404
8. 로그인한 web 세션이 admin 로그인 후에도 유지되는지 (쿠키 간섭 없음 확인)
9. `apps/admin` Vercel 환경변수 목록에 `AWS_*`·`POLAR_*`·`PROCESS_VIDEO_ENDPOINT*`·`MODAL_WEBHOOK_SECRET`이 없는지 (성공 기준 5)

### 계약 방어선 검증 (성공 기준 6)

`packages/db/src/analytics-contract.ts`에서 이벤트 이름 하나를 임시로 rename → `npm run check --workspaces`가 **admin과 web 양쪽에서** 에러를 내는지 확인 후 되돌린다. 이 확인이 통과하면 §1에서 지적한 "조용히 0이 되는" 실패 경로가 닫혔다는 증거가 된다.

---

## Open Questions

없다. 초안의 5건은 2026-08-01에 모두 해소했다(2건은 코드베이스 조회, 3건은 채점 후 선택). 이후 같은 날 계획 리뷰에서 `.env` 배치가 새 결정으로 떠올라 결정 10으로 편입했다. 근거는 §3 결정 6~10과 §4.8에 본문으로 들어가 있다.

| 초안 질문 | 해소 방식 | 결론 |
|---|---|---|
| DNS/도메인 준비 상태 | 조회 (`custom-domain-a-pch-setup-proposal.md` §1.1) | Vercel Domains 구매·nameserver 자동 관리. 대시보드 연결만. 추가 비용 0 → §4.8 |
| Sentry 프로젝트 분리 | 채점 34 vs 29 | 같은 프로젝트 + `app` 태그 → 결정 6 |
| admin 로그인 수단 | 조회 + 채점 33 vs 31 | Google 전용 + 세션 8시간 → 결정 7 |
| `DATABASE_URL` 중복 검증 | 채점 36 vs 34 | 각 앱만 검증, `packages/db`는 안 함 → 결정 8 |
| admin에 `next-themes` 필요 여부 | 조회 (`providers.tsx`에 `ThemeProvider` 없음) | 불필요. web에서도 죽은 의존성 → 결정 9 |

### 해소 과정에서 정정한 초안의 오류

1. **도메인 표기** — 초안 전체가 `apch.com`으로 되어 있었다. 실제 도메인은 `a-pch.com`이다(`src/fsd/shared/lib/site.ts:4`). 전량 치환했다.
2. **Sentry 쿼터** — "별도 프로젝트면 무료 쿼터가 나뉜다"고 썼으나 사실이 아니다. 쿼터는 조직 단위 풀이므로 프로젝트를 쪼개도 총량은 같다. 결정 6에서 이 항목을 변수에서 제외했다.
3. **DNS를 리스크로 분류** — Vercel 구매 도메인이라 외부 레지스트라 조작이 없다. 리스크 목록에서 뺐다.

### 계획 리뷰에서 정정한 오류 (2026-08-01)

구현 착수 전 계획 리뷰에서 아래를 잡았다. 앞의 3건이 P1이며, 그대로 진행했으면 Phase 1과 Phase 2에서 각각 막혔을 것이다.

| # | 초안이 지시한 것 | 실제 | 반영 위치 |
|---|---|---|---|
| 1 | `generated/`를 gitignore | **27개 파일이 의도적으로 커밋되어 있다** (`.gitignore:19-20`, `CLAUDE.md:80`). gitignore 하면 커밋된 산출물이 사라지고 빌드가 postinstall에만 의존하게 된다 | §4.0, §4.2, Phase 2 |
| 2 | admin `authorized: ({ auth }) => !!auth?.user` | matcher가 `/login`을 포함하므로 **미인증 요청이 무한 리다이렉트**된다. 어드민에 아무도 로그인할 수 없다 | §4.5, §4.6, Phase 3 게이트 b |
| 3 | "`reporting.test.mjs` 통과"를 게이트로 지정 | **프로젝트에 `test` 스크립트가 없다.** `.test.mjs` 4개가 실행 경로 없이 방치되어 있어 게이트를 실행할 수 없었다 | §4.1, §8, 전 Phase 게이트 |
| 4 | `git mv`만 하고 설치 | `node_modules`가 디렉터리 rename으로 따라와 워크스페이스 호이스팅을 가린다 | Phase 1-4 |
| 5 | `.env` 배치 미기술 | Phase 2 이후 `packages/db`에 `.env`가 없어 마이그레이션 명령이 전부 실패한다. Next.js가 루트 `.env`를 자동 로드하지 않는 문제도 함께 | 결정 10, §4.1.1 |
| 6 | `packages/db/tsconfig.json` "스캐폴딩" | 내용 미정. `exclude: ["generated"]` 없이는 825KB짜리 `index.d.ts`가 `strict` 아래 재검사된다 | §4.2 |

리뷰에서 함께 반영한 권장 사항: `event-catalog` shim 회귀 테스트(§8), `dist: "admin"` 소스맵 분리(§4.7), `prisma generate` 실행 확인의 게이트 승격(§4.8, Phase 2·4).

### 독립 교차 검증에서 추가로 잡은 것 (2026-08-01)

위 리뷰를 쓴 주체와 **독립된 두 검토자**가 같은 저장소를 대상으로 다시 검증했다. 계획을 쓴 사람이 자기 계획을 리뷰한 결과에 남아 있던 사각을 찾는 것이 목적이었다.

| # | 초안/1차 리뷰가 놓친 것 | 심각도 | 반영 위치 |
|---|---|---|---|
| 1 | **Prisma 엔진이 함수 번들에 포함되지 않는 문제.** `generated/prisma/index.js:379`가 `process.cwd()` 기준으로 엔진을 찾는데, Vercel에서 cwd는 Root Directory(`apps/web`)라 이동 후 존재하지 않는 경로를 가리킨다. `engineType`은 `"library"`(index.js:306)라 네이티브 바이너리가 실제로 필요하다. `next.config.js`에 트레이싱 설정이 하나도 없다. **빌드는 통과하고 런타임에 전면 500이 난다** | **Critical** | §4.9 신설, §4.4·§4.5, 리스크 0 |
| 2 | **"Phase 1~3 프로덕션 영향 0"은 거짓.** 사용자 대면 동작 불변과 프로덕션 미접촉은 다르다. Phase 1은 라이브 Vercel 설정과 lockfile을 바꾼다 | **Critical** | §5 도입부, §6, §7 롤백 |
| 3 | **Root Directory는 프로젝트 단위**라 "프리뷰로 먼저 검증"이 불가능하다. 1차 리뷰가 세운 Phase 1 게이트가 성립하지 않았다 | Medium | **Phase 0 신설** |
| 4 | Vercel 워크스페이스 루트 설치가 근거 없이 단언되어 있었다. 이 계획 전체의 하중 지지 가정인데 대체 경로가 없었다 | High | Phase 0 확인 a, 리스크 2 |
| 5 | `apps/admin`의 의존성 목록이 없어 Phase 3 범위가 불확정이었다 | Medium | §4.5 |
| 6 | `CLAUDE.md:80`은 "generated/prisma는 커밋 대상"의 근거가 아니다. 생성 위치만 서술한다 | Low | §4.0 |
| 7 | `export type *`가 enum **값**을 재수출하지 않는다. 오늘은 무해하나 잠재적 | Low | §4.2 |
| 8 | DNS 근거로 든 `custom-domain-a-pch-setup-proposal.md`가 **git 미추적**이다(`.gitignore:55`). 로컬 전용 문서에 기대고 있었다 | Low | §4.8 |
| 9 | 루트 `.env` + dotenv 선로드가 `NEXT_PUBLIC_*` 인라이닝 시점과 얽힌다 | Low | §4.1.1, Phase 0 확인 d |
| 10 | §4.7의 "`reportPipelineFailure` 호출부 9곳" — 실제는 **3곳**이고 그중 하나가 테스트 패널 자신이다. 패널이 admin으로 가면 web에 2곳만 남고 둘 다 장애 시에만 발화한다 | Low | §4.7 |

**받아들이지 않은 지적 1건**: 교차 검증은 "계약을 복사하고 CI 검사로 막으면 워크스페이스 없이도 같은 보호가 된다"며 모노레포 자체의 필요성에 의문을 제기했다. 그러나 §8의 계약 방어선 검증은 **계약이 한 파일일 때만** 성립한다. 복사본을 두면 한쪽에서 rename해도 다른 쪽은 그대로 통과하므로 보호가 재현되지 않는다. 결정 3을 유지한다.

다만 같은 지적의 **순서에 대한 부분은 받아들였다.** 위험한 부분(워크스페이스 전환)이 산출물(admin)보다 먼저 오는 구조는 그대로 두되, Phase 0을 앞에 붙여 라이브 노출 전에 검증하도록 바꿨다.

### 이 문서 범위 밖의 후속 과제

- **web의 죽은 `next-themes` 의존성 정리** — `ThemeProvider` 없이 `sonner.tsx`에서만 `useTheme()`을 호출한다. `globals.css:92`의 `.dark`도 토글하는 코드가 없다. 다크모드를 실제로 도입하든 의존성을 걷어내든 별건으로 결정한다.
- **web의 Sentry 전송 경로 온디맨드 진단** — 테스트 패널이 admin으로 떠나면 web에는 장애 시에만 발화하는 경로 2곳만 남는다(§4.7). 진단이 필요해지면 `app/api/internal/sentry-check/route.ts` 하나로 해결된다. 지금 만들지 않는 이유는 admin 패널이 공유 DSN을 태워 공통 실패는 잡아주기 때문이고, 이 판단이 틀렸다고 느껴지는 시점에 추가한다.
- **`CLAUDE.md` 갱신** — 현재 문서가 심하게 낡았다. "Prisma + SQLite", "Credentials provider with bcrypt"라고 적혀 있으나 실제는 Postgres/Neon + Google OAuth 전용이다(Credentials는 2026-03-26에 제거됨). 이 계획은 Phase 4에서 모노레포 구조만 반영하는데, 낡은 서술 자체가 별도 정리 대상이다. AI 에이전트가 이 파일을 진실 출처로 읽으므로 방치하면 계속 틀린 전제로 작업하게 된다.
- **`@prisma/adapter-neon` ^7.5.0 대 `@prisma/client` ^6.19.1 메이저 불일치** — 현재 `package.json`에 이미 있는 조합이고 이 계획이 만든 문제가 아니다. `packages/db/package.json`이 그대로 복사한다. 동작 중이므로 이번 범위에서 건드리지 않되, 의존성이 한곳으로 모이는 시점이 정리하기 좋은 때다.
