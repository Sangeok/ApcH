---
status: "completed"
stage: null
proposal-size: "standard"
created-at: "2026-06-16"
approved-by: null
approved-at: null
approval-scope: null
completed-at: "2026-06-16"
verification-summary: "마이그레이션 전 문서. 개별 검증 기록 없음"
closed-at: null
closed-by: null
closed-reason: null
owners: []
related: []
---

# Admin Funnel Analytics Proposal

Date: 2026-06-16

## Goal

AI Podcast Clipper 안에서 관리자가 사용자 이탈 지점을 확인할 수 있는 1st-party 퍼널 분석 기능을 만든다. 외부 분석 도구를 먼저 붙이지 않고, 현재 프로젝트의 Next.js App Router, NextAuth, Prisma/PostgreSQL 구조를 활용해 핵심 이벤트만 저장하고 `/admin/analytics`에서 전환율과 이탈률을 조회한다.

## Recommendation

현재 단계에서는 자체 DB에 제한된 이벤트만 저장하는 방식이 가장 적합하다.

- 이미 Prisma/PostgreSQL과 인증 구조가 있다.
- 사용자가 원하는 결과는 외부 콘솔이 아니라 관리자 페이지다.
- 현재 개인정보 처리방침은 "analytics or advertising cookies"를 사용하지 않는다고 명시한다.
- 이 프로젝트의 핵심 퍼널은 방문, 로그인, 업로드, 처리 예약, 클립 확인, 결제로 좁게 정의할 수 있다.
- 모든 클릭이나 세션 리플레이를 저장하지 않고 의미 있는 단계 이벤트만 저장하면 운영 DB 부담을 통제할 수 있다.

Firebase/GA4, PostHog, BigQuery는 나중에 마케팅 유입 분석이나 대규모 이벤트 분석이 필요할 때 확장 대상으로 남긴다. 이 제안의 구현은 추적 인터페이스를 `trackAnalyticsEvent()` 하나로 감싸서, 나중에 저장소를 바꾸더라도 호출부를 크게 바꾸지 않게 한다.

## Current Project Context

- App: `ai-podcast-clipper-frontend`
- Framework: Next.js 15 App Router
- Auth: NextAuth v5 beta, JWT session strategy, Google OAuth
- Database: Prisma + PostgreSQL/Neon
- UI structure: Feature-Sliced Design under `src/fsd`
- Existing protected area: `/dashboard`
- Existing marketing routes: `/`, `/about`, `/ai-podcast-clipper`, `/changelog`, `/compare`, `/compare/manual-editing-vs-ai-podcast-clipping`, `/contact`, `/features`, `/guides`, `/guides/[slug]`, `/how-it-works`, `/podcast-to-shorts`, `/pricing`, `/product-tour`, `/security`, `/youtube-shorts-generator`
- Existing public legal/auth routes: `/login`, `/signup`, `/privacy`, `/terms`
- Existing business flow:
  - Public marketing page
  - `/login`
  - Google OAuth
  - `/dashboard`
  - File selection
  - `prepareUpload()`
  - S3 direct upload
  - `confirmUploadObjectExists()`
  - `scheduleUploadedFileProcessing()`
  - Upload detail and clip viewing
  - `/dashboard/billing`
  - Polar checkout

## Non-Goals

This first implementation should not include:

- Heatmaps
- Session replay
- Mouse movement tracking
- Every button click in the product
- Ad attribution
- Cross-device identity stitching before login
- Real-time streaming dashboard
- User-level surveillance UI

## Scope Classification

Core for this implementation:

- `AnalyticsEvent` persistence, Prisma migration, and regenerated Prisma client artifacts under `generated/prisma`.
- First-party client event tracking with duplicate guards.
- Event recording API with strict validation and server-derived `userId`.
- Admin-only `/admin/analytics` page.
- Acquisition, upload activation, and billing funnel tables.
- Observed last-step drop-off table.
- Recent upload-related failure table.
- 90-day raw event cleanup registered through the existing Inngest route.
- Privacy policy update for first-party product analytics.

Phase 2:

- Charts beyond tables.
- External warehouse/export integration such as BigQuery, PostHog, Firebase, or ClickHouse.
- User role management UI.
- Fine-grained event sampling controls.
- Marketing campaign attribution.

Out of scope:

- Heatmaps, session replay, mouse tracking, and all-click capture.
- Cross-device identity stitching before login.
- Storing IP addresses for analytics.
- Changing payment, upload processing, or entitlement business logic.

The first version should answer these product questions:

- Which step loses the most users?
- Do users reach login but fail to start Google sign-in?
- Do users reach dashboard but fail to select a file?
- Do users select a file but fail during upload or processing scheduling?
- Do users view billing but fail to start checkout?
- Which pages are the last observed page or event before a session stops?

## Architecture

Use a small first-party event pipeline:

```txt
Client components
  -> trackAnalyticsEvent()
  -> POST /api/analytics/events
  -> validate body with zod
  -> attach session userId on the server when available
  -> insert AnalyticsEvent row with Prisma
  -> /admin/analytics aggregates recent events
```

Important constraints:

- The client must never send `userId`. The API route derives it from `auth()`.
- Do not store uploaded file names, email addresses, raw URLs with sensitive query params, or S3 keys in analytics metadata.
- Use `localStorage` for an anonymous visitor ID and `sessionStorage` for a browser-session ID. This avoids analytics cookies while still allowing anonymous funnel grouping.
- Exclude `/admin/*` from analytics tracking.
- Deduplicate route, page-exit, upload-detail, clip-play, and checkout-success events so React re-renders, polling, Strict Mode development behavior, and browser lifecycle events do not inflate counts.
- Store only a compact event payload.
- Retain raw events for 90 days by default and enforce that with a scheduled cleanup function.

## Data Model

Modify `prisma/schema.prisma`.

Add a relation to `User`:

```prisma
model User {
    id              String    @id @default(cuid())
    name            String?
    email           String    @unique
    emailVerified   DateTime?
    password        String?
    credits         Int       @default(3)
    polarCustomerId String?   @unique
    image           String?
    accounts        Account[]
    sessions        Session[]

    uploadedFiles UploadedFile[]
    clips         Clip[]
    subscription  Subscription?
    orders        Order[]
    analyticsEvents AnalyticsEvent[]
}
```

Add the event model:

```prisma
model AnalyticsEvent {
    id          String   @id @default(cuid())
    name        String
    anonymousId String   @db.VarChar(80)
    sessionId   String   @db.VarChar(80)
    path        String   @db.VarChar(512)
    referrer    String?  @db.VarChar(512)
    metadata    Json?
    createdAt   DateTime @default(now())

    user   User?   @relation(fields: [userId], references: [id], onDelete: Cascade)
    userId String?

    @@index([name, createdAt])
    @@index([anonymousId, createdAt])
    @@index([sessionId, createdAt])
    @@index([userId, createdAt])
    @@index([path, createdAt])
    @@index([createdAt])
}
```

Use `onDelete: Cascade` for the `User` relation. This keeps the existing privacy-policy account deletion promise coherent: user-linked analytics rows are deleted when the user record is deleted. Anonymous pre-login rows with `userId = null` remain pseudonymous raw analytics and are still subject to the 90-day cleanup.

Why not a Prisma enum for event names:

- The event catalog is product logic and may change more often than DB schema.
- Keeping `name` as `String` allows adding low-risk event names without a migration.
- Runtime validation still restricts accepted names in the API route.

## Event Catalog

Create `src/fsd/shared/analytics/event-catalog.ts`.

Why this lives in `shared/analytics`:

- Client instrumentation is used from widgets, pages, and existing feature slices such as billing.
- Same-layer feature-to-feature imports are forbidden by the repository FSD guide, so `features/billing` must not import a `features/analytics-tracking` slice.
- The DB-backed analytics entity can import shared analytics constants, but shared browser tracking code must not import the analytics entity or Prisma-backed server modules.

Recommended event names:

```ts
export const ANALYTICS_EVENT_NAMES = [
  "landing_view",
  "marketing_page_view",
  "login_view",
  "cta_clicked",
  "login_started",
  "dashboard_viewed",
  "upload_file_selected",
  "upload_options_changed",
  "upload_started",
  "upload_prepare_failed",
  "upload_s3_completed",
  "upload_s3_failed",
  "upload_confirmed",
  "upload_confirmation_failed",
  "processing_scheduled",
  "processing_schedule_failed",
  "upload_detail_viewed",
  "clip_viewed",
  "billing_viewed",
  "billing_cta_clicked",
  "checkout_started",
  "checkout_returned_success",
  "page_exited",
] as const;

export type AnalyticsEventName = (typeof ANALYTICS_EVENT_NAMES)[number];
```

Create `src/fsd/entities/analytics-event/index.ts`.

Responsibilities:

- Re-export server-side analytics API functions from `./api`.
- Keep client tracking imports away from this root barrel because the root barrel exposes DB-backed server functions.
- Client files should import `AnalyticsEventName` and `ANALYTICS_EVENT_NAMES` directly from `~/fsd/shared/analytics/event-catalog` or from the browser-safe `~/fsd/shared/analytics` barrel.
- Server files such as `src/inngest/functions.ts`, `src/app/api/analytics/events/route.ts`, and `src/app/admin/analytics/page.tsx` may import DB-backed functions from `~/fsd/entities/analytics-event`.

Recommended root export:

```ts
export {
  cleanupExpiredAnalyticsEvents,
  getAnalyticsOverview,
  getDropOffReport,
  getFunnelReport,
  getRecentFailureEvents,
  recordAnalyticsEvent,
} from "./api";
```

Create `src/fsd/entities/analytics-event/model/types.ts`.

Responsibilities:

- Export shared server/UI analytics types used by the entity API and admin page.
- Keep these as plain TypeScript types, not client state.
- Do not import DB clients or server-only modules from this file.

Recommended type surface:

```ts
import type { AnalyticsEventName } from "~/fsd/shared/analytics/event-catalog";

export type AnalyticsDateRangeKey = "7d" | "30d" | "90d";
export type FunnelId = "acquisition" | "activation" | "billing";

export type AnalyticsDateRangeInput = {
  range: AnalyticsDateRangeKey;
};

export type RecordAnalyticsEventInput = {
  name: AnalyticsEventName;
  anonymousId: string;
  sessionId: string;
  path: string;
  referrer?: string | null;
  metadata?: Record<string, unknown>;
  userId?: string | null;
};

export type FunnelReportInput = AnalyticsDateRangeInput & {
  funnel: FunnelId;
};

export type FunnelStepReport = {
  step: AnalyticsEventName;
  visitors: number;
  conversionFromPrevious: number | null;
  dropOffFromPrevious: number | null;
  dropOffRateFromPrevious: number | null;
};

export type DropOffReportRow = {
  eventName: AnalyticsEventName;
  path: string;
  sessions: number;
  share: number;
};

export type RecentFailureEventRow = {
  eventName: AnalyticsEventName;
  path: string;
  count: number;
  lastSeenAt: Date;
};

export type AnalyticsOverview = {
  uniqueVisitors: number;
  loggedInUsers: number;
  totalEvents: number;
  dashboardConversionRate: number | null;
};
```

Event metadata should stay small and non-sensitive.

Allowed metadata examples:

```ts
{
  location: "home_hero",
  cta: "create_free_workspace"
}
```

```ts
{
  fileType: "video/mp4",
  fileSizeMb: 128.4,
  language: "English",
  clipCount: 3
}
```

```ts
{
  uploadedFileId: "clx...",
  status: "processed",
  visibleClipsCount: 3
}
```

Metadata that should not be sent:

- File name
- Email
- S3 key
- Signed URL
- OAuth callback URL
- Full `document.location.href` including arbitrary query params
- Error stack trace
- Raw payment provider identifiers unless there is a specific operational need

Metadata allowlist:

Create the allowlist in `src/fsd/shared/analytics/event-catalog.ts` next to the event names so the API route and product instrumentation use one source of truth.

```ts
export const ANALYTICS_METADATA_KEYS_BY_EVENT = {
  landing_view: [],
  marketing_page_view: [],
  login_view: [],
  cta_clicked: ["location", "cta"],
  login_started: ["provider"],
  dashboard_viewed: [],
  upload_file_selected: ["fileType", "fileSizeMb", "language", "clipCount"],
  upload_options_changed: ["fileType", "fileSizeMb", "language", "clipCount"],
  upload_started: ["fileType", "fileSizeMb", "language", "clipCount"],
  upload_prepare_failed: ["stage"],
  upload_s3_completed: ["fileType", "fileSizeMb"],
  upload_s3_failed: ["stage"],
  upload_confirmed: ["uploadedFileId"],
  upload_confirmation_failed: ["uploadedFileId", "stage"],
  processing_scheduled: ["uploadedFileId", "recoveredByReconciliation"],
  processing_schedule_failed: ["uploadedFileId", "stage"],
  upload_detail_viewed: ["uploadedFileId", "status", "visibleClipsCount"],
  clip_viewed: ["clipId", "uploadedFileId"],
  billing_viewed: [],
  billing_cta_clicked: ["tier", "billingInterval"],
  checkout_started: ["tier", "billingInterval"],
  checkout_returned_success: [],
  page_exited: ["dwellTimeMs"],
} as const satisfies Record<AnalyticsEventName, readonly string[]>;
```

The API route must drop metadata keys that are not listed for the submitted event. The client should still avoid sending sensitive data; the allowlist is a server-side defense, not a replacement for safe instrumentation.

## Funnel Definitions

Create `src/fsd/entities/analytics-event/model/funnels.ts`.

Use separate funnels instead of one long funnel. A single user may enter directly at login, dashboard, or billing, so separate funnels produce less misleading drop-off rates.

### Public Acquisition Funnel

```txt
landing_view
cta_clicked
login_view
login_started
dashboard_viewed
```

Interpretation:

- `landing_view -> cta_clicked`: Marketing page CTA effectiveness.
- `cta_clicked -> login_view`: Client-side navigation and route transition.
- `login_view -> login_started`: Login page friction.
- `login_started -> dashboard_viewed`: OAuth completion.

### Upload Activation Funnel

```txt
dashboard_viewed
upload_file_selected
upload_started
upload_s3_completed
processing_scheduled
clip_viewed
```

Interpretation:

- `dashboard_viewed -> upload_file_selected`: Dashboard clarity.
- `upload_file_selected -> upload_started`: Upload options and button friction.
- `upload_started -> upload_s3_completed`: Direct S3 upload reliability.
- `upload_s3_completed -> processing_scheduled`: Confirmation and dispatch reliability.
- `processing_scheduled -> clip_viewed`: Processing success and user return behavior.

### Billing Funnel

```txt
billing_viewed
billing_cta_clicked
checkout_started
checkout_returned_success
```

Interpretation:

- `billing_viewed -> billing_cta_clicked`: Pricing page clarity.
- `billing_cta_clicked -> checkout_started`: Checkout URL generation and redirect.
- `checkout_started -> checkout_returned_success`: Polar checkout completion.

## Admin Access

Add a small admin guard before building the dashboard.

Recommended first version: environment allowlist.

Modify `src/env.js` server schema:

```ts
ADMIN_EMAILS: z.string().optional(),
```

Add to `runtimeEnv`:

```ts
ADMIN_EMAILS: process.env.ADMIN_EMAILS,
```

Also add `ADMIN_EMAILS=""` to `.env.example` under the auth/admin configuration area so local setup and deployment review surface the new variable.

Create `src/fsd/shared/api/admin-guard.ts`:

```ts
import "server-only";

import { notFound, redirect } from "next/navigation";
import { env } from "~/env";
import { auth } from "~/server/auth";

function getAdminEmailSet() {
  return new Set(
    (env.ADMIN_EMAILS ?? "")
      .split(",")
      .map((email) => email.trim().toLowerCase())
      .filter(Boolean),
  );
}

export async function requireAdmin() {
  const session = await auth();

  if (!session?.user?.id) {
    redirect("/login");
  }

  const email = session.user.email?.toLowerCase();
  const adminEmails = getAdminEmailSet();

  if (!email || !adminEmails.has(email)) {
    notFound();
  }

  return {
    userId: session.user.id,
    email,
  };
}
```

Modify `src/server/auth/config.edge.ts`:

```ts
const PROTECTED_ROUTES = ["/dashboard", "/admin"];
```

Modify `src/middleware.ts` so the edge auth middleware actually runs for admin routes:

```ts
export const config = {
  matcher: ["/dashboard/:path*", "/admin/:path*", "/login"],
};
```

Why environment allowlist first:

- The project currently has no user role model.
- The expected admin count is small.
- It avoids role migration and admin role management UI in the first version.

Future alternative:

- Add `role String @default("user")` to `User`.
- Use role checks in `requireAdmin()`.
- Keep `ADMIN_EMAILS` as emergency fallback.

## Files To Create

Create missing parent directories before writing files:

```txt
src/app/admin
src/app/api/analytics/events
src/fsd/entities/analytics-event/api
src/fsd/entities/analytics-event/model
src/fsd/pages/admin-analytics/lib
src/fsd/pages/admin-analytics/model
src/fsd/pages/admin-analytics/ui
src/fsd/shared/analytics
src/fsd/shared/analytics/lib
src/fsd/shared/analytics/ui
```

```txt
prisma/migrations/<timestamp>_add_analytics_events/migration.sql
src/app/admin/layout.tsx
src/app/admin/analytics/page.tsx
src/app/api/analytics/events/route.ts
src/fsd/entities/analytics-event/index.ts
src/fsd/entities/analytics-event/api/index.ts
src/fsd/entities/analytics-event/model/funnels.ts
src/fsd/entities/analytics-event/model/types.ts
src/fsd/pages/admin-analytics/ui/index.tsx
src/fsd/pages/admin-analytics/model/types.ts
src/fsd/pages/admin-analytics/lib/format-rate.ts
src/fsd/shared/analytics/index.ts
src/fsd/shared/analytics/event-catalog.ts
src/fsd/shared/analytics/lib/anonymous-id.ts
src/fsd/shared/analytics/lib/normalize-path.ts
src/fsd/shared/analytics/lib/track-event.ts
src/fsd/shared/analytics/ui/AnalyticsTracker.tsx
src/fsd/shared/analytics/ui/TrackedLink.tsx
src/fsd/shared/api/admin-guard.ts
```

## Files To Modify

```txt
prisma/schema.prisma
.env.example
src/env.js
src/server/auth/config.edge.ts
src/middleware.ts
src/app/providers.tsx
src/app/privacy/page.tsx
src/app/api/inngest/route.ts
src/inngest/functions.ts
src/fsd/widgets/site-header/ui/index.tsx
src/fsd/widgets/site-header/ui/public-header.tsx
src/fsd/shared/ui/atoms/seo-page-hero.tsx
src/fsd/pages/home/ui/_component/HeroSection.tsx
src/fsd/pages/home/ui/_component/CtaSection.tsx
src/fsd/widgets/login-form/ui/index.tsx
src/fsd/pages/dashboard/ui/_component/UploadPodcast.tsx
src/fsd/pages/dashboard/model/useUploadPodcast.ts
src/fsd/pages/upload-detail/ui/index.tsx
src/fsd/widgets/clip-display/ui/_component/ClipCard.tsx
src/fsd/widgets/clip-display/ui/_component/ClipVideoPlayer.tsx
src/fsd/features/billing/ui/BillingPage.tsx
src/fsd/features/billing/ui/PlanCard.tsx
generated/prisma/schema.prisma
generated/prisma/index.d.ts
generated/prisma/index.js
generated/prisma/index-browser.js
generated/prisma/client.d.ts
generated/prisma/client.js
generated/prisma/default.d.ts
generated/prisma/default.js
generated/prisma/edge.d.ts
generated/prisma/edge.js
generated/prisma/wasm.d.ts
generated/prisma/wasm.js
```

Do not hand-edit files under `generated/prisma`. They are listed because this repository commits the Prisma generator output; update them by running the migration/generation command and review the resulting diff.

## Tracking API

Create `src/app/api/analytics/events/route.ts`.

Behavior:

- Accept `POST`.
- Require `Content-Type: application/json`.
- Parse JSON body.
- Validate event name, anonymous ID, session ID, path, referrer, and metadata.
- Use `auth()` to attach `userId` when available.
- Reject requests where the client tries to send `userId`.
- Reject bodies over a small size limit before insert. Check `Content-Length` before parsing when present, and also reject after parsing when `new TextEncoder().encode(JSON.stringify(parsedBody)).length` exceeds the same byte limit.
- Normalize and redact the path server-side before insert. Do not trust the client-supplied path as already safe.
- Return `204` without inserting when the normalized path starts with `/admin`.
- Return `204` on success.
- Return `400` for invalid input.
- Return `204` when an insert fails in production after logging the server error. Analytics failure should not break product usage.

Suggested schema shape:

```ts
const MAX_ANALYTICS_EVENT_BODY_BYTES = 4096;

const analyticsEventBodySchema = z
  .object({
    name: z.enum(ANALYTICS_EVENT_NAMES),
    anonymousId: z.string().min(8).max(80).regex(/^[a-zA-Z0-9_-]+$/),
    sessionId: z.string().min(8).max(80).regex(/^[a-zA-Z0-9_-]+$/),
    path: z.string().min(1).max(512),
    referrer: z.string().max(512).optional(),
    metadata: z.record(z.unknown()).optional(),
  })
  .strict();
```

Metadata sanitization:

- Convert `undefined` to absent values before insert.
- Reject metadata with serialized JSON length over 2048 characters.
- Store only keys listed in `ANALYTICS_METADATA_KEYS_BY_EVENT` for the event being recorded. Unknown metadata keys should be dropped before insert, not stored.
- Store only JSON primitive metadata values after sanitization. Drop nested objects, arrays, and values with the wrong type for the allowed key.
- Use per-key value constraints:
  - `fileSizeMb`, `clipCount`, `visibleClipsCount`, and `dwellTimeMs` must be finite non-negative numbers.
  - `recoveredByReconciliation` must be boolean.
  - `location`, `cta`, `provider`, `stage`, `uploadedFileId`, `clipId`, `status`, `tier`, and `billingInterval` must be strings with conservative max lengths.
- Never store request IP in `AnalyticsEvent`.
- Normalize `path` to a pathname plus safe query allowlist. Do not store arbitrary query params.
- Normalize dynamic product paths before storage. At minimum, `/dashboard/uploads/<uploadedFileId>` must be stored as `/dashboard/uploads/[uploadedFileId]` so admin tables do not expose per-upload IDs through the path column.
- Normalize `referrer` to origin plus normalized pathname when it is a valid URL. Strip query strings and hashes before insert, and apply the same dynamic path redaction to same-origin referrers.

Recommended safe query allowlist:

```ts
const SAFE_QUERY_PARAMS_BY_PATH: Record<string, readonly string[]> = {
  "/dashboard/billing": ["success"],
};
```

## Shared Analytics Tracking Library

Create `src/fsd/shared/analytics/index.ts`.

Responsibilities:

- Re-export the browser-safe analytics catalog, `trackAnalyticsEvent`, `AnalyticsTracker`, and `TrackedLink`.
- Do not export DB-backed analytics entity functions from this shared barrel.
- Do not import from `~/fsd/entities/analytics-event` or any other higher FSD layer.

Create `src/fsd/shared/analytics/lib/anonymous-id.ts`.

Responsibilities:

- `getAnonymousId()` returns a stable browser ID from `localStorage`.
- `getSessionId()` returns a tab/session ID from `sessionStorage`.
- Both use `crypto.randomUUID()` when available.
- Fallback uses timestamp and random string.
- Functions no-op on the server.
- Browser storage access is wrapped in `try/catch`; if localStorage or sessionStorage is unavailable, use an in-memory best-effort ID for the current page lifetime and never throw into product flows.
- Fallback IDs must match the API regex `^[a-zA-Z0-9_-]+$`.

Create `src/fsd/shared/analytics/lib/normalize-path.ts`.

Responsibilities:

- Export a pure `normalizeAnalyticsPath(input: string)` helper that can run on both server and client.
- Preserve only pathname plus safe query params.
- Redact `/dashboard/uploads/<uploadedFileId>` to `/dashboard/uploads/[uploadedFileId]`.
- Return `null` for invalid or empty paths.

Create `src/fsd/shared/analytics/lib/track-event.ts`.

Responsibilities:

- Export `trackAnalyticsEvent(name, metadata?)`.
- Add `anonymousId`, `sessionId`, current `path`, and `document.referrer`.
- Return `Promise<void>` so redirecting flows can await a best-effort send before navigation.
- Exclude admin routes:

```ts
if (window.location.pathname.startsWith("/admin")) return;
```

- Use `fetch("/api/analytics/events", { method: "POST", keepalive: true, headers: { "Content-Type": "application/json" }, ... })`.
- Swallow errors because analytics must not interrupt product flows.
- Accept an optional `{ timeoutMs?: number }` argument. For flows that immediately leave the app, such as Google OAuth and Polar checkout, call `await trackAnalyticsEvent(..., { timeoutMs: 750 })` before starting the redirect. Use `AbortController` or `Promise.race` with timer cleanup so analytics never blocks the redirect for more than 750 ms.

Create `src/fsd/shared/analytics/ui/AnalyticsTracker.tsx`.

Responsibilities:

- Client component.
- Uses `usePathname()`.
- Emits route-level events on path change.
- Emits `page_exited` with dwell time on `visibilitychange` and `pagehide`.
- Registers `visibilitychange` and `pagehide` listeners inside `useEffect` and removes both listeners in the effect cleanup.
- Uses refs to prevent duplicate page-view events for the same pathname and duplicate `page_exited` events for the same page instance.
- Resets its page-exit guard when `pathname` changes.

Route event mapping:

```ts
function getPageEventName(pathname: string): AnalyticsEventName | null {
  if (pathname === "/") return "landing_view";
  if (pathname === "/login") return "login_view";
  if (pathname === "/dashboard") return "dashboard_viewed";
  if (pathname === "/dashboard/billing") return "billing_viewed";
  if (pathname.startsWith("/dashboard/uploads/")) return null;
  if (pathname.startsWith("/admin")) return null;
  return "marketing_page_view";
}
```

`/dashboard/uploads/*` intentionally returns `null` here. The upload detail page emits `upload_detail_viewed` itself because it has access to `uploadedFileId`, status, and visible clip count. Do not emit the same event from both the global route tracker and the upload detail page.

Modify `src/app/providers.tsx`:

```tsx
import { AnalyticsTracker } from "~/fsd/shared/analytics";

export default function Providers({ children }: { children: ReactNode }) {
  return (
    <QueryClientProvider client={getQueryClient()}>
      <AnalyticsTracker />
      {children}
    </QueryClientProvider>
  );
}
```

Create `src/fsd/shared/analytics/ui/TrackedLink.tsx`.

Responsibilities:

- Client component wrapping `next/link`.
- Accepts `eventName`, `metadata`, and normal `Link` props.
- Forwards `className`, anchor props, and ref to the underlying `next/link` element so it works inside existing `Button asChild` / Radix `Slot` usage.
- Calls `trackAnalyticsEvent()` in `onClick`.
- Calls a caller-provided `onClick` after analytics is scheduled.
- Used by server components that cannot attach click handlers directly.

## Product Instrumentation Points

All browser instrumentation imports must come from `~/fsd/shared/analytics`. Do not import from a same-layer feature slice, and do not import DB-backed analytics entity functions into client components.

### Public Header

File: `src/fsd/widgets/site-header/ui/public-header.tsx`

Track login button clicks:

```tsx
<TrackedLink
  href="/login"
  eventName="cta_clicked"
  metadata={{
    location: "public_header",
    cta: "log_in",
  }}
>
  Log in
</TrackedLink>
```

Because `PublicHeader`, `HeroSection`, and `CtaSection` are server components, use `TrackedLink` instead of adding `onClick` handlers directly to `next/link` in those files.

### Root Home Header

File: `src/fsd/widgets/site-header/ui/index.tsx`

This is the header used by the root `/` home page. It is already a client component, but use the same `TrackedLink` for consistency.

Track:

- Logged-out `Log in` as `cta_clicked` with `{ location: "home_header", cta: "log_in" }`
- Public nav items as `cta_clicked` with `{ location: "home_header_nav", cta: item.href }`

### Shared SEO Page Hero

File: `src/fsd/shared/ui/atoms/seo-page-hero.tsx`

Most non-home marketing pages render their primary `/login` CTA through this shared server component. Track both CTA slots with `TrackedLink`:

- `primaryCta` as `cta_clicked` with `{ location: "seo_page_hero_primary", cta: primaryCta.href }`
- `secondaryCta` as `cta_clicked` with `{ location: "seo_page_hero_secondary", cta: secondaryCta.href }`

This covers the current shared `primaryCta` usage in:

- `src/fsd/pages/ai-podcast-clipper/ui/index.tsx`
- `src/fsd/pages/compare/ui/index.tsx`
- `src/fsd/pages/features/ui/index.tsx`
- `src/fsd/pages/guides/ui/index.tsx`
- `src/fsd/pages/podcast-to-shorts/ui/index.tsx`
- `src/fsd/pages/pricing/ui/index.tsx`
- `src/fsd/pages/product-tour/ui/index.tsx`
- `src/fsd/pages/resources/ui/index.tsx`
- `src/fsd/pages/youtube-shorts-generator/ui/index.tsx`

### Home Hero

File: `src/fsd/pages/home/ui/_component/HeroSection.tsx`

Track:

- `Create a free workspace` as `cta_clicked` with `{ location: "home_hero", cta: "create_free_workspace" }`
- `See product tour` as `cta_clicked` with `{ location: "home_hero", cta: "product_tour" }`
- `Read guides` as `cta_clicked` with `{ location: "home_hero", cta: "guides" }`

### Home CTA Section

File: `src/fsd/pages/home/ui/_component/CtaSection.tsx`

Track:

- `Start free trial` as `cta_clicked` with `{ location: "home_cta", cta: "start_free_trial" }`

### Login Form

File: `src/fsd/widgets/login-form/ui/index.tsx`

Before `signInWithGoogle()`, await the analytics send because OAuth immediately leaves the app:

```ts
await trackAnalyticsEvent(
  "login_started",
  { provider: "google" },
  { timeoutMs: 750 },
);
await signInWithGoogle();
```

### Dashboard Tabs

File: `src/fsd/pages/dashboard/ui/index.tsx`

Do not modify dashboard tab tracking in the first implementation. The route-level `dashboard_viewed` event is enough for the activation funnel. Do not emit `clip_viewed` from the `My Clips` tab; `clip_viewed` must mean an actual generated clip video was played.

### Upload Form

File: `src/fsd/pages/dashboard/ui/_component/UploadPodcast.tsx`

Track:

- `upload_file_selected` inside `handleFileDrop()`
- `upload_options_changed` when language or clip count changes after a file is selected. Do not emit when the clicked option is the current value or when no accepted file exists.
- Include only:

```ts
{
  fileType: file.type,
  fileSizeMb: Math.round((file.size / 1024 / 1024) * 10) / 10,
  language,
  clipCount
}
```

Do not include `file.name`.

### Upload Process

File: `src/fsd/pages/dashboard/model/useUploadPodcast.ts`

Track:

- `upload_started` when `upload()` begins
- `upload_prepare_failed` when `prepareUpload()` fails
- `upload_s3_completed` after `uploadFileToS3()` resolves
- `upload_s3_failed` in the catch branch if S3 upload is the failing stage
- `upload_confirmed` after confirmation or successful reconciliation
- `upload_confirmation_failed` when confirmation cannot be verified
- `processing_scheduled` after `scheduleUploadedFileProcessing()` succeeds
- `processing_scheduled` when `scheduleUploadedFileProcessing()` returns failure but `reconcileProcessingRequest()` shows the upload has reached `pending_enqueue`, `queued`, `processing`, or `processed`; include `{ uploadedFileId, recoveredByReconciliation: true }`
- `processing_schedule_failed` when scheduling fails and reconciliation fails, still shows `upload_pending`, or shows terminal `failed` / `no credits`

Implementation detail:

Maintain a local stage variable:

```ts
let stage:
  | "prepare"
  | "s3_upload"
  | "confirm"
  | "schedule"
  | "complete" = "prepare";
```

Update it before each async step. In `catch`, emit the failure event matching the stage.

### Upload Detail And Clips

File: `src/fsd/pages/upload-detail/ui/index.tsx`

Track `upload_detail_viewed` once per mounted upload detail page. Use a `useRef` guard keyed by `uploadedFileId` so TanStack Query polling and status refreshes do not re-emit the page view.

This page-level event is the only source of `upload_detail_viewed`; the global `AnalyticsTracker` must return `null` for `/dashboard/uploads/*`.
The stored event `path` must be normalized to `/dashboard/uploads/[uploadedFileId]`; the concrete upload ID belongs only in allowlisted metadata, not in the path used by admin tables.

```ts
{
  uploadedFileId,
  status,
  visibleClipsCount
}
```

File: `src/fsd/widgets/clip-display/ui/_component/ClipCard.tsx`

Pass `clip.id` and `clip.uploadedFileId` into `ClipVideoPlayer`.

File: `src/fsd/widgets/clip-display/ui/_component/ClipVideoPlayer.tsx`

Track `clip_viewed` on first play per mounted video. Add `"use client"` and a `useRef` guard so pausing and replaying the same mounted video does not count as multiple views.
`clip.uploadedFileId` is nullable in the generated Prisma type, so pass it as `string | null` and include `uploadedFileId` in metadata only when it is non-null.

```ts
trackAnalyticsEvent("clip_viewed", {
  clipId,
  ...(uploadedFileId ? { uploadedFileId } : {}),
});
```

Current code evidence: `ClipCard` already receives the full `clip`, and `ClipVideoPlayer` currently receives only `src`, `isLoading`, and `error`. Modify both files rather than querying clip details from the client.

### Billing

File: `src/fsd/features/billing/ui/BillingPage.tsx`

When `showSuccessBanner` is true, emit once per checkout success page load. Use a `useRef` guard because this component currently polls and calls `router.refresh()` while subscription activation is pending.

```ts
trackAnalyticsEvent("checkout_returned_success");
```

File: `src/fsd/features/billing/ui/PlanCard.tsx`

Before `getCheckoutUrl(productId)`:

```ts
const billingInterval =
  productId === productIds.pro_yearly ? "yearly" : "monthly";

trackAnalyticsEvent("billing_cta_clicked", {
  tier,
  billingInterval,
});
```

After `getCheckoutUrl(productId)` succeeds and before `window.location.href = result.data.url`:

```ts
await trackAnalyticsEvent("checkout_started", {
  tier,
  billingInterval,
}, { timeoutMs: 750 });
```

Then perform the redirect:

```ts
window.location.href = result.data.url;
```

## Retention Cleanup

The privacy policy will state a 90-day raw analytics retention period, so the implementation must enforce cleanup in Core.

Modify `src/fsd/entities/analytics-event/api/index.ts` to export:

```ts
export async function cleanupExpiredAnalyticsEvents(now = new Date()) {
  const cutoff = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000);

  return db.analyticsEvent.deleteMany({
    where: {
      createdAt: {
        lt: cutoff,
      },
    },
  });
}
```

Modify `src/inngest/functions.ts`:

```ts
import { cleanupExpiredAnalyticsEvents } from "~/fsd/entities/analytics-event";

export const cleanupAnalyticsEvents = inngest.createFunction(
  {
    id: "cleanup-analytics-events",
    retries: 1,
  },
  { cron: "0 3 * * *" },
  async ({ step }) => {
    return step.run("delete-expired-analytics-events", async () => {
      return cleanupExpiredAnalyticsEvents();
    });
  },
);
```

Modify `src/app/api/inngest/route.ts`:

```ts
import { cleanupAnalyticsEvents, processVideo } from "~/inngest/functions";

export const { GET, POST, PUT } = serve({
  client: inngest,
  functions: [processVideo, cleanupAnalyticsEvents],
});
```

This re-introduces a scheduled (cron) Inngest function. Reconcile this against recent history before implementing. Commit `431861d` ("delete cron event", 2026-06-12), immediately after `fbc76b8` ("optimize Neon idle cron and dashboard polling"), **removed the only two cron-triggered Inngest functions this project had** — `processingMaintenanceSweep` (`*/15 * * * *`) and `uploadDraftSweep` (`0 * * * *`) — and moved that maintenance onto on-demand paths (dashboard load, `reconcileProcessingRequest`). As a result, the current `src/app/api/inngest/route.ts` registers **only the event-triggered `processVideo`**; there is no longer any cron precedent to "extend".

**Decision (accepted, owner, 2026-06-16): add the single daily `cleanup-analytics-events` cron.** Rationale: it wakes Neon at most once per day for one bounded delete — far lighter than the removed every-15-minute / hourly sweeps — and keeps the 90-day privacy promise self-enforcing without depending on an admin opening a page. This intentionally moves the project from zero crons back to one low-frequency cron; it is a deliberate, narrowly-scoped reversal of `431861d`, not an oversight, and should be called out in the implementing commit so the cron is not "cleaned up" again by mistake.

Rejected alternative (kept only as a fallback if Inngest scheduled functions cannot be enabled in the deployment environment): enforce retention with a Vercel Cron hitting a protected route, or by piggybacking the bounded delete on an already-scheduled / high-traffic server path. "Cleanup only when an admin opens the dashboard" remains rejected (see Operational Safeguards) because it makes the privacy promise depend on admin behavior.

The Inngest cron API shape is verified against this codebase: the removed `processingMaintenanceSweep` / `uploadDraftSweep` used the same `inngest.createFunction({ id, retries }, { cron: "..." }, handler)` form this proposal uses, so the cron is mechanically sound. Do not ship the privacy-policy "90-day retention" copy until the cron is actually live and verified (Inngest scheduled functions enabled in the deployment environment, and `cleanup-analytics-events` confirmed in the Inngest function list).

### Neon Compute Impact

`cleanupAnalyticsEvents` is a cleanup-only scheduled function. Do not use this cron for analytics aggregation, dashboard precomputation, or funnel calculation.

If the Neon database has scaled to zero, this scheduled function may wake compute once per day. This is acceptable for the first implementation because the job runs one bounded retention delete query and then Neon can scale down again after the idle window. (Context: the recently removed sweeps ran every 15 minutes and hourly; this job runs once daily, so it is far lighter on Neon idle than what was removed in `431861d`. See the cron decision note in Retention Cleanup above before adding it.)

Keep the cron daily while the privacy policy promises 90-day raw analytics retention. If event volume grows enough that retention deletion becomes expensive, replace the single delete with batched deletion or daily aggregate tables.

## Admin Data Queries

Create `src/fsd/entities/analytics-event/api/index.ts`.

Start the file with `import "server-only";` because it imports Prisma/DB-backed code and is re-exported from the analytics entity root barrel.

Required functions:

```ts
export async function recordAnalyticsEvent(input: RecordAnalyticsEventInput) {}
export async function getAnalyticsOverview(input: AnalyticsDateRangeInput) {}
export async function getFunnelReport(input: FunnelReportInput) {}
export async function getDropOffReport(input: AnalyticsDateRangeInput) {}
export async function getRecentFailureEvents(input: AnalyticsDateRangeInput) {}
export async function cleanupExpiredAnalyticsEvents(now?: Date) {}
```

For the first version, aggregate in application code over a bounded date range.

Recommended default ranges:

- 7 days
- 30 days
- 90 days

Enforce a maximum range of 90 days in the admin API/query function.

Overview calculation:

- `uniqueVisitors`: distinct `anonymousId` values in range.
- `loggedInUsers`: distinct non-null `userId` values in range.
- `totalEvents`: total event rows in range.
- `dashboardConversionRate`: distinct `anonymousId` visitors with `landing_view` followed later by `dashboard_viewed`, divided by distinct `anonymousId` visitors with `landing_view` in range. Return `null` when there are no `landing_view` visitors. Label the card as "Landing-to-dashboard conversion" so direct dashboard entrants are not misread as failed acquisition traffic. Do not count dashboard-only direct entrants in this numerator, otherwise the rate can exceed 100%.

Visitor key:

```ts
const visitorKey = `anon:${event.anonymousId}`;
```

Use `anonymousId` as the funnel visitor key because acquisition events start before login and continue after OAuth redirects back into the app. If the funnel key switches to `userId` after login, `login_started -> dashboard_viewed` will be split across two different visitors and the acquisition funnel will undercount completion. Keep `userId` for logged-in user counts and drilldowns, not for first-version funnel continuity.

Session key:

```ts
const sessionKey = `${event.anonymousId}:${event.sessionId}`;
```

Funnel calculation:

1. Query events where `createdAt` is inside the selected range and `name` is in the selected funnel.
2. Group by visitor key.
3. Sort each visitor's events by `createdAt`.
4. Count a step only if it appears after the previous counted step.
5. For each step, calculate:
   - `visitors`
   - `conversionFromPrevious`
   - `dropOffFromPrevious`
   - `dropOffRateFromPrevious`

Drop-off report:

1. Query meaningful events in the selected range.
2. Exclude `page_exited` from "last meaningful event".
3. Group by session key.
4. Sort events by `createdAt`.
5. Last event per session is the observed stop point.
6. Count by `name + path`.

Failure report:

Filter event names:

```ts
[
  "upload_prepare_failed",
  "upload_s3_failed",
  "upload_confirmation_failed",
  "processing_schedule_failed",
]
```

Group by name and path, then show count and most recent timestamp.

## Admin Page UI

Create route:

```txt
src/app/admin/layout.tsx
src/app/admin/analytics/page.tsx
```

`src/app/admin/layout.tsx`:

- Calls `requireAdmin()`.
- Shows a simple admin header.
- Uses `robots: { index: false, follow: false }`.

`src/app/admin/analytics/page.tsx`:

- Calls `requireAdmin()`.
- Reads `range` and `funnel` from `searchParams`.
- Use the current Next.js 15 page prop style used elsewhere in this project: `searchParams` is a `Promise`, so await it before parsing.
- Defaults to `range=30d` and `funnel=activation`.
- Calls analytics query functions.
- Renders `AdminAnalyticsPage`.

Recommended page prop shape:

```ts
type AdminAnalyticsRouteProps = {
  searchParams: Promise<{
    range?: string;
    funnel?: string;
  }>;
};
```

Create `src/fsd/pages/admin-analytics/ui/index.tsx`.

Create `src/fsd/pages/admin-analytics/model/types.ts`.

Responsibilities:

- Export `AdminAnalyticsPageProps`.
- Reuse entity-level analytics DTO types from `~/fsd/entities/analytics-event/model/types`.
- Do not duplicate funnel calculation types in the page layer.

Create `src/fsd/pages/admin-analytics/lib/format-rate.ts`.

Responsibilities:

- Export a small formatter for nullable rate values.
- Return `"--"` for `null`.
- Format finite numbers as percentages with one decimal place.

First version layout:

```txt
Admin Analytics

[7 days] [30 days] [90 days]

Overview cards:
- Unique visitors
- Logged-in users
- Total tracked events
- Landing-to-dashboard conversion

Funnel selector:
[Acquisition] [Upload Activation] [Billing]

Funnel table:
Step | Visitors | Conversion from previous | Drop-off | Drop-off rate

Observed drop-off table:
Last step | Path | Sessions | Share | Suggested interpretation

Recent failures:
Event | Count | Last seen | Primary affected path
```

Use existing UI atoms:

- `Button`
- `Card`
- `Badge`
- `Tabs`
- `Table`

Do not add charts in the first version. Tables are enough to validate the data and avoid adding a chart dependency. If charts are wanted later, add `recharts` or a lightweight SVG component after the data model is proven.

Do not add a `/admin` index page in the first implementation. `/admin/analytics` is the exposed admin surface. If an index route is desired later, add `src/app/admin/page.tsx` that redirects to `/admin/analytics`.

## Privacy Policy Update

Modify `src/app/privacy/page.tsx`.

Current policy says:

```txt
We only use cookies required for authentication. We do not use analytics or advertising cookies.
```

Keep that statement true by not using analytics cookies. Add a separate browser storage and product analytics disclosure.

Recommended additions:

Service Usage Data table:

```txt
Product analytics events
Pseudonymous page and product milestone events used to understand onboarding, upload, processing, and billing drop-off.
```

Cookies section:

```txt
We only use cookies required for authentication. We do not use analytics or advertising cookies. We use local browser storage to keep a pseudonymous analytics identifier and session identifier for first-party product analytics.
```

Data retention table:

```txt
Product analytics events
90 days
```

Clarify that 90 days is the maximum raw analytics retention period. User-linked analytics rows are deleted earlier when the linked account is deleted because `AnalyticsEvent.user` uses `onDelete: Cascade`.

Also update the effective date to the release date of the analytics feature.

Data protection section:

```txt
Product analytics events do not include uploaded file names, video URLs, S3 keys, payment card details, or OAuth tokens.
```

## Migration And Commands

From `ai-podcast-clipper-frontend`, create the migration during development:

```bash
npm run db:generate -- --name add_analytics_events
npx prisma validate
npm run typecheck
npm run build
```

Equivalent direct Prisma command:

```bash
npx prisma migrate dev --name add_analytics_events
npx prisma validate
npm run typecheck
npm run build
```

This project sets `generator client { output = "../generated/prisma" }` and imports Prisma types from `generated/prisma`. After migration/generation, inspect the final generated artifacts:

```bash
git diff --stat -- prisma generated/prisma
git diff -- prisma/schema.prisma generated/prisma/schema.prisma
```

Expected:

- A new committed migration directory exists under `prisma/migrations`.
- `prisma/schema.prisma` and `generated/prisma/schema.prisma` both include `AnalyticsEvent` and `User.analyticsEvents`.
- Generated TypeScript surfaces expose `AnalyticsEvent` and `analyticsEvent` delegate types.
- Any generated diff outside the analytics schema change is reviewed before commit.

Current repository evidence: before this proposal is implemented, `generated/prisma/schema.prisma` is already stale relative to `prisma/schema.prisma` for several existing indexes on `UploadedFile` and `ProcessingDispatch`. After running Prisma generation, review those pre-existing generated-schema/index diffs separately from the analytics change instead of assuming every generated diff was caused by `AnalyticsEvent`.

In production deployment, apply the committed migration:

```bash
npm run db:migrate
```

Add production environment variable:

```txt
ADMIN_EMAILS=hamsoo159@gmail.com
```

If multiple admins are needed:

```txt
ADMIN_EMAILS=hamsoo159@gmail.com,another-admin@example.com
```

## Implementation Sequence

### Phase 1: Schema And Admin Access

- Create the missing parent directories listed in Files To Create.
- Add `AnalyticsEvent` to `prisma/schema.prisma`.
- Add `analyticsEvents` relation to `User`.
- Run the Prisma migration/generation command so `prisma/migrations/<timestamp>_add_analytics_events/migration.sql` and committed `generated/prisma` artifacts are updated.
- Add `ADMIN_EMAILS` to `src/env.js`.
- Add `ADMIN_EMAILS` to `.env.example`.
- Create `src/fsd/shared/api/admin-guard.ts`.
- Protect `/admin` in `src/server/auth/config.edge.ts`.
- Add `/admin/:path*` to `src/middleware.ts` matcher.
- Add `/admin/layout.tsx`.
- Verify non-admin users get `notFound()`.
- Verify unauthenticated users are redirected to `/login`.
- Verify the positive path: an email listed in `ADMIN_EMAILS` can load `/admin/analytics`. `requireAdmin()` depends on `session.user.email`, but the existing `src/fsd/shared/api/auth-guard.ts` only reads `session.user.id` — so confirm `session.user.email` is actually populated in the JWT session (it is exposed via NextAuth's default user claims; the `jwt` callback in `src/server/auth/config.ts` does not strip it) before relying on the allowlist.

### Phase 2: Shared Catalog And Event Recording API

- Create the shared analytics event catalog and browser-safe analytics barrel under `src/fsd/shared/analytics`.
- Create entity funnel files that import event-name types from the shared catalog.
- Create analytics entity API with `recordAnalyticsEvent()`.
- Create analytics cleanup API with `cleanupExpiredAnalyticsEvents()`.
- Create `POST /api/analytics/events`.
- Validate all input with zod.
- Sanitize metadata through `ANALYTICS_METADATA_KEYS_BY_EVENT` and drop unknown keys.
- Ensure user ID is attached server-side only.
- Ensure requests that include client-supplied `userId` return `400`.
- Ensure invalid event names return `400`.
- Ensure a valid anonymous event creates a DB row.
- Ensure a logged-in event creates a DB row with `userId`.

### Phase 3: Client Tracking

- Create anonymous ID and session ID helpers.
- Create `trackAnalyticsEvent()`.
- Create `AnalyticsTracker`.
- Create `TrackedLink`.
- Mount tracker in `src/app/providers.tsx`.
- Confirm route events are recorded for `/`, `/login`, `/dashboard`, `/dashboard/billing`.
- Confirm `/dashboard/uploads/*` is not tracked by the global route tracker.
- Confirm `/admin/*` does not record events.
- Confirm an explicit POST with `path: "/admin/analytics"` returns `204` and does not create an `AnalyticsEvent` row.
- Confirm upload-detail and clip-view events store `path = "/dashboard/uploads/[uploadedFileId]"`, not the concrete upload ID path.
- Confirm repeated renders do not duplicate page views for the same pathname.
- Confirm `page_exited` is emitted at most once per page instance.

### Phase 4: Core Product Events

- Add tracked CTA clicks in `PublicHeader`, root home header, home hero, home CTA section, and shared `SeoPageHero` CTA slots.
- Add `login_started`.
- Add upload selected/options/upload stage events.
- Add clip view event on first video play only.
- Add billing and checkout events.
- Confirm no sensitive values are included in metadata.
- Confirm metadata values with nested objects, arrays, or the wrong primitive type are dropped and not stored.
- Confirm `checkout_returned_success` is emitted once despite billing page polling.
- Confirm `checkout_started` is awaited before redirecting to Polar.

### Phase 5: Admin Analytics UI

- Implement overview query.
- Implement funnel report query.
- Implement drop-off report query.
- Implement recent failure query.
- Create `/admin/analytics`.
- Render date range controls.
- Render funnel selector.
- Render tables.
- Add empty states for no data.
- Register `cleanupAnalyticsEvents` in the existing Inngest route.

### Phase 6: Privacy And Verification

- Update privacy policy.
- Run Prisma migration.
- Run typecheck and build.
- Manually walk through:
  - Visit home
  - Click CTA
  - Visit login
  - Start Google login
  - Visit dashboard
  - Select file
  - Start upload
  - Visit billing
- Start checkout in sandbox
- Confirm `/admin/analytics?range=7d&funnel=activation` shows the expected counts.
- Confirm the Inngest introspection output includes `cleanup-analytics-events`.
- Confirm `npx prisma validate`, `npm run typecheck`, and `npm run build` pass after generated Prisma artifacts are updated.
- Confirm no current feature slice imports a same-layer analytics feature path; analytics client imports should resolve to `~/fsd/shared/analytics`.

## Manual Verification Checklist

Use browser DevTools Network panel:

- `POST /api/analytics/events` fires after visiting `/`.
- Request body contains `name`, `anonymousId`, `sessionId`, `path`.
- Request body does not contain `userId`.
- Request body does not contain file name after file selection.
- Request body path for upload detail may contain the browser route, but the stored database `path` is `/dashboard/uploads/[uploadedFileId]`.
- Requests that include unknown metadata keys do not persist those keys in the database.
- Requests that include allowed metadata keys with nested object/array values or invalid primitive types do not persist those invalid values.
- `/admin/analytics` page does not emit analytics events.
- A forged POST for an `/admin/*` path is ignored server-side and does not create a row.
- Clicking a `SeoPageHero` primary CTA such as `/pricing -> /login` emits `cta_clicked` with `location: "seo_page_hero_primary"`.
- Visiting `/dashboard/uploads/[uploadedFileId]` creates exactly one `upload_detail_viewed` event with upload metadata.
- Visiting the same route through client re-renders does not create duplicate page-view rows.
- `pagehide` and `visibilitychange` do not create duplicate `page_exited` rows for the same page instance.
- Repeated route changes or component remounts do not leave duplicate `visibilitychange` or `pagehide` listeners active.

Use Prisma Studio or SQL:

```sql
select name, path, "userId", "createdAt"
from "AnalyticsEvent"
order by "createdAt" desc
limit 20;
```

Expected:

- Anonymous marketing events have `userId = null`.
- Logged-in dashboard and upload events have `userId` set.
- Upload detail and clip view rows have redacted upload-detail paths.
- `anonymousId` remains stable in the same browser.
- `sessionId` resets after closing the tab session.

Use admin page:

- Acquisition funnel should show counts for `landing_view`, `cta_clicked`, `login_view`, `login_started`, `dashboard_viewed`.
- Activation funnel should show counts for `dashboard_viewed`, `upload_file_selected`, `upload_started`, `upload_s3_completed`, `processing_scheduled`, `clip_viewed`.
- Billing funnel should show counts for `billing_viewed`, `billing_cta_clicked`, `checkout_started`, `checkout_returned_success`.

Use Inngest dev server or deployed Inngest function list:

- `cleanup-analytics-events` is registered.
- A manual run or scheduled run deletes rows older than 90 days.

## Operational Safeguards

Raw event volume should remain small because only page views and milestone events are tracked. Expected events per activated user session are roughly:

```txt
2-5 marketing/login events
1 dashboard_viewed
1 upload_file_selected
1 upload_started
1 upload_s3_completed
1 upload_confirmed
1 processing_scheduled
1-3 clip/billing events
```

At 1,000 active sessions per month, this is likely under 20,000 rows per month. PostgreSQL can handle this comfortably with the proposed indexes.

Retention cleanup is part of Core and runs through Inngest:

```ts
await db.analyticsEvent.deleteMany({
  where: {
    createdAt: {
      lt: new Date(Date.now() - 90 * 24 * 60 * 60 * 1000),
    },
  },
});
```

Do not use a protected admin action as the only cleanup mechanism; that would make the 90-day privacy statement depend on an admin visiting the page.

When event volume exceeds about 100,000 rows per month or dashboard queries become slow:

- Add daily aggregate tables, or
- Export to BigQuery/ClickHouse/PostHog, or
- Keep the same `trackAnalyticsEvent()` frontend API and replace the backend storage.

## Risks And Mitigations

### Analytics events can be missed

Client-side analytics can be blocked or dropped during navigation. The dashboard should be used for product trend analysis, not financial reconciliation.

Mitigation:

- Server-side business state remains the source of truth for uploads, clips, orders, and subscriptions.
- Critical product milestones that already happen on the server can be emitted server-side later if exact accounting is needed.

### Admin access can be misconfigured

If `ADMIN_EMAILS` is empty in production, no one can access `/admin`.

Mitigation:

- Document the env var in deployment notes.
- Keep the route returning `notFound()` for non-admins.
- Verify `ADMIN_EMAILS` before deployment.

### DB growth can become noisy

Analytics rows grow faster than business records.

Mitigation:

- Track only milestone events.
- Add 90-day retention.
- Keep metadata compact.
- Add aggregate storage only after real query pressure appears.

### Privacy policy must stay accurate

The project currently says it does not use analytics cookies. This remains true only if the implementation uses local storage/session storage and does not add GA/Firebase cookies.

Mitigation:

- Update privacy policy before release.
- Do not include third-party analytics scripts in this implementation.

## Acceptance Criteria

Implementation is complete when:

- `/admin/analytics` is accessible only to emails in `ADMIN_EMAILS`.
- `.env.example` documents `ADMIN_EMAILS`.
- `src/middleware.ts` includes `/admin/:path*` in the matcher.
- Public, login, dashboard, upload, clip, billing, and checkout events are recorded.
- Analytics API never accepts `userId` from the client.
- Analytics API ignores `/admin/*` paths server-side and does not insert admin analytics rows.
- Analytics API stores only metadata keys listed for each event in `ANALYTICS_METADATA_KEYS_BY_EVENT`.
- Analytics API drops invalid metadata values with nested objects, arrays, or wrong primitive types.
- Analytics API normalizes `/dashboard/uploads/<uploadedFileId>` paths to `/dashboard/uploads/[uploadedFileId]` before storage.
- File names, signed URLs, S3 keys, and emails are not stored in event metadata.
- Concrete upload IDs are not exposed through the `path` column or admin path tables.
- Route, page-exit, upload-detail, clip-play, and checkout-success events have duplicate guards.
- `upload_detail_viewed` is emitted only by `src/fsd/pages/upload-detail/ui/index.tsx`, not by the global route tracker.
- Browser analytics imports resolve to `~/fsd/shared/analytics`; no existing feature slice imports a peer `features/analytics-tracking` slice.
- Admin page shows 7/30/90 day ranges.
- Admin page shows acquisition, activation, and billing funnels.
- Landing-to-dashboard conversion counts only visitors who had `landing_view` and later reached `dashboard_viewed`, divided by landing visitors.
- Admin page shows last observed drop-off points.
- Admin page shows recent upload-related failure events.
- Inngest registers `cleanup-analytics-events`.
- Raw analytics events older than 90 days are deleted by the cleanup function.
- Privacy policy mentions first-party product analytics and 90-day retention.
- The committed Prisma migration and generated Prisma artifacts expose `AnalyticsEvent`.
- `npm run typecheck` passes.
- `npm run build` passes.
