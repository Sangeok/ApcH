# Vercel 프로젝트 설정 가이드

> 작성일: 2026-03-25
> 기반 문서: `deployment-infrastructure-proposal.md`
> 프로젝트: AI Podcast Clipper Frontend (Next.js 15 / T3 Stack)

---

## 개요

본 문서는 `deployment-infrastructure-proposal.md`에서 정의한 배포 인프라를 실제로 구축하기 위해 수행해야 하는 **모든 작업을 단계별로** 정리한 것이다. 작업은 크게 4개 Phase로 나뉘며, 각 Phase 내에서 순서대로 진행한다.

### 현재 상태 (작업 전)

| 항목 | 상태 | 파일 |
|------|------|------|
| `vercel.json` | 없음 | - |
| `src/server/auth/config.edge.ts` | 없음 | - |
| `src/middleware.ts` | 없음 | - |
| `src/app/global-error.tsx` | 없음 | - |
| `src/app/not-found.tsx` | 없음 | - |
| `src/app/error.tsx` | 없음 | - |
| `src/app/dashboard/error.tsx` | 없음 | - |
| `src/app/api/health/route.ts` | 없음 | - |
| `src/fsd/shared/lib/cloudfront.ts` | 없음 | - |
| `next.config.js` 보안 헤더 | 없음 | `next.config.js` |
| `src/env.js` Inngest/CloudFront 변수 | 없음 | `src/env.js` |
| `.env.example` Inngest/CloudFront 변수 | 없음 | `.env.example` |
| `src/server/auth/config.ts` edge config 확장 | 미적용 | `src/server/auth/config.ts` |
| `src/app/api/inngest/route.ts` maxDuration | 없음 | `src/app/api/inngest/route.ts` |
| `src/app/api/webhooks/polar/route.ts` maxDuration | 없음 | `src/app/api/webhooks/polar/route.ts` |
| `src/inngest/functions.ts` retries/cancelOn | retries: 1, cancelOn 없음 | `src/inngest/functions.ts` |

### Phase 요약

| Phase | 이름 | 작업 수 | 예상 공수 | 설명 |
|-------|------|---------|-----------|------|
| A | 코드 변경 (배포 준비) | 11 | 2일 | Vercel 배포에 필요한 코드 수정 |
| B | Vercel 대시보드 설정 | 6 | 0.5일 | Vercel 프로젝트 생성 및 구성 |
| C | 외부 서비스 연동 | 2 | 0.5일 | Inngest, Neon 연동 |
| D | 도메인 & CDN | 4 | 1.5일 | 도메인 설정, CloudFront CDN 구성 |
| **합계** | | **23** | **4일** | |

---

## Phase A: 코드 변경 (배포 준비)

Vercel에 배포하기 전에 코드베이스에 적용해야 하는 변경 사항이다. 로컬에서 모든 변경을 완료하고, `npm run check`로 검증한 뒤 커밋한다.

---

### A-1. `vercel.json` 생성

**파일**: `vercel.json` (프로젝트 루트, 신규 생성)

```jsonc
{
  "$schema": "https://openapi.vercel.sh/vercel.json",
  "framework": "nextjs",
  "regions": ["icn1"]
}
```

**설정 근거**:
- `regions: ["icn1"]` - 서울 리전. 한국 사용자 대상 서비스이므로 최소 지연시간 확보
- `framework: "nextjs"` - Vercel이 Next.js 최적화 빌드를 자동 적용

**주의 사항**:
- `functions` 설정은 사용하지 않는다. App Router에서는 Route Segment Config 방식을 사용해야 한다 (A-2 참고)

**검증 방법**: 파일 생성 후 JSON 문법 오류 없는지 확인

---

### A-2. Route Segment Config 추가 (maxDuration)

Vercel Serverless Function의 타임아웃을 설정한다. App Router에서는 `vercel.json`의 `functions` 대신 각 route 파일 내 `export const maxDuration`을 사용하는 것이 Vercel 공식 권장 방식이다.

> **⚠️ Hobby 플랜 제약**: Hobby 플랜의 Serverless Function 최대 실행 시간은 **10초**이다. `maxDuration`에 10 초과 값을 설정해도 10초로 자동 제한된다. 아래에서는 Hobby 플랜 기준으로 `maxDuration = 10`을 설정하며, 추후 Pro 플랜 전환 시 상향할 수 있도록 주석으로 권장 값을 함께 기재한다.

#### A-2-1. Inngest serve endpoint

**파일**: `src/app/api/inngest/route.ts` (기존 파일 수정)

**현재 상태**:
```typescript
import { serve } from "inngest/next";
import { inngest } from "../../../inngest/client";
import { processVideo } from "~/inngest/functions";

export const { GET, POST, PUT } = serve({
  client: inngest,
  functions: [processVideo],
});
```

**수정 후**:
```typescript
import { serve } from "inngest/next";
import { inngest } from "../../../inngest/client";
import { processVideo } from "~/inngest/functions";

export const maxDuration = 10; // Hobby 플랜 최대값. Pro 전환 시 300으로 상향 권장

export const { GET, POST, PUT } = serve({
  client: inngest,
  functions: [processVideo],
});
```

**변경 사항**: `export const maxDuration = 10;` 추가 (1줄)

**근거**: 이 route는 Inngest Cloud가 각 step 함수를 호출하는 HTTP 진입점이다. Inngest는 워크플로우를 개별 step으로 분할하여 실행하므로, 각 step이 10초 이내에 완료되면 Hobby 플랜에서도 정상 동작한다.

> **⚠️ Hobby 플랜에서 주의할 step**: `call-modal-endpoint` step은 외부 Modal 엔드포인트에 HTTP 요청을 보내고 응답을 기다린다. 만약 Modal 엔드포인트가 **동기식**(영상 처리 완료 후 응답)이라면 10초를 초과할 가능성이 높다. 이 경우 다음 중 하나를 선택해야 한다:
> 1. **Modal 엔드포인트를 비동기 방식으로 변경**: 요청 수신 즉시 202 응답 → 처리 완료 후 webhook/polling으로 결과 전달
> 2. **Vercel Pro 플랜으로 업그레이드**: `maxDuration = 300`으로 상향하여 5분까지 허용
>
> 현재 코드 구조상 Modal 엔드포인트가 동기식으로 보이므로, 긴 영상 처리 시 타임아웃이 발생할 수 있다. 짧은 영상(~1분)이라면 10초 내에 처리될 가능성이 있으나, 이는 Modal 서버의 처리 속도에 의존한다.

#### A-2-2. Polar webhook endpoint

**파일**: `src/app/api/webhooks/polar/route.ts` (기존 파일 수정)

**수정 후** (파일 상단에 추가):
```typescript
export const maxDuration = 10; // Hobby 플랜 최대값. Pro 전환 시 30으로 상향 권장
```

**변경 사항**: 파일 최상단(import 전)에 `export const maxDuration = 10;` 추가 (1줄)

**근거**: Polar Webhook 핸들러는 Subscription/Order의 DB 작업을 수행한다. Neon의 서버리스 PostgreSQL 응답 시간은 일반적으로 수십~수백 ms이므로, 여러 쿼리를 수행해도 10초 이내에 충분히 완료된다.

---

### A-3. Edge-safe 인증 설정 분리 및 미들웨어 생성

> **⚠️ 핵심 배경**: Next.js 미들웨어는 **Edge Runtime**에서 실행된다. 현재 `src/server/auth/config.ts`는 `PrismaAdapter(db)`를 import하며, Prisma Client는 Edge Runtime에서 동작하지 않는다(네이티브 바이너리 엔진 필요). 따라서 미들웨어에서 기존 auth config를 직접 import하면 **배포 시 런타임 에러가 발생**한다.
>
> **해결 방법**: 인증 설정을 Edge-safe 부분과 Full 부분으로 분리한다. 미들웨어는 JWT 디코딩과 `authorized` 콜백만 필요하므로, DB 의존성이 없는 최소 설정으로 충분하다.

이 작업은 3개의 파일을 변경한다:

#### A-3-1. `src/server/auth/config.edge.ts` 생성 (신규)

Edge Runtime에서 안전하게 실행 가능한 인증 설정이다. Prisma, DB import가 없다.

```typescript
import type { NextAuthConfig } from "next-auth";

const PROTECTED_ROUTES = ["/dashboard"];
const AUTH_ROUTES = ["/login", "/signup"];

/**
 * Edge Runtime 호환 인증 설정.
 * middleware.ts에서 사용하며, Prisma/DB 의존성이 없다.
 * 전체 인증 설정(config.ts)은 이 설정을 확장(spread)한다.
 */
export const authConfigEdge = {
  session: { strategy: "jwt" },
  pages: {
    signIn: "/login",
  },
  callbacks: {
    authorized({ auth, request: { nextUrl } }) {
      const isLoggedIn = !!auth?.user;

      // 보호 라우트: 미인증 사용자 → 로그인 페이지로 리다이렉트
      const isProtected = PROTECTED_ROUTES.some((route) =>
        nextUrl.pathname.startsWith(route),
      );
      if (isProtected && !isLoggedIn) {
        return false; // NextAuth가 자동으로 pages.signIn + callbackUrl로 리다이렉트
      }

      // 인증 라우트: 이미 로그인된 사용자 → 대시보드로 리다이렉트
      const isAuthRoute = AUTH_ROUTES.some((route) =>
        nextUrl.pathname.startsWith(route),
      );
      if (isAuthRoute && isLoggedIn) {
        return Response.redirect(new URL("/dashboard", nextUrl));
      }

      return true;
    },
  },
} satisfies NextAuthConfig;
```

**설계 근거**:
- `authorized` 콜백은 NextAuth v5의 공식 미들웨어 인증 패턴이다
- `return false` 시 NextAuth가 자동으로 `pages.signIn`에 `callbackUrl` 파라미터를 추가하여 리다이렉트한다
- JWT 디코딩은 `AUTH_SECRET` 환경 변수만으로 가능하므로 DB 접근이 불필요하다

#### A-3-2. `src/server/auth/config.ts` 수정 (기존 파일)

Edge config를 확장하여 Full config를 구성한다.

**현재 상태** (파일 상단):
```typescript
import { PrismaAdapter } from "@auth/prisma-adapter";
import { type DefaultSession, type NextAuthConfig } from "next-auth";
// ...

export const authConfig = {
  providers: [
    // ...
  ],
  session: { strategy: "jwt" },
  adapter: PrismaAdapter(db),
  callbacks: {
    // ...
  },
} satisfies NextAuthConfig;
```

**수정 후**:
```typescript
import { PrismaAdapter } from "@auth/prisma-adapter";
import { type DefaultSession, type NextAuthConfig } from "next-auth";
import { authConfigEdge } from "./config.edge";
// ...

export const authConfig = {
  ...authConfigEdge,
  adapter: PrismaAdapter(db),
  providers: [
    // ... (기존 providers 유지)
  ],
  callbacks: {
    ...authConfigEdge.callbacks,
    // ... (기존 signIn, session, jwt 콜백 유지)
  },
} satisfies NextAuthConfig;
```

**변경 사항**:
- `import { authConfigEdge } from "./config.edge"` 추가
- config 객체에 `...authConfigEdge` spread
- `callbacks`에 `...authConfigEdge.callbacks` spread
- 기존 `session: { strategy: "jwt" }` 제거 (edge config에서 상속)

> **주의**: `callbacks` 내의 `session`, `jwt`, `signIn` 콜백은 기존 코드를 그대로 유지한다. spread 이후 같은 키로 재정의되므로 edge config의 기본 콜백을 덮어쓴다.

#### A-3-3. `src/server/auth/index.ts` (변경 없음)

기존 파일을 그대로 유지한다. `authMiddleware` export는 불필요하다.

```typescript
// 변경 없음 — 기존 코드 유지
import NextAuth from "next-auth";
import { cache } from "react";

import { authConfig } from "./config";

const { auth: uncachedAuth, handlers, signIn, signOut } = NextAuth(authConfig);

const auth = cache(uncachedAuth);

export { auth, handlers, signIn, signOut };
```

---

### A-4. `src/middleware.ts` 생성

**파일**: `src/middleware.ts` (신규 생성)

```typescript
import NextAuth from "next-auth";
import { authConfigEdge } from "~/server/auth/config.edge";

export default NextAuth(authConfigEdge).auth;

export const config = {
  matcher: ["/dashboard/:path*", "/login", "/signup"],
};
```

**설계 근거**:
- `authConfigEdge`만 import하므로 Prisma/DB 의존성이 Edge Runtime에 유입되지 않는다
- `NextAuth(authConfigEdge).auth`가 미들웨어 함수를 반환하며, `authorized` 콜백에서 인증/리다이렉트 로직을 처리한다
- 인증 로직이 `config.edge.ts`의 `authorized` 콜백에 집중되어 있어 미들웨어 파일은 최소한으로 유지된다

**검증 방법**: `npm run typecheck`로 타입 에러 없는지 확인

**주의 사항**:
- `matcher`를 명시적으로 지정하여 미들웨어 실행 경로를 최소화한다
- API 라우트(`/api/*`), 정적 자산(`/_next/*`), 공개 페이지(`/`, `/pricing`)에는 미들웨어가 실행되지 않는다
- Edge Runtime에서 `console.log`는 동작하지만, Node.js 전용 API(`fs`, `path` 등)는 사용할 수 없다

---

### A-5. `next.config.js` 보안 헤더 추가

**파일**: `next.config.js` (기존 파일 수정)

**수정 후** (전체 파일):
```javascript
import "./src/env.js";

/** @type {import("next").NextConfig} */
const config = {
  serverExternalPackages: ["@prisma/adapter-neon"],
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "lh3.googleusercontent.com",
        pathname: "/**",
      },
    ],
  },
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: [
          {
            key: "X-Frame-Options",
            value: "DENY",
          },
          {
            key: "X-Content-Type-Options",
            value: "nosniff",
          },
          {
            key: "Referrer-Policy",
            value: "strict-origin-when-cross-origin",
          },
          {
            key: "Permissions-Policy",
            value: "camera=(), microphone=(), geolocation=(), browsing-topics=()",
          },
          {
            key: "Strict-Transport-Security",
            value: "max-age=63072000; includeSubDomains; preload",
          },
          {
            key: "X-DNS-Prefetch-Control",
            value: "on",
          },
          {
            key: "Content-Security-Policy",
            value: [
              "default-src 'self'",
              "script-src 'self' 'unsafe-inline'",
              "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
              "font-src 'self' https://fonts.gstatic.com",
              "img-src 'self' data: blob: https://lh3.googleusercontent.com https://*.amazonaws.com",
              "media-src 'self' https://*.amazonaws.com",
              "connect-src 'self' https://*.amazonaws.com https://*.neon.tech https://*.inngest.com https://*.polar.sh",
              "frame-src 'self' https://checkout.polar.sh https://sandbox.polar.sh",
              "frame-ancestors 'none'",
              "base-uri 'self'",
              "form-action 'self'",
            ].join("; "),
          },
        ],
      },
    ];
  },
};

export default config;
```

**변경 사항**: `async headers()` 메서드 추가 (보안 헤더 7개 + CSP)

**CSP 배포 전략 (권장)**:
1. **첫 배포 시**: `Content-Security-Policy` 대신 `Content-Security-Policy-Report-Only` 헤더명을 사용하여, 차단 없이 위반만 브라우저 콘솔에 보고
2. **1-2주 모니터링 후**: 위반 사항이 없으면 `Content-Security-Policy`로 전환하여 실제 차단 적용
3. **CloudFront 도입 시**: `media-src`와 `img-src`에 CloudFront 도메인 추가 (예: `https://cdn.podcastclipper.com`)

**⚠️ 로컬 개발 환경 주의사항**:
- 위 CSP는 Next.js의 `headers()` 설정이므로 `npm run dev`에서도 적용된다
- Next.js dev 모드는 HMR(Hot Module Replacement)을 위해 `eval()`과 WebSocket(`ws://localhost:*`)을 사용한다
- CSP가 개발 환경을 방해할 경우, 환경별 분기를 추가한다:

```javascript
async headers() {
  // 개발 환경에서는 CSP를 적용하지 않음
  if (process.env.NODE_ENV === "development") return [];
  return [/* ... 위의 headers 배열 ... */];
},
```

---

### A-6. 에러 바운더리 파일 생성

#### A-6-1. `src/app/global-error.tsx` (신규 생성)

루트 레이아웃(`layout.tsx`) 자체의 에러를 캐치한다. `<html>`, `<body>` 태그를 직접 포함해야 한다.

```tsx
"use client";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <html>
      <body>
        <div style={{ padding: "2rem", textAlign: "center" }}>
          <h1>Something went wrong</h1>
          <p>An unexpected error occurred. Please try again.</p>
          <button onClick={reset}>Try again</button>
        </div>
      </body>
    </html>
  );
}
```

#### A-6-2. `src/app/not-found.tsx` (신규 생성)

```tsx
import Link from "next/link";

export default function NotFound() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center">
      <h1 className="text-4xl font-bold">404</h1>
      <p className="mt-2 text-muted-foreground">Page not found</p>
      <Link href="/" className="mt-4 underline">
        Go back home
      </Link>
    </div>
  );
}
```

#### A-6-3. `src/app/error.tsx` (신규 생성)

```tsx
"use client";

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-4">
      <h1 className="text-2xl font-bold">Something went wrong</h1>
      <p className="text-muted-foreground">
        {error.message || "An unexpected error occurred."}
      </p>
      <button
        onClick={reset}
        className="rounded bg-primary px-4 py-2 text-primary-foreground"
      >
        Try again
      </button>
    </div>
  );
}
```

#### A-6-4. `src/app/dashboard/error.tsx` (신규 생성)

대시보드 레이아웃 내에서 렌더링되므로 대시보드 내비게이션을 유지할 수 있다.

```tsx
"use client";

export default function DashboardError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div className="flex min-h-[50vh] flex-col items-center justify-center gap-4">
      <h1 className="text-2xl font-bold">Something went wrong</h1>
      <p className="text-muted-foreground">
        {error.message || "An unexpected error occurred."}
      </p>
      <button
        onClick={reset}
        className="rounded bg-primary px-4 py-2 text-primary-foreground"
      >
        Try again
      </button>
    </div>
  );
}
```

> **참고**: `min-h-[50vh]`를 사용하여 대시보드 레이아웃 내에서 적절한 높이를 유지한다 (`min-h-screen`은 레이아웃 밖에서 사용).

---

### A-7. Health Check 엔드포인트 생성

**파일**: `src/app/api/health/route.ts` (신규 생성)

```typescript
import { db } from "~/server/db";

export const dynamic = "force-dynamic";

export async function GET() {
  const checks: Record<string, "ok" | "error"> = {};

  try {
    await db.$queryRaw`SELECT 1`;
    checks.database = "ok";
  } catch {
    checks.database = "error";
  }

  const allOk = Object.values(checks).every((v) => v === "ok");

  return Response.json(
    { status: allOk ? "healthy" : "degraded", checks },
    { status: allOk ? 200 : 503 },
  );
}
```

**용도**: 서비스 상태를 확인하는 엔드포인트. 배포 후 DB 연결 등 핵심 의존성이 정상인지 빠르게 검증할 수 있다

---

### A-8. `src/env.js` 환경 변수 스키마 추가

**파일**: `src/env.js` (기존 파일 수정)

**추가할 server 변수** (`server: {` 블록 내):

```typescript
// Inngest (Vercel Integration이 자동 주입, 로컬에서는 불필요)
INNGEST_EVENT_KEY: z.string().optional(),
INNGEST_SIGNING_KEY: z.string().optional(),

// CloudFront CDN (선택)
CLOUDFRONT_DOMAIN: z.string().optional(),
CLOUDFRONT_KEY_PAIR_ID: z.string().optional(),
CLOUDFRONT_PRIVATE_KEY: z.string().optional(),

// NextAuth Production URL
AUTH_URL: z.string().url().optional(),
```

**추가할 runtimeEnv 매핑** (`runtimeEnv: {` 블록 내):

```typescript
INNGEST_EVENT_KEY: process.env.INNGEST_EVENT_KEY,
INNGEST_SIGNING_KEY: process.env.INNGEST_SIGNING_KEY,
CLOUDFRONT_DOMAIN: process.env.CLOUDFRONT_DOMAIN,
CLOUDFRONT_KEY_PAIR_ID: process.env.CLOUDFRONT_KEY_PAIR_ID,
CLOUDFRONT_PRIVATE_KEY: process.env.CLOUDFRONT_PRIVATE_KEY,
AUTH_URL: process.env.AUTH_URL,
```

**주의**: 모든 신규 변수는 `optional()`로 설정한다. 로컬 개발 환경에서는 이 변수들이 없어도 빌드가 가능해야 한다.

---

### A-9. `src/inngest/functions.ts` 프로덕션 설정 강화

**파일**: `src/inngest/functions.ts` (기존 파일 수정)

**변경 1**: function config에서 `retries` 이동 및 `cancelOn` 추가

현재:
```typescript
export const processVideo = inngest.createFunction(
  { id: "process-video" },
  {
    event: "process-video-events",
    retries: 1,
    concurrency: {
      limit: 1,
      key: "event.data.userId",
    },
  },
  // ...
```

수정 후:
```typescript
export const processVideo = inngest.createFunction(
  {
    id: "process-video",
    retries: 3,
    cancelOn: [
      {
        event: "process-video-events/cancel",
        match: "data.uploadedFileId",
      },
    ],
  },
  {
    event: "process-video-events",
    concurrency: {
      limit: 1,
      key: "event.data.userId",
    },
  },
  // ...
```

**변경 근거**:
- `retries`는 Inngest SDK에서 function config(1번째 인자)에 위치해야 한다. 현재 코드는 trigger config(2번째 인자)에 잘못 배치되어 있음
- `retries: 1` → `retries: 3`: 네트워크 일시 장애나 Modal 엔드포인트 불안정에 대비
- `cancelOn`: 사용자가 동일 파일의 처리를 다시 요청하면 진행 중인 함수를 취소할 수 있다

> **참고**: `cancelOn`의 cancel 이벤트(`process-video-events/cancel`)를 실제로 발송하는 코드는 별도로 구현해야 한다. 예를 들어, 업로드 삭제 server action에서 `inngest.send({ name: "process-video-events/cancel", data: { uploadedFileId } })`를 호출한다. 당장 구현하지 않아도 설정 자체는 무해하다.

**변경 2**: catch 블록에서 `throw error` 추가

현재의 catch 블록은 에러를 삼키고(`catch {`) 상태만 `"failed"`로 변경한다. 에러 변수를 캡처하고 `throw`하도록 수정한다:
- Inngest 대시보드에서 실패 원인(스택 트레이스) 확인 가능
- 설정된 retries 횟수만큼 자동 재시도 트리거

현재:
```typescript
} catch {
  await db.uploadedFile.update({
    where: { id: uploadedFileId },
    data: { status: "failed" },
  });
}
```

수정 후:
```typescript
} catch (error) {
  await db.uploadedFile.update({
    where: { id: uploadedFileId },
    data: { status: "failed" },
  });
  throw error; // Inngest에 에러를 다시 throw → 재시도 및 로그 기록
}
```

> **⚠️ 재시도와 상태 관리**: `throw error` 후 Inngest가 재시도할 때 `status: "failed"` 상태의 레코드가 다시 `"processing"`으로 변경된다 (step `set-status-processing`에서). 따라서 최종 실패(모든 재시도 소진)와 중간 실패를 구분하려면, 추후 Inngest의 `onFailure` 핸들러를 추가하여 최종 실패 시에만 `"failed"` 상태를 설정하는 것을 권장한다.

---

### A-10. `.env.example` 업데이트

**파일**: `.env.example` (기존 파일 수정)

**수정 후** (전체 파일):
```bash
# Auth
AUTH_SECRET=""
AUTH_GOOGLE_ID=""
AUTH_GOOGLE_SECRET=""
AUTH_URL=""                          # Production: https://podcastclipper.com

# Database (Neon)
DATABASE_URL=""
DATABASE_URL_UNPOOLED=""

# AWS S3
AWS_ACCESS_KEY_ID=""
AWS_SECRET_ACCESS_KEY=""
AWS_REGION=""
S3_BUCKET_NAME=""

# CloudFront CDN (선택, PEM 키는 base64 인코딩)
CLOUDFRONT_DOMAIN=""
CLOUDFRONT_KEY_PAIR_ID=""
CLOUDFRONT_PRIVATE_KEY=""

# Video Processing
PROCESS_VIDEO_ENDPOINT=""
PROCESS_VIDEO_ENDPOINT_AUTH=""

# Inngest (Vercel Integration 사용 시 자동 주입됨)
INNGEST_EVENT_KEY=""
INNGEST_SIGNING_KEY=""

# Polar Payment
# Sandbox: sandbox.polar.sh에서 발급 | Production: polar.sh에서 발급
POLAR_ACCESS_TOKEN="polar_pat_..."
POLAR_WEBHOOK_SECRET="whsec_..."
# "sandbox" 또는 "production" (미설정 시 NODE_ENV 기반 자동 결정)
POLAR_SERVER="sandbox"

# Public
NEXT_PUBLIC_SITE_URL="http://localhost:3000"
```

---

### A-11. 코드 변경 검증

모든 코드 변경을 완료한 후, 다음 명령으로 검증한다:

```bash
# 타입 체크 + 린트
npm run check

# 로컬 빌드 테스트
npm run build

# 로컬 서버 실행 후 수동 테스트
npm run dev
```

**검증 체크리스트**:
- [ ] `npm run check` 통과
- [ ] `npm run build` 성공 (Edge Runtime 관련 에러 없음)
- [ ] 로컬에서 `/dashboard` 접근 시 미인증이면 `/login?callbackUrl=...`으로 리다이렉트
- [ ] 로컬에서 `/login` 접근 시 인증 상태면 `/dashboard`로 리다이렉트
- [ ] 존재하지 않는 경로 접근 시 404 페이지 표시
- [ ] `/api/health` 접근 시 `{ status: "healthy", checks: { database: "ok" } }` 응답
- [ ] 기존 기능(업로드, 클립 재생, 로그인/회원가입) 정상 동작
- [ ] 브라우저 콘솔에 CSP 위반 경고가 없음 (개발 환경 CSP 분기 적용 시)

**모든 검증이 통과되면 Git 커밋**:
```bash
git add .
git commit -m "feat: vercel deployment infrastructure setup"
```

---

## Phase B: Vercel 대시보드 설정

### B-1. Vercel 프로젝트 생성

1. [vercel.com](https://vercel.com)에 로그인 (GitHub 계정 연동 권장)
2. **"Add New..."** > **"Project"** 클릭
3. **"Import Git Repository"** 에서 GitHub 저장소 선택:
   - Repository: `ApcH/ai-podcast-clipper-frontend` (또는 실제 저장소명)
4. 프로젝트 설정:

| 항목 | 값 | 비고 |
|------|-----|------|
| Project Name | `ai-podcast-clipper` | 원하는 이름 |
| Framework Preset | `Next.js` | 자동 감지됨 |
| Root Directory | `./` | 모노레포가 아니면 기본값 |
| Build Command | `npm run build` | 기본값 사용 |
| Install Command | `npm install` | postinstall에서 `prisma generate` 자동 실행 |
| Output Directory | `.next` | 기본값 사용 |

5. **아직 "Deploy" 버튼을 누르지 않는다** - 환경 변수를 먼저 설정해야 한다

---

### B-2. Node.js 버전 설정

1. Vercel 대시보드 > **Settings** > **General**
2. **Node.js Version** 항목에서 `20.x` 선택

> **주의**: Node.js 20.x가 현재 프로젝트의 안정 버전이다. `package.json`의 `packageManager: "npm@10.9.2"`와 호환된다.

---

### B-3. Production 환경 변수 설정

Vercel 대시보드 > **Settings** > **Environment Variables**에서 설정한다.

**Environment 선택: Production**

각 변수를 아래 표에 따라 입력한다:

| 변수명 | 값 | 발급처 |
|--------|-----|--------|
| `AUTH_SECRET` | `openssl rand -base64 32`로 생성 | 로컬 터미널에서 생성 |
| `AUTH_GOOGLE_ID` | Google OAuth Client ID | [Google Cloud Console](https://console.cloud.google.com) > APIs & Services > Credentials |
| `AUTH_GOOGLE_SECRET` | Google OAuth Client Secret | 위와 동일 |
| `AUTH_URL` | `https://podcastclipper.com` | 프로덕션 도메인 (D-1에서 설정) |
| `DATABASE_URL` | `postgresql://...@neon.tech/neondb?sslmode=require` | Neon 대시보드 > Connection Details (Pooled) |
| `DATABASE_URL_UNPOOLED` | `postgresql://...@neon.tech/neondb?sslmode=require` | Neon 대시보드 > Connection Details (Direct) |
| `AWS_ACCESS_KEY_ID` | AWS IAM Access Key | AWS IAM Console |
| `AWS_SECRET_ACCESS_KEY` | AWS IAM Secret Key | AWS IAM Console |
| `AWS_REGION` | `ap-northeast-2` (서울) | AWS 리전 코드 |
| `S3_BUCKET_NAME` | 버킷 이름 | AWS S3 Console |
| `PROCESS_VIDEO_ENDPOINT` | Modal 엔드포인트 URL | Modal 대시보드 |
| `PROCESS_VIDEO_ENDPOINT_AUTH` | Modal 인증 토큰 | Modal 대시보드 |
| `POLAR_ACCESS_TOKEN` | Polar Production 토큰 | [polar.sh](https://polar.sh) > Settings > API Tokens |
| `POLAR_WEBHOOK_SECRET` | Polar Webhook Secret | polar.sh > Settings > Webhooks |
| `POLAR_SERVER` | `production` | 고정값 |
| `NEXT_PUBLIC_SITE_URL` | `https://podcastclipper.com` | 프로덕션 도메인 |

> **Google OAuth 프로덕션 설정**: Google Cloud Console에서 OAuth 동의 화면의 Authorized redirect URIs에 `https://podcastclipper.com/api/auth/callback/google`을 추가해야 한다.

> **Polar 프로덕션 설정**: polar.sh에서 Webhook URL을 `https://podcastclipper.com/api/webhooks/polar`로 설정해야 한다.

---

### B-4. Preview 환경 변수 설정

**Environment 선택: Preview**

Production과 대부분 동일하되, 다음 변수만 다르게 설정한다:

| 변수명 | Preview 값 | 비고 |
|--------|------------|------|
| `AUTH_SECRET` | 별도 생성 (`openssl rand -base64 32`) | Production과 다른 값 사용 |
| `AUTH_URL` | (설정하지 않음) | Vercel이 Preview URL을 자동 사용 |
| `DATABASE_URL` | Neon **preview** 브랜치의 Connection String | C-2에서 생성 |
| `DATABASE_URL_UNPOOLED` | Neon **preview** 브랜치의 Direct Connection String | C-2에서 생성 |
| `POLAR_ACCESS_TOKEN` | Sandbox 토큰 | [sandbox.polar.sh](https://sandbox.polar.sh) > Settings > API Tokens |
| `POLAR_WEBHOOK_SECRET` | Sandbox Webhook Secret | sandbox.polar.sh > Settings > Webhooks |
| `POLAR_SERVER` | `sandbox` | 고정값 |
| `NEXT_PUBLIC_SITE_URL` | (설정하지 않음) | Vercel Preview URL을 사용 |

나머지 변수(AWS, PROCESS_VIDEO_ENDPOINT 등)는 Production과 동일한 값을 사용한다.

---

### B-5. 첫 배포 실행

1. 환경 변수 설정이 완료되면 **"Deploy"** 버튼 클릭
2. 또는 Phase A에서 커밋한 코드를 `main` 브랜치에 push하면 자동 배포됨

**배포 실패 시 확인 사항**:
- Vercel 빌드 로그에서 에러 메시지 확인
- 환경 변수 누락 여부 확인 (`src/env.js`의 Zod 검증이 빌드 시 실행됨)
- `prisma generate`가 postinstall에서 실행되는지 확인

---

### B-6. 배포 후 검증

첫 배포가 성공하면 다음을 확인한다:

**검증 체크리스트**:
- [ ] `https://<project-name>.vercel.app` 접속 가능
- [ ] `/api/health` 응답: `{ status: "healthy" }`
- [ ] `/login` 페이지 정상 렌더링
- [ ] Google OAuth 로그인 정상 동작
- [ ] Credentials 로그인 정상 동작
- [ ] `/dashboard` 미인증 접근 시 `/login`으로 리다이렉트
- [ ] 브라우저 개발자 도구 > Network에서 응답 헤더 확인:
  - `X-Frame-Options: DENY`
  - `X-Content-Type-Options: nosniff`
  - `Strict-Transport-Security` 존재
  - `Content-Security-Policy` (또는 `Content-Security-Policy-Report-Only`) 존재
- [ ] 클립 업로드 및 재생 정상 동작
- [ ] CSP 위반이 브라우저 콘솔에 나타나지 않는지 확인

---

## Phase C: 외부 서비스 연동

### C-1. Inngest Vercel Integration 연결

Inngest Cloud 키를 수동으로 발급받는 대신, **Vercel Marketplace의 Inngest Integration**을 사용한다. Integration이 `INNGEST_EVENT_KEY`와 `INNGEST_SIGNING_KEY`를 자동으로 Vercel 환경 변수에 주입하고, 배포 시 자동으로 Inngest Cloud와 앱을 동기화한다.

**설정 순서**:

1. Vercel 대시보드 > **Integrations** > **Browse Marketplace**
2. **"Inngest"** 검색 > **"Add Integration"** 클릭
3. Vercel 프로젝트 선택 (ai-podcast-clipper)
4. Inngest 계정 로그인 (또는 신규 생성)
5. Inngest 앱과 Vercel 프로젝트 연결 확인

**Integration 완료 후 자동으로 발생하는 일**:
- `INNGEST_EVENT_KEY`와 `INNGEST_SIGNING_KEY`가 Vercel 환경 변수에 자동 추가됨
- 매 배포 시 Inngest Cloud가 앱의 function 목록을 자동 동기화
- Inngest 대시보드([app.inngest.com](https://app.inngest.com))에서 이벤트, 함수 실행 로그, 재시도 현황을 모니터링 가능

**검증**:
- Vercel 대시보드 > Settings > Environment Variables에서 `INNGEST_EVENT_KEY`, `INNGEST_SIGNING_KEY`가 자동 추가되었는지 확인
- 재배포 후 [app.inngest.com](https://app.inngest.com)에서 `process-video` function이 동기화되었는지 확인

> **참고**: Integration 설치 후에는 수동으로 키를 관리할 필요가 없다. 키 로테이션도 Integration이 자동 처리한다.

---

### C-2. Neon DB 브랜칭

Preview 환경이 Production DB에 영향을 주지 않도록, Neon의 브랜칭 기능을 활용하여 환경별 DB를 격리한다.

**설정 순서**:

1. [console.neon.tech](https://console.neon.tech)에 로그인
2. 프로젝트 선택
3. **Branches** 탭 클릭

#### Preview 브랜치 생성:
1. **"Create Branch"** 클릭
2. **Parent branch**: `main` 선택
3. **Branch name**: `preview` 입력
4. **Include data up to**: Current (현재 데이터 스냅샷 포함)
5. **"Create Branch"** 클릭
6. 생성된 브랜치의 **Connection Details**에서 Pooled/Direct Connection String 복사
7. Vercel **Preview** 환경 변수의 `DATABASE_URL`, `DATABASE_URL_UNPOOLED`에 설정

#### Dev 브랜치 생성 (선택):
1. 동일하게 `dev` 브랜치를 `main`에서 분기
2. 로컬 `.env` 파일의 `DATABASE_URL`에 dev 브랜치 Connection String 설정

**브랜치별 용도**:

| Neon 브랜치 | 용도 | 스키마 변경 |
|------------|------|------------|
| `main` | Production | `npm run db:migrate`로 마이그레이션 적용 |
| `preview` | PR 테스트 | Production 스냅샷 기반, 자유롭게 테스트 |
| `dev` | 로컬 개발 | `npm run db:push`로 자유롭게 스키마 변경 |

---

## Phase D: 도메인 & CDN

### D-1. Vercel 도메인 설정

**전제 조건**: 도메인(`podcastclipper.com` 등)을 도메인 등록업체에서 구매한 상태여야 한다.

**설정 순서**:

1. Vercel 대시보드 > **Settings** > **Domains**
2. **"Add Domain"** 클릭
3. 도메인 입력: `podcastclipper.com`
4. Vercel이 안내하는 DNS 레코드를 도메인 등록업체에서 설정:

| 타입 | 이름 | 값 | 용도 |
|------|------|-----|------|
| A | `@` | `76.76.21.21` | 루트 도메인 |
| CNAME | `www` | `cname.vercel-dns.com` | www 서브도메인 |

5. `www.podcastclipper.com`도 추가하고, 루트 도메인으로 리다이렉트 설정
6. DNS 전파 대기 (최대 48시간, 보통 수 분 ~ 수 시간)
7. Vercel이 **Let's Encrypt** SSL 인증서를 자동 발급/갱신

**설정 후 환경 변수 업데이트**:
- Production 환경: `AUTH_URL` = `https://podcastclipper.com`
- Production 환경: `NEXT_PUBLIC_SITE_URL` = `https://podcastclipper.com`

**외부 서비스 콜백 URL 업데이트**:
- Google Cloud Console: OAuth redirect URI에 `https://podcastclipper.com/api/auth/callback/google` 추가
- Polar: Webhook URL을 `https://podcastclipper.com/api/webhooks/polar`로 변경
- Inngest: Integration이 자동으로 새 도메인을 감지함

**검증**:
- [ ] `https://podcastclipper.com` 접속 가능
- [ ] `https://www.podcastclipper.com` -> `https://podcastclipper.com`으로 리다이렉트
- [ ] SSL 인증서 유효 (브라우저 자물쇠 아이콘 확인)

---

### D-2. CloudFront CDN 설정

> 이 작업은 **선택 사항**이다. S3 presigned URL로도 서비스 운영이 가능하며, 사용자 규모가 커지면 CDN을 도입한다.

#### D-2-1. CloudFront 배포 생성

1. AWS Console > **CloudFront** > **Create Distribution**
2. 설정:

| 항목 | 값 | 비고 |
|------|-----|------|
| Origin Domain | `{S3_BUCKET_NAME}.s3.{AWS_REGION}.amazonaws.com` | S3 버킷 |
| Origin Access | **OAC (Origin Access Control)** 생성 | OAI 대신 최신 방식 사용 |
| Viewer Protocol Policy | Redirect HTTP to HTTPS | |
| Allowed HTTP Methods | GET, HEAD | 읽기 전용 |
| Cache Policy | CachingOptimized | 클립 파일은 불변이므로 장기 캐싱 |
| Price Class | PriceClass_200 | 아시아 포함 |
| Alternate Domain | `cdn.podcastclipper.com` | |

#### D-2-2. S3 버킷 정책 업데이트

CloudFront OAC 설정 후 S3 버킷 정책을 업데이트:

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Principal": {
        "Service": "cloudfront.amazonaws.com"
      },
      "Action": "s3:GetObject",
      "Resource": "arn:aws:s3:::YOUR_BUCKET_NAME/*",
      "Condition": {
        "StringEquals": {
          "AWS:SourceArn": "arn:aws:cloudfront::YOUR_ACCOUNT_ID:distribution/YOUR_DISTRIBUTION_ID"
        }
      }
    }
  ]
}
```

#### D-2-3. CloudFront Key Pair 생성

Signed URL을 위한 키 페어를 생성한다:

1. AWS Console > **CloudFront** > **Public keys**
2. **"Create public key"** 클릭
3. 로컬에서 RSA 키 페어 생성:
   ```bash
   openssl genrsa -out private_key.pem 2048
   openssl rsa -pubout -in private_key.pem -out public_key.pem
   ```
4. `public_key.pem` 내용을 복사하여 AWS에 등록
5. **Key Groups** > **"Create key group"** > 방금 생성한 Public Key를 추가
6. CloudFront Distribution > **Behaviors** > Default > **Restrict viewer access**: Yes, Key Group 선택

#### D-2-4. 환경 변수 등록

Private Key를 base64 인코딩하여 환경 변수에 저장:

```bash
# PEM 키를 base64 인코딩
cat private_key.pem | base64 -w 0
# 출력된 값을 CLOUDFRONT_PRIVATE_KEY에 저장
```

Vercel **Production** 환경 변수에 추가:
- `CLOUDFRONT_DOMAIN` = `cdn.podcastclipper.com`
- `CLOUDFRONT_KEY_PAIR_ID` = AWS에서 생성한 Key Pair ID
- `CLOUDFRONT_PRIVATE_KEY` = base64 인코딩된 PEM 키

#### D-2-5. CDN 도메인 SSL 인증서

1. AWS Console > **ACM (Certificate Manager)** (반드시 **us-east-1** 리전)
2. **"Request certificate"** > Public certificate
3. Domain name: `cdn.podcastclipper.com`
4. DNS 검증 선택 > 안내된 CNAME 레코드를 도메인 등록업체에서 설정
5. 인증서 발급 완료 후 CloudFront Distribution에서 해당 인증서 선택

#### D-2-6. CDN 도메인 DNS 설정

도메인 등록업체에서:

| 타입 | 이름 | 값 |
|------|------|-----|
| CNAME | `cdn` | `{distribution-id}.cloudfront.net` |

#### D-2-7. 코드 변경

CloudFront 유틸리티 파일 생성과 `generation.ts` 수정이 필요하다.

**신규 파일**: `src/fsd/shared/lib/cloudfront.ts`

```typescript
import { env } from "~/env";

/**
 * CloudFront Signed URL을 생성한다.
 * 환경 변수가 설정되지 않은 경우 null을 반환하여 S3 fallback을 유도한다.
 */
export async function getCloudFrontSignedUrl(
  s3Key: string,
  expiresInSeconds = 3600,
): Promise<string | null> {
  const domain = env.CLOUDFRONT_DOMAIN;
  const keyPairId = env.CLOUDFRONT_KEY_PAIR_ID;
  const privateKeyBase64 = env.CLOUDFRONT_PRIVATE_KEY;

  if (!domain || !keyPairId || !privateKeyBase64) {
    return null; // CloudFront 미설정 → S3 presigned URL로 fallback
  }

  // @aws-sdk/cloudfront-signer 사용
  const { getSignedUrl } = await import("@aws-sdk/cloudfront-signer");

  const privateKey = Buffer.from(privateKeyBase64, "base64").toString("utf-8");
  const url = `https://${domain}/${s3Key}`;
  const dateLessThan = new Date(
    Date.now() + expiresInSeconds * 1000,
  ).toISOString();

  return getSignedUrl({
    url,
    keyPairId,
    dateLessThan,
    privateKey,
  });
}
```

> **참고**: `@aws-sdk/cloudfront-signer` 패키지를 devDependencies에 추가해야 한다: `npm install @aws-sdk/cloudfront-signer`

**수정 파일**: `src/actions/generation.ts` (CloudFront 우선, S3 fallback 패턴)

클립 URL 생성 로직에서 CloudFront signed URL을 우선 시도하고, 실패 시 기존 S3 presigned URL로 fallback한다:

```typescript
import { getCloudFrontSignedUrl } from "~/fsd/shared/lib/cloudfront";

// 기존 getClipUrl 함수 내부에서:
const cloudFrontUrl = await getCloudFrontSignedUrl(clip.s3Key);
if (cloudFrontUrl) {
  return cloudFrontUrl;
}
// 기존 S3 presigned URL 로직 (fallback)
```

**CSP 업데이트**: `next.config.js`의 CSP에 CloudFront 도메인 추가:
```
media-src 'self' https://*.amazonaws.com https://cdn.podcastclipper.com
img-src 'self' data: blob: https://lh3.googleusercontent.com https://*.amazonaws.com https://cdn.podcastclipper.com
```

#### D-2-8. CloudFront 검증

- [ ] `https://cdn.podcastclipper.com` 접속 가능
- [ ] SSL 인증서 유효
- [ ] 클립 재생이 CloudFront URL을 통해 정상 동작
- [ ] S3 직접 접근이 차단되고 CloudFront를 통해서만 접근 가능

---

## 전체 작업 체크리스트

### Phase A: 코드 변경

- [ ] A-1. `vercel.json` 생성
- [ ] A-2-1. `src/app/api/inngest/route.ts`에 `maxDuration = 10` 추가
- [ ] A-2-2. `src/app/api/webhooks/polar/route.ts`에 `maxDuration = 10` 추가
- [ ] A-3-1. `src/server/auth/config.edge.ts` 생성 (Edge-safe 인증 설정)
- [ ] A-3-2. `src/server/auth/config.ts` 수정 (edge config 확장)
- [ ] A-4. `src/middleware.ts` 생성 (edge config 사용)
- [ ] A-5. `next.config.js`에 보안 헤더 + CSP 추가
- [ ] A-6-1. `src/app/global-error.tsx` 생성
- [ ] A-6-2. `src/app/not-found.tsx` 생성
- [ ] A-6-3. `src/app/error.tsx` 생성
- [ ] A-6-4. `src/app/dashboard/error.tsx` 생성
- [ ] A-7. `src/app/api/health/route.ts` 생성
- [ ] A-8. `src/env.js` 환경 변수 스키마 추가
- [ ] A-9. `src/inngest/functions.ts` retries/cancelOn/throw error 수정
- [ ] A-10. `.env.example` 업데이트
- [ ] A-11. `npm run check` && `npm run build` 통과

### Phase B: Vercel 대시보드

- [ ] B-1. Vercel 프로젝트 생성 + GitHub 연동
- [ ] B-2. Node.js 20.x 설정
- [ ] B-3. Production 환경 변수 설정
- [ ] B-4. Preview 환경 변수 설정
- [ ] B-5. 첫 배포 실행
- [ ] B-6. 배포 후 검증

### Phase C: 외부 서비스

- [ ] C-1. Inngest Vercel Integration 연결
- [ ] C-2. Neon DB Preview/Dev 브랜치 생성

### Phase D: 도메인 & CDN

- [ ] D-1. Vercel 도메인 + DNS + SSL 설정
- [ ] D-2. CloudFront CDN 설정 (선택)

---

## 비용 참고

| 서비스 | 플랜 | 월 비용 | 비고 |
|--------|------|---------|------|
| Vercel | Hobby | $0 | Function 타임아웃 10초 제한, 상업 이용 시 Pro($20/월) 필요 |
| Neon | Free | $0 | 0.5GB, 무제한 브랜치 |
| Inngest Cloud | Free | $0 | 25K 이벤트/월 |
| CloudFront | Free Tier | $0 | 1TB/월 (12개월) |
| **MVP 합계** | | **$0/월** | |

> **Hobby 플랜 주요 제한 사항**:
> - Serverless Function 실행 시간: 최대 **10초** (Pro: 300초)
> - 대역폭: 100GB/월 (Pro: 1TB/월)
> - 이미지 최적화: 1,000회/월 (Pro: 5,000회/월)
> - 상업적 목적 사용 불가 (수익 발생 시 Pro 전환 필수)
> - 팀 기능 없음 (1인 개발 전용)
>
> **Pro 전환 시점 권장**: 유료 사용자가 발생하거나, Modal 엔드포인트 타임아웃이 빈번해질 때
