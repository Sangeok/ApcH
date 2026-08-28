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
