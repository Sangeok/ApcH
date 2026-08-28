# FEAT-25 — 메인 루프 기록 (게이트 결정·검증 라운드)

## 선정과 게이트① 개방 (2026-08-28)

FEAT-25는 2026-08-27 사용자 결정으로 FEAT-26(release-verifier 루틴)과 함께 백로그에 등재된
선행 항목이다(`ce2ae45`). 배포 확인 원장(`docs/release-checks.md`)을 사람 지시 없이 닫는 루틴이
프로덕션 admin을 열려면 로봇이 통과할 수 있는 인증 경로가 있어야 하는데, 현재 admin 로그인은
Google 단일 provider + `ADMIN_EMAILS` 화이트리스트라 그 경로가 없다 — 이 항목은 그 경로를 만든다.

- 선정: 미결 0건 상태에서 사용자가 세션에서 FEAT-25를 지목했고, 메인 루프가 그 사실을 브리핑에
  실어 `pm`을 디스패치했다. pm이 2026-08-28 섹션에 1건 선정(`aa36485`) — FEAT-26·27은 담당이
  main-loop라 pm 표 밖, FEAT-01은 3차 감사(08-26)의 전제 의심으로 사용자 판정 대기.
- 게이트①: 사용자가 세션에서 "계획 지시"로 개방. 메인 루프가 보드를 `계획지시`로 편집했고
  결정은 사용자의 것이다. 병렬 미결 없음(이 행 1건).
- 요구 원천: `TASK_BACKLOG.md`의 FEAT-25 `source`(관측 / 진단(코드 확정) / 수정 방향 (1)(2)(3) /
  설계 시 판단 / 범위 밖 의존). 계획서는 그 수정 방향을 계약으로 삼는다.

admin-dev를 계획서 작성에 디스패치한다. 메인 루프가 인가 코드를 직접 읽고 잡은 **핵심 판단
지점**(계획 단계에서 다뤄야 할 것):

- **provider 등록 위치와 Edge 분리**: `next-auth@5.0.0-beta.25`, 세션은 이미 JWT(`config.edge.ts:8`)라
  Credentials provider의 전제는 충족. provider는 `config.ts`(Node)에만 넣는다 — `config.edge.ts`는
  env/provider를 import하면 안 되고(`apps/admin/CLAUDE.md:106`) `providers: []`인 채로 미들웨어가
  JWT만 검증하므로 verifier 토큰도 그대로 통과한다. `VERIFIER_SECRET` 부재 시 provider가 아예
  등록되지 않아야 한다(`env.js` optional 추가 → 조건부 spread).
- **signIn 콜백의 분기**: `config.ts:21-24`는 `user.email`이 화이트리스트에 있어야만 true다.
  verifier는 이메일이 아니므로 그대로면 로그인이 거부된다 — `account.provider`로 분기하되 Google
  경로의 화이트리스트 검사는 한 글자도 느슨해지지 않아야 한다(회귀 테스트가 그것을 잠근다).
- **신원의 전달 경로**: authorize → jwt 콜백(`role: "verifier"` 클레임) → session 콜백(`config.ts:25-28`은
  `id`만 옮긴다) → `requireAdmin`. 클레임이 어느 단계에서 떨어지면 조용히 404가 된다 — 계획서가
  세 콜백을 전부 「고칠 파일」에 올리고, 클레임 왕복을 테스트로 덮는다.
- **`requireAdmin`의 이분(읽기/쓰기)**: `guard.ts:19`는 이메일 화이트리스트 밖이면 `notFound()`라
  verifier는 현재 모든 페이지에서 404다. 호출처 11곳을 메인 루프가 열거했다 — **읽기 7**:
  `(protected)/layout.tsx:11`, `analytics/page.tsx:49`, `observability/page.tsx:12`, `pipeline/page.tsx:18`,
  `pipeline/agents/[agent]/page.tsx:24`, `pipeline/docs/[...slug]/page.tsx:17`,
  `run-pipeline-command/api/get-pipeline-progress.ts:14`(GitHub 읽기). **쓰기 4**:
  `post-pipeline-command.ts:27`(이슈 코멘트 POST), `commit-gate-transition.ts:98`·`:121`(보드 PUT,
  승인·반려), `send-observability-test-event.ts:27`(Sentry 전송 — 부수효과이므로 쓰기로 분류).
  옵션(`requireAdmin({ write: true })`)이냐 분리(`requireOperator`)냐는 계획서가 정하되, 기존
  "auth-first, try 밖 최상단" 계약(`send-observability-test-event.ts:19`)과 각 액션 테스트의 guard
  module mock이 깨지지 않는 쪽이어야 한다. 쓰기 거부의 응답은 `notFound()`로 통일하는 것이 기존
  3층 방어선 관례와 맞는다(존재를 드러내지 않는다).
- **반환 shape**: `requireAdmin`은 `{ userId, email }`을 돌려주고 `layout.tsx:11`·
  `send-observability-test-event.ts:27`이 `admin.email`을 쓴다. verifier는 email이 없다 — 타입을
  `email: string | null`로 넓힐지, verifier에 고정 표시명을 줄지 계획서가 정하고, `layout.tsx`가
  헤더에 뭘 보여줄지도 적는다(사용자 노출 문구).
- **세션 수명 1h**: `session.maxAge`는 전역(8h, `config.edge.ts:11`)이라 provider별로 못 줄인다.
  jwt 콜백이 발급 시각 클레임을 심고 `requireAdmin`이 1h 초과 시 fail-closed(`redirect("/login")` 또는
  `notFound()`)하는 방식이 유력 — Edge `authorized`에서도 자를지는 계획서 판단(Edge는 토큰을 읽을 수
  있으므로 가능하나 config.edge 테스트 범위가 늘어난다).
- **비밀값 비교**: 길이 검사 + `crypto.timingSafeEqual`. authorize는 실패 시 `null`(예외 아님).
  잘못된 비밀값 시도를 로그로 남길지(Sentry 아님, console) 계획서가 정한다.
- **로그인 화면 비노출**: `pages.signIn = "/login"`이 커스텀 페이지라 NextAuth 기본 signin 페이지는
  뜨지 않고, `src/app/login/page.tsx`는 건드리지 않는다. 진입은 `POST /api/auth/callback/<provider-id>`
  뿐이며 **CSRF 토큰 선행(`GET /api/auth/csrf`)이 필요하다** — 이 핸드셰이크(csrf → POST(csrfToken,
  secret) → 세션 쿠키)를 계획서가 명시해야 FEAT-26이 그대로 소비한다. 이것이 FEAT-25의 공개 계약이다.
- **`/login` 리다이렉트 상호작용**: `authorized`(`config.edge.ts:25-28`)는 로그인 상태로 `/login`에
  오면 `/analytics`로 보낸다 — verifier도 같다. 무해하나 계획서 「현재 동작」에 적는다.
- **테스트(순수 로직, live I/O 없음)**: `config.test.mjs`(signIn: Google 허용/거부 회귀 + verifier
  provider 분기), 신규 authorize 테스트(비밀값 부재 → provider 미등록 / 불일치 → null / 일치 → 고정
  신원), `guard.test.mjs`(verifier 읽기 허용·쓰기 거부·1h 만료·Google 경로 무변화), jwt/session 콜백
  클레임 왕복. 인벤토리 handoff 수치는 구현 보고에.
- **경계 검사**: `src/server/auth`는 FSD 밖이지만 `verify-fsd-boundaries.mjs`가 "Edge auth config를
  public root에서 재수출하지 않는다"를 검사한다(`CLAUDE.md:92`). 새 파일(예: `verifier.ts`)이 그
  규칙에 걸리지 않는지 계획서가 `verify:fsd:final` 기준으로 확인한다.
- **UI 아님**: 화면을 새로 만들거나 생김새를 바꾸지 않으므로 `frontend-design` 스킬은 로드하지 않는다
  (`layout.tsx` 헤더의 표시명 한 낱말은 예외로 보지 않는다).
- **handoff(읽기 전용 파일 → 메인 루프)**: `apps/admin/CLAUDE.md`의 라우트 표 `/login`(`:12`),
  「인가: 세 겹 방어선」(`:96-106`), env 절(`:124` — `VERIFIER_SECRET` optional), 테스트 인벤토리.
- **범위 밖 의존(계획서 「범위 밖 의존」에 그대로)**: 비밀값을 Vercel env와 claude.ai 환경에 두는 것은
  사용자 몫. 루틴 자체는 FEAT-26. web 앱은 대상 아님.

## 필수 검증 경로 확정 (2026-08-28, 카탈로그 `docs/plans/verification-paths.md`)

| # | 경로 | 트리거 근거 | 이 항목에서의 구체 검사 |
| --- | --- | --- | --- |
| 1 | 인용 전수 대조 | 모든 항목 | 계획서의 `파일:줄` 인용 전부(admin 코드·경계 스크립트·CLAUDE.md·`@auth/core`/`next-auth` 실물)를 내용까지 대조 |
| 2 | 스케치 추출·실행 | 스케치에 코드 24블록 | 블록을 바이트 그대로 조립해 `npm run check`(fsd test·fsd·lint·tsc)·`npm test`·`verify:fsd:final` |
| 3 | before/after 기계 적용 | 기존 파일 9개 수정 | before 11블록이 현재 트리와 바이트 일치·정확히 1회 매치, 신규 2파일 충돌 없음 |
| 4 | 전칭 여집합 열거 | "호출처 정확히 11곳", "반환값 쓰는 곳 …뿐", "fetch owner N개", "`providers: [Google]`" | `requireAdmin` 호출처·`admin.` 사용처·`FSD_EFFECT_OWNERS.fetch` 항목을 열거 |
| 5 | 돌연변이 검사 | 순수 함수(`verifyVerifierSecret`·`authorizeVerifier`·`buildVerifierProvider`)·콜백 3·`requireAdmin` 분기 신설 | 「테스트」 명세를 실제 테스트로 옮겨 구현에 오류를 심고 전부 사멸하는지 |
| 6 | 실제 사건 재생(변형) | 외부 신호 = NextAuth 라이브러리 동작(credentials 콜백·CSRF·쿠키·실패 응답·Edge 세션 구성) | 가상 예제가 아니라 설치된 `@auth/core@0.41.1` 소스를 직접 읽고, Edge `authorized`에 라이브러리가 만드는 형태의 세션을 넣어 실행 |
| 7 | 음성 시험 | 경계 규칙(R5/R7/R11/R13)에 기대고 쓰기 거부·화이트리스트 불변을 주장 | client 모듈이 `verifier.ts`를 import하면 R5가 실제로 실패하는지; 거부·불변은 5의 돌연변이로 |
| 8 | 실물 렌더 | `AdminHeader` prop·문구 변경 | `renderToStaticMarkup`으로 `email` / `null` 두 상태 렌더 |
| 9 | 구조적 아티팩트 검사 | `env.js`(config)·`next-auth.d.ts`(타입 증강) 변경 | 텍스트가 아니라 `tsc`(checkJs 포함)가 구조로 검사 — 2에 포함 |

## 검증 1라운드 (2026-08-28, 메인 루프 — `reconciling-proposals-with-codebase`, High-Risk 프로파일: 인가 변경)

하니스는 스크래치패드 `feat25/`(계획서 코드 블록 추출·적용 스크립트, 명세→테스트 3파일, 돌연변이 러너, 렌더·Edge 스니펫). 트리에 적용 → 검사 → `git checkout`/삭제로 복원, 라운드 끝 `git status`로 청결 확인.

경로 3: before 11블록 전부 정확히 1회 바이트 일치, 신규 2파일 충돌 없음(13/13). 경로 6·1: 라이브러리 실물이 계획서 주장과 일치 — `User extends DefaultUser`(`types.d.ts:222`), `JWT extends Record<string, unknown>, DefaultJWT`, credentials 분기가 `account{providerAccountId,type,provider}`를 만들고 `sub: user.id`(`callback/index.js:239-251`), CSRF는 credentials callback POST에만(`lib/index.js:52-55`), 쿠키명(`cookie.js:45-69`), urlencoded 파싱(`web.js:6-13`), Edge 세션 user는 `{name,email,image}`(`session.js:38`). 경로 4: `requireAdmin` 호출처 grep = 11(읽기 7·쓰기 4) 일치, `admin.` 사용처 = layout:15·send-obs:31 둘뿐 일치.

**결함 8건** (전부 계획서 수정으로 해소):

1. **테스트 명세가 존재하지 않는 표면을 본다** — `Credentials()`는 `{ id: "credentials", …, authorize: () => null, options: config }`를 돌려주고(`@auth/core/providers/credentials.js`) `id`·`authorize`는 init 시 `options`에서 병합된다(`lib/utils/providers.js:12-17`). 명세의 `provider.id === "verifier"`·`provider.authorize(...)`는 그대로 쓰면 실패. → `.options.*`로 정정, §1에 팩토리 모양 절 추가.
2. **fetch owner 수 오기** — "정확히 4개"는 옛 값. `FSD_EFFECT_OWNERS.fetch`(`:30-39`)는 **6개**(agent-report·repo-doc queries 추가). 인용 `:79-91`은 `NETWORK_MODULES`였다. → 「현재 동작」·「범위 밖 의존」 정정, R5 인용(`:361-380`) 추가.
3. **`.env.example` 목적지 누락** — 루트 `.env.example` `# Auth`(`:1-6`)가 admin 인증 변수를 열거하는데 `VERIFIER_SECRET` 줄이 어디에도 없었다(스킬의 secret provenance 층). → handoff에 추가(루트 파일이라 메인 루프 몫).
4. **공개 계약 불완전** — 실패 응답도 302(`/login?error=CredentialsSignin&code=credentials`, 세션 쿠키 없음, `@auth/core/index.js:120-140`)라 FEAT-26이 상태코드로 판정하면 오판. → "세션 쿠키 존재로 판정" + CSRF 적용 범위 + 본문 파싱 명시.
5. **`JWT` 증강이 병합되지 않는다(경로 2·9 실측)** — 스케치 그대로 조립하니 lint·fsd는 통과했지만 `tsc`가 `token.role`을 `unknown`으로 보고 TS2322 2건(`config.ts:44`·`index.ts:8`). `next-auth/jwt`가 `export *` 재수출이라 `declare module "next-auth/jwt"`가 `JWT`에 닿지 않고, `@auth/core/jwt` 직접 증강도 동일했다(실측 (a)). `User` 증강은 명명 재수출이라 병합됨(에러 메시지의 `string | undefined`가 증거). → (b) JWT 증강 삭제 + session 콜백 `typeof` 좁히기: `tsc` 0 실측. §2·§3·「고칠 파일」·「대안」 정정.
6. **테스트 명세 시점 모호** — `authConfig`는 모듈 로드 시 1회 평가라 `VERIFIER_SECRET`을 `beforeEach`에 넣으면 provider 미등록. → "`await import` 전에" 명시.
7. handoff 수치 미확정 → 조립 실측 28→29파일·68→74suite·307→333test 기입(구현 후 재계측 조건).
8. 내 편집의 R5 인용 `:369-377`이 `"R5"` 줄(378)을 못 담음 → `:361-380`; `.env.example` 열거에 `AUTH_URL` 누락 → 보완. (같은 편집 라운드 안에서 정정)

(b) 상태 실측: `npm run check` 0(verify:fsd:test·verify:fsd·ESLint 0·tsc 0) · `npm test` **333 pass/74 suite/0 fail**(307/68에서 +26/+6, 파일 28→29) · `verify:fsd:final` 0 · 경로 8 렌더 6/6(`<p class="font-medium">검증기 (읽기 전용)</p>`, email 상태 회귀 없음) · 경로 6 Edge `authorized`: 라이브러리 형태 verifier 세션으로 `/pipeline`→`true`, `/login`→`/analytics` 리다이렉트, 무세션→`false` · 경로 7: `"use client"` 파일이 `~/server/auth/verifier`를 import하니 `[R5] client module imports server runtime` 종료코드 1, 제거 후 0 · 경로 5: 돌연변이 **16/16 사멸**(M01 길이검사 제거·M02 빈 expected 허용·M03 무비밀 등록·M04 신원 id 오기·M05 signIn 분기 제거·M06 role 미설정·M07 발급시각 미설정·M08 session 미전달·M09 provider 미등록·M10 signIn 전체 허용·M11 쓰기 거부 제거·M12 만료 제거·M13 클레임 부재 허용·M14 email ""·M15 역할 무시·M16 write가 admin도 차단).

통합 편집 1회(계획서 9곳 + 정정 2곳). 편집 라운드이므로 판정 아님 → 무편집 패스로.

## 검증 2라운드 — 무편집 최종 패스 (2026-08-28, 메인 루프)

최신 저장본을 다시 읽고(회상 아님) 같은 하니스를 원본 트리에서 재실행: 경로 1 인용 **48건(명명) + 17건(bare)** 전부 해석·내용 일치(스크립트 덤프를 줄별로 대조) · 경로 3 13/13 · 조립된 `config.ts`·`next-auth.d.ts`가 1라운드 (b) 실측본과 바이트 동일 · `check` 0 · `test` 333/74/0 · `final` 0 · 렌더 6/6 · 돌연변이 16/16 · 복원 후 `git status`에 계획서와 사용자 로컬 설정만.

INV-4 상태표: 초기(무세션) → 성공(csrf GET → callback POST → 302+세션 쿠키) → 실패(302, 쿠키 없음) → 종결(verifier 1h 뒤 `notFound`; 복구는 재로그인 = 루틴 매 실행) → 정리(JWT 8h 자체 만료, 서버 상태 없음). 상태 변이 표면 신설 없음(로그인은 반복 안전, 공유 집계 없음). 인가 목적지: 쓰기 4곳 `write: true`로 verifier 거부, 읽기 7곳 허용은 설계. 세 층: 버전(`next-auth@5.0.0-beta.25`/`@auth/core@0.41.1` 실물 확인)·픽스처(액션 테스트 4곳 mock이 인자 미단언, `commit-gate:26`·`send-obs:13`·`post-command:14`·`get-progress:18`)·관측(없음).

**결함 0건. 비-결함 위험**(구현·인수 시 확인): (1) 비밀값 무차별 대입에 속도 제한 없음 — 긴 난수 + 읽기 전용으로 감수(백로그 명시), (2) `/login`이 `error=CredentialsSignin`에 안내 문구 없음 — 로봇 전용 경로라 무해, (3) `token.email` 없는 세션이 `/api/auth/session`에 노출 — 열람 이상 아님.

Minimal Replay Anchor(응답 내 기록; 완전성 증명 아님): HEAD `0980119` · 계획서 blob `28c9ac353211` · 범위 `apps/admin/src/{server/auth,env.js,fsd/widgets/admin-header,fsd/features/{run-pipeline-command,transition-pipeline-gate,send-observability-test}/api}` + `scripts/verify-fsd-boundaries.mjs` + `node_modules/{next-auth,@auth/core}` · 레시피 `feat25/apply-plan.mjs --check`(safe) · `cite-check.mjs`(safe) · `round2.sh`(mutating: 트리 적용 후 복원) · 최종 패스 무편집: 예.

**판정**: 메인 루프 라운드 무소득 → `plan-verifier` 디스패치 자격 충족(보드 정지 규칙: 독립 무편집 무소득 패스 1회가 판정). 브리핑은 중립 — 위 결함·판정 정보를 싣지 않는다.

## 검증 3라운드 — `plan-verifier` 독립 무편집 패스 (2026-08-28, 1사이클째)

중립 브리핑(항목ID·계획서 경로·필수 경로 9개만) 디스패치. 검증자가 "브리핑에 사전 판단 없음"을 명시. 워크트리를 스크래치패드에 만들어(루트 `node_modules` 정션) 조립했고, 라운드 뒤 메인 루프가 `git status --untracked-files=all`·`git worktree list`로 직접 검산 — 저장소 무변경, worktree 잔존 없음.

**결함 0건.** 경로별 증거: ① 인용 전부 내용 일치(admin 코드·경계 스크립트 bare 인용 8곳·`@auth/core`/`next-auth` 실물·CLAUDE.md·`.env.example`) ② 조립 `npm test` 334/75/0(검증자 저술 테스트가 1개 더 — 계획서가 "구현 후 재계측"이라 못박은 편차; 파일 28→29 일치), `verify:fsd:test`·`verify:fsd`·`final`·`tsc`·`next lint` 0(워크트리에 `.env`가 없어 lint의 env 검증만 `SKIP_ENV_VALIDATION`) ③ before 전부 바이트 일치·1회 매치, 신규 3파일 충돌 없음 ④ 호출처 11·반환값 사용 2·fetch owner 6 여집합 확증 ⑤ 돌연변이 12종 전부 사멸(원복 후 0 fail) ⑥ Edge `authorized` 실행: verifier `/pipeline`→true, `/login`→`/analytics`, anon→false/true ⑦ R5 프로브 종료코드 1→제거 시 0, `final` 통과 = owner 6개 불변 ⑧ `AdminHeader` 실렌더 두 상태 정확 ⑨ `tsc` 0 + **`next-auth.d.ts` 역실측**(제거 시 `guard.ts` 2건 에러·복원 시 0 — 증강이 load-bearing) + `createEnv` 실파싱(`VERIFIER_SECRET` optional). 비-결함 관찰 1: `next-auth/index.d.ts:78` 인용의 괄호 안 문구가 실제 줄의 축약(명명 재수출이라는 실질은 참).

**판정**: 독립 무편집 클린 패스 1회 달성 → 보드 정지 규칙 충족. `검증:` 줄 기록. **게이트②(구현승인) 대기 — 사용자만 연다.** 병렬 미결 없음.

## 게이트② 개방 (2026-08-28)

사용자가 세션에서 "구현 승인"으로 개방. 메인 루프가 보드를 `구현승인`으로 편집했고 결정은 사용자의 것이다. 계획서는 클린 패스 시점(`82b9495`) 그대로 — 사용자 편집 없음. 병렬 미결 없음. admin-dev를 B단계(구현)에 디스패치한다 — B-1 계획서 파일 재독, B-3 「현재 동작」↔코드 대조, B-4 「고칠 파일」 12개 밖 무접촉, B-5 세 명령 통과가 조건이며, 읽기 전용 파일(`apps/admin/CLAUDE.md`·루트 `.env.example`) 동기화는 `비고:`로 받아 메인 루프가 인수 시 처리한다.

## 구현 인수 (2026-08-28, 메인 루프)

**인수 다섯 조건 — 전부 직접 재현**(스크래치패드 `feat25/accept.sh`):
1. **변경 파일 ↔ 「고칠 파일」**: `git status --untracked-files=all` 집합이 신규 3(`verifier.ts`·`next-auth.d.ts`·`verifier.test.mjs`) + 수정 9 + 보드·백로그·보고서와 **정확히 일치**(diff 0). `layout.tsx`·`config.edge.ts`·`middleware.ts`·경계 스크립트 무접촉.
2. **diff ↔ 「구현 스케치」**: 계획서 after 블록 13개가 전부 실제 파일에 바이트 포함, before 블록 8개 전부 소멸(기계 검사). 분기 순서·조건·리터럴·문구 스케치와 동일 — admin-dev 보고와 일치.
3. **검증 직접 재실행**: `check` EXIT 0 · `test` EXIT 0(**334 pass/75 suite**, fail 0; 계획서 예측 333/74 대비 +1/+1은 테스트 분할 입도, 계획서가 "구현 후 재계측" 명시) · `verify:fsd:final` EXIT 0. 테스트 파일 28→29.
4. **백로그 제거**: FEAT-25 블록 소멸(`-4줄`). 잔존 언급 2건은 FEAT-26 항목의 "(FEAT-25 의존)" 참조(`:26`·`:28`) — 정상. 인접 BUG-04·BUG-08·FEAT-01·FEAT-26·27 무결.
5. **상세 기록 실재**: `docs/agents/admin-dev/FEAT-25.md`(6.8KB). 보드 `결과` 138자.

**읽기 전용 파일 동기화(메인 루프 몫)**: `apps/admin/CLAUDE.md` — 라우트 표 `/login`, 인벤토리 총계 29파일·75suite·334test + `verifier.test.mjs` 행 + `config.test`·`guard.test` 계약 문구, 「인가: 세 겹 방어선」에 검증기 문단(세 층 통과 방식·쓰기 4곳·1h·`JWT` 미증강 사유), env 절 `VERIFIER_SECRET`. 루트 `.env.example` `# Auth`에 `VERIFIER_SECRET=""`. 인벤토리 표 29행 = 실제 29파일(`find` 계수) 일치.

「범위 밖 의존」: 새 백로그 후보 없음 — 소비 루틴은 이미 FEAT-26으로 등재, 비밀값 주입은 사용자 몫(원장 선행 조건으로 기재).
「못 덮는 범위」: `docs/release-checks.md`에 FEAT-25 절 4줄 등재(배포 대기). `timingSafeEqual` 상수시간 성질은 배포 실물로도 관측 불가라 등재하지 않았다(코드 대조로 갈음 — 구현 시점 종결).

## 배포 확인 스윕 (2026-08-28, 메인 루프 — curl, admin 프로덕션)

PR #107 머지(12:07 KST) 직후 첫 실측은 `providers = [google]`·callback `error=Configuration` — `VERIFIER_SECRET` 저장만으로는 안 실리고 Redeploy가 필요했다(GitHub 배포 기록엔 대시보드 Redeploy가 새 항목으로 남지 않았으나 12:28 KST 실측에서 `verifier` 등록 확인). 사용자 Redeploy 뒤:

- 핸드셰이크: csrf → 정답 POST **302 `/`** + `__Secure-authjs.session-token` / 오답 302 `/login?error=CredentialsSignin&code=credentials` 쿠키 없음 / CSRF 누락 302 `/login?error=MissingCSRF` — 계획서 「공개 계약」의 세 응답과 정확히 일치.
- 세션: `/api/auth/session` → `{id: "verifier", role: "verifier", email: null, verifierIssuedAt: <number>}`.
- 페이지: `/pipeline`·`/analytics`·`/observability`·`/pipeline/agents/admin-dev`·`/pipeline/docs/plans/FEAT-25` 전부 200, 본문 「검증기 (읽기 전용)」, 이메일 노출 없음 → Edge가 실제 verifier JWT를 통과시킴(계획서 「못 덮는 범위」 네 번째 항목 실증). `/login` 302 `/analytics`, 무세션 `/pipeline` 307 `/login?callbackUrl=…`.
- 원장 FEAT-25 절 1·2줄 `확인` 마감. 3줄(쓰기 거부)은 브라우저 실측 대상, 4줄(1h)은 03:29Z 발급 세션을 스크래치패드에 보관해 04:30Z 이후 재확인.
- 비밀값·토큰 값은 어디에도 기록하지 않았다(로컬 `.env`는 gitignore·미추적 확인).
