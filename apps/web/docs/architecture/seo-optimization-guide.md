# SEO 최적화 구현 가이드

> SaaS 배포 체크리스트 #13 해결
> 최종 업데이트: 2026-03-23

---

## 구현 현황 (2026-03-23 기준)

### 완료된 작업

코드 변경 11개 항목 중 9개 완료. 아래 파일은 가이드의 "After" 코드와 일치함을 확인.

| # | 파일 | 상태 |
|---|------|------|
| 1 | `src/app/layout.tsx` | 완료 — 메타데이터 전면 강화, `lang="ko"` 적용 |
| 2 | `src/app/page.tsx` | 완료 — 홈 전용 메타데이터 + JSON-LD 삽입 |
| 3 | `src/app/login/page.tsx` | 완료 — `noindex` 설정 |
| 4 | `src/app/signup/page.tsx` | 완료 — 회원가입 메타데이터 + canonical + OG |
| 5 | `src/app/dashboard/layout.tsx` | 완료 — `"use server"` 제거, `noindex` 설정 |
| 6 | `src/app/robots.ts` | 완료 — 신규 생성 |
| 7 | `src/app/sitemap.ts` | 완료 — 신규 생성 |
| 8 | `src/fsd/shared/lib/seo.ts` | 완료 — JSON-LD 유틸리티 신규 생성 |
| 10 | `src/env.js` | 완료 — `NEXT_PUBLIC_SITE_URL` 스키마 및 `runtimeEnv` 등록 |

---

## 미완료 작업

### [필수] SEO 언어 타겟 수정 — 한국어 → 영어

**현재 상태**: 가이드 작성 시점에 한국어 사용자를 주 타겟으로 설정했으나, 실제 서비스는 **영어권(외국) 검색어 노출**이 목표다. 검색엔진은 `<html lang>`, OG locale, title/description 텍스트, keywords, JSON-LD 언어를 종합하여 노출 검색 언어를 결정한다. 현재 코드는 다섯 가지 신호 모두 한국어로 설정되어 있어 교정이 필요하다.

**영향 받는 파일 및 변경 내용:**

| 파일 | 현재 (한국어 타겟) | 변경 후 (영어 타겟) |
|------|-------------------|-------------------|
| `src/app/layout.tsx` | `lang="ko"`, `locale: "ko_KR"`, 한국어 description / keywords | `lang="en"`, `locale: "en_US"`, 영어 description / keywords |
| `src/app/page.tsx` | 한국어 title, description, OG | 영어 title, description, OG |
| `src/app/login/page.tsx` | `title: "로그인"` | `title: "Log In"` |
| `src/app/signup/page.tsx` | 한국어 title, description, OG | 영어 title, description, OG |
| `src/fsd/shared/lib/seo.ts` | 한국어 featureList, description, offers | 영어 featureList, description, offers |

**필요 작업:**
- [ ] `src/app/layout.tsx` — SITE_DESCRIPTION 영어로 교체, keywords 영어 전용으로 교체, `locale: "en_US"` / `alternateLocale: "ko_KR"`, `lang="en"`
- [ ] `src/app/page.tsx` — title, description, OG 영어로 교체
- [ ] `src/app/login/page.tsx` — `title: "Log In"` 으로 수정
- [ ] `src/app/signup/page.tsx` — title, description, OG 영어로 교체
- [ ] `src/fsd/shared/lib/seo.ts` — featureList, description, offers.description 영어로 교체

3절의 각 "After" 코드는 영어 타겟을 반영하여 갱신되어 있다.

---

### [필수] `public/og-image.png` 미생성

**현재 상태**: `public/` 디렉토리에 파일 없음. `layout.tsx`, `page.tsx`, `seo.ts` 세 곳에서 `/og-image.png`를 참조하고 있어 SNS 공유 시 이미지가 404를 반환한다.

**필요 작업**:
- [ ] 1200×630px PNG 파일을 `public/og-image.png`로 배치
- 전문 디자인이 준비되지 않은 경우 서비스명과 설명이 포함된 플레이스홀더 이미지라도 먼저 배치한 후 코드를 배포해야 한다 (3.9절 참조)

---

### [확인 필요] `.env`에 `NEXT_PUBLIC_SITE_URL` 추가

**현재 상태**: `src/env.js` 스키마 등록은 완료되었으나, 로컬 `.env` 파일에 실제 값이 추가되었는지 미확인.

**필요 작업**:
- [ ] `.env`에 `NEXT_PUBLIC_SITE_URL="https://podcastclipper.com"` 추가 (3.10절 참조)
- 미추가 시 로컬에서 fallback 값(`https://podcastclipper.com`)이 사용되므로 기능 자체는 동작하지만, 프로덕션 배포 플랫폼에도 동일하게 환경변수 설정 필요

---

### [배포 후] 검증 체크리스트 미수행

4절의 로컬/빌드/외부 도구 검증이 아직 수행되지 않았다.

**필요 작업**:
- [ ] 4.1 로컬 검증 — 메타데이터, robots.txt, sitemap.xml, JSON-LD, OG 이미지, Dashboard noindex 확인
- [ ] 4.2 빌드 검증 — `npm run build` 및 `npm run check` 통과 확인
- [ ] 4.3 외부 도구 검증 — Google Rich Results Test, Facebook Sharing Debugger, Twitter Card Validator 등 (배포 후)

---

### [배포 후] Google Search Console 연동 미완료

5절의 사이트 소유권 인증, 사이트맵 제출, 모니터링 설정이 아직 수행되지 않았다.

**필요 작업**:
- [ ] Google Search Console 속성 추가 및 소유권 인증
- [ ] `https://podcastclipper.com/sitemap.xml` 제출
- [ ] 검색 실적 및 Core Web Vitals 모니터링 설정

---

## 1. 현재 상태 진단

### 1.1 메타데이터

루트 레이아웃(`src/app/layout.tsx:6-10`)에 최소한의 메타데이터만 존재한다:

```typescript
export const metadata: Metadata = {
  title: "Podcast Clipper",
  description: "Podcast Clipper",
  icons: [{ rel: "icon", url: "/favicon.ico" }],
};
```

**문제점:**
- `title`과 `description`이 동일한 문자열 — 검색엔진이 페이지 목적을 파악할 수 없음
- Open Graph / Twitter Card 태그 없음 — SNS 공유 시 제목·이미지·설명 미표시
- 키워드 및 서비스 설명 부재 — 검색 노출 불가능
- `html` 태그에 `lang="en"` 하드코딩 (`layout.tsx:21`) — 한국어 사용자 대상 시 불리

### 1.2 페이지별 메타데이터

| 라우트 | 파일 | metadata export | 공개 여부 |
|--------|------|----------------|-----------|
| `/` | `src/app/page.tsx` | 없음 | 공개 (SEO 핵심) |
| `/login` | `src/app/login/page.tsx` | 없음 | 공개 (noindex 권장) |
| `/signup` | `src/app/signup/page.tsx` | 없음 | 공개 (index 가능) |
| `/dashboard` | `src/app/dashboard/page.tsx` | 없음 | 인증 필요 (noindex) |
| `/dashboard/uploads/[id]` | `src/app/dashboard/uploads/[uploadedFileId]/page.tsx` | 없음 | 인증 필요 (noindex) |

### 1.3 부재 항목 전체 목록

| 항목 | 상태 | 영향도 |
|------|------|--------|
| `robots.ts` | 없음 | 크롤러가 보호된 경로까지 크롤링 시도 |
| `sitemap.ts` | 없음 | 검색엔진이 페이지 구조를 파악할 수 없음 |
| Open Graph 태그 | 없음 | SNS 공유 시 빈 카드 표시 |
| Twitter Card 태그 | 없음 | X(Twitter) 공유 시 링크만 표시 |
| JSON-LD 구조화 데이터 | 없음 | 리치 스니펫(별점, FAQ 등) 불가 |
| Canonical URL | 없음 | 중복 URL 문제 발생 가능 |
| `manifest.json` | 없음 | PWA 영역이며 SEO 직접 영향 제한적 — 본 가이드 범위에서 제외, 별도 태스크 권장 |
| OG 이미지 | 없음 | 공유 시 대표 이미지 없음 |
| Dashboard noindex | 없음 | 인증 페이지가 검색엔진에 노출될 수 있음 |

---

## 2. 변경 범위

| # | 파일 | 작업 | 신규/수정 |
|---|------|------|-----------|
| 1 | `src/app/layout.tsx` | 루트 메타데이터 전면 강화 | 수정 |
| 2 | `src/app/page.tsx` | 홈페이지 전용 메타데이터 + JSON-LD | 수정 |
| 3 | `src/app/login/page.tsx` | noindex 메타데이터 추가 | 수정 |
| 4 | `src/app/signup/page.tsx` | 회원가입 메타데이터 추가 | 수정 |
| 5 | `src/app/dashboard/layout.tsx` | 대시보드 전체 noindex 메타데이터 + `"use server"` 제거 | 수정 |
| 6 | `src/app/robots.ts` | 크롤링 규칙 정의 | 신규 |
| 7 | `src/app/sitemap.ts` | 정적 사이트맵 생성 | 신규 |
| 8 | `src/fsd/shared/lib/seo.ts` | JSON-LD 생성 유틸리티 | 신규 |
| 9 | `public/og-image.png` | OG 공유용 대표 이미지 **(코드 변경 전 배치 필수)** | 신규 |
| 10 | `src/env.js` | `NEXT_PUBLIC_SITE_URL` 환경변수 등록 | 수정 |
| 11 | `.env` | `NEXT_PUBLIC_SITE_URL` 값 추가 | 수정 |

> **배포 순서**: 9번(`og-image.png`) → 11번(`.env`) → 나머지 코드 변경 순으로 적용한다. OG 이미지가 없는 상태에서 메타데이터 코드가 먼저 배포되면 SNS 공유 시 깨진 이미지(404)가 표시된다.

---

## 3. 코드 변경 상세

### 3.1 `src/app/layout.tsx` — 루트 메타데이터 강화

전체 사이트에 적용되는 기본 메타데이터를 설정한다. 개별 페이지에서 `metadata`를 export하면 해당 페이지에서 루트 값을 override한다.

**Before:**
```typescript
import "~/styles/globals.css";

import { type Metadata } from "next";
import { Geist } from "next/font/google";

export const metadata: Metadata = {
  title: "Podcast Clipper",
  description: "Podcast Clipper",
  icons: [{ rel: "icon", url: "/favicon.ico" }],
};

const geist = Geist({
  subsets: ["latin"],
  variable: "--font-geist-sans",
});

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className={`${geist.variable}`}>
      <body>{children}</body>
    </html>
  );
}
```

**After:**
```typescript
import "~/styles/globals.css";

import { type Metadata } from "next";
import { Geist } from "next/font/google";

// 빈 문자열("")도 무시하기 위해 || 연산자를 사용한다.
// ?? (nullish coalescing)는 null/undefined만 잡고 빈 문자열은 통과시키므로
// new URL("")이 실행되어 TypeError가 발생할 수 있다.
const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || "https://podcastclipper.com";
const SITE_NAME = "AI Podcast Clipper";
const SITE_DESCRIPTION =
  "Automatically turn your podcast into viral short-form clips with AI. Upload once — get highlight clips with captions in minutes.";

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: {
    default: SITE_NAME,
    template: `%s | ${SITE_NAME}`,
  },
  description: SITE_DESCRIPTION,
  keywords: [
    "podcast clipper",
    "AI podcast clips",
    "podcast to shorts",
    "podcast highlight generator",
    "short-form video from podcast",
    "podcast clip maker",
    "auto subtitles podcast",
    "AI video editor",
    "podcast shorts creator",
    "podcast highlights reel",
  ],
  authors: [{ name: "SangEok" }],
  creator: "SangEok",
  icons: [{ rel: "icon", url: "/favicon.ico" }],
  openGraph: {
    type: "website",
    locale: "en_US",
    alternateLocale: "ko_KR",
    url: SITE_URL,
    siteName: SITE_NAME,
    title: SITE_NAME,
    description: SITE_DESCRIPTION,
    images: [
      {
        url: "/og-image.png",
        width: 1200,
        height: 630,
        alt: SITE_NAME,
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: SITE_NAME,
    description: SITE_DESCRIPTION,
    images: ["/og-image.png"],
  },
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      "max-video-preview": -1,
      "max-image-preview": "large",
      "max-snippet": -1,
    },
  },
  alternates: {
    canonical: SITE_URL,
  },
};

const geist = Geist({
  subsets: ["latin"],
  variable: "--font-geist-sans",
});

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className={`${geist.variable}`}>
      <body>{children}</body>
    </html>
  );
}
```

**변경 요약:**

1. **`metadataBase`** — 모든 상대 경로(`/og-image.png` 등)를 절대 URL로 변환하는 기준. `NEXT_PUBLIC_SITE_URL` 환경변수로 관리
2. **`title.template`** — 하위 페이지에서 `metadata.title = "로그인"`만 설정하면 자동으로 `"로그인 | AI Podcast Clipper"` 생성
3. **`description`** — 서비스 핵심 가치를 담은 한국어 설명 (검색 결과에 직접 표시됨)
4. **`keywords`** — 영어 전용 검색어. 영어권 검색 노출이 목표이므로 한국어 키워드를 제거하고 영어 롱테일 키워드로 구성한다. Google은 keywords를 랭킹에 직접 사용하지 않지만 크롤러가 페이지 주제 파악에 참고한다
5. **`openGraph`** — Facebook, X(Twitter), LinkedIn 등 영어권 SNS 공유 시 표시되는 카드 정보
6. **`twitter`** — X(Twitter) 공유 시 큰 이미지 카드로 표시
7. **`robots`** — 기본적으로 색인 허용, `googleBot` 세부 설정으로 동영상/이미지 미리보기 최대화
8. **`alternates.canonical`** — 중복 URL(www, 트레일링 슬래시 등) 방지
9. **`lang="en"`** — 영어권 검색 노출이 목표이므로 `"en"` 유지. 검색엔진은 `lang` 속성을 노출 대상 언어 결정의 주요 신호로 사용한다
10. **`SITE_URL`에 `||` 연산자 사용** — `??`는 빈 문자열을 통과시켜 `new URL("")` → `TypeError` 크래시를 유발할 수 있으므로, falsy 값 전체를 잡는 `||`을 사용

> **한글 폰트 참고**: Geist 폰트는 `latin` 서브셋만 포함하여 한글 글리프가 없다. 서비스 UI에 한국어 텍스트가 포함된 경우 별도 한글 폰트(예: Pretendard, Noto Sans KR)를 추가하는 것이 권장된다. `lang="en"`이므로 SEO 영향은 없으며 이 작업은 UI/디자인 영역의 별도 태스크로 진행한다.

### 3.2 `src/app/page.tsx` — 홈페이지 메타데이터 + JSON-LD

홈페이지는 검색엔진 유입의 핵심 페이지다. 전용 메타데이터와 구조화 데이터를 추가한다.

**Before:**
```typescript
import HomePage from "~/fsd/pages/home/ui";
import { auth } from "~/server/auth";
import { db } from "~/server/db";

export default async function Home() {
  // ...
}
```

**After:**
```typescript
import { type Metadata } from "next";
import HomePage from "~/fsd/pages/home/ui";
import { auth } from "~/server/auth";
import { db } from "~/server/db";
import { generateWebApplicationJsonLd } from "~/fsd/shared/lib/seo";

export const metadata: Metadata = {
  title: "Turn Your Podcast into Short-Form Clips with AI",
  description:
    "Upload your podcast video and AI finds the best Q&A highlights, adds captions, and exports vertical short-form clips. Powered by Gemini 2.5 + WhisperX. English & Korean subtitles supported.",
  alternates: {
    canonical: "/",
  },
  openGraph: {
    title: "AI Podcast Clipper — Upload Once, Get Highlight Clips",
    description:
      "AI automatically detects podcast highlights and creates captioned vertical clips in minutes.",
    url: "/",
  },
};

export default async function Home() {
  const session = await auth();
  const userId = session?.user?.id;
  const isLoggedIn = !!userId;

  let email: string | null = null;

  if (userId) {
    const user = await db.user.findUniqueOrThrow({
      where: { id: userId },
      select: { email: true },
    });
    email = user.email;
  }

  const jsonLd = generateWebApplicationJsonLd();

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
      <HomePage isLoggedIn={isLoggedIn} email={email} />
    </>
  );
}
```

**변경 요약:**

1. **페이지 전용 `title`** — `title.template`에 의해 `"Turn Your Podcast into Short-Form Clips with AI | AI Podcast Clipper"` 생성. 영어 검색 쿼리("podcast to shorts", "AI podcast clip")와 매칭 가능한 키워드 포함
2. **페이지 전용 `description`** — 서비스의 구체적 기능을 설명하는 영어 문구 (150자 내외). 검색 결과 스니펫에 직접 표시됨
3. **`alternates.canonical`** — `"/"` → `metadataBase`와 결합하여 `https://podcastclipper.com/` 생성
4. **`openGraph`** — 홈페이지 전용 OG 제목/설명. 루트 레이아웃의 기본값을 override. 영어권 SNS 공유를 위한 영어 문구
5. **JSON-LD** — `WebApplication` 타입의 구조화 데이터. Google 리치 스니펫에 활용 가능

### 3.3 `src/app/login/page.tsx` — noindex 설정

로그인 페이지는 검색 결과에 노출될 필요가 없다.

**Before:**
```typescript
import { redirect } from "next/navigation";
import LoginForm from "~/fsd/widgets/loginForm/ui";
import { auth } from "~/server/auth";

export default async function Page() {
  // ...
}
```

**After:**
```typescript
import { type Metadata } from "next";
import { redirect } from "next/navigation";
import LoginForm from "~/fsd/widgets/loginForm/ui";
import { auth } from "~/server/auth";

export const metadata: Metadata = {
  title: "Log In",
  robots: {
    index: false,
    follow: false,
  },
};

export default async function Page() {
  const session = await auth();

  if (session) {
    redirect("/dashboard");
  }
  return (
    <div className="flex min-h-svh w-full items-center justify-center p-6 md:p-10">
      <div className="w-full max-w-sm">
        <LoginForm />
      </div>
    </div>
  );
}
```

**변경 요약:**
- `title: "Log In"` → template에 의해 `"Log In | AI Podcast Clipper"` 생성
- `robots: { index: false, follow: false }` → 검색엔진 색인 차단

### 3.4 `src/app/signup/page.tsx` — 회원가입 메타데이터

회원가입 페이지는 사용자 확보를 위해 검색 노출을 허용한다.

**Before:**
```typescript
import { redirect } from "next/navigation";
import SignupForm from "~/fsd/widgets/signupForm/ui";
import { auth } from "~/server/auth";

export default async function Page() {
  // ...
}
```

**After:**
```typescript
import { type Metadata } from "next";
import { redirect } from "next/navigation";
import SignupForm from "~/fsd/widgets/signupForm/ui";
import { auth } from "~/server/auth";

export const metadata: Metadata = {
  title: "Sign Up for Free",
  description:
    "Create a free AI Podcast Clipper account and start generating short-form clips from your podcasts automatically.",
  alternates: {
    canonical: "/signup",
  },
  openGraph: {
    title: "Sign Up for Free | AI Podcast Clipper",
    description:
      "Get 3 free credits and try AI-powered podcast clipping today.",
    url: "/signup",
  },
};

export default async function Page() {
  const session = await auth();

  if (session) {
    redirect("/dashboard");
  }
  return (
    <div className="flex min-h-svh w-full items-center justify-center p-6 md:p-10">
      <div className="w-full max-w-sm">
        <SignupForm />
      </div>
    </div>
  );
}
```

**변경 요약:**
- 영어권 사용자 대상 회원가입 전환 유도 메타데이터
- "free credits" 언급으로 영어 검색 결과 클릭률 향상
- canonical URL 설정

### 3.5 `src/app/dashboard/layout.tsx` — 대시보드 noindex 메타데이터

대시보드 레이아웃에 `noindex` 메타데이터를 추가하여, `/dashboard` 이하 모든 하위 라우트를 검색엔진 색인에서 제외한다. `robots.ts`의 Disallow와 이중으로 적용하여 방어 계층을 확보한다.

> **`robots.txt` vs `meta robots` 차이**: `robots.txt`는 크롤러에 대한 **권고 사항**이며 비표준 크롤러는 무시할 수 있다. 반면 `<meta name="robots" content="noindex">`는 색인 자체를 차단하는 **강제 지시**다. 인증 필요 페이지는 두 계층 모두 적용하는 것이 안전하다.

**Before:**
```typescript
"use server";

import { redirect } from "next/navigation";
import { Toaster } from "~/fsd/shared/ui/atoms/sonner";
import DashboardHeader from "~/fsd/widgets/dashboard-header/ui";
import { auth } from "~/server/auth";
import { db } from "~/server/db";

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await auth();

  if (!session?.user?.id) {
    redirect("/login");
  }

  const user = await db.user.findUniqueOrThrow({
    where: {
      id: session.user.id,
    },
    select: {
      email: true,
      credits: true,
    },
  });

  return (
    <div className="flex min-h-screen flex-col">
      <DashboardHeader email={user.email} credits={user.credits} />
      <main className="container mx-auto flex-1 py-6">{children}</main>
      <Toaster />
    </div>
  );
}
```

**After:**
```typescript
import { type Metadata } from "next";
import { redirect } from "next/navigation";
import { Toaster } from "~/fsd/shared/ui/atoms/sonner";
import DashboardHeader from "~/fsd/widgets/dashboard-header/ui";
import { auth } from "~/server/auth";
import { db } from "~/server/db";

export const metadata: Metadata = {
  robots: {
    index: false,
    follow: false,
  },
};

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await auth();

  if (!session?.user?.id) {
    redirect("/login");
  }

  const user = await db.user.findUniqueOrThrow({
    where: {
      id: session.user.id,
    },
    select: {
      email: true,
      credits: true,
    },
  });

  return (
    <div className="flex min-h-screen flex-col">
      <DashboardHeader email={user.email} credits={user.credits} />
      <main className="container mx-auto flex-1 py-6">{children}</main>
      <Toaster />
    </div>
  );
}
```

**변경 요약:**

1. **`"use server"` 제거** — `"use server"` 지시어는 Server Actions 전용이며, Layout 컴포넌트에는 부적절하다. Layout은 App Router에서 기본적으로 Server Component이므로 별도 지시어가 필요 없다. 또한 `"use server"`가 있으면 모든 export가 Server Action으로 취급되어 `metadata` 객체 export가 정상 동작하지 않을 수 있다
2. **`robots: { index: false, follow: false }`** — 레이아웃에 설정하면 `/dashboard`, `/dashboard/uploads/[id]` 등 모든 하위 라우트에 일괄 적용된다

> **참고**: `src/app/dashboard/page.tsx`에도 동일하게 `"use server"` 지시어가 있다. 이 역시 Page 컴포넌트에 부적절하므로 제거를 권장하나, SEO 동작에는 영향이 없으므로 별도 태스크로 처리한다.

### 3.6 `src/app/robots.ts` — 크롤링 규칙 (신규)

검색엔진 크롤러에게 크롤링 허용/차단 경로를 알려준다.

```typescript
import { type MetadataRoute } from "next";

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || "https://podcastclipper.com";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: "*",
        allow: ["/", "/signup"],
        disallow: ["/dashboard", "/api/", "/login"],
      },
    ],
    sitemap: `${SITE_URL}/sitemap.xml`,
  };
}
```

**생성되는 `robots.txt`:**
```
User-agent: *
Allow: /
Allow: /signup
Disallow: /dashboard
Disallow: /api/
Disallow: /login

Sitemap: https://podcastclipper.com/sitemap.xml
```

**설계 근거:**
- `/` — 랜딩 페이지, 핵심 SEO 대상
- `/signup` — 사용자 확보를 위해 허용
- `/login` — SEO 가치 없음, 차단
- `/dashboard` — 인증 필요 페이지, 차단 (크롤러가 접근해도 로그인 리다이렉트됨). 3.5절의 `meta robots` noindex와 이중 방어
- `/api/` — API 엔드포인트, 차단

### 3.7 `src/app/sitemap.ts` — 정적 사이트맵 (신규)

검색엔진에게 사이트의 페이지 구조를 알려준다.

```typescript
import { type MetadataRoute } from "next";

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || "https://podcastclipper.com";

export default function sitemap(): MetadataRoute.Sitemap {
  // 페이지 내용이 실제로 변경될 때 이 날짜를 갱신한다.
  // new Date()를 사용하면 빌드/요청마다 날짜가 바뀌어
  // 검색엔진이 정적 페이지를 불필요하게 재크롤링한다.
  const LAST_UPDATED = new Date("2026-03-22");

  return [
    {
      url: SITE_URL,
      lastModified: LAST_UPDATED,
      changeFrequency: "weekly",
      priority: 1.0,
    },
    {
      url: `${SITE_URL}/signup`,
      lastModified: LAST_UPDATED,
      changeFrequency: "monthly",
      priority: 0.8,
    },
  ];
}
```

**설계 근거:**
- 현재 공개 페이지가 2개(`/`, `/signup`)이므로 정적 목록으로 충분
- `lastModified`에 고정 날짜를 사용하여 불필요한 재크롤링을 방지한다. 페이지 내용을 실제로 변경할 때 이 날짜도 함께 갱신해야 한다
- `/login`은 `robots.ts`에서 차단했으므로 사이트맵에서도 제외
- `/dashboard` 이하는 인증 필요 페이지이므로 제외
- 향후 블로그, 가격 페이지 등이 추가되면 이 파일에 항목을 추가하면 됨

### 3.8 `src/fsd/shared/lib/seo.ts` — JSON-LD 유틸리티 (신규)

구조화 데이터(Schema.org)를 생성하는 헬퍼 함수. Google 검색 결과에서 리치 스니펫(앱 정보, FAQ 등)으로 표시될 수 있다.

```typescript
const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || "https://podcastclipper.com";
const SITE_NAME = "AI Podcast Clipper";

/**
 * WebApplication JSON-LD — 홈페이지용
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
      "English & Korean Dual Subtitles",
      "AWS S3 Secure Storage",
      "Dashboard Review Loop",
    ],
    screenshot: `${SITE_URL}/og-image.png`,
  };
}
```

**사용 방식:** `src/app/page.tsx`에서 import하여 `<script type="application/ld+json">`으로 삽입 (3.2절 참조)

### 3.9 `public/og-image.png` — OG 공유 이미지 (신규)

SNS 공유 시 표시되는 대표 이미지.

**스펙:**
- 크기: 1200 x 630px (Open Graph 권장)
- 포맷: PNG
- 내용: 서비스 로고 + 태그라인 + 스크린샷(선택)

> **배포 전 필수 확인**: 이 이미지 파일은 3.1절(`layout.tsx`), 3.2절(`page.tsx`), 3.8절(`seo.ts`)의 코드에서 참조된다. **코드 변경을 배포하기 전에 반드시 이 파일이 `public/` 디렉토리에 존재해야 한다.** 이미지가 없으면 Open Graph, Twitter Card, JSON-LD `screenshot` 필드가 모두 404를 반환하여 SNS 공유 시 깨진 이미지가 표시된다.
>
> 전문 디자인이 준비되지 않았더라도, 서비스명과 설명을 포함한 **최소한의 플레이스홀더 이미지를 먼저 배치**한 후 코드를 배포하고, 이후 교체한다.

### 3.10 `src/env.js` — 환경변수 추가

`NEXT_PUBLIC_SITE_URL`을 `src/env.js`에 등록한다.

**Before** (`src/env.js:31-33`):
```javascript
client: {
    // NEXT_PUBLIC_CLIENTVAR: z.string(),
},
```

**After:**
```javascript
client: {
    NEXT_PUBLIC_SITE_URL: z.string().url().optional(),
},
```

**`runtimeEnv`에도 추가** (`src/env.js:39` 부근):
```javascript
runtimeEnv: {
    // ... 기존 항목
    NEXT_PUBLIC_SITE_URL: process.env.NEXT_PUBLIC_SITE_URL,
},
```

**`.env`에 추가:**
```env
NEXT_PUBLIC_SITE_URL="https://podcastclipper.com"
```

> `optional()`로 설정하여 로컬 개발 시 미지정이면 코드 내 fallback 값(`https://podcastclipper.com`)을 사용한다.
>
> **`env` 객체 vs `process.env` 직접 접근에 대한 참고:**
>
> `layout.tsx`, `robots.ts`, `sitemap.ts`, `seo.ts`에서는 `env` 객체 대신 `process.env.NEXT_PUBLIC_SITE_URL`을 직접 사용한다. 이유:
> 1. `metadata` export는 모듈 최상위에서 평가되어 `env` import 타이밍이 보장되지 않음
> 2. `NEXT_PUBLIC_` 접두사 변수는 Next.js가 빌드 시 인라인하므로 `process.env` 직접 접근이 안전
>
> **이로 인해 `env.js`의 Zod `.url()` 검증이 실제 사용처에 적용되지 않는 한계가 있다.** 잘못된 URL이 `process.env`에 설정되면 Zod 검증을 우회하고 `new URL()` 호출에서 런타임 에러가 발생할 수 있다. 이를 보완하기 위해:
> - 모든 사용처에서 `||` 연산자로 fallback을 적용하여 빈 문자열을 방어한다 (3.1, 3.6, 3.7, 3.8절 참조)
> - CI/CD 파이프라인에서 `NEXT_PUBLIC_SITE_URL` 값의 URL 형식을 별도로 검증하는 것을 권장한다

---

## 4. 검증 체크리스트

### 4.1 로컬 검증

```bash
npm run dev
```

1. **메타데이터 확인** — 브라우저 개발자 도구 → Elements → `<head>` 태그 확인:
   - [ ] `<title>` 태그가 페이지별로 다른 값인지 확인
   - [ ] `<meta name="description">` 존재 여부
   - [ ] `<meta property="og:title">`, `<meta property="og:description">`, `<meta property="og:image">` 존재 여부
   - [ ] `<meta name="twitter:card">` 값이 `summary_large_image`인지 확인
   - [ ] `<link rel="canonical">` 존재 여부

2. **robots.txt 확인:**
   - [ ] `http://localhost:3000/robots.txt` 접근 시 올바른 내용 표시
   - [ ] `/dashboard`가 Disallow에 포함
   - [ ] Sitemap URL이 정확한지 확인

3. **sitemap.xml 확인:**
   - [ ] `http://localhost:3000/sitemap.xml` 접근 시 XML 표시
   - [ ] `/`과 `/signup` 항목만 포함
   - [ ] `/login`, `/dashboard` 미포함

4. **JSON-LD 확인:**
   - [ ] 홈페이지 소스코드에서 `<script type="application/ld+json">` 검색
   - [ ] JSON 내용이 유효한 Schema.org 구조인지 확인

5. **OG 이미지 확인:**
   - [ ] `http://localhost:3000/og-image.png` 접근 시 이미지 정상 표시 (404 아닌지 확인)

6. **Dashboard noindex 확인:**
   - [ ] `/dashboard` 페이지 소스코드에서 `<meta name="robots" content="noindex">` 존재 확인
   - [ ] `/dashboard/uploads/[id]` 페이지에서도 동일하게 noindex 적용 확인

### 4.2 빌드 검증

```bash
npm run build
```

- [ ] 빌드 성공 (메타데이터 관련 타입 에러 없음)
- [ ] `npm run check` (lint + typecheck) 통과

### 4.3 외부 도구 검증 (배포 후)

배포 완료 후 아래 도구로 최종 검증한다:

| 도구 | URL | 확인 항목 |
|------|-----|-----------|
| Google Rich Results Test | search.google.com/test/rich-results | JSON-LD 유효성 |
| Facebook Sharing Debugger | developers.facebook.com/tools/debug | OG 태그 미리보기 |
| Twitter Card Validator | cards-dev.twitter.com/validator | Twitter 카드 미리보기 |
| Google Search Console | search.google.com/search-console | 사이트맵 제출, 색인 상태 |
| Schema.org Validator | validator.schema.org | JSON-LD 상세 검증 |

---

## 5. Google Search Console 연동 (배포 후)

사이트맵을 Google에 제출하고 검색 성능을 모니터링한다.

### 5.1 사이트 소유권 인증

1. [Google Search Console](https://search.google.com/search-console) 접속
2. `https://podcastclipper.com` 도메인으로 속성 추가
3. DNS TXT 레코드 또는 HTML 파일 방식으로 소유권 인증

### 5.2 사이트맵 제출

1. Search Console → Sitemaps 메뉴
2. `https://podcastclipper.com/sitemap.xml` 제출
3. 제출 상태가 "성공"인지 확인

### 5.3 모니터링 항목

- **검색 실적**: 노출수, 클릭수, CTR, 평균 게재순위
- **색인 생성**: 색인된 페이지 수, 색인 오류
- **Core Web Vitals**: LCP, FID, CLS 지표

---

## 6. 향후 확장 가이드

현재 공개 페이지가 2개(`/`, `/signup`)로 한정적이므로 구현이 단순하지만, 향후 아래 페이지가 추가되면 SEO 작업도 확장해야 한다.

### 6.1 블로그/콘텐츠 마케팅 추가 시

```
src/app/blog/
├── page.tsx              ← 블로그 목록 (generateMetadata 불필요, 정적 metadata)
└── [slug]/
    └── page.tsx          ← 개별 포스트 (generateMetadata로 동적 메타데이터)
```

- `sitemap.ts`에서 DB 또는 CMS에서 블로그 글 목록을 가져와 동적 사이트맵 생성
- 각 포스트에 `Article` 타입의 JSON-LD 추가
- 포스트별 OG 이미지 동적 생성 (`next/og` ImageResponse 활용)

### 6.2 가격 페이지 추가 시

```typescript
// src/app/pricing/page.tsx
export const metadata: Metadata = {
  title: "요금제",
  description: "AI Podcast Clipper 요금제 비교. 무료 체험부터 프로 플랜까지.",
  alternates: { canonical: "/pricing" },
};
```

- `sitemap.ts`에 `/pricing` 추가 (priority: 0.9)
- `Product` 타입의 JSON-LD로 요금 정보 구조화

### 6.3 FAQ 페이지 추가 시

- `FAQPage` 타입의 JSON-LD 추가 → Google 검색 결과에 FAQ 리치 스니펫 표시
- 검색 결과 CTR 향상 효과가 큼

### 6.4 다국어 지원 시

```typescript
// layout.tsx metadata에 추가
alternates: {
  canonical: SITE_URL,
  languages: {
    "ko": `${SITE_URL}/ko`,
    "en": `${SITE_URL}/en`,
  },
},
```

- `next-intl` 또는 `next-i18next` 도입 후 `hreflang` 태그 자동 생성
- 각 언어별 sitemap 분리 (`sitemap-ko.xml`, `sitemap-en.xml`)

---

## 7. Before/After 요약

| 지표 | Before | After |
|------|--------|-------|
| `<title>` 내용 | `"Podcast Clipper"` (전 페이지 동일) | 페이지별 고유 영어 제목 + 사이트명 |
| `<meta description>` | `"Podcast Clipper"` | 페이지별 150자 내외 영어 서비스 설명 |
| Open Graph | 없음 | 전체 사이트 + 홈/회원가입 전용 OG (영어) |
| Twitter Card | 없음 | `summary_large_image` |
| robots.txt | 없음 | 공개/비공개 경로 분리 |
| sitemap.xml | 없음 | 공개 페이지 정적 사이트맵 (고정 날짜) |
| JSON-LD | 없음 | `WebApplication` 구조화 데이터 (영어 featureList) |
| Canonical URL | 없음 | 전체 사이트 + 페이지별 설정 |
| OG 이미지 | 없음 | 1200x630 대표 이미지 (미완료) |
| `<html lang>` | `"en"` | `"en"` (영어권 SEO 타겟 — 유지) |
| OG locale | 해당 없음 | `"en_US"` primary, `"ko_KR"` alternate |
| keywords | 없음 | 영어 전용 롱테일 키워드 10개 |
| Dashboard noindex | 없음 (크롤러 색인 가능) | `robots.txt` Disallow + `meta robots` noindex 이중 방어 |
| Dashboard `"use server"` | 레이아웃에 부적절한 지시어 | 제거 (Server Component 기본 동작으로 충분) |
| SITE_URL fallback | 해당 없음 | `\|\|` 연산자로 빈 문자열 방어 |
