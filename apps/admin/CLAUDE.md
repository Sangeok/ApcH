# CLAUDE.md

이 문서는 `apps/admin`의 현재 구조와 작업 규칙을 설명한다. 저장소는 npm workspaces monorepo이며, admin과 web은 `@repo/db`만 공유한다. UI와 인증 설정은 앱별로 소유한다.

## 앱 개요

`admin.a-pch.com`은 운영자용 내부 대시보드다. DB는 읽기 전용이며, 현재 DB 접근은 analytics event의 `findMany` 하나뿐이다. 외부 쓰기는 GitHub issue comment POST와 `PROJECT_BOARD.md` contents PUT 두 경로뿐이다.

| 라우트 | 내용 |
| --- | --- |
| `/` | `/analytics`로 리다이렉트 |
| `/login` | Google 로그인 |
| `/analytics` | 개요·퍼널·이탈·최근 실패 |
| `/observability` | Sentry 리포팅 점검 |
| `/pipeline` | 파이프라인 보드 투영·게이트 전이·원격 명령 |
| `/api/auth/[...nextauth]` | NextAuth 핸들러 |

`app/robots.ts`는 모든 크롤러에 `Disallow: /`를 반환한다.

## 개발 명령

```bash
npm run dev:admin
npm run check -w apps/admin
npm test -w apps/admin
npm run verify:fsd -w apps/admin
npm run verify:fsd:final -w apps/admin
npm run build -w apps/admin
```

`check`는 boundary rule fixture, 현재 tree의 FSD 경계, ESLint, production TypeScript를 순서대로 검사한다. 테스트는 Node 내장 러너에 `tsx`와 experimental module mock을 연결한다.

## 테스트 인벤토리

현재 **21개 파일, 40개 suite, 187개 test**다. 아래 첫 열은 `src/**/*.test.mjs` 전체 집합이며 파일마다 정확히 한 번만 적는다.

| 파일 | 핵심 계약 |
| --- | --- |
| `src/server/auth/parse-admin-emails.test.mjs` | 관리자 이메일 정규화·빈 값·중복 제거 |
| `src/server/auth/config.edge.test.mjs` | 로그인 경로와 protected 경로의 Edge authorized 분기 |
| `src/server/auth/config.test.mjs` | Node sign-in allowlist |
| `src/server/auth/guard.test.mjs` | redirect·notFound·허용 identity |
| `src/fsd/entities/analytics-event/api/queries.test.mjs` | 단일 read-only `findMany` shape와 최근 실패 filter/limit |
| `src/fsd/entities/analytics-event/model/reporting.test.mjs` | 퍼널 순서·drop-off·실패 집계와 결정적 정렬 |
| `src/fsd/entities/pipeline/api/queries.test.mjs` | raw board no-store GET과 non-OK 실패 |
| `src/fsd/entities/pipeline/model/board.test.mjs` | `PROJECT_BOARD.md` 파싱, 중복 `결과:` 누적, `검증` 필드(부재→null) |
| `src/fsd/entities/agent-report/model/report-index.test.mjs` | contents 디렉터리 응답 → 보고서 목록, README 제외, 결정적 정렬, 부분 집계 금지 |
| `src/fsd/features/run-pipeline-command/api/post-pipeline-command.test.mjs` | auth-first, whitelist, exact GitHub POST |
| `src/fsd/features/run-pipeline-command/model/commands.test.mjs` | command body와 key whitelist |
| `src/fsd/features/run-pipeline-command/api/get-pipeline-progress.test.mjs` | auth-first, 6h `since` 창, `created_at` 재필터, shape 실패 fail-closed, FIFO 입력 전달 |
| `src/fsd/features/run-pipeline-command/model/run-plan.test.mjs` | 실행 라벨 전 경우와 프로토타입 오염 방어 |
| `src/fsd/features/run-pipeline-command/model/progress.test.mjs` | 명령:답글 FIFO 짝짓기, 상태 다섯, 임계·시계·접두 경계 |
| `src/fsd/features/send-observability-test/api/send-observability-test-event.test.mjs` | auth-first Sentry scope/capture/flush 순서 |
| `src/fsd/features/transition-pipeline-gate/api/commit-gate-transition.test.mjs` | auth-first, GET/PUT, optimistic lock, 실패 shape |
| `src/fsd/features/transition-pipeline-gate/model/transitions.test.mjs` | 승인·반려 전이, 최소 diff, stale/format 거부, 되돌리기의 `검증:` 줄 제거(1줄·2줄) |
| `src/fsd/pages/pipeline/model/briefing.test.mjs` | 보드→briefing·roster·발화 매핑, 검증 판정 전달(검토대기만) |
| `src/fsd/pages/pipeline/model/desk-commands.test.mjs` | desk→command key와 whitelist 연결 |
| `src/fsd/pages/pipeline/model/sprites.test.mjs` | pixel grid·appearance·tone 매핑 |
| `src/fsd/shared/observability/report-error.test.mjs` | 예외 capture, user isolation, never-throw flush |

Node module mock으로 DB/GitHub/Sentry 호출 계약을 실제 외부 I/O 없이 검증한다. DOM client interaction과 반응형 시각 상태만 수동 smoke 대상으로 남긴다.

`analytics-reporting-contract: import-free; DB/server-only/fetch forbidden`

`test-typing-contract: production tsconfig only; no test:types`

`test-runtime-contract: module-mocked DB/GitHub/Sentry; live I/O forbidden; DOM client interaction manual`

## 구조: right-sized FSD

`src/app`은 Next.js routing shell, `src/server/auth`는 앱 전역 auth runtime, `src/fsd`는 제품 코드를 소유한다.

| 영역 | 책임 |
| --- | --- |
| `src/app` | route group, layouts, pages, route handlers, metadata |
| `src/server/auth` | Edge/Node auth config, `requireAdmin`, email parser |
| `src/fsd/pages` | analytics·pipeline·observability 화면 조합과 page-private UI/model |
| `src/fsd/widgets` | protected 화면이 공유하는 `AdminHeader` |
| `src/fsd/features` | pipeline command, gate transition, observability test, sign-in |
| `src/fsd/entities` | analytics event와 pipeline board read model/API |
| `src/fsd/shared` | generic UI, class utility, result type, observability wrapper |

의존 방향은 `app → pages → widgets → features → entities → shared`다. 같은 레이어의 peer slice import와 하위 레이어의 상위 레이어 import를 금지한다. slice 밖 소비자는 root public API를 사용하고, slice 내부는 상대 import를 사용한다. page-private `ui/_component`는 page root에서 재수출하지 않는다. feature Server Action과 entity server query, Edge auth config는 public root에서 재수출하지 않는다.

구조 규칙은 `scripts/verify-fsd-boundaries.mjs`가 검사한다. 새 import, public export, DB/network/Sentry owner를 바꾸면 rule fixture와 실제 tree 검사를 함께 통과시켜야 한다.

## 인가: 세 겹 방어선

역할 테이블 대신 `ADMIN_EMAILS` 환경변수가 관리자 집합을 정한다.

| 층 | 위치 | 역할 |
| --- | --- | --- |
| 로그인 거부 | `src/server/auth/config.ts` | sign-in allowlist |
| 경로 보호 | `src/server/auth/config.edge.ts` + `src/middleware.ts` | `/login`을 제외한 경로의 Edge 보호 |
| 목적지 재검사 | 각 protected page/action의 `requireAdmin()` | 삭제된 관리자의 아직 유효한 JWT 차단 |

`src/app/(protected)/layout.tsx`도 인증을 확인하지만, page/action의 목적지 재검사를 대체하지 않는다. `authorized`를 단순 `!!auth?.user`로 바꾸면 matcher에 포함된 `/login`이 자기 자신으로 redirect될 수 있다. Edge config는 Node env/provider/config를 import하면 안 된다.

## 데이터와 외부 효과 소유권

- analytics DB read의 유일한 owner는 `src/fsd/entities/analytics-event/api/queries.ts`이며 허용 호출은 `db.analyticsEvent.findMany` 하나다.
- analytics reporting은 `src/fsd/entities/analytics-event/model/reporting.ts`의 import-free 순수 함수다. canonical event/funnel 계약의 복사본을 만들지 않는다.
- raw board GET owner는 `src/fsd/entities/pipeline/api/queries.ts`다.
- command POST owner는 `src/fsd/features/run-pipeline-command/api/post-pipeline-command.ts`다.
- gate GET/PUT owner는 `src/fsd/features/transition-pipeline-gate/api/commit-gate-transition.ts`다.
- progress GET owner는 `src/fsd/features/run-pipeline-command/api/get-pipeline-progress.ts`다(FEAT-10, 읽기 전용).
- 행위자 보고서 목록 GET owner는 `src/fsd/entities/agent-report/api/queries.ts`다(읽기 전용). 디렉터리 목록은 raw CDN이 404를 주므로 contents API만 가능하다.
- Sentry SDK direct import는 `src/instrumentation.ts`, `src/sentry.server.config.ts`, `src/fsd/shared/observability/report-error.ts`만 허용한다.

GitHub 쓰기 두 경로는 모두 `requireAdmin()` 뒤에서 실행되고 server-side whitelist를 사용한다. command client는 key만 보내며 자유 형식 body를 보내지 않는다. gate client는 action/id/화면이 읽은 status만 보내고, 서버가 최신 board와 대조해 whitelist된 `status/result/block` 최소 edit만 커밋한다. `discard`는 행 제거라 git revert 없이는 되돌릴 수 없다.

## 환경 변수와 빌드

`src/env.js`는 `@t3-oss/env-nextjs`와 Zod로 환경 변수를 검증하며 client 공개 변수는 없다. `ADMIN_EMAILS`는 production에서 필수다. `GITHUB_PIPELINE_TOKEN`은 optional이며 Issues RW와 Contents RW가 필요하다.

루트 `.env`는 `next.config.js`가 먼저 로드한 뒤 `await import("./src/env.js")`로 검증한다. 이 dynamic import를 static import로 바꾸면 ESM 평가 순서 때문에 dotenv보다 검증이 먼저 실행될 수 있다.

Sentry는 web과 같은 프로젝트를 쓰되 `release.dist`를 `admin`으로 분리한다. 검증 build에서는 source-map upload를 비활성화하고 live Sentry 이벤트를 보내지 않는다.

## 경로와 배포

`~/*`는 `./src/*`, 공유 DB 패키지는 `@repo/db`다. Vercel Root Directory는 `apps/admin`, region은 `icn1`이다. Prisma runtime을 위해 `outputFileTracingRoot`와 `PrismaPlugin`을 모두 유지한다.

`middleware.ts` matcher에서 `robots.txt`를 제외해야 한다. 그렇지 않으면 crawler가 `/login`으로 redirect되어 robots 본문을 받지 못한다. 브라우저 외부 호출을 추가하면 CSP `connect-src`도 검토하지만, 현재 GitHub 호출은 모두 서버 측이다.

## Windows

파일 편집 도구에는 Windows 절대 경로를, shell 명령에는 현재 PowerShell 문법을 사용한다. 사용자 변경을 `reset`, `restore`, `checkout --`로 되돌리지 않는다.
