# Error Boundary 구현 제안서

> 작성일: 2026-03-26
> 프로젝트: AI Podcast Clipper Frontend (Next.js 15 / T3 Stack / FSD Architecture)
> 관련 체크리스트: `saas-deployment-checklist.md` 4.1항
> 심각도: CRITICAL
> 예상 공수: 2-3일

---

## 1. 개요

### 1.1 목적

`saas-deployment-checklist.md` 4.1항은 에러 바운더리 구현을 **CRITICAL**로 분류하고 있다. 현재 프로젝트에는 기본적인 error boundary 파일이 존재하지만, 사용자 경험(UX), 보안, 에러 리포팅 측면에서 모두 부족하다. 본 제안서는 현재 프로젝트의 아키텍처(FSD, App Router, ActionResult 패턴)에 맞춰 에러 바운더리를 체계적으로 개선·확장하는 방안을 정의한다.

### 1.2 체크리스트 요구사항 vs 현재 상태

| # | 요구사항 | 현재 상태 | 충족 여부 |
|---|----------|-----------|-----------|
| 1 | 루트 `app/error.tsx` (글로벌 에러 바운더리) | 존재하나 최소 구현 | 부분 충족 |
| 2 | 루트 `app/not-found.tsx` (404 페이지) | 존재하나 최소 구현 | 부분 충족 |
| 3 | 주요 라우트별 `error.tsx` (dashboard, upload 등) | dashboard만 존재 | 부분 충족 |
| 4 | `app/global-error.tsx` (루트 레이아웃 에러) | 존재하나 최소 구현 | 부분 충족 |
| 5 | 사용자 친화적 에러 메시지 및 복구 액션 | 없음 (제네릭 메시지만) | 미충족 |

### 1.3 위험 요소

| 위험 요소 | 설명 |
|-----------|------|
| UX 품질 저하 | 에러 발생 시 사용자에게 유용한 정보 없음, 복구 경로 부재 |
| 보안 위험 | `error.message`를 프로덕션에서 그대로 노출 (내부 구현 세부사항 유출 가능) |
| 디버깅 불가 | `console.error`만 사용 중, 프로덕션 에러 추적 수단 없음 |
| 패턴 불일치 | OLD/NEW 두 가지 서버 액션 에러 반환 패턴이 공존 |
| 누락된 경계 | upload detail, billing 등 주요 라우트에 error.tsx 없음 |

---

## 2. 현재 상태 분석

### 2.1 기존 Error Boundary 파일 분석

#### `src/app/error.tsx` (Root Error Boundary)

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

**문제점**:
- `error.message` 직접 노출 → 프로덕션에서 내부 에러 메시지(DB 쿼리 실패, 스택 정보 등)가 사용자에게 보임
- raw `<button>` 사용 → 프로젝트의 `Button` 컴포넌트 미활용, 디자인 불일치
- `error.digest` 미사용 → 지원 요청 시 에러 추적 불가
- 제네릭 메시지만 표시 → 컨텍스트 정보 없음

#### `src/app/dashboard/error.tsx` (Dashboard Error Boundary)

Root error boundary와 거의 동일. `min-h-[50vh]`로 높이만 다름.

**문제점**: Root와 동일한 문제 + 대시보드 컨텍스트 메시지 없음, "대시보드로 돌아가기" 같은 네비게이션 액션 부재

#### `src/app/global-error.tsx` (Global Error Boundary)

```tsx
"use client";

export default function GlobalError({
  error: _error,
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

**문제점**:
- `error`를 `_error`로 무시 → digest 활용 불가
- 최소 인라인 스타일만 적용 (Tailwind 사용 불가는 정상이나, 인라인 CSS로도 더 나은 UX 가능)

#### `src/app/not-found.tsx` (404 Page)

```tsx
import Link from "next/link";

export default function NotFound() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center">
      <h1 className="text-4xl font-bold">404</h1>
      <p className="mt-2 text-muted-foreground">Page not found</p>
      <Link href="/" className="mt-4 underline">Go back home</Link>
    </div>
  );
}
```

**문제점**: 프로젝트의 `Button` 컴포넌트 미활용, 시각적 아이콘/일러스트 없음, 가이드 메시지 부족

### 2.2 누락된 Error Boundary

| 경로 | 현재 에러 처리 | 문제점 |
|------|---------------|--------|
| `/dashboard/uploads/[uploadedFileId]` | 없음 → `dashboard/error.tsx`로 버블링 | `getUploadedFileDetails()`가 `findUniqueOrThrow`로 throw → 대시보드 전체가 에러 상태로 교체됨, 대시보드 레이아웃(헤더 등) 유실 |
| `/dashboard/billing` | 인라인 에러 UI (line 13-18) | `getBillingData()` 실패는 처리되나, 런타임 에러는 대시보드 error.tsx로 버블링 |

### 2.3 Server Action 에러 처리 패턴 불일치

프로젝트에 두 가지 에러 반환 패턴이 공존한다:

**OLD 패턴** — `src/actions/` 디렉토리 (레거시)

| 파일 | 함수 | 패턴 | 문제 |
|------|------|------|------|
| `src/actions/generation.ts` | `processVideo` | `throw new Error("Unauthorized")` | 호출자가 try/catch 필요 |
| `src/actions/generation.ts` | `getClipPlayUrl` | `{ success: boolean; url?: string; error?: string }` | 타입 불안전 |
| `src/actions/generation.ts` | `deleteClip` | `{ success: boolean; error?: string }` | 타입 불안전 |
| `src/actions/s3.ts` | `generateUploadUrl` | `throw new Error("Unauthorized")` | 호출자가 try/catch 필요 |
| `src/actions/uploaded-files.ts` | `getUploadedFileDetails` | `throw new Error("Unauthorized")` | 호출자가 try/catch 필요 |
| `src/actions/uploaded-files.ts` | `getOriginalPlayUrl` | `{ success: boolean; url?: string }` | 타입 불안전 |
| `src/actions/uploaded-files.ts` | 기타 함수들 | `{ success: boolean; error?: string }` | `@deprecated` 처리됨 |

**NEW 패턴** — `src/fsd/features/*/api/` (FSD 구조)

| 파일 | 함수 | 패턴 | 상태 |
|------|------|------|------|
| `src/fsd/features/upload/api/index.ts` | `getOriginalPlayUrl` | `ActionResult<{ url: string }>` | 표준 |
| `src/fsd/features/upload/api/index.ts` | `deleteUploadedFile` | `ActionResult<void>` | 표준 |
| `src/fsd/features/upload/api/index.ts` | `deleteUploadedFileWithClips` | `ActionResult<void>` | 표준 |
| `src/fsd/features/upload/api/index.ts` | `reprocessUploadedFile` | `ActionResult<void>` | 표준 |
| `src/fsd/features/clip/api/index.ts` | `processVideo` | `ActionResult<void>` | 표준 |
| `src/fsd/features/clip/api/index.ts` | `getClipPlayUrl` | `ActionResult<{ url: string }>` | 표준 |
| `src/fsd/features/clip/api/index.ts` | `deleteClip` | `ActionResult<void>` | 표준 |
| `src/fsd/features/billing/api/index.ts` | `getBillingData` 등 | `ActionResult<T>` | 표준 |

**혼재 케이스** (FSD 파일이지만 OLD 패턴 사용):

| 파일 | 함수 | 패턴 | 문제 |
|------|------|------|------|
| `src/fsd/features/upload/api/index.ts` | `generateUploadUrl` | `throw + { success: boolean; signedUrl: string; ... }` | FSD 파일인데 OLD 패턴 |
| `src/fsd/features/upload/api/index.ts` | `getUploadedFileDetails` | `throw new Error("Unauthorized")` | FSD 파일인데 OLD 패턴 |

> **참고**: `getUploadedFileDetails`는 FSD 파일과 레거시 파일(`src/actions/uploaded-files.ts`) 양쪽에 동일 구현이 존재한다. 현재 Server Component(`src/app/dashboard/uploads/[uploadedFileId]/page.tsx`)는 **레거시 경로**(`~/actions/uploaded-files`)에서 import하고 있다. Server Component에서 `throw`는 적절한 패턴이므로 동작에 문제는 없으나, FSD 마이그레이션 완료 후 import 경로를 정리해야 한다.

### 2.4 클라이언트 에러 처리 현황

| 패턴 | 사용처 | 상태 |
|------|--------|------|
| Toast (sonner) | 모든 위젯/피처 컴포넌트 | 일관성 있음 |
| `useTransition` + ActionResult | `UploadedFileActions`, `ClipActions` | 표준 패턴 |
| `useEffect` + try/catch | `UploadDetailPage`, `useClipPlayUrl` | 동작하나 로깅 중복 |
| `console.error` | 모든 에러 처리 지점 | 프로덕션 추적 불가 |
| `ActionResult` 반환값 미처리 | `UploadPodcast` → `processVideo()` | `processVideo`가 `ActionResult<void>`를 반환하지만 호출부가 결과를 무시 → failure 시에도 성공 toast 표시 **(기존 버그)** |

---

## 3. 공유 에러 UI 컴포넌트 설계

### 3.1 설계 근거

현재 4개의 error boundary 파일이 각각 동일한 UI를 중복 구현하고 있다. FSD `shared` 레이어에 재사용 가능한 에러 표시 컴포넌트를 만들면:
- 모든 error boundary에서 일관된 UX 제공
- FSD 상위 레이어(`pages`, `widgets`, `features`)에서도 import 가능
- 디자인 변경 시 단일 지점 수정

### 3.2 ErrorDisplay 컴포넌트

**파일 위치**: `src/fsd/shared/ui/error-display/index.tsx`

```tsx
"use client";

import { AlertTriangle, Home, ArrowLeft, RefreshCw } from "lucide-react";
import Link from "next/link";
import { Button } from "~/fsd/shared/ui/atoms/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "~/fsd/shared/ui/atoms/card";

interface ErrorDisplayProps {
  /** 에러 제목 */
  title?: string;
  /** 사용자에게 보여줄 설명 */
  description?: string;
  /** Next.js 에러 digest (지원 요청 시 참조 코드) */
  digest?: string;
  /** full-page: min-h-screen, section: min-h-[50vh] */
  variant?: "full-page" | "section";
  /** "다시 시도" 버튼 표시 */
  showRetry?: boolean;
  /** retry 콜백 (error boundary의 reset 함수) */
  onRetry?: () => void;
  /** "홈으로" 링크 표시 */
  showHome?: boolean;
  /** "뒤로 가기" 링크 표시 */
  showBack?: boolean;
  /** 뒤로 가기 대상 경로 (기본: "/dashboard") */
  backHref?: string;
  /** 뒤로 가기 버튼 레이블 */
  backLabel?: string;
}

export function ErrorDisplay({
  title = "Something went wrong",
  description = "An error occurred while loading the page. Please try again later.",
  digest,
  variant = "full-page",
  showRetry = false,
  onRetry,
  showHome = false,
  showBack = false,
  backHref = "/dashboard",
  backLabel = "Go back",
}: ErrorDisplayProps) {
  const minHeight = variant === "full-page" ? "min-h-screen" : "min-h-[50vh]";

  return (
    <div className={`flex ${minHeight} flex-col items-center justify-center p-4`}>
      <Card className="w-full max-w-md text-center">
        <CardHeader>
          <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-destructive/10">
            <AlertTriangle className="h-6 w-6 text-destructive" />
          </div>
          <CardTitle>{title}</CardTitle>
          <CardDescription>{description}</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          {/* 액션 버튼 */}
          <div className="flex flex-wrap justify-center gap-2">
            {showRetry && onRetry && (
              <Button onClick={onRetry} variant="default">
                <RefreshCw className="mr-2 h-4 w-4" />
                Try again
              </Button>
            )}
            {showBack && (
              <Button variant="outline" asChild>
                <Link href={backHref}>
                  <ArrowLeft className="mr-2 h-4 w-4" />
                  {backLabel}
                </Link>
              </Button>
            )}
            {showHome && (
              <Button variant="outline" asChild>
                <Link href="/">
                  <Home className="mr-2 h-4 w-4" />
                  Home
                </Link>
              </Button>
            )}
          </div>

          {/* 에러 Digest (지원 참조 코드) */}
          {digest && (
            <p className="text-muted-foreground mt-2 text-xs">
              Error code: <code className="rounded bg-muted px-1 py-0.5 font-mono">{digest}</code>
            </p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
```

### 3.3 NotFoundDisplay 컴포넌트

**파일 위치**: `src/fsd/shared/ui/error-display/not-found-display.tsx`

```tsx
import { SearchX, Home, ArrowLeft } from "lucide-react";
import Link from "next/link";
import { Button } from "~/fsd/shared/ui/atoms/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "~/fsd/shared/ui/atoms/card";

interface NotFoundDisplayProps {
  title?: string;
  description?: string;
  showHome?: boolean;
  showBack?: boolean;
  backHref?: string;
  backLabel?: string;
}

export function NotFoundDisplay({
  title = "Page not found",
  description = "The page you requested does not exist or has been moved.",
  showHome = true,
  showBack = false,
  backHref = "/dashboard",
  backLabel = "Go back",
}: NotFoundDisplayProps) {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center p-4">
      <Card className="w-full max-w-md text-center">
        <CardHeader>
          <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-muted">
            <SearchX className="h-6 w-6 text-muted-foreground" />
          </div>
          <CardTitle className="text-5xl font-bold">404</CardTitle>
          <CardDescription className="mt-2">{title}</CardDescription>
          <p className="text-muted-foreground text-sm">{description}</p>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap justify-center gap-2">
            {showBack && (
              <Button variant="outline" asChild>
                <Link href={backHref}>
                  <ArrowLeft className="mr-2 h-4 w-4" />
                  {backLabel}
                </Link>
              </Button>
            )}
            {showHome && (
              <Button variant="default" asChild>
                <Link href="/">
                  <Home className="mr-2 h-4 w-4" />
                  Home
                </Link>
              </Button>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
```

---

## 4. Error Boundary 구현 계획

### 4.1 Root Error Boundary 개선

**파일**: `src/app/error.tsx`

**변경 사항**:
- `ErrorDisplay` 컴포넌트 적용
- `error.message` 직접 노출 제거 (보안)
- `error.digest` 표시 (지원 참조 코드)
- "다시 시도" + "홈으로" 액션 제공

```tsx
"use client";

import { useEffect } from "react";
import { ErrorDisplay } from "~/fsd/shared/ui/error-display";

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("Root error boundary caught:", error);
  }, [error]);

  return (
    <ErrorDisplay
      title="An unexpected error occurred"
      description="Something went wrong while loading the page. Please try again later."
      digest={error.digest}
      variant="full-page"
      showRetry
      onRetry={reset}
      showHome
    />
  );
}
```

### 4.2 Global Error Boundary 개선

**파일**: `src/app/global-error.tsx`

이 컴포넌트는 루트 `layout.tsx` 자체가 에러를 일으킬 때 동작하므로 `<html>`, `<body>`를 직접 렌더링해야 한다. Tailwind 클래스를 사용할 수 없으므로 인라인 스타일을 유지하되, UX를 크게 개선한다.

**변경 사항**:
- `_error` → `error`로 변경하여 digest 활용
- 인라인 CSS로 디자인 개선

```tsx
"use client";

import { useEffect } from "react";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("Global error boundary caught:", error);
  }, [error]);

  return (
    <html>
      <body>
        <div
          style={{
            display: "flex",
            minHeight: "100vh",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            fontFamily: "system-ui, -apple-system, sans-serif",
            padding: "2rem",
            backgroundColor: "#fafafa",
          }}
        >
          <div
            style={{
              maxWidth: "28rem",
              textAlign: "center",
              padding: "2rem",
              borderRadius: "0.75rem",
              border: "1px solid #e5e5e5",
              backgroundColor: "#ffffff",
              boxShadow: "0 1px 3px rgba(0,0,0,0.1)",
            }}
          >
            <div
              style={{
                width: "3rem",
                height: "3rem",
                borderRadius: "50%",
                backgroundColor: "#fef2f2",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                margin: "0 auto 1rem",
                fontSize: "1.5rem",
              }}
            >
              ⚠
            </div>
            <h1 style={{ fontSize: "1.25rem", fontWeight: 700, margin: "0 0 0.5rem" }}>
              A critical error occurred
            </h1>
            <p style={{ color: "#737373", fontSize: "0.875rem", margin: "0 0 1.5rem" }}>
              Unable to display the page. Please try again later.
            </p>
            <button
              onClick={reset}
              style={{
                padding: "0.5rem 1rem",
                borderRadius: "0.375rem",
                border: "none",
                backgroundColor: "#171717",
                color: "#ffffff",
                fontSize: "0.875rem",
                fontWeight: 500,
                cursor: "pointer",
              }}
            >
              Try again
            </button>
            {error.digest && (
              <p style={{ color: "#a3a3a3", fontSize: "0.75rem", marginTop: "1rem" }}>
                Error code: <code style={{ fontFamily: "monospace" }}>{error.digest}</code>
              </p>
            )}
          </div>
        </div>
      </body>
    </html>
  );
}
```

### 4.3 Dashboard Error Boundary 개선

**파일**: `src/app/dashboard/error.tsx`

```tsx
"use client";

import { useEffect } from "react";
import { ErrorDisplay } from "~/fsd/shared/ui/error-display";

export default function DashboardError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("Dashboard error boundary caught:", error);
  }, [error]);

  return (
    <ErrorDisplay
      title="Failed to load dashboard"
      description="Something went wrong while loading the dashboard. Please try again later."
      digest={error.digest}
      variant="section"
      showRetry
      onRetry={reset}
      showHome
    />
  );
}
```

### 4.4 Upload Detail Error Boundary (신규)

**파일**: `src/app/dashboard/uploads/[uploadedFileId]/error.tsx`

현재 `page.tsx`에서 `getUploadedFileDetails()`를 호출하며, 이 함수는 `findUniqueOrThrow`를 사용한다. 존재하지 않는 ID나 권한 없는 접근 시 throw되는 에러를 이 경계에서 잡는다.

> **참고**: `page.tsx`의 `if (!uploadedFileData) { notFound(); }` 코드는 **dead code**이다. `findUniqueOrThrow`는 데이터 없을 시 null을 반환하지 않고 throw하므로, `notFound()`는 실행되지 않는다. 실제로는 throw된 Prisma 에러가 이 error boundary에서 캐치된다. 이 기회에 해당 dead code를 `notFound()` 호출로 대체하거나 정리하는 것을 고려한다 (별도 작업).

```tsx
"use client";

import { useEffect } from "react";
import { ErrorDisplay } from "~/fsd/shared/ui/error-display";

export default function UploadDetailError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("Upload detail error boundary caught:", error);
  }, [error]);

  return (
    <ErrorDisplay
      title="Failed to load upload details"
      description="Something went wrong while loading the file details. The file may have been deleted or you may not have access."
      digest={error.digest}
      variant="section"
      showRetry
      onRetry={reset}
      showBack
      backHref="/dashboard"
      backLabel="Back to dashboard"
    />
  );
}
```

### 4.5 Billing Error Boundary (신규)

**파일**: `src/app/dashboard/billing/error.tsx`

`billing/page.tsx`는 `getBillingData()` 실패를 인라인으로 처리하지만, 런타임 에러(예: Polar API 장애)는 이 경계에서 잡는다.

```tsx
"use client";

import { useEffect } from "react";
import { ErrorDisplay } from "~/fsd/shared/ui/error-display";

export default function BillingError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("Billing error boundary caught:", error);
  }, [error]);

  return (
    <ErrorDisplay
      title="Failed to load billing information"
      description="Something went wrong while loading the billing page. Please try again later."
      digest={error.digest}
      variant="section"
      showRetry
      onRetry={reset}
      showBack
      backHref="/dashboard"
      backLabel="Back to dashboard"
    />
  );
}
```

### 4.6 Not Found 페이지 개선

**파일**: `src/app/not-found.tsx`

```tsx
import { NotFoundDisplay } from "~/fsd/shared/ui/error-display/not-found-display";

export default function NotFound() {
  return <NotFoundDisplay showHome />;
}
```

### 4.7 Auth Page Error Boundaries (낮은 우선순위)

`/login`과 `/signup` 페이지는 Google OAuth(`signIn("google")`)만 사용하므로 에러 발생 가능성이 낮다. Root error boundary가 이미 이 범위를 커버한다. 향후 OAuth 프로바이더가 추가되면 별도 error boundary를 고려한다.

---

## 5. Server Action 에러 처리 표준화

### 5.1 표준 패턴: `ActionResult<T>`

`src/fsd/shared/api/result.ts`의 `ActionResult<T>` 타입을 유일한 표준으로 확립한다:

```typescript
// 이미 존재하는 타입
export type ActionResult<T = void> =
  | { success: true; data: T }
  | { success: false; error: string };
```

### 5.2 Server Component vs Client Component 전략

Server Action의 에러 처리 방식은 **호출자의 유형**에 따라 다르다:

| 호출자 | 에러 처리 방식 | 이유 |
|--------|---------------|------|
| **Server Component** | `throw` 허용 | Next.js App Router의 관용적 패턴. throw된 에러는 가장 가까운 `error.tsx`에서 캐치됨 |
| **Client Component** | `ActionResult<T>` 반환 | 클라이언트에서 try/catch 없이 타입 안전하게 에러 처리 가능 |

따라서:
- `getUploadedFileDetails` (Server Component에서 호출) → `throw` 유지 **적절**
- `generateUploadUrl` (Client Component에서 호출) → `ActionResult<T>`로 변환 **필요**
- `processVideo` (Client Component에서 호출) → 이미 `ActionResult<void>` 반환 중, **호출부에서 결과 처리 필요**

### 5.3 마이그레이션 대상

Client Component에서 호출되면서 문제가 있는 함수만 대상이다:

| 함수 | 파일 | 호출자 | 현재 상태 | 필요 작업 |
|------|------|--------|-----------|-----------|
| `generateUploadUrl` | `src/fsd/features/upload/api/index.ts` | `UploadPodcast` (Client) | `throw` + 비정형 반환 | `ActionResult<T>`로 변환 |
| `processVideo` | `src/fsd/features/clip/api/index.ts` | `UploadPodcast` (Client) | 이미 `ActionResult<void>` 반환 | **호출부가 반환값을 무시하는 버그 수정** |

**`generateUploadUrl` 변환 예시**:

```typescript
// Before
export async function generateUploadUrl(fileInfo: {
  fileName: string;
  contentType: string;
  language: string;
}): Promise<{
  success: boolean;
  signedUrl: string;
  uploadedFileId: string;
  key: string;
}> {
  const session = await auth();
  if (!session) throw new Error("Unauthorized");
  // ...
  return { success: true, key, uploadedFileId, signedUrl };
}

// After
export async function generateUploadUrl(fileInfo: {
  fileName: string;
  contentType: string;
  language: string;
}): Promise<ActionResult<{ signedUrl: string; uploadedFileId: string; key: string }>> {
  const authResult = await requireAuth();
  if (!authResult.success) return authResult;

  try {
    const fileExtension = fileInfo.fileName.split(".").pop() ?? "";
    const uniqueId = uuidv4();
    const key = `${uniqueId}/original.${fileExtension}`;

    const signedUrl = await generatePresignedPutUrl(key, fileInfo.contentType, S3_CONFIG.PRESIGNED_PUT_URL_EXPIRY);
    const uploadedFileDbRecord = await db.uploadedFile.create({
      data: {
        userId: authResult.data.userId,
        s3Key: key,
        displayName: fileInfo.fileName,
        uploaded: false,
        language: fileInfo.language ?? "English",
      },
      select: { id: true },
    });

    return success({ key, uploadedFileId: uploadedFileDbRecord.id, signedUrl });
  } catch (error) {
    console.error("Failed to generate upload URL", error);
    return failure("Failed to generate upload URL");
  }
}
```

### 5.4 `UploadPodcast.tsx` 호출부 수정

`generateUploadUrl` 변환과 `processVideo` 결과 처리를 반영한 `UploadPodcast.tsx`의 `handleUpload` 함수 수정:

```typescript
// Before (현재 코드)
const handleUpload = async () => {
  if (files.length === 0) return;
  const file = files[0]!;
  setUploading(true);

  try {
    const { success, signedUrl, uploadedFileId } = await generateUploadUrl({
      fileName: file.name,
      contentType: file.type,
      language: language,
    });
    if (!success) throw new Error("Failed to get upload url");

    const uploadResponse = await fetch(signedUrl, { method: "PUT", body: file, headers: { "Content-Type": file.type } });
    if (!uploadResponse.ok) throw new Error("Failed to upload file");

    await processVideo(uploadedFileId, language, clipCount); // ⚠️ 반환값 무시 (기존 버그)

    setFiles([]);
    toast.success("Video uploaded successfully", { ... });
  } catch (error) {
    console.error("Failed to upload video", error);
    toast.error("Failed to upload video", { ... });
  } finally {
    setUploading(false);
  }
};

// After
const handleUpload = async () => {
  if (files.length === 0) return;
  const file = files[0]!;
  setUploading(true);

  try {
    // generateUploadUrl: ActionResult<T>로 변환됨 → data 중첩 접근
    const uploadResult = await generateUploadUrl({
      fileName: file.name,
      contentType: file.type,
      language: language,
    });

    if (!uploadResult.success) {
      toast.error(uploadResult.error);
      return;
    }

    const { signedUrl, uploadedFileId } = uploadResult.data;

    const uploadResponse = await fetch(signedUrl, {
      method: "PUT",
      body: file,
      headers: { "Content-Type": file.type },
    });
    if (!uploadResponse.ok) throw new Error("Failed to upload file");

    // processVideo: 이미 ActionResult<void> 반환 → 결과 확인 필수
    const processResult = await processVideo(uploadedFileId, language, clipCount);

    if (!processResult.success) {
      toast.error(processResult.error);
      return;
    }

    setFiles([]);
    toast.success("Video uploaded successfully", {
      description: "Your video has been scheduled for processing. Check the status below",
      duration: 5000,
    });
  } catch (error) {
    console.error("Failed to upload video", error);
    toast.error("Failed to upload video", {
      description: "There was a problem uploading your video. Please try again.",
    });
  } finally {
    setUploading(false);
  }
};
```

**핵심 변경점**:
1. `generateUploadUrl` 반환 구조: `{ success, signedUrl, ... }` → `{ success, data: { signedUrl, ... } }` (ActionResult 래핑)
2. `processVideo` 반환값: 무시 → `processResult.success` 확인 후 실패 시 toast 표시
3. 에러 시 `throw` 대신 `return`으로 early exit (ActionResult 패턴에서는 throw 불필요)

### 5.5 `src/actions/*` 레거시 파일 처리

`src/actions/` 디렉토리의 파일들은 이미 `@deprecated` 처리되어 있다. FSD 동등 함수로의 마이그레이션이 완료되면 삭제한다. 본 제안서에서는 레거시 파일 자체를 수정하지 않고, FSD 파일의 표준화에 집중한다.

---

## 6. 에러 로깅 유틸리티

### 6.1 현재 문제

모든 에러 처리 지점에서 `console.error()`를 직접 호출하며, 메시지 포맷이 제각각이다:

```typescript
// UploadDetailPage
console.error("Failed to get original play url: " + result.error);

// ClipActions (toast만 사용, console 없음)

// upload/api/index.ts
console.error("Failed to delete uploaded file with clips", error);
```

### 6.2 중앙화된 에러 로거

**파일**: `src/fsd/shared/lib/error-logger.ts`

```typescript
/**
 * 중앙화된 에러 로깅 유틸리티.
 * 외부 에러 리포팅 서비스 도입 시 이 파일만 수정하면 됨.
 */
export function logError(context: string, error: unknown): void {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`[${context}] ${message}`, error);
}

/**
 * unknown 타입의 에러에서 사용자에게 보여줄 메시지를 추출한다.
 */
export function getErrorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  return String(error);
}
```

**적용 효과**:
- 외부 에러 리포팅 서비스 도입 시 이 파일만 수정하면 프로젝트 전체에 자동 적용
- 일관된 로그 포맷: `[context] message`
- `getErrorMessage` 유틸리티로 `error instanceof Error ? error.message : String(error)` 중복 제거

### 6.3 적용 예시

```typescript
// Before (UploadDetailPage)
} catch (error) {
  const message = error instanceof Error ? error.message : String(error);
  toast.error("Failed to get original play url: " + message);
  console.error("Failed to get original play url: " + message);
}

// After
import { logError, getErrorMessage } from "~/fsd/shared/lib/error-logger";

} catch (error) {
  logError("UploadDetailPage.fetchOriginalPlayUrl", error);
  toast.error("Failed to get original play url: " + getErrorMessage(error));
}
```

---

## 7. 구현 우선순위 및 일정

### Phase 1: 공유 컴포넌트 생성 (0.5일)

| 순서 | 작업 | 파일 |
|------|------|------|
| 1-1 | ErrorDisplay 컴포넌트 생성 | `src/fsd/shared/ui/error-display/index.tsx` |
| 1-2 | NotFoundDisplay 컴포넌트 생성 | `src/fsd/shared/ui/error-display/not-found-display.tsx` |
| 1-3 | error-logger 유틸리티 생성 | `src/fsd/shared/lib/error-logger.ts` |

### Phase 2: Error Boundary 개선 및 신규 생성 (1일)

| 순서 | 작업 | 파일 | 유형 |
|------|------|------|------|
| 2-1 | Root error.tsx 개선 | `src/app/error.tsx` | 수정 |
| 2-2 | global-error.tsx 개선 | `src/app/global-error.tsx` | 수정 |
| 2-3 | Dashboard error.tsx 개선 | `src/app/dashboard/error.tsx` | 수정 |
| 2-4 | Upload detail error.tsx 생성 | `src/app/dashboard/uploads/[uploadedFileId]/error.tsx` | 신규 |
| 2-5 | Billing error.tsx 생성 | `src/app/dashboard/billing/error.tsx` | 신규 |
| 2-6 | not-found.tsx 개선 | `src/app/not-found.tsx` | 수정 |

### Phase 3: Server Action 패턴 표준화 (0.5일)

| 순서 | 작업 | 파일 |
|------|------|------|
| 3-1 | `generateUploadUrl`을 `ActionResult`로 변환 | `src/fsd/features/upload/api/index.ts` |
| 3-2 | `UploadPodcast` 호출부 수정 (`generateUploadUrl` ActionResult 대응 + `processVideo` 반환값 처리 버그 수정) | `src/fsd/pages/dashboard/ui/_component/UploadPodcast.tsx` |
| 3-3 | 클라이언트 컴포넌트에서 error-logger 적용 (선택) | 여러 파일 |

> **주의**: 3-1과 3-2는 반드시 **단일 커밋**으로 처리해야 한다. `generateUploadUrl`의 반환 타입이 변경되므로 호출부를 동시에 수정하지 않으면 빌드가 깨진다.

### Phase 4: 검증 (0.5일)

| 순서 | 작업 | 방법 |
|------|------|------|
| 4-1 | 정적 분석 | `npm run check` (lint + typecheck) 통과 확인 |
| 4-2 | 에러 시나리오 수동 테스트 | 각 라우트에서 에러 유발 후 error boundary UI 확인 |
| 4-3 | 404 테스트 | 존재하지 않는 경로 접근 시 not-found UI 확인 |
| 4-4 | 액션 에러 테스트 | 네트워크 차단 후 Server Action 실행, toast 에러 확인 |

**총 예상 공수**: 2-3일

---

## 8. 영향도 분석

### 8.1 수정 대상 파일 전체 목록

| # | 파일 경로 | 작업 유형 |
|---|-----------|-----------|
| 1 | `src/fsd/shared/ui/error-display/index.tsx` | 신규 생성 |
| 2 | `src/fsd/shared/ui/error-display/not-found-display.tsx` | 신규 생성 |
| 3 | `src/fsd/shared/lib/error-logger.ts` | 신규 생성 |
| 4 | `src/app/error.tsx` | 수정 |
| 5 | `src/app/global-error.tsx` | 수정 |
| 6 | `src/app/dashboard/error.tsx` | 수정 |
| 7 | `src/app/dashboard/uploads/[uploadedFileId]/error.tsx` | 신규 생성 |
| 8 | `src/app/dashboard/billing/error.tsx` | 신규 생성 |
| 9 | `src/app/not-found.tsx` | 수정 |
| 10 | `src/fsd/features/upload/api/index.ts` | 수정 (generateUploadUrl) |
| 11 | `src/fsd/pages/dashboard/ui/_component/UploadPodcast.tsx` | 수정 (호출부) |

**신규 5개, 수정 6개, 삭제 0개**

### 8.2 Breaking Changes

| 변경 | Breaking? | 영향 범위 |
|------|-----------|-----------|
| Error boundary UI 개선 | 아님 | 동일 인터페이스, 더 나은 UX |
| `generateUploadUrl` 반환 타입 변경 | **Yes** | `UploadPodcast.tsx` 1개소 수정 필요 — 구조 분해 패턴이 `{ success, signedUrl }` → `result.data.signedUrl`으로 변경됨 |
| `processVideo` 반환값 처리 추가 | **동작 변경** | `UploadPodcast.tsx`에서 failure 시 기존에는 성공 처리되던 것이 에러 toast로 변경됨 (버그 수정) |
| error-logger 도입 | 아님 | 기존 코드 수정 없이 새 코드부터 적용 가능 |

### 8.3 FSD 레이어 규칙 준수

| 컴포넌트 | 레이어 | import 가능한 곳 |
|----------|--------|-----------------|
| `ErrorDisplay`, `NotFoundDisplay` | `shared/ui` | app/, pages/, widgets/, features/ |
| `error-logger` | `shared/lib` | 모든 레이어 |
| `error.tsx` 파일들 | `app/` (FSD 외부) | shared 레이어 import 허용 |

모든 import 방향이 FSD 규칙(상위 → 하위만 허용)을 준수한다.

### 8.4 롤백 계획

- Phase별 독립 커밋으로 관리
- ErrorDisplay 도입은 기존 error.tsx와 1:1 교체이므로 즉시 롤백 가능
- `generateUploadUrl` 변환은 호출부까지 함께 변경하므로 단일 커밋으로 관리

### 8.5 권장 커밋 전략

```
feat(shared): add ErrorDisplay and NotFoundDisplay components
feat(shared): add centralized error-logger utility
feat(error): enhance root, dashboard, and global error boundaries
feat(error): add upload-detail and billing error boundaries
feat(error): enhance 404 not-found page with NotFoundDisplay
refactor(upload): standardize generateUploadUrl to ActionResult pattern and fix processVideo result handling
```
