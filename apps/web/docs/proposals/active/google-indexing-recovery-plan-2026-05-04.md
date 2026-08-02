---
status: "pending"
stage: "draft"
proposal-size: "standard"
created-at: "2026-05-04"
approved-by: null
approved-at: null
approval-scope: null
completed-at: null
verification-summary: null
closed-at: null
closed-by: null
closed-reason: null
owners: []
related: []
---

# a-pch.com Google 검색 미노출 해결 제안서

기준일: 2026-05-04 KST  
대상 도메인: `https://a-pch.com/`  
대상 프로젝트: `ai-podcast-clipper-frontend`

## 1. 결론

`https://a-pch.com/`이 Google 검색에 보이지 않는 문제는, 2026-05-04 현재 확인 가능한 운영 응답만 보면 `robots.txt`, `noindex`, HTTP 오류 같은 명백한 기술 차단 때문이라고 보기 어렵다.

운영 도메인은 HTTPS에서 `200 OK`를 반환하고, `http://a-pch.com/` 및 `https://www.a-pch.com/`는 `https://a-pch.com/`로 리다이렉트된다. `robots.txt`는 홈을 허용하고, `sitemap.xml`은 정상 XML로 응답하며, 홈 HTML에는 `robots: index, follow`, `googlebot: index, follow`, canonical URL, Open Graph, JSON-LD가 출력되고 있다.

따라서 우선순위는 다음과 같다.

1. Google Search Console에 `a-pch.com` Domain property를 등록하고 DNS로 소유권을 검증한다.
2. `https://a-pch.com/sitemap.xml`을 제출한다.
3. URL Inspection에서 `https://a-pch.com/` 라이브 테스트를 실행하고, 색인 가능 상태를 확인한 뒤 색인 생성을 요청한다.
4. Search Console의 Page indexing, Crawl stats, Manual actions, Security issues를 확인해 Google이 실제로 어떤 이유로 색인을 보류하는지 판정한다.
5. 공개 색인 대상 페이지가 현재 3개뿐인 문제를 해결한다. 홈, 약관, 개인정보처리방침만으로는 신규 SaaS 도메인이 Google에 발견되고 평가되기 어렵다.
6. 랜딩 페이지의 손상된 문구와 불명확한 H1/CTA를 수정하고, 제품을 설명하는 공개 페이지와 데모/예시 콘텐츠를 추가한다.
7. 외부에서 자연스럽게 발견될 수 있도록 신뢰 가능한 공개 프로필, 데모 영상, 제품 소개 글, 관련 커뮤니티/디렉터리 링크를 확보한다.

중요한 전제: sitemap 제출과 URL Inspection의 색인 요청은 Google에 발견과 재크롤을 요청하는 방법이지, 색인과 노출을 보장하지 않는다. Google 공식 문서도 색인에는 며칠에서 몇 주가 걸릴 수 있고, 요청해도 반드시 색인되는 것은 아니라고 설명한다.

## 2. 현재 운영 도메인 확인 결과

확인 시각: 2026-05-04 KST, 운영 서버 HTTP Date 기준 2026-05-03 UTC

실행한 확인:

```powershell
curl.exe -I -L https://a-pch.com/
curl.exe -I -L http://a-pch.com/
curl.exe -I -L https://www.a-pch.com/
curl.exe -L https://a-pch.com/robots.txt
curl.exe -L https://a-pch.com/sitemap.xml
curl.exe -L https://a-pch.com/
```

### 2.1 정상으로 확인된 항목

| 항목 | 확인 결과 | 판단 |
| --- | --- | --- |
| HTTPS 홈 | `https://a-pch.com/`가 `200 OK` | Google Search 기술 요구사항의 "작동하는 페이지" 조건 충족 |
| HTTP 정규화 | `http://a-pch.com/` -> `https://a-pch.com/` `308 Permanent Redirect` | HTTPS canonical 신호와 일치 |
| www 정규화 | `https://www.a-pch.com/` -> `https://a-pch.com/` `308 Permanent Redirect` | 중복 호스트 정리 양호 |
| robots.txt | `Allow: /`, `Disallow: /dashboard`, `/api/`, `/login` | 공개 홈 크롤링을 막지 않음 |
| sitemap.xml | `/`, `/terms`, `/privacy` 포함 | sitemap 자체는 정상 접근 가능 |
| 홈 robots meta | `<meta name="robots" content="index, follow"/>` | noindex 아님 |
| 홈 googlebot meta | `<meta name="googlebot" content="index, follow, ..."/>` | Googlebot noindex 아님 |
| canonical | `<link rel="canonical" href="https://a-pch.com"/>` | canonical 도메인은 맞음 |
| 구조화 데이터 | `WebApplication` JSON-LD 출력 | 기본 제품 정보 제공 |
| `_next` 정적 리소스 | robots.txt에서 차단하지 않음 | Googlebot 렌더링 차단 가능성 낮음 |

### 2.2 즉시 개선해야 할 항목

| 항목 | 현재 상태 | 왜 문제인가 | 조치 |
| --- | --- | --- | --- |
| Search Console 검증 | 코드상 `google-site-verification` 메타 없음. DNS 검증 여부는 로컬에서 확인 불가 | Google이 왜 색인하지 않는지 확인하려면 Search Console 데이터가 필요 | Domain property를 DNS TXT로 검증 |
| sitemap 제출 | 실제 Search Console 제출 여부 확인 불가 | sitemap은 운영 중이나 Google이 알지 못할 수 있음 | Search Console > Sitemaps에 제출 |
| 공개 페이지 수 | sitemap 기준 공개 색인 후보가 `/`, `/terms`, `/privacy` 3개 | 신규/소규모 사이트는 외부 링크와 유용한 공개 콘텐츠가 부족하면 발견/색인이 지연될 수 있음 | 제품/기능/유스케이스/데모/가격/소개 페이지 추가 |
| 홈 카피 손상 | 코드에 `40??0s`, `1080??920`, `delete?遊엓l`, `쨌` 같은 깨진 문구 존재 | 사용자와 검색엔진 모두에게 낮은 품질 신호. Google 문서의 helpful/reliable content 기준에도 불리 | UTF-8 손상 문구를 정상 ASCII/UTF-8 문구로 교정 |
| H1 명확성 | H1: `Clip the signal, skip the grind.` | 브랜드 메시지는 좋지만 "AI podcast clipper"를 찾는 사용자의 검색 의도와 직접 연결이 약함 | H1에 제품 범주 포함: 예 `AI Podcast Clipper for YouTube Shorts` |
| CTA 링크 | `See product tour`가 `/dashboard`로 연결됨. `/dashboard`는 robots.txt에서 disallow | 공개 제품 투어가 없고 Googlebot은 해당 경로를 크롤링하지 않음 | `/demo` 또는 `/product-tour` 공개 페이지 생성 후 링크 |
| sitemap lastmod | 모든 URL이 `2026-03-22` 고정 | 실제 콘텐츠 변경과 불일치하면 재크롤 힌트 품질이 떨어짐 | 페이지 변경 시 `lastModified` 갱신 또는 소스 기반 관리 |
| 루트 canonical 표기 | HTML canonical은 `https://a-pch.com`, sitemap은 `https://a-pch.com/` | 보통 동등하게 처리되지만 신호를 완전히 통일하는 편이 좋음 | canonical, sitemap, 리다이렉트 기준을 trailing slash 포함/제외 중 하나로 통일 |

## 3. Search Console에서 먼저 해야 할 일

### 3.1 소유권 검증 - 완료

상태: 완료. `a-pch.com` Domain property는 DNS TXT 레코드 방식으로 검증 완료했으며, 별도의 HTML 메타 태그 검증은 수행하지 않는다.

1. Google Search Console에 접속한다.
2. `Domain` property로 `a-pch.com`을 추가한다.
3. Google이 제시하는 DNS TXT 레코드를 도메인 DNS에 추가한다.
4. 검증 완료 후 `https://a-pch.com/`, `https://www.a-pch.com/`, `http://a-pch.com/`가 모두 같은 Domain property 데이터에 포함되는지 확인한다.

Domain property를 추천하는 이유:

- `http`, `https`, `www`, non-www 전체를 하나의 속성으로 볼 수 있다.
- Google 공식 FAQ는 Search Console에서 `www`와 non-`www` 버전을 모두 확인하라고 안내한다. Domain property가 이 문제를 가장 깔끔하게 해결한다.

보조 조치:

- 즉시 URL Inspection을 쓰기 위해 URL-prefix property `https://a-pch.com/`도 추가해도 된다.
- HTML 메타 태그 검증을 사용할 경우 `src/app/layout.tsx`의 `metadata.verification.google` 또는 직접 `<meta name="google-site-verification" ...>` 방식으로 추가할 수 있다. 단, 장기적으로는 DNS 검증이 더 안정적이다.

### 3.2 sitemap 제출 - 완료

Search Console > Sitemaps에 다음 URL을 제출한다.

```text
https://a-pch.com/sitemap.xml
```

상태: 제출 완료. 2026-05-04 현재 Search Console 화면에서는 상태가 `가져올 수 없음`, 발견된 페이지 `0`으로 표시되지만, 운영 `https://a-pch.com/sitemap.xml`은 `200 OK`와 `Content-Type: application/xml`로 정상 응답한다. 따라서 현재는 제출 자체는 완료로 보고, Search Console 처리 지연 여부를 24시간 안에 재확인한다.

제출 후 확인할 것:

- Status가 `Success`인지
- Discovered URLs가 최소 3개로 잡히는지
- `/`, `/terms`, `/privacy`가 Page indexing 리포트에 나타나는지
- sitemap fetch 오류, XML 파싱 오류, 잘못된 URL 오류가 없는지

현재 sitemap은 운영에서 다음 URL을 반환한다.

```xml
<loc>https://a-pch.com/</loc>
<loc>https://a-pch.com/terms</loc>
<loc>https://a-pch.com/privacy</loc>
```

### 3.3 URL Inspection으로 홈 색인 요청 - 완료

상태: 완료. 2026-05-04 현재 Search Console URL Inspection에서 `https://a-pch.com/`가 Google에 등록된 상태로 확인되었다. `https://www.a-pch.com/`와 `http://a-pch.com/`는 최종 canonical인 `https://a-pch.com/`로 리다이렉트되는 URL이므로 별도 색인되지 않는 것이 정상이다.

대상:

```text
https://a-pch.com/
```

절차:

1. URL Inspection에 완전한 URL을 입력한다.
2. `Test live URL`을 실행한다.
3. 다음이 모두 만족되는지 확인한다.
   - Page fetch: Successful
   - Indexing allowed: Yes
   - User-declared canonical: `https://a-pch.com/` 또는 `https://a-pch.com`
   - Google-selected canonical: user-declared canonical과 동일하거나 같은 루트 URL
   - Page resources: 핵심 CSS/JS가 robots.txt로 차단되지 않음
4. 문제가 없으면 `Request indexing`을 누른다.

주의:

- URL Inspection의 `URL is on Google`은 검색 결과 노출을 보장하지 않는다.
- `Request indexing`도 색인을 보장하지 않는다.
- Google 공식 도움말 기준으로 색인은 보통 하루 안에 될 수도 있지만, 최대 1-2주 이상 걸릴 수 있다.
- 많은 URL은 개별 요청보다 sitemap 제출이 우선이다.

### 3.4 Page indexing 리포트에서 원인을 판정 - 대기

상태: 대기. 2026-05-04 현재 Search Console Page indexing 화면에는 "데이터를 처리하는 중이므로 며칠 후에 다시 확인" 문구가 표시된다. 따라서 현재는 색인 제외 원인을 판정할 수 없으며, 48-72시간 후 다시 확인한다.

Search Console > Indexing > Pages에서 다음 상태를 확인한다.

| Search Console 상태 | 의미 | 조치 |
| --- | --- | --- |
| `Discovered - currently not indexed` | Google이 URL을 알지만 아직 크롤링하지 않음 | sitemap 제출, 내부 링크 강화, 외부 발견 경로 확보, 며칠-몇 주 관찰 |
| `Crawled - currently not indexed` | Google이 봤지만 색인 가치가 낮거나 중복/품질 문제로 보류 | 홈/기능/데모 콘텐츠 강화, 손상 문구 수정, 독창적 설명 추가 |
| `Duplicate, Google chose different canonical` | Google이 다른 URL을 대표로 선택 | redirect/canonical/sitemap/내부 링크를 `https://a-pch.com/`로 통일 |
| `Blocked by robots.txt` | robots.txt가 크롤링 차단 | 공개 페이지의 disallow 제거. 현재 홈은 해당 없음 |
| `Excluded by noindex tag` | meta 또는 `X-Robots-Tag`가 noindex | 해당 페이지에서 noindex 제거. 현재 홈은 해당 없음 |
| `Soft 404` | 200이지만 실질적으로 빈 페이지/오류 페이지처럼 판단 | 실제 제품 설명, 데모, CTA, 신뢰 정보 보강 |
| `Server error (5xx)` | Googlebot 요청에서 서버 오류 | Vercel 로그와 서버 오류 수정 |
| `Page with redirect` | 검사 URL이 다른 URL로 이동 | 최종 canonical URL만 sitemap에 유지 |

### 3.5 Manual actions와 Security issues 확인 - 완료

상태: 완료. 2026-05-04 현재 Search Console의 Manual actions와 Security issues에서 감지된 문제가 없는 것으로 확인했다.

Search Console에서 다음 두 메뉴는 반드시 확인한다.

- Security & Manual Actions > Manual actions
- Security & Manual Actions > Security issues

신규 사이트는 보통 비어 있어야 한다. 만약 수동 조치나 보안 문제가 있으면 sitemap/색인 요청보다 해당 문제 해결이 먼저다.

## 4. 코드와 설정 개선 제안

### 4.1 운영 canonical URL을 코드 기본값으로 고정 - 완료

상태: 완료. 2026-05-04 현재 `src/fsd/shared/lib/site.ts`의 fallback URL을 `https://apc-h.vercel.app`에서 `https://a-pch.com`으로 변경했고, `npm run build` 통과를 확인했다.

```ts
const baseSiteUrl =
  configuredSiteUrl === undefined || configuredSiteUrl === ""
    ? "https://a-pch.com"
    : configuredSiteUrl;
```

운영 배포에서는 현재 `https://a-pch.com`이 제대로 출력되고 있으므로 환경 변수는 설정된 것으로 보인다. fallback도 운영 도메인으로 변경했으므로 환경 변수가 누락된 빌드에서도 canonical, Open Graph, sitemap이 예전 Vercel 도메인으로 회귀하지 않는다.

권장 조치:

- Vercel Production 환경 변수에 `NEXT_PUBLIC_SITE_URL=https://a-pch.com`을 유지한다.
- production build에서 `NEXT_PUBLIC_SITE_URL`이 없으면 빌드 실패하게 하거나, fallback을 `https://a-pch.com`으로 변경한다.
- preview/staging 도메인은 가능하면 `noindex` 처리하거나 Search Console sitemap에 포함하지 않는다.

### 4.2 손상된 랜딩 페이지 문구 수정 - 완료

상태: 완료. 2026-05-04 현재 `src/fsd/pages/home/config/index.ts`와 `src/fsd/pages/home/ui/_component/HeroSection.tsx`의 손상된 랜딩 페이지 문구를 ASCII 기반 문구로 수정했다.

다음 파일에서 깨진 문구가 확인된다.

```text
src/fsd/pages/home/config/index.ts
src/fsd/pages/home/ui/_component/HeroSection.tsx
```

수정 전 확인된 예:

```text
Gemini maps the top Q&A pairs with 40??0s durations.
Gemini 2.5 scans word-level timestamps and plans 40??0 second question-and-answer clips automatically.
Columbia face tracks steer 1080??920 crops ...
Upload, request processing, review the clip list, play or download, and delete?遊엓l from a single view.
Creator-first automation 쨌 Nov 2025
```

적용한 문구:

```text
Gemini maps the top Q&A pairs with 40-60s durations.
Gemini 2.5 scans word-level timestamps and plans 40-60 second question-and-answer clips automatically.
Columbia face tracks steer 1080x1920 crops or blurred backgrounds, rendered via NVENC at 25 fps.
Upload, request processing, review the clip list, play, download, and delete clips from a single view.
Creator-first automation - Nov 2025
```

### 4.3 홈의 H1과 title을 더 검색 의도에 맞게 조정 - 완료

상태: 완료. 2026-05-04 현재 홈 `metadata.title`, Open Graph title, H1을 `AI Podcast Clipper for YouTube Shorts`로 변경했다.

수정 전 홈:

- `<title>`: `Turn Your Podcast into Short-Form Clips with AI`
- H1: `Clip the signal, skip the grind.`

title은 비교적 명확하지만 H1은 추상적이다. Google Search Essentials는 사용자가 검색할 단어를 title, main heading 등 눈에 띄는 위치에 넣는 것을 권장한다.

권장 방향:

```text
AI Podcast Clipper for YouTube Shorts
```

또는:

```text
Turn Podcasts into AI-Generated Short-Form Clips
```

브랜드성 문구는 H1 아래 보조 문구로 유지한다.

적용 후:

```text
<title>: AI Podcast Clipper for YouTube Shorts
Open Graph title: AI Podcast Clipper for YouTube Shorts
H1: AI Podcast Clipper for YouTube Shorts
```

### 4.4 공개 제품 투어 페이지 추가

현재 `See product tour` CTA가 `/dashboard`로 연결된다. `/dashboard`는 로그인/앱 영역이며 robots.txt에서 disallow되어 있다. 검색 유입 사용자는 제품을 이해할 공개 페이지가 필요하다.

추가 권장:

```text
/demo
/product-tour
/examples
```

포함할 내용:

- 실제 업로드 -> AI 분석 -> 클립 결과 흐름
- 제품 UI 스크린샷
- 샘플 입력/출력
- 생성된 클립 예시. 저작권 문제가 없는 자체 제작 영상만 사용
- 처리 시간, 지원 파일 형식, 지원 언어, 보안 방식
- FAQ
- `/login` 또는 `/dashboard` CTA

### 4.5 sitemap을 공개 색인 대상 페이지 중심으로 확장

현재 sitemap은 3개 URL뿐이다.

추천 추가 URL:

```text
/
/demo
/pricing
/about
/features/ai-podcast-clipping
/features/word-level-subtitles
/features/vertical-video-cropping
/use-cases/podcast-to-shorts
/use-cases/youtube-shorts
/examples
/terms
/privacy
```

원칙:

- 로그인 필요 페이지는 sitemap에 넣지 않는다.
- `noindex` 페이지는 sitemap에 넣지 않는다.
- canonical URL만 sitemap에 넣는다.
- 실제 콘텐츠가 바뀐 경우에만 `lastModified`를 갱신한다.
- `/api`, `/dashboard`, `/login`은 현재처럼 제외한다.

### 4.6 한국어 검색을 노린다면 별도 로케일 페이지를 만든다

현재 `<html lang="en">`이고 Open Graph에는 `ko_KR` alternate locale이 있다. 하지만 실제 한국어 페이지나 `hreflang`은 없다.

한국어 검색 노출을 원한다면 다음 중 하나를 선택한다.

1. 영어 사이트로 유지하고 한국어 노출은 우선순위에서 제외한다.
2. `/ko` 경로를 만들고 한국어 랜딩 페이지를 제공한다.
3. Next.js metadata의 `alternates.languages`로 `en`, `ko` hreflang을 명시한다.

예:

```ts
alternates: {
  canonical: absoluteSiteUrl("/"),
  languages: {
    en: absoluteSiteUrl("/"),
    ko: absoluteSiteUrl("/ko"),
  },
}
```

단, 실제 한국어 본문 없이 hreflang만 추가하면 안 된다.

## 5. 콘텐츠와 신뢰 신호 개선 제안

### 5.1 현재 공개 콘텐츠의 한계

현재 검색엔진이 볼 수 있는 주요 콘텐츠는 다음 정도다.

- 홈
- Terms of Service
- Privacy Policy

이 구조는 서비스 운영을 위한 최소 요건에는 가깝지만, Google이 "이 사이트가 AI podcast clipper 검색어에 대해 충분히 유용하다"고 판단하기에는 약하다.

특히 신규 도메인이고 외부 링크가 거의 없다면 Googlebot이 발견하는 속도도 느리고, 크롤링 후에도 `Crawled - currently not indexed`로 남을 가능성이 있다.

### 5.2 우선 제작할 공개 페이지

| 우선순위 | 페이지 | 목적 | 핵심 내용 |
| --- | --- | --- | --- |
| P0 | `/demo` 또는 `/product-tour` | 사용자가 제품을 이해하게 함 | 워크플로우, UI 캡처, 결과물, FAQ |
| P0 | `/about` | 신뢰 정보 | 만든 사람/팀, 연락처, 제품 목적, 운영 주체 |
| P1 | `/pricing` | 상업 서비스 정보 명확화 | 무료 크레딧, 유료 플랜, 처리 한도 |
| P1 | `/features/ai-podcast-clipping` | 핵심 키워드 대응 | AI가 어떤 기준으로 클립을 고르는지 |
| P1 | `/features/word-level-subtitles` | 자막 기능 설명 | WhisperX, 언어 지원, SRT/VTT/번인 여부 |
| P1 | `/features/vertical-video-cropping` | 영상 편집 기능 설명 | 9:16 크롭, face-aware crop, output format |
| P2 | `/use-cases/podcast-to-shorts` | 검색 의도 대응 | 팟캐스트를 Shorts/Reels/TikTok으로 변환 |
| P2 | `/examples` | 실물 증거 | 자체 제작 전/후 비교, 짧은 영상 샘플 |

### 5.3 각 페이지의 최소 SEO 기준

각 공개 페이지는 다음을 갖춰야 한다.

- 고유한 `<title>`
- 고유한 meta description
- 검색 의도를 직접 말하는 H1
- 사용자가 실제로 판단할 수 있는 본문
- 내부 링크: 홈, 데모, 가격, 로그인 CTA
- canonical URL
- sitemap 포함
- 이미지에는 의미 있는 alt text
- 로그인 없이 접근 가능
- 200 OK
- noindex 없음

### 5.4 외부 발견 경로 확보

Google은 웹의 기존 링크를 따라 새 URL을 발견한다. 신규 사이트는 sitemap만 있어도 발견될 수 있지만, 외부 링크가 있으면 발견과 평가가 쉬워진다.

권장:

- GitHub README 또는 organization profile에 `https://a-pch.com/` 링크
- 제품 데모 YouTube 영상 설명에 링크
- LinkedIn/X/Threads 등 공식 또는 개인 프로필 링크
- Product Hunt, BetaList, Indie Hackers 등 제품 소개 페이지
- 관련 블로그 글: "How I built an AI podcast clipper", "Podcast to Shorts workflow" 등
- 실제 사용 사례 또는 샘플 콘텐츠를 포함한 포스트

주의:

- 링크 구매, 자동 생성 링크, 과도한 상호 링크, PBN은 피한다.
- Google spam policies는 검색 순위 조작 목적의 링크 스팸을 정책 위반으로 본다.

## 6. 잘못된 해결책

### 6.1 Indexing API를 일반 페이지에 쓰지 않는다

Google Indexing API는 일반 SaaS 랜딩 페이지 색인용 API가 아니다. 공식 문서 기준으로 JobPosting 또는 VideoObject에 포함된 BroadcastEvent가 있는 라이브스트림 페이지에만 사용할 수 있다.

`a-pch.com` 홈, 기능 페이지, 가격 페이지에는 Search Console sitemap 제출과 URL Inspection을 사용해야 한다.

### 6.2 검색 순위 보장 업체를 쓰지 않는다

Google Search Essentials는 Google 검색 결과에 표시되는 데 비용이 들지 않는다고 설명한다. "Google 색인 보장", "1일 내 1페이지 보장" 같은 판매 문구는 신뢰하지 않는다.

### 6.3 sitemap에 비공개/저품질 URL을 대량으로 넣지 않는다

색인 후보가 많아 보이게 하려고 로그인 페이지, API, 대시보드, 빈 페이지, 중복 페이지를 sitemap에 넣으면 오히려 품질 신호가 나빠질 수 있다.

## 7. 실행 로드맵

### D0: 오늘 바로 수행

1. Search Console Domain property `a-pch.com` 등록
2. DNS TXT 소유권 검증
3. sitemap 제출: `https://a-pch.com/sitemap.xml`
4. URL Inspection으로 `https://a-pch.com/` 라이브 테스트
5. 문제가 없으면 `Request indexing`
6. Manual actions, Security issues 확인
7. Page indexing 리포트가 비어 있으면 sitemap 처리 대기

완료 기준:

- Search Console property 검증 완료
- sitemap status `Success`
- URL Inspection live test에서 indexing allowed
- 홈 URL 색인 요청 제출

### D1-D2: 기술/카피 수정

1. 깨진 문구 수정
2. H1을 제품 범주가 드러나게 수정
3. `/dashboard`로 가는 `See product tour` CTA를 공개 `/demo` 또는 `/product-tour`로 변경
4. `/about` 또는 `/demo` 중 최소 1개 공개 페이지 추가
5. sitemap에 새 공개 페이지 추가
6. `NEXT_PUBLIC_SITE_URL` 운영 환경 변수 재확인
7. production canonical과 sitemap URL 표기 통일

완료 기준:

- 운영 HTML에 깨진 문구 없음
- 새 공개 페이지가 200 OK
- sitemap에 새 페이지 반영
- URL Inspection에서 새 페이지도 indexing allowed

### W1: 공개 콘텐츠 확장

1. `/demo`, `/about`, `/pricing` 추가
2. 핵심 기능 페이지 2-3개 추가
3. 자체 제작 샘플 클립 또는 스크린샷 추가
4. 내부 링크 구조 정리
5. Search Console에서 Page indexing 원인 확인

완료 기준:

- sitemap 공개 URL 8개 이상
- 모든 sitemap URL이 로그인 없이 접근 가능
- 주요 URL의 live test 통과
- Search Console에 최소 홈 URL이 indexed 또는 indexing queue에 있음

### W2-W4: 발견성과 신뢰 신호 확보

1. GitHub/YouTube/LinkedIn/X/Product Hunt 등 신뢰 가능한 외부 링크 확보
2. 제품 사용 사례 글 2-4개 게시
3. Search Console Performance에서 impressions 발생 여부 확인
4. `Crawled - currently not indexed` URL은 본문 품질과 중복 여부를 개선
5. 색인된 페이지의 query 데이터를 보고 title/H1/description을 조정

완료 기준:

- `site:a-pch.com` 또는 Search Console URL Inspection에서 홈이 확인됨
- Search Console Performance에 impressions 발생
- Page indexing에서 의도한 공개 페이지가 indexed 또는 합리적 대기 상태

## 8. 운영 모니터링 체크리스트

주 1회 확인:

- Search Console > Pages: 새 오류가 생겼는지
- Search Console > Sitemaps: sitemap fetch 성공 여부
- Search Console > Performance: impressions, clicks, query 확인
- Search Console > Manual actions / Security issues: 비어 있는지
- Vercel logs: Googlebot 요청에서 4xx/5xx가 있는지
- 운영 `robots.txt`: 홈/공개 페이지가 막히지 않았는지
- 운영 `sitemap.xml`: canonical 공개 URL만 들어 있는지

간단한 운영 점검 명령:

```powershell
curl.exe -I -L https://a-pch.com/
curl.exe -L https://a-pch.com/robots.txt
curl.exe -L https://a-pch.com/sitemap.xml
```

기대 상태:

- 홈: `200 OK`
- `robots.txt`: `Allow: /`, sitemap URL 포함
- `sitemap.xml`: 공개 canonical URL만 포함
- HTML: `noindex` 없음, canonical 정상

## 9. 성공 기준

이 문제를 "해결"로 볼 수 있는 기준은 다음이다.

1. Search Console에서 `https://a-pch.com/`이 `URL is on Google` 또는 indexed 상태가 된다.
2. `https://a-pch.com/sitemap.xml`이 Search Console에서 `Success` 상태다.
3. `site:a-pch.com` 검색 또는 URL 직접 검색에서 최소 홈이 확인된다. 단, `site:` 검색은 Google 공식 문서상 모든 색인 URL을 완전하게 보여주는 도구는 아니므로 Search Console을 최종 기준으로 삼는다.
4. Search Console Performance에 impression 데이터가 발생한다.
5. 신규 공개 페이지가 Page indexing 리포트에서 의도대로 처리된다.

## 10. 참고한 공식 문서

- Google Search Essentials: <https://developers.google.com/search/docs/essentials>
- Google Search technical requirements: <https://developers.google.com/search/docs/essentials/technical>
- Get your website on Google: <https://developers.google.com/search/docs/fundamentals/get-on-google>
- SEO Starter Guide: <https://developers.google.com/search/docs/fundamentals/seo-starter-guide>
- Creating helpful, reliable, people-first content: <https://developers.google.com/search/docs/fundamentals/creating-helpful-content>
- Get started with Search Console: <https://developers.google.com/search/docs/monitor-debug/search-console-start>
- URL Inspection Tool: <https://support.google.com/webmasters/answer/9012289>
- Inspect and troubleshoot a single page: <https://support.google.com/webmasters/answer/12482179>
- Page indexing report: <https://support.google.com/webmasters/answer/7440203>
- Ask Google to recrawl your URLs: <https://developers.google.com/search/docs/crawling-indexing/ask-google-to-recrawl>
- Learn about sitemaps: <https://developers.google.com/search/docs/crawling-indexing/sitemaps/overview>
- Build and submit a sitemap: <https://developers.google.com/search/docs/crawling-indexing/sitemaps/build-sitemap>
- How Google interprets robots.txt: <https://developers.google.com/search/docs/crawling-indexing/robots/robots_txt>
- Block Search indexing with noindex: <https://developers.google.com/search/docs/crawling-indexing/block-indexing>
- Robots meta tags specifications: <https://developers.google.com/search/docs/crawling-indexing/robots-meta-tag>
- Canonicalization: <https://developers.google.com/search/docs/crawling-indexing/canonicalization>
- Specify a canonical URL: <https://developers.google.com/search/docs/crawling-indexing/consolidate-duplicate-urls>
- Indexing API usage limits: <https://developers.google.com/search/apis/indexing-api/v3/using-api>
- Google Search spam policies: <https://developers.google.com/search/docs/essentials/spam-policies>
