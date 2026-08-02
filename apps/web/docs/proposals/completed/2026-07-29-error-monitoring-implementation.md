---
status: "completed"
stage: null
proposal-size: "standard"
created-at: "2026-07-29"
approved-by: null
approved-at: null
approval-scope: null
completed-at: "2026-07-29"
verification-summary: "마이그레이션 전 문서. 개별 검증 기록 없음"
closed-at: null
closed-by: null
closed-reason: null
owners: []
related: []
---

# 에러 모니터링 1단계 — 적용 지침서 (copy-paste 가능)

Date: 2026-07-28
Status: **§1~§10 적용 완료** (2026-07-29). §0(콘솔)과 §11(개인정보처리방침)만 남음 — 아래 "적용 결과" 참조.
설계 근거: `docs/proposals/error-monitoring-2026-07-28.md` (A/B 재검증 2라운드 통과)

## 적용 결과 (2026-07-29)

`@sentry/nextjs@10.68.0` 설치 후 §1~§10을 적용했다. `npm run check`(lint + tsc)와 `npm run build` 모두 통과.
문서가 v8~v9 기준으로 작성됐고 실제로는 v10이 설치됐으므로, §14-1이 남긴 미확정 항목을 설치된 타입/소스로 확인했다. 결과와 그로 인한 **문서 대비 변경 3건**:

| # | 문서 | 실제 적용 | 근거 |
|---|---|---|---|
| 1 | §4가 `org`/`project`를 하드코딩 placeholder로 둠 | 두 옵션을 **아예 넣지 않음**. `SENTRY_ORG`/`SENTRY_PROJECT` 환경변수로 받는다 | `SentryBuildOptions`가 두 값 모두 동명 환경변수 폴백을 문서화. slug를 모르는 상태에서도 코드가 완결되고 placeholder landmine이 사라진다 |
| 2 | §14-1이 `Sentry.setUser` 격리 대응책으로 `withScope` 제시 | **틀렸다.** `shared/observability`에 `withIsolatedReportScope`(= `withIsolationScope`)를 추가하고 §10-1을 그걸로 감쌌다 | `setUser`는 `getIsolationScope().setUser()`를 호출한다(@sentry/core `exports.js`). `withScope`는 current scope만 분기하므로 isolation scope 쓰기를 가두지 못한다 |
| 3 | §11 개인정보처리방침에 Sentry 행 추가 | **보류.** 아직 적용하지 않음 | 데이터 리전(US/EU)을 모르는 상태로 쓰면 사용자 노출 문서에 미검증 사실이 들어간다. 게다가 DSN이 없어 Sentry가 아무것도 받지 않는 현재는 행이 없는 쪽이 정확하다. §0 완료 시 함께 적용할 것 |

**§14-1 세 항목 해소 결과**

1. **`beforeSend`는 이미 정규화된 event를 받는다.** `client.js`의 `_prepareEvent(...).then(prepared => processBeforeSend(...))` 순서이고, `prepareEvent`가 `normalizeEvent()`로 `user`/`contexts`/`extra`/`breadcrumbs.data`/`spans.data`를 정규화한다. 순환 참조·BigInt는 이 지점 이전에 제거되므로 §2 `scrubEvent`의 fail-open catch는 사실상 죽은 경로다 → **fail-open 유지**, 근거를 코드 주석에 기록.
2. **`Scope.setContext`는 캐스트 없이 통과한다.** `Context = Record<string, unknown>`이라 객체 리터럴 타입 유니온이 암묵적 인덱스 시그니처로 대입된다.
3. **`setUser`는 isolation scope에 쓴다** → 위 변경 2.

**추가로 확인한 것**

- **클라이언트 번들에 SDK 코드가 없다.** 빌드 산출물 전수 검색 결과 `captureException`/`BrowserClient`/`makeFetchTransport` 등 SDK 식별자 0건. 다만 `withSentryConfig`가 청크마다 `_sentryDebugIds` 스탬프(**약 390바이트**)를 주입하므로 "0KB"는 **"SDK 0KB"**로 읽어야 정확하다. 런타임 동작(init·네트워크)은 없다.
- **CSP 수정이 불필요하다.** `next.config.js`의 `connect-src`에 Sentry 도메인을 넣지 않아도 된다 — 브라우저가 Sentry와 통신하지 않기 때문. **2단계에서 클라이언트 SDK를 붙이면 이 줄을 반드시 함께 고쳐야 한다.**
- §12-1이 우려한 `no-unsafe-return`(§2 `scrubEvent`)과 `checkJs`로 인한 `next.config.js` 타입 오류는 **둘 다 발생하지 않았다.**

이 문서는 **왜**를 설명하지 않는다. 그건 위 설계 문서가 한다. 여기는 **무엇을 어디에 어떻게 붙여넣는가**만 담는다.
모든 코드는 현재 저장소의 실제 파일 내용과 대조해 작성했다. `Before` 블록은 지금 파일에 그대로 있는 문자열이다.

**적용 순서는 §0 → §11 순서를 지킬 것.** 앞 단계가 뒤 단계의 import를 만든다.

---

## 0. 사전 작업 (콘솔 — 사람이 직접)

1. **Sentry 프로젝트 생성** (platform: Next.js) → DSN 확보
2. **Vercel 환경변수 주입** — ⚠️ **Production 스코프에만**
   - `SENTRY_DSN` = 발급받은 DSN
   - `SENTRY_AUTH_TOKEN` = Sentry → Settings → Auth Tokens (`project:releases` 권한)
   - `SENTRY_ORG` = 조직 slug — **§4가 이 변수로 읽는다** (하드코딩하지 않음)
   - `SENTRY_PROJECT` = 프로젝트 slug — 위와 동일
   - Preview/Development 스코프에는 **넣지 않는다**. 넣으면 preview 에러가 무료 쿼터를 태운다.
   - 넷 중 하나라도 빠지면 소스맵 업로드만 조용히 건너뛰고 빌드는 통과한다(`silent: true`). 즉 **누락이 에러로 드러나지 않으므로** 배포 후 Sentry 이슈의 스택이 `.next/server/chunks/...`로 찍히는지로 확인할 것.
3. **Inngest 대시보드 → 실패 알림 활성화.** 코드 0줄로 `analyzeVideo`의 rethrow(`functions.ts:976`) 경로가 커버된다.
4. 로컬 `.env`에는 넣지 않는다. 없으면 `Sentry.init`이 no-op이라 로컬 개발이 조용하다.

```bash
npm install @sentry/nextjs
```

> `@sentry/nextjs`는 현재 `package.json`에 **없다**. 이 설치를 건너뛰면 아래 모든 파일이 모듈 해석 실패로 깨진다.
> 설치 후 **실제 설치된 메이저 버전의 문서를 한 번 확인할 것** — 아래 `Sentry.init` / `beforeSend` / `captureRequestError` / `flush` 시그니처는 v8~v9 기준이며, 이 문서 작성 시점에 패키지가 없어 로컬 타입으로 검증하지 못했다. 다르면 §2·§3만 손보면 된다.

---

## 1. `src/env.js` — 환경변수 2개 추가

⚠️ **반드시 `.optional()`.** `AUTH_SECRET`의 `NODE_ENV` 삼항(`:10-13`)을 흉내내면 안 된다 — Vercel preview 빌드도 `NODE_ENV=production`이라 preview에서 필수가 되어 빌드가 깨진다.

### 1-1. `server` 블록

**Before** (`:41-43`)

```js
    // NextAuth Production URL
    AUTH_URL: z.string().url().optional(),
  },
```

**After**

```js
    // NextAuth Production URL
    AUTH_URL: z.string().url().optional(),
    // Sentry (Vercel Production 스코프에만 주입. 없으면 Sentry.init이 no-op)
    SENTRY_DSN: z.string().optional(),
    SENTRY_AUTH_TOKEN: z.string().optional(),
  },
```

### 1-2. `runtimeEnv` 블록

`createEnv`는 `server`에 선언한 키가 `runtimeEnv`(`:62-89`)에도 있어야 한다. 빠뜨리면 `tsc --noEmit`이 잡는다.

**Before** (`:86-87`)

```js
    AUTH_URL: process.env.AUTH_URL,
    NEXT_PUBLIC_SITE_URL: process.env.NEXT_PUBLIC_SITE_URL,
```

**After**

```js
    AUTH_URL: process.env.AUTH_URL,
    SENTRY_DSN: process.env.SENTRY_DSN,
    SENTRY_AUTH_TOKEN: process.env.SENTRY_AUTH_TOKEN,
    NEXT_PUBLIC_SITE_URL: process.env.NEXT_PUBLIC_SITE_URL,
```

---

## 2. `src/sentry.server.config.ts` — 신규

> **루트가 아니라 `src/` 아래다.** 이 저장소는 Next.js의 **src 디렉터리 규약**을 쓴다 — `src/app`이 있고 루트에 `app/`이 없으며, `src/middleware.ts`만 있고 루트 `middleware.ts`는 없다. §3의 `instrumentation.ts`가 `src/`에 놓여야 하므로(그 이유는 §3), 상대 import `./sentry.server.config`가 맞으려면 이 파일도 같은 디렉터리에 있어야 한다.

```ts
import * as Sentry from "@sentry/nextjs";
import { env } from "~/env";

// presigned URL 서명값과 내부 엔드포인트 호스트를 제3자로 흘리지 않는다.
// 사후 추가로는 이미 늦는 종류의 방어라 처음부터 넣는다.
//
// ↔ 자유 문자열은 shared/observability/report-error.ts의 ReportContext를 통해 들어온다.
//   scrub은 필드 무관 정규식이라 이미 알려진 패턴(위 세 가지, 엔드포인트 호스트)은
//   보고 필드가 늘어도 그대로 잡힌다. 다만 **새로운 종류의 비밀**(새 서명 파라미터명,
//   새 내부 호스트)이 그 채널로 들어오면 여기 규칙을 추가해야 한다.
const SCRUB_RULES: Array<[RegExp, string]> = [
  [/X-Amz-Signature=[^&\s"']+/gi, "X-Amz-Signature=[REDACTED]"],
  [/X-Amz-Credential=[^&\s"']+/gi, "X-Amz-Credential=[REDACTED]"],
  [/X-Amz-Security-Token=[^&\s"']+/gi, "X-Amz-Security-Token=[REDACTED]"],
];

function getEndpointHost(): string | null {
  try {
    return new URL(env.PROCESS_VIDEO_ENDPOINT).host;
  } catch {
    return null;
  }
}

const ENDPOINT_HOST = getEndpointHost();

function scrub(value: string): string {
  let out = value;

  for (const [pattern, replacement] of SCRUB_RULES) {
    out = out.replace(pattern, replacement);
  }

  if (ENDPOINT_HOST) {
    out = out.split(ENDPOINT_HOST).join("[PROCESS_VIDEO_ENDPOINT]");
  }

  return out;
}

// event 전체를 직렬화 → 치환 → 역직렬화.
// 메시지·예외·컨텍스트 어디에 섞여 있어도 잡힌다.
//
// ⚠️ 이 함수는 심층 방어이지 완전한 보장이 아니다. 두 가지 한계를 알고 쓸 것:
//   1) fail-open — 순환 참조나 BigInt처럼 JSON.stringify가 던지는 event가 오면
//      catch가 **스크럽되지 않은 원본을 그대로 반환**한다. 이름만 보고
//      "무조건 마스킹된다"고 가정하면 안 된다.
//   2) 왕복 손실 — T => T 시그니처와 달리 undefined/함수/심볼은 사라지고
//      Date는 문자열이 된다.
// 설치된 SDK가 beforeSend 이전에 event를 JSON-safe로 정규화한다면 1)의 catch는
// 사실상 도달하지 않는다(§14 확인 항목). 정규화하지 않는 것으로 확인되면
// catch를 `return null`(Sentry가 이벤트를 폐기)로 바꿔 fail-closed로 전환할 것.
function scrubEvent<T>(event: T): T {
  try {
    return JSON.parse(scrub(JSON.stringify(event))) as T;
  } catch {
    return event;
  }
}

Sentry.init({
  // undefined면 SDK가 전송하지 않는다 = preview/로컬에서 조용함
  dsn: env.SENTRY_DSN,
  // VERCEL_ENV는 Vercel 밖에서 undefined이므로 폴백을 코드에 명시한다
  environment: process.env.VERCEL_ENV ?? "development",
  // IP·쿠키 등 SDK 자동 수집을 끈다. 사용자 식별은 setUser({ id })로만.
  sendDefaultPii: false,
  // 1단계는 에러만. 성능 추적은 무료 쿼터만 태운다.
  tracesSampleRate: 0,
  beforeSend: (event) => scrubEvent(event),
});
```

> `sendDefaultPii: false`는 **자동 수집만** 막는다. 우리가 직접 실어 보내는 문자열은 `beforeSend`가 막는다 — 둘 다 필요하다.

---

## 3. `src/instrumentation.ts` — 신규

> ⚠️ **경로를 틀리면 이 설계 전체가 조용히 죽는다.** Next.js는 `instrumentation.ts`를 **프로젝트 루트 또는 `src/`** 에서 찾는데, **src 디렉터리 규약을 쓰는 프로젝트에서는 `src/` 쪽만 인식한다.** 이 저장소가 그 경우다:
> - `src/app/`은 있고 루트 `app/`은 없다
> - `src/middleware.ts`는 있고 루트 `middleware.ts`는 없다 — middleware도 동일한 root-or-src 규칙을 쓰므로 이 저장소가 어느 쪽인지 보여주는 직접 증거다
>
> 루트에 두면 `register()`가 **호출되지 않고**, 따라서 `Sentry.init`이 실행되지 않으며, §5~§10의 모든 계측이 아무것도 보내지 않는다. **에러 없이 조용히** 실패하므로 눈치채기 어렵다. §12-3의 관리자 테스트 버튼이 이 실수를 잡는 1차 방어선이다.

`instrumentation-client.ts`는 **만들지 않는다**. 그게 클라이언트 번들 0KB의 전제다.

```ts
import * as Sentry from "@sentry/nextjs";

export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    await import("./sentry.server.config");
  }
}

// 서버 컴포넌트 / route handler의 미처리 예외를 Sentry로 보낸다.
export const onRequestError = Sentry.captureRequestError;
```

> 설치된 SDK 버전에 `captureRequestError`가 없으면 해당 버전 문서의 `onRequestError` 예제를 그대로 쓸 것. 이 훅이 없어도 나머지 계측(§7·§8)은 정상 동작한다.

### 3-a. 커버되지 않는 것: edge 런타임 (`src/middleware.ts`)

`register()`가 `NEXT_RUNTIME === "nodejs"`로 게이트되어 있으므로 **edge 런타임은 계측되지 않는다.** 그리고 이 저장소는 edge를 실제로 쓴다:

```ts
// src/middleware.ts
export default NextAuth(authConfigEdge).auth;
export const config = {
  matcher: ["/dashboard/:path*", "/admin/:path*", "/login"],
};
```

즉 **인증이 필요한 모든 경로**에서 미들웨어가 돈다. 여기서 예외가 나면(JWT 디코드 실패, edge auth 설정 오류 등) 사용자는 에러를 보지만 **Sentry에는 아무것도 오지 않는다.**

**이건 1단계의 의도된 범위 밖이다** — 서버(Node) 전용으로 시작하기로 한 결정의 일부다. 다만 "서버 에러는 이제 다 잡힌다"고 오해하면 안 되므로 명시해 둔다. 나중에 덮으려면 `src/sentry.edge.config.ts`를 만들고 `register()`에 `NEXT_RUNTIME === "edge"` 분기를 추가하면 된다. 그때는 edge 런타임 제약(Node API 사용 불가)에 맞는 SDK 설정이 따로 필요하다.

---

## 4. `next.config.js` — `withSentryConfig` 래핑

### 4-1. import 추가

**Before** (`:5`)

```js
import "./src/env.js";
```

**After**

```js
import "./src/env.js";
import { withSentryConfig } from "@sentry/nextjs";
```

### 4-2. export 래핑

**Before** (파일 끝)

```js
export default config;
```

**After**

```js
export default withSentryConfig(config, {
  // 실제 Sentry 조직/프로젝트 slug로 교체
  org: "<your-org-slug>",
  project: "<your-project-slug>",
  authToken: process.env.SENTRY_AUTH_TOKEN,
  // 소스맵을 업로드하되 빌드 산출물에서는 제거 (스택 추적은 살리고 노출은 막음)
  sourcemaps: { deleteSourcemapsAfterUpload: true },
  // 토큰이 없는 환경(preview/로컬)에서 빌드가 깨지지 않게
  silent: true,
});
```

> 소스맵을 올리는 이유: 없으면 스택이 `.next/server/chunks/xxxx.js:1:23456`으로 찍혀, 로그 드레인 대신 Sentry를 고른 근거 자체가 사라진다.

---

## 5. `src/fsd/shared/observability/` — 신규 슬라이스

### 5-1. `src/fsd/shared/observability/report-error.ts`

```ts
import "server-only";

import * as Sentry from "@sentry/nextjs";

// flush 대기 상한의 **기본값**. 호출부마다 예산이 다르므로 인자로 덮어쓸 수 있다.
// 사용자 응답을 붙잡는 경로는 더 짧게(§7-2 경계), 배경 cron은 이 기본값을 쓴다.
const FLUSH_TIMEOUT_MS = 2_000;

type ReportContextValue = string | number | boolean | null | undefined;

/** 자유 문자열이 섞일 수 있는 채널. beforeSend 스크러빙 대상이다. */
export type ReportContext = Record<string, ReportContextValue>;

/**
 * 예외가 아닌 파이프라인 실패.
 * kind별로 필요한 키를 타입에 박아, fingerprint가 `[kind, undefined]`로
 * 퇴화해 모든 실패 모드가 한 이슈로 합쳐지는 오용을 컴파일 타임에 막는다.
 */
export type PipelineFailureReport =
  | {
      kind: "pipeline-failure";
      failureCode: string;
      uploadedFileId: string;
      attempt: number;
    }
  | {
      kind: "dispatch-failure";
      failureCode: string;
      uploadedFileId: string;
      attempt: number;
    }
  | {
      kind: "dispatch-dead-letter";
      dispatchId: string;
      lastError: string;
    }
  | {
      kind: "stuck-processing";
      uploadedFileId: string;
      // Inngest step 경계를 JSON으로 넘나들므로 Date가 아니라 ISO 문자열이다.
      processingStartedAt: string;
      elapsedMinutes: number;
    };

function assertNever(value: never): never {
  throw new Error(`Unhandled report kind: ${JSON.stringify(value)}`);
}

/** fingerprint는 호출부가 아니라 여기서 만든다. 호출부 리터럴은 드리프트를 만든다. */
function toFingerprint(report: PipelineFailureReport): string[] {
  switch (report.kind) {
    case "pipeline-failure":
    case "dispatch-failure":
      return [report.kind, report.failureCode];
    case "dispatch-dead-letter":
    case "stuck-processing":
      return [report.kind];
    default:
      return assertNever(report);
  }
}

function toMessage(report: PipelineFailureReport): string {
  switch (report.kind) {
    case "pipeline-failure":
    case "dispatch-failure":
      return `${report.kind}: ${report.failureCode}`;
    case "dispatch-dead-letter":
      // 리터럴을 다시 쓰지 않는다. discriminant를 그대로 반환해야
      // kind를 개명했을 때 이쪽만 조용히 어긋나는 일이 없다.
      return report.kind;
    case "stuck-processing":
      return `stuck-processing: ${report.elapsedMinutes}m`;
    default:
      return assertNever(report);
  }
}

/**
 * 예외 보고. console.error를 그대로 유지한 채 Sentry 전송을 추가한다.
 * 로컬에서 로그가 사라지지 않고, 나중에 로그 드레인을 붙여도 그 줄이 잡힌다.
 */
export function reportError(
  error: unknown,
  context: { origin: string } & ReportContext,
): void {
  console.error(context.origin, { ...context, error });

  try {
    Sentry.withScope((scope) => {
      scope.setTag("origin", context.origin);
      scope.setContext("report", context);
      Sentry.captureException(error);
    });
  } catch (reportingError) {
    // 관측이 서비스를 죽이면 본말전도다. 절대 밖으로 던지지 않는다.
    console.error("reportError failed", reportingError);
  }
}

/** 예외가 아닌 파이프라인 실패 보고. */
export function reportPipelineFailure(report: PipelineFailureReport): void {
  console.error("pipeline failure", report);

  try {
    Sentry.withScope((scope) => {
      scope.setLevel("error");
      scope.setFingerprint(toFingerprint(report));
      scope.setTag("failureKind", report.kind);
      // 캐스트 없이 그대로 넘긴다. 객체 리터럴 타입의 유니온은 암묵적 인덱스
      // 시그니처를 통해 Record<string, unknown>에 대입된다.
      // 만약 설치된 SDK의 setContext 파라미터 타입이 이를 거부하면,
      // `as unknown as`(이중 캐스트)가 아니라 단일 캐스트 + 사유 주석으로 처리할 것.
      scope.setContext("report", report);
      Sentry.captureMessage(toMessage(report));
    });
  } catch (reportingError) {
    console.error("reportPipelineFailure failed", reportingError);
  }
}

/**
 * 서버리스 인스턴스가 얼어붙기 전에 전송을 마친다.
 * 타임아웃되어도 **reject가 아니라 resolve로 종료**하므로 never-throw 계약을 지킨다.
 *
 * @param timeoutMs 대기 상한. 호출부마다 예산이 다르다 —
 *   사용자 응답을 붙잡는 경로는 짧게(§7-2), 배경 cron은 기본값(§8-4).
 *   하나의 상수를 공유하면 UX 튜닝이 cron의 유실 방지 동작까지 건드리게 된다.
 */
export async function flushReports(
  timeoutMs: number = FLUSH_TIMEOUT_MS,
): Promise<void> {
  try {
    await Sentry.flush(timeoutMs);
  } catch (flushError) {
    console.error("flushReports failed", flushError);
  }
}

/** 사용자 식별은 id만. 이메일·이름은 보내지 않는다. */
export function setReportUser(userId: string): void {
  try {
    Sentry.setUser({ id: userId });
  } catch (userError) {
    // 형제 헬퍼들과 동일하게 로그는 남긴다. 조용히 삼키면
    // 사용자 태깅이 언제부터 안 됐는지 알 방법이 없다.
    console.error("setReportUser failed", userError);
  }
}
```

### 5-2. `src/fsd/shared/observability/index.ts` (배럴)

`shared/analytics/index.ts`와 같은 방식. 소비자는 항상 배럴로 import한다.

```ts
export {
  flushReports,
  reportError,
  reportPipelineFailure,
  setReportUser,
} from "./report-error";
export type { PipelineFailureReport, ReportContext } from "./report-error";
```

---

## 6. 정체 감지 준비 — 상수와 쿼리

### 6-1. `src/fsd/entities/uploaded-file/model/stale-policy.ts`

**Before** (전체 7줄)

```ts
export const PROCESSING_STALE_POLICY = {
  pendingEnqueueTimeoutMs: 5 * 60 * 1000,
  queuedWorkerStartTimeoutMs: 15 * 60 * 1000,
  processingTimeoutMs: 2 * 60 * 60 * 1000,
  rawUploadDraftTtlMs: 24 * 60 * 60 * 1000,
  recoverableUploadDraftTtlMs: 7 * 24 * 60 * 60 * 1000,
} as const;
```

**After**

```ts
export const PROCESSING_STALE_POLICY = {
  pendingEnqueueTimeoutMs: 5 * 60 * 1000,
  queuedWorkerStartTimeoutMs: 15 * 60 * 1000,
  processingTimeoutMs: 2 * 60 * 60 * 1000,
  rawUploadDraftTtlMs: 24 * 60 * 60 * 1000,
  recoverableUploadDraftTtlMs: 7 * 24 * 60 * 60 * 1000,

  // 정체 "알림" 임계값. 위 processingTimeoutMs(120m = 마킹)보다 먼저 울려서
  // 사용자가 대시보드에 돌아오지 않아도 운영자가 먼저 알게 한다.
  //
  // 90m 근거 — src/inngest/functions.ts의 상한에서 유도:
  //   render : MODAL_RESULT_MAX_POLLS(60) × MODAL_RESULT_POLL_INTERVAL(1m)
  //            + MODAL_METADATA_GRACE_INTERVAL(2m)  ≈ 62m
  //   analyze: ANALYSIS_RESULT_TIMEOUT(60m)
  // 함수가 살아 있으면 늦어도 ~62m에 스스로 종료하고 상태를 쓴다.
  // ⚠️ 위 Modal 상수를 바꾸면 이 값도 함께 재검토할 것.
  stuckAlertMs: 90 * 60 * 1000,
  // 알림 재발송 상한. 24h가 지나면 멈춘다(≈96회).
  // 좁게 잡으면 cron 2회 누락 시 영구 미탐지가 생기므로 넉넉히 둔다.
  // ⚠️ 이 "누락 허용" 논리는 monitorPipelineHealth의 cron 주기(현재 15분,
  //    src/inngest/functions.ts)를 전제로 한다. 주기를 늘리면 함께 재검토할 것.
  stuckAlertMaxAgeMs: 24 * 60 * 60 * 1000,
} as const;
```

### 6-1-a. `src/inngest/functions.ts` — 역방향 포인터 주석 (누락하기 쉬움)

위 `stuckAlertMs`는 Modal 상수에서 **유도된** 값인데, 정작 그 상수 쪽에는 아무 표시가 없다. `MODAL_RESULT_MAX_POLLS`를 올리려는 사람이 `stuckAlertMs`의 존재를 알 방법이 없어 90분 임계값이 조용히 낡는다. 양방향으로 만든다.

**Before** (`:23-25`)

```ts
const MODAL_RESULT_POLL_INTERVAL = "1m";
const MODAL_RESULT_MAX_POLLS = 60;
const MODAL_METADATA_GRACE_INTERVAL = "2m";
```

**After**

```ts
// ⚠️ 이 세 값의 곱/합(≈62m)이 uploaded-file/model/stale-policy.ts의
//    stuckAlertMs(90m) 근거다. 바꾸면 그쪽도 함께 재검토할 것.
const MODAL_RESULT_POLL_INTERVAL = "1m";
const MODAL_RESULT_MAX_POLLS = 60;
const MODAL_METADATA_GRACE_INTERVAL = "2m";
```

**Before** (`:685`)

```ts
const ANALYSIS_RESULT_TIMEOUT = "60m";
```

**After**

```ts
// ⚠️ uploaded-file/model/stale-policy.ts의 stuckAlertMs(90m) 근거 중 하나.
//    바꾸면 그쪽도 함께 재검토할 것.
const ANALYSIS_RESULT_TIMEOUT = "60m";
```

### 6-2. `src/fsd/entities/uploaded-file/api/index.ts` — 쿼리 추가

`src/inngest/functions.ts`는 `db`를 직접 만지지 않는다(`~/server/db` import 없음). 쿼리는 엔티티가 소유한다.
**파일 맨 끝**에 추가한다. `PROCESSING_STALE_POLICY`는 이미 `:14`에서 import 중이라 import 추가는 불필요.

```ts
/** 정체 행 한 건. `processingStartedAt`이 nullable인 건 Prisma 스키마가 DateTime?이기 때문이며,
 *  아래 쿼리의 범위 필터가 실제로는 non-null만 반환한다. */
export type StuckProcessingUploadedFile = {
  id: string;
  userId: string;
  currentAttempt: number;
  processingStartedAt: Date | null;
};

/**
 * 알림 대상 정체 행. DB 쓰기 없이 조회만 한다.
 * 하한(minAge)과 상한(maxAge)을 둔 윈도우 방식이라 24h가 지나면 자연히 빠진다.
 * @@index([status, processingStartedAt])(prisma/schema.prisma:95)에 그대로 적중한다.
 *
 * ⚠️ 최대 `limit`건(기본 50)만 반환한다. 대량 정체 시 뒷부분은 잘리므로,
 *    정확한 총량이 필요한 호출부는 포화 여부를 직접 판단해야 한다(§8-4 참조).
 */
export async function listStuckProcessingUploadedFiles(options?: {
  now?: Date;
  minAgeMs?: number;
  maxAgeMs?: number;
  limit?: number;
}): Promise<StuckProcessingUploadedFile[]> {
  const now = options?.now ?? new Date();
  const minAgeMs = options?.minAgeMs ?? PROCESSING_STALE_POLICY.stuckAlertMs;
  const maxAgeMs =
    options?.maxAgeMs ?? PROCESSING_STALE_POLICY.stuckAlertMaxAgeMs;
  const limit = options?.limit ?? 50;

  return db.uploadedFile.findMany({
    where: {
      status: "processing",
      processingStartedAt: {
        lt: new Date(now.getTime() - minAgeMs),
        gte: new Date(now.getTime() - maxAgeMs),
      },
    },
    orderBy: {
      processingStartedAt: "asc",
    },
    take: limit,
    select: {
      id: true,
      userId: true,
      currentAttempt: true,
      processingStartedAt: true,
    },
  });
}
```

### 6-3. `src/fsd/entities/uploaded-file/index.ts` — 배럴 export

명시적 export 목록이라 누락하면 컴파일 실패한다. 알파벳 순서를 유지한다.

**Before** (`:17-18`)

```ts
  listActiveUploadedFileQueueStateByUserId,
  listRecoverableUploadDraftsByUserId,
```

**After**

```ts
  listActiveUploadedFileQueueStateByUserId,
  listRecoverableUploadDraftsByUserId,
  listStuckProcessingUploadedFiles,
```

그리고 타입도 함께 내보낸다. 파일 하단의 기존 `export type { ... } from "./model/types";` **위에** 한 줄 추가:

```ts
export type { StuckProcessingUploadedFile } from "./api";
```

---

## 7. `src/fsd/entities/processing-dispatch/api/index.ts` — dispatch 실패 계측

⚠️ **엔티티 함수 내부가 아니라 이 catch에만** 넣는다. `markUploadedFileAttemptFailed`(호출부 16곳)나 `markProcessingDispatchDeadLetter`(정상 동시성 경로 `:159`/`:174`/`:179`에서도 호출)에 넣으면 정상 동작이 알림이 되고 한 사건이 2~3개로 쪼개진다.

### 7-1. import 추가

**Before** (`:15`)

```ts
import { getSelectedRenderMomentsForAttempt } from "~/fsd/entities/clip-draft";
```

**After**

```ts
import { getSelectedRenderMomentsForAttempt } from "~/fsd/entities/clip-draft";
import { reportPipelineFailure } from "~/fsd/shared/observability";
```

> `flushReports`는 여기서 import하지 않는다 — §7-3의 요청 경계가 담당한다.

### 7-2. catch 블록 (`:256-278`)

**Before**

```ts
  } catch (error) {
    const errorMessage = toErrorMessage(error);

    await db.$transaction(async (tx) => {
      await markProcessingDispatchDeadLetter(dispatch.id, errorMessage, { tx });
      await markUploadedFileAttemptFailed(
        dispatch.uploadedFile.id,
        dispatch.attempt,
        "dispatch_failed",
        {
          tx,
          now,
          statuses: ["pending_enqueue", "queued"],
        },
      );
    });

    return {
      status: "failed",
      failureCode: "dispatch_failed",
      error: errorMessage,
    };
  }
```

**After**

```ts
  } catch (error) {
    const errorMessage = toErrorMessage(error);

    await db.$transaction(async (tx) => {
      await markProcessingDispatchDeadLetter(dispatch.id, errorMessage, { tx });
      await markUploadedFileAttemptFailed(
        dispatch.uploadedFile.id,
        dispatch.attempt,
        "dispatch_failed",
        {
          tx,
          now,
          statuses: ["pending_enqueue", "queued"],
        },
      );
    });

    // 트랜잭션 커밋 후에 보고한다. 트랜잭션 안에서 보내면
    // (a) 롤백 시 DB는 되돌아갔는데 이벤트는 이미 나간 유령 알림이 되고
    // (b) 열린 Prisma 커넥션을 붙잡은 채 네트워크 I/O를 하게 된다.
    //
    // 이 catch는 dead-letter 마킹과 uploadedFile 실패 마킹을 모두 포함하는
    // "한 사건"이므로 여기서 정확히 한 번만 보고한다.
    reportPipelineFailure({
      kind: "dispatch-failure",
      failureCode: "dispatch_failed",
      uploadedFileId: dispatch.uploadedFile.id,
      attempt: dispatch.attempt,
    });

    return {
      status: "failed",
      failureCode: "dispatch_failed",
      error: errorMessage,
    };
  }
```

> **flush는 여기서 하지 않는다.** 보고(`reportPipelineFailure`)는 로컬·즉시라 엔티티 안에 두어도 되지만, `await flushReports()`는 최대 수백 ms를 붙잡는 네트워크 I/O다. 엔티티 함수 본문에 넣으면 **현재와 미래의 모든 호출부가 그 지연을 상속**한다. 지금은 호출부가 하나뿐이라 동작은 같지만, 나중에 일괄 재디스패치 같은 호출부가 생기면 건당 flush를 하게 된다. 요청 경계에서 한 번만 하도록 §7-3으로 옮긴다.

### 7-3. `src/fsd/features/upload/api/index.ts` — 요청 경계에서 1회 flush

`dispatchProcessingRequestByIdOrFail`의 유일한 호출부인 `scheduleProcessingAttempt`가 이미 실패 경로를 소유하고 있다(`:198-199`에서 재마킹). 여기가 요청 경계다.

**import 추가**

**Before** (`:7-11`)

```ts
import {
  createProcessingDispatch,
  dispatchProcessingRequestByIdOrFail,
} from "~/fsd/entities/processing-dispatch";
import { listClipDraftsForAttempt } from "~/fsd/entities/clip-draft";
```

**After**

```ts
import {
  createProcessingDispatch,
  dispatchProcessingRequestByIdOrFail,
} from "~/fsd/entities/processing-dispatch";
import { listClipDraftsForAttempt } from "~/fsd/entities/clip-draft";
import { flushReports } from "~/fsd/shared/observability";
```

**Before** (`:196-211`)

```ts
  const dispatchResult = await dispatchProcessingRequestByIdOrFail(dispatchId);

  if (dispatchResult.status !== "sent") {
    await markUploadedFileAttemptFailed(
      uploadedFileId,
      scheduledAttempt,
      "dispatch_failed",
      { statuses: ["pending_enqueue", "queued"] },
    );

    revalidateUploadedFileViews(uploadedFileId);

    return failure(
      "Processing could not start. Retry from the upload detail page.",
    );
  }
```

**After**

```ts
  const dispatchResult = await dispatchProcessingRequestByIdOrFail(dispatchId);

  if (dispatchResult.status !== "sent") {
    await markUploadedFileAttemptFailed(
      uploadedFileId,
      scheduledAttempt,
      "dispatch_failed",
      { statuses: ["pending_enqueue", "queued"] },
    );

    // 서버리스 인스턴스가 응답 후 얼면 §7-2에서 보고한 이벤트가 유실된다.
    // 요청 경계인 여기서 한 번만 flush한다.
    // 사용자를 붙잡는 경로이므로 기본값(2s)보다 짧은 예산을 명시한다.
    await flushReports(1_000);

    revalidateUploadedFileViews(uploadedFileId);

    return failure(
      "Processing could not start. Retry from the upload detail page.",
    );
  }
```

> 이 분기는 `dispatchResult.status !== "sent"`인 모든 경우를 덮는다. 현재 §7-2가 보고하는 `"failed"` 외에 `not_found`/`stale_attempt`/`already_advanced`도 여기 들어오지만, 그 경우엔 보낼 이벤트가 없어 flush가 즉시 no-op으로 끝난다.

---

## 8. `src/inngest/functions.ts` — 로그 교체 + cron

### 8-1. 엔티티 import에 쿼리 추가 (`:9-16`)

**Before**

```ts
  isUploadedFileAttemptStillProcessing,
  markUploadedFileAttemptFailed,
```

**After**

```ts
  isUploadedFileAttemptStillProcessing,
  listStuckProcessingUploadedFiles,
  markUploadedFileAttemptFailed,
```

### 8-2. 관측 헬퍼 import 추가 (`:19-20`)

**Before**

```ts
import { listS3Objects, objectExists } from "~/fsd/shared/api/s3";
import { inngest } from "./client";
```

**After**

```ts
import { listS3Objects, objectExists } from "~/fsd/shared/api/s3";
import {
  flushReports,
  reportError,
  reportPipelineFailure,
} from "~/fsd/shared/observability";
import { inngest } from "./client";
```

### 8-3. `console.error` 2곳 교체

`reportError`가 내부에서 `console.error`를 하므로 로그는 그대로 남는다.

**Before** (`:305`)

```ts
          console.error("Failed to check source object before processing", {
            uploadedFileId,
            attempt,
            s3Key: context.s3Key,
            error,
          });
```

**After**

```ts
          reportError(error, {
            origin: "processVideo.checkSourceObject",
            uploadedFileId,
            attempt,
            s3Key: context.s3Key,
          });
```

**Before** (`:737`)

```ts
          console.error("Failed to check source object before analysis", {
            uploadedFileId,
            attempt,
            s3Key: context.s3Key,
            error,
          });
```

**After**

```ts
          reportError(error, {
            origin: "analyzeVideo.checkSourceObject",
            uploadedFileId,
            attempt,
            s3Key: context.s3Key,
          });
```

### 8-4. 정체 감지 cron — 파일 끝에 추가

`cleanupAnalyticsEvents`(`:981`) 바로 아래에 둔다.

```ts
// 조회 상한. stuck.length가 이 값과 같으면 더 있을 수 있다는 뜻이라
// 잘림 여부를 반환값에 드러낸다.
const STUCK_SCAN_LIMIT = 50;

export const monitorPipelineHealth = inngest.createFunction(
  {
    id: "monitor-pipeline-health",
  },
  {
    // ⚠️ 이 주기는 stale-policy.ts의 stuckAlertMaxAgeMs(24h) 산정 전제다
    //    ("cron 2회 누락까지 견딘다"). 주기를 바꾸면 그쪽도 재검토할 것.
    cron: "*/15 * * * *",
  },
  async ({ step }) => {
    // step 경계는 JSON 직렬화를 거친다. Date를 그대로 반환하면
    // 재개 시 문자열로 되살아나 타입이 거짓말을 하므로,
    // 경과 계산까지 step 안에서 끝내고 원시 값만 넘긴다.
    const stuck = await step.run("list-stuck-processing", async () => {
      const rows = await listStuckProcessingUploadedFiles({
        limit: STUCK_SCAN_LIMIT,
      });
      const now = Date.now();

      // processingStartedAt은 쿼리(§6-2)의 범위 필터가 non-null을 보장하지만
      // Prisma 타입이 Date | null이라 좁힘용 가드가 필요하다.
      // 즉 아래 `: []` 분기는 런타임에 도달하지 않는다.
      return rows.flatMap((row) =>
        row.processingStartedAt
          ? [
              {
                uploadedFileId: row.id,
                processingStartedAt: row.processingStartedAt.toISOString(),
                elapsedMinutes: Math.round(
                  (now - row.processingStartedAt.getTime()) / 60_000,
                ),
              },
            ]
          : [],
      );
    });

    for (const row of stuck) {
      reportPipelineFailure({
        kind: "stuck-processing",
        uploadedFileId: row.uploadedFileId,
        processingStartedAt: row.processingStartedAt,
        elapsedMinutes: row.elapsedMinutes,
      });
    }

    // 이벤트마다 flush하면 route.ts의 maxDuration=10 예산을 넘길 수 있다.
    // 루프가 끝난 뒤 한 번만, 기본 예산으로 호출한다(배경 작업이라 여유가 있다).
    await flushReports();

    // truncated=true면 stuckCount는 실제 정체 건수가 아니라 상한이다.
    // 대량 정체 시 이 값을 총량으로 읽으면 안 된다.
    return {
      stuckCount: stuck.length,
      truncated: stuck.length === STUCK_SCAN_LIMIT,
    };
  },
);
```

---

## 9. `src/app/api/inngest/route.ts` — cron 등록

**Before** (전체)

```ts
import { serve } from "inngest/next";
import { inngest } from "../../../inngest/client";
import {
  analyzeVideo,
  cleanupAnalyticsEvents,
  processVideo,
} from "~/inngest/functions";

export const maxDuration = 10;

export const { GET, POST, PUT } = serve({
  client: inngest,
  functions: [processVideo, analyzeVideo, cleanupAnalyticsEvents],
});
```

**After**

```ts
import { serve } from "inngest/next";
import { inngest } from "../../../inngest/client";
import {
  analyzeVideo,
  cleanupAnalyticsEvents,
  monitorPipelineHealth,
  processVideo,
} from "~/inngest/functions";

export const maxDuration = 10;

export const { GET, POST, PUT } = serve({
  client: inngest,
  functions: [
    processVideo,
    analyzeVideo,
    cleanupAnalyticsEvents,
    monitorPipelineHealth,
  ],
});
```

---

## 10. 관리자 테스트 트리거

⚠️ **인가는 서버 액션 본문에서 한다.** Server Action은 버튼을 렌더한 레이아웃과 무관한 독립 POST 엔드포인트라, `admin/layout.tsx`의 GET 렌더 가드로는 보호되지 않는다.

### 10-1. `src/fsd/features/observability-test/api/index.ts` — 신규

```ts
"use server";

import { requireAdmin } from "~/fsd/shared/api/admin-guard";
import { type ActionResult, failure, success } from "~/fsd/shared/api/result";
import {
  flushReports,
  reportPipelineFailure,
  setReportUser,
} from "~/fsd/shared/observability";

/**
 * DSN·네트워크·beforeSend·flush·environment 태그가 전부 통하는지
 * 실제 실패를 기다리지 않고 확인하는 용도.
 *
 * ⚠️ 반환 타입이 모든 결과를 담지 않는다. 비관리자 호출은 `requireAdmin()`이
 * `redirect()`/`notFound()`를 던지므로 이 함수는 **resolve하지 않고 reject**한다
 * (Next 제어 흐름 예외). `ActionResult`는 **인가를 통과한 뒤**의 성공/실패만 표현한다.
 * requireAdmin을 try 밖에 두는 건 의도적이다 — 안에 넣으면 catch가
 * NEXT_REDIRECT를 삼켜 리다이렉트가 깨진다.
 */
export async function sendObservabilityTestEvent(): Promise<ActionResult<void>> {
  // 목적지 인가. 레이아웃 가드에 기대지 않는다.
  const admin = await requireAdmin();

  try {
    setReportUser(admin.userId);

    reportPipelineFailure({
      kind: "stuck-processing",
      uploadedFileId: "observability-test",
      processingStartedAt: new Date().toISOString(),
      elapsedMinutes: 0,
    });

    await flushReports();

    return success();
  } catch (error) {
    console.error("Failed to send observability test event", error);
    return failure("Failed to send test event");
  }
}
```

### 10-2. `src/fsd/features/observability-test/index.ts` — 배럴

```ts
export { sendObservabilityTestEvent } from "./api";
```

### 10-3. `src/fsd/pages/admin-observability/ui/index.tsx` — 신규

서버 액션을 호출하는 클라이언트 컴포넌트는 이 저장소에서 **`useTransition`**을 쓴다
(`pages/dashboard/ui/_component/RecoverableUploadDrafts.tsx:37`,
`widgets/clip-display/ui/_component/ClipActions.tsx:58`). `useState` + `try/finally`로
직접 pending을 관리하지 않는다.

```tsx
"use client";

import { useTransition } from "react";
import { toast } from "sonner";
import { sendObservabilityTestEvent } from "~/fsd/features/observability-test";
import { Button } from "~/fsd/shared/ui/atoms/button";

export function ObservabilityTestPanel() {
  const [isPending, startTransition] = useTransition();

  const handleClick = () => {
    startTransition(async () => {
      const result = await sendObservabilityTestEvent();

      if (!result.success) {
        toast.error(result.error);
        return;
      }

      toast.success("Test event sent — check Sentry");
    });
  };

  return (
    <section className="bg-card mx-auto mt-10 max-w-md rounded-xl border p-6">
      <h1 className="text-lg font-semibold">Sentry 도달 테스트</h1>
      <p className="text-muted-foreground mt-1 text-sm">
        DSN · 네트워크 · beforeSend · flush · environment 태그를 한 번에
        검증합니다.
      </p>
      <Button
        type="button"
        className="mt-4"
        disabled={isPending}
        onClick={handleClick}
      >
        {isPending ? "Sending..." : "Send test event"}
      </Button>
    </section>
  );
}
```

> `handleClick`에 `catch`가 없는 건 의도적이다. 비관리자 호출은 서버 액션이 던지는
> Next 제어 흐름 예외(§10-1 주석)로 처리되어 리다이렉트/404가 되므로, 여기서 잡으면 안 된다.

### 10-4. `src/app/admin/observability/page.tsx` — 신규

`admin/analytics/page.tsx`와 같은 얇은 라우트 패턴.

```tsx
import type { Metadata } from "next";
import { ObservabilityTestPanel } from "~/fsd/pages/admin-observability/ui";
import { requireAdmin } from "~/fsd/shared/api/admin-guard";

export const metadata: Metadata = {
  title: "Admin Observability",
  robots: {
    index: false,
    follow: false,
  },
};

export default async function AdminObservabilityRoute() {
  await requireAdmin();

  return <ObservabilityTestPanel />;
}
```

> **확인 필요**: `requireAdmin`은 실패 시 `redirect()` / `notFound()`를 호출한다. 둘 다 Next의 제어 흐름 예외라 Server Action 안에서도 동작하지만, 클라이언트에서 어떤 형태로 관측되는지는 실제로 눌러보고 확인할 것. 거부만 되면 목적은 달성이다.

### 10-5. `src/app/admin/layout.tsx` — `<Toaster />` 추가 (빠뜨리면 §10-3이 무의미)

⚠️ **현재 `<Toaster />`는 `src/app/dashboard/layout.tsx:36`에만 있다.** admin 레이아웃에는 없어서, §10-3의 `toast.success`/`toast.error`가 **화면에 아무것도 띄우지 않는다.** 그러면 "버튼을 눌러 전송 경로를 검증한다"(§12-3)는 목적 자체가 성립하지 않는다 — 성공했는지 실패했는지 알 수가 없다.

dashboard 레이아웃과 동일한 방식으로 한 줄씩 추가한다.

**Before** (`:1-4`)

```tsx
import type { Metadata } from "next";
import Link from "next/link";
import { requireAdmin } from "~/fsd/shared/api/admin-guard";
import { Button } from "~/fsd/shared/ui/atoms/button";
```

**After**

```tsx
import type { Metadata } from "next";
import Link from "next/link";
import { requireAdmin } from "~/fsd/shared/api/admin-guard";
import { Button } from "~/fsd/shared/ui/atoms/button";
import { Toaster } from "~/fsd/shared/ui/atoms/sonner";
```

**Before** (레이아웃 반환부 끝)

```tsx
      <main>{children}</main>
    </div>
  );
}
```

**After**

```tsx
      <main>{children}</main>
      <Toaster />
    </div>
  );
}
```

---

## 11. `src/app/privacy/page.tsx` — 처리 업체 목록에 Sentry 추가

Sentry는 에러 컨텍스트(사용자 ID 포함)를 받는 제3자 처리자다. 기존 표(`:244-295`)에 한 행 추가한다.

**Before** (`:289-295`)

```tsx
                <tr className="border-border border-b">
                  <td className="py-2 pr-4">Vercel</td>
                  <td className="py-2 pr-4">Request logs</td>
                  <td className="py-2 pr-4">Application hosting</td>
                  <td className="py-2">Seoul</td>
                </tr>
              </tbody>
```

**After**

```tsx
                <tr className="border-border border-b">
                  <td className="py-2 pr-4">Vercel</td>
                  <td className="py-2 pr-4">Request logs</td>
                  <td className="py-2 pr-4">Application hosting</td>
                  <td className="py-2">Seoul</td>
                </tr>
                <tr className="border-border border-b">
                  <td className="py-2 pr-4">Sentry</td>
                  <td className="py-2 pr-4">
                    Error messages, stack traces, user ID
                  </td>
                  <td className="py-2 pr-4">Error monitoring</td>
                  <td className="py-2">United States</td>
                </tr>
              </tbody>
```

> 지역은 실제 생성한 Sentry 조직의 데이터 리전(US/EU)에 맞춰 수정할 것.

---

## 12. 적용 후 검증

### 12-1. 정적 검증 (매 단계 후)

```bash
npm run check     # next lint && tsc --noEmit
```

흔히 걸리는 것:

| 증상 | 원인 |
|---|---|
| `Cannot find module '@sentry/nextjs'` | §0의 `npm install` 누락 |
| `Property 'SENTRY_DSN' is missing in type` | §1-2 `runtimeEnv` 등록 누락 |
| `listStuckProcessingUploadedFiles is not exported` | §6-3 배럴 누락 |
| `StuckProcessingUploadedFile is not exported` | §6-3의 `export type { ... } from "./api"` 한 줄 누락 |
| `monitorPipelineHealth is not exported` | §8-4 미작성 상태에서 §9 먼저 적용 |
| `flushReports is not defined` (processing-dispatch) | §7-1에서 `flushReports`를 import하려 했다 — 이 파일은 `reportPipelineFailure`만 쓴다. flush는 §7-3 |
| `setContext` 인자 타입 오류 (§5-1) | 설치된 SDK가 유니온을 거부. `as unknown as`가 아니라 **단일** 캐스트 + 사유 주석으로 (§14-1) |

**타입 검사는 통과하는데 Sentry에 아무것도 안 오는 경우** — 컴파일은 멀쩡하므로 위 표로는 안 잡힌다:

| 증상 | 원인 |
|---|---|
| 이벤트가 하나도 도달하지 않음 (에러 로그도 없음) | `instrumentation.ts`를 **프로젝트 루트**에 뒀다. 이 저장소는 src 규약이라 `src/instrumentation.ts`여야 `register()`가 호출된다 (§3) |
| 관리자 버튼을 눌러도 화면에 아무 반응이 없음 | §10-5의 `<Toaster />` 추가를 빠뜨렸다. admin 레이아웃에는 기본으로 없다 |
| production에서만 이벤트가 안 옴 | Vercel 환경변수 `SENTRY_DSN`이 Production 스코프에 안 들어갔다 (§0-2) |
| 미들웨어(`/dashboard/*` 등)에서 난 에러만 안 옴 | 정상이다 — edge 런타임은 1단계 범위 밖 (§3-a) |

**린트 게이트 주의 (`npm run check`의 앞 절반)**

`eslint.config.js`가 `tseslint.configs.recommendedTypeChecked`를 켜 두었다 — `no-unsafe-return` / `no-unsafe-assignment` / `no-unsafe-call` 계열이 **error**다. 그리고 `tsconfig.json`은 `checkJs: true`라 **`next.config.js`와 `src/env.js`도 타입 검사 대상**이다.

| 걸릴 수 있는 곳 | 대응 |
|---|---|
| §2 `scrubEvent`의 `JSON.parse(...) as T` | `as T` 단언이 있어 통과할 가능성이 높지만, `no-unsafe-return`이 뜨면 중간 변수(`const parsed: unknown = JSON.parse(...)`)를 거쳐 반환할 것 |
| §4 `withSentryConfig(config, {...})` 옵션 (`next.config.js`) | `checkJs: true`라 옵션 객체가 SDK 타입과 안 맞으면 `tsc --noEmit`이 **파일이 .js여도** 실패시킨다. 설치된 버전 문서에 맞춰 옵션을 조정할 것 (§14-1) |

그래서 **§2를 적용한 직후 한 번, §4 직후 한 번** `npm run check`를 돌려 둘을 분리해서 확인하는 걸 권한다. 마지막에 몰아서 돌리면 어느 쪽이 원인인지 가려내기 어렵다.

### 12-2. 빌드 검증

```bash
npm run build
```

**DSN 없이도 성공해야 한다.** 실패하면 §1의 `.optional()`이 빠진 것이다.

**토큰 유무 양쪽을 모두 확인할 것.** §4의 `withSentryConfig`는 앱 전체 빌드를 감싸므로, 소스맵 업로드 단계가 깨지면 관측과 무관한 라우트까지 함께 빌드가 실패한다. DSN과 `SENTRY_AUTH_TOKEN`은 **다른 변수**라 위 한 번의 빌드로는 토큰 경로가 전혀 검증되지 않는다.

```bash
# (1) 토큰 없이 — silent: true 덕분에 소스맵 업로드를 건너뛰고 성공해야 한다
npm run build

# (2) 토큰 있는 상태로 — 업로드 단계까지 통과해야 한다
SENTRY_AUTH_TOKEN=<token> npm run build
```

설치된 `@sentry/nextjs` 메이저에 따라 webpack/Turbopack 지원이 다를 수 있으므로, (2)에서 실패하면 §4의 옵션을 해당 버전 문서에 맞춰 조정한다.

### 12-3. 런타임 검증

```bash
# 터미널 1
npm run dev
# 터미널 2
npm run inngest-dev
```

1. `/admin/observability` → "Send test event" → Sentry에 이벤트 도착 확인
   (로컬은 DSN이 없으면 조용하다. 검증하려면 `.env`에 임시로 DSN을 넣고 끝나면 뺄 것)
2. **cron 로직** — `listStuckProcessingUploadedFiles({ minAgeMs: 60_000 })`로 임계값을 임시로 낮추고 http://localhost:8288 에서 `monitor-pipeline-health`를 수동 트리거. 대상 행이 잡히는지, `flushReports`가 반환 전에 끝나는지 확인.
3. **dispatch 실패** — `PROCESS_VIDEO_ENDPOINT`를 일시적으로 잘못된 값으로 바꿔 실패를 유도. 이벤트가 **정확히 하나** 나가는지, 정상 동시성(`stale_attempt` 등)에서는 **아무것도 안 나가는지** 확인.

### 12-4. 배포 후

- Vercel **preview** 배포에서 에러를 하나 내고 → Sentry에 **나타나지 않아야** 한다 (DSN 미주입 확인)
- Production에서 `/admin/observability` 버튼 → 이벤트 도착 확인
- Sentry 이슈의 `environment` 태그가 `production`인지 확인

### 12-5. 미검증으로 남는 것

아래 둘은 실제 장애가 나야만 증명된다. **채워지기 전까지 "에러 인지 체계가 동작한다"고 말하지 않는다.**

- [ ] 첫 실제 파이프라인 실패 알림 수신 — 날짜: ____
- [ ] 첫 실제 정체 감지 알림 수신 — 날짜: ____

그리고 두 칸이 다 채워져도 그 문장은 **1단계 범위 안에서만** 참이다. 아래는 여전히 실명 상태이며, 이건 결함이 아니라 명시적으로 잘라낸 범위다:

- **클라이언트 렌더링 에러** — `error.tsx` 4개 + `global-error.tsx` (서버 전용 결정)
- **edge 런타임** — `src/middleware.ts`가 도는 `/dashboard/*`·`/admin/*`·`/login` (§3-a)
- **서버 `console.error` 27곳** — `functions.ts` 2곳만 1단계 (설계 문서 §9)

---

## 13. 롤백

전부 additive이고 스키마 변경이 없다.

| 범위 | 방법 |
|---|---|
| 전체 무력화 | Vercel에서 `SENTRY_DSN` 제거 → SDK가 아무것도 보내지 않음. `console.error`는 그대로 남아 기존 동작 보존 |
| cron만 | `src/app/api/inngest/route.ts`의 functions 배열에서 `monitorPipelineHealth` 제거 |
| 코드 전체 | §1~§11 되돌리기. **DB 정리 불필요** — 어떤 경로도 DB에 쓰지 않는다 |

---

## 14. 이 문서가 확정하지 않은 것

구현 중 판단이 필요하면 설계 문서(`docs/proposals/error-monitoring-2026-07-28.md` §10)의 확인 항목을 볼 것.

1. ~~**`@sentry/nextjs` 설치 버전의 실제 API 시그니처**~~ — **해소됨(2026-07-29, v10.68.0).** 세 항목 모두 확인했고 그중 하나는 문서의 대응책 자체가 틀렸다. 상단 "적용 결과" 표 참조.
2. Sentry 기본 알림 규칙이 "새 이슈만"인지 — 아니면 §6-1의 24h 윈도우가 메일을 스팸한다
3. Inngest 현재 플랜의 실패 알림 제공 여부 — 없으면 cron 비중이 커진다
4. Sentry 무료 티어 실제 한도 대비 트래픽 볼륨
5. `FLUSH_TIMEOUT_MS = 2000`이 적절한지 — 사용자 응답 지연과 유실 방지의 균형
6. Sentry 조직 데이터 리전 (§11의 표기) 및 §4의 `org`/`project` slug
