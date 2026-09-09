# BUG-09: 「Manage Subscription」이 프로덕션에서 500 — 고객 포털이 열리지 않는다

agent: web-dev

> **이 계획서는 원인을 하나로 단정하지 않는다.** 확정에 필요한 정보 둘(Vercel 함수 로그의 실제 예외, `POLAR_SERVER`·`POLAR_ACCESS_TOKEN`이 가리키는 환경)이 아직 없이 게이트①이 열렸다. 값 자체가 비밀이므로 계획 단계에서 읽을 수 없다. 그래서 아래는 (1) 어느 후보든 공통으로 필요한 변경, (2) 후보별로만 필요한 변경과 선택 기준, (3) 소유자 확인 항목으로 갈라 적었다.

## 현재 동작

- 클라이언트 진입점은 단일 네비게이션이다 — `SubscriptionStatus.tsx:105` `onClick={() => (window.location.href = "/api/portal")}`. `fetch`가 아니라 전체 페이지 이동이라, `/api/portal`이 500이나 JSON 본문을 내면 **브라우저에 그 원문이 그대로 렌더**된다.
- 라우트 `app/api/portal/route.ts`:
  - `route.ts:8-24` — `portalHandler = CustomerPortal({...})`. `@polar-sh/nextjs`의 `CustomerPortal`에 `accessToken: env.POLAR_ACCESS_TOKEN`(`:9`)·`server: POLAR_SERVER`(`:23`)를 넘겨 만든 핸들러다.
  - `route.ts:26-40` — `GET(req)`가 앞단 가드를 **먼저** 돌린다: 세션 없으면 `NextResponse.redirect(.../login)`(`:30-32`), `getUserPolarCustomerId`가 `null`이면 `.../dashboard/billing`(`:34-37`). 두 가드를 통과한 뒤에야 `return portalHandler(req)`(`:39`).
- `getUserPolarCustomerId`는 DB의 `polarCustomerId ?? null`을 돌려준다 — `entities/user/api/index.ts:33-40`. 즉 `route.ts:39`에 도달한 시점의 `customerId`는 **비어 있지 않다.**
- `portalHandler`가 위임받아 하는 일(라이브러리 소스 `node_modules/@polar-sh/nextjs/dist/index.js`, `customerPortal.ts` 구획): `config.getCustomerId(req)`로 id를 받고 `polar.customerSessions.create({ returnUrl, customerId })`를 **try/catch로 감싼다.** 던지면 `console.error(error)` 후 `return NextResponse.error()`. `NextResponse.error()`는 **본문 없는 500**이다 — 관측(`status=500`·본문 길이 0)과 정확히 일치한다.
- `POLAR_SERVER`는 `shared/api/polar.ts:12` `env.POLAR_SERVER ?? "sandbox"`. `env.POLAR_SERVER`는 `env.js:30` `z.enum(["sandbox", "production"]).optional()`라 **미설정이면 조용히 `"sandbox"`로 떨어진다.**
- 예외는 `console.error(error)`로만 남는다. `sentry.server.config.ts`의 `Sentry.init`에는 `integrations`(console 캡처)가 없다 — 그래서 이 예외는 **Vercel 원시 함수 로그에만** 남고 **Sentry에는 도달하지 않는다.** 소유자가 로그를 직접 파야 하는 이유가 이것이다.
- 회귀 후보 커밋 `9dd6dfb`: 이 라우트의 `server: "sandbox"`(하드코딩)를 `server: POLAR_SERVER`로 바꾸고, `polar.ts`의 지역 `polarServer`를 `export const POLAR_SERVER`로 올렸다(`git show 9dd6dfb` 확인). 체크아웃 라우트도 같은 `POLAR_SERVER`를 쓴다(`checkout/route.ts:19`).
- 저장소 안 선례: `cancelSubscription`이 같은 Polar SDK 호출을 우리가 직접 try/catch로 감싸 관측·사용자 안내를 붙인다 — `billing/api/index.ts:66-97` (`getPolarClient()` → `try` → 실패 시 `reportError(error, { origin, userId })` → `failure(...)`). `reportError`는 `console.error`를 유지한 채 `Sentry.captureException`을 붙이고 절대 던지지 않는다(`report-error.ts:83-99`, `import "server-only"`).

## 문제

프로덕션 「Manage Subscription」이 Polar 포털 대신 **본문 없는 HTTP 500**을 낸다(원장 C-02, 2026-09-03·09-04 두 번 재현, 실제 유료 고객). 앞단 가드는 정상(비로그인 GET 307 `/login`)이므로 `route.ts:39`의 `portalHandler(req)` 안 `customerSessions.create`가 던지는 것이다. 백로그가 든 원인 후보는 둘이며, **둘 다 상정한다:**

- **후보 (a) 환경 불일치**: `POLAR_ACCESS_TOKEN`(sandbox/production)과 `POLAR_SERVER`(sandbox/production)가 서로 다른 환경을 가리킨다. `POLAR_SERVER` 미설정 시 `polar.ts:12`가 조용히 `"sandbox"`가 되므로, 토큰이 production이면 불일치가 된다. SDK는 인증 계열 오류(401/403)로 던진다.
- **후보 (b) 없는 고객 id**: DB `polarCustomerId`가 지금 `POLAR_SERVER`가 가리키는 환경에 **존재하지 않는** 고객 id다(예: sandbox 고객 id인데 server=production). SDK는 not-found 계열 오류(404 / customer not found)로 던진다.

**선택 기준** — 실제 예외의 성격으로 갈린다:
- 인증 계열(401/403, invalid token, unauthorized) → **(a)**.
- not-found 계열(404, customer not found, ResourceNotFound) → **(b)**.
- 직접 대조: `POLAR_SERVER`(또는 그 폴백값)가 토큰의 환경과 같은가.

**회귀인지 원래 깨져 있었는지**는 `POLAR_SERVER` 값으로 확정된다:
- `POLAR_SERVER`가 **미설정**이면 `polar.ts:12`가 `"sandbox"`로 접히므로 `9dd6dfb` 이후에도 포털의 `server`는 옛 하드코딩 `"sandbox"`와 **동일** → 이 커밋은 포털 동작을 바꾸지 않았다 → **회귀 아님**(그전에도 깨져 있었다면 그대로).
- `POLAR_SERVER=production`이면 `9dd6dfb`가 포털을 sandbox→production으로 뒤집었다 → **동작 변경** → 회귀일 수 있다.

**백로그가 지목한 문제와 코드에서 확인한 것의 어긋남 하나**: 백로그·게이트 지시는 "실패 원인을 사용자도 **로그도** 못 보는 상태"를 공통 변경 후보로 들었다. 코드를 보면 예외는 `console.error`로 **Vercel 원시 로그에는 남는다** — 다만 Sentry(우리 구조화 텔레메트리)에는 **안 남고**, 사용자는 본문 없는 500을 본다. 즉 "로그도 못 본다"는 정확히는 "Vercel 원시 로그에만 있고 Sentry에는 없다"이다. 공통 변경은 이 텔레메트리 공백과 사용자 경험 둘 다를 닫는다 — 후보 판정과 무관하게 안전하다.

## 고칠 파일

이 표는 **어느 후보든 공통으로 필요한 변경(관측·사용자 경험)만** 담는다. 후보별 변경은 전부 소유자 몫(Vercel 환경변수·Polar 데이터)이라 「범위 밖 의존」에 적는다.

| 파일 | 변경 |
| --- | --- |
| `src/app/api/portal/route.ts` | `portalHandler`(라이브러리 위임)를 우리가 직접 만드는 `customerSessions.create` 호출 + try/catch로 교체. 실패를 `reportError`로 Sentry에 `server`·`customerId`와 함께 보내고, 사용자를 `/dashboard/billing?portal=error`로 리다이렉트. `CustomerPortal`·`env` 임포트 제거 |
| `src/app/dashboard/billing/page.tsx` | `searchParams`에 `portal?: string` 추가, `portal === "error"`를 `BillingPage`에 prop으로 전달 |
| `src/fsd/features/billing/ui/BillingPage.tsx` | prop `hadPortalError` 추가 — 진입 시 한 번 `toast.error(...)`를 띄우고 쿼리 파라미터를 정리(`router.replace`) |

## 구현 스케치

### 1. 공통 변경 (구현 대상)

**`route.ts`** — 앞단 가드(`:26-37`)는 유지하고, `:39` `return portalHandler(req);`와 위임 핸들러(`:8-24`)를 제거한 뒤 GET 본문을 아래로 바꾼다. `cancelSubscription`(`billing/api/index.ts:76-88`)과 같은 형태다.

before (`route.ts` 전체 구조):
```ts
import { CustomerPortal } from "@polar-sh/nextjs";
import { type NextRequest, NextResponse } from "next/server";
import { env } from "~/env";
import { getUserPolarCustomerId } from "~/fsd/entities/user/server";
import { POLAR_SERVER } from "~/fsd/shared/api/polar";
import { auth } from "~/server/auth";

const portalHandler = CustomerPortal({ /* ...:8-24... */ });

export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.redirect(new URL("/login", req.url));
  }
  const customerId = await getUserPolarCustomerId(session.user.id);
  if (customerId === null) {
    return NextResponse.redirect(new URL("/dashboard/billing", req.url));
  }
  return portalHandler(req);
}
```

after:
```ts
import { type NextRequest, NextResponse } from "next/server";
import { getUserPolarCustomerId } from "~/fsd/entities/user/server";
import { getPolarClient, POLAR_SERVER } from "~/fsd/shared/api/polar";
import { reportError } from "~/fsd/shared/observability";
import { auth } from "~/server/auth";

export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.redirect(new URL("/login", req.url));
  }
  const userId = session.user.id;

  const customerId = await getUserPolarCustomerId(userId);
  if (customerId === null) {
    return NextResponse.redirect(new URL("/dashboard/billing", req.url));
  }

  try {
    const { customerPortalUrl } = await getPolarClient().customerSessions.create(
      { customerId },
    );
    return NextResponse.redirect(customerPortalUrl);
  } catch (error) {
    // 라이브러리 CustomerPortal은 이 예외를 console.error + NextResponse.error()
    // (본문 없는 500)로 삼킨다. 직접 감싸 Sentry에 server·customerId를 실어 보내면
    // 다음 발생이 스스로 진단된다(소유자가 지금 Vercel 로그에서 파는 값).
    reportError(error, {
      origin: "portal.customerSession",
      userId,
      server: POLAR_SERVER,
      customerId,
    });
    return NextResponse.redirect(
      new URL("/dashboard/billing?portal=error", req.url),
    );
  }
}
```

- `getPolarClient().customerSessions.create({ customerId })`는 라이브러리가 부르던 것과 동일한 SDK 호출이다(라이브러리 소스: `polar.customerSessions.create({ returnUrl, customerId })`, `{ customerPortalUrl }` 반환). `returnUrl`은 현재 라우트가 설정하지 않으므로(`:8-24`에 `returnUrl` 없음) 생략해 **성공 동작을 그대로 보존**한다.
- `reportError` 컨텍스트에 `server: POLAR_SERVER`(`"sandbox" | "production"`)와 `customerId`를 담는다 — 후보 (a)/(b)를 가르는 두 정보가 이벤트에 붙는다. `customerId`는 Polar 고객 식별자(비밀 아님)이고 `scrubEvent`는 AWS 서명만 지우므로 그대로 전송된다.

**`page.tsx`** — before/after (바뀌는 줄만):
```ts
// before
  searchParams: Promise<{ success?: string }>;
// after
  searchParams: Promise<{ success?: string; portal?: string }>;
```
```tsx
// before (BillingPage 호출)
      hasReturnedFromCheckout={params.success === "true"}
// after — prop 한 줄 추가
      hasReturnedFromCheckout={params.success === "true"}
      hadPortalError={params.portal === "error"}
```

**`BillingPage.tsx`** — `hasReturnedFromCheckout`가 성공 토스트를 띄우는 패턴(`:63-69`, `sonner`의 `toast`)을 그대로 따라 실패 토스트를 한 번만 띄운다. props 인터페이스(`:20-26`)에 `hadPortalError: boolean` 추가, 구조분해(`:28-33`)에 추가, 그리고 다음 이펙트 추가(체크아웃 성공 계측이 `trackedCheckoutSuccessRef`로 일회성을 지키는 것과 같은 방식):
```tsx
const portalErrorShownRef = useRef(false);
useEffect(() => {
  if (!hadPortalError || portalErrorShownRef.current) return;
  portalErrorShownRef.current = true;
  toast.error("Couldn't open the subscription portal. Please try again in a moment.");
  router.replace("/dashboard/billing");
}, [hadPortalError, router]);
```
`router.replace`로 `?portal=error`를 지워 새로고침 시 재발화하지 않게 한다. 토스트 문구는 기존 톤(`:53` "…Please refresh the page.")과 맞춘 정확한 영문이다.

### 2. 후보별 변경 (구현 대상 아님 — 판정·승인 후)

- **후보 (a) 확정 시**: 수정은 **Vercel 환경변수**다 — `POLAR_SERVER`를 토큰과 같은 환경으로 설정(또는 토큰을 서버와 맞춤). 코드가 아니라 소유자 작업이다(「범위 밖 의존」). 코드 측 재발 방지로 `polar.ts:12`의 `?? "sandbox"` 조용한 폴백을 없애 production에서 `POLAR_SERVER` 미설정을 빌드 실패로 드러내는 강화가 가능하나, 이는 (a) 확정 + 별도 승인 사항이라 이 계획서의 구현 대상에 넣지 않는다(「대안」).
- **후보 (b) 확정 시**: 수정은 **데이터**다 — 해당 계정의 `polarCustomerId`를 현재 환경에 존재하는 올바른 고객으로 재연결. 올바른 값은 Polar 대시보드를 봐야 알 수 있어 소유자 몫이다(「범위 밖 의존」). 코드로 잘못된 id를 자동 삭제/추정하지 않는다 — 실제 고객을 가릴 위험이 있다.

### 3. 소유자 확인 항목 (비밀 값 아님, "어느 환경인가" 수준)

1. Vercel `/api/portal` 함수 로그에서 `customerSessions.create`가 던진 **예외의 성격**: 인증 계열(401/403)인가, not-found 계열(404 / customer not found)인가? → (a) vs (b).
2. Vercel **production** 환경에 `POLAR_SERVER`가 **설정돼 있는가**, 값은? (`sandbox`/`production`/미설정) → 미설정이면 `polar.ts:12`가 `"sandbox"`. 회귀 여부도 이 답이 확정.
3. `POLAR_ACCESS_TOKEN`은 sandbox 토큰인가 production 토큰인가? (환경만, 값 아님) → 2와 대조하면 (a) 불일치 여부가 바로 나온다.
4. (b) 확인용: 토큰이 속한 환경의 Polar 대시보드에 이 계정의 고객 id가 실제로 존재하는가?

공통 변경을 배포하면 다음 발생부터 위 1~3 정보가 Sentry 이벤트에 붙어, 이 확인의 상당 부분이 자동으로 채워진다.

## 테스트

- **덮는 것**: 없음. 이 변경은 라우트 핸들러(`auth()`·DB·Polar SDK·`NextResponse.redirect`)와 클라이언트 토스트뿐이라 뽑아낼 순수 로직이 없다. 저장소도 라우트 핸들러 테스트를 두지 않는다(`middleware.test.mjs`는 상수 포섭만 검사, 핸들러 아님).
- **못 덮는 범위**: `tsx` Node 러너에는 DOM·React 테스트 도구가 없고 외부 I/O(auth·Prisma·Polar `customerSessions.create`·`NextResponse`)는 그 자체를 덮을 수 없다. 따라서 (1) 500이 실제로 사라지고 포털이 열리는지, (2) 실패 시 `/dashboard/billing?portal=error` 리다이렉트와 토스트가 뜨는지, (3) 예외가 `server`·`customerId`와 함께 Sentry에 도달하는지는 **모두 배포 후 수동 확인**이다(원장 C-02·C-49 갱신 대상). `npm run check`(typecheck+lint)로 임포트·타입 정합만 확인한다.
- 참고: 후보 (a) 강화(에러→분류 매핑 등)를 나중에 코드로 넣게 되면 그 매핑은 순수 모듈+`*.test.mjs`로 뽑을 수 있으나, 공통 변경에는 순수 표면이 없다.

## 범위 밖 의존

- **Vercel 환경변수 설정** — `POLAR_SERVER`·`POLAR_ACCESS_TOKEN`의 확인·수정은 내 쓰기 범위가 아니다(소유자 작업). 후보 (a)의 실제 수정이 여기에 있다.
- **Polar 고객 데이터 재연결** — 후보 (b)의 수정은 올바른 `polarCustomerId`로의 데이터 정정이며 Polar 대시보드 접근이 필요하다(소유자 작업). `updateUserPolarCustomerId`가 존재하지만 올바른 값은 소유자만 안다 — 코드로 임의 변경하지 않는다.
- **후보 (a) 코드 강화(선택)** — `polar.ts:12`·`env.js:30`을 고쳐 `POLAR_SERVER`를 production 필수로 만드는 방안은 내 쓰기 범위 안(둘 다 `apps/web`)이지만, (a) 확정 + 별도 승인 사항이라 이 계획서 구현 대상이 아니다. 원하면 후속 항목으로 분리한다.
- `packages/db`·`apps/backend`·`apps/admin`에 닿는 변경은 없다.

## 대안

- **라이브러리 `CustomerPortal` 유지 + 관측만 추가**: 불가능하다. 예외가 라이브러리 handler 안에서 `console.error` + `NextResponse.error()`로 삼켜지므로, 우리가 개입하려면 `customerSessions.create`를 직접 호출하는 수밖에 없다. 그래서 위임을 걷어냈다(그 호출은 라이브러리가 하던 것과 동일).
- **실패 시 JSON 400/500 본문 반환**: 진입이 `window.location.href` 전체 이동(`SubscriptionStatus.tsx:105`)이라 본문이 브라우저에 원문으로 뜬다. 리다이렉트+토스트가 이 진입 방식에 맞는 유일하게 깔끔한 UX다.
- **`POLAR_SERVER` 필수화(폴백 제거)를 이번에 함께**: 미설정을 빌드 실패로 드러내는 실질적 강화지만, (a) 확정 전에 넣으면 원인과 무관한 배포 차단이 될 수 있고 후보 판정과 결합된 결정이다. (a)가 확정되면 별도로 판단한다.
