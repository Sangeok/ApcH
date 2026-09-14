# BUG-09 — 「Manage Subscription」 프로덕션 500, 고객 포털 미개방 (web-dev)

## 2026-09-14 구현

계획서 `docs/plans/BUG-09.md`의 「고칠 파일」·「구현 스케치」 §1(공통 변경)을 그대로
구현했다. §2(후보별 변경)·§3(소유자 확인)은 구현 대상이 아니며 「범위 밖 의존」이다.

구현 전 「현재 동작」이 코드와 일치함을 확인했다:
- `route.ts:1-40` — `CustomerPortal({...})` 위임 핸들러(`:8-24`) + 앞단 가드(`:26-37`) +
  `return portalHandler(req)`(`:39`)가 스케치 before와 정확히 일치.
- `polar.ts:12` `export const POLAR_SERVER = env.POLAR_SERVER ?? "sandbox"`, `:14-20`
  `getPolarClient()` 존재.
- `shared/observability/index.ts:1-7`이 `reportError` 재수출. `report-error.ts:83-86`
  시그니처 `context: { origin: string } & ReportContext`이고 `ReportContextValue`가
  `string | number | boolean | null | undefined`라 `server`(문자열 리터럴 유니온)·
  `customerId`(string) 대입이 타입 통과.
- `page.tsx:8` `searchParams: Promise<{ success?: string }>`, `:25`
  `hasReturnedFromCheckout={params.success === "true"}` 일치.
- `BillingPage.tsx` props 인터페이스(`:20-26`)·구조분해(`:28-33`)·`trackedCheckoutSuccessRef`
  일회성 패턴(`:39`,`:71-78`)·`useRouter`/`toast`/`useRef`/`useEffect` 임포트 모두 일치.

### 고친 파일 (전수, 3개)

1. `apps/web/src/app/api/portal/route.ts` — 파일 전체 교체(스케치 after 전문).
   `CustomerPortal` 위임 핸들러(`:8-24`)와 `return portalHandler(req)`를 제거하고,
   `getPolarClient().customerSessions.create({ customerId })`를 직접 try/catch로 호출.
   성공 시 `NextResponse.redirect(customerPortalUrl)`, 실패 시
   `reportError(error, { origin: "portal.customerSession", userId, server: POLAR_SERVER, customerId })`
   후 `NextResponse.redirect(new URL("/dashboard/billing?portal=error", req.url))`.
   앞단 가드(로그인 없으면 `/login`, `customerId === null`이면 `/dashboard/billing`) 로직은
   유지. 임포트에서 `CustomerPortal`·`~/env`를 빼고 `getPolarClient`·`reportError`를 추가.
   스케치대로 `:27-28`의 낡은 주석은 되살리지 않음.
2. `apps/web/src/app/dashboard/billing/page.tsx` — `searchParams` 타입에 `portal?: string`
   추가, `BillingPage` 호출에 `hadPortalError={params.portal === "error"}` 한 줄 추가.
3. `apps/web/src/fsd/features/billing/ui/BillingPage.tsx` — props 인터페이스에
   `hadPortalError: boolean` + JSDoc 추가, 구조분해에 `hadPortalError` 추가,
   `portalErrorShownRef` 추가, `hadPortalError`가 참이면 한 번만 `toast.error(...)` 후
   `router.replace("/dashboard/billing")`로 쿼리 정리하는 이펙트 추가
   (`trackedCheckoutSuccessRef` 일회성 패턴과 동일한 형태).

### 스케치 대비 차이

분기 순서·조건·리터럴 값·사용자에게 보이는 문구 모두 스케치와 동일하다.
토스트 문구는 스케치의 정확한 영문
`"Couldn't open the subscription portal. Please try again in a moment."`을 그대로 사용.
스케치에 없던 사소한 문서 추가 하나: `BillingPage.tsx`의 새 prop `hadPortalError`에
JSDoc 한 줄과 새 이펙트 위 설명 주석을 붙였다(형제 prop `hasReturnedFromCheckout`가
JSDoc을 가진 관례를 따른 것으로, 동작·문구·조건에는 영향 없음).

### 검증

- `npm run check -w apps/web` → EXIT 0 (tsc --noEmit 통과, verify:fsd:test 11/11,
  verify:fsd "FSD boundary check passed", next lint "No ESLint warnings or errors").
- `npm test -w apps/web` → 131 pass / 0 fail (31 suite). 새 테스트 없음(기준선 131 유지).
- `git diff --name-only` + `git ls-files --others`로 내가 만진 파일이 위 3개뿐임을 확인.
  그 외 diff(`shared/analytics/lib/metadata.ts`·`.test.mjs`, `packages/db/*`,
  `docs/agents/main-loop/FEAT-38.md`, `apps/web/.claude/settings.local.json`, `nul`,
  `packages/db/prisma/migrations/20260909000000_user_default_settings/`)는 커밋 보류 중인
  FEAT-38 및 세션 시작 시점부터 있던 변경으로, 이번 작업과 무관해 건드리지 않았다.

### 테스트로 못 덮은 범위 (배포 후 수동 확인 — 원장 C-02·C-49 대상)

계획서 「테스트」 절 그대로. `tsx` Node 러너에는 DOM·React 도구가 없고 라우트 핸들러의
외부 I/O(`auth()`·Prisma·Polar `customerSessions.create`·`NextResponse.redirect`)와
클라이언트 토스트는 러너 밖이라 뽑아낼 순수 로직이 없다.

1. 프로덕션 「Manage Subscription」이 500 대신 실제 Polar 포털로 열리는가.
2. 실패 시 `/dashboard/billing?portal=error`로 리다이렉트되고 토스트가 한 번 뜬 뒤
   `router.replace`로 쿼리가 지워지는가(새로고침 재발화 없음).
3. 예외가 `origin`·`userId`·`server`·`customerId`와 함께 Sentry에 도달하는가
   (후보 (a) 환경 불일치 / (b) 없는 고객 id를 가르는 진단 정보).

### 범위 밖 의존 (구현 대상 아님 — 소유자 작업)

- Vercel 환경변수(`POLAR_SERVER`·`POLAR_ACCESS_TOKEN`) 확인·수정 — 후보 (a)의 실제 수정.
- Polar 고객 데이터(`polarCustomerId`) 재연결 — 후보 (b)의 실제 수정.
- `polar.ts:12`·`env.js:30`의 `POLAR_SERVER` production 필수화(폴백 제거)는 쓰기 범위 안이나
  (a) 확정 + 별도 승인 사항이라 이번 구현 대상이 아니다. 원하면 후속 항목으로 분리.
