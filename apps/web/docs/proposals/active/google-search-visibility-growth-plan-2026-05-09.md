---
status: "pending"
stage: "draft"
proposal-size: "standard"
created-at: "2026-05-09"
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

# a-pch.com Google 검색 노출 개선 제안서

기준일: 2026-05-09 KST  
대상 도메인: `https://a-pch.com/`  
대상 프로젝트: `ai-podcast-clipper-frontend`  
작성 목적: Google Search Console에서 홈 URL의 색인이 확인된 이후, 검색 결과 노출과 순위를 개선하기 위한 최적 실행안을 정의한다.  
비고: 사용자 요청의 `단,` 이후 세부 조건은 제공되지 않았으므로, 현재 확인된 Search Console 화면과 프로젝트 상태를 기준으로 작성한다.

## 1. 결론

`https://a-pch.com/`의 현재 문제는 더 이상 "Google에 등록되지 않는 문제"가 아니다. Search Console의 `Google 색인` 탭에서 홈 URL이 Google에 등록되어 있고 페이지 색인이 생성된 것으로 확인되었다.

따라서 최우선 전략은 색인 요청을 반복하는 것이 아니라, Google과 사용자가 사이트의 주제, 제품 가치, 신뢰도, 관련성을 더 명확하게 이해하도록 공개 콘텐츠와 검색 신호를 확장하는 것이다.

가장 적합한 실행 방향은 다음과 같다.

1. 현재의 크롤링/색인 기반은 유지한다.
2. 얇은 블로그 글을 대량 생산하지 말고, 검색 의도별 고품질 공개 랜딩 페이지를 소수부터 만든다.
3. 로그인 뒤에 있는 제품 설명 흐름을 공개 제품 투어 페이지로 분리한다.
4. 제목, 설명, 내부 링크, sitemap, 구조화 데이터를 페이지 단위로 정리한다.
5. 실제 사용자가 발견할 만한 외부 링크와 브랜드 언급을 확보한다.
6. Search Console의 노출수, 검색어, CTR 데이터를 기준으로 다음 개선 대상을 결정한다.

## 2. 현재 상태 판정

2026-05-09에 확인된 Search Console 화면 기준 상태는 다음과 같다.

| 항목 | 확인 결과 | 판단 |
| --- | --- | --- |
| Google 색인 | `URL이 Google에 등록되어 있음` | 홈 URL은 이미 Google 색인에 존재한다. |
| 페이지 색인 생성 | `페이지 색인이 생성됨` | 색인 생성 실패 상태가 아니다. |
| 실시간 테스트 | `URL을 Google에 등록할 수 있음` | 현재 페이지도 색인 가능한 상태다. |
| 크롤링 허용 여부 | 예 | `robots.txt`가 홈을 막지 않는다. |
| 페이지 가져오기 | 성공 | Googlebot이 HTML을 가져올 수 있다. |
| 색인 생성 허용 여부 | 예 | `noindex` 문제가 없다. |
| 사용자 선언 표준 URL | `https://a-pch.com/` | canonical 의도가 정상이다. |
| HTTPS | 정상 | HTTPS 제공 문제도 아니다. |

명확한 판정:

```text
색인 문제: 해결됨
남은 문제: 검색 노출/랭킹/브랜드 신호 부족
```

## 3. 하지 말아야 할 일

아래 작업은 현재 단계에서 우선순위가 낮거나 오히려 품질 신호를 해칠 수 있다.

- 변경 없는 홈 URL에 `색인 생성 요청`을 반복해서 누르기
- 이미 허용된 홈 페이지 때문에 `robots.txt`를 불필요하게 수정하기
- `/dashboard`, `/login`, `/signup` 같은 비공개/인증 페이지를 색인 대상으로 열기
- 검색 유입만 노린 저품질 AI 블로그 글을 대량 생성하기
- 저품질 디렉터리, 댓글 스팸, 유료 백링크 패키지로 링크 수만 늘리기
- 제목과 본문에 키워드를 부자연스럽게 반복하기

Google 공식 문서의 방향도 검색엔진 조작용 콘텐츠가 아니라 사람에게 유용하고 신뢰할 수 있는 콘텐츠를 만들라는 쪽이다. 이 프로젝트는 아직 신규 도메인이고 공개 페이지가 적으므로, 양보다 명확한 제품 설명과 실제 사용 맥락이 중요하다.

## 4. Priority 0: 색인 기반 유지

색인은 이미 되었지만, 회귀를 막기 위해 아래 항목은 유지해야 한다.

### 4.1 Canonical 일관성 유지

모든 대표 URL 신호를 `https://a-pch.com/` 기준으로 통일한다.

- Vercel Production 환경 변수: `NEXT_PUBLIC_SITE_URL=https://a-pch.com`
- `metadataBase`, canonical, Open Graph URL은 `SITE_URL`에서 생성
- `http://a-pch.com/` -> `https://a-pch.com/` 리다이렉트 유지
- `https://www.a-pch.com/` -> `https://a-pch.com/` 리다이렉트 유지
- sitemap에는 색인시키려는 canonical URL만 포함

Google은 canonical 선언을 강제 규칙이 아니라 신호로 해석한다. 따라서 redirect, sitemap, `rel=canonical`, HTTPS 신호가 모두 같은 방향을 가리키는 상태가 가장 안정적이다.

### 4.2 Sitemap 확장

현재 sitemap의 공개 URL은 사실상 다음 3개다.

- `/`
- `/terms`
- `/privacy`

기술적으로는 정상이나, 검색 노출을 만들기에는 공개 콘텐츠 풀이 너무 작다. 새 공개 페이지를 만들 때마다 `src/app/sitemap.ts`에 즉시 반영한다.

규칙:

- Google 검색 결과에 보여도 되는 URL만 넣는다.
- 상대 경로가 아니라 절대 URL을 사용한다.
- 실제 콘텐츠가 바뀐 경우 `lastModified`를 갱신한다.
- `/dashboard`, `/login`, `/signup`, `/api`는 넣지 않는다.

### 4.3 제품 투어를 공개 URL로 분리

현재 운영 HTML에서 `See product tour` CTA가 `/dashboard`로 연결되는 것으로 확인되었다. `/dashboard`는 인증 영역이고 `robots.txt`에서도 크롤링 제외 대상이다.

개선:

- `/product-tour` 또는 `/demo` 공개 페이지를 만든다.
- 홈의 `See product tour` 링크를 `/dashboard`가 아니라 `/product-tour`로 변경한다.
- 로그인 없이도 제품 흐름, 샘플 결과, UI 스크린샷, 제한 사항, 무료 체험 조건을 이해할 수 있게 만든다.

이 작업은 우선순위가 높다. 현재 사이트는 사용자가 제품을 평가할 수 있는 공개 경로가 약하고, Google도 제품의 실제 사용 흐름을 충분히 이해하기 어렵다.

## 5. Priority 1: 검색 의도별 공개 페이지 추가

현재 홈과 법적 문서만으로는 `AI podcast clipper`, `podcast to shorts`, `YouTube Shorts generator` 같은 검색 의도를 충분히 커버하기 어렵다.

먼저 만들 페이지:

| URL | 타겟 검색 의도 | 목적 |
| --- | --- | --- |
| `/ai-podcast-clipper` | 제품 카테고리/브랜드 | AI Podcast Clipper가 무엇인지 명확히 설명 |
| `/podcast-to-shorts` | 문제 해결형 검색 | 팟캐스트를 Shorts/Reels/TikTok 클립으로 바꾸는 흐름 설명 |
| `/youtube-shorts-generator` | 출력 포맷 검색 | YouTube Shorts용 세로 클립, 자막, 내보내기 설명 |
| `/features` | 제품 평가 | 기능 목록과 각 기능의 실제 가치 설명 |
| `/pricing` | 구매/가입 전 검토 | 무료 체험, 크레딧, 요금제, 제한 사항 설명 |
| `/product-tour` | 제품 데모 | 로그인 전 제품 흐름과 예시 결과 제공 |

2차로 검토할 페이지:

| URL | 추가 조건 | 목적 |
| --- | --- | --- |
| `/use-cases/podcast-creators` | Search Console에 creator 관련 검색어가 보일 때 | 크리에이터 워크플로우 설명 |
| `/use-cases/agencies` | 팀/대행사 검색 의도가 확인될 때 | 협업, 검수, 반복 제작 흐름 설명 |
| `/use-cases/interview-clips` | interview/video podcast 검색어가 보일 때 | 인터뷰 클립 제작 맥락 설명 |
| `/blog/how-to-make-podcast-clips-for-youtube-shorts` | 실제 제품 예시와 스크린샷을 넣을 수 있을 때 | 실전 가이드형 유입 확보 |
| `/blog/best-podcast-clip-length-for-shorts` | 제품 데이터나 제작 경험을 담을 수 있을 때 | 단순 정보글이 아닌 제품 관점의 가이드 제공 |

주의:

```text
한 번에 많은 페이지를 얇게 만드는 것보다,
6개 이하의 핵심 페이지를 깊게 만드는 편이 현재 도메인에는 더 적합하다.
```

## 6. 각 공개 페이지의 구성 원칙

각 페이지는 다음 구조를 기본값으로 한다.

1. 검색 의도와 일치하는 명확한 H1
2. 첫 문단에서 제품이 해결하는 문제를 직접 설명
3. 실제 워크플로우 섹션
4. UI 스크린샷, 샘플 클립, 결과 예시
5. 기능과 장점을 구체적인 제품 사실로 설명
6. 제한 사항 또는 요구 사항
7. 실제 구매/가입 전 질문에 기반한 FAQ
8. 관련 공개 페이지로 내부 링크
9. 가입 또는 무료 체험 CTA
10. 페이지별 metadata, canonical, sitemap 반영

H1 예시:

- `AI Podcast Clipper for YouTube Shorts`
- `Turn Podcasts Into YouTube Shorts With AI`
- `YouTube Shorts Generator for Podcast Clips`
- `Podcast Clipper Features`
- `AI Podcast Clipper Pricing`

metadata 예시:

```ts
export const metadata: Metadata = {
  title: "Turn Podcasts Into YouTube Shorts With AI",
  description:
    "Upload a podcast video, find the best Q&A moments, add captions, and export vertical clips for YouTube Shorts.",
  alternates: { canonical: absoluteSiteUrl("/podcast-to-shorts") },
};
```

## 7. 콘텐츠 품질 기준

새 페이지는 배포 전에 아래 조건을 만족해야 한다.

- 홈만으로는 답하지 못하는 검색 의도를 해결한다.
- Gemini 하이라이트 탐지, WhisperX 단어 단위 자막, 한국어/영어 자막, 세로 프레이밍, S3 signed URL, 대시보드 검수, 크레딧 구조 같은 제품 고유 정보를 담는다.
- `viral 보장`, `조회수 보장`, `검색 순위 보장` 같은 과장 표현을 쓰지 않는다.
- 가능하면 실제 UI 스크린샷이나 샘플 결과를 넣는다.
- title과 description이 페이지마다 고유하다.
- 최소 2개 이상의 관련 공개 페이지로 내부 링크를 건다.
- header, footer, homepage, 또는 다른 공개 페이지에서 접근 가능하다.
- `sitemap.ts`에 포함되어 있다.

## 8. 내부 링크 개선안

Header:

- `Features`
- `Pricing`
- `Product tour`

Footer:

- 기존 `Terms`, `Privacy` 유지
- `Features`, `Pricing`, `Product tour`, `About` 또는 `Contact` 추가

Homepage:

- 기능 카드에서 관련 공개 페이지로 링크
- `See product tour`를 `/dashboard`가 아니라 `/product-tour`로 변경
- workflow 섹션에서 `/podcast-to-shorts`, `/youtube-shorts-generator`로 연결

신규 페이지 간 연결:

- `/podcast-to-shorts` -> `/youtube-shorts-generator`, `/features`, `/pricing`
- `/youtube-shorts-generator` -> `/podcast-to-shorts`, `/features`, `/product-tour`
- `/features` -> use-case 페이지와 product-tour
- `/pricing` -> `/features`, `/product-tour`

Google은 링크를 페이지 발견과 관련성 이해의 신호로 사용한다. 따라서 JavaScript 이벤트만 있는 클릭 요소가 아니라, 실제 `<a href>` 기반의 설명적인 앵커 텍스트를 사용한다.

## 9. 구조화 데이터 개선안

현재 사이트는 `WebApplication` JSON-LD를 출력하고 있다. 이를 유지하면서 아래를 검토한다.

권장:

- 홈과 주요 제품 페이지: `WebApplication`
- 제품 성격에 맞는 경우: `SoftwareApplication`
- `/about` 또는 명확한 운영 주체가 있을 경우: `Organization` 또는 `Person`
- 실제 화면에 FAQ가 있는 페이지: `FAQPage`
- `/use-cases/...` 같은 중첩 페이지: `BreadcrumbList`

주의:

- 보이는 콘텐츠와 맞지 않는 구조화 데이터는 추가하지 않는다.
- FAQPage는 실제로 사용자에게 보이는 질문/답변에만 적용한다.
- 구조화 데이터는 순위 보장 수단이 아니라 이해 보조 신호로 본다.

## 10. 신뢰와 브랜드 신호 강화

신규 도메인은 Google이 브랜드와 주제를 충분히 학습하기 전까지 도메인명 검색에서도 약하게 보일 수 있다. 아래 페이지와 요소를 추가해 신뢰 신호를 강화한다.

- `/about`: 누가 만들었는지, 왜 만들었는지, 어떤 문제를 푸는지 설명
- `/contact`: 지원 이메일 또는 문의 경로
- `/changelog`: 실제 제품 개선 내역이 있다면 공개
- `/security` 또는 `/privacy` 내 보강 섹션: S3 signed URL, 사용자별 저장 구조, 삭제 정책 설명
- 제품 스크린샷과 샘플 클립
- 무료 체험, 크레딧, 제한 사항의 명확한 공개

목표는 단순히 Google을 설득하는 것이 아니라, 처음 들어온 사용자가 로그인 전에도 제품을 신뢰하고 이해하게 만드는 것이다.

## 11. 외부 발견 경로 확보

외부 링크는 수량보다 관련성과 실제 발견 가능성이 중요하다.

권장 채널:

- 공개 GitHub README 또는 프로필에 `https://a-pch.com/` 링크
- YouTube 제품 데모 영상 설명란에 홈과 `/product-tour` 링크
- X/LinkedIn 출시 글
- Product Hunt, Hacker News Show HN, Indie Hackers 등 실제 출시 맥락이 맞는 커뮤니티
- 팟캐스트 크리에이터 커뮤니티에 실제 데모/케이스스터디 공유
- 편집 기준이 있는 SaaS/tool 디렉터리

피해야 할 채널:

- 유료 백링크 패키지
- 자동 생성 디렉터리
- 댓글 스팸
- 제품과 무관한 게스트 포스트
- 링크 교환만을 목적으로 한 페이지

목표:

```text
관련 사용자에게 실제로 발견되는 링크를 만들고,
브랜드 검색과 직접 유입을 늘리는 것.
```

## 12. 측정 계획

Search Console을 기준 데이터로 사용한다.

2026-05-09 기준 베이스라인:

- 홈 URL은 색인됨
- 공개 색인 대상 페이지는 매우 적음
- 검색 노출은 낮은 것이 정상

매주 확인할 항목:

| 지표 | 위치 | 해석 |
| --- | --- | --- |
| 색인된 페이지 수 | Search Console > 페이지 | 신규 공개 페이지가 색인되는지 확인 |
| 노출수 | Search Console > 실적 | 클릭보다 먼저 봐야 할 초기 신호 |
| 검색어 | Search Console > 실적 | 다음 콘텐츠 우선순위 결정 |
| CTR | Search Console > 실적 | 노출은 있는데 클릭이 낮으면 title/description 개선 |
| 평균 게재순위 | Search Console > 실적 | 초기에는 방향성만 참고 |
| 링크 | Search Console > 링크 | 외부 발견 경로 확인 |
| Core Web Vitals | Search Console / PageSpeed Insights | 실제 UX 문제가 있을 때 개선 |

검토 주기:

- 1주차: 신규 페이지 배포, sitemap 반영, 크롤링 가능 여부 확인
- 2주차: 신규 페이지 색인 상태 확인
- 3-4주차: 노출수와 검색어 확인
- 4주차 이후: Search Console 데이터 기준으로 title, 본문, 내부 링크 개선

## 13. 구현 순서

### Day 1

1. `/product-tour` 생성
2. 홈의 `See product tour` 링크를 `/product-tour`로 변경
3. header/footer에 `Features`, `Pricing`, `Product tour` 추가
4. `src/app/sitemap.ts`에 신규 공개 페이지 추가

### Days 2-3

1. `/features` 생성
2. `/pricing` 생성
3. 페이지별 metadata와 canonical 추가
4. 실제 UI 스크린샷 또는 샘플 결과 추가

### Days 4-7

1. `/podcast-to-shorts` 생성
2. `/youtube-shorts-generator` 생성
3. 필요한 경우에만 FAQ 섹션 추가
4. 신규 공개 페이지 간 내부 링크 연결

### Week 2

1. Search Console에 업데이트된 sitemap 제출
2. 주요 신규 URL을 URL 검사로 확인
3. 핵심 페이지만 색인 생성 요청
4. 실제 외부 발견 경로 1개 이상 확보

### Weeks 3-4

1. Search Console 검색어 확인
2. 노출은 있으나 CTR이 낮은 페이지의 title/description 개선
3. 검색어 데이터에 맞는 use-case 페이지 1개 추가
4. 실제 제품 예시를 넣을 수 있는 가이드 글 1개 추가 여부 결정

## 14. 이 저장소에서 예상 수정 파일

예상 수정 범위:

- `src/app/page.tsx`
- `src/app/sitemap.ts`
- `src/fsd/shared/lib/site.ts`
- `src/fsd/shared/lib/seo.ts`
- `src/fsd/widgets/site-header/ui/index.tsx`
- `src/fsd/widgets/site-footer/ui/index.tsx`
- `src/fsd/pages/home/ui/_component/HeroSection.tsx`
- 신규 route: `src/app/product-tour/page.tsx`
- 신규 route: `src/app/features/page.tsx`
- 신규 route: `src/app/pricing/page.tsx`
- 신규 route: `src/app/podcast-to-shorts/page.tsx`
- 신규 route: `src/app/youtube-shorts-generator/page.tsx`
- 신규 FSD page module: `src/fsd/pages/product-tour/...`
- 신규 FSD page module: `src/fsd/pages/features/...`
- 신규 FSD page module: `src/fsd/pages/pricing/...`

구현 원칙:

- 공개 마케팅 페이지는 서버 렌더링 중심으로 둔다.
- 기존 header/footer/UI atoms를 재사용한다.
- 각 route에서 metadata를 명시한다.
- public page 수가 많아지기 전까지 sitemap은 명시적으로 관리한다.
- 콘텐츠 양이 충분해지기 전에는 CMS를 도입하지 않는다.

## 15. 성공 기준

4-8주 안에 아래 상태를 목표로 한다.

- Search Console에 홈 외 신규 공개 페이지가 색인된다.
- `podcast to shorts`, `AI podcast clipper`, `YouTube Shorts generator for podcasts` 계열 검색어에서 노출이 발생한다.
- 홈이 아닌 공개 제품 페이지가 독립적으로 노출을 얻는다.
- 관련성 있는 외부 링크 또는 브랜드 언급이 생긴다.
- 사용자가 로그인 전에도 제품 기능, 가격, 결과물을 이해할 수 있다.

초기 성공 기준을 "Google 1위"로 잡으면 안 된다. 현 단계의 현실적인 목표는 Google이 사이트의 주제를 정확히 분류하고, 관련 검색어에서 테스트 노출을 시작하게 만드는 것이다.

## 16. 참고한 공식 문서

- Google Search Central, SEO Starter Guide: `https://developers.google.com/search/docs/fundamentals/seo-starter-guide`
- Google Search Central, Search Console start guide: `https://developers.google.com/search/docs/monitor-debug/search-console-start`
- Google Search Central, Creating helpful, reliable, people-first content: `https://developers.google.com/search/docs/fundamentals/creating-helpful-content`
- Google Search Central, Build and submit a sitemap: `https://developers.google.com/search/docs/crawling-indexing/sitemaps/build-sitemap`
- Google Search Central, Canonicalization: `https://developers.google.com/search/docs/crawling-indexing/canonicalization`
- Google Search Central, Consolidate duplicate URLs: `https://developers.google.com/search/docs/crawling-indexing/consolidate-duplicate-urls`
- Google Search Central, Link best practices: `https://developers.google.com/search/docs/crawling-indexing/links-crawlable`
- Google Search Central, Title links and snippets: `https://developers.google.com/search/docs/advanced/appearance/good-titles-snippets`
