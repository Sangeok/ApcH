# FEAT-32: 클라이언트 Sentry 초기화 — 브라우저 오류가 현재 어떤 텔레메트리에도 도달하지 않음

agent: web-dev

## 현재 동작

- `Sentry.init`은 저장소 전체에서 **하나뿐**이다 — `src/sentry.server.config.ts:65` `Sentry.init({`. DSN·environment·`sendDefaultPii: false`·`tracesSampleRate: 0`·`beforeSend`를 준다.
- 그 서버 설정은 서버 런타임에서만 로드된다 — `src/instrumentation.ts:4` `if (process.env.NEXT_RUNTIME === "nodejs") {` 안에서 `await import("./sentry.server.config")` (`:5`). `onRequestError = Sentry.captureRequestError` (`:10`)는 서버 컴포넌트·route handler 전용이다.
- **클라이언트 진입점 파일은 0개다.** `src/instrumentation-client.{ts,js}`·`src/sentry.client.config.{ts,js}`·루트 동명 파일 모두 없음(전수 `ls` 확인). 즉 브라우저에는 `Sentry.init`이 한 번도 실행되지 않아 SDK가 비활성이다.
- 라우트 에러 경계는 **5개**이고 전부 같은 훅을 쓴다 — `src/app/error.tsx:13`, `src/app/global-error.tsx:12`, `src/app/dashboard/error.tsx:13`, `src/app/dashboard/billing/error.tsx:13`, `src/app/dashboard/uploads/[uploadedFileId]/error.tsx:13`이 각각 `useReportBoundaryError(error, "...")`를 호출한다(호출부 5개 = 파일 5개, `grep -c` 확인).
- 그 훅은 `console.error`만 한다 — `src/fsd/shared/observability/use-report-boundary-error.ts:24` `console.error(\`${origin} error boundary caught:\`, error);`. 파일 주석(`:15-17`)이 "클라이언트 Sentry 초기화가 없어 `Sentry.captureException`을 넣어도 아무 데도 도달하지 않는다 — 클라이언트 init을 먼저 붙이고 브라우저 이벤트 도달을 확인한 뒤에 추가할 것"이라고 이미 순서를 못 박아 둔다.
- 그 훅을 barrel에서 재수출하지 못하는 이유도 파일에 있다 — `use-report-boundary-error.ts:11-13`: barrel `index.ts`가 `server-only`를 재수출하므로 `"use client"` 경계가 barrel을 임포트하면 빌드가 깨진다. 실제로 `src/fsd/shared/observability/index.ts:1-8`이 `./report-error`의 5개 심볼·2개 타입을 재수출하고, `src/fsd/shared/observability/report-error.ts:1`이 `import "server-only";`다. → **이 slice의 `index.ts`는 사실상 server-only barrel이고, 클라이언트 안전 조각은 파일 경로로 직접 임포트한다**(에러 경계 5개가 이미 `~/fsd/shared/observability/use-report-boundary-error`를 파일 경로로 임포트).
- DSN은 **server 스코프**에만 있다 — `src/env.js:43` `SENTRY_DSN: z.string().optional(),` (server 블록 안, `:9-45`). `runtimeEnv`에도 `SENTRY_DSN: process.env.SENTRY_DSN` (`:88`). client 블록(`:52-58`)에는 `NEXT_PUBLIC_SITE_URL`(`:53`)·`NEXT_PUBLIC_SUBSCRIPTION_ENABLED`(`:54`)뿐이라 브라우저 번들에서 DSN을 읽을 수 없다.
- 서버 `beforeSend`는 순수 스크럽을 건다 — `sentry.server.config.ts:11-15`의 `SCRUB_RULES`(X-Amz-Signature/Credential/Security-Token 3종 정규식), `:27-39`의 `scrub()`(규칙 적용 + `:34-36` 엔드포인트 호스트 `split().join()` 치환), `:57-63`의 `scrubEvent()`(직렬화→치환→역직렬화, `:60-62` fail-open catch). 엔드포인트 호스트는 `:17-25` `getEndpointHost()`가 `env.PROCESS_VIDEO_ENDPOINT`(server 스코프)에서 뽑는다.
- CSP `connect-src`에 Sentry ingest 호스트가 **없다** — `next.config.js:98` `"connect-src 'self' https://*.amazonaws.com https://*.neon.tech https://*.inngest.com https://*.polar.sh",`. 프로덕션에서만 CSP가 적용된다(`:60` `if (process.env.NODE_ENV === "development") return [];`).
- `withSentryConfig`는 `authToken`·`sourcemaps.deleteSourcemapsAfterUpload: true`·`silent: true`만 준다 — `next.config.js:115-121`.

**실물 검증(설치된 `@sentry/nextjs` 10.68.0, `node_modules` 직접 판독)**

- 버전: `node_modules/@sentry/nextjs/package.json` → `"version": "10.68.0"` (백로그가 "미검증"으로 표시한 항목).
- 클라이언트 진입점은 `instrumentation-client.ts`가 정답이다. `build/cjs/config/webpack.js`의 `getInstrumentationClientFile()`가 탐색하는 경로는 순서대로 `src/instrumentation-client.js` → `src/instrumentation-client.ts` → `instrumentation-client.js` → `instrumentation-client.ts`다. 이 앱은 `src/`를 쓰므로 **`src/instrumentation-client.ts`**가 첫 후보다. webpack이 이 파일을 `main-app`·`pages/_app` 엔트리에 주입한다(`addSentryToClientEntryProperty`).
- `sentry.client.config.ts`는 채택하지 않는다. `webpack.js:213`이 그 파일 존재 시 `DEPRECATION WARNING`을 찍고 "When using Turbopack `sentry.client.config.ts` will no longer work"라고 명시한다. 이 앱의 dev는 Turbopack이다(`package.json` `"dev": "next dev --turbo"`). `instrumentation-client.ts`는 Next.js 파일 컨벤션이라(경고 메시지가 nextjs.org 문서를 가리킨다) Turbopack·webpack 양쪽에서 로드된다. Next 버전 `node_modules/next/package.json` → `15.5.7`이 이 컨벤션(15.3+)을 지원한다.
- SDK가 앱 라우터 내비게이션 계측을 위해 클라 진입점에서 기대하는 export가 하나 있다 — `build/cjs/client/index.js:109` `exports.captureRouterTransitionStart = ...`. 진입점에서 `export const onRouterTransitionStart = Sentry.captureRouterTransitionStart`를 내보낸다(Next 15 `instrumentation-client` 훅).
- 클라 environment는 옵션 생략 시 SDK가 자동 채운다 — `client/index.js:54` `environment: options.environment || process.env.SENTRY_ENVIRONMENT || getVercelEnv(true) || process.env.NODE_ENV`. `getVercelEnv(true)`는 `common/getVercelEnv.js:4`에서 **클라이언트일 때 `process.env.NEXT_PUBLIC_VERCEL_ENV`**를 읽는다(서버의 `VERCEL_ENV`는 클라에서 못 읽음).
- 번들: 기본 통합에 tracing이 포함될 수 있다 — `client/index.js:85-108` `getDefaultIntegrations()`가 `__SENTRY_TRACING__`이 undefined/truthy면 `browserTracingIntegration()`를 push한다. Replay는 기본 통합이 아니다(추가해야만 들어옴). `webpack.js:553-573` `setupTreeshakingFromConfig`는 `webpack.treeshake.removeTracing`→`__SENTRY_TRACING__=false`, `removeDebugLogging`→`__SENTRY_DEBUG__=false`를 DefinePlugin으로 심어 해당 코드를 tree-shake한다(webpack 빌드 한정 — 프로덕션 `next build`는 webpack이다).

## 문제

백로그(`TASK_BACKLOG.md:22`, FEAT-32 source)가 지목한 것: **클라이언트 렌더 오류와 미처리 rejection이 프로덕션에서 관측되지 않는다.** 서버 오류는 `sentry.server.config.ts`가 잡지만, 브라우저에서 `Sentry.init`이 실행되는 지점이 0개라(위 「현재 동작」 클라 진입점 전수 부재) window의 `error`·`unhandledrejection`, C-27이 남긴 버려진 프라미스 넷, 에러 경계 5개가 잡는 렌더 실패가 전부 브라우저 콘솔에만 남는다. 유저가 붙는 시점에는 "화면이 하얗게 뜬다"는 제보 외에 근거가 없다.

백로그가 순서를 못 박았다(`:22` "**순서**: 이것이 먼저다. 초기화 없이 `use-report-boundary-error.ts`에 `Sentry.captureException`을 넣으면 아무 데도 도달하지 않는다 — 도달을 브라우저에서 실측한 뒤에 훅을 고친다"). 이 계획서는 그 순서대로 **초기화만** 넣고, 에러 경계 훅 수정은 도달 실측 뒤 후속으로 미룬다(결정 근거는 아래 §대안).

백로그가 지목한 문제와 코드에서 확인한 것은 어긋나지 않는다.

## 고칠 파일

| 파일 | 변경 |
| --- | --- |
| `src/instrumentation-client.ts` `(신규)` | 브라우저 `Sentry.init` + `onRouterTransitionStart` export. DSN은 `env.NEXT_PUBLIC_SENTRY_DSN`, `beforeSend`는 공유 스크럽 |
| `src/fsd/shared/observability/scrub-event.ts` `(신규)` | 서버 설정의 스크럽 로직을 **클라이언트 안전 순수 모듈**로 추출(env·server-only 의존 없음). barrel에는 넣지 않고 파일 경로로만 임포트 |
| `src/fsd/shared/observability/scrub-event.test.mjs` `(신규)` | 추출한 순수 스크럽의 분기 테스트 |
| `src/env.js` | client 스코프와 `runtimeEnv`에 `NEXT_PUBLIC_SENTRY_DSN` 추가 |
| `src/sentry.server.config.ts` | 인라인 스크럽(`SCRUB_RULES`·`scrub`·`scrubEvent`)을 제거하고 추출 모듈을 재사용. 엔드포인트 호스트는 리터럴 치환 인자로 전달(동작 보존) |
| `next.config.js` | CSP `connect-src`에 Sentry ingest 호스트 추가 + `withSentryConfig`에 번들 축소용 `webpack.treeshake` 옵션 |

여기 없는 파일은 고치지 않는다. 특히 **에러 경계 5개와 `use-report-boundary-error.ts`는 이 항목에서 건드리지 않는다**(§대안의 훅 결정).

## 구현 스케치

### 1. `src/fsd/shared/observability/scrub-event.ts` (신규, 순수 모듈)

`sentry.server.config.ts:11-63`의 스크럽 3요소를 옮긴다. 차이는 엔드포인트 호스트가 하드코딩 대신 **리터럴 치환 인자**로 들어온다는 것뿐(서버는 채워 넘기고, 클라는 빈 배열).

```ts
// 자유 문자열 채널(예: presigned URL)에 섞일 수 있는 알려진 비밀을 Sentry 이벤트에서 지운다.
// 서버·클라이언트 beforeSend가 공유한다. 클라이언트 안전: env·server-only 의존이 없다.
// 그래서 shared/observability/index.ts(server-only report-error를 재수출)에는 넣지 않고
// 파일 경로로만 임포트한다 — use-report-boundary-error.ts:11-13과 같은 이유.

// 경계에 백슬래시를 포함한다(원본에는 없다 — 검증 라운드 결함 ①).
// JSON.stringify가 값 안의 따옴표를 \" 로 이스케이프하는데, 원본 경계 [^&\s"']는
// 그 백슬래시에서 멈추지 않아 닫는 따옴표까지 삼킨다 → 치환 결과가 깨진 JSON이 되고
// JSON.parse가 던져 catch가 **스크럽되지 않은 원본을 그대로 반환**한다(fail-open).
const SCRUB_RULES: Array<[RegExp, string]> = [
  [/X-Amz-Signature=[^&\s"'\\]+/gi, "X-Amz-Signature=[REDACTED]"],
  [/X-Amz-Credential=[^&\s"'\\]+/gi, "X-Amz-Credential=[REDACTED]"],
  [/X-Amz-Security-Token=[^&\s"'\\]+/gi, "X-Amz-Security-Token=[REDACTED]"],
];

/** 문자열 리터럴 치환. 서버는 [엔드포인트 호스트, "[PROCESS_VIDEO_ENDPOINT]"]를 넘긴다. */
export type LiteralReplacement = readonly [needle: string, replacement: string];

export function scrubString(
  value: string,
  literals: readonly LiteralReplacement[] = [],
): string {
  let out = value;
  for (const [pattern, replacement] of SCRUB_RULES) {
    out = out.replace(pattern, replacement);
  }
  for (const [needle, replacement] of literals) {
    out = out.split(needle).join(replacement);
  }
  return out;
}

// event 전체를 직렬화 → 치환 → 역직렬화. 메시지·예외·컨텍스트 어디에 섞여도 잡힌다.
// fail-open: JSON.stringify가 던지면 catch가 스크럽되지 않은 원본을 그대로 반환한다.
// (서버 원본 주석의 한계 1과 동일. SDK 메이저 업그레이드로 normalize 순서가 바뀌면
//  return null=이벤트 폐기 fail-closed로 전환할 것.)
export function scrubEvent<T>(
  event: T,
  literals: readonly LiteralReplacement[] = [],
): T {
  try {
    return JSON.parse(scrubString(JSON.stringify(event), literals)) as T;
  } catch {
    return event;
  }
}
```

순서·fail-open 구조는 `sentry.server.config.ts` 원본과 같게 옮긴다(규칙 적용 루프 `:30-32`, 엔드포인트 치환 `:34-36`, catch `:60-62`). 규칙 적용 → 리터럴 치환 순서도 원본과 같다.

**정규식만 원본(`:12-14`)과 다르다 — 경계에 `\\`를 추가한다.** 검증 라운드에서 실측한 결함이다: 서명값 뒤에 따옴표가 오는 이벤트(`X-Amz-Signature=abc"tail`)를 넣으면 `JSON.stringify`가 `abc\\"tail`로 이스케이프하고, 원본 경계 `[^&\s"']`가 백슬래시에서 멈추지 않아 닫는 따옴표까지 먹는다 → 치환 결과가 깨진 JSON → `JSON.parse` throw → catch가 **원본을 그대로 반환**한다. 즉 **서명이 스크럽 없이 Sentry로 나간다.** 네 입력으로 실측 대조:

| 입력 | 현행 정규식 | `\\` 추가 |
| --- | --- | --- |
| `X-Amz-Signature=abc"tail rest` | **깨진 JSON → fail-open(유출)** | 유효 JSON · 스크럽 |
| `?X-Amz-Signature=abc123&next=1` | 유효 · 스크럽 | 유효 · 스크럽 |
| `X-Amz-Signature=abc def` | 유효 · 스크럽 | 유효 · 스크럽 |
| `X-Amz-Signature=AKIA/2026/ap/s3/aws4_request` | 유효 · 스크럽 | 유효 · 스크럽 |

**이 수정은 서버에도 적용된다** — `sentry.server.config.ts`가 이 모듈에 위임하므로 같은 결함이 서버에서도 닫힌다. 원본 주석이 catch를 "사실상 죽은 경로"라 했는데, SDK 정규화가 순환 참조·BigInt를 걸러도 **이 경로는 살아 있다**(정규화 뒤에도 문자열 안의 따옴표는 남는다). 그 주석도 함께 고친다.

### 2. `src/instrumentation-client.ts` (신규)

```ts
import * as Sentry from "@sentry/nextjs";

import { env } from "~/env";
import { scrubEvent } from "~/fsd/shared/observability/scrub-event";

Sentry.init({
  // undefined면 SDK가 전송하지 않는다 = preview/로컬에서 조용함 (server config와 동일 규약)
  dsn: env.NEXT_PUBLIC_SENTRY_DSN,
  // environment는 생략한다. SDK가 SENTRY_ENVIRONMENT → NEXT_PUBLIC_VERCEL_ENV → NODE_ENV
  // 순으로 자동 채우므로(client/index.js:54, getVercelEnv.js:4) 클라 전용 폴백을 직접 쓰지 않는다.
  // IP·쿠키 등 SDK 자동 수집을 끈다. 사용자 식별은 setUser({ id })로만.
  sendDefaultPii: false,
  // 1단계는 에러만. 성능 추적은 무료 쿼터만 태운다.
  tracesSampleRate: 0,
  // 클라에는 서버 스코프 env(PROCESS_VIDEO_ENDPOINT)가 없으므로 엔드포인트 치환은 넘기지 않는다.
  beforeSend: (event) => scrubEvent(event),
});

// 앱 라우터 내비게이션 계측 훅 (@sentry/nextjs 10.68.0: captureRouterTransitionStart)
export const onRouterTransitionStart = Sentry.captureRouterTransitionStart;
```

### 3. `src/env.js` — 두 곳

client 블록(현재 `:52-58`)에 추가. 위치는 `NEXT_PUBLIC_SITE_URL` 다음 줄(`:53` 아래):

before (`:52-53`):
```js
  client: {
    NEXT_PUBLIC_SITE_URL: z.string().url().optional(),
```
after:
```js
  client: {
    // Sentry (Vercel Production/Preview 스코프에 SENTRY_DSN과 동일 DSN 값을 주입. 없으면 client init이 no-op)
    NEXT_PUBLIC_SENTRY_DSN: z.string().optional(),
    NEXT_PUBLIC_SITE_URL: z.string().url().optional(),
```

`runtimeEnv`(현재 `:90-91`)에 추가:

before (`:90`):
```js
    NEXT_PUBLIC_SITE_URL: process.env.NEXT_PUBLIC_SITE_URL,
```
after:
```js
    NEXT_PUBLIC_SENTRY_DSN: process.env.NEXT_PUBLIC_SENTRY_DSN,
    NEXT_PUBLIC_SITE_URL: process.env.NEXT_PUBLIC_SITE_URL,
```

### 4. `src/sentry.server.config.ts` — 스크럽을 추출 모듈로 교체(동작 보존)

`SCRUB_RULES`(`:11-15`)·`scrub`(`:27-39`)·`scrubEvent`(`:57-63`)를 삭제하고 추출 모듈을 임포트한다. `getEndpointHost`(`:17-23`)·`ENDPOINT_HOST`(`:25`)는 남긴다(서버 env 의존).

임포트 추가(`:1-2` 아래):
```ts
import { scrubEvent, type LiteralReplacement } from "~/fsd/shared/observability/scrub-event";
```

엔드포인트 치환 리터럴을 `ENDPOINT_HOST`에서 만든다(`:25` 아래에 추가):
```ts
const ENDPOINT_REPLACEMENTS: LiteralReplacement[] = ENDPOINT_HOST
  ? [[ENDPOINT_HOST, "[PROCESS_VIDEO_ENDPOINT]"]]
  : [];
```

`beforeSend`(현재 `:74`):

before:
```ts
  beforeSend: (event) => scrubEvent(event),
```
after:
```ts
  beforeSend: (event) => scrubEvent(event, ENDPOINT_REPLACEMENTS),
```

동작 보존 확인: 기존 `scrub()`은 규칙 적용 후 `ENDPOINT_HOST`가 있으면 `split().join()` 치환(`:34-36`). 추출 후에도 규칙 적용 → `ENDPOINT_REPLACEMENTS`(같은 needle/replacement) 치환으로 순서·결과가 동일하다. `ENDPOINT_HOST`가 null이면 빈 배열 → 기존의 `if (ENDPOINT_HOST)` 스킵과 동일.

### 5. `next.config.js` — CSP + 번들 축소

CSP `connect-src`(`:98`). 브라우저가 이벤트를 `https://o<org>.ingest.<region>.sentry.io`로 POST하는데, 현재 `connect-src`에 없어 프로덕션 CSP가 그 요청을 차단한다 — §검증이 성립하지 않는다.

before (`:98`):
```js
              "connect-src 'self' https://*.amazonaws.com https://*.neon.tech https://*.inngest.com https://*.polar.sh",
```
after:
```js
              "connect-src 'self' https://*.amazonaws.com https://*.neon.tech https://*.inngest.com https://*.polar.sh https://*.sentry.io",
```

(`*.sentry.io`는 CSP 호스트 와일드카드가 다단 서브도메인 `o123.ingest.us.sentry.io`를 포섭한다. 아웃바운드 이벤트 POST 전용이라 범위가 넓어도 위험이 작다.)

번들 축소 — `withSentryConfig`(`:115-121`)에 `webpack.treeshake` 추가. 서버·클라 둘 다 `tracesSampleRate: 0`이라 tracing 코드는 죽은 코드다.

before (`:115-121`):
```js
export default withSentryConfig(config, {
  authToken: process.env.SENTRY_AUTH_TOKEN,
  // 소스맵을 업로드하되 빌드 산출물에서는 제거 (스택 추적은 살리고 노출은 막음)
  sourcemaps: { deleteSourcemapsAfterUpload: true },
  // 토큰이 없는 환경(preview/로컬)에서 빌드가 깨지지 않게
  silent: true,
});
```
after:
```js
export default withSentryConfig(config, {
  authToken: process.env.SENTRY_AUTH_TOKEN,
  // 소스맵을 업로드하되 빌드 산출물에서는 제거 (스택 추적은 살리고 노출은 막음)
  sourcemaps: { deleteSourcemapsAfterUpload: true },
  // 토큰이 없는 환경(preview/로컬)에서 빌드가 깨지지 않게
  silent: true,
  // tracesSampleRate 0이라 tracing·debug 코드는 죽은 코드다. webpack 빌드에서 tree-shake.
  // (프로덕션 next build는 webpack; dev의 Turbopack에는 적용되지 않으나 dev 번들 크기는 무관)
  webpack: { treeshake: { removeTracing: true, removeDebugLogging: true } },
});
```

## 테스트

- **덮는 것** — `src/fsd/shared/observability/scrub-event.test.mjs` (`import { scrubString, scrubEvent } from "./scrub-event.ts"`):
  - `scrubString`: X-Amz-Signature/Credential/Security-Token 각각을 `[REDACTED]`로 치환(세 규칙 개별 + 한 문자열에 셋 동시). 서명값 뒤 `&`·공백·따옴표·**백슬래시**에서 경계가 끊기는지.
  - **이스케이프된 따옴표 회귀(결함 ①)**: `scrubEvent({ message: 'X-Amz-Signature=abc"tail' })`가 **스크럽된 결과를 반환**하는지 — 반환값이 입력과 동일 객체면(=fail-open) 실패다. 경계에서 `\\`를 빼면 이 테스트가 죽는다(음성 시험으로 확인할 것).
  - `scrubString` 리터럴 치환: `literals`로 넘긴 needle이 `split().join()`으로 전부 치환되는지(다중 출현), 빈 배열이면 규칙만 적용되는지.
  - 스크럽 대상이 없는 문자열은 그대로 통과.
  - `scrubEvent`: 중첩 이벤트 객체(message·exception.values[].value·contexts에 서명값을 심음)에서 어느 위치든 치환되는지(왕복 직렬화).
  - `scrubEvent` fail-open: 순환 참조 등 `JSON.stringify`가 던지는 입력에 대해 원본을 그대로 반환(스로우하지 않음).
  - **회귀 못박기**: 서버 `beforeSend`가 이 순수 함수에 위임하므로, 이 테스트가 서버·클라 양쪽 스크럽 계약을 동시에 지킨다. `sentry.server.config.ts`의 리팩터가 동작을 바꾸지 않았음을 이 테스트로 증명한다.
- **못 덮는 범위**(현재 러너로 원리상 불가 — Node 내장 러너, DOM·브라우저·실제 네트워크 없음):
  - 브라우저에서 `Sentry.init`이 실제로 실행되고 이벤트가 Sentry ingest에 **도달**하는지. 이게 이 항목의 본체이며 §검증(아래)로 배포 후 실측한다.
  - CSP `connect-src`가 실제 이벤트 POST를 막지 않는지(프로덕션에서만 CSP 적용).
  - `webpack.treeshake`가 실제 번들에서 tracing을 제거했는지(빌드 산출물 크기 실측).
  - `instrumentation-client.ts`가 webpack/Turbopack 엔트리에 주입되는지(빌드·런타임 동작).

### 검증 방법 (이 항목의 본체 — 배포 후 수동, release-checks 등재 대상)

`npm test`·`npm run build`로는 "브라우저 오류가 Sentry에 도달하는가"를 확인할 수 없다. 다음 절차로 실측한다:

1. **선행(사용자)**: Vercel Production(및 Preview) 스코프에 `NEXT_PUBLIC_SENTRY_DSN`을 기존 `SENTRY_DSN`과 **동일한 DSN 값**으로 주입하고 배포.
2. 프로덕션(a-pch.com)에서 브라우저 devtools 콘솔을 열고, **에러 경계에 잡히지 않는** 오류를 유도한다 — 예: `setTimeout(() => { throw new Error("apch-sentry-client-smoke https://x.s3/y?X-Amz-Signature=SHOULD_BE_REDACTED"); })`. 비동기 throw는 `window.onerror`→SDK globalHandlers→ingest POST 경로라 훅 없이 init만으로 도달한다. `Promise.reject(new Error("apch-sentry-rejection-smoke"))`로 unhandledrejection 경로도 함께 확인.
3. **CSP 통과 확인**: devtools Network에서 `*.ingest.*.sentry.io`로 나가는 POST가 200이고, 콘솔에 CSP 위반(`Refused to connect ... connect-src`) 경고가 없는지 본다.
4. **Sentry 대시보드(사용자)**: Issues에서 `apch-sentry-client-smoke` 이벤트가 뜨는지, environment가 production인지, 그리고 **`X-Amz-Signature=[REDACTED]`로 마스킹**됐는지(스크럽 실동작) 확인.
5. release-checks 등재는 메인 루프 몫(런북 8단계). 이 항목의 「못 덮는 범위」는 위 2~4의 실측이며, 마감 증거는 `확인(날짜, Sentry 이벤트 스크린샷/이슈 링크)` 형태다. 응답 상태·본문 문구만으로 판정되지 않으므로 `〔auto〕` 태그 대상이 아니다.

## 범위 밖 의존

**코드 범위 밖 의존: 없음.** 고칠 파일 6개가 전부 `apps/web` 안이다(`src/instrumentation-client.ts`·`src/env.js`·`next.config.js`·`src/sentry.server.config.ts`·`src/fsd/shared/observability/scrub-event.{ts,test.mjs}`). `packages/db`·다른 워크스페이스에 닿지 않으므로 구현이 `보류`로 튈 지점은 없다.

**저장소 밖에서 사람이 해야 하는 일(구현이 아니라 활성화·검증의 선행)**:
- **Vercel 환경변수 주입(사용자)**: `NEXT_PUBLIC_SENTRY_DSN`을 Production·Preview 스코프에 기존 `SENTRY_DSN`과 같은 DSN 값으로 추가한다. 코드는 이 값 없이도 빌드·배포되며(`.optional()`), 없으면 client init이 조용히 no-op일 뿐이다. 즉 이 선행이 구현을 막지는 않지만, 없으면 §검증이 성립하지 않는다.
  - **DSN을 클라이언트에 노출해도 되는가**: 된다. Sentry 공식 문서 입장 — DSN은 비밀이 아니며 클라이언트/공개 코드에 노출해도 안전하다. DSN은 **이벤트 제출(쓰기)만** 허용하고 프로젝트 데이터 읽기·조회 권한을 주지 않기 때문이다. 남용(스팸 제출)은 Sentry의 inbound rate limit·spike protection으로 관리한다. 서버 설정도 이미 같은 DSN을 쓰므로 값 자체는 새로 비밀이 되지 않는다.
- **Sentry 대시보드 접근(사용자)**: §검증 4단계의 이벤트 도달·스크럽 확인에 필요.
- **(선택) `NEXT_PUBLIC_VERCEL_ENV` 노출**: 클라 이벤트의 environment를 preview/production으로 정확히 가르려면 Vercel의 "system environment variables 노출" 설정으로 이 변수를 브라우저에 노출한다. 없으면 SDK가 `NODE_ENV`로 폴백해 프로덕션 이벤트는 여전히 `production`으로 태깅되므로 필수는 아니다.

## 대안

- **클라 진입점 `sentry.client.config.ts`**: 기각. `webpack.js:213`이 deprecation 경고를 찍고 Turbopack에서 작동하지 않는다고 명시하며, 이 앱 dev는 `--turbo`다. `instrumentation-client.ts`가 Next 15.3+ 컨벤션이라 양쪽 번들러에서 로드된다.
- **DSN 단일화(기존 `SENTRY_DSN`을 `NEXT_PUBLIC_SENTRY_DSN`으로 옮기고 서버·클라가 한 변수를 공유)**: 검토했으나 기각. 서버 설정을 `env.NEXT_PUBLIC_SENTRY_DSN`으로 바꾸면, 새 변수를 아직 안 넣은 배포에서 **서버 오류 보고가 잠깐 꺼지는 회귀 창**이 생긴다. 채택안(server=`SENTRY_DSN` 유지, client=신규 `NEXT_PUBLIC_SENTRY_DSN`)은 서버 동작을 그대로 두고 클라만 새 변수가 채워지면 켜진다 — 더 우아하게 강등된다. 대가는 Vercel에 같은 DSN을 두 변수로 두는 중복(문서화된 선행).
- **CSP 대신 `tunnelRoute`**(`withSentryConfig({ tunnelRoute: "/monitoring" })`): 이벤트를 same-origin으로 프록시해 `connect-src` 변경 없이 통과하고 ad-blocker도 우회한다. 기각 이유: Next 서버 함수 호출(Vercel invocation) 비용과 라우트 추가가 붙는다. 유저 트래픽이 없어 지금은 비용이 사소하지만, `connect-src`에 호스트 한 줄 추가가 더 명시적이고 움직이는 부품이 적다. 향후 ad-blocker 유실이 관측되면 그때 tunnelRoute로 전환한다.
- **에러 경계 훅(`use-report-boundary-error.ts`)을 이 항목에서 `Sentry.captureException`으로 배선**: 기각(연기). 백로그(`:22`)와 그 파일 주석(`:15-17`)이 "초기화·도달 실측 뒤에 훅을 고친다"고 순서를 못 박았다. init만으로도 window 핸들러가 잡는 미처리 오류·rejection(C-27 프라미스 넷 포함)은 도달하므로 검증이 성립하고, 에러 경계가 잡는 렌더 실패(파일명 등 PII가 섞일 수 있음)까지 배선하는 것은 스크럽 실동작을 실측한 **뒤** 후속 항목으로 다룬다. 이 훅 배선은 여전히 web 범위이며, §검증에서 도달이 확인되면 새 백로그 항목으로 등재할 후속이다(비고).
- **스크럽 로직을 클라에 중복 작성**: 기각. `SCRUB_RULES`를 두 벌로 두면 한쪽만 고쳐 조용히 어긋난다(이 저장소의 analytics 계약 중복 경고와 같은 실패 모드). 순수 모듈로 추출해 서버·클라가 공유하면 `*.test.mjs` 하나가 양쪽 계약을 지킨다.
