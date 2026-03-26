# 배포 인프라 구현 제안서

> 작성일: 2026-03-25
> 프로젝트: AI Podcast Clipper Frontend (Next.js 15 / T3 Stack)
> 범위: 배포 인프라 전반 (CI/CD 파이프라인, Dockerfile 제외)

---

## 1. 개요

### 1.1 목적

`saas-deployment-checklist.md`의 "배포 인프라 구성" 항목을 중심으로, 프로덕션 SaaS 서비스 운영에 필요한 인프라를 구축한다. CI/CD 파이프라인과 Dockerfile은 본 제안서의 범위에서 제외한다.

### 1.2 현재 상태

| 항목 | 상태 | 비고 |
|------|------|------|
| 배포 플랫폼 | 미설정 | `vercel.json` 부재 |
| 보안 헤더 | 미설정 | `next.config.js`에 headers 없음 |
| 에러 바운더리 | 없음 | `error.tsx`, `not-found.tsx`, `global-error.tsx` 0개 |
| Inngest 프로덕션 | 불충분 | `retries: 1`, backoff 없음, 타임아웃 없음 |
| CDN | 없음 | S3 presigned URL 직접 접근 |
| 모니터링 | 없음 | `console.log`만 사용 |
| 미들웨어 | 없음 | `src/middleware.ts` 부재 |
| 환경 분리 | 부분적 | `src/env.js` Zod 검증 존재, 환경별 분리 미구현 |
| DB | PostgreSQL (Neon) | 마이그레이션 완료 |
| 결제 | Polar 통합 완료 | Webhook, Subscription/Order 모델 구현됨 |
| 인증 | Credentials + Google OAuth | NextAuth.js 5 (beta) |

### 1.3 구현 범위

본 제안서는 다음 9개 영역을 다룬다:

| # | 영역 | 우선순위 | 예상 공수 |
|---|------|----------|-----------|
| 1 | Vercel 배포 플랫폼 설정 | CRITICAL | 0.5일 |
| 2 | 환경 분리 전략 | CRITICAL | 0.5일 |
| 3 | 보안 헤더 설정 | CRITICAL | 0.5일 |
| 4 | 에러 바운더리 구현 | CRITICAL | 1일 |
| 5 | 미들웨어 구현 | HIGH | 0.5일 |
| 6 | Inngest 프로덕션 설정 | HIGH | 0.5일 |
| 7 | 모니터링 인프라 (Sentry + Health Check) | HIGH | 1일 |
| 8 | CDN 구성 (CloudFront) | HIGH | 1일 |
| 9 | 도메인 & SSL | MEDIUM | 0.5일 |
| **합계** | | | **5.5일** |

---

## 2. Vercel 배포 플랫폼 설정

### 2.1 배경

Next.js 15 프로젝트에 가장 적합한 배포 플랫폼은 Vercel이다. Server Components, Server Actions, ISR, Middleware 등 Next.js 고유 기능을 네이티브로 지원하며, 별도의 서버 관리가 불필요하다.

### 2.2 vercel.json 구성

```jsonc
// vercel.json (프로젝트 루트)
{
  "$schema": "https://openapi.vercel.sh/vercel.json",
  "framework": "nextjs",
  "regions": ["icn1"]
}
```

**설정 근거:**

| 항목 | 값 | 이유 |
|------|-----|------|
| `regions` | `icn1` (서울) | 한국 사용자 대상 서비스, 최소 지연시간 확보 |

### 2.2.1 Route Segment Config으로 Function 타임아웃 설정

Next.js App Router에서는 `vercel.json`의 `functions` 대신 각 route 파일 내 **Route Segment Config**를 사용하는 것이 Vercel 공식 권장 방식이다. `vercel.json`의 `functions` 경로 매칭은 App Router의 `src/app/` 경로와 정확히 매핑되지 않을 수 있다.

```typescript
// src/app/api/inngest/route.ts - 상단에 추가
export const maxDuration = 300; // 영상 처리 워크플로우가 긴 실행 시간을 요구
```

```typescript
// src/app/api/webhooks/polar/route.ts - 상단에 추가
export const maxDuration = 30; // Webhook은 빠르게 처리해야 하나, DB 작업 포함
```

### 2.3 Vercel 프로젝트 설정

Vercel 대시보드에서 다음을 구성한다:

1. **Git 연동**: GitHub 저장소 연결
2. **Root Directory**: `ai-podcast-clipper-frontend` (모노레포 구조인 경우)
3. **Build Command**: `npm run build` (기본값 사용)
4. **Install Command**: `npm install` (postinstall에서 `prisma generate` 자동 실행)
5. **Node.js Version**: 20.x

### 2.4 Serverless Function 고려사항

Vercel Serverless Functions의 기본 타임아웃은 Hobby 플랜 10초, Pro 플랜 60초이다. Inngest는 자체 실행 환경을 사용하므로 route handler의 타임아웃과 무관하지만, Inngest serve endpoint(`/api/inngest`)는 Inngest Cloud에서 호출하는 진입점이므로 충분한 `maxDuration`이 필요하다.

---

## 3. 환경 분리 전략

### 3.1 환경 구분

| 환경 | 용도 | 배포 트리거 | Vercel 환경 |
|------|------|-------------|-------------|
| Development | 로컬 개발 | - | - |
| Preview | PR/브랜치 테스트 | PR 생성, 브랜치 push | Preview |
| Production | 실제 서비스 | `main` 브랜치 merge | Production |

### 3.2 환경별 환경 변수 관리

Vercel 대시보드의 **Environment Variables** 섹션에서 환경별로 분리 설정한다:

```
# Production 전용
DATABASE_URL=postgresql://...@neon.tech/prod_db?sslmode=require
POLAR_SERVER=production
POLAR_ACCESS_TOKEN=polar_pat_prod_...
INNGEST_EVENT_KEY=evt_prod_...
INNGEST_SIGNING_KEY=signkey_prod_...
NEXT_PUBLIC_SITE_URL=https://podcastclipper.com
AUTH_SECRET=<production-secret>

# Preview 전용
DATABASE_URL=postgresql://...@neon.tech/preview_db?sslmode=require
POLAR_SERVER=sandbox
POLAR_ACCESS_TOKEN=polar_pat_sandbox_...
INNGEST_EVENT_KEY=evt_preview_...
INNGEST_SIGNING_KEY=signkey_preview_...
NEXT_PUBLIC_SITE_URL=https://preview.podcastclipper.com
AUTH_SECRET=<preview-secret>
```

### 3.3 Neon 데이터베이스 브랜칭

Neon은 Git-like 브랜칭을 지원한다. 환경별 DB 격리를 위해 활용한다:

| 환경 | Neon 브랜치 | 용도 |
|------|------------|------|
| Production | `main` | 실 서비스 데이터 |
| Preview | `preview` | PR 테스트용, 프로덕션 데이터 스냅샷 |
| Development | `dev` | 로컬 개발, 자유롭게 스키마 변경 |

**Neon 브랜치 생성 방법:**
Neon 콘솔 > Branches > Create Branch로 `main` 브랜치에서 `preview`, `dev` 브랜치를 분기한다. 각 브랜치는 독립적인 connection string을 가지며, 이를 해당 Vercel 환경의 `DATABASE_URL`에 설정한다.

### 3.4 src/env.js 환경 분기 강화

현재 `src/env.js`에 Inngest 관련 환경 변수가 누락되어 있다. 프로덕션에서 필요한 변수를 추가한다:

```typescript
// src/env.js - server 스키마에 추가
server: {
  // ... 기존 변수 유지 ...

  // Inngest (프로덕션 환경에서 필수)
  INNGEST_EVENT_KEY: z.string().optional(),
  INNGEST_SIGNING_KEY: z.string().optional(),
},
```

Inngest SDK는 이 환경 변수를 자동 감지하므로, Vercel에 설정하는 것만으로 프로덕션 Inngest Cloud와 연동된다.

---

## 4. 보안 헤더 설정

### 4.1 next.config.js headers 추가

```javascript
// next.config.js
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
        ],
      },
    ];
  },
};

export default config;
```

### 4.2 Content Security Policy (CSP)

CSP는 별도 관리한다. 프로젝트가 사용하는 외부 리소스를 고려한 정책:

```javascript
// next.config.js headers() 내부에 추가
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
}
```

> **CloudFront 도입 시**: `media-src`에 CloudFront 도메인을 추가해야 한다 (예: `media-src 'self' https://*.amazonaws.com https://cdn.podcastclipper.com`).

**CSP 정책 근거:**

| 디렉티브 | 허용 대상 | 이유 |
|-----------|-----------|------|
| `script-src 'unsafe-inline'` | Next.js 인라인 스크립트 | Next.js가 hydration에 인라인 스크립트 사용 |
| `style-src fonts.googleapis.com` | Google Fonts | Geist 폰트 로드 |
| `img-src *.amazonaws.com` | S3 이미지 | 클립 썸네일, 프로필 이미지 |
| `media-src *.amazonaws.com` | S3 비디오 | `<video src>` 으로 클립을 재생하므로 `media-src` 필수. 미지정 시 `default-src 'self'`로 폴백되어 S3 presigned URL 재생이 차단됨 |
| `connect-src *.inngest.com` | Inngest API | 이벤트 전송 |
| `frame-src checkout.polar.sh` | Polar Checkout | 결제 iframe/리다이렉트 |

> **주의**: CSP는 배포 후 브라우저 콘솔에서 위반 사항을 확인하며 점진적으로 강화해야 한다. 초기에는 `Content-Security-Policy-Report-Only` 헤더를 사용하여 차단 없이 위반만 보고하는 것을 권장한다.

### 4.3 향후 CSP nonce 도입 (선택)

Next.js 15는 CSP nonce를 미들웨어에서 생성하여 `unsafe-inline`을 제거할 수 있다. 이는 Phase 3 안정화 단계에서 검토한다.

---

## 5. 에러 바운더리 구현

### 5.1 필요 파일 목록

| 파일 | 역할 | 우선순위 |
|------|------|----------|
| `src/app/global-error.tsx` | 루트 레이아웃(`layout.tsx`) 에러 캐치 | CRITICAL |
| `src/app/not-found.tsx` | 글로벌 404 페이지 | CRITICAL |
| `src/app/error.tsx` | 루트 레이아웃 하위 에러 캐치 | CRITICAL |
| `src/app/dashboard/error.tsx` | 대시보드 섹션 에러 캐치 | HIGH |

### 5.2 구현 패턴

#### 5.2.1 global-error.tsx

루트 레이아웃 자체의 에러를 캐치한다. `<html>`, `<body>` 태그를 직접 포함해야 한다.

```tsx
// src/app/global-error.tsx
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

#### 5.2.2 not-found.tsx

```tsx
// src/app/not-found.tsx
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

#### 5.2.3 error.tsx (루트 및 대시보드)

```tsx
// src/app/error.tsx
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

대시보드용 `error.tsx`는 동일 패턴이되, 대시보드 레이아웃 내에서 렌더링되므로 대시보드 내비게이션을 유지할 수 있다.

### 5.3 Sentry 연동

에러 바운더리에서 에러를 Sentry로 자동 리포팅하는 것은 7장 (모니터링 인프라)에서 다룬다. Sentry의 `@sentry/nextjs`가 글로벌 에러 핸들러를 자동 설치하므로, 에러 바운더리 코드 내에서 명시적 Sentry 호출은 불필요하다.

---

## 6. 미들웨어 구현

### 6.1 목적

- 인증되지 않은 사용자의 보호 라우트 접근 차단
- 인증된 사용자의 로그인/회원가입 페이지 리다이렉트

### 6.2 사전 작업: auth export 분리

현재 `src/server/auth/index.ts`에서 `auth`는 React의 `cache()`로 래핑되어 있다:

```typescript
// src/server/auth/index.ts (현재)
const { auth: uncachedAuth, handlers, signIn, signOut } = NextAuth(authConfig);
const auth = cache(uncachedAuth);
export { auth, handlers, signIn, signOut };
```

`cache()`로 래핑된 함수는 React Server Components 렌더링 컨텍스트 전용이며, Edge 런타임에서 실행되는 미들웨어에서 `auth((req) => {...})` 패턴으로 사용할 수 없다. 따라서 미들웨어용으로 원본 `auth`를 별도 export해야 한다:

```typescript
// src/server/auth/index.ts (수정)
const { auth: uncachedAuth, handlers, signIn, signOut } = NextAuth(authConfig);
const auth = cache(uncachedAuth);
export { uncachedAuth as authMiddleware, auth, handlers, signIn, signOut };
```

### 6.3 구현

```typescript
// src/middleware.ts
import { authMiddleware } from "~/server/auth";
import { NextResponse } from "next/server";

const PROTECTED_ROUTES = ["/dashboard"];
const AUTH_ROUTES = ["/login", "/signup"];

export default authMiddleware((req) => {
  const { pathname } = req.nextUrl;
  const isLoggedIn = !!req.auth;

  // 보호 라우트: 미인증 사용자 → 로그인 페이지로 리다이렉트
  const isProtected = PROTECTED_ROUTES.some((route) =>
    pathname.startsWith(route),
  );
  if (isProtected && !isLoggedIn) {
    const loginUrl = new URL("/login", req.url);
    loginUrl.searchParams.set("callbackUrl", pathname);
    return NextResponse.redirect(loginUrl);
  }

  // 인증 라우트: 이미 로그인된 사용자 → 대시보드로 리다이렉트
  const isAuthRoute = AUTH_ROUTES.some((route) => pathname.startsWith(route));
  if (isAuthRoute && isLoggedIn) {
    return NextResponse.redirect(new URL("/dashboard", req.url));
  }

  return NextResponse.next();
});

export const config = {
  matcher: ["/dashboard/:path*", "/login", "/signup"],
};
```

### 6.4 matcher 설정 근거

`matcher`를 명시적으로 지정하여, 미들웨어가 실행되는 경로를 최소화한다. API 라우트(`/api/*`), 정적 자산(`/_next/*`), 공개 페이지(`/`, `/pricing` 등)에는 미들웨어가 실행되지 않아 성능 오버헤드를 방지한다.

### 6.5 Rate Limiting 고려사항

Vercel은 Edge Middleware에서 Rate Limiting을 직접 구현하기 어렵다(상태 저장소가 없으므로). 대안:

| 방식 | 장점 | 단점 |
|------|------|------|
| **Vercel Firewall (WAF)** | 설정만으로 적용, 인프라 관리 불필요 | Pro 플랜 필요 |
| **Upstash Redis + @upstash/ratelimit** | Edge에서 동작, 세밀한 제어 | 외부 의존성 추가 |
| **NextAuth.js 자체 Rate Limiting** | 인증 엔드포인트 보호에 충분 | 인증 외 엔드포인트 미지원 |

**권장**: 초기에는 Vercel Firewall(Pro 플랜 사용 시)으로 기본 보호를 적용하고, 필요 시 Upstash로 세밀한 제어를 추가한다.

---

## 7. Inngest 프로덕션 설정

### 7.1 현재 문제점

```typescript
// 현재 설정 (src/inngest/functions.ts:40-48)
{
  id: "process-video",
  retries: 1,                    // 1회 재시도는 불충분
  concurrency: { limit: 1, key: "event.data.userId" },
  // backoff 전략 없음
  // 타임아웃 없음
}
```

- 일시적 네트워크 오류로 Modal 엔드포인트 호출 실패 시 1회만 재시도
- 재시도 간격 제어 없음 (즉시 재시도는 동일 오류 반복 가능성 높음)
- 타임아웃 미설정으로 무한 대기 가능

### 7.2 개선된 설정

```typescript
// src/inngest/functions.ts
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
  async ({ event, step }) => {
    // ... 기존 로직 유지
  },
);
```

**변경 사항 설명:**

| 항목 | 이전 | 이후 | 이유 |
|------|------|------|------|
| `retries` | 1 | 3 | 일시적 오류(네트워크, Modal 서버 재시작) 복구를 위해 충분한 재시도 횟수 확보. Inngest는 기본적으로 지수 백오프를 적용함 |
| `cancelOn` | 없음 | 추가 | 사용자가 재처리 요청 시 이전 작업을 취소할 수 있도록 함 |

> **참고**: Inngest SDK v3에서는 `retries` 값만 설정하면 자동으로 지수 백오프가 적용된다. 별도의 backoff 설정은 불필요하다.

### 7.3 Inngest Cloud 연동

프로덕션 환경에서는 Inngest Cloud를 사용한다:

1. [app.inngest.com](https://app.inngest.com) 에서 앱 생성
2. **Event Key**와 **Signing Key** 발급
3. Vercel 환경 변수에 설정:
   - `INNGEST_EVENT_KEY`: 이벤트 전송 인증
   - `INNGEST_SIGNING_KEY`: Inngest Cloud → 앱 요청 서명 검증

Inngest SDK는 이 환경 변수를 자동 감지하므로, 코드 변경 없이 로컬(dev server)과 프로덕션(Inngest Cloud)을 전환할 수 있다.

### 7.4 Inngest 실패 처리 개선

현재 catch 블록에서 에러 정보 없이 상태만 `"failed"`로 변경한다. 디버깅을 위해 에러 정보를 기록한다:

```typescript
// src/inngest/functions.ts - catch 블록 개선
catch (error) {
  const errorMessage =
    error instanceof Error ? error.message : "Unknown error";

  await db.uploadedFile.update({
    where: { id: uploadedFileId },
    data: {
      status: "failed",
    },
  });

  // Inngest에 에러를 다시 throw하여 대시보드에서 확인 가능하게 함
  throw error;
}
```

`throw error`를 추가하면 Inngest 대시보드에서 실패 원인을 확인할 수 있고, 설정된 재시도 횟수만큼 자동 재시도된다.

---

## 8. 모니터링 인프라

### 8.1 Sentry 도입

#### 8.1.1 패키지 설치

```bash
npx @sentry/wizard@latest -i nextjs
```

위 명령어가 다음을 자동 생성한다:
- `sentry.client.config.ts` - 클라이언트 에러 캡처
- `sentry.server.config.ts` - 서버 에러 캡처
- `sentry.edge.config.ts` - Edge 런타임 에러 캡처
- `src/app/global-error.tsx` 수정 (5장에서 생성한 파일에 Sentry 연동 추가)
- `next.config.js`에 `withSentryConfig` 래핑

#### 8.1.2 환경 변수 추가

```
# .env.example에 추가
SENTRY_DSN=""
SENTRY_AUTH_TOKEN=""    # 소스맵 업로드용 (빌드 시에만 필요)
NEXT_PUBLIC_SENTRY_DSN=""
```

```typescript
// src/env.js - server 스키마에 추가
SENTRY_DSN: z.string().url().optional(),
SENTRY_AUTH_TOKEN: z.string().optional(),
```

```typescript
// src/env.js - client 스키마에 추가
NEXT_PUBLIC_SENTRY_DSN: z.string().url().optional(),
```

#### 8.1.3 next.config.js 수정

```javascript
// next.config.js
import { withSentryConfig } from "@sentry/nextjs";
import "./src/env.js";

/** @type {import("next").NextConfig} */
const config = {
  // ... 기존 설정 유지
};

export default withSentryConfig(config, {
  // 소스맵 업로드 (빌드 시 SENTRY_AUTH_TOKEN 필요)
  silent: true,
  org: "your-sentry-org",
  project: "ai-podcast-clipper",

  // 클라이언트 번들에서 소스맵 제거 (보안)
  hideSourceMaps: true,

  // 자동 계측
  autoInstrumentServerFunctions: true,
  autoInstrumentMiddleware: true,
});
```

#### 8.1.4 Sentry 설정 요약

| 기능 | 설정 | 효과 |
|------|------|------|
| Server 에러 자동 캡처 | `sentry.server.config.ts` | Server Actions, API Routes 에러 자동 리포팅 |
| Client 에러 자동 캡처 | `sentry.client.config.ts` | 브라우저 런타임 에러 자동 리포팅 |
| 소스맵 업로드 | `SENTRY_AUTH_TOKEN` | 에러 발생 위치를 원본 코드로 역추적 |
| Performance 모니터링 | `tracesSampleRate: 0.1` | API 응답 시간, 페이지 로드 성능 추적 |

### 8.2 Health Check 엔드포인트

```typescript
// src/app/api/health/route.ts
import { db } from "~/server/db";

export const dynamic = "force-dynamic";

export async function GET() {
  const checks: Record<string, "ok" | "error"> = {};

  // DB 연결 확인
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

### 8.3 Uptime 모니터링

외부 서비스로 `/api/health` 엔드포인트를 주기적으로 호출하여 가용성을 감시한다:

| 서비스 | 무료 티어 | 체크 주기 | 알림 |
|--------|-----------|-----------|------|
| **BetterStack (Better Uptime)** | 10 모니터 | 3분 | Email, Slack, SMS |
| UptimeRobot | 50 모니터 | 5분 | Email, Slack |
| Vercel Analytics | 내장 | 실시간 | 대시보드 |

**권장**: BetterStack 무료 플랜으로 시작. `/api/health` 엔드포인트를 3분 주기로 모니터링하고, 실패 시 Slack/Email 알림을 설정한다.

### 8.4 console.log 교체 전략

기존 `console.log`를 즉시 전부 교체하는 것은 비효율적이다. 다음 전략을 권장한다:

1. **Sentry 도입으로 에러 로깅은 자동 해결**: `console.error`로 출력되는 에러는 Sentry가 자동 캡처
2. **새 코드부터 구조화된 로깅 적용**: 새로 작성하는 코드는 Sentry의 `breadcrumb` 또는 `captureMessage` 사용
3. **기존 `console.log`는 점진적 제거**: Inngest 함수 내부의 `console.log("clipCount", clipCount)` 같은 디버그 로그는 제거하거나 Sentry breadcrumb으로 교체

---

## 9. CDN 구성 (CloudFront)

### 9.1 아키텍처

```
사용자 → CloudFront (캐싱) → S3 (원본)
```

현재는 S3 presigned URL로 직접 접근하고 있어, 캐싱 이점이 없고 S3 전송 비용이 직접 발생한다.

### 9.2 CloudFront 배포 설정

#### 9.2.1 AWS 콘솔에서 CloudFront 배포 생성

| 항목 | 설정값 | 이유 |
|------|--------|------|
| Origin Domain | `{S3_BUCKET_NAME}.s3.{AWS_REGION}.amazonaws.com` | S3 버킷 |
| Origin Access | **OAC (Origin Access Control)** | OAI보다 최신, 권장 방식 |
| Viewer Protocol Policy | Redirect HTTP to HTTPS | 보안 |
| Allowed HTTP Methods | GET, HEAD | 읽기 전용 (업로드는 S3 직접) |
| Cache Policy | CachingOptimized | 클립 파일은 불변이므로 장기 캐싱 가능 |
| Price Class | PriceClass_200 | 아시아 포함, 비용 최적화 |
| Alternate Domain | `cdn.podcastclipper.com` | 커스텀 도메인 |

#### 9.2.2 S3 버킷 정책

OAC 설정 후 S3 버킷 정책을 업데이트하여 CloudFront만 접근 가능하게 한다:

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

### 9.3 Signed URL 전환

현재 S3 presigned URL을 사용하고 있으므로, CloudFront Signed URL로 전환한다. 이는 보안과 캐싱을 모두 지원한다.

#### 9.3.1 환경 변수 추가

```
# .env.example에 추가
CLOUDFRONT_DOMAIN=""
CLOUDFRONT_KEY_PAIR_ID=""
CLOUDFRONT_PRIVATE_KEY=""   # PEM 개인키를 base64 인코딩한 값 (아래 참고)
```

```typescript
// src/env.js - server 스키마에 추가
CLOUDFRONT_DOMAIN: z.string().optional(),
CLOUDFRONT_KEY_PAIR_ID: z.string().optional(),
CLOUDFRONT_PRIVATE_KEY: z.string().optional(),
```

> **PEM 키 인코딩**: CloudFront 개인키는 PEM 형식으로 줄바꿈(`\n`)을 포함한다. 환경 변수에 multi-line 값을 저장하면 플랫폼(Vercel CLI, CI 등)에 따라 줄바꿈이 누락되거나 이스케이프 처리가 달라질 수 있다. base64 인코딩 후 저장하고, 런타임에서 디코딩하는 방식을 사용한다:
>
> ```bash
> # 인코딩 (설정 시 1회)
> cat private_key.pem | base64 -w 0
> # 출력값을 CLOUDFRONT_PRIVATE_KEY 환경 변수에 저장
> ```

#### 9.3.2 CloudFront Signed URL 유틸리티

```typescript
// src/fsd/shared/lib/cloudfront.ts
import { getSignedUrl } from "@aws-sdk/cloudfront-signer";
import { env } from "~/env";

export function getCloudFrontSignedUrl(s3Key: string): string | null {
  if (
    !env.CLOUDFRONT_DOMAIN ||
    !env.CLOUDFRONT_KEY_PAIR_ID ||
    !env.CLOUDFRONT_PRIVATE_KEY
  ) {
    return null; // CloudFront 미설정 시 null 반환 → 호출부에서 S3 fallback
  }

  const url = `https://${env.CLOUDFRONT_DOMAIN}/${s3Key}`;

  // base64로 인코딩된 PEM 키를 디코딩
  const privateKey = Buffer.from(
    env.CLOUDFRONT_PRIVATE_KEY,
    "base64",
  ).toString("utf-8");

  return getSignedUrl({
    url,
    keyPairId: env.CLOUDFRONT_KEY_PAIR_ID,
    privateKey,
    dateLessThan: new Date(Date.now() + 3600 * 1000).toISOString(),
  });
}
```

#### 9.3.3 기존 코드 수정 (generation.ts)

```typescript
// src/actions/generation.ts - getClipPlayUrl 수정
import { getCloudFrontSignedUrl } from "~/fsd/shared/lib/cloudfront";

export async function getClipPlayUrl(clipId: string) {
  // ... 인증, DB 조회 동일 ...

  // CloudFront 우선, 미설정 시 S3 fallback
  const cloudFrontUrl = getCloudFrontSignedUrl(clip.s3Key);
  if (cloudFrontUrl) {
    return { success: true, url: cloudFrontUrl };
  }

  // 기존 S3 presigned URL 로직 (fallback)
  const s3Client = new S3Client({ /* ... */ });
  const signedUrl = await getSignedUrl(s3Client, command, { expiresIn: 3600 });
  return { success: true, url: signedUrl };
}
```

이 방식은 CloudFront 설정이 없는 환경(로컬 개발)에서도 기존대로 동작한다.

### 9.4 업로드 경로는 S3 직접 유지

파일 업로드(`src/actions/s3.ts`의 `generateUploadUrl`)는 S3 presigned PUT URL을 그대로 사용한다. CloudFront는 읽기(GET) 전용으로 설정하며, 쓰기 작업은 S3 직접 접근을 유지한다.

---

## 10. 도메인 & SSL

### 10.1 도메인 구성

| 도메인 | 용도 | 대상 |
|--------|------|------|
| `podcastclipper.com` | 메인 서비스 | Vercel |
| `www.podcastclipper.com` | www 리다이렉트 | Vercel (→ 루트 도메인으로 리다이렉트) |
| `cdn.podcastclipper.com` | 미디어 CDN | CloudFront |

### 10.2 Vercel 도메인 설정

1. Vercel 대시보드 > Settings > Domains에서 도메인 추가
2. DNS 레코드 설정:
   - `podcastclipper.com` → A 레코드: `76.76.21.21`
   - `www.podcastclipper.com` → CNAME: `cname.vercel-dns.com`
3. Vercel이 Let's Encrypt SSL 인증서를 자동 발급/갱신

### 10.3 CDN 도메인 설정

1. CloudFront 배포의 Alternate Domain Name에 `cdn.podcastclipper.com` 추가
2. AWS ACM(Certificate Manager)에서 SSL 인증서 발급 (us-east-1 리전 필수)
3. DNS 레코드: `cdn.podcastclipper.com` → CNAME: `{distribution-id}.cloudfront.net`

### 10.4 환경 변수 업데이트

```
# Production
NEXT_PUBLIC_SITE_URL=https://podcastclipper.com
CLOUDFRONT_DOMAIN=cdn.podcastclipper.com
AUTH_URL=https://podcastclipper.com
```

`AUTH_URL`은 NextAuth.js가 프로덕션에서 콜백 URL을 올바르게 생성하기 위해 필요하다.

---

## 11. 구현 순서 및 의존 관계

### 11.1 의존 관계 그래프

```
[1] Vercel 배포 설정 ─────────────────────────┐
[2] 환경 분리 전략 ──────┐                     │
                         ├── [9] 도메인 & SSL ──┤
[3] 보안 헤더 설정 ──────┘                     │
                                               ├── 프로덕션 배포
[4] 에러 바운더리 ─┬── [7] 모니터링 (Sentry) ──┤
                   │                           │
[5] 미들웨어 ──────┘                           │
                                               │
[6] Inngest 프로덕션 ─────────────────────────┘

[8] CDN (CloudFront) ── 독립 작업, 배포 후 추가 가능
```

### 11.2 권장 구현 순서

#### Phase A: 배포 기반 (1-2일)

| 순서 | 작업 | 선행 조건 | 공수 |
|------|------|-----------|------|
| A-1 | Vercel 배포 설정 (`vercel.json`) | 없음 | 0.5일 |
| A-2 | 환경 분리 전략 (Vercel 환경 변수) | A-1 | 0.5일 |
| A-3 | 보안 헤더 설정 (`next.config.js`) | 없음 | 0.5일 |

#### Phase B: 안정성 (1.5-2일)

| 순서 | 작업 | 선행 조건 | 공수 |
|------|------|-----------|------|
| B-1 | 에러 바운더리 구현 | 없음 | 0.5일 |
| B-2 | 미들웨어 구현 | 없음 | 0.5일 |
| B-3 | Inngest 프로덕션 설정 | A-2 | 0.5일 |

#### Phase C: 관측성 (1일)

| 순서 | 작업 | 선행 조건 | 공수 |
|------|------|-----------|------|
| C-1 | Sentry 설치 및 설정 | B-1 | 0.5일 |
| C-2 | Health Check + Uptime 모니터링 | A-1 | 0.5일 |

#### Phase D: 성능 & 도메인 (1-1.5일)

| 순서 | 작업 | 선행 조건 | 공수 |
|------|------|-----------|------|
| D-1 | 도메인 & SSL 설정 | A-1 | 0.5일 |
| D-2 | CloudFront CDN 구성 | D-1 | 1일 |

### 11.3 최소 배포 가능 상태 (MVP)

Phase A + Phase B 완료 시 (3일) 최소 프로덕션 배포가 가능하다:
- Vercel에 배포되고 환경이 분리됨
- 보안 헤더가 적용됨
- 에러 발생 시 사용자에게 적절한 페이지가 표시됨
- 인증 보호가 미들웨어로 강화됨
- Inngest가 프로덕션 수준으로 안정화됨

---

## 12. 환경 변수 총정리

본 제안서에서 새로 필요한 환경 변수 목록:

### 12.1 신규 추가 변수

| 변수 | 용도 | 환경 | 필수 여부 |
|------|------|------|-----------|
| `INNGEST_EVENT_KEY` | Inngest Cloud 이벤트 인증 | Production, Preview | Production 필수 |
| `INNGEST_SIGNING_KEY` | Inngest Cloud 서명 검증 | Production, Preview | Production 필수 |
| `SENTRY_DSN` | Sentry 에러 리포팅 | All | 선택 |
| `SENTRY_AUTH_TOKEN` | Sentry 소스맵 업로드 | Build time | 선택 |
| `NEXT_PUBLIC_SENTRY_DSN` | 클라이언트 Sentry | All | 선택 |
| `CLOUDFRONT_DOMAIN` | CDN 도메인 | Production | 선택 |
| `CLOUDFRONT_KEY_PAIR_ID` | CloudFront 서명 키 ID | Production | 선택 |
| `CLOUDFRONT_PRIVATE_KEY` | CloudFront 서명 개인키 | Production | 선택 |
| `AUTH_URL` | NextAuth.js 프로덕션 URL | Production | 필수 |

### 12.2 .env.example 최종 형태

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

# CloudFront CDN (optional, PEM 키는 base64 인코딩)
CLOUDFRONT_DOMAIN=""
CLOUDFRONT_KEY_PAIR_ID=""
CLOUDFRONT_PRIVATE_KEY=""

# Video Processing
PROCESS_VIDEO_ENDPOINT=""
PROCESS_VIDEO_ENDPOINT_AUTH=""

# Inngest (auto-detected by SDK)
INNGEST_EVENT_KEY=""
INNGEST_SIGNING_KEY=""

# Polar Payment
POLAR_ACCESS_TOKEN=""
POLAR_WEBHOOK_SECRET=""
POLAR_SERVER="sandbox"               # "sandbox" or "production"

# Monitoring (optional)
SENTRY_DSN=""
SENTRY_AUTH_TOKEN=""
NEXT_PUBLIC_SENTRY_DSN=""

# Public
NEXT_PUBLIC_SITE_URL="http://localhost:3000"
```

---

## 13. 비용 추정

### 13.1 Vercel

| 플랜 | 월 비용 | 포함 사항 |
|------|---------|-----------|
| **Pro** (권장) | $20/월 | 100GB 대역폭, 1000 빌드 시간, 60초 Function 타임아웃, Firewall |
| Hobby | $0/월 | 100GB 대역폭, 10초 Function 타임아웃 (Inngest에 불충분할 수 있음) |

> **참고**: Hobby 플랜에서도 Inngest는 자체 실행 환경을 사용하므로 영상 처리 자체는 문제없다. 다만 Inngest serve endpoint의 타임아웃이 10초로 제한되므로, 복잡한 step 함수의 초기 핸드셰이크에 문제가 생길 수 있다. Pro 플랜을 권장한다.

### 13.2 기타 서비스

| 서비스 | 무료 티어 | 유료 시작 |
|--------|-----------|-----------|
| Neon (DB) | 0.5GB, 무제한 브랜치 | $19/월 |
| Inngest Cloud | 25K 이벤트/월 | $25/월 |
| Sentry | 5K 에러/월 | $26/월 |
| CloudFront | 1TB/월 (12개월) | 사용량 기반 |
| BetterStack | 10 모니터 | $24/월 |

### 13.3 초기 운영 예상 비용

MVP 단계 (사용자 <100명): **$20-40/월** (Vercel Pro + Neon/Inngest 무료 티어)

---

## 부록: 체크리스트와 현재 상태 비교

`saas-deployment-checklist.md` 작성 시점(2026-03-19) 대비 이미 완료된 항목:

| 체크리스트 항목 | 현재 상태 | 비고 |
|----------------|-----------|------|
| SQLite → PostgreSQL (#1) | 완료 | Neon adapter 사용 |
| Polar 결제 시스템 (#3) | 완료 | Webhook, Subscription/Order 모델 구현 |
| Google OAuth (#7 일부) | 완료 | `AUTH_GOOGLE_ID/SECRET` 설정됨 |
| `.env.example` (#6 일부) | 완료 | Polar 변수 포함 |
| SEO 메타데이터 (#13 일부) | 완료 | OG, Twitter Card, robots 설정됨 |
| `polarCustomerId` 필드 (#3 일부) | 완료 | Prisma 스키마에 존재 |
