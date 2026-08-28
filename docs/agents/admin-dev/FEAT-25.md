# FEAT-25 구현 보고 (admin-dev)

## 2026-08-28 — 구현

계획서 `docs/plans/FEAT-25.md`(게이트②로 `구현승인`)를 파일에서 다시 읽고 「고칠 파일」 12개(신규 3·수정 9)를 「구현 스케치」의 before/after 블록 그대로 구현했다.

### 고친 파일 전수 (12)

신규 3:
- `apps/admin/src/server/auth/verifier.ts` — verifier 상수(`VERIFIER_PROVIDER_ID`·`VERIFIER_ROLE`·`VERIFIER_MAX_AGE_MS = 60*60*1000`), `verifyVerifierSecret`(길이 검사 후 `timingSafeEqual`), `authorizeVerifier`, `buildVerifierProvider`(비밀값 부재 시 null). §1 스케치 전체 그대로.
- `apps/admin/src/server/auth/next-auth.d.ts` — `declare module "next-auth"`로 `User`에 `role?: string`·`verifierIssuedAt?: number` 증강. `export {};` 선행. `JWT`는 증강하지 않음(§2).
- `apps/admin/src/server/auth/verifier.test.mjs` — `verifyVerifierSecret`·`authorizeVerifier`·`buildVerifierProvider` 단위 테스트. `mock.module("server-only", { namedExports: {} })` 선행. provider 검사는 `provider.options.id`·`provider.options.authorize`를 봄(§1 팩토리 모양).

수정 9:
- `apps/admin/src/server/auth/config.ts` — `./verifier` import 추가, `const verifierProvider = buildVerifierProvider(env.VERIFIER_SECRET)`, `providers`를 조건부 `[Google, verifierProvider]`/`[Google]`, `signIn`에 `account?.provider === VERIFIER_PROVIDER_ID` 분기, `jwt` 콜백 신설(verifier account에만 `role`·`verifierIssuedAt` 심기), `session` 콜백에 `typeof` 좁힘 왕복.
- `apps/admin/src/server/auth/guard.ts` — 전체 교체. `requireAdmin(options: { write?: boolean } = {})`, 반환 `Promise<{ userId: string; email: string | null }>`, verifier 분기(1h 만료·클레임 부재 fail-closed, `options.write`면 `notFound()`, 통과 시 `email: null`)를 admin 화이트리스트 검사보다 먼저.
- `apps/admin/src/env.js` — server 스키마에 `VERIFIER_SECRET: z.string().optional()`, runtimeEnv에 `VERIFIER_SECRET: process.env.VERIFIER_SECRET`.
- `apps/admin/src/fsd/widgets/admin-header/ui/index.tsx` — `email` prop `string` → `string | null`, 렌더 폴백 `{email ?? "검증기 (읽기 전용)"}`.
- `apps/admin/src/fsd/features/run-pipeline-command/api/post-pipeline-command.ts` — `requireAdmin()` → `requireAdmin({ write: true })` (:27).
- `apps/admin/src/fsd/features/transition-pipeline-gate/api/commit-gate-transition.ts` — `:98`(승인)·`:121`(반려) 두 곳 `requireAdmin()` → `requireAdmin({ write: true })`.
- `apps/admin/src/fsd/features/send-observability-test/api/send-observability-test-event.ts` — `const admin = await requireAdmin()` → `requireAdmin({ write: true })` (:27).
- `apps/admin/src/server/auth/config.test.mjs` — `fakeEnv`에 `VERIFIER_SECRET`을 import 전에 주입(모듈 로드 시 1회 평가), Google 회귀 3건 유지 + provider 등록·signIn 분기·jwt/session 왕복 스위트 추가.
- `apps/admin/src/server/auth/guard.test.mjs` — 기존 3건 유지 + verifier 읽기 허용·쓰기 거부·1h 만료·클레임 부재·화이트리스트 미조회·admin write 허용 6건 추가. `VERIFIER_MAX_AGE_MS`를 `./verifier.ts`에서 실제 import.

`layout.tsx`·`config.edge.ts`·`middleware.ts`·`scripts/verify-fsd-boundaries.mjs`는 계획대로 건드리지 않았다. `git status --short`가 정확히 위 12개(+세션 시작 시점부터 있던 `apps/web/.claude/settings.local.json`, 내 변경 아님)만 보고했다.

### 스케치 대비 차이

- **로직·분기 순서·조건·리터럴·사용자 노출 문구: 스케치와 무차이.** `signIn`/`jwt`/`session` 세 콜백, guard의 verifier 분기 순서(만료→write→반환), `검증기 (읽기 전용)` 폴백 문구, `VERIFIER_MAX_AGE_MS` 값(1h) 모두 스케치 그대로.
- **테스트 계수만 계획서 예측과 다르다.** 계획서 「테스트」 절이 검증 조립 실측으로 예측한 값은 파일 29·suite 74·test 333이었고, 실제 구현 결과는 **파일 29·suite 75·test 334**다(+1 suite·+1 test). 차이는 로직이 아니라 내 테스트의 describe/`it` 분할 입도 — 계획서가 "구현 후 재계측해 보고"라고 명시한 부분이라 실측치를 보고한다. 스펙의 "덮는 것" 항목은 전부 실제 테스트로 존재한다(verifier 단위·config provider/signIn/jwt/session 왕복·guard 6분기).

### 검증 명령과 결과

- `npm run check -w apps/admin` → **EXIT 0**. 스크립트 체인 `verify:fsd:test && verify:fsd && next lint && tsc --noEmit`: 경계 픽스처 13/13 pass, `FSD boundary check passed (migration)`, `✔ No ESLint warnings or errors`, `tsc --noEmit` 0에러.
- `npm test -w apps/admin` → **EXIT 0**. `# tests 334 / # suites 75 / # pass 334 / # fail 0` (기존 307/68 → 334/75).
- `npm run verify:fsd:final -w apps/admin` → **EXIT 0**. `FSD boundary check passed (final)`. 신규 `verifier.ts`·`next-auth.d.ts`는 FSD 밖·비-public-entry라 R5/R7/R11 어느 규칙에도 걸리지 않고, verifier는 네트워크 호출이 없어 fetch owner 6개 그대로.

### 테스트로 못 덮은 범위 (배포 후 수동/FEAT-26)

- 실제 NextAuth 핸드셰이크(`GET /api/auth/csrf` → `POST /api/auth/callback/verifier` → 세션 쿠키): HTTP·서명 JWT·쿠키 발급이라 module mock 밖. FEAT-26 소비 경로에서 배포 후 실증.
- `AdminHeader`의 `검증기 (읽기 전용)` 폴백 렌더: DOM 렌더라 Node 러너 밖. 수동 smoke.
- `timingSafeEqual`의 상수시간 성질: 단위 테스트는 정오만 검증하고 타이밍은 측정 안 함.
- 미들웨어 Edge가 실제 verifier JWT를 통과시키는지: Edge 런타임 실행이라 여기서 못 돎.

### handoff (읽기 전용/범위 밖 파일 — 직접 편집 안 함, 메인 루프가 인수 시 반영)

- `apps/admin/CLAUDE.md`(읽기 전용):
  - 테스트 인벤토리(`:35-37`) **28→29 파일 / 68→75 suite / 307→334 test**(+`src/server/auth/verifier.test.mjs`). 계획서 예측 74/333과 달리 실측은 75/334.
  - 라우트 표 `/login`(`:12`)에 verifier POST 진입·로그인 화면 비노출 표기.
  - 「인가: 세 겹 방어선」(`:96-106`)에 verifier 별도 신원·읽기 전용·1h·`requireAdmin({ write })` 옵션 추가.
  - 환경 변수 절(`:124`)에 `VERIFIER_SECRET` optional 표기.
- 저장소 루트 `.env.example`(admin-dev 쓰기 범위 밖): `# Auth` 블록에 `VERIFIER_SECRET=""` 한 줄(선택, 검증기 로그인용 긴 난수).
- 「범위 밖 의존」의 외부 선행/후속(구현을 막지 않음): `VERIFIER_SECRET`(긴 난수)을 Vercel env(admin) + claude.ai 환경변수에 주입은 사용자 몫이고, 이 세션을 소비하는 release-verifier 루틴은 FEAT-26(main-loop 소유)이다.

### 보류/막힌 지점

없음. 세 검증 명령 전부 EXIT 0으로 `완료`.
