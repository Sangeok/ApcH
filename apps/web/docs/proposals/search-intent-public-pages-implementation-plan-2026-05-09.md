# 검색 의도별 공개 페이지 구현 설계

기준일: 2026-05-09 KST
최종 검토/보정일: 2026-05-10 KST
대상 문서: `docs/proposals/google-search-visibility-growth-plan-2026-05-09.md`
대상 섹션: `## 5. Priority 1: 검색 의도별 공개 페이지 추가`
대상 프로젝트: `ai-podcast-clipper-frontend`

이 문서의 코드 블록은 현재 코드베이스 컨벤션(TS strict, prettier 2-space, double-quote, kebab-case 폴더, FSD 레이어, `~` alias, `verbatimModuleSyntax: true`)을 기준으로 한다. 실제 적용 시에는 `npm.cmd run check`와 `npm.cmd run build`로 최종 검증한다.

> **구현 기준 메모**: 현재 저장소에는 별도 `fsd-architecture-guidelines.md` 문서가 없다. 따라서 이 문서는 현재 코드의 실제 import 패턴을 기준으로 한다. `shared`는 상위 FSD 레이어를 import하지 않고, `widgets`끼리 직접 조립하는 별도 shell widget을 만들지 않는다. 신규 공개 페이지 셸은 Next.js `app/` route group layout에서 조립한다.

---

## 1. 구현 목표

현재 `https://a-pch.com/`는 Google 색인에는 등록되어 있지만 공개 콘텐츠가 홈/약관/개인정보처리방침 중심이라 검색 의도별 노출 신호가 약하다. 이 설계의 목표는 아래 6개 공개 페이지를 추가해 Google과 사용자가 제품을 더 명확히 이해하도록 만드는 것이다.

1. `/product-tour`
2. `/features`
3. `/pricing`
4. `/ai-podcast-clipper`
5. `/podcast-to-shorts`
6. `/youtube-shorts-generator`

핵심 원칙:

- 한 페이지를 여러 키워드에 억지로 맞추지 않는다.
- 각 페이지는 하나의 검색 의도만 담당한다.
- 로그인하지 않아도 제품 기능, 흐름, 가격, 결과물을 이해할 수 있어야 한다.
- 모든 페이지는 Next App Router의 `metadata`, `alternates.canonical`, `sitemap`, 내부 링크에 반영한다.
- 디자인은 기존 atoms(`Button`, `Badge`, `Card`)를 재사용하고, 신규 페이지는 제품 설명과 실제 워크플로우 중심으로 구성한다.
- CTA는 정적 링크로만 구현한다 — `/login` 라우트가 이미 logged-in 사용자를 `/dashboard`로 redirect 하므로(`src/app/login/page.tsx:17`) 세션 분기 없이 동일 UX 제공.
- 신규 공개 페이지는 세션 조회 없이 정적 렌더링을 유지한다. 공개 SEO 페이지에서 header 개인화보다 crawl/cache 안정성이 더 중요하다.

---

## 2. 코드베이스 현황 확인 (구현 전 필수 점검)

이 설계가 의존하는 코드베이스 사실은 다음과 같다. 구현 전 그대로인지 한 번 더 확인한다.

| 영역 | 파일 | 사실 |
| --- | --- | --- |
| 사이트 메타 | `src/fsd/shared/lib/site.ts` | `SITE_URL`(기본 `https://a-pch.com`), `SITE_NAME`(`AI Podcast Clipper`), `absoluteSiteUrl(path)` export 됨 |
| 루트 메타데이터 | `src/app/layout.tsx` | `metadataBase: new URL(SITE_URL)`, `title.template: '%s | ${SITE_NAME}'` 설정됨. 하위 `metadata.title`은 문자열만 넣으면 자동으로 ` | AI Podcast Clipper` 가 붙는다 |
| 사이트맵 | `src/app/sitemap.ts` | 현재 `/`, `/terms`, `/privacy` 3개. `LAST_UPDATED = new Date("2026-03-22")` 상수 사용 |
| robots | `src/app/robots.ts` | `disallow: ["/dashboard", "/api/", "/login"]`. 신규 공개 페이지는 자동 허용됨 |
| JSON-LD | `src/fsd/shared/lib/seo.ts` | `generateWebApplicationJsonLd()`만 존재. FAQ 미구현 |
| 홈 SEO | `src/app/page.tsx` | `metadata.alternates.canonical: absoluteSiteUrl("/")` 설정 + `<script type="application/ld+json">`로 JSON-LD 주입. 현재 `openGraph.alternateLocale: "ko_KR"`도 있으므로 root layout과 함께 제거 대상 |
| 홈 컴포넌트 | `src/fsd/pages/home/ui/index.tsx` | SiteHeader/SiteFooter를 직접 import 해서 자체 셸 구성. `max-w-6xl px-6 pb-16` 컨테이너 |
| 홈 CTA 정리 | `src/fsd/pages/home/ui/_component/HeroSection.tsx:27`, `:33` | primary CTA는 `/login`으로, `See product tour`는 `/product-tour`로 교체한다. `/dashboard` 직접 링크는 공개 hero에서 제거한다 |
| Header | `src/fsd/widgets/site-header/ui/index.tsx` | `"use client"`. props: `{ isLoggedIn, email, image? }`. 현재 nav 없이 브랜드 + 로그인/아바타만 |
| Footer | `src/fsd/widgets/site-footer/ui/index.tsx` | 서버 컴포넌트. `/terms`, `/privacy` 링크만 있음 |
| 세션 조회 | `src/fsd/entities/user` | 홈 페이지는 `getHomeUserProfile(userId)`로 개인화 header를 만든다. 신규 공개 SEO 페이지에서는 사용하지 않는다 |
| 인증 | `src/server/auth` | `auth = cache(uncachedAuth)` 로 React `cache` wrap. 신규 공개 SEO 페이지 layout에서는 호출하지 않는다 |
| Login redirect | `src/app/login/page.tsx:17` | 로그인된 사용자는 `redirect("/dashboard")` 로 자동 이동. 따라서 모든 공개 CTA href = `/login` 으로 두면 양쪽 상태 모두 정상 동작 |
| 결제/플랜 | `src/fsd/features/billing/config/index.ts` | 현재 `PLAN_TIERS`와 `getProductIds()`가 같은 모듈에 있음. public pricing은 `process.env`가 섞인 index가 아니라 신규 `plan-tiers.ts` 순수 모듈에서 `PLAN_TIERS`를 import하도록 분리 |
| 구독 토글 | `src/env.js` | `NEXT_PUBLIC_SUBSCRIPTION_ENABLED`(기본 `false`). 실제 checkout 가능 여부는 `/dashboard/billing`에서만 판단한다. 공개 `/pricing`은 이 env를 읽지 않는 정적 정보 페이지로 둔다 |
| 처리 한도 | `src/fsd/shared/config/constants.ts` | `MAX_FILE_SIZE = 900MB`, `CLIP_COUNT_OPTIONS = [1,2,3,4]`, `SUPPORTED_LANGUAGES = ['English', 'Korean']` |
| 크레딧 차감 | `src/inngest/functions.ts` | 현재 처리 시작 전에는 `credits <= 0`만 차단하고, 성공 후 생성된 clip 수만큼 차감하되 0 미만으로 내려가지 않게 처리한다. 공개 pricing은 이 정책과 모순되면 안 된다 |
| Path alias | `tsconfig.json` | `~/* -> ./src/*` |
| FSD import 경계 | 현재 코드 관찰 기준 | `shared`에서 `entities/features/widgets/pages`를 import하지 않는다. `app/` route/layout은 여러 FSD 레이어를 조립할 수 있다 |

> 위 표가 "현재 그대로"인지만 확인하면 이 문서의 코드 블록은 그대로 적용 가능하다.

---

## 3. 우선순위와 릴리스 순서

### Phase 1 — 평가/전환 핵심 (최우선)

1. `(public-marketing)` route group + layout
2. `/product-tour` (홈 hero의 잘못된 링크 즉시 정리)
3. `/features`
4. `/pricing`

### Phase 2 — 검색 의도 랜딩

5. `/podcast-to-shorts`
6. `/youtube-shorts-generator`
7. `/ai-podcast-clipper` (홈과 가장 중복되기 쉽기 때문에 마지막)

각 페이지는 H1, hero copy, FAQ가 모두 고유해야 한다. 동일 키워드 페이지들은 검색 의도와 플랫폼 범위로 차별화한다.

---

## 4. 구조 결정 — Route Group + Layout

신규 6개 페이지는 **Next.js route group** `(public-marketing)/` 아래 둔다. 라우트 그룹은 URL에 영향을 주지 않으므로 `/product-tour`, `/features` 등의 URL은 보존되며, group 내부 `layout.tsx` 가 PublicHeader / `<main>` / SiteFooter 를 한 곳에서 조립한다.

```text
src/app/
  page.tsx                              # 기존 홈 (그대로 유지, 자체 셸)
  terms/page.tsx                        # 기존 (그대로)
  privacy/page.tsx                      # 기존 (그대로)
  (public-marketing)/                   # 신규 route group
    layout.tsx                          # 공통 셸 (header + main + footer)
    product-tour/page.tsx
    features/page.tsx
    pricing/page.tsx
    podcast-to-shorts/page.tsx
    youtube-shorts-generator/page.tsx
    ai-podcast-clipper/page.tsx
```

### 왜 widget이 아니라 route group 인가

- `src/fsd/widgets/public-page-shell/` 같은 shell widget을 만들면 그 widget이 `PublicHeader`와 `SiteFooter`를 다시 조립하게 된다. 현재 코드에서는 이런 widget 간 shell 조립 패턴이 없다.
- `src/fsd/shared/lib/getPublicPageSessionInfo.ts` 같은 헬퍼를 만들면 `shared`가 `entities` 또는 `server/auth`에 의존하게 된다. 현재 import 경계와 맞지 않는다.
- Next.js `app/` layout은 FSD 레이어들을 조립하는 라우팅 계층이므로 정적 `PublicHeader`와 `SiteFooter`를 함께 import해도 구조상 자연스럽다.
- Route group `(name)`은 URL에 영향 없이 layout 적용 범위만 한정한다. 홈/terms/privacy는 기존 구조를 유지한다.
- 신규 공개 SEO 페이지는 세션 조회 없이 정적으로 렌더링한다. header는 익명 상태(`Log in`)로 고정한다.

### Layout 코드

파일: `src/app/(public-marketing)/layout.tsx`

```tsx
import SiteFooter from "~/fsd/widgets/site-footer/ui";
import PublicHeader from "~/fsd/widgets/site-header/ui/public-header";

export default function PublicMarketingLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="bg-background text-foreground">
      <div className="mx-auto flex min-h-screen w-full max-w-6xl flex-col px-6 pb-16">
        <PublicHeader />
        <main className="flex flex-1 flex-col gap-20 py-6">{children}</main>
        <SiteFooter />
      </div>
    </div>
  );
}
```

설계 메모:

- `React.ReactNode` 는 `@types/react` 가 글로벌로 제공 — `src/app/layout.tsx:72` 가 동일 패턴으로 import 없이 사용 중. `verbatimModuleSyntax: true` 와 충돌 없음.
- 장식용 `gradient orb`/`blur` div는 의도적으로 포함하지 않는다. 공개 평가 페이지는 정보 스캔 가능성을 우선한다.
- `<main>` `gap-20` (`py-6`)으로 섹션 간격 80px. 홈(`gap-24`)보다 살짝 좁아 텍스트 밀도가 높은 SEO 페이지에 맞다.
- `auth()`와 DB 조회가 없으므로 신규 6개 공개 페이지는 정적 prerender 대상이 될 수 있다.
- 로그인 사용자가 공개 페이지에서 CTA를 누르면 `/login` 라우트가 기존 로직대로 `/dashboard`로 redirect한다. 공개 페이지 header가 로그인 사용자에게도 `Log in`으로 보이는 것은 SEO/cache 안정성을 위해 허용한다.
- 공개 route group은 client `SiteHeader`를 직접 import하지 않는다. `SiteHeader`는 `next-auth/react`와 dropdown client bundle을 포함하므로, 검색 랜딩 페이지에서는 정적 `PublicHeader`를 사용해 불필요한 JS를 줄인다.
- 단, root `src/app/layout.tsx`가 모든 route를 client `Providers`/React Query provider로 감싸고 있으므로, 공개 페이지의 전체 First Load JS가 0에 가깝게 줄어드는 것은 아니다. 이번 PR의 JS 절감 범위는 공개 페이지에서 auth/dropdown 기반 `SiteHeader` client bundle을 피하는 데 한정한다. provider를 dashboard route group으로 이동하는 작업은 별도 성능 PR로 다룬다.

### 렌더링 결정

- 결정: 신규 공개 SEO 페이지는 정적 렌더링을 우선한다.
- 이유: 검색 랜딩 페이지는 개인화보다 빠른 응답, CDN 캐시, 안정적인 HTML이 더 중요하다.
- 금지: `(public-marketing)/layout.tsx` 또는 신규 공개 page route에서 `auth()`, `cookies()`, `headers()`, 사용자 DB 조회를 호출하지 않는다.
- 예외: 기존 홈(`/`)은 현재처럼 로그인 상태 header를 유지한다. 이번 구현은 홈을 route group으로 이동하지 않는다.

### 선택: error.tsx / loading.tsx

`(public-marketing)/layout.tsx`는 세션/DB를 호출하지 않으므로 별도 error/loading 파일이 필수는 아니다. 다만 page component 또는 JSON-LD 직렬화에서 예외가 발생할 경우 root error boundary(`src/app/error.tsx`, `src/app/global-error.tsx`)로 fallthrough 한다.

선택 사항으로 다음 두 파일을 추가하면 graceful 동작이 된다(없어도 본 PR 동작은 정상).

```tsx
// src/app/(public-marketing)/error.tsx (선택)
"use client";

export default function PublicMarketingError({
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div className="mx-auto max-w-3xl px-6 py-16 text-center">
      <h1 className="text-3xl font-semibold tracking-tight">
        Something went wrong
      </h1>
      <p className="text-muted-foreground mt-3">
        Please try again. If the problem persists, this page may be temporarily
        unavailable.
      </p>
      <button
        onClick={reset}
        className="mt-6 rounded-md border px-4 py-2 hover:bg-accent"
      >
        Retry
      </button>
    </div>
  );
}
```

```tsx
// src/app/(public-marketing)/loading.tsx (선택)
export default function PublicMarketingLoading() {
  return (
    <div className="mx-auto max-w-6xl px-6 py-16">
      <div className="bg-muted h-10 w-3/4 animate-pulse rounded" />
      <div className="bg-muted mt-4 h-6 w-1/2 animate-pulse rounded" />
    </div>
  );
}
```

본 PR 의 §17.3 체크리스트에서 선택 항목으로 표시한다.

---

## 5. 공통 추가 모듈 (atoms 레벨)

### 5.1 SeoPageHero

파일: `src/fsd/shared/ui/atoms/seo-page-hero.tsx`

> shared/ui/atoms 에 평탄 배치한다 (기존 `button.tsx`, `card.tsx`, `badge.tsx` 와 동일 패턴). composite 가 아니므로 `error-display/` 같은 디렉토리는 만들지 않는다.

```tsx
import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { Badge } from "~/fsd/shared/ui/atoms/badge";
import { Button } from "~/fsd/shared/ui/atoms/button";

interface SeoPageHeroCta {
  label: string;
  href: string;
}

interface SeoPageHeroProps {
  eyebrow?: string;
  title: string;
  description: string;
  primaryCta?: SeoPageHeroCta;
  secondaryCta?: SeoPageHeroCta;
}

export function SeoPageHero({
  eyebrow,
  title,
  description,
  primaryCta,
  secondaryCta,
}: SeoPageHeroProps) {
  return (
    <section className="space-y-8">
      {eyebrow ? (
        <Badge variant="secondary" className="w-fit">
          {eyebrow}
        </Badge>
      ) : null}
      <div className="space-y-6">
        <h1 className="text-foreground text-4xl leading-tight font-semibold tracking-tight text-balance sm:text-5xl">
          {title}
        </h1>
        <p className="text-muted-foreground max-w-2xl text-lg">{description}</p>
      </div>
      {primaryCta ?? secondaryCta ? (
        <div className="flex flex-wrap gap-3">
          {primaryCta ? (
            <Button asChild size="lg" className="gap-2">
              <Link href={primaryCta.href}>
                {primaryCta.label}
                <ArrowRight className="size-4" />
              </Link>
            </Button>
          ) : null}
          {secondaryCta ? (
            <Button asChild variant="outline" size="lg">
              <Link href={secondaryCta.href}>{secondaryCta.label}</Link>
            </Button>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}
```

### 5.2 SeoSection

파일: `src/fsd/shared/ui/atoms/seo-section.tsx`

```tsx
import { Badge } from "~/fsd/shared/ui/atoms/badge";

interface SeoSectionProps {
  eyebrow?: string;
  title: string;
  description?: string;
  children: React.ReactNode;
}

export function SeoSection({
  eyebrow,
  title,
  description,
  children,
}: SeoSectionProps) {
  return (
    <section className="space-y-6">
      <div className="space-y-3">
        {eyebrow ? (
          <Badge variant="secondary" className="w-fit">
            {eyebrow}
          </Badge>
        ) : null}
        <h2 className="text-3xl font-semibold tracking-tight">{title}</h2>
        {description ? (
          <p className="text-muted-foreground max-w-3xl text-lg">
            {description}
          </p>
        ) : null}
      </div>
      {children}
    </section>
  );
}
```

### 5.3 FaqSection

파일: `src/fsd/shared/ui/atoms/faq-section.tsx`

```tsx
import type { FaqItem } from "~/fsd/shared/lib/seo";

interface FaqSectionProps {
  title?: string;
  items: FaqItem[];
}

export function FaqSection({
  title = "Frequently asked questions",
  items,
}: FaqSectionProps) {
  return (
    <section className="space-y-6">
      <h2 className="text-3xl font-semibold tracking-tight">{title}</h2>
      <dl className="space-y-4">
        {items.map((item) => (
          <div
            key={item.question}
            className="border-border/80 bg-card/80 rounded-2xl border p-5 shadow-sm"
          >
            <dt className="text-foreground font-medium">{item.question}</dt>
            <dd className="text-muted-foreground mt-2 leading-relaxed">
              {item.answer}
            </dd>
          </div>
        ))}
      </dl>
    </section>
  );
}
```

### 5.4 SEO 헬퍼 확장

파일: `src/fsd/shared/lib/seo.ts` (전체 교체)

> Phase 1 에서 사용하는 것만 추가한다. Breadcrumb 은 nested route 도입 시 별도 PR.

```ts
import {
  OG_IMAGE_PATH,
  SITE_NAME,
  SITE_URL,
  absoluteSiteUrl,
} from "~/fsd/shared/lib/site";

export interface FaqItem {
  question: string;
  answer: string;
}

/**
 * WebApplication JSON-LD for the landing page.
 * @see https://schema.org/WebApplication
 */
export function generateWebApplicationJsonLd() {
  return {
    "@context": "https://schema.org",
    "@type": "WebApplication",
    name: SITE_NAME,
    url: SITE_URL,
    description:
      "Automatically turn your podcast into short-form highlight clips with AI.",
    applicationCategory: "MultimediaApplication",
    operatingSystem: "Web",
    offers: {
      "@type": "Offer",
      price: "0",
      priceCurrency: "USD",
      description: "Free trial (3 credits)",
    },
    featureList: [
      "AI Q&A-Based Auto Clipping",
      "WhisperX Word-Level Subtitles",
      "Auto Vertical Framing",
      "English or Korean Captions",
      "AWS S3 Secure Storage",
      "Dashboard Review Loop",
    ],
    screenshot: absoluteSiteUrl(OG_IMAGE_PATH),
  };
}

/**
 * FAQPage JSON-LD. Output ONLY when the same Q/A is rendered on the page.
 * @see https://schema.org/FAQPage
 */
export function generateFaqJsonLd(items: FaqItem[]) {
  return {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: items.map((item) => ({
      "@type": "Question",
      name: item.question,
      acceptedAnswer: {
        "@type": "Answer",
        text: item.answer,
      },
    })),
  };
}
```

---

## 6. 헤더 / 푸터 / 홈 수정

### 6.1 Header 공개 nav와 정적 PublicHeader

공개 SEO 페이지는 정적 HTML과 작은 client bundle을 우선한다. 따라서 `(public-marketing)` route group은 client `SiteHeader`를 쓰지 않고 server component `PublicHeader`를 사용한다. 기존 홈은 로그인 상태 dropdown이 필요하므로 `SiteHeader`를 유지하되 같은 nav config를 공유한다.

파일: `src/fsd/widgets/site-header/config/public-nav.ts` (신규)

```ts
export const PUBLIC_NAV_ITEMS = [
  { label: "Features", href: "/features" },
  { label: "Pricing", href: "/pricing" },
  { label: "Product tour", href: "/product-tour" },
] as const;
```

파일: `src/fsd/widgets/site-header/ui/public-header.tsx` (신규)

```tsx
import Link from "next/link";
import { Button } from "~/fsd/shared/ui/atoms/button";
import { PUBLIC_NAV_ITEMS } from "../config/public-nav";

export default function PublicHeader() {
  return (
    <header className="flex flex-wrap items-center justify-between gap-4 py-6">
      <Link
        href="/"
        className="text-foreground text-lg font-semibold tracking-tight"
      >
        AI Podcast Clipper
      </Link>

      <nav className="text-muted-foreground order-3 flex w-full flex-wrap items-center gap-x-6 gap-y-2 text-sm md:order-none md:w-auto">
        {PUBLIC_NAV_ITEMS.map((item) => (
          <Link
            key={item.href}
            href={item.href}
            className="hover:text-foreground underline-offset-4 hover:underline"
          >
            {item.label}
          </Link>
        ))}
      </nav>

      <Button variant="outline" asChild>
        <Link href="/login">Log in</Link>
      </Button>
    </header>
  );
}
```

파일: `src/fsd/widgets/site-header/ui/index.tsx` (기존 client header 수정)

```tsx
"use client";

import Link from "next/link";
import { signOut } from "next-auth/react";
import { Avatar, AvatarFallback, AvatarImage } from "~/fsd/shared/ui/atoms/avatar";
import { Button } from "~/fsd/shared/ui/atoms/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "~/fsd/shared/ui/atoms/dropdown-menu";
import { PUBLIC_NAV_ITEMS } from "../config/public-nav";

interface SiteHeaderProps {
  isLoggedIn: boolean;
  email: string | null;
  image?: string | null;
}

export default function SiteHeader({
  isLoggedIn,
  email,
  image,
}: SiteHeaderProps) {
  return (
    <header className="flex flex-wrap items-center justify-between gap-4 py-6">
      <Link
        href="/"
        className="text-foreground text-lg font-semibold tracking-tight"
      >
        AI Podcast Clipper
      </Link>

      <nav className="text-muted-foreground order-3 flex w-full flex-wrap items-center gap-x-6 gap-y-2 text-sm md:order-none md:w-auto">
        {PUBLIC_NAV_ITEMS.map((item) => (
          <Link
            key={item.href}
            href={item.href}
            className="hover:text-foreground underline-offset-4 hover:underline"
          >
            {item.label}
          </Link>
        ))}
      </nav>

      <div className="flex items-center gap-2">
        {!isLoggedIn && (
          <Button variant="outline" asChild>
            <Link href="/login">Log in</Link>
          </Button>
        )}
        {isLoggedIn && (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="ghost"
                className="relative h-8 w-8 cursor-pointer rounded-full p-0"
              >
                <Avatar>
                  {image && <AvatarImage src={image} alt={email ?? ""} />}
                  <AvatarFallback>{email?.charAt(0)}</AvatarFallback>
                </Avatar>
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent>
              <DropdownMenuLabel>
                <p className="text-muted-foreground text-xs">{email}</p>
              </DropdownMenuLabel>
              <DropdownMenuSeparator />
              <DropdownMenuItem asChild>
                <Link href="/dashboard/billing">Billing</Link>
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                onClick={() => signOut({ redirectTo: "/login" })}
                className="text-destructive cursor-pointer"
              >
                Sign out
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        )}
      </div>
    </header>
  );
}
```

설계 메모:

- 모바일은 `flex-wrap` + `order-3 w-full` 로 nav가 두 번째 줄로 떨어지게 한다. 별도 모바일 메뉴 토글이 없으므로 링크 3개 한정으로 유지한다.
- 로그인 사용자 dropdown 메뉴는 그대로 유지.
- `(public-marketing)/layout.tsx` 는 `PublicHeader`를 사용하므로 `next-auth/react`와 dropdown client bundle을 싣지 않는다.
- 기존 홈(`src/fsd/pages/home/ui/index.tsx`)은 `SiteHeader`를 계속 사용하고, 같은 `PUBLIC_NAV_ITEMS`를 통해 자동으로 새 nav를 얻는다.

### 6.2 SiteFooter 사이트맵 보강

파일: `src/fsd/widgets/site-footer/ui/index.tsx` (전체 교체)

```tsx
import Link from "next/link";

const FOOTER_GROUPS = [
  {
    title: "Product",
    links: [
      { label: "Features", href: "/features" },
      { label: "Pricing", href: "/pricing" },
      { label: "Product tour", href: "/product-tour" },
    ],
  },
  {
    title: "Solutions",
    links: [
      { label: "AI Podcast Clipper", href: "/ai-podcast-clipper" },
      { label: "Podcast to Shorts", href: "/podcast-to-shorts" },
      { label: "YouTube Shorts Generator", href: "/youtube-shorts-generator" },
    ],
  },
  {
    title: "Legal",
    links: [
      { label: "Terms of Service", href: "/terms" },
      { label: "Privacy Policy", href: "/privacy" },
    ],
  },
] as const;

export default function SiteFooter() {
  return (
    <footer className="text-muted-foreground mt-16 border-t pt-10 text-sm">
      <div className="grid gap-8 sm:grid-cols-2 lg:grid-cols-3">
        {FOOTER_GROUPS.map((group) => (
          <div key={group.title} className="space-y-3">
            <p className="text-foreground text-sm font-semibold tracking-tight">
              {group.title}
            </p>
            <ul className="space-y-2">
              {group.links.map((link) => (
                <li key={link.href}>
                  <Link
                    href={link.href}
                    className="hover:text-foreground underline-offset-4 hover:underline"
                  >
                    {link.label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
      <p className="border-border/60 mt-10 border-t pt-6 text-center text-xs">
        Copyright &copy; {new Date().getFullYear()} SangEok. All rights
        reserved.
      </p>
    </footer>
  );
}
```

> 기존에 footer를 `src/app/terms/page.tsx`, `src/app/privacy/page.tsx`도 import 한다(둘 다 본문 마지막에 `<SiteFooter />`). 새 footer는 `sm:grid-cols-2 lg:grid-cols-3`로 설계해 좁은 legal 페이지 컨테이너에서도 바로 3열로 압축되지 않게 한다. 따라서 별도 legal footer wrapper는 만들지 않는다. 배포 전 데스크톱/모바일에서 terms/privacy 가독성만 smoke 확인한다.

배포 순서 주의:

- 위 전체 footer 교체는 `/ai-podcast-clipper`, `/podcast-to-shorts`, `/youtube-shorts-generator`까지 6개 공개 route가 모두 존재하는 배포에서만 적용한다.
- PR을 나눠 개발하더라도 production에는 footer link가 route보다 먼저 노출되면 안 된다.
- 단계별 production 배포가 필요하면 footer는 기존 Legal-only 형태를 유지하거나, 이미 존재하는 공개 route만 링크한다.

### 6.3 홈 hero CTA 수정

파일: `src/fsd/pages/home/ui/_component/HeroSection.tsx`
변경 라인: **27**, **33**

```diff
-            <Link href="/dashboard">
+            <Link href="/login">
               Create a free workspace
               <ArrowRight className="size-4" />
             </Link>
```

```diff
-            <Link href="/dashboard">See product tour</Link>
+            <Link href="/product-tour">See product tour</Link>
```

첫 번째 변경은 공개 hero에서 인증 영역(`/dashboard`)을 직접 링크하지 않게 만든다. 로그인된 사용자는 `/login`에서 기존 로직대로 `/dashboard`로 redirect된다. 두 번째 변경은 제품 투어를 크롤 가능한 공개 페이지로 연결한다. `<Button>` 자체는 수정하지 않는다.

### 6.4 홈 언어 카피 정합성 수정

신규 public page만 언어 표현을 고쳐도 홈의 title/description/feature copy가 그대로면 Google이 가장 먼저 보는 브랜드 진입점에서 기능 신호가 어긋난다. 현재 처리 구조는 업로드/처리 요청당 `language` 하나를 저장하므로 홈도 "English & Korean dual/separate clips"가 아니라 "English or Korean selected per processing run" 기준으로 맞춘다.

파일: `src/fsd/pages/home/config/index.ts`

```diff
-    value: "English & Korean",
+    value: "English or Korean",
```

```diff
-    title: "English & Korean Captions",
+    title: "English or Korean Captions",
```

```diff
-      "English captions come from WhisperX, Korean captions from Gemini translation, each exported as its own clip.",
+      "Choose English or Korean before a processing run. English captions come from WhisperX; Korean captions come from Gemini translation.",
```

파일: `src/app/page.tsx`

```diff
-    "Upload your podcast video and AI finds the best Q&A highlights, adds captions, and exports vertical short-form clips. Powered by Gemini 2.5 + WhisperX. English & Korean subtitles supported.",
+    "Upload your podcast video and AI finds the best Q&A highlights, adds captions, and exports vertical short-form clips. Powered by Gemini 2.5 + WhisperX. English or Korean captions are selected per processing run.",
```

---

## 7. 페이지 1 — `/product-tour`

검색 의도: 가입 전 흐름을 확인하고 싶은 사용자 (`AI Podcast Clipper demo`, `podcast clipper product tour`)

### 7.1 데이터 / 타입

파일: `src/fsd/pages/product-tour/model/types.ts`

```ts
import type { LucideIcon } from "lucide-react";

export type TourStep = {
  index: number;
  title: string;
  description: string;
  icon: LucideIcon;
};

export type TourOutcome = {
  title: string;
  description: string;
  icon: LucideIcon;
};
```

파일: `src/fsd/pages/product-tour/config/index.ts`

```ts
import {
  CheckCircle2,
  Download,
  Languages,
  ScanFace,
  Scissors,
  Sparkles,
  UploadCloud,
} from "lucide-react";
import type { FaqItem } from "~/fsd/shared/lib/seo";
import type { TourOutcome, TourStep } from "../model/types";

export const productTourSteps: TourStep[] = [
  {
    index: 1,
    title: "Upload a podcast video",
    description:
      "Drag and drop a long-form podcast .mp4 (up to 900 MB). The file lands on a per-user S3 prefix and is never public.",
    icon: UploadCloud,
  },
  {
    index: 2,
    title: "AI selects Q&A highlights",
    description:
      "Gemini 2.5 reads the WhisperX transcript and picks 1-4 question-and-answer moments at 40-60 seconds each.",
    icon: Sparkles,
  },
  {
    index: 3,
    title: "Captions and vertical framing",
    description:
      "Word-level subtitles are styled and burned in, while Columbia ASD face tracks drive the 1080x1920 crop.",
    icon: Scissors,
  },
  {
    index: 4,
    title: "Review, download, publish",
    description:
      "Open the dashboard, watch each clip, download what you want to keep, and delete the rest. No re-uploads.",
    icon: CheckCircle2,
  },
];

export const productTourOutcomes: TourOutcome[] = [
  {
    title: "Vertical 1080x1920 mp4",
    description:
      "Ready for YouTube Shorts, Instagram Reels, and TikTok with no extra editing pass.",
    icon: ScanFace,
  },
  {
    title: "English or Korean captions",
    description:
      "WhisperX for English word timing, Gemini-translated Korean styled with Noto Sans KR.",
    icon: Languages,
  },
  {
    title: "Per-clip download links",
    description:
      "Each clip ships through a presigned S3 URL that expires in 1 hour, so links stay private.",
    icon: Download,
  },
];

export const productTourFaq: FaqItem[] = [
  {
    question: "Do I need an account to see the product tour?",
    answer:
      "No. The product tour walks through every step without login. You only need an account to upload your own podcast and generate clips.",
  },
  {
    question: "What does the free trial include?",
    answer:
      "New accounts start with 3 free credits. Credits are deducted after a successful processing run, one credit per generated clip in that completed run, so a completed 3-clip result uses the full trial balance.",
  },
  {
    question: "How long does processing take?",
    answer:
      "Most uploads finish within minutes. Actual time depends on file size, queue load, and GPU availability on the processing backend.",
  },
  {
    question: "Which video formats are supported?",
    answer:
      "AI Podcast Clipper accepts .mp4 podcast videos up to 900 MB. The output is also .mp4 in vertical 1080x1920 with burned-in captions.",
  },
];
```

### 7.2 UI

파일: `src/fsd/pages/product-tour/ui/index.tsx`

```tsx
import { Card, CardContent } from "~/fsd/shared/ui/atoms/card";
import { FaqSection } from "~/fsd/shared/ui/atoms/faq-section";
import { SeoPageHero } from "~/fsd/shared/ui/atoms/seo-page-hero";
import { SeoSection } from "~/fsd/shared/ui/atoms/seo-section";
import {
  productTourFaq,
  productTourOutcomes,
  productTourSteps,
} from "../config";

export default function ProductTourPage() {
  return (
    <>
      <SeoPageHero
        eyebrow="Product tour"
        title="See How AI Podcast Clipper Turns Podcasts Into Shorts"
        description="Walk through the full pipeline before you sign up: upload, AI highlight detection, captioned vertical framing, and dashboard review."
        primaryCta={{ label: "Try it free", href: "/login" }}
        secondaryCta={{ label: "See features", href: "/features" }}
      />

      <SeoSection
        eyebrow="Workflow"
        title="Four steps from upload to publishable clip"
        description="The processing pipeline is fully automated. You only interact with the upload and the review screen."
      >
        <ol className="space-y-4">
          {productTourSteps.map((step) => (
            <li
              key={step.index}
              className="border-border/80 bg-card/80 rounded-2xl border p-5 shadow-sm"
            >
              <div className="flex items-center gap-3">
                <div className="bg-primary/10 text-primary flex size-10 items-center justify-center rounded-2xl font-semibold">
                  {step.index}
                </div>
                <div className="flex items-center gap-2">
                  <step.icon className="text-primary size-5" />
                  <p className="text-foreground text-base font-semibold">
                    {step.title}
                  </p>
                </div>
              </div>
              <p className="text-muted-foreground mt-3">{step.description}</p>
            </li>
          ))}
        </ol>
      </SeoSection>

      <SeoSection
        eyebrow="Output"
        title="What you actually get"
        description="The output is shaped for short-form publishing. No extra crop, caption, or rendering tools are required afterwards."
      >
        <div className="grid gap-4 md:grid-cols-3">
          {productTourOutcomes.map((outcome) => (
            <Card key={outcome.title} className="h-full px-2 py-4">
              <CardContent className="space-y-3">
                <outcome.icon className="text-primary size-5" />
                <p className="text-foreground text-base font-semibold">
                  {outcome.title}
                </p>
                <p className="text-muted-foreground text-sm">
                  {outcome.description}
                </p>
              </CardContent>
            </Card>
          ))}
        </div>
      </SeoSection>

      <FaqSection items={productTourFaq} />
    </>
  );
}
```

### 7.3 Route

파일: `src/app/(public-marketing)/product-tour/page.tsx`

```tsx
import { type Metadata } from "next";
import ProductTourPage from "~/fsd/pages/product-tour/ui";
import { productTourFaq } from "~/fsd/pages/product-tour/config";
import { generateFaqJsonLd } from "~/fsd/shared/lib/seo";
import { absoluteSiteUrl } from "~/fsd/shared/lib/site";

export const metadata: Metadata = {
  title: "Product Tour",
  description:
    "See how AI Podcast Clipper turns a podcast upload into captioned vertical clips ready for YouTube Shorts, Reels, and TikTok.",
  alternates: { canonical: absoluteSiteUrl("/product-tour") },
  openGraph: {
    title: "AI Podcast Clipper — Product Tour",
    description:
      "Watch the upload, highlight detection, captioning, and review steps before you sign up.",
    locale: "en_US",
    url: absoluteSiteUrl("/product-tour"),
    type: "website",
  },
};

export default function Page() {
  const faqJsonLd = generateFaqJsonLd(productTourFaq);

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(faqJsonLd) }}
      />
      <ProductTourPage />
    </>
  );
}
```

> Page UI 모듈은 session props를 받지 않는다. 공개 페이지는 세션 조회 없이 정적 렌더링되며, 셸은 `(public-marketing)/layout.tsx`가 처리한다.

---

## 8. 페이지 2 — `/features`

검색 의도: 비교/검토 단계 사용자 (`AI podcast clipper features`, `podcast clipping software features`)

### 8.1 데이터 / 타입

파일: `src/fsd/pages/features/model/types.ts`

```ts
import type { LucideIcon } from "lucide-react";

export type FeatureCard = {
  title: string;
  badge: string;
  description: string;
  details: string[];
  icon: LucideIcon;
};

export type ComparisonRow = {
  capability: string;
  manual: string;
  automated: string;
};
```

파일: `src/fsd/pages/features/config/index.ts`

```ts
import {
  AudioWaveform,
  Layers,
  Languages,
  Scissors,
  ShieldCheck,
  Sparkles,
} from "lucide-react";
import type { FaqItem } from "~/fsd/shared/lib/seo";
import type { ComparisonRow, FeatureCard } from "../model/types";

export const detailedFeatures: FeatureCard[] = [
  {
    title: "AI Q&A Clipping",
    badge: "LLM planning",
    icon: Sparkles,
    description:
      "Gemini 2.5 reads word-level transcripts and plans 40-60 second question-and-answer clips that keep full sentence boundaries.",
    details: [
      "1 to 4 clips per upload, controlled at submit time.",
      "Highlights are scored on conversational tension, not pure keyword density.",
      "Sentence boundaries respected so playback never feels abrupt.",
    ],
  },
  {
    title: "WhisperX Word Subtitles",
    badge: "Word-level",
    icon: AudioWaveform,
    description:
      "WhisperX large-v2 transcribes English audio and aligns every word to precise start and end timings.",
    details: [
      "Word JSON makes downstream recuts and syncing painless.",
      "Caption timing matches actual speech, not paragraph guesses.",
      "Foundation for English captions or Korean translation, depending on the selected run language.",
    ],
  },
  {
    title: "Auto Vertical Framing",
    badge: "Face-aware",
    icon: Scissors,
    description:
      "Columbia ASD face tracks steer 1080x1920 crops or blurred backgrounds, rendered with NVENC at 25 fps.",
    details: [
      "Active speaker detection per frame so the camera follows the right person.",
      "Falls back to blurred backdrop when the face track is uncertain.",
      "Output is publish-ready for YouTube Shorts, Reels, and TikTok.",
    ],
  },
  {
    title: "English or Korean Captions",
    badge: "Caption language",
    icon: Languages,
    description:
      "Each processing run uses one selected caption language. English captions are sourced from WhisperX; Korean captions come from Gemini translation.",
    details: [
      "Anton style for English emphasis lines.",
      "Noto Sans KR style for Korean lines.",
      "Choose English or Korean before starting the run.",
    ],
  },
  {
    title: "Secure S3 Storage",
    badge: "Signed URLs",
    icon: ShieldCheck,
    description:
      "Originals and clips live in a dedicated S3 bucket. The app fetches them only through AWS presigned URLs.",
    details: [
      "Per-user prefixes keep uploads isolated.",
      "Presigned URLs expire in 1 hour by default.",
      "Cleanup routines remove abandoned drafts.",
    ],
  },
  {
    title: "Dashboard Review Loop",
    badge: "Dashboard",
    icon: Layers,
    description:
      "Upload, request processing, review the clip list, play, download, and delete clips from a single view.",
    details: [
      "Status moves from queued to processing to processed without page reloads.",
      "Per-clip download and delete actions.",
      "Recoverable upload drafts in case the tab closes mid-flow.",
    ],
  },
];

export const featureComparison: ComparisonRow[] = [
  {
    capability: "Find highlight moments",
    manual: "Scrub through hours of audio and timestamp by hand.",
    automated: "Gemini 2.5 picks 1-4 Q&A moments per upload.",
  },
  {
    capability: "Add word-level captions",
    manual: "Hand-time captions or use a generic auto-captioner.",
    automated: "WhisperX word timings burned into the clip automatically.",
  },
  {
    capability: "Convert horizontal to vertical",
    manual: "Manually crop and reposition every cut.",
    automated:
      "Face-aware Columbia ASD crop with blurred backdrop fallback.",
  },
  {
    capability: "Choose caption language",
    manual: "Re-cut or re-caption manually when changing language.",
    automated:
      "English or Korean captions are selected per processing run.",
  },
];

export const featuresFaq: FaqItem[] = [
  {
    question: "How many clips does each run produce?",
    answer:
      "You choose 1, 2, 3, or 4 clips per upload. The AI selects the strongest Q&A moments and produces that many vertical clips.",
  },
  {
    question: "Is Korean captioning the same quality as English?",
    answer:
      "English captions come directly from WhisperX with word-level timing. Korean captions are produced by Gemini translation styled with Noto Sans KR. Both are usable for publishing, but English will track speech more tightly.",
  },
  {
    question: "Where are uploads and clips stored?",
    answer:
      "All originals and generated clips live in a dedicated AWS S3 bucket under per-user prefixes. The app only ever exposes them through short-lived presigned URLs.",
  },
  {
    question: "What is the file size limit?",
    answer:
      "Uploads are capped at 900 MB per .mp4. Long episodes still work, but very large files should be exported at a moderate bitrate before upload.",
  },
];
```

### 8.2 UI

파일: `src/fsd/pages/features/ui/index.tsx`

```tsx
import { Badge } from "~/fsd/shared/ui/atoms/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "~/fsd/shared/ui/atoms/card";
import { FaqSection } from "~/fsd/shared/ui/atoms/faq-section";
import { SeoPageHero } from "~/fsd/shared/ui/atoms/seo-page-hero";
import { SeoSection } from "~/fsd/shared/ui/atoms/seo-section";
import {
  detailedFeatures,
  featureComparison,
  featuresFaq,
} from "../config";

export default function FeaturesPage() {
  return (
    <>
      <SeoPageHero
        eyebrow="Features"
        title="Podcast Clipper Features Built for Short-Form Video Workflows"
        description="Highlight detection, word-level captions, vertical framing, selectable caption language, and a single dashboard to review every result."
        primaryCta={{ label: "Try it free", href: "/login" }}
        secondaryCta={{ label: "See pricing", href: "/pricing" }}
      />

      <SeoSection
        eyebrow="Capabilities"
        title="Six pieces that replace a five-tab workflow"
        description="Each feature is automated end-to-end so you never need to leave the app for a separate transcription or cropping tool."
      >
        <div className="grid gap-4 md:grid-cols-2">
          {detailedFeatures.map((feature) => (
            <Card key={feature.title} className="h-full px-2 py-4">
              <CardHeader className="space-y-3">
                <div className="text-primary flex items-center gap-3">
                  <feature.icon className="size-5" />
                  <Badge variant="outline" className="text-xs uppercase">
                    {feature.badge}
                  </Badge>
                </div>
                <CardTitle className="text-lg">{feature.title}</CardTitle>
                <CardDescription>{feature.description}</CardDescription>
              </CardHeader>
              <CardContent>
                <ul className="text-muted-foreground list-disc space-y-1 pl-5 text-sm">
                  {feature.details.map((detail) => (
                    <li key={detail}>{detail}</li>
                  ))}
                </ul>
              </CardContent>
            </Card>
          ))}
        </div>
      </SeoSection>

      <SeoSection
        eyebrow="Manual vs automated"
        title="Where the time actually goes"
        description="Manual short-form workflows fan out into multiple tools. The AI pipeline collapses them into one upload."
      >
        <div className="overflow-x-auto rounded-2xl border">
          <table className="w-full min-w-[640px] border-collapse text-sm">
            <thead>
              <tr className="bg-muted/40 text-muted-foreground text-left">
                <th className="px-4 py-3 font-medium">Capability</th>
                <th className="px-4 py-3 font-medium">Manual workflow</th>
                <th className="px-4 py-3 font-medium">AI Podcast Clipper</th>
              </tr>
            </thead>
            <tbody>
              {featureComparison.map((row) => (
                <tr
                  key={row.capability}
                  className="border-t align-top"
                >
                  <td className="text-foreground px-4 py-3 font-medium">
                    {row.capability}
                  </td>
                  <td className="text-muted-foreground px-4 py-3">
                    {row.manual}
                  </td>
                  <td className="text-muted-foreground px-4 py-3">
                    {row.automated}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </SeoSection>

      <FaqSection items={featuresFaq} />
    </>
  );
}
```

### 8.3 Route

파일: `src/app/(public-marketing)/features/page.tsx`

```tsx
import { type Metadata } from "next";
import FeaturesPage from "~/fsd/pages/features/ui";
import { featuresFaq } from "~/fsd/pages/features/config";
import { generateFaqJsonLd } from "~/fsd/shared/lib/seo";
import { absoluteSiteUrl } from "~/fsd/shared/lib/site";

export const metadata: Metadata = {
  title: "Features",
  description:
    "Explore AI Podcast Clipper features including Q&A highlight detection, WhisperX subtitles, vertical framing, English or Korean captions, and secure S3 storage.",
  alternates: { canonical: absoluteSiteUrl("/features") },
  openGraph: {
    title: "AI Podcast Clipper — Features",
    description:
      "Highlight detection, captions, vertical framing, and selected-language exports in one workflow.",
    locale: "en_US",
    url: absoluteSiteUrl("/features"),
    type: "website",
  },
};

export default function Page() {
  const faqJsonLd = generateFaqJsonLd(featuresFaq);

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(faqJsonLd) }}
      />
      <FeaturesPage />
    </>
  );
}
```

---

## 9. 페이지 3 — `/pricing`

검색 의도: 가입 전 비용/제한 확인 (`AI Podcast Clipper pricing`, `podcast clipper free trial`)

### 9.1 데이터

현재 `PLAN_TIERS`는 `src/fsd/features/billing/config/index.ts`에 있으며 `free`(3 credits, $0)와 `pro`(30 credits, $9.99/mo, $99.99/yr)를 제공한다. 다만 같은 모듈에 `getProductIds()`와 `process.env.POLAR_SERVER` 참조가 함께 있으므로, public pricing 구현 전에 plan 정보만 순수 모듈로 분리한다. Pricing 페이지는 이 순수 모듈을 import 해서 단일 소스를 유지한다.

파일: `src/fsd/features/billing/config/plan-tiers.ts` (신규)

```ts
export const PLAN_TIERS = {
  free: {
    name: "Free",
    monthlyCredits: 3,
    description: "Basic plan",
    price: "$0",
    yearlyPrice: null,
  },
  pro: {
    name: "Pro",
    monthlyCredits: 30,
    description: "For individual creators",
    price: "$9.99",
    yearlyPrice: "$99.99/yr",
  },
} as const;

export type PlanTier = keyof typeof PLAN_TIERS;
```

파일: `src/fsd/features/billing/config/index.ts` (상단 수정)

```ts
export { PLAN_TIERS, type PlanTier } from "./plan-tiers";

export type ProductIds = (typeof POLAR_PRODUCT_IDS)[keyof typeof POLAR_PRODUCT_IDS];

export const POLAR_PRODUCT_IDS = {
  // existing content unchanged
};
```

설계 메모:

- public pricing UI는 `plan-tiers.ts`만 import한다. 이 파일은 `process.env`, Polar product id, server-only helper를 포함하지 않는다.
- 기존 dashboard/billing 코드는 `~/fsd/features/billing/config` import를 유지해도 된다. index가 `PLAN_TIERS`를 re-export하므로 기존 import 경로 호환성이 유지된다.
- `index.ts`에 남아 있던 기존 `PLAN_TIERS` 객체와 `PlanTier` type 선언은 제거한다. re-export와 기존 선언이 함께 있으면 duplicate export/type 오류가 난다.
- 향후 pricing UI에 실수로 `"use client"`가 추가되어도 plan 값 때문에 client bundle에 `process.env` 참조가 섞이지 않는다.

중요한 정책 정합성:

- 현재 백엔드는 처리 시작 전 `credits <= 0`만 차단한다.
- 즉, v1은 **양수 credit 보유 여부만 preflight**한다. 요청한 clip 수만큼 credit을 이미 보유해야 한다는 선불 검사는 없다.
- 요청한 clip 수까지 정상 완료된 처리(run)에 한해 실제 생성되어 저장된 clip 수만큼 credit을 차감하고, 잔액은 0 미만으로 내려가지 않는다.
- 부분 생성 후 실패 처리되는 경우에는 clip artifact가 일부 남아도 credit 차감 대상이라고 표현하지 않는다.
- 따라서 공개 pricing은 "credit을 선불 티켓처럼 보유 수량만큼만 clip을 생성할 수 있다", "요청 clip 수만큼 credit이 있어야 시작할 수 있다", "잔액보다 많은 clip 요청은 시작 전에 차단된다"는 식으로 쓰지 않는다.
- 문구는 "credits are deducted after a successful processing run"과 "one credit is deducted per generated clip in a completed run"으로 통일한다.
- 향후 "요청 clip 수만큼 credit을 보유해야 처리 시작" 정책으로 바꾸려면 dashboard upload preflight와 Inngest preflight를 먼저 수정한 뒤 pricing 문구를 강화한다.
- 공개 `/pricing`은 `NEXT_PUBLIC_SUBSCRIPTION_ENABLED`를 읽지 않는다. 결제 가능 여부는 `/dashboard/billing`에서만 판단한다. 이로써 정적 prerender와 metadata가 env 변경에 따라 어긋나는 문제를 피한다.
- 공개 pricing에서 `Priority processing`을 제거하더라도 실제 결제 흐름이 이어지는 dashboard billing 카드에 같은 문구가 남으면 다시 기능 불일치가 노출된다. 현재 `src/inngest/functions.ts`의 concurrency는 사용자당 1개 제한만 있고 플랜별 우선순위가 없으므로 dashboard `PlanCard`에서도 해당 문구를 제거한다.

파일: `src/fsd/features/billing/ui/PlanCard.tsx`

```diff
-          {tier === "pro" && <li>Priority processing</li>}
+          {tier === "pro" && <li>Monthly and yearly checkout options</li>}
```

파일: `src/fsd/pages/pricing/model/types.ts`

```ts
export type PricingHighlight = {
  label: string;
  value: string;
  footnote: string;
};
```

파일: `src/fsd/pages/pricing/config/index.ts`

```ts
import type { FaqItem } from "~/fsd/shared/lib/seo";
import type { PricingHighlight } from "../model/types";

export const pricingHighlights: PricingHighlight[] = [
  {
    label: "Free trial",
    value: "3 credits",
    footnote:
      "Every new account starts with 3 credits. Credits are deducted after a successful processing run.",
  },
  {
    label: "How usage is counted",
    value: "1 credit per clip",
    footnote:
      "One credit is deducted per generated clip in a successfully completed run.",
  },
  {
    label: "Output per credit",
    value: "Vertical mp4 + captions",
    footnote:
      "Each clip ships as a 1080x1920 mp4 with burned-in captions and a presigned download URL.",
  },
];

export const pricingIncluded = [
  "AI Q&A highlight detection (1-4 clips per upload).",
  "WhisperX word-level subtitles.",
  "Auto vertical framing with face-aware cropping.",
  "English or Korean captions selected per processing run.",
  "Secure S3 storage with per-user prefixes and signed URLs.",
  "Dashboard review with per-clip download and delete.",
] as const;

export const pricingLimits = [
  "Per-upload size limit: 900 MB .mp4.",
  "Per-run clip count: 1, 2, 3, or 4.",
  "Concurrency: one active processing run per user.",
  "Processing starts only when the account has a positive credit balance.",
  "Presigned download URLs expire after 1 hour.",
] as const;

export const pricingFaq: FaqItem[] = [
  {
    question: "How does the free trial work?",
    answer:
      "Every new account is provisioned with 3 free credits. Credits are deducted after a successful processing run, one credit per generated clip in that completed run. If a run fails or only partially completes, no credit is consumed.",
  },
  {
    question: "When are credits deducted?",
    answer:
      "Credits are deducted only after the requested clips are successfully processed and stored. Uploads that fail, produce no clip, or do not complete the requested clip count do not affect your credit balance.",
  },
  {
    question: "Can I refund credits or unused subscription time?",
    answer:
      "Credits and subscription fees are non-refundable unless required by law or expressly approved. Subscription benefits remain available until the end of the paid period.",
  },
  {
    question: "Where is payment handled?",
    answer:
      "Payments, when enabled, are handled from the authenticated billing dashboard and processed by Polar. AI Podcast Clipper does not store full payment card information.",
  },
];
```

### 9.2 UI

파일: `src/fsd/pages/pricing/ui/index.tsx`

```tsx
import { CheckCircle2 } from "lucide-react";
import { Badge } from "~/fsd/shared/ui/atoms/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "~/fsd/shared/ui/atoms/card";
import { FaqSection } from "~/fsd/shared/ui/atoms/faq-section";
import { SeoPageHero } from "~/fsd/shared/ui/atoms/seo-page-hero";
import { SeoSection } from "~/fsd/shared/ui/atoms/seo-section";
import { PLAN_TIERS } from "~/fsd/features/billing/config/plan-tiers";
import {
  pricingFaq,
  pricingHighlights,
  pricingIncluded,
  pricingLimits,
} from "../config";

export default function PricingPage() {
  const free = PLAN_TIERS.free;
  const pro = PLAN_TIERS.pro;

  return (
    <>
      <SeoPageHero
        eyebrow="Pricing"
        title="AI Podcast Clipper Pricing"
        description="Start free with 3 credits. Credits are deducted after a successful processing run, one per generated clip with captions and vertical framing."
        primaryCta={{ label: "Start free with 3 credits", href: "/login" }}
        secondaryCta={{ label: "See product tour", href: "/product-tour" }}
      />

      <SeoSection
        eyebrow="Free trial at a glance"
        title="What you get without paying"
        description="The free trial mirrors the paid pipeline. Same models, same outputs, same dashboard."
      >
        <div className="grid gap-4 md:grid-cols-3">
          {pricingHighlights.map((highlight) => (
            <Card key={highlight.label} className="h-full px-2 py-4">
              <CardContent className="space-y-2">
                <p className="text-muted-foreground text-sm">
                  {highlight.label}
                </p>
                <p className="text-2xl font-semibold tracking-tight">
                  {highlight.value}
                </p>
                <p className="text-muted-foreground text-xs">
                  {highlight.footnote}
                </p>
              </CardContent>
            </Card>
          ))}
        </div>
      </SeoSection>

      <SeoSection
        eyebrow="Plans"
        title="Free trial and plan details"
        description="Create a free account to use trial credits. Paid checkout, when enabled for your account, is handled from the authenticated billing dashboard."
      >
        <div className="grid gap-4 md:grid-cols-2">
          <Card className="h-full px-2 py-4">
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle>{free.name}</CardTitle>
                <Badge variant="secondary">Trial</Badge>
              </div>
              <CardDescription>{free.description}</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <span className="text-3xl font-bold">{free.price}</span>
              </div>
              <ul className="text-muted-foreground space-y-1 text-sm">
                <li>{free.monthlyCredits} credits on signup</li>
                <li>Same pipeline as paid plans</li>
                <li>No credit card required</li>
              </ul>
            </CardContent>
          </Card>

          <Card className="border-primary/40 h-full border-2 px-2 py-4">
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle>{pro.name}</CardTitle>
                <Badge>Dashboard billing</Badge>
              </div>
              <CardDescription>{pro.description}</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-baseline gap-2">
                <span className="text-3xl font-bold">{pro.price}</span>
                <span className="text-muted-foreground text-sm">/month</span>
              </div>
              <ul className="text-muted-foreground space-y-1 text-sm">
                <li>{pro.monthlyCredits} credits / month</li>
                <li>Checkout and subscription management in dashboard</li>
                {pro.yearlyPrice ? <li>Yearly: {pro.yearlyPrice}</li> : null}
              </ul>
            </CardContent>
          </Card>
        </div>
      </SeoSection>

      <SeoSection
        eyebrow="Included"
        title="Every plan includes"
      >
        <ul className="grid gap-3 sm:grid-cols-2">
          {pricingIncluded.map((item) => (
            <li
              key={item}
              className="text-muted-foreground flex items-start gap-2 text-sm"
            >
              <CheckCircle2 className="text-primary mt-0.5 size-4 shrink-0" />
              <span>{item}</span>
            </li>
          ))}
        </ul>
      </SeoSection>

      <SeoSection
        eyebrow="Limits"
        title="Fair-use boundaries"
        description="These limits keep processing queues healthy. They apply to all plans."
      >
        <ul className="text-muted-foreground list-disc space-y-1 pl-5 text-sm">
          {pricingLimits.map((limit) => (
            <li key={limit}>{limit}</li>
          ))}
        </ul>
      </SeoSection>

      <FaqSection items={pricingFaq} />
    </>
  );
}
```

설계 메모:

- `src/fsd/pages/pricing/ui/index.tsx`는 기본적으로 server component로 둔다. 현재는 client hook이나 browser API가 필요 없다.
- 그래도 향후 `"use client"`가 추가되더라도 `PLAN_TIERS` import 대상이 순수 `plan-tiers.ts`이므로 `process.env.POLAR_SERVER` 참조가 client bundle로 섞이지 않는다.
- 결제 가능 여부를 실시간으로 보여주는 UI는 이 public pricing에 넣지 않는다. checkout 상태는 authenticated `/dashboard/billing`에서만 판단한다.

### 9.3 Route

파일: `src/app/(public-marketing)/pricing/page.tsx`

```tsx
import { type Metadata } from "next";
import PricingPage from "~/fsd/pages/pricing/ui";
import { pricingFaq } from "~/fsd/pages/pricing/config";
import { generateFaqJsonLd } from "~/fsd/shared/lib/seo";
import { absoluteSiteUrl } from "~/fsd/shared/lib/site";

export const metadata: Metadata = {
  title: "Pricing",
  description:
    "AI Podcast Clipper pricing — start with 3 free credits. Credits are deducted after a successful processing run with captions, vertical framing, and selected-language export.",
  alternates: { canonical: absoluteSiteUrl("/pricing") },
  openGraph: {
    title: "AI Podcast Clipper — Pricing",
    description:
      "Free trial with 3 credits plus plan details for podcast-to-shorts workflows.",
    locale: "en_US",
    url: absoluteSiteUrl("/pricing"),
    type: "website",
  },
};

export default function Page() {
  const faqJsonLd = generateFaqJsonLd(pricingFaq);

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(faqJsonLd) }}
      />
      <PricingPage />
    </>
  );
}
```

> 결제 CTA(체크아웃 이동 버튼)는 본 페이지에 두지 않는다. 실제 checkout은 `/dashboard/billing`의 `PlanCard`가 담당한다. 공개 pricing은 env를 읽지 않는 정적 정보 페이지로만 동작한다. 따라서 `NEXT_PUBLIC_SUBSCRIPTION_ENABLED` 변경과 public metadata/HTML 이 어긋나는 문제가 없다. 결제 활성화 상태를 공개 pricing에 강하게 노출해야 하는 시점에는 별도 배포로 copy와 metadata를 함께 바꾼다.

---

## 10. 페이지 4 — `/podcast-to-shorts`

검색 의도: 긴 팟캐스트를 Shorts/Reels/TikTok으로 변환하려는 사용자. 플랫폼 범위가 가장 넓다.

### 10.1 데이터

파일: `src/fsd/pages/podcast-to-shorts/model/types.ts`

```ts
import type { LucideIcon } from "lucide-react";

export type PlatformOutcome = {
  platform: string;
  spec: string;
  description: string;
  icon: LucideIcon;
};
```

파일: `src/fsd/pages/podcast-to-shorts/config/index.ts`

```ts
import { Instagram, MonitorPlay, Music2, Youtube } from "lucide-react";
import type { FaqItem } from "~/fsd/shared/lib/seo";
import type { PlatformOutcome } from "../model/types";

export const podcastToShortsPlatforms: PlatformOutcome[] = [
  {
    platform: "YouTube Shorts",
    spec: "1080x1920, up to 60s",
    description:
      "Vertical mp4 with burned-in captions ready for the YouTube Shorts shelf.",
    icon: Youtube,
  },
  {
    platform: "Instagram Reels",
    spec: "1080x1920 vertical",
    description:
      "Same export feeds Reels — no extra crop or caption pass needed.",
    icon: Instagram,
  },
  {
    platform: "TikTok",
    spec: "1080x1920 vertical",
    description:
      "Drop the file in directly. Captions are already burned in for sound-off viewers.",
    icon: Music2,
  },
  {
    platform: "Long-form recap",
    spec: "Same source, 1-4 clips",
    description:
      "Use the highlight clips as the cold open of a long-form video on any platform.",
    icon: MonitorPlay,
  },
];

export const podcastToShortsWorkflow = [
  {
    title: "Drop the long episode in",
    description:
      "Upload a podcast .mp4 up to 900 MB. No need to pre-edit or trim — the AI handles the cut.",
  },
  {
    title: "AI scores Q&A density",
    description:
      "Gemini 2.5 reads the transcript and ranks 40-60 second segments where a question lands a clear answer.",
  },
  {
    title: "Captions and 9:16 framing run together",
    description:
      "WhisperX timing and Columbia ASD face tracking happen in the same pass, not as separate exports.",
  },
  {
    title: "Review and download",
    description:
      "Each clip renders to S3 and is downloadable through a presigned URL inside the dashboard.",
  },
] as const;

export const podcastToShortsFaq: FaqItem[] = [
  {
    question: "Does this only work for YouTube Shorts?",
    answer:
      "No. The output is a 1080x1920 vertical mp4 with burned-in captions, which is the same shape Instagram Reels and TikTok expect. One run gives you a clip you can publish on all three platforms.",
  },
  {
    question: "Will the AI cut clips at the wrong place?",
    answer:
      "Highlights are scored on Q&A boundaries, not arbitrary timestamps. The pipeline preserves full sentence boundaries so the clip starts and ends on a natural beat.",
  },
  {
    question: "What happens to original audio quality?",
    answer:
      "Audio is preserved from the source mp4. Only captions and vertical framing are added on top — the underlying audio is not re-encoded beyond what the export step requires.",
  },
  {
    question: "Can I generate clips in Korean?",
    answer:
      "Yes. Choose Korean as the caption language for that processing run. The output is a Korean-captioned vertical mp4 styled with Noto Sans KR.",
  },
];
```

### 10.2 UI

파일: `src/fsd/pages/podcast-to-shorts/ui/index.tsx`

```tsx
import Link from "next/link";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "~/fsd/shared/ui/atoms/card";
import { Button } from "~/fsd/shared/ui/atoms/button";
import { FaqSection } from "~/fsd/shared/ui/atoms/faq-section";
import { SeoPageHero } from "~/fsd/shared/ui/atoms/seo-page-hero";
import { SeoSection } from "~/fsd/shared/ui/atoms/seo-section";
import {
  podcastToShortsFaq,
  podcastToShortsPlatforms,
  podcastToShortsWorkflow,
} from "../config";

export default function PodcastToShortsPage() {
  return (
    <>
      <SeoPageHero
        eyebrow="Podcast to Shorts"
        title="Turn Podcasts Into Shorts With AI"
        description="A 90 minute podcast does not become Shorts in a vacuum. AI Podcast Clipper finds the moments that survive in a 60 second window and ships them captioned and vertical."
        primaryCta={{ label: "Try it free", href: "/login" }}
        secondaryCta={{ label: "See features", href: "/features" }}
      />

      <SeoSection
        eyebrow="Why podcasts are hard to clip manually"
        title="Manual clipping fails on long-form conversation"
        description="Podcast hosts move between setup, joke, and payoff. Picking a clip that lands without context is a separate skill — and it does not scale across an entire show."
      >
        <ul className="text-muted-foreground list-disc space-y-2 pl-5">
          <li>Most highlight tools target keynote talks, not back-and-forth dialogue.</li>
          <li>
            Hand-editing a single Short can take 20-30 minutes per clip once you
            include cropping and captioning.
          </li>
          <li>
            Multi-language publishing doubles the manual cost without adding new
            highlights.
          </li>
        </ul>
      </SeoSection>

      <SeoSection
        eyebrow="Workflow"
        title="From upload to published-ready in one pass"
      >
        <ol className="space-y-4">
          {podcastToShortsWorkflow.map((step, index) => (
            <li
              key={step.title}
              className="border-border/80 bg-card/80 rounded-2xl border p-5 shadow-sm"
            >
              <div className="flex items-center gap-3">
                <div className="bg-primary/10 text-primary flex size-10 items-center justify-center rounded-2xl font-semibold">
                  {index + 1}
                </div>
                <p className="text-foreground text-base font-semibold">
                  {step.title}
                </p>
              </div>
              <p className="text-muted-foreground mt-3">{step.description}</p>
            </li>
          ))}
        </ol>
      </SeoSection>

      <SeoSection
        eyebrow="Where the clips ship"
        title="One export, every short-form surface"
      >
        <div className="grid gap-4 md:grid-cols-2">
          {podcastToShortsPlatforms.map((platform) => (
            <Card key={platform.platform} className="h-full px-2 py-4">
              <CardHeader>
                <div className="text-primary flex items-center gap-3">
                  <platform.icon className="size-5" />
                  <CardTitle className="text-lg">{platform.platform}</CardTitle>
                </div>
                <CardDescription>{platform.spec}</CardDescription>
              </CardHeader>
              <CardContent>
                <p className="text-muted-foreground text-sm">
                  {platform.description}
                </p>
              </CardContent>
            </Card>
          ))}
        </div>
      </SeoSection>

      <SeoSection
        eyebrow="YouTube focus"
        title="Need a YouTube-specific workflow?"
        description="If YouTube Shorts is the primary channel, use the YouTube Shorts generator page for Shorts-specific requirements and review steps."
      >
        <Button asChild variant="outline">
          <Link href="/youtube-shorts-generator">
            See the YouTube Shorts generator
          </Link>
        </Button>
      </SeoSection>

      <FaqSection items={podcastToShortsFaq} />
    </>
  );
}
```

### 10.3 Route

파일: `src/app/(public-marketing)/podcast-to-shorts/page.tsx`

```tsx
import { type Metadata } from "next";
import PodcastToShortsPage from "~/fsd/pages/podcast-to-shorts/ui";
import { podcastToShortsFaq } from "~/fsd/pages/podcast-to-shorts/config";
import { generateFaqJsonLd } from "~/fsd/shared/lib/seo";
import { absoluteSiteUrl } from "~/fsd/shared/lib/site";

export const metadata: Metadata = {
  title: "Turn Podcasts Into Shorts With AI",
  description:
    "Turn long podcast videos into short-form clips with AI highlight detection, word-level captions, and 1080x1920 vertical framing for Shorts, Reels, and TikTok.",
  alternates: { canonical: absoluteSiteUrl("/podcast-to-shorts") },
  openGraph: {
    title: "Turn Podcasts Into Shorts With AI",
    description:
      "AI Podcast Clipper takes a long-form podcast upload and produces captioned vertical clips.",
    locale: "en_US",
    url: absoluteSiteUrl("/podcast-to-shorts"),
    type: "website",
  },
};

export default function Page() {
  const faqJsonLd = generateFaqJsonLd(podcastToShortsFaq);

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(faqJsonLd) }}
      />
      <PodcastToShortsPage />
    </>
  );
}
```

---

## 11. 페이지 5 — `/youtube-shorts-generator`

검색 의도: YouTube Shorts에 초점을 둔 제너레이터 검색. 일반 Shorts 생성기가 아닌 "podcast clips for YouTube Shorts"로 좁혀 포지셔닝.

### 11.1 데이터

파일: `src/fsd/pages/youtube-shorts-generator/model/types.ts`

```ts
import type { LucideIcon } from "lucide-react";

export type ShortsSpec = {
  label: string;
  value: string;
  description: string;
  icon: LucideIcon;
};
```

파일: `src/fsd/pages/youtube-shorts-generator/config/index.ts`

```ts
import { CaptionsIcon, Clock, RectangleVertical, Youtube } from "lucide-react";
import type { FaqItem } from "~/fsd/shared/lib/seo";
import type { ShortsSpec } from "../model/types";

export const shortsSpecs: ShortsSpec[] = [
  {
    label: "Aspect ratio",
    value: "1080 x 1920",
    description:
      "Vertical 9:16 mp4 — the canonical YouTube Shorts shape, no extra crop required.",
    icon: RectangleVertical,
  },
  {
    label: "Clip length",
    value: "40 - 60 seconds",
    description:
      "Each clip lands inside the YouTube Shorts duration limit while still giving the joke or insight room.",
    icon: Clock,
  },
  {
    label: "Captions",
    value: "Word-level burn-in",
    description:
      "WhisperX word timing is rendered into the frame so the clip reads even with sound off.",
    icon: CaptionsIcon,
  },
  {
    label: "Source",
    value: "Long-form podcasts",
    description:
      "Built around long conversational footage. The AI highlights Q&A beats, not generic moments.",
    icon: Youtube,
  },
];

export const shortsCaptionTrack = [
  {
    title: "English captions",
    description:
      "Driven directly from WhisperX word timings with an Anton-styled emphasis treatment.",
  },
  {
    title: "Korean captions",
    description:
      "Translated by Gemini and styled with Noto Sans KR when Korean is selected for the processing run.",
  },
] as const;

export const shortsReviewLoop = [
  "Each clip plays back inside the dashboard before download.",
  "Per-clip download via short-lived presigned S3 URLs (1 hour).",
  "Per-clip delete to keep the dashboard tight after export.",
] as const;

export const shortsFaq: FaqItem[] = [
  {
    question: "Are the outputs actually YouTube Shorts compatible?",
    answer:
      "Yes. The export is a 1080x1920 vertical mp4 between 40 and 60 seconds with burned-in captions. You upload it to YouTube as you would any Short.",
  },
  {
    question: "Does it support Korean Shorts?",
    answer:
      "Yes. Choose Korean before upload and processing to produce Korean-captioned Shorts styled with Noto Sans KR. Choose English before upload and processing for English-captioned output.",
  },
  {
    question: "Will the AI keep the speaker in frame?",
    answer:
      "The pipeline uses Columbia ASD active speaker detection to drive the 9:16 crop. When the active speaker is uncertain, it falls back to a blurred backdrop so faces are not awkwardly cut off.",
  },
  {
    question: "Do I need to upload to YouTube myself?",
    answer:
      "Yes. The current product produces and stores the clip. You download from the dashboard and publish it to YouTube manually.",
  },
];
```

### 11.2 UI

파일: `src/fsd/pages/youtube-shorts-generator/ui/index.tsx`

```tsx
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "~/fsd/shared/ui/atoms/card";
import { FaqSection } from "~/fsd/shared/ui/atoms/faq-section";
import { SeoPageHero } from "~/fsd/shared/ui/atoms/seo-page-hero";
import { SeoSection } from "~/fsd/shared/ui/atoms/seo-section";
import {
  shortsCaptionTrack,
  shortsFaq,
  shortsReviewLoop,
  shortsSpecs,
} from "../config";

export default function YoutubeShortsGeneratorPage() {
  return (
    <>
      <SeoPageHero
        eyebrow="YouTube Shorts Generator"
        title="YouTube Shorts Generator for Podcast Clips"
        description="Built specifically for podcast hosts who want YouTube Shorts. Vertical, captioned, and trimmed to the moments that survive without context."
        primaryCta={{ label: "Generate your first Short", href: "/login" }}
        secondaryCta={{
          label: "Compare to Reels and TikTok output",
          href: "/podcast-to-shorts",
        }}
      />

      <SeoSection
        eyebrow="Shorts-ready output"
        title="Every export already passes Shorts requirements"
      >
        <div className="grid gap-4 md:grid-cols-2">
          {shortsSpecs.map((spec) => (
            <Card key={spec.label} className="h-full px-2 py-4">
              <CardHeader>
                <div className="text-primary flex items-center gap-3">
                  <spec.icon className="size-5" />
                  <CardTitle className="text-lg">{spec.label}</CardTitle>
                </div>
                <CardDescription>{spec.value}</CardDescription>
              </CardHeader>
              <CardContent>
                <p className="text-muted-foreground text-sm">
                  {spec.description}
                </p>
              </CardContent>
            </Card>
          ))}
        </div>
      </SeoSection>

      <SeoSection
        eyebrow="Captions"
        title="Select English or Korean before processing"
      >
        <div className="grid gap-4 md:grid-cols-2">
          {shortsCaptionTrack.map((track) => (
            <Card key={track.title} className="h-full px-2 py-4">
              <CardHeader>
                <CardTitle className="text-lg">{track.title}</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-muted-foreground text-sm">
                  {track.description}
                </p>
              </CardContent>
            </Card>
          ))}
        </div>
      </SeoSection>

      <SeoSection
        eyebrow="Review loop"
        title="What happens after the AI finishes"
        description="The dashboard is the single review surface — no second tool, no re-uploads."
      >
        <ul className="text-muted-foreground list-disc space-y-1 pl-5 text-sm">
          {shortsReviewLoop.map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ul>
      </SeoSection>

      <FaqSection items={shortsFaq} />
    </>
  );
}
```

### 11.3 Route

파일: `src/app/(public-marketing)/youtube-shorts-generator/page.tsx`

```tsx
import { type Metadata } from "next";
import YoutubeShortsGeneratorPage from "~/fsd/pages/youtube-shorts-generator/ui";
import { shortsFaq } from "~/fsd/pages/youtube-shorts-generator/config";
import { generateFaqJsonLd } from "~/fsd/shared/lib/seo";
import { absoluteSiteUrl } from "~/fsd/shared/lib/site";

export const metadata: Metadata = {
  title: "YouTube Shorts Generator for Podcast Clips",
  description:
    "Generate YouTube Shorts from podcast videos with AI-selected highlights, 1080x1920 vertical framing, and word-level captions.",
  alternates: { canonical: absoluteSiteUrl("/youtube-shorts-generator") },
  openGraph: {
    title: "YouTube Shorts Generator for Podcast Clips",
    description:
      "Vertical, captioned, AI-selected podcast clips ready for YouTube Shorts.",
    locale: "en_US",
    url: absoluteSiteUrl("/youtube-shorts-generator"),
    type: "website",
  },
};

export default function Page() {
  const faqJsonLd = generateFaqJsonLd(shortsFaq);

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(faqJsonLd) }}
      />
      <YoutubeShortsGeneratorPage />
    </>
  );
}
```

---

## 12. 페이지 6 — `/ai-podcast-clipper`

검색 의도: 제품 카테고리 자체 (`AI podcast clipper`). 홈과 가장 중복되기 쉬운 페이지이므로, 홈은 브랜드 진입점, 이 페이지는 카테고리 정의/사용자 유형/사용 사례를 설명하는 교육형 페이지로 분리한다.

### 12.1 데이터

파일: `src/fsd/pages/ai-podcast-clipper/model/types.ts`

```ts
import type { LucideIcon } from "lucide-react";

export type AudienceCard = {
  audience: string;
  description: string;
  icon: LucideIcon;
};

export type CapabilityRow = {
  capability: string;
  description: string;
};
```

파일: `src/fsd/pages/ai-podcast-clipper/config/index.ts`

```ts
import { Briefcase, Mic, Users, Youtube } from "lucide-react";
import type { FaqItem } from "~/fsd/shared/lib/seo";
import type { AudienceCard, CapabilityRow } from "../model/types";

export const clipperAudiences: AudienceCard[] = [
  {
    audience: "Podcast hosts",
    description:
      "Need short-form clips to promote each episode without hiring a dedicated editor.",
    icon: Mic,
  },
  {
    audience: "YouTube creators",
    description:
      "Run long-form interview shows and want Shorts that actually pull from real moments, not template snippets.",
    icon: Youtube,
  },
  {
    audience: "Content teams",
    description:
      "Manage a backlog of episodes and want a predictable pipeline instead of per-clip manual editing.",
    icon: Users,
  },
  {
    audience: "Agencies",
    description:
      "Service multiple creator clients and need a tool that handles cropping, captioning, and selected-language output in one pass.",
    icon: Briefcase,
  },
];

export const clipperCapabilities: CapabilityRow[] = [
  {
    capability: "Highlight detection",
    description:
      "Gemini 2.5 picks Q&A moments at 40-60 seconds, not arbitrary clip lengths.",
  },
  {
    capability: "Word-level transcription",
    description:
      "WhisperX produces aligned word timings used for both captions and edit boundaries.",
  },
  {
    capability: "Active-speaker vertical framing",
    description:
      "Columbia ASD drives 1080x1920 cropping with a blurred-backdrop fallback.",
  },
  {
    capability: "Selectable caption language",
    description:
      "Each processing run exports clips with English or Korean captions based on the selected language.",
  },
  {
    capability: "Per-user S3 storage",
    description:
      "Originals and clips live in scoped prefixes accessed only via presigned URLs.",
  },
  {
    capability: "Dashboard review",
    description:
      "Status moves from queued to processing to processed without manual polling.",
  },
];

export const clipperFaq: FaqItem[] = [
  {
    question: "What is an AI podcast clipper?",
    answer:
      "An AI podcast clipper takes a long-form podcast video, uses AI to identify the strongest highlight moments, and produces short-form clips with captions and the right aspect ratio for platforms like YouTube Shorts.",
  },
  {
    question: "How is this different from a generic AI video editor?",
    answer:
      "AI Podcast Clipper is shaped for long-form conversation. The highlight model is tuned for Q&A density rather than action cues, and the cropping uses active-speaker detection so the host or guest stays in frame as conversation moves.",
  },
  {
    question: "Can I use it for non-podcast video?",
    answer:
      "Technically the pipeline accepts any .mp4 up to 900 MB. Quality of highlight selection drops on non-conversational content because the model is trained to surface dialogue beats.",
  },
  {
    question: "Does it replace a human editor?",
    answer:
      "It removes the repetitive parts — finding moments, cropping, captioning, and translating — so a human editor can focus on selection, thumbnail, and platform-specific copy.",
  },
];
```

### 12.2 UI

파일: `src/fsd/pages/ai-podcast-clipper/ui/index.tsx`

```tsx
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "~/fsd/shared/ui/atoms/card";
import { FaqSection } from "~/fsd/shared/ui/atoms/faq-section";
import { SeoPageHero } from "~/fsd/shared/ui/atoms/seo-page-hero";
import { SeoSection } from "~/fsd/shared/ui/atoms/seo-section";
import {
  clipperAudiences,
  clipperCapabilities,
  clipperFaq,
} from "../config";

export default function AiPodcastClipperPage() {
  return (
    <>
      <SeoPageHero
        eyebrow="AI Podcast Clipper"
        title="AI Podcast Clipper for Long-Form Podcast Video"
        description="An AI podcast clipper is a tool that turns long conversational episodes into short-form clips automatically. This page explains what that actually means in practice — the model, the workflow, and who it is built for."
        primaryCta={{ label: "Try it free", href: "/login" }}
        secondaryCta={{ label: "See product tour", href: "/product-tour" }}
      />

      <SeoSection
        eyebrow="Definition"
        title="What an AI podcast clipper actually does"
        description="Three jobs that used to be three separate tools — highlight selection, vertical cropping, and captioning — collapse into one upload."
      >
        <ul className="text-muted-foreground list-disc space-y-2 pl-5">
          <li>Reads a long-form podcast .mp4 and transcribes it word-by-word.</li>
          <li>
            Scores conversational segments and picks 1-4 clips between 40 and 60
            seconds each.
          </li>
          <li>
            Renders each clip vertically with active-speaker framing and burned-in
            captions.
          </li>
        </ul>
      </SeoSection>

      <SeoSection
        eyebrow="Audience"
        title="Who AI Podcast Clipper is built for"
      >
        <div className="grid gap-4 md:grid-cols-2">
          {clipperAudiences.map((audience) => (
            <Card key={audience.audience} className="h-full px-2 py-4">
              <CardHeader>
                <div className="text-primary flex items-center gap-3">
                  <audience.icon className="size-5" />
                  <CardTitle className="text-lg">
                    {audience.audience}
                  </CardTitle>
                </div>
                <CardDescription>{audience.description}</CardDescription>
              </CardHeader>
            </Card>
          ))}
        </div>
      </SeoSection>

      <SeoSection
        eyebrow="What is in the box"
        title="Capabilities at a glance"
      >
        <ul className="space-y-3">
          {clipperCapabilities.map((row) => (
            <li
              key={row.capability}
              className="border-border/80 bg-card/80 rounded-2xl border p-4 shadow-sm"
            >
              <p className="text-foreground font-medium">{row.capability}</p>
              <p className="text-muted-foreground mt-1 text-sm">
                {row.description}
              </p>
            </li>
          ))}
        </ul>
      </SeoSection>

      <FaqSection items={clipperFaq} />
    </>
  );
}
```

### 12.3 Route

파일: `src/app/(public-marketing)/ai-podcast-clipper/page.tsx`

```tsx
import { type Metadata } from "next";
import AiPodcastClipperPage from "~/fsd/pages/ai-podcast-clipper/ui";
import { clipperFaq } from "~/fsd/pages/ai-podcast-clipper/config";
import { generateFaqJsonLd } from "~/fsd/shared/lib/seo";
import { absoluteSiteUrl } from "~/fsd/shared/lib/site";

export const metadata: Metadata = {
  title: "Long-Form Podcast Video Clipper",
  description:
    "AI Podcast Clipper turns long-form podcast video into Q&A highlight clips with word-level captions and vertical 1080x1920 framing.",
  alternates: { canonical: absoluteSiteUrl("/ai-podcast-clipper") },
  openGraph: {
    title: "AI Podcast Clipper for Long-Form Podcast Video",
    description:
      "Highlight detection, captions, and vertical framing for podcast hosts and creators.",
    locale: "en_US",
    url: absoluteSiteUrl("/ai-podcast-clipper"),
    type: "website",
  },
};

export default function Page() {
  const faqJsonLd = generateFaqJsonLd(clipperFaq);

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(faqJsonLd) }}
      />
      <AiPodcastClipperPage />
    </>
  );
}
```

설계 메모:

- root layout의 `title.template` 때문에 문자열 title은 자동으로 ` | AI Podcast Clipper`가 붙는다.
- 따라서 이 route에서 `title: "AI Podcast Clipper"`를 쓰면 최종 title이 `AI Podcast Clipper | AI Podcast Clipper`처럼 중복된다.
- `/ai-podcast-clipper`는 카테고리/교육형 페이지이므로 route title은 `Long-Form Podcast Video Clipper`로 두고, 최종 `<title>`은 `Long-Form Podcast Video Clipper | AI Podcast Clipper`가 되게 한다.

---

## 13. Sitemap.ts 수정

파일: `src/app/sitemap.ts` (최종 PR-4 기준 전체 교체)

아래 코드는 6개 신규 public route가 모두 존재하는 최종본이다. PR-2/PR-3 단계에서는 해당 배포에 실제 포함된 route만 `PUBLIC_PAGES`에 남기고, 아직 존재하지 않는 route는 sitemap에 넣지 않는다.

```ts
import { type MetadataRoute } from "next";
import { absoluteSiteUrl } from "~/fsd/shared/lib/site";

type ChangeFrequency = NonNullable<
  MetadataRoute.Sitemap[number]["changeFrequency"]
>;

interface PublicPageEntry {
  path: string;
  changeFrequency: ChangeFrequency;
  priority: number;
}

const PUBLIC_PAGES: readonly PublicPageEntry[] = [
  { path: "/", changeFrequency: "weekly", priority: 1.0 },
  { path: "/product-tour", changeFrequency: "monthly", priority: 0.8 },
  { path: "/features", changeFrequency: "monthly", priority: 0.8 },
  { path: "/pricing", changeFrequency: "monthly", priority: 0.7 },
  { path: "/ai-podcast-clipper", changeFrequency: "monthly", priority: 0.75 },
  { path: "/podcast-to-shorts", changeFrequency: "monthly", priority: 0.75 },
  {
    path: "/youtube-shorts-generator",
    changeFrequency: "monthly",
    priority: 0.75,
  },
  { path: "/terms", changeFrequency: "yearly", priority: 0.3 },
  { path: "/privacy", changeFrequency: "yearly", priority: 0.3 },
];

export default function sitemap(): MetadataRoute.Sitemap {
  // Update LAST_UPDATED only when new pages are added or significant page content changes.
  // Minor copy edits should NOT bump the timestamp — Google would treat the whole sitemap
  // as freshly modified, weakening the signal for actually-updated routes.
  const LAST_UPDATED = new Date("2026-05-10");

  return PUBLIC_PAGES.map((page) => ({
    url: absoluteSiteUrl(page.path),
    lastModified: LAST_UPDATED,
    changeFrequency: page.changeFrequency,
    priority: page.priority,
  }));
}
```

설계 메모:

- `as const` 는 type annotation `readonly PublicPageEntry[]` 와 충돌하므로 제거. literal 보존이 필요하지 않다.
- `LAST_UPDATED` 는 실제 신규 public URL을 추가하는 배포일의 KST 일자로 설정한다. 이 문서 기준 보정일은 2026-05-10이므로 예시는 `2026-05-10`을 사용한다. 마이너 카피 수정 시 갱신하지 않는다.

---

## 14. Robots.ts 검토

`src/app/robots.ts` 는 현재:

```ts
disallow: ["/dashboard", "/api/", "/login"],
```

신규 6개 공개 URL은 `disallow` 항목과 겹치지 않으므로 그대로 두면 자동으로 크롤 허용된다. 단, `/signup` 도 `metadata.robots: { index: false }` 만 설정되어 있고 `redirect("/login")` 으로 즉시 이동하지만, 방어적으로 robots.txt 에도 추가한다.

수정:

```ts
import { type MetadataRoute } from "next";
import { absoluteSiteUrl } from "~/fsd/shared/lib/site";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: "*",
        allow: ["/"],
        // Authenticated and API surfaces stay out of the index.
        disallow: ["/dashboard", "/api/", "/login", "/signup"],
      },
    ],
    sitemap: absoluteSiteUrl("/sitemap.xml"),
  };
}
```

### 14.1 Open Graph locale 정합

신규 public 페이지는 모두 영문 콘텐츠다. 루트 metadata나 홈 metadata에 `alternateLocale: "ko_KR"`가 남아 있으면 Google과 SNS 크롤러에 한국어 alternate가 있는 것처럼 신호를 줄 수 있으므로, 이번 PR에서 함께 제거한다.

파일: `src/app/layout.tsx`

```tsx
export const metadata: Metadata = {
  // ...existing metadata...
  openGraph: {
    title: SITE_NAME,
    description: SITE_DESCRIPTION,
    url: SITE_URL,
    siteName: SITE_NAME,
    locale: "en_US",
    type: "website",
  },
  // ...existing metadata...
};
```

파일: `src/app/page.tsx`

```tsx
export const metadata: Metadata = {
  title: "AI Podcast Clipper for YouTube Shorts",
  description:
    "Upload your podcast video and AI finds the best Q&A highlights, adds captions, and exports vertical short-form clips. Powered by Gemini 2.5 + WhisperX. English or Korean captions are selected per processing run.",
  alternates: {
    canonical: absoluteSiteUrl("/"),
  },
  openGraph: {
    type: "website",
    locale: "en_US",
    siteName: SITE_NAME,
    title: "AI Podcast Clipper for YouTube Shorts",
    description:
      "AI automatically detects podcast highlights and creates captioned vertical clips in minutes.",
    url: absoluteSiteUrl("/"),
  },
};
```

설계 메모:

- `alternateLocale: "ko_KR"`는 실제 한국어 canonical/alternate URL이 생길 때 `src/app/layout.tsx`와 해당 locale page metadata에 다시 추가한다.
- 현재 코드 기준 제거 대상은 `src/app/layout.tsx`와 `src/app/page.tsx` 두 곳이다.
- 신규 6개 public page의 `openGraph.locale`도 `"en_US"`로 명시한다.
- 이 변경은 한국어 번역을 하지 않는 대신 잘못된 다국어 신호를 제거하는 조치다.

---

## 15. 디자인 원칙 (신규 페이지에 한정)

1. 첫 화면에 `eyebrow → H1 → description → CTA` 순으로 배치한다. 카드 안에 hero를 넣지 않는다.
2. hero 아래에 워크플로우/기능 요약이 바로 이어지도록 layout `<main>`은 `gap-20` 유지.
3. 카드 안에 또 다른 카드를 넣지 않는다. 모든 페이지의 반복 카드는 `Card` atom 또는 `border-border/80 bg-card/80 rounded-2xl border p-5 shadow-sm` 둘 중 하나로 통일.
4. 장식용 `gradient orb`/`bokeh blur`는 신규 페이지에 추가하지 않는다. 홈에만 유지된다.
5. 모든 CTA 의 href 는 정적이다 — primary 는 `/login`, secondary 는 다른 공개 페이지. logged-in 사용자는 `/login` → `/dashboard` 자동 redirect 로 처리.
6. mobile 에서 H1, CTA, eyebrow가 겹치지 않도록 hero 는 `space-y-8`/`space-y-6` 유지.
7. `lucide-react` 아이콘은 이미 의존성에 있으므로 자유롭게 사용. 새 아이콘 라이브러리는 추가하지 않는다.

---

## 16. 검증 방법

### 16.0 자동 테스트 부재

**본 PR 은 자동 테스트를 도입하지 않는다.** 프로젝트 전체에 테스트 프레임워크가 설정되어 있지 않다(`package.json` 에 `test` 스크립트 없음, `jest.config.*`/`vitest.config.*`/`playwright.config.*` 모두 부재, `__tests__/`/`e2e/` 디렉토리 없음). 본 PR 의 모든 검증은 다음 4가지에 의존한다:

1. TypeScript 타입 검사 (`npm.cmd run check` 가 `tsc --noEmit` 실행)
2. ESLint (`npm.cmd run check` 가 `next lint` 실행)
3. `npm.cmd run build` 정적 분석
4. 배포 후 수동 smoke + Search Console URL 검사

향후 SEO 회귀 방지를 위해 별도 PR 로 Playwright E2E 도입 권장. 우선 타겟:
- 6개 공개 URL 이 200 OK 응답 + 올바른 `<title>`/description/canonical
- 각 URL 의 FAQPage JSON-LD 가 화면 FAQ 와 일치
- PublicHeader/SiteHeader nav 클릭 → 올바른 URL 이동
- 홈 hero primary CTA → `/login`, `See product tour` → `/product-tour` 회귀 방지

### 16.1 로컬 검증

```powershell
npm.cmd run check
npm.cmd run build
```

`check` 는 `next lint && tsc --noEmit` 를 모두 실행하므로, 타입/린트 오류는 build 전에 잡힌다.

현재 Next.js 15.5.7 기준으로 `next lint`는 통과하지만, 실행 시 Next.js 16에서 제거 예정이라는 deprecation warning이 출력된다. 이 경고는 본 PR의 실패 조건이 아니며, Next 16 업그레이드 전 별도 PR에서 ESLint CLI 기반 스크립트로 마이그레이션한다.

### 16.2 정적 검증 항목

각 신규 URL 에 대해 다음을 확인한다:

1. `<title>` 이 `<페이지명> | AI Podcast Clipper` 형태로 렌더된다(루트 layout 의 `template` 적용).
2. `<link rel="canonical">` 이 절대 URL 로 자기 자신을 가리킨다.
3. `<meta name="description">` 이 페이지마다 고유하다(중복 검사: 6 개 description 텍스트가 모두 다른지).
4. `<script type="application/ld+json">` 안에 `FAQPage` 마크업이 화면 FAQ 와 1:1 일치한다.
5. PublicHeader 와 SiteHeader 의 `Features`/`Pricing`/`Product tour` 링크가 새 페이지로 이동한다.
6. SiteFooter 의 `Solutions` 그룹 링크가 새 페이지로 이동한다.
7. 홈 hero 의 primary CTA 가 `/login`, `See product tour` 가 `/product-tour` 로 이동한다.
8. `npm run build` 출력에서 6개 신규 라우트가 정적 prerender 대상(`○` 또는 Next.js가 표시하는 static route)인지 확인한다. `ƒ` dynamic route로 표시되면 layout/page에서 `auth()`, `cookies()`, `headers()`, DB 조회가 들어간 것이다.
9. **Footer 시각 확인**: `/terms` 와 `/privacy` 페이지를 데스크톱/모바일에서 열어 새 responsive footer(`sm:grid-cols-2 lg:grid-cols-3`)가 `max-w-3xl` 컨테이너 안에서 가독 가능한지 확인한다.

### 16.3 배포 후 검증

배포 후 검증 대상 URL:

```text
https://a-pch.com/product-tour
https://a-pch.com/features
https://a-pch.com/pricing
https://a-pch.com/ai-podcast-clipper
https://a-pch.com/podcast-to-shorts
https://a-pch.com/youtube-shorts-generator
```

확인 단계:

1. 단계별 배포에서는 `https://a-pch.com/sitemap.xml` 에 해당 배포에 포함된 신규 URL만 포함되는지 확인. 최종 배포에서는 신규 6 개 URL 전체가 포함되는지 확인.
2. 해당 배포에 포함된 각 신규 URL이 `200 OK` 응답인지 확인. 최종 배포에서는 6 개 신규 URL 모두 확인.
3. `view-source:` 로 canonical, description, JSON-LD 를 직접 확인.
4. `<meta name="robots">` 에 `noindex` 가 없는지 확인(루트 layout 이 `index: true` 설정).
5. Search Console 에서 sitemap 재제출.
6. 핵심 URL 만 URL 검사 후 색인 생성 요청(전체 6 개를 한 번에 요청하면 quota 소모가 빠르므로, `/product-tour`, `/features`, `/pricing` 우선).

---

## 17. 실제 구현 체크리스트

### 17.1 공통 모듈

- [ ] `src/fsd/shared/ui/atoms/seo-page-hero.tsx` 추가
- [ ] `src/fsd/shared/ui/atoms/seo-section.tsx` 추가
- [ ] `src/fsd/shared/ui/atoms/faq-section.tsx` 추가
- [ ] `src/fsd/shared/lib/seo.ts` 에 `FaqItem`, `generateFaqJsonLd` 추가
- [ ] `src/fsd/features/billing/config/plan-tiers.ts` 추가
- [ ] `src/fsd/features/billing/config/index.ts` 에서 `PLAN_TIERS`, `PlanTier`를 `plan-tiers.ts`에서 re-export하도록 수정

### 17.2 헤더 / 푸터 / 홈

- [ ] `src/fsd/widgets/site-header/config/public-nav.ts` 추가
- [ ] `src/fsd/widgets/site-header/ui/public-header.tsx` 추가
- [ ] `src/fsd/widgets/site-header/ui/index.tsx` 공개 nav 추가 (기존 client auth/dropdown 유지). `/features`, `/pricing`, `/product-tour` route가 같은 배포에 포함될 때만 production 노출
- [ ] `src/fsd/pages/home/ui/_component/HeroSection.tsx` primary CTA `/dashboard` → `/login` 수정. `/login`은 기존 route이므로 단독 배포 가능
- [ ] `src/fsd/pages/home/ui/_component/HeroSection.tsx` secondary CTA `/dashboard` → `/product-tour` 수정. `/product-tour` route가 같은 배포에 포함될 때만 production 노출
- [ ] `src/fsd/pages/home/config/index.ts`의 "English & Korean", "each exported as its own clip" 표현을 "English or Korean selected per processing run" 기준으로 수정
- [ ] `src/app/page.tsx` home metadata description의 "English & Korean subtitles supported" 표현을 "English or Korean captions are selected per processing run" 기준으로 수정
- [ ] `src/fsd/widgets/site-footer/ui/index.tsx` 그룹 링크 교체 (전체 교체). 신규 6개 공개 route가 모두 같은 배포에 포함될 때만 production 노출
- [ ] `src/app/layout.tsx` root `openGraph.alternateLocale: "ko_KR"` 제거
- [ ] `src/app/page.tsx` home `openGraph.alternateLocale: "ko_KR"` 제거

### 17.3 Route group + layout

- [ ] `src/app/(public-marketing)/layout.tsx` 추가 (세션 조회 없는 정적 PublicHeader/SiteFooter 셸)
- [ ] (선택) `src/app/(public-marketing)/error.tsx` 추가 — page 렌더 실패 시 marketing 맞춤 fallback. 미추가 시 root error boundary 로 fallthrough.
- [ ] (선택) `src/app/(public-marketing)/loading.tsx` 추가 — route transition placeholder UI. §4 의 코드 예시 사용.

### 17.4 라우트 / FSD 모듈 (페이지별 동일 4 개 파일)

각 페이지마다 다음 4 개 파일을 생성한다.

| 페이지 | route (route group 내부) | ui | config | model |
| --- | --- | --- | --- | --- |
| product-tour | `src/app/(public-marketing)/product-tour/page.tsx` | `src/fsd/pages/product-tour/ui/index.tsx` | `src/fsd/pages/product-tour/config/index.ts` | `src/fsd/pages/product-tour/model/types.ts` |
| features | `src/app/(public-marketing)/features/page.tsx` | `src/fsd/pages/features/ui/index.tsx` | `src/fsd/pages/features/config/index.ts` | `src/fsd/pages/features/model/types.ts` |
| pricing | `src/app/(public-marketing)/pricing/page.tsx` | `src/fsd/pages/pricing/ui/index.tsx` | `src/fsd/pages/pricing/config/index.ts` | `src/fsd/pages/pricing/model/types.ts` |
| podcast-to-shorts | `src/app/(public-marketing)/podcast-to-shorts/page.tsx` | `src/fsd/pages/podcast-to-shorts/ui/index.tsx` | `src/fsd/pages/podcast-to-shorts/config/index.ts` | `src/fsd/pages/podcast-to-shorts/model/types.ts` |
| youtube-shorts-generator | `src/app/(public-marketing)/youtube-shorts-generator/page.tsx` | `src/fsd/pages/youtube-shorts-generator/ui/index.tsx` | `src/fsd/pages/youtube-shorts-generator/config/index.ts` | `src/fsd/pages/youtube-shorts-generator/model/types.ts` |
| ai-podcast-clipper | `src/app/(public-marketing)/ai-podcast-clipper/page.tsx` | `src/fsd/pages/ai-podcast-clipper/ui/index.tsx` | `src/fsd/pages/ai-podcast-clipper/config/index.ts` | `src/fsd/pages/ai-podcast-clipper/model/types.ts` |

PR-3에서 `/podcast-to-shorts` route가 생기는 같은 배포에만 `src/fsd/pages/features/ui/index.tsx`를 추가 수정한다.

```tsx
import Link from "next/link";
import { Button } from "~/fsd/shared/ui/atoms/button";

// FaqSection 직전에 추가
<SeoSection
  eyebrow="Workflow fit"
  title="Planning podcast clips for short-form channels?"
  description="The podcast-to-shorts page explains the channel workflow once the feature set is clear."
>
  <Button asChild variant="outline">
    <Link href="/podcast-to-shorts">See podcast-to-shorts workflow</Link>
  </Button>
</SeoSection>
```

- [ ] PR-3에서 `/features` → `/podcast-to-shorts` 문맥 링크 추가
- [ ] PR-3에서 `/podcast-to-shorts` → `/youtube-shorts-generator` 문맥 링크가 같은 배포에 포함되는지 확인

### 17.5 sitemap / robots

- [ ] `src/app/sitemap.ts` 갱신. production 배포 기준으로 실제 존재하는 URL만 포함. 최종 6개 공개 route가 모두 포함된 배포에서 9개 URL 최종본으로 갱신
- [ ] `src/app/robots.ts` 에 `/signup` disallow 추가
- [ ] 신규 public page 6개 route metadata에 `openGraph.locale: "en_US"` 명시
- [ ] `src/fsd/features/billing/ui/PlanCard.tsx` Pro 카드의 `Priority processing` 문구 제거

### 17.6 검증

- [ ] `npm.cmd run check` 통과
- [ ] `npm.cmd run build` 통과
- [ ] `next build` 출력에서 6 개 신규 라우트가 정적 route로 표시되는지 확인 (`ƒ` 표시가 나오면 원인 제거)
- [ ] terms/privacy 페이지의 responsive footer 시각 확인 (max-w-3xl 컨테이너에서 가독 가능)
- [ ] 배포 후 해당 배포에 포함된 신규 public URL 모두 `200 OK`. 최종 배포에서는 6 개 신규 URL 모두 `200 OK`
- [ ] 단계별 배포에서는 `https://a-pch.com/sitemap.xml` 이 실제 존재하는 URL만 포함
- [ ] 최종 배포에서는 `https://a-pch.com/sitemap.xml` 에 9 개 항목 포함
- [ ] Search Console 에 sitemap 재제출

---

## 18. 권장 개발 순서

가장 안전하고 PR 단위로 쪼갤 수 있는 순서:

1. **(PR-1) 인프라, production 배포 가능**: `(public-marketing)/layout.tsx` + 정적 `PublicHeader` + 공통 atoms 3 개 (`SeoPageHero`, `SeoSection`, `FaqSection`) + `seo.ts` 확장 + billing `plan-tiers.ts` 분리 + root/home `alternateLocale` 제거. 이 PR은 기존 공개 화면에 신규 URL 링크를 노출하지 않는다.
2. **(PR-2) Phase 1 페이지 + 안전한 링크 노출**: `/product-tour`, `/features`, `/pricing` + SiteHeader nav + 홈 hero CTA(`/product-tour`) + sitemap에 실제 존재하는 Phase 1 URL만 추가. 이 배포부터 홈 → product-tour → pricing 흐름이 정상 동작한다.
3. **(PR-3) Phase 2 페이지 + 문맥 링크**: `/podcast-to-shorts`, `/youtube-shorts-generator` + sitemap에 해당 2개 URL 추가 + `/features`에서 `/podcast-to-shorts`로, `/podcast-to-shorts`에서 `/youtube-shorts-generator`로 이어지는 문맥 링크 추가. footer full replacement는 아직 적용하지 않는다.
4. **(PR-4) 카테고리 페이지 + 최종 내부 링크**: `/ai-podcast-clipper` + 최종 description 점검 + SiteFooter 전체 그룹 링크 교체 + sitemap 9개 URL 최종본 적용. 이 시점에는 footer의 모든 링크 대상 route가 존재한다.
5. **(배포 직후)** Search Console sitemap 재제출 + 우선순위 URL URL 검사.

이 순서가 좋은 이유:

- PR-1 은 신규 URL을 노출하지 않아 production에 배포돼도 404 내부 링크를 만들지 않는다.
- PR-2 는 링크 대상(`/product-tour`, `/features`, `/pricing`)을 같은 배포에 포함하므로 header/home CTA가 깨지지 않는다.
- PR-3 는 신규 라우트, sitemap 항목, 신규 라우트로 들어가는 문맥 링크를 같은 배포에서 늘린다.
- PR-4 는 모든 route가 존재하는 마지막 단계에서만 footer 전체 사이트맵 링크를 노출한다.
- 홈과 가장 중복 위험이 큰 `/ai-podcast-clipper` 를 마지막에 두어 description/H1 차별화를 마지막에 맞춘다.

---

## 19. 예상 리스크와 대응

| 리스크 | 설명 | 대응 |
| --- | --- | --- |
| 콘텐츠 중복 | 홈, `/ai-podcast-clipper`, `/podcast-to-shorts` 가 비슷해질 수 있음 | 각 페이지의 H1/description/FAQ 를 본 문서 그대로 복사해 사용. 임의로 마케팅 문구를 추가할 때마다 6 개 description 을 한 번 더 비교 |
| 가격 정보 불일치 | 공개 pricing 과 실제 credit 차감 정책이 다를 수 있음 | Pricing UI 는 순수 `plan-tiers.ts`의 `PLAN_TIERS` 단일 소스에서 직접 import하고, credit 문구는 "성공적으로 완료된 처리(run)에서 생성된 clip당 1 credit 차감"으로 통일. 부분 생성/실패 run을 차감 대상으로 표현하지 않음 |
| pricing client bundle 오염 | `PLAN_TIERS`를 `config/index.ts`에서 import하면 같은 모듈의 `process.env.POLAR_SERVER` 참조가 향후 client UI 전환 시 섞일 수 있음 | `PLAN_TIERS`를 `src/fsd/features/billing/config/plan-tiers.ts`로 분리하고 public pricing은 해당 순수 모듈만 import. index는 re-export로 기존 dashboard import 호환성 유지 |
| 언어 출력 과장 | 현재 처리 구조는 run당 `language` 하나를 전달하므로 English와 Korean clip을 같은 run에서 동시에 생성한다고 표현하면 실제 동작과 어긋남 | 신규 public page뿐 아니라 `src/app/page.tsx`, `src/fsd/pages/home/config/index.ts`, `src/fsd/shared/lib/seo.ts`까지 "English or Korean selected per processing run" 기준으로 통일. dual-language/same-run/separate variant 표현 금지 |
| 얇은 페이지 | 페이지 수만 늘리고 정보 부족 | 본 문서의 모든 섹션(워크플로우/비교표/FAQ/플랫폼 매트릭스)을 그대로 구현 — 빈 섹션 없이 출시 |
| 내부 링크 누락 또는 선노출 404 | sitemap/link가 route보다 먼저 배포되면 크롤러와 사용자가 404를 만남 | header/home CTA는 `/product-tour`, `/features`, `/pricing` route와 같은 배포에서만 노출. PR-3 문맥 링크(`/features` → `/podcast-to-shorts`, `/podcast-to-shorts` → `/youtube-shorts-generator`)는 두 target route가 같은 배포에 포함될 때만 추가. SiteFooter 전체 그룹 링크와 sitemap 9개 URL 최종본은 6개 route가 모두 존재하는 최종 배포에서만 적용 |
| 결제 미도입 상태 | `NEXT_PUBLIC_SUBSCRIPTION_ENABLED=false` 일 때 Pro 플랜이 결제 가능한 것처럼 보임 | 공개 `/pricing`은 env를 읽지 않고 checkout CTA를 두지 않음. 결제 가능 여부는 `/dashboard/billing`에서만 판단. public copy/metadata는 "plan details" 중심의 중립 문구 사용 |
| Pro 우선 처리 과장 | 실제 Inngest concurrency는 사용자당 1개 제한만 있고 플랜별 priority queue가 없음. 공개 pricing에서 문구를 제거해도 dashboard billing에 남으면 사용자가 기능 차이를 오해함 | `src/fsd/features/billing/ui/PlanCard.tsx`의 `Priority processing` 문구를 제거하고 실제 UI 동작과 맞는 "Monthly and yearly checkout options"로 교체 |
| public header client bundle 비대화 | 공개 SEO 페이지가 client `SiteHeader`를 import하면 `next-auth/react`와 dropdown JS를 함께 싣게 됨 | `(public-marketing)/layout.tsx`는 server component `PublicHeader`를 사용. 기존 홈만 client `SiteHeader` 유지. 단, root `Providers`가 모든 route를 감싸므로 전체 First Load JS 절감은 제한적이며 provider 재배치는 별도 성능 PR |
| FSD import 경계 위반 | shared 가 entities 를 import 하거나 widget 끼리 shell 조립을 하면 현재 구조와 어긋남 | 본 설계는 layout 을 `app/` 에 두고 shared atoms는 shared/lib 또는 shared/ui만 import. PR 리뷰 시 `Grep "from \"~/fsd/(entities\|features\|widgets\|pages)" src/fsd/shared` 로 0 건 확인 |
| Footer 좁은 컨테이너 | Terms/Privacy 에서 footer가 빽빽하게 보일 수 있음 | footer 자체를 `sm:grid-cols-2 lg:grid-cols-3`로 설계해 바로 3열 압축을 피함. §16.2 #9에서 smoke 확인 |
| 빌드 실패 | `metadata` 타입, JSON-LD 직렬화, 잘못된 path alias | 페이지별 구현 후 `npm run check` + `npm run build` 모두 통과시 머지 |
| 검증 스크립트 노후화 | `npm.cmd run check`가 현재는 통과하지만 내부적으로 Next.js 16에서 제거 예정인 `next lint`를 사용함 | 본 PR에서는 warning을 실패로 보지 않는다. Next 16 업그레이드 전 ESLint CLI 기반 `lint`/`check` 스크립트로 별도 마이그레이션 |
| 다국어 신호 모순 | root layout과 home page의 `openGraph.alternateLocale: "ko_KR"` 선언과 신규 페이지의 영문 only 콘텐츠 불일치. Google 이 한국어 alternate 를 기대하나 존재하지 않음 | 본 PR에서 `src/app/layout.tsx`, `src/app/page.tsx`의 `alternateLocale` 제거, 신규 public page `openGraph.locale: "en_US"` 명시. 실제 한국어 URL이 생길 때 alternate 재도입 |
| Dynamic rendering 회귀 | 누군가 공개 layout/page에 `auth()`, `cookies()`, `headers()`, DB 조회를 추가하면 정적 prerender가 깨짐 | §4에서 세션 조회 금지. §16.2 #8과 §17.6에서 build output static 여부 확인 |
| 자동 테스트 부재 | 프로젝트 전체에 테스트 프레임워크 없음. SEO 회귀(예: title/description/canonical/JSON-LD 변경)가 CI 에서 잡히지 않음 | 본 PR 범위 외. 별도 PR 로 Playwright E2E 도입 시 6개 URL metadata 회귀 + 홈 hero CTA 회귀를 첫 타겟으로 추가 |
| 라우트 정의 분산 | `PUBLIC_NAV_ITEMS` (header), `FOOTER_GROUPS` (footer), `PUBLIC_PAGES` (sitemap) 가 같은 URL 집합을 3 곳에 독립 정의 | v1 OK. 신규 공개 페이지 추가 빈도가 늘면 `src/fsd/shared/config/public-routes.ts` 단일 source 로 통합 검토 |
| 로그인 사용자 header 개인화 없음 | 공개 SEO 페이지에서는 로그인 사용자에게도 header가 `Log in`으로 보임 | 의도적 결정. CTA `/login` 클릭 시 기존 로그인 redirect로 `/dashboard` 이동. 정적 렌더링과 CDN 캐시를 우선 |

---

## 20. 완료 기준

- 6 개 신규 공개 URL 이 모두 `200 OK` 로 열린다.
- 6 개 신규 URL 이 sitemap 에 포함된다.
- 각 페이지의 `<title>`, description, canonical 이 고유하다.
- root `title.template` 적용 후에도 `AI Podcast Clipper | AI Podcast Clipper` 같은 중복 title 이 없다.
- 각 페이지가 PublicHeader / SiteHeader / SiteFooter / 홈 또는 관련 페이지에서 링크된다.
- `/dashboard`, `/login`, `/signup` 은 여전히 색인 대상에서 제외된다.
- `npm.cmd run check`, `npm.cmd run build` 모두 통과한다.
- `next build` 출력에서 신규 6개 공개 URL이 dynamic route로 표시되지 않는다.
- Search Console 에 sitemap 을 재제출할 수 있는 상태다.
- `src/app/layout.tsx`, `src/app/page.tsx` 어느 곳에도 `alternateLocale: "ko_KR"`가 남지 않는다.
- `src/fsd/pages/pricing/ui/index.tsx` 는 `~/fsd/features/billing/config/plan-tiers`에서 `PLAN_TIERS`를 import한다.
- `Grep "from \"~/fsd/(entities|features|widgets|pages)" src/fsd/shared` → 0 건. shared 의 단방향 의존성 유지.
- `Grep "from \"~/fsd/widgets/[^\"]+/" src/fsd/widgets` 결과가 모두 같은 widget 내부 segment 참조임. 다른 widget slice cross-import 0 건.

이 구현의 목적은 단기 순위 보장이 아니라, Google 이 `a-pch.com` 을 "팟캐스트를 숏폼 클립으로 바꾸는 AI SaaS" 로 명확히 분류할 수 있게 만드는 것이다.

---

## 21. NOT in scope

- **한국어 번역**: 신규 페이지는 영문 only. 이번 PR에서는 `src/app/layout.tsx`, `src/app/page.tsx`의 잘못된 `alternateLocale: "ko_KR"`만 제거하고, 실제 한국어 번역/alternate URL 추가는 별도 PR 처리.
- **Per-page sitemap `lastModified`**: v1 은 단일 `LAST_UPDATED` 사용. 페이지별 git log 기반 timestamp 는 v2.
- **자동 테스트 인프라**: 프로젝트 전체에 테스트 프레임워크 0건. 본 PR 은 인프라 도입까지 포함하지 않는다.
- **Per-page OG image**: 루트 `src/app/opengraph-image.png` 자동 적용에 의존. 페이지별 맞춤 이미지는 v2.
- **Dashboard / billing 기능 변경**: checkout, subscription, credit 지급/차감 로직 변경은 영향 없음. 단, 실제 동작과 맞지 않는 billing 카드의 `Priority processing` 문구를 제거하는 copy-only 수정은 본 PR 범위에 포함한다.
- **Dark mode 시각 회귀 검증**: 기존 tailwind 토큰 사용으로 자동 호환되나 명시적 검증은 본 PR 외.
- **Hard prepaid credit enforcement**: 현재 백엔드는 `credits > 0`이면 처리를 시작하고, 성공적으로 완료된 처리(run)의 생성 clip 수만큼 사후 차감한다. "요청 clip 수만큼 credit을 보유해야 시작" 정책은 별도 product/backend PR에서 결정한다.

---

## 22. Deferred Work (review-identified)

본 PR 머지 후 별도 PR 로 검토할 항목:

| 항목 | 이유 | 우선순위 |
| --- | --- | --- |
| `(public-marketing)/error.tsx` / `loading.tsx` 추가 | 공개 page 렌더 실패 시 graceful UX. v1 미추가 시 root error boundary fallthrough | P2 — 트래픽 시작 후 빠르게 |
| `src/fsd/shared/config/public-routes.ts` 단일 source | header nav + footer + sitemap 3 곳에 라우트 분산. 신규 공개 페이지 추가 빈도가 늘면 통합 | P3 — 두번째 추가 시 트리거 |
| Per-page sitemap `lastModified` | git log 기반으로 페이지별 갱신 시점 분리. 콘텐츠 마이너 수정과 신규 페이지 추가 신호 분리 | P3 |
| Playwright E2E 도입 + SEO 회귀 테스트 | 6개 URL 의 200 응답 + metadata + JSON-LD shape + 홈 hero CTA 회귀 검증 | P2 — SEO 회귀 위험 시 우선 |
| ESLint CLI 스크립트 마이그레이션 | 현재 `npm.cmd run check`가 `next lint`를 사용하며 Next.js 16에서 제거 예정 warning을 출력함 | P2 — Next 16 업그레이드 전 |
| Root provider 재배치 | root `Providers` 때문에 정적 공개 페이지도 React Query client provider JS를 공유함. 공개 페이지 First Load JS를 더 줄이려면 dashboard route group 쪽으로 provider 범위를 좁히는 설계 필요 | P3 — 성능 최적화가 필요할 때 |
| Header personalization | 공개 SEO 페이지에서 로그인 사용자에게도 `Log in`으로 보이는 UX를 개선하려면 클라이언트 측 header swap 또는 별도 dynamic shell 검토 | P3 — 트래픽/UX 필요 확인 시 |
| 홈 / `(public-marketing)` 통합 | 홈을 `(public-marketing)/page.tsx` 로 이동 → layout 셸 1곳에서 관리. 세션 fetch 중복 제거 | P3 — 디자인 일관성 결정 후 |
