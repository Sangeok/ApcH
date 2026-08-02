---
status: "pending"
stage: "draft"
proposal-size: "standard"
created-at: "2026-06-15"
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

# SEO 공개 콘텐츠 및 권위 신호 성장 계획

작성일: 2026-06-14 KST  
대상 도메인: `https://a-pch.com/`  
대상 프로젝트: `ai-podcast-clipper-frontend`  
목적: Google Search Console에서 확인되는 낮은 검색 노출 문제를 "검색 차단 버그"가 아니라 "검색될 만한 공개 콘텐츠와 권위 신호 부족" 문제로 보고, 실행 가능한 콘텐츠/제품/기술 개선안을 정의한다.

## 1. 요약

현재 `a-pch.com`은 Google이 접근하지 못하는 상태가 아니다. 운영 도메인은 200으로 응답하고, 공개 페이지는 `index, follow`를 출력하며, `robots.txt`와 `sitemap.xml`도 기본적으로 정상이다. 따라서 핵심 문제는 검색엔진 차단이 아니라 Google이 색인하고 평가할 만한 공개 표면적이 작고, 제품 신뢰와 권위 신호가 아직 부족하다는 점이다.

가장 중요한 방향은 다음과 같다.

1. 로그인 뒤에 숨어 있는 제품 경험을 공개 설명, 제품 흐름, 데모 페이지로 전환한다.
2. `AI podcast clipper`, `podcast to shorts`, `YouTube Shorts generator for podcasts` 같은 검색 의도별 랜딩 페이지를 더 깊게 만든다.
3. 단순 세일즈 카피가 아니라 처리 과정, 제약, 비교, 보안, 운영자 정보까지 공개한다.
4. 대량 AI 블로그를 찍어내지 않고, 소수의 고품질 evergreen 페이지와 실제 제품 증거를 먼저 만든다.
5. Search Console 데이터를 기준으로 30일, 60일, 90일 단위의 확장 페이지를 결정한다.

이 계획의 핵심 KPI는 "색인 URL 수" 자체가 아니다. 우선순위는 `노출수`, `비브랜드 검색어 수`, `평균 게재순위`, `제품 관련 클릭`, `가입 전환`이다.

## 2. 현재 진단

### 2.1 기술적 검색 차단이 주원인은 아니다

확인된 상태는 다음과 같다.

- `https://a-pch.com/robots.txt`는 `/`와 공개 마케팅 페이지를 차단하지 않는다.
- `https://a-pch.com/sitemap.xml`은 정상 XML로 응답한다.
- `/`, `/features`, `/youtube-shorts-generator` 등 공개 페이지는 `index, follow`와 canonical을 출력한다.
- `/dashboard`, `/login`, `/signup`, `/api`가 검색 대상에서 빠지는 것은 정상이다.
- `www.a-pch.com`과 `http://a-pch.com`은 canonical 도메인으로 정규화되어야 한다.

따라서 이 문제를 `robots.txt`나 `noindex` 문제로만 보는 것은 우선순위가 낮다.

### 2.2 공개 검색 표면적이 작다

현재 sitemap의 주요 검색 유입 페이지는 대략 다음 수준이다.

- `/`
- `/product-tour`
- `/features`
- `/pricing`
- `/ai-podcast-clipper`
- `/podcast-to-shorts`
- `/youtube-shorts-generator`
- `/terms`
- `/privacy`

법무 페이지를 제외하면 제품/검색 유입 페이지는 6~7개뿐이다. 신규 SaaS 도메인에서 이 정도 공개 페이지 수로는 경쟁 키워드에서 노출을 기대하기 어렵다.

### 2.3 공개 콘텐츠가 제품 증거보다 제품 설명에 치우쳐 있다

현재 페이지들은 기본 SEO 태그, FAQ JSON-LD, 제품 설명을 갖추고 있다. 하지만 Google과 사용자가 신뢰할 만한 실제 증거가 약하다.

부족한 신호는 다음과 같다.

- 권리 확보된 first-party 결과 미디어. 현재는 공개 미디어 proof를 보류한다.
- 업로드부터 결과까지의 공개 워크플로우 스크린샷
- 어떤 입력에서 좋은 결과와 나쁜 결과가 나오는지에 대한 투명한 설명
- 모델/파이프라인 작동 방식에 대한 구체적 설명
- 운영자, 회사, 연락처, 지원 채널
- 제품 업데이트 기록
- 외부 사이트에서 이 제품을 언급하거나 링크할 이유
- 경쟁 대체재와의 정직한 비교

### 2.4 제품 정보 불일치가 있다

공개 카피에 다음과 같은 불일치가 있다.

- 홈: `Up to 2 per run`
- 기능/가격 스키마: `1-4 clips`
- 실제 상수: `CLIP_COUNT_OPTIONS = [1, 2, 3, 4]`

이런 불일치는 SEO보다 먼저 제품 신뢰를 해친다. 모든 공개 페이지에서 현재 제품 제한사항을 하나의 표현으로 통일해야 한다.

### 2.5 Vercel 기본 도메인이 Search Console 해석을 흐릴 수 있다

`https://apc-h.vercel.app/`도 200으로 열리지만 sitemap과 canonical은 `https://a-pch.com` 기준이다. Search Console에서 Vercel 기본 도메인 속성을 보고 있다면 검색이 거의 안 되는 것처럼 보일 수 있다.

권장 사항은 다음과 같다.

- Search Console의 주 속성은 `a-pch.com` Domain property로 본다.
- 가능하면 Vercel 기본 도메인은 `https://a-pch.com`으로 리다이렉트한다.
- 모든 canonical, sitemap, Open Graph URL은 `https://a-pch.com`으로 통일한다.

## 3. 목표와 비목표

### 3.1 목표

1. 90일 안에 Google이 평가할 수 있는 고품질 공개 URL을 6~7개에서 25~40개로 늘린다.
2. 제품 관련 비브랜드 쿼리에서 노출을 만든다.
3. 브랜드 검색이 아닌 `podcast to shorts`, `ai podcast clipper`, `youtube shorts generator for podcast` 계열 쿼리로 유입되는 구조를 만든다.
4. 가입 전환 전에 사용자가 제품을 이해할 수 있는 공개 증거를 만든다.
5. Search Console 데이터를 기반으로 콘텐츠 확장 우선순위를 운영한다.

### 3.2 비목표

1. 대량 AI 블로그 자동 생성.
2. 키워드만 바꾼 유사 랜딩 페이지 양산.
3. `/dashboard` 같은 인증 페이지를 색인 대상으로 여는 것.
4. 백링크 패키지 구매, PBN, 스팸 디렉터리 제출.
5. 제품이 아직 제공하지 않는 기능을 SEO 목적으로 과장하는 것.

## 4. 전략 개요

전략은 네 축으로 나눈다.

### 4.1 검색 의도 페이지

검색자가 이미 문제를 갖고 있는 쿼리를 대상으로 한다.

예시는 다음과 같다.

- `AI podcast clipper`
- `podcast to shorts`
- `YouTube Shorts generator for podcasts`
- `podcast clip maker`
- `turn podcast into clips`
- `podcast highlight generator`
- `auto captions for podcast clips`

이 페이지들은 단순 기능 나열이 아니라 "이 검색어를 입력한 사람이 무엇을 결정하려는가"에 답해야 한다.

### 4.2 제품 증거 페이지

Google과 사용자가 제품이 실제로 존재하고 작동한다고 판단할 수 있게 만든다.

필요한 예시는 다음과 같다.

- 공개 데모
- 권리 확보된 결과 proof 페이지. 현재는 보류한다.
- 전후 비교
- 파이프라인 설명
- 보안/프라이버시 설명
- 제한 사항
- 변경 기록

### 4.3 권위와 신뢰 신호

신규 도메인이기 때문에 "누가 만들었고, 왜 믿어도 되는지"를 명확히 해야 한다.

필요한 페이지는 다음과 같다.

- About page
- Founder/operator profile
- Methodology page
- Contact/support page
- Security and data handling page
- Public changelog
- 정리된 Legal pages

### 4.4 외부 발견 가능성

Google은 링크를 통해 새 페이지를 발견하고 신뢰도를 판단한다. 외부에서 링크할 이유를 만들어야 한다.

실행 예시는 다음과 같다.

- 런칭 디렉터리
- 크리에이터 커뮤니티
- 인디해커/스타트업 디렉터리
- YouTube creator resource list
- 기술 설명 글
- 공개 데모 클립
- 사람들이 참고할 수 있는 비교 페이지

## 5. 공개 URL 구조 제안

### 5.1 기존 페이지는 유지하고 깊이를 늘린다

현재 페이지를 버리지 않고 더 깊게 만든다.

| URL | 현재 역할 | 개선 방향 |
| --- | --- | --- |
| `/` | 브랜드/제품 홈 | 검색 의도, 처리 과정, proof, CTA 정리 |
| `/features` | 기능 목록 | 기능별 실제 결과, 제한, 스크린샷 추가 |
| `/pricing` | 가격 | 크레딧 차감 방식, 예시 계산, FAQ 강화 |
| `/product-tour` | 제품 흐름 | 로그인 없는 워크플로우 데모, 단계별 스크린샷 추가 |
| `/ai-podcast-clipper` | 카테고리 키워드 | "AI podcast clipper란 무엇인가"와 제품 차별점 |
| `/podcast-to-shorts` | 문제 해결 키워드 | podcast에서 Shorts/Reels/TikTok으로 바꾸는 워크플로우 |
| `/youtube-shorts-generator` | 플랫폼 키워드 | Shorts 요구사항, 길이, 비율, 캡션, 업로드 조건 |

### 5.2 제품 증거 페이지를 추가한다

우선순위가 높은 신규 페이지는 다음과 같다.

| URL | 목적 | 중요한 이유 |
| --- | --- | --- |
| `/how-it-works` | 파이프라인 설명 | WhisperX, Gemini, ASD, rendering 역할 공개 |
| `/security` | 업로드 스토리지, 삭제, 서명 URL 설명 | 신뢰와 B2B 전환에 중요 |
| `/changelog` | 제품 변경 기록 | 활성 제품 신호, 자연스러운 내부 링크 생성 |
| `/about` | 누가 만드는지 설명 | E-E-A-T와 신뢰 신호 |
| `/contact` | 문의/지원 경로 | 신뢰, 전환, 브랜드 검색 대응 |

공개 결과 미디어 페이지는 자체 출연, 명시적 촬영/배포 동의, 또는 상업적 2차 저작 허용 라이선스가 확보되기 전까지 신규 URL로 만들지 않는다.

### 5.3 검색 의도 가이드를 추가한다

초기에는 6~8개만 만든다. 각 글은 1,500~2,500단어를 목표로 하되, 단어 수 자체보다 실제 예시, 스크린샷, 체크리스트가 더 중요하다.

| URL | 주 검색 의도 | 메모 |
| --- | --- | --- |
| `/guides/how-to-make-podcast-clips-for-youtube-shorts` | 방법 검색 | 제품 사용 흐름과 수동 워크플로우를 모두 설명 |
| `/guides/best-podcast-clip-length-for-shorts` | 기준/전략 검색 | 30/40/60초 기준, hooks, context, captions |
| `/guides/podcast-clips-with-captions` | 캡션 검색 | burned-in captions, word-level timing, Korean captions |
| `/guides/turn-long-form-video-into-shorts` | 넓은 문제 검색 | podcast에 초점을 유지하되 broader intent 흡수 |
| `/guides/repurpose-podcast-content` | 콘텐츠 재활용 검색 | clips, show notes, metadata, cross-platform |
| `/guides/youtube-shorts-for-podcast-hosts` | persona + platform | podcast hosts에게 필요한 체크리스트 |

### 5.4 비교 페이지는 정직하고 구체적일 때만 만든다

비교 페이지는 전환 가치가 높지만 얕게 만들면 신뢰를 해친다. 다음 조건을 만족할 때만 만든다.

- 직접 사용해 본 비교 기준이 있다.
- 기능 차이를 과장하지 않는다.
- 가격, 입력 형식, 편집 제어, 캡션, output, privacy 기준을 명확히 비교한다.
- 경쟁사 이름을 스팸처럼 반복하지 않는다.

후보는 다음과 같다.

| URL | 대상 |
| --- | --- |
| `/compare/opusclip-alternative-for-podcasts` | OpusClip 대체재 검색 |
| `/compare/descript-vs-ai-podcast-clipper` | 편집 도구와 자동 클리핑 비교 |
| `/compare/manual-editing-vs-ai-podcast-clipping` | 문제 인식 단계 |

초기 90일에는 비교 페이지보다 proof/guides가 먼저다.

## 6. 페이지 품질 기준

모든 공개 페이지는 아래 기준을 통과해야 sitemap에 넣는다.

### 6.1 필수 요소

1. 고유 H1.
2. 검색 의도를 직접 해결하는 첫 문단.
3. 제품이 실제로 어떻게 동작하는지에 대한 구체 설명.
4. 관련 내부 링크 3개 이상.
5. 제품 제한 사항 또는 적용 조건.
6. FAQ 3~5개. 실제 페이지에 보이는 Q/A만 JSON-LD로 출력.
7. canonical.
8. sitemap 포함.
9. Open Graph title/description.
10. 가능하면 제품 UI 스크린샷, 처리 과정, 권리 확보된 결과 증거.

### 6.2 피해야 할 것

1. 같은 문장 구조로 키워드만 바꾼 페이지.
2. `best`, `viral`, `instant` 같은 과장 표현 남발.
3. 제품이 지원하지 않는 자동 업로드, 완전 자동 편집, 무제한 처리 암시.
4. 근거 없는 성능 수치.
5. 검색엔진을 위한 단어 수 채우기.

## 7. 권위 신호 작업

### 7.1 About page

URL: `/about`

포함할 내용은 다음과 같다.

- AI Podcast Clipper가 무엇을 해결하는지.
- 누가 만들고 운영하는지.
- 왜 podcast clipping에 집중하는지.
- 사용 기술 스택을 비전문가도 이해할 수 있게 설명.
- 연락 가능한 경로.
- 제품이 아직 초기 단계라면 그 사실을 정직하게 명시.

목표는 "익명 SaaS 랜딩" 느낌을 줄이는 것이다.

### 7.2 Methodology page

URL: `/how-it-works`

포함할 내용은 다음과 같다.

- 업로드.
- transcription.
- highlight selection.
- active speaker framing.
- captions.
- rendering.
- review/download.
- 어떤 상황에서 결과가 좋은지.
- 어떤 상황에서 결과가 제한적인지.

목표는 제품의 전문성을 보여주고, 단순한 "AI magic"이 아니라 작동 원리를 설명하는 것이다.

### 7.3 Security page

URL: `/security`

포함할 내용은 다음과 같다.

- S3 per-user prefix.
- presigned URL.
- URL expiry.
- 원본/결과 파일 접근 방식.
- 삭제 정책.
- 결제 정보를 직접 저장하지 않는다는 설명.
- 처리에 사용하는 외부 서비스 범위.

목표는 업로드형 제품에서 가장 큰 신뢰 장벽을 줄이는 것이다.

### 7.4 Changelog

URL: `/changelog`

포함할 내용은 다음과 같다.

- 날짜별 제품 변경.
- 공개 사용자가 이해할 수 있는 변경 설명.
- SEO를 위해 날짜만 바꾸지 않고 실제 변경만 기록.

목표는 제품이 살아 있다는 신호를 만들고, 업데이트마다 자연스러운 내부 링크 대상을 만드는 것이다.

### 7.5 Contact/support

URL: `/contact`

포함할 내용은 다음과 같다.

- 이메일 또는 폼.
- 지원 범위.
- 버그 신고 방식.
- 결제/계정 문의 경로.

목표는 신뢰와 전환 보조다.

## 8. 권리 안전 proof 전략

로그인 뒤 제품만 보여주면 검색자가 제품을 판단하기 어렵다. 다만 현재는 제3자 podcast 영상을 공개 proof로 쓰는 것이 저작권, 초상권, 2차 저작물 권리 측면에서 안전하지 않다.

따라서 공개 미디어 proof는 다음 조건 중 하나가 충족될 때까지 보류한다.

1. 운영자가 직접 출연하거나 직접 촬영한 first-party 영상.
2. 출연자와 원저작권자의 명시적 촬영, 편집, 배포 동의가 있는 영상.
3. 상업적 이용과 2차 저작물 공개가 허용되는 라이선스 영상.

그 전까지 공개 proof는 다음으로 대체한다.

- `/how-it-works`에서 처리 파이프라인을 구체적으로 설명한다.
- `/security`에서 업로드, signed URL, 삭제, 비공개 저장 원칙을 설명한다.
- `/guides/*`에서 clip 선택, caption, review checklist를 제공한다.
- `/compare/*`에서 수동 편집과 AI-assisted workflow의 차이를 비교한다.
- 제품 UI 스크린샷은 실제 제3자 콘텐츠, 얼굴, 음성, transcript가 노출되지 않는 범위에서만 사용한다.

공개 영상이 준비되기 전에는 `VideoObject` schema를 추가하지 않는다.

## 9. 내부 링크 계획

내부 링크는 단순 footer 링크보다 문맥 링크가 중요하다.

### 9.1 내비게이션

Header 권장 항목:

- Product tour
- Pricing
- Guides

Footer 권장 그룹:

- Product: Features, Product tour, Pricing
- Solutions: AI Podcast Clipper, Podcast to Shorts, YouTube Shorts Generator
- Resources: Guides, How it works, Changelog
- Trust: About, Security, Contact, Terms, Privacy

### 9.2 문맥 링크

각 페이지에 자연스럽게 넣을 링크는 다음과 같다.

- `/youtube-shorts-generator` -> `/guides/best-podcast-clip-length-for-shorts`
- `/podcast-to-shorts` -> `/guides/how-to-make-podcast-clips-for-youtube-shorts`
- `/features` -> `/how-it-works`
- `/pricing` -> `/guides/podcast-clips-with-captions`
- `/security` -> `/privacy`
- `/about` -> `/changelog`

### 9.3 Breadcrumbs

`/guides/*`, `/compare/*`에는 breadcrumb UI와 `BreadcrumbList` JSON-LD를 추가한다.

## 10. 기술 SEO 작업

### 10.1 Sitemap 확장

모든 공개 검색 대상 페이지를 `src/app/sitemap.ts`에 추가한다.

규칙은 다음과 같다.

- 인증/계정/API 페이지는 넣지 않는다.
- 실제로 200 응답하는 canonical URL만 넣는다.
- 아직 얕거나 준비 중인 페이지는 sitemap에 넣지 않는다.
- `lastModified`는 페이지별 실제 변경일을 반영한다.

### 10.2 Canonical 원칙

규칙은 다음과 같다.

- `NEXT_PUBLIC_SITE_URL=https://a-pch.com`.
- 모든 canonical은 `absoluteSiteUrl(path)`를 사용한다.
- 가능하면 Vercel 기본 도메인은 canonical 도메인으로 리다이렉트한다.
- trailing slash 정책은 sitemap/canonical/redirect에서 통일한다.

### 10.3 구조화 데이터

추가할 JSON-LD는 다음과 같다.

- Home: `WebApplication` 또는 `SoftwareApplication`.
- About: 법적 주체에 따라 `Organization` 또는 `Person`/`Organization`.
- Guides: `Article`.
- FAQ: 화면에 보이는 Q/A가 있는 페이지에만 `FAQPage`.
- Breadcrumbs: 중첩 페이지에는 `BreadcrumbList`.

주의할 점은 다음과 같다.

- 구조화 데이터는 페이지 본문에 보이는 내용과 일치해야 한다.
- FAQ JSON-LD만으로 순위가 오르지 않는다. 페이지 품질 보조 신호로 본다.

### 10.4 Metadata 템플릿

각 페이지 metadata는 다음 형식을 따른다.

```ts
export const metadata: Metadata = {
  title: "...",
  description: "...",
  alternates: { canonical: absoluteSiteUrl("/path") },
  openGraph: {
    title: "...",
    description: "...",
    url: absoluteSiteUrl("/path"),
    type: "website",
    locale: "en_US",
  },
};
```

Guides에는 `type: "article"` 사용을 검토한다.

### 10.5 제품 카피 일관성

즉시 정리할 문구는 다음과 같다.

- clip count: `1-4 clips per upload` 또는 실제 제품 정책에 맞는 표현 하나로 통일.
- free credits: `3 free credits`와 `1 credit per generated clip`의 관계를 예시로 설명.
- processing time: 확정 수치가 없다면 `depends on file size and queue load`처럼 보수적으로 표현.
- caption languages: `English or Korean selected per processing run`으로 통일.
- upload limit: `900 MB .mp4`로 통일.

## 11. 콘텐츠 브리프

### 11.1 공개 결과 미디어

목표: 실제 결과 proof를 만들되, 권리 문제가 없는 미디어만 공개한다.

현재 상태:

- 제3자 podcast 영상 기반 공개 페이지는 만들지 않는다.
- 자체 출연, 명시적 허가, 또는 상업적 2차 저작 허용 라이선스가 확보되면 별도 범위로 다시 설계한다.
- 준비 전에는 sitemap, header, footer, product page CTA에 공개 미디어 URL을 넣지 않는다.

대체 성공 지표:

- `/how-it-works`, `/guides/*`, `/compare/*`에서 `/login` 또는 `/product-tour`로 이동.
- Search Console에서 `podcast to shorts`, `podcast clipper`, `podcast captions` 계열 노출.

### 11.2 `/how-it-works`

목표: 제품 작동 원리를 공개해 전문성 신호를 만든다.

섹션:

- Upload and private storage.
- Transcription.
- Highlight selection.
- Active speaker framing.
- Captions.
- Rendering.
- Review and download.
- Limitations.

성공 지표:

- `/features`, `/product-tour`, `/security`를 연결하는 내부 허브 역할.

### 11.3 `/security`

목표: 파일 업로드 SaaS의 신뢰 장벽을 낮춘다.

섹션:

- What is uploaded.
- Where files are stored.
- How signed URLs work.
- Who can access files.
- How deletion works.
- Third-party processors.
- Contact for security questions.

성공 지표:

- pricing/product-tour에서 security 페이지 클릭.
- B2B/agency 문의 전환.

### 11.4 `/guides/how-to-make-podcast-clips-for-youtube-shorts`

목표: 방법 검색 유입.

섹션:

- What makes a podcast moment work as a Short.
- Manual workflow.
- AI-assisted workflow.
- Caption/framing requirements.
- Publishing checklist.
- Common mistakes.
- Using AI Podcast Clipper.

성공 지표:

- 비브랜드 guide 쿼리 노출.
- `/youtube-shorts-generator`와 `/login`으로 이동.

### 11.5 `/guides/best-podcast-clip-length-for-shorts`

목표: 정보 탐색 단계 유입.

섹션:

- Recommended range.
- Why 40-60 seconds often works for conversations.
- When shorter clips work.
- When longer context is necessary.
- Caption density.
- Hook and payoff structure.
- Product settings.

성공 지표:

- long-tail query impressions.
- `/podcast-to-shorts`, `/youtube-shorts-generator`로 내부 이동.

### 11.6 `/about`

목표: 익명 사이트 느낌 제거.

섹션:

- What AI Podcast Clipper is.
- Who builds it.
- Why the product exists.
- Technical focus.
- Contact/support.

성공 지표:

- Footer trust click.
- branded search result quality improvement.

## 12. 외부 권위 신호 계획

### 12.1 런칭 프로필

`/guides`, `/how-it-works`, `/pricing`, `/about`, `/security`가 준비된 뒤 제출한다.

대상은 다음과 같다.

- Product Hunt.
- Indie Hackers.
- BetaList.
- 편집 기준이 있는 startup directories.
- 의미 있는 제품 설명을 허용하는 AI tool directories.
- Creator tool directories.

피해야 할 것은 다음과 같다.

- bulk directory submissions.
- paid backlink packages.
- 수십 개 사이트에 복붙한 설명.

### 12.2 커뮤니티 proof

채널:

- YouTube creator communities.
- podcasting communities.
- indie maker communities.
- short-form editing communities.

접근 방식:

- 홈페이지가 아니라 실제 guide, how-it-works, comparison page를 공유한다.
- backlink 요청이 아니라 workflow feedback을 요청한다.
- `how this clip was selected`, `why captions drift`, `what makes a podcast clip work` 같은 유용한 breakdown을 발행한다.

### 12.3 기술 설명 글

가능한 주제:

- How active speaker detection helps podcast clips.
- Why word-level caption timing matters.
- How to safely process private video uploads with signed URLs.
- Lessons from turning long-form interviews into Shorts.

이 글들은 먼저 사이트에 게시한 뒤, 외부 커뮤니티에는 canonical을 의식한 요약 형태로 재활용한다.

## 13. 측정 계획

### 13.1 Search Console

매주 추적할 항목은 다음과 같다.

- Total clicks.
- Total impressions.
- Average CTR.
- Average position.
- 브랜드 검색어 포함 쿼리.
- 브랜드 검색어 미포함 쿼리.
- 노출이 있는 페이지.
- 색인된 페이지.
- Crawled but not indexed.
- Discovered but not indexed.

유용한 query group:

- `ai podcast clipper`
- `podcast to shorts`
- `podcast clips`
- `youtube shorts generator`
- `podcast caption`
- `turn podcast into clips`
- `podcast highlight generator`

### 13.2 Analytics

추적할 항목은 다음과 같다.

- Landing page.
- CTA click.
- Signup click.
- Signup completion.
- Upload started.
- Processing completed.

최소 이벤트:

- `public_cta_clicked`
- `pricing_cta_clicked`
- `public_resource_cta_clicked`
- `guide_internal_link_clicked`
- `signup_started`

### 13.3 30/60/90일 마일스톤

30일:

- 기존 7개 페이지 개선.
- `/how-it-works`, `/security`, `/about`, `/contact`, `/guides` live.
- Sitemap updated.
- Product copy consistency fixed.
- Search Console baseline recorded.

60일:

- guide page 4개 live.
- guide page 4개 이상 live.
- internal linking pass complete.
- 최소 15개 공개 URL 색인.
- 첫 non-brand impressions 확인.

90일:

- 25~40개의 유용한 공개 URL.
- 근거가 충분할 경우 comparison page 1~2개.
- public changelog 운영.
- 외부 런칭/커뮤니티 제출 완료.
- Search Console report 기반으로 다음 top 10 page opportunity 정의.

## 14. 실행 로드맵

### Phase 0. 정리

1. Vercel env의 canonical domain 확인.
2. `apc-h.vercel.app`를 리다이렉트하거나 최소한 검색 기준에서 분리.
3. clip count copy 불일치 수정.
4. Search Console `a-pch.com` Domain property 확인.
5. sitemap 제출 확인.

### Phase 1. Trust foundation

1. `/about` 추가.
2. `/contact` 추가.
3. `/security` 추가.
4. `/how-it-works` 추가.
5. footer/header links 갱신.
6. sitemap entries 추가.

### Phase 2. Rights-safe proof foundation

1. `/guides` 생성.
2. 고품질 guide 4개 이상 게시.
3. `/compare`와 workflow comparison page 추가.
4. 제품 UI 스크린샷은 제3자 콘텐츠가 보이지 않는 범위에서만 추가.
5. home, product tour, solution pages에서 guides/how-it-works로 링크.

### Phase 3. Search intent expansion

1. Search Console query를 기준으로 추가 guide page 4~6개 게시.
2. guide hub `/guides`의 카테고리와 내부 링크 개선.
3. 기존 guide의 Article/Breadcrumb schema 유지 점검.
4. product pages, guides, compare pages 사이 internal linking pass.
5. 얕은 페이지는 늘리지 않고 실제 질문에 답하는 페이지부터 확장.

### Phase 4. Authority expansion

1. launch directory submissions.
2. guides, how-it-works, comparison pages를 활용한 community posts.
3. technical writeups.
4. product proof가 강해진 뒤 comparison pages 검토.

## 15. 편집 원칙

1. 모든 페이지는 하나의 primary search intent에 답해야 한다.
2. 모든 주장은 제품 동작, 스크린샷, 예시 또는 보수적인 표현으로 뒷받침한다.
3. 구분되는 각도가 없으면 새 페이지를 만들지 않는다.
4. placeholder screenshot 또는 vague `coming soon` 섹션이 있는 페이지는 게시하지 않는다.
5. generic marketing보다 `what works / what does not work`의 정직함을 우선한다.
6. 각 guide에는 제품 CTA가 있어야 하지만, 본문은 CTA 없이도 유용해야 한다.
7. 오래된 날짜를 남발하지 않는다. 내용이 실질적으로 바뀐 경우에만 날짜를 갱신한다.

## 16. 리스크와 대응

| 리스크 | 영향 | 대응 |
| --- | --- | --- |
| 얇은 콘텐츠 확장 | Google이 페이지를 무시하거나 저품질로 볼 수 있음 | 적은 수의 깊은 페이지를 먼저 발행 |
| 제품 과장 | 신뢰 하락, 전환 저하 | 제한 사항과 구체 예시 추가 |
| 중복 의도 페이지 | cannibalization | 페이지마다 하나의 primary query family만 담당 |
| 권리 확보된 공개 미디어 부족 | proof 약함 | 미디어 proof는 보류하고 guides/how-it-works/comparison으로 대체 |
| 외부 언급 부족 | 발견 속도와 권위 신호 약함 | rights-safe resource page 이후 launch/community plan 실행 |
| 제품 제한 정보 불일치 | 신뢰 하락 | constants/product policy 기준으로 카피 통일 |
| Vercel domain 혼동 | Search Console 해석 오류 | `a-pch.com`을 canonical과 property 기준으로 사용 |

## 17. 첫 번째 PR 권장 범위

첫 구현 PR은 의도적으로 작고 영향이 큰 범위로 잡는다.

포함:

1. home의 clip count copy 불일치 수정.
2. `/about` 추가.
3. `/contact` 추가.
4. `/security` 추가.
5. `/how-it-works` 추가.
6. Trust/Resources footer links 추가.
7. sitemap 갱신.

아직 포함하지 않을 것:

- comparison pages.
- 많은 guide pages.
- programmatic content generation.
- 큰 visual redesign.

이유:

품질을 희석하지 않으면서 최소 신뢰 기반과 공개 crawlable surface를 늘릴 수 있다.

## 18. 두 번째 PR 권장 범위

포함:

1. `/guides` 추가.
2. guide detail page 4~6개 추가.
3. `/compare`와 workflow comparison page 1개 추가.
4. Article/Breadcrumb schema 추가.
5. home, product tour, solution pages에서 guides/how-it-works로 링크.

이유:

권리 확보 전 공개 미디어 proof는 보류하고, 검색될 만한 설명형/비교형/가이드형 공개 콘텐츠를 늘린다.

## 19. 세 번째 PR 권장 범위

포함:

1. `/guides` 추가.
2. 고품질 guide 3~4개 추가.
3. Article metadata/schema 추가.
4. breadcrumbs 추가.
5. guides와 product pages 사이 internal links 추가.

이유:

Guide는 trust/resource page와 함께 묶여야 한다. 그래야 제품과 분리된 SEO 글처럼 보이지 않는다.

## 20. 완료 기준

이 이니셔티브는 다음 조건을 만족하면 완료로 본다.

1. `a-pch.com` sitemap에 최소 25개의 유용한 공개 URL이 있다.
2. 모든 공개 URL에는 명확한 검색 또는 신뢰 목적이 있다.
3. 제품 제한사항이 모든 페이지에서 일관된다.
4. 최소 3개의 공개 proof/resource page가 있다.
5. About, contact, security, changelog가 live 상태다.
6. Search Console에서 여러 query group의 non-brand impressions가 확인된다.
7. 사이트가 몇 개 이상의 legitimate external mentions 또는 links를 확보했다.
8. 다음 콘텐츠 로드맵이 추측이 아니라 Search Console 데이터에 기반한다.

## 21. 참고 자료

- Google Search Central: SEO Starter Guide  
  `https://developers.google.com/search/docs/fundamentals/seo-starter-guide`
- Google Search Central: Learn about sitemaps  
  `https://developers.google.com/search/docs/crawling-indexing/sitemaps/overview`
- Google Search Central: Introduction to robots.txt  
  `https://developers.google.com/search/docs/crawling-indexing/robots/intro`
- Google Search Central: Creating helpful, reliable, people-first content  
  `https://developers.google.com/search/docs/fundamentals/creating-helpful-content`
