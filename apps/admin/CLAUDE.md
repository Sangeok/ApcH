# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Repository Layout

**npm workspaces monorepo**다. 이 문서는 `apps/admin`을 설명한다. 저장소 전체 구조는 `apps/web/CLAUDE.md`에 있다.

admin은 2026-08-02에 web에서 분리됐다. 두 앱은 **`@repo/db`만 공유한다** — UI 컴포넌트와 인증 설정은 각자 자기 것을 가지며, 공유하지 않기로 한 결정이다.

## Project Overview

`admin.a-pch.com` — 운영자용 내부 대시보드. 제품 기능은 없고 관측이 본업이다. **DB는 읽기 전용**이며, 유일한 쓰기는 `/pipeline`의 GitHub 이슈 코멘트 게시다(외부 API, DB 무관).

| 라우트 | 내용 |
|---|---|
| `/` | `/analytics`로 리다이렉트 |
| `/login` | Google 로그인 |
| `/analytics` | 개요·퍼널·이탈·최근 실패 |
| `/observability` | Sentry 리포팅 점검 |
| `/pipeline` | 파이프라인 보드 투영 + 원격 명령 |
| `/api/auth/[...nextauth]` | NextAuth 핸들러 |

`app/robots.ts`가 전 크롤러에 `Disallow: /`를 낸다.

## Development Commands

```bash
npm run dev:admin                # 개발 서버 (Turbopack, :3001)
npm run check -w apps/admin      # next lint && tsc --noEmit
npm test -w apps/admin           # tsx --test "src/**/*.test.mjs"
npm run build -w apps/admin
```

`apps/web`과 달리 **`lint:fix`·`format:write`·`preview` 스크립트가 없다.** 있는 것은 `dev`, `build`, `start`, `check`, `lint`, `typecheck`, `test`뿐이다.

### 테스트

Node 내장 러너를 `tsx`로 돌린다. 현재 **7개 파일, 57개 테스트.**

| 파일 | 지키는 것 |
|---|---|
| `analytics/reporting.test.mjs` | 퍼널 단계는 **이전 단계 뒤에 나온 것만** 센다. 이탈 행은 세션별 마지막 유의미 이벤트로 잡고 `page_exited`는 제외한다 |
| `lib/admin-emails.test.mjs` | `ADMIN_EMAILS` 파싱 — 소문자 정규화, 공백·트레일링 콤마·중복 제거. **이 앱의 유일한 인가 입력이라 파싱이 틀리면 접근 제어가 틀린다** |
| `pipeline/board.test.mjs` | `PROJECT_BOARD.md` 파싱 — 섹션·항목·`status`·`checked` 추출, mermaid 섹션과 `>` 안내 블록 제외 |
| `pipeline/briefing.test.mjs` | 보드 상태→캐릭터 발화 결정적 매핑 — 결재함/보고 분류, 같은 ID는 최신 행만(유령 방지 dedupe), `daysOnBoard`(UTC·N일째)·`firstSentence`·팀 로스터 도출(`heldId` 분리)·미지 에이전트 폴백 |
| `pipeline/sprites.test.mjs` | 픽셀 격자 파서·팔레트 매핑·정체성 외형·tone→말풍선색(muted=말풍선 없음) 계약 |
| `pipeline/commands.test.mjs` | 원격 명령 화이트리스트 — `pipeline-run` 본문이 검증된 원문과 글자 그대로 동일, 화이트리스트 밖 key(`__proto__` 포함)는 `null`, 모든 본문이 `"[claude]"` 미시작 + 게이트 전이 금지 문구 포함. **이 파일이 깨지면 임의 문자열이 이슈 #87에 게시될 수 있다** |
| `pipeline/desk-commands.test.mjs` | 책상→명령 매핑 — 5책상 전부 버튼(dev 「작업 진행」은 FEAT-07 추가), 미지 책상만 `null`, 모든 desk key가 실제 화이트리스트에 존재(두 모듈 드리프트 방지) |

**`.mjs`는 `tsconfig`의 `include` 밖이라 타입체크를 받지 않는다.** 테스트가 통과해도 `npm run check`가 막을 수 있으므로 둘 다 돌린다 — FEAT-03 계획서의 파서 초안이 `noUncheckedIndexedAccess` 위반으로 `check`에서만 걸렸다.

## Architecture

### FSD가 아니다

`apps/web`은 `src/fsd/` 아래 5레이어 Feature-Sliced Design을 쓴다. **admin은 쓰지 않는다.** `src/` 아래 평평한 모듈이다.

| 디렉터리 | 내용 |
|---|---|
| `app/` | App Router 라우트 |
| `analytics/` | 집계 — `queries.ts`(DB) + `reporting.ts`(순수 함수) |
| `auth/` | NextAuth 설정과 가드 |
| `observability/` | Sentry 리포팅 래퍼 |
| `pipeline/` | 보드 파싱·조회·명령 — `board.ts`(순수) + `queries.ts`(fetch) + `command-action.ts`(쓰기) |
| `lib/` | `parse-admin-emails.ts`, `result.ts`, `utils.ts` |
| `ui/` | 컴포넌트. `ui/atoms/`에 shadcn 계열 |

**web의 FSD 규칙(상위→하위 임포트, peer 임포트 금지, 슬라이스의 `ui/model/api/lib` 분할)을 여기로 가져오지 말 것.** 여기엔 레이어가 없다.

### 인가 — 이 앱의 핵심

역할 테이블도 권한 시스템도 없다. **`ADMIN_EMAILS` 환경변수 문자열 하나**가 누가 들어오는지 정한다. 방어선이 세 겹이다.

| 층 | 위치 | 역할 |
|---|---|---|
| 로그인 거부 | `auth/config.ts:19` `signIn` 콜백 | 화이트리스트 밖 계정은 세션 자체가 만들어지지 않는다 |
| 경로 보호 | `auth/config.edge.ts:19` `authorized` 콜백 | `/login`을 뺀 전 경로 |
| 페이지 재검사 | `auth/guard.ts:7` `requireAdmin()` | `ADMIN_EMAILS`에서 지운 계정의 **기존 JWT가 아직 유효한 창**을 막는다 |

세 번째가 필요한 이유는 JWT 세션이라 서버가 남의 세션을 지울 수 없기 때문이다. 그래서 `config.edge.ts:11`이 `maxAge`를 기본 30일에서 **8시간**으로 줄여 그 창을 좁혔다.

**`authorized` 콜백을 `({ auth }) => !!auth?.user`로 축약하면 안 된다.** matcher가 `/login`을 포함하므로, 미인증 요청이 `false`를 받으면 `pages.signIn`(=`/login`)으로 리다이렉트되고 미들웨어가 다시 돌아 또 `false`가 된다 — 무한 리다이렉트다.

### analytics — 순수 함수 분리가 의도된 것이다

```
queries.ts    "server-only". @repo/db로 AnalyticsEvent를 읽고 기간(7d/30d/90d)으로 자른다
reporting.ts  순수 함수. 임포트가 하나도 없다 — 이벤트 배열을 받아 집계만 한다
```

**테스트가 가능한 이유가 이 분리다.** 집계 로직을 바꾸려면 `reporting.ts`를 고치고 `reporting.test.mjs`로 덮는다. DB 접근을 `reporting.ts`로 끌어들이는 순간 테스트가 불가능해진다.

이벤트 이름과 퍼널 정의는 `@repo/db`의 `analytics-contract.ts`에서 온다(`ANALYTICS_EVENT_NAMES`, `ANALYTICS_FUNNELS`). **여기에 복사본을 만들지 말 것** — web이 기록하고 admin이 집계하는데, 계약이 두 벌이 되면 한쪽에서 이벤트 이름을 바꿔도 다른 쪽이 컴파일을 통과하고 대시보드가 에러 없이 0을 보여준다.

`FAILURE_EVENT_NAMES`(`queries.ts:28`)만 admin 로컬 상수다. 이탈·실패 리포트는 상위 25행으로 자른다.

### 환경 변수

`src/env.js`에서 `@t3-oss/env-nextjs` + Zod로 검증한다. **클라이언트 노출 변수는 없다**(`client: {}`).

**`ADMIN_EMAILS`를 `optional`로 바꾸면 안 된다.** 프로덕션에서 `z.string().min(1)`인 이유는 주입을 빠뜨렸을 때 빌드 단계에서 죽이기 위해서다. optional이면 빌드가 통과하고, `getAdminEmailSet()`이 빈 집합을 돌려주고, `signIn`이 모든 계정을 거부한다 — 운영자가 보는 증상은 "내 관리자 계정이 AccessDenied를 받는다"이고, 그 무엇도 환경변수 누락을 가리키지 않는다.

`.env`는 저장소 루트 단일본이다. `next.config.js` 최상단에서 dotenv로 명시 로드한 뒤 `await import("./src/env.js")`로 검증한다. **`await import`를 정적 import로 되돌리면 안 된다** — ESM은 정적 import를 본문보다 먼저 평가하므로 검증이 dotenv보다 먼저 돌아 `Invalid environment variables`가 난다.

## Path Aliases

`~/*` → `./src/*`. 패키지는 `@repo/db`로 임포트한다.

## 배포 (Vercel)

| 설정 | 값 |
|---|---|
| Root Directory | **`apps/admin`** |
| Region | `icn1` (`vercel.json`) |

web과 **별도 Vercel 프로젝트**다.

`next.config.js`에 Prisma 관련 두 가지가 함께 있어야 한다 — `outputFileTracingRoot`(엔진을 함수 번들에 포함)와 `PrismaPlugin`(엔진을 번들 옆으로 복사). 트레이싱만으로 부족하다는 것은 2026-08-01 web 배포에서 실측됐고, admin도 DB를 읽으므로 똑같이 필요하다.

Sentry는 **web과 같은 프로젝트**를 쓴다. 둘 다 커밋 SHA로 릴리스를 키잉하므로 `release: { dist: "admin" }`으로 갈라 소스맵 매핑이 엉키지 않게 한다. `@sentry/nextjs` v10에서 `dist`는 최상위가 아니라 `release.dist`에 있다.

## Common Gotchas

- **`middleware.ts`의 matcher에서 `robots.txt`를 빼야 한다.** 빼먹으면 크롤러 요청이 미인증으로 잡혀 `/login`으로 307되고 `Disallow: /`가 아무에게도 전달되지 않는다. web의 matcher는 특정 경로만 겨냥해서 이 문제가 없었다 — admin의 "전부 보호" 방식이 만든 차이다
- CSP의 `connect-src`는 `'self'`와 Neon뿐이다(`next.config.js:65`). S3·Polar·Inngest는 admin이 쓰지 않는다. **브라우저에서 나가는** 외부 호출을 추가하면 CSP도 함께 고쳐야 한다 — `pipeline/`의 GitHub 호출은 전부 서버 측(서버 컴포넌트·서버 액션)이라 여기 걸리지 않는다
- **admin은 DB를 읽기만 한다.** 현재 접근은 `db.analyticsEvent.findMany` 하나뿐이고 DB 쓰기 경로가 없다. DB 쓰기를 추가하는 것은 이 앱의 성격을 바꾸는 일이니 먼저 확인할 것
- **외부 쓰기는 하나뿐이다** — `pipeline/command-action.ts`가 GitHub 이슈에 코멘트를 POST한다(FEAT-03, 소유자 발주). `requireAdmin()` 뒤에 있고 되돌릴 수 있으며 기록이 남는다. 여기에 외부 쓰기를 더 늘리는 것도 성격 변경이니 먼저 확인할 것
- 서버 액션의 성공/실패는 `~/lib/result`의 `ActionResult`로 표현한다(`observability/test-action.ts`). 인가 실패는 여기 담기지 않는다 — `requireAdmin()`이 `redirect`/`notFound`로 던진다
- `@repo/db`는 bare `node`로 임포트되지 않는다(확장자 없는 임포트 + Prisma CJS 디렉터리 임포트). 테스트는 `tsx`로 돌린다

## File Editing on Windows

Edit / Write 도구의 `file_path`에는 역슬래시(`\`)를 쓴다. Bash 도구에서는 정방향 슬래시(`/`)를 쓴다. Bash 도구에 PowerShell here-string(`@'...'@`) 문법을 쓰면 리터럴 `@`가 들어가므로, 커밋 메시지는 `git commit -F <파일>`로 넘긴다.
