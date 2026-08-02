# Open Graph Image Implementation Proposal

> 작성일: 2026-04-28
> 프로젝트: AI Podcast Clipper Frontend
> 결정: 고정 PNG 기반 Next.js file-based metadata 구현
> 관련 파일: `src/app/opengraph-image.png`, `src/app/twitter-image.png`, `src/app/layout.tsx`, `src/app/page.tsx`, `src/app/sitemap.ts`, `src/app/robots.ts`, `src/fsd/shared/lib/site.ts`, `src/fsd/shared/lib/seo.ts`

---

## 1. 결정 사항

AI Podcast Clipper의 현재 공유 이미지는 사용자별 데이터나 라우트별 동적 정보가 필요하지 않은 고정 랜딩 페이지용 브랜드 이미지다.

따라서 `ImageResponse`로 매번 JSX 기반 이미지를 생성하는 방식보다, 완성된 1200x630 PNG를 Next.js metadata file convention으로 배치하는 방식을 채택한다.

구현 방향은 다음과 같다.

1. `src/app/opengraph-image.png`를 추가한다.
2. `src/app/twitter-image.png`를 추가한다.
3. `src/app/opengraph-image.tsx`, `src/app/twitter-image.tsx`, `src/app/_metadata/og-card.tsx`는 사용하지 않는다.
4. `src/app/layout.tsx`의 기존 `/og-image.png` 이미지 참조는 제거한다.
5. `src/app/page.tsx`의 `openGraph`가 루트 `openGraph` 필드를 덮어쓰는 문제를 같이 정리한다.
6. `src/fsd/shared/lib/seo.ts`의 JSON-LD `screenshot`은 `/opengraph-image.png` route를 사용한다.
7. `src/app/sitemap.ts`와 `src/app/robots.ts`도 같은 URL 헬퍼를 사용해 trailing slash 문제를 같이 정리한다.
8. 대시보드와 업로드 상세처럼 인증이 필요한 비공개 라우트에는 별도 동적 OG 이미지를 만들지 않는다.

---

## 2. 현재 문제

### 2.1 `/og-image.png` 크기 불일치

기존 `src/app/layout.tsx`는 Open Graph와 Twitter 이미지로 `/og-image.png`를 참조했다.

```ts
openGraph: {
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
  images: ["/og-image.png"],
},
```

하지만 실제 `public/og-image.png`는 640x640 정사각형 이미지였다. 메타데이터는 1200x630이라고 선언하지만 실제 리소스는 1:1 비율이므로, 공유 플랫폼에서 crop이나 여백이 예측하기 어렵다.

### 2.2 `page.tsx`의 `openGraph` 얕은 병합 문제

`src/app/page.tsx`도 별도 `openGraph` 객체를 export한다.

```ts
openGraph: {
  title: "AI Podcast Clipper - Upload Once, Get Highlight Clips",
  description:
    "AI automatically detects podcast highlights and creates captioned vertical clips in minutes.",
  url: "/",
},
```

Next.js metadata는 중첩 객체를 deep merge하지 않고 shallow merge한다. 따라서 페이지 레벨에서 `openGraph`를 다시 정의하면 루트 `layout.tsx`의 `type`, `locale`, `alternateLocale`, `siteName` 같은 필드가 최종 홈 메타데이터에서 빠질 수 있다.

### 2.3 JSON-LD `screenshot`의 기존 이미지 참조

`src/fsd/shared/lib/seo.ts`의 `generateWebApplicationJsonLd()`는 기존에 다음 값을 반환했다.

```ts
screenshot: `${SITE_URL}/og-image.png`,
```

`layout.tsx`에서 `/og-image.png`를 제거해도 JSON-LD가 기존 정사각형 이미지를 계속 가리키면 구조화 데이터가 불일치한다. `screenshot`도 새 `/opengraph-image.png` route를 사용해야 한다.

### 2.4 `sitemap.ts`, `robots.ts`의 URL 조합 취약성

기존 `src/app/sitemap.ts`와 `src/app/robots.ts`는 각각 자체 `SITE_URL` 상수를 가졌다.

```ts
const SITE_URL =
  process.env.NEXT_PUBLIC_SITE_URL?.trim() ?? "https://apc-h.vercel.app/";
```

이 값은 환경 변수의 trailing slash 여부에 따라 URL 조합 결과가 달라진다.

```ts
// sitemap.ts
url: `${SITE_URL}terms`,

// robots.ts
sitemap: `${SITE_URL}/sitemap.xml`,
```

`NEXT_PUBLIC_SITE_URL=https://apc-h.vercel.app`이면 sitemap의 `/terms`, `/privacy` URL이 `https://apc-h.vercel.appterms`처럼 깨질 수 있다. 반대로 trailing slash가 있는 값이면 robots의 sitemap URL이 `https://apc-h.vercel.app//sitemap.xml`처럼 이중 slash가 될 수 있다.

---

## 3. 구현 범위

### 포함

- 루트 랜딩 페이지용 고정 Open Graph PNG
- Twitter/X large summary card용 고정 PNG
- `layout.tsx`의 `/og-image.png` 기반 이미지 메타데이터 제거
- `page.tsx`의 `openGraph` 필드 보존 문제 해결
- JSON-LD `screenshot`의 새 OG 이미지 URL 반영
- `sitemap.ts`, `robots.ts`의 URL 조합 방식 통일
- 로컬/빌드/배포 후 검증 절차

### 제외

- 사용자별 동적 이미지
- 대시보드/업로드 상세/클립 상세의 별도 동적 OG 이미지
- 외부 이미지 생성 서비스 의존
- `ImageResponse` 기반 JSX 이미지 생성

인증 영역은 `src/app/dashboard/layout.tsx`에서 `robots.index = false`를 유지한다. 루트의 공통 file-based OG 이미지가 head에 남는 것은 허용하되, 사용자 업로드나 클립 데이터를 반영하는 공개 미리보기 이미지는 만들지 않는다.

---

## 4. 목표 이미지

### 크기

```txt
1200x630
```

### 핵심 메시지

```txt
AI Podcast Clipper
Turn podcasts into short-form clips
AI highlights, captions, and English/Korean subtitles.
```

### 시각 방향

- 어두운 배경
- cyan/magenta 계열 accent
- 세로 쇼츠 프레임 또는 caption block
- 제품명과 메인 카피를 왼쪽에 크게 배치
- 오른쪽에는 결과물인 vertical clip을 상징하는 UI 모티프 배치

---

## 5. 파일 구조

```txt
src/app/opengraph-image.png
src/app/twitter-image.png
src/fsd/shared/lib/site.ts
```

`src/app/opengraph-image.png`와 `src/app/twitter-image.png`는 Next.js App Router의 metadata file convention이다. Next가 자동으로 이미지 route를 만들고 `<head>`의 `og:image`, `twitter:image`, width, height, type 메타데이터를 생성한다.

---

## 6. `site.ts`

사이트 URL은 trailing slash 여부와 빈 문자열 환경 변수에 흔들리지 않도록 정규화한다.

```ts
const configuredSiteUrl = process.env.NEXT_PUBLIC_SITE_URL?.trim();
const baseSiteUrl =
  configuredSiteUrl === undefined || configuredSiteUrl === ""
    ? "https://apc-h.vercel.app"
    : configuredSiteUrl;

export const SITE_URL = baseSiteUrl.replace(/\/+$/, "");
export const SITE_NAME = "AI Podcast Clipper";
export const SITE_DESCRIPTION =
  "Automatically turn your podcast into viral short-form clips with AI. Upload once - get highlight clips with captions in minutes.";

export const OG_IMAGE_PATH = "/opengraph-image.png";

export function absoluteSiteUrl(path = "/") {
  return new URL(path, `${SITE_URL}/`).toString();
}
```

---

## 7. `layout.tsx` 정리

이미지 메타데이터는 `opengraph-image.png`와 `twitter-image.png`가 소유하도록 한다. 따라서 `src/app/layout.tsx`에서는 `/og-image.png` 참조를 제거한다.

중요한 점은 metadata 객체 전체를 예시로 통째로 교체하지 않는 것이다. 현재 `layout.tsx`에 있는 `keywords`, `authors`, `creator`, `icons`, `robots`, `alternates`는 유지한다. 이 작업은 `openGraph.images`와 `twitter.images`만 제거하고 URL/사이트 상수 import를 정리하는 변경이다.

---

## 8. `page.tsx` 정리

홈 페이지는 루트보다 구체적인 제목과 설명을 유지하되, `openGraph` 객체를 다시 정의할 때 루트 필드가 빠지지 않게 한다.

```ts
openGraph: {
  type: "website",
  locale: "en_US",
  alternateLocale: "ko_KR",
  siteName: SITE_NAME,
  title: "AI Podcast Clipper - Upload Once, Get Highlight Clips",
  description:
    "AI automatically detects podcast highlights and creates captioned vertical clips in minutes.",
  url: absoluteSiteUrl("/"),
},
```

중요한 점은 `images`를 여기에 넣지 않는 것이다. 이미지 소유권은 `opengraph-image.png`와 `twitter-image.png`에만 둔다.

---

## 9. JSON-LD 정리

`src/fsd/shared/lib/seo.ts`의 `screenshot`은 `/og-image.png`가 아니라 새 OG 이미지 route를 사용해야 한다.

```ts
screenshot: absoluteSiteUrl(OG_IMAGE_PATH),
```

---

## 10. `sitemap.ts`, `robots.ts` 정리

`site.ts`를 도입하면 `sitemap.ts`와 `robots.ts`도 같은 URL 헬퍼를 사용한다.

```ts
url: absoluteSiteUrl("/terms")
sitemap: absoluteSiteUrl("/sitemap.xml")
```

이렇게 하면 `NEXT_PUBLIC_SITE_URL`에 trailing slash가 있든 없든 sitemap과 robots URL이 같은 방식으로 생성된다.

---

## 11. 검증 절차

### 11.1 이미지 확인

```txt
http://localhost:3000/opengraph-image.png
http://localhost:3000/twitter-image.png
```

확인 항목:

- 이미지가 1200x630 비율로 보이는가
- 제품명과 메인 카피가 잘리지 않는가
- 작은 미리보기에서도 핵심 문구가 읽히는가

### 11.2 메타데이터 확인

홈 페이지 HTML head에서 다음을 확인한다.

- `og:image`가 file-based metadata route를 가리키는가
- `og:image:width`가 `1200`인가
- `og:image:height`가 `630`인가
- `og:site_name`, `og:type`, `og:locale`이 홈 페이지에서도 유지되는가
- `twitter:image`가 file-based metadata route를 가리키는가
- JSON-LD `screenshot`이 `/opengraph-image.png` 기반 URL을 가리키는가
- `/sitemap.xml`의 `/terms`, `/privacy` URL이 정상 absolute URL인가
- `/robots.txt`의 sitemap URL에 이중 slash가 없는가

### 11.3 빌드 확인

```bash
npm run build
```

확인 항목:

- `opengraph-image`와 `twitter-image` route 생성이 성공하는가
- 정적 PNG가 각각 5MB 이하인가
- build/lint/typecheck가 성공하는가

---

## 12. 수용 기준

- `src/app/opengraph-image.png`가 1200x630 PNG다.
- `src/app/twitter-image.png`가 1200x630 PNG다.
- `layout.tsx`에서 `/og-image.png` 기반 이미지 메타데이터가 제거된다.
- `layout.tsx`의 기존 `keywords`, `authors`, `creator`, `icons`, `robots`, `alternates` 설정이 유지된다.
- `page.tsx`의 `openGraph`가 `type`, `locale`, `alternateLocale`, `siteName`을 유지한다.
- `src/fsd/shared/lib/seo.ts`의 JSON-LD `screenshot`이 새 OG 이미지 URL을 사용한다.
- `sitemap.ts`와 `robots.ts`가 `absoluteSiteUrl()`로 URL을 생성한다.
- `twitter.card`는 `summary_large_image`를 유지한다.
- 랜딩 페이지 공유 카드에서 제품명과 핵심 가치가 읽힌다.
- `npm run build`가 성공한다.
- 인증 영역에는 별도 동적 OG 이미지 구현이 추가되지 않는다.

---

## 13. 참고 자료

- Next.js 공식 문서: `opengraph-image` and `twitter-image` file conventions  
  https://nextjs.org/docs/app/api-reference/file-conventions/metadata/opengraph-image
- Next.js 공식 문서: Metadata Files  
  https://nextjs.org/docs/15/app/api-reference/file-conventions/metadata
