# BUG-09 — 메인 루프 기록

## 게이트① (2026-09-09)

소유자가 `승인대기` → `계획지시` 개방. FEAT-38과 함께 둘 다 개방했다.

### 개방 시점의 미확정 정보 (소유자만 답할 수 있다)

백로그가 확정에 필요하다고 지목한 둘이 아직 없는 상태로 열었다.

- Vercel 함수 로그의 실제 예외 메시지
- `POLAR_SERVER`·`POLAR_ACCESS_TOKEN`이 sandbox를 가리키는지 production인지

값 자체가 비밀이라 에이전트가 읽을 수 없다. 따라서 web-dev의 계획서는 후보 둘을
모두 상정하고, 어느 쪽인지에 따라 갈리는 지점을 명시한 뒤 **소유자 확인이 필요한
항목으로 남겨야 한다.** 이 사실을 브리핑에 실어 디스패치했다.

## 필수 경로 확정 (2026-09-10)

| 경로 | 채택 | 근거 |
| --- | --- | --- |
| 1 인용 전수 대조 | ○ | 전 항목 필수. 계획서 인용 25곳 이상 (라우트·SDK·라이브러리 소스·UI) |
| 2 스케치 추출·실행 | ○ | after 블록이 `route.ts` 전문 + UI 편집 2건. 워크스페이스 `tsc`가 진짜 검사다 |
| 3 before/after 기계 적용 | ○ | before 블록 3개 |
| 4 전칭 여집합 | ○ | "예외는 Vercel 원시 로그에만", "Sentry에 도달하지 않는다", "저장소도 라우트 핸들러 테스트를 두지 않는다", "`scrubEvent`는 AWS 서명만 지운다", "`packages/db`·`apps/backend`·`apps/admin`에 닿는 변경 없음" |
| 5 돌연변이 | × | 순수 함수의 신설·변경이 없다. 계획서 자신이 "뽑아낼 순수 로직이 없다"고 적었고 실제로 그렇다 |
| 6 실제 사건 재생 | × | **재생할 실측 이벤트가 없다.** 삼켜진 예외가 곧 지금 없는 정보이고, 그것이 이 항목이 소유자를 기다리는 이유다 |
| 7 음성 시험 | × | 규칙·경계·화이트리스트를 만들지 않는다. 기대는 불변식(`reportError`가 던지지 않음, `scrubEvent` 범위)은 경로 1·4로 직접 확인된다 |
| 8 실물 렌더 | ○ → **실행 불가** | 아래 라운드 1 참조 |
| 9 구조적 아티팩트 | × | schema·config·생성 파일 변경 없음 |

## 라운드 1 (편집) — 문서 위생 1건, 구현 영향 0

### 경로 1 — 인용 전수 대조: 전부 일치

`route.ts`(`:8-24` CustomerPortal·`:9` accessToken·`:23` server·`:26-40` GET·`:30-32`·`:34-37`·`:39`), `polar.ts:12` `export const POLAR_SERVER = env.POLAR_SERVER ?? "sandbox";`, `SubscriptionStatus.tsx:105` `onClick={() => (window.location.href = "/api/portal")}`, `entities/user/api/index.ts:33-40`(`return user?.polarCustomerId ?? null;`), `env.js:30` `POLAR_SERVER: z.enum(["sandbox", "production"]).optional(),`, `checkout/route.ts:19`, `billing/api/index.ts:66`·try/catch+`reportError`, `report-error.ts:83-99`, `BillingPage.tsx:20-26`·`:28-33`·`:53`·`:63-69`, `page.tsx:8`·`:25`. 전부 내용까지 일치.

**라이브러리 소스 주장이 이 계획서의 하중을 받는 지점이라 직접 확인했다** — `node_modules/@polar-sh/nextjs/dist/index.js`의 `CustomerPortal` `getCustomerId` 분기:

```js
try {
  const { customerPortalUrl } = await polar.customerSessions.create({
    returnUrl: decodedReturnUrl,
    customerId
  });
  return NextResponse2.redirect(customerPortalUrl);
} catch (error) {
  console.error(error);
  return NextResponse2.error();
}
```

계획서 서술과 정확히 일치한다. `NextResponse.error()`가 본문 없는 500이라는 것이 관측(status 500 · 본문 길이 0)과 맞는 근거다.

**SDK 타입도 확인**: `CustomerSession.customerPortalUrl: string`(`customersession.d.ts:24`), `create(request: CustomerSessionsCreateCustomerSessionCreate)` → `CustomerSessionCustomerIDCreate`의 `returnUrl?: string | null | undefined` — **선택 필드**다. 계획서가 `returnUrl`을 생략해 "성공 동작을 그대로 보존"한다는 주장은 참이다(라이브러리는 `undefined`를 넘긴다).

**`ReportContext`도 확인**: `Record<string, string | number | boolean | null | undefined>`(`report-error.ts:12`)라 `server`·`customerId` 추가가 타입상 통과한다. `reportError`가 절대 던지지 않는다는 주장도 `:95-98`의 catch로 확인.

### 경로 2 — 스케치 추출·실행: 통과

계획서의 after 블록 3개(route.ts 전문, page.tsx 2줄, BillingPage.tsx prop+구조분해+effect)를 **실제 트리에 임시 적용**하고 `npm run typecheck -w apps/web` 실행 → **오류 0**. 즉시 `git checkout --` 복원, `git status --short`로 세션 시작 스냅샷과 동일함 확인.

이 통과가 경로 8이 잡았을 위험(임포트 해석·prop 모양)을 이미 덮는다.

### 경로 3 — before/after 기계 적용: 위생 1건

`page.tsx`·`BillingPage.tsx`의 before는 트리와 일치. **`route.ts`의 before는 바이트 그대로가 아니다** — `const portalHandler = CustomerPortal({ /* ...:8-24... */ });` 로 접혀 있다.

계획서가 그 블록을 "before (`route.ts` 전체 구조)"라 명시했고 after가 완성된 전문이라 구현자가 오해할 여지는 작지만, 산문이 가드 `:26-37`을 "유지"라 한 것과 after 블록이 `:27-28` 주석을 조용히 빼는 것 사이에 긴장이 있었다. **구현 영향 0** — 주석은 교체 후 낡는 문장이라 빼는 것이 맞다. 그 판단을 명시하도록 계획서에 인용 블록을 추가했다.

### 경로 4 — 전칭 여집합 열거: 전부 성립

- **"저장소도 라우트 핸들러 테스트를 두지 않는다"**: `apps/web/src`의 `*.test.mjs` 20개를 전수 열거 → `apps/web/src/app` 아래 0건. `middleware.test.mjs`는 `src/` 루트이고 상수 포섭만 본다. 참.
- **`BillingPage` 호출부**: 전수 grep → `app/dashboard/billing/page.tsx:22` **하나뿐**. `hadPortalError`를 **필수** prop으로 추가해도 깨질 다른 호출부가 없다. (이것이 구현 영향 후보였으나 성립.)
- **`scrubEvent`는 AWS 서명만**: `scrub-event.ts:16-19`의 `SCRUB_RULES`가 `X-Amz-Signature`·`X-Amz-Credential`·`X-Amz-Security-Token` 셋뿐 + 설정된 리터럴 치환. Polar 고객 id는 그 어느 것과도 겹치지 않아 그대로 전송된다. 참.
- **Sentry 미도달**: `sentry.server.config.ts`에 console 통합이 없다는 계획서 주장의 귀결. `reportError`는 `console.error` + `captureException`을 **둘 다** 하므로, 공통 변경이 이 공백을 닫는다는 서술과 일관.

### 경로 8 — 실물 렌더: 실행 불가

스크래치패드에서 `renderToStaticMarkup`으로 `BillingPage`를 렌더하려 했으나 `ERR_MODULE_NOT_FOUND` — `~/` 경로 별칭과 클라이언트 컴포넌트 의존 그래프(analytics·`server-only` 계열)를 스크래치패드에서 해석할 수 없다. 저장소가 이미 아는 한계다(`tsx` 러너에 DOM·React 테스트 도구 없음).

**이 항목에서는 가치도 거의 없다**: 바뀌는 UI가 `useEffect`(토스트)라 마크업에 나타나지 않고 `renderToStaticMarkup`은 효과를 돌리지 않는다. 경로 8이 잡을 나머지(임포트 해석·prop 모양)는 경로 2의 클린 타입체크가 덮었다.

**무소득이라 쓰지 않고 실행 불가로 기록한다.**

## 트리 청결 검산

`git status --short` = `M apps/web/.claude/settings.local.json` + `?? nul` — 세션 시작 스냅샷과 동일. 임시 적용 3파일 전부 복원 확인.

## 라운드 2 (2026-09-14, 편집) — 문서 위생 2건, 구현 영향 0

라운드 1이 계획서를 고쳤으므로 준비 상태가 리셋된 채였다. 라운드 1 이후 계획서·대상 파일 변경 없음
(`git log 62eb865..HEAD -- apps/web/src/app/api/portal apps/web/src/fsd/shared/api apps/web/src/fsd/features/billing apps/web/src/env.js docs/plans/BUG-09.md` 무출력).
워킹트리엔 커밋 보류 중인 FEAT-38 변경이 있다 — 아래 경로 2의 임시 적용·복원은 BUG-09 세 파일로만 한정했다.

- **경로 1 (인용 전수)**: 계획서를 파일에서 다시 읽어 전 인용을 내용까지 대조 — `route.ts:8-24·9·23·26-40·27-28·30-32·34-37·39`,
  `page.tsx:8·22·25`, `BillingPage.tsx:20-26·28-33·53·63-69`, `polar.ts:12`(+`getPolarClient` 수출), `report-error.ts:12·83-99·95-98`,
  `shared/observability/index.ts`의 `reportError` 수출, `entities/user/api/index.ts:33-40`, `SubscriptionStatus.tsx:105`, `env.js:30`,
  `checkout/route.ts:19`, `billing/api/index.ts:66-97·76-88`, 라이브러리 `@polar-sh/nextjs/dist/index.js` `customerId` 분기 try/catch
  (`:100-109`), SDK `customersession.d.ts:24` `customerPortalUrl: string`·`customersessioncustomeridcreate.d.ts:17` `returnUrl?`,
  `git show 9dd6dfb`(`server: "sandbox"` → `server: POLAR_SERVER`, `polarServer` → `export const POLAR_SERVER`) — 전부 일치.
  **불일치 1(위생)**: 계획서의 `sentry.server.config.ts`는 `apps/web/` 루트에 없고 `apps/web/src/sentry.server.config.ts`다.
- **경로 4 (전칭 여집합)**: `src/app` 아래 테스트 파일 0개(`src` 전체 20개) · `<BillingPage` 소스 호출부 `page.tsx:22` 하나(나머지는 완료 제안서) ·
  "Sentry 미도달"의 여집합으로 `src/instrumentation.ts`를 열거 — `:10` `onRequestError = Sentry.captureRequestError`는 **미처리** 예외만
  받고 이 예외는 라이브러리가 catch하므로 주장은 참(계획서엔 이 근거가 빠져 있었다). **불일치 2(위생)**: "`scrubEvent`는 AWS 서명만
  지운다"는 전칭이 불완전 — 서버 `beforeSend`가 `scrubEvent(event, ENDPOINT_REPLACEMENTS)`로 Modal 엔드포인트 호스트 리터럴도 치환한다
  (`src/sentry.server.config.ts:15-17·28`). 결론(Polar 고객 id는 그대로 전송)은 유지 — 구현 영향 0.
- **경로 3 (before/after)**: `page.tsx` before 두 줄 바이트 일치. `route.ts` before는 계획서가 명시한 구조 표시(라운드 1 반영분).
- **경로 2 (스케치 추출·실행)**: after 세 곳(route.ts 전문·page.tsx 두 줄·BillingPage prop/구조분해/effect)을 실제 트리에 임시 적용하고
  **`npm run check -w apps/web` 전체**를 돌렸다(라운드 1은 `typecheck`만 — lint·FSD 경계가 빠져 있었다) → `FSD boundary check passed.` ·
  `✔ No ESLint warnings or errors` · `tsc --noEmit` 오류 0 · **EXIT 0**. `finally`에서 세 파일만 `git checkout --`, 복원 후
  `git status`에서 세 파일 부재·FEAT-38 변경 전부 유지 확인.
- **경로 8 (실물 렌더)**: 라운드 1과 같은 이유로 실행 불가(`~/` 별칭·클라이언트 의존 그래프, 효과는 마크업에 안 나타남). 경로 2의 lint·tsc 통과가 임포트·prop 모양을 덮는다.

**반영(일괄 편집)**: 계획서 「현재 동작」의 Sentry 줄에 `src/` 경로·`Sentry.init` 줄범위·`instrumentation.ts:10`의 미처리 예외 한정 근거 추가,
「구현 스케치」의 scrub 문장을 AWS 서명 셋 + 엔드포인트 호스트 리터럴로 정정. **계획서를 고쳤으므로 준비 상태 리셋 → 라운드 3 무편집.**

## 라운드 3 (2026-09-14, 무편집) — 무소득

- 계획서를 파일에서 전문 재독(회상 아님). `git diff docs/plans/BUG-09.md` = 2줄 변경, `--word-diff`로 **산문 두 문장만** 바뀌고
  코드 블록 변경 0 확인 → 라운드 2 경로 2(스케치 임시 적용 + `check -w apps/web` EXIT 0)의 대상이 그대로다.
- 대상 코드 불변: `git status --short -- apps/web/src/app/api/portal apps/web/src/app/dashboard/billing apps/web/src/fsd/features/billing
  apps/web/src/fsd/shared/api apps/web/src/fsd/shared/observability apps/web/src/sentry.server.config.ts apps/web/src/instrumentation.ts` 무출력.
- 편집으로 새로 들어간 인용을 줄 단위로 재독: `src/sentry.server.config.ts:15-17`(`ENDPOINT_REPLACEMENTS`)·`:19-29`(`Sentry.init`, `integrations` 없음)·`:28`(`beforeSend`),
  `src/instrumentation.ts:10` `export const onRequestError = Sentry.captureRequestError;`(계획서 인용과 글자 일치), `scrub-event.ts:16-19`(`X-Amz-*` 셋) — 전부 일치.
- **판정: 무소득** → `plan-verifier` 독립 패스 디스패치 자격.

### 독립 패스 브리핑의 필수 경로 — 경로 8 제외 판단

필수 경로 확정표는 경로 8을 ○로 올렸으나 라운드 1·2 모두 **실행 불가**였다(`~/` 별칭·클라이언트 의존 그래프). 검증자 계약상 실행 못 한
경로가 있는 보고는 무소득 보고가 될 수 없어(`plan-verifier.md` 절차 2), 경로 8을 넣으면 이 항목은 구조적으로 클린 패스가 불가능해진다.
경로 8이 잡을 위험 — 임포트 해석·prop 모양 — 은 라운드 2 경로 2의 `check -w apps/web`(lint + `tsc --noEmit`, 스케치 적용 상태)가 덮었고,
바뀌는 UI는 `useEffect`의 토스트라 `renderToStaticMarkup`이 애초에 관측하지 못한다. 그래서 **브리핑의 필수 경로는 1·2·3·4로 한다.**
경로 8의 실제 검증(토스트·리다이렉트)은 계획서 「못 덮는 범위」대로 배포 후 수동 확인이며 원장 등재 대상이다.
