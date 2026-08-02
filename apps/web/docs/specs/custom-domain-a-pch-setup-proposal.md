# 커스텀 도메인 `a-pch.com` 연결 제안서

> 작성일: 2026-04-17
> 대상 도메인: `a-pch.com` (구매 완료, 설정 미적용)
> 현재 운영 도메인: `https://apc-h.vercel.app`
> 관련 문서: `docs/specs/vercel-project-setup-guide.md` (Phase D), `docs/proposals/seo-search-visibility-proposal.md`, `docs/proposals/cloudfront-cdn-setup-guide.md`

---

## 0. TL;DR

현재 레포에 `podcastclipper.com`을 전제로 한 레거시 문서가 있으나, **코드 전반과 Vercel 환경 변수는 `apc-h.vercel.app`에 하드코딩·설정되어 있다.** `a-pch.com`으로 완전 이전하려면 다음 3개 축의 변경이 모두 필요하다.

1. **Vercel 계정 → 프로젝트 도메인 연결** (본 케이스 전용, §Phase 1 참조)
2. **코드**(5개 파일) — 폴백 상수 교체 + 기존 trailing-slash 버그 동반 수정
3. **환경 변수 & 외부 서비스**(Google OAuth, Polar Webhook, GSC)

> **본 케이스 전제**: `a-pch.com`은 **Vercel을 통해 구매**되었다. 따라서 외부 DNS 레지스트라 조작(A/CNAME 수동 입력)이 **불필요하며**, Vercel 계정(Account/Team) 레벨에 "소유 도메인"으로 이미 등록된 것을 **프로젝트(Project) 레벨에 연결**하는 절차가 Phase 1의 핵심이다. (외부 레지스트라에서 구매한 경우의 절차는 §부록 A에 별도 기술.)

**핵심 리스크**: 단순 "env 변수만 바꾸고 재배포"하면 Google OAuth `redirect_uri_mismatch`와 Polar 결제 Webhook 실패가 동시에 발생할 수 있다. **아래 6-단계 순서를 준수**해야 무중단 전환이 가능하다.

---

## 1. 배경 및 현재 상태 (As-Is)

### 1.1 구매한 도메인
- `a-pch.com`
- **구매 경로**: **Vercel Domains** (Vercel 대시보드 → Account/Team → Domains에서 구매)
- **현재 상태**: Vercel 계정에 "소유 도메인"으로는 등록되어 있으나, **프로젝트(ApcH)에는 연결되지 않음**. Nameserver는 Vercel이 자동 관리(`ns1.vercel-dns.com`, `ns2.vercel-dns.com`)하므로 외부 DNS 조작은 불필요하다.
- **영향**: 현재 `https://a-pch.com`으로 접속해도 Vercel의 기본 404 페이지(도메인은 있으나 프로젝트에 바인딩되지 않음)가 반환된다.

### 1.2 현재 운영 중인 공개 URL
- Vercel 자동 부여 도메인: `https://apc-h.vercel.app` (프로덕션)

### 1.3 레거시 도메인 흔적
레포 내부에 `podcastclipper.com`을 가정한 문서가 존재한다(아래 파일들). 이 이름은 **실제 구매된 적이 없는 플레이스홀더**이므로, 본 제안서에서 일괄 `a-pch.com`으로 정정한다.

- `docs/specs/vercel-project-setup-guide.md` (Phase D-1, 자산 검증 체크리스트)
- `docs/specs/google-social-login.md` (Step 1, §11)
- `docs/proposals/cloudfront-cdn-setup-guide.md` (전반)
- `docs/specs/deployment-infrastructure-proposal.md`, `docs/specs/seo-optimization-guide.md`, `docs/specs/vercel-modal-repost-analysis.md`
- `.env.example:5` 주석

### 1.4 코드의 도메인 하드코딩 (전수조사 결과)

| 파일 | 라인 | 현재 값 | 문제 |
|---|---|---|---|
| `src/app/layout.tsx` | 7 | `"https://apc-h.vercel.app/"` | 폴백 도메인 + **trailing slash** |
| `src/app/sitemap.ts` | 4 | `"https://apc-h.vercel.app/"` | 폴백 도메인 + **trailing slash**(기존 버그, sitemap URL 오조립 원인) |
| `src/app/robots.ts` | 4, 15 | `"https://apc-h.vercel.app/"` → `${SITE_URL}/sitemap.xml` | 폴백 도메인 + **이중 슬래시 잠재 버그** |
| `src/fsd/shared/lib/seo.ts` | 2 | `"https://apc-h.vercel.app/"` | 폴백 도메인 + trailing slash |
| `src/app/api/checkout/route.ts` | 10 | `"https://apc-h.vercel.app"` | 폴백 도메인(슬래시 없음, 위 4개와 **불일치**) |

→ 이미 **4개 파일이 동일 상수를 중복 선언**하고 있으며, `seo-search-visibility-proposal.md` §4.3에서 단일 모듈(`src/fsd/shared/lib/site.ts`)로 통일할 것을 제안한 상태다. 본 제안서는 **그 통일 작업을 도메인 전환과 함께 수행**한다.

### 1.5 환경 변수 의존 지점 (런타임에 주입되는 값 경로)

| 환경 변수 | 스키마 위치 | 소비자 |
|---|---|---|
| `NEXT_PUBLIC_SITE_URL` | `src/env.js:50` | `layout.tsx`, `sitemap.ts`, `robots.ts`, `seo.ts`, `checkout/route.ts:10`, `inngest/functions.ts:83` (Modal callback) |
| `AUTH_URL` | `src/env.js:41` | NextAuth.js v5가 자동 참조 (Google OAuth redirect base) |

→ **"NEXT_PUBLIC_SITE_URL 하나만 바꾸면 되는 것처럼 보이지만",** Modal backend의 비동기 콜백 경로, Polar 체크아웃 success URL, NextAuth OAuth redirect URI가 모두 이 값에 연쇄적으로 묶여 있다.

### 1.7 Inngest — 변경 없음 (왜 건드리지 않는가)

본 제안서에서 **Inngest는 별도 섹션으로 다루지 않는다.** 다음 근거로 도메인 전환이 Inngest에 직접적 영향을 주지 않음을 확인했다.

| 구분 | 확인 내용 | 근거 |
|---|---|---|
| Serve endpoint | `src/app/api/inngest/route.ts`는 `serve()`가 **요청 URL로부터 자기 주소를 추론** — 자기 도메인 하드코딩 없음 | `route.ts:7` |
| Inngest Client | `Inngest({ id, schemas })` — URL 인자 없음. 이벤트 송신은 Inngest Cloud를 향함 | `src/inngest/client.ts:40-43` |
| Vercel Integration | `INNGEST_EVENT_KEY` / `INNGEST_SIGNING_KEY`를 Vercel이 자동 주입하고, Serve URL을 **Vercel Deployment URL 기반**으로 자동 등록 | `vercel-project-setup-guide.md` §C-1 |
| CSP | `connect-src 'self' https://*.inngest.com` 이미 허용 | `next.config.js:59` |
| 이벤트 발신 방향 | App → Inngest Cloud(outbound). 커스텀 도메인과 무관 | `inngest.send(...)` |
| 이벤트 수신 방향 | Inngest Cloud → App은 **Vercel이 유지하는 Primary Deployment URL**로 도달. `apc-h.vercel.app`은 Phase 7 이후에도 Vercel이 영구 보유하므로 끊기지 않음 | Vercel Integration 동작 원리 |

**단, 간접 영향 1건**이 있다:

- `src/inngest/functions.ts:83-84`의 `callback_url`은 `${env.NEXT_PUBLIC_SITE_URL}/api/webhooks/modal`로 조립된다. 이건 **Inngest 설정이 아니라 Inngest 함수 내부에서 만드는 Modal 콜백 URL**이며, Phase 5의 `NEXT_PUBLIC_SITE_URL` 교체로 자동 갱신된다. 코드·Inngest 대시보드 조작 불필요.

**후속 작업**: Phase 5 재배포 이후, Inngest 대시보드([app.inngest.com](https://app.inngest.com))의 해당 앱이 **신규 배포 시 자동 싱크**되었는지 확인. 싱크되지 않았을 경우 대시보드에서 수동 "Sync new deploy" 버튼 클릭(1회성). 이 검증은 §7.2 체크리스트에 포함된다.

### 1.6 외부 서비스 의존성 (도메인이 등록된 곳)

| 서비스 | 등록 항목 | 현재 값 | 영향 |
|---|---|---|---|
| Vercel (Account/Team) | **Domains (계정 레벨, 소유 도메인 목록)** | `a-pch.com` **등록 완료** | 프로젝트 연결 대기 |
| Vercel (Project) | **Settings → Domains (프로젝트 레벨)** | `apc-h.vercel.app`(자동) | **커스텀 도메인 미연결** |
| Vercel DNS | Nameserver | `ns1/ns2.vercel-dns.com` (Vercel이 자동 관리) | 외부 레지스트라 조작 **불필요** |
| Google Cloud Console | OAuth 2.0 클라이언트 — Authorized JS origins / redirect URIs | `http://localhost:3000`, `https://apc-h.vercel.app` (추정) | `redirect_uri_mismatch` 위험 |
| Google Cloud Console | OAuth 동의 화면 — Authorized domains | `vercel.app`? | 신규 도메인 등록 필요 |
| Polar.sh | Webhooks → URL | `https://apc-h.vercel.app/api/webhooks/polar` (추정) | 결제 이벤트 수신 끊김 위험 |
| Google Search Console | 속성 | `apc-h.vercel.app` | 신규 속성 추가 필요 |
| Inngest (Vercel Integration) | Serve URL / Event Key / Signing Key | Vercel Deployment URL 기반 자동 관리 | **설정 변경 없음** (§1.7 참조) |
| Modal.run (백엔드) | 콜백 수신 주소 | Frontend가 요청 시마다 `callback_url` 파라미터로 전달 | 코드에서 env 기반으로 조립되므로 env 갱신만으로 전환됨 |

---

## 2. 변경 범위 요약 (What to Change)

```
┌──────────────────── Vercel (최우선) ──────────────────┐
│ • Account/Team Domains 확인: a-pch.com "소유" 상태    │
│ • Project → Settings → Domains: a-pch.com 연결         │
│ • Project → Settings → Domains: www.a-pch.com 연결     │
│   └ Redirect to apex (a-pch.com) 설정                  │
│ • Env Var (Production): NEXT_PUBLIC_SITE_URL 교체       │
│ • Env Var (Production): AUTH_URL 교체                   │
└────────────────────────────────────────────────────────┘
┌──────────────────── 코드 5개 파일 ────────────────────┐
│ (1) src/fsd/shared/lib/site.ts          [신규]        │
│ (2) src/app/layout.tsx                  [수정]        │
│ (3) src/app/sitemap.ts                  [수정]        │
│ (4) src/app/robots.ts                   [수정]        │
│ (5) src/fsd/shared/lib/seo.ts           [수정]        │
│ (6) src/app/api/checkout/route.ts       [수정]        │
│ (7) .env.example                        [주석 수정]   │
└────────────────────────────────────────────────────────┘
┌──────────────────── 외부 서비스 ──────────────────────┐
│ • Google Cloud Console: OAuth URI 추가                 │
│ • Polar.sh: Webhook URL 갱신                            │
│ • Google Search Console: 신규 속성 등록 + Sitemap 제출 │
│ • (DNS 레지스트라 조작은 Vercel 구매이므로 불필요)    │
│ • (Inngest: Vercel Integration 자동 관리 → 변경 없음,  │
│    단 §7.2의 싱크 검증 수행. 상세는 §1.7)              │
│ • (Modal.run: callback_url은 env 기반 자동 갱신)       │
└────────────────────────────────────────────────────────┘
```

---

## 3. 실행 순서 (Phase별, 무중단 전환 절차)

> 순서를 바꾸면 Google 로그인 실패 또는 결제 Webhook 누락이 발생한다. **외부 서비스는 "신·구 도메인을 동시에 허용"하는 상태를 먼저 만들어 두고**, 마지막에 구 도메인을 제거하는 방식을 취한다.

---

### Phase 1: Vercel 구매 도메인을 프로젝트에 연결 (**최우선**)

`a-pch.com`이 Vercel에서 구매되었기 때문에 DNS/Nameserver 단계가 **자동화**된다. 외부 레지스트라에서 구매했을 때 필요한 A/CNAME 레코드 수동 입력은 불필요하다.

#### 1-1. Vercel 계정의 "소유 도메인" 상태 확인

1. Vercel Dashboard 로그인
2. 우상단 팀/계정 드롭다운 → 대상 Scope(개인 계정 또는 Team) 선택
3. 좌측 메뉴 또는 상단 탭의 **"Domains"** (⚠️ 이건 **Account/Team 레벨**의 Domains이며, Project Settings 안의 Domains와는 다르다)
4. `a-pch.com`이 **"Owned by you"** 상태로 표시되고 **"Not assigned to any project"** 표시가 있는지 확인
5. 만료일(Expiration)과 자동 갱신(Auto-renew) 설정 확인

> **Scope 주의**: Vercel은 "Personal Account"와 "Team"이 별개 Scope이다. 구매 당시 선택한 Scope와 배포 프로젝트(`ApcH`)가 속한 Scope가 **일치**해야 한다. 다른 Scope에 속한 경우 아래 1-2의 **"Transfer to another Team"** 기능으로 먼저 이전해야 한다.

#### 1-2. (필요 시) 도메인 Scope 이전

- 도메인 구매 Scope와 프로젝트 소속 Scope가 다른 경우:
  - Account/Team Domains → `a-pch.com` → **"Transfer to another Team"** → 대상 Team 선택
  - 또는 프로젝트 자체를 도메인이 있는 Team으로 이동 (`Project Settings → General → Transfer Project`)
- 동일 Scope인 경우 이 단계는 스킵.

#### 1-3. 프로젝트(ApcH)에 apex 도메인 연결

1. Vercel Dashboard → **ApcH 프로젝트 선택** → 좌측 사이드바의 **Domains** 탭 클릭
2. 우측 상단 **"Add Existing"** (또는 검색창 우측 버튼) 클릭
3. 검색창에 `a-pch.com` 입력 및 추가
4. 이미 Vercel에서 소유한 도메인이므로 **DNS 자동 설정 완료** (`Valid Configuration` 상태로 전환됨)
5. 도메인 우측 **[Edit]** 버튼을 눌러 **Connect to an environment**가 **Production**으로 설정되어 있는지 확인
6. **Let's Encrypt SSL 인증서 자동 발급** 대기 (수 분 이내, `Valid Configuration` 확인)

#### 1-4. www 서브도메인 연결 & Redirect 설정

1. 동일 화면에서 `www.a-pch.com` 도메인도 추가합니다.
2. 추가 후 `www.a-pch.com` 우측의 **[Edit]** 버튼을 클릭합니다.
3. 리다이렉트 설정을 위해 **Redirect to Another Domain**을 선택합니다.
4. 옵션으로 **308 Permanent Redirect**를 선택하고 목적지 드롭다운(돋보기 아이콘)에 `a-pch.com`을 선택합니다.
5. **Save**를 클릭하여 저장합니다.

> Apex(`a-pch.com`) ↔ www(`www.a-pch.com`) 중 **하나를 Primary로 고정**하고 다른 쪽은 308로 리다이렉트하는 것이 SEO·쿠키 관리상 표준. 본 제안서는 **apex를 Primary**로 지정한다.
> 💡 *참고: 최신 Vercel UI에서는 명시적인 "Set as Primary Domain" 버튼이 없으며, 이처럼 www 측에 308 리다이렉트를 걸어주면 a-pch.com이 자연스럽게 Primary 도메인의 역할을 하게 된다.*

#### 1-6. Phase 1 종료 시점의 관측 가능한 상태

- `https://a-pch.com` → Vercel 배포된 프로젝트의 현재 Production 빌드가 서빙됨
- **단**, 이 시점에서도 HTML의 `<link rel="canonical">`, `<meta og:url>`, `sitemap.xml`, Google OAuth redirect는 여전히 `apc-h.vercel.app`을 가리킨다 → Phase 4·5에서 해결

---

### Phase 2: 외부 서비스에 "신 도메인 추가" (구 도메인 유지)

**2-1. Google Cloud Console** (APIs & Services → Credentials → OAuth 2.0 클라이언트 ID) 완료

- **Authorized JavaScript origins**에 추가(기존 값 유지, 병렬 운영):
  - `https://a-pch.com`
- **Authorized redirect URIs**에 추가:
  - `https://a-pch.com/api/auth/callback/google`
- **OAuth 동의 화면 → Authorized domains**에 `a-pch.com` 추가.

> 이 변경은 Phase 5 이전에 완료되어야 한다. 누락 시 `redirect_uri_mismatch` 에러로 Google 로그인이 전부 실패한다.

**2-2. Polar.sh**

- Polar 대시보드는 Webhook URL이 **단일 엔드포인트**이므로 "병렬 운영"이 구조적으로 불가능하다. **Phase 5 직전**에 단일 원자적 교체를 수행한다. (지금은 건드리지 않는다.)

---

### Phase 3: (스킵) DNS 레지스트라 설정

> 본 케이스는 Vercel 구매이므로 **Phase 3은 해당 없음**. 외부 레지스트라 구매 케이스의 절차는 §부록 A 참조.

---

### Phase 4: 코드 배포 (§5 참조)

§5의 **코드 변경**을 feature 브랜치에서 작업 → PR → `main` 머지 → Vercel 자동 배포.

> 이 커밋은 **환경 변수 교체 없이 배포해도 안전**하도록 설계된다(폴백 상수만 `a-pch.com`으로 바뀌며, 실제 런타임 값은 여전히 Vercel env의 `apc-h.vercel.app`이 우선). 즉 Phase 4와 Phase 5 사이에 얼마든지 시간 간격을 둘 수 있다.

### Phase 5: Vercel 환경 변수 교체 + Polar Webhook 원자적 전환

1. Vercel → **Settings → Environment Variables** → Production:
   - `NEXT_PUBLIC_SITE_URL` = `https://a-pch.com` (trailing slash **없음**)
   - `AUTH_URL` = `https://a-pch.com`
2. **"Redeploy"** 트리거 (환경 변수 변경은 재배포 전엔 반영되지 않는다)
3. 재배포 완료 직후 → **Polar Dashboard → Webhooks → Endpoint URL**을 `https://a-pch.com/api/webhooks/polar`로 수정
   - 교체 직전·직후 수 분간 결제 이벤트가 누락될 수 있다. 사용자 트래픽이 적은 시간대에 수행 권장.
   - 교체 후 Polar의 "Send test event" 기능으로 수신 확인.

### Phase 6: 검증 (§7 체크리스트 수행)

### Phase 7 (선택): 구 도메인 정리

- **Google OAuth**: `apc-h.vercel.app` 관련 JS origin / redirect URI 제거(필요시). `localhost:3000`은 개발용이므로 유지.
- **Vercel 도메인**: `apc-h.vercel.app`은 프로젝트에 영구 부착되어 제거 불가. 대신 Vercel **Redirect**를 설정해 `*.vercel.app` → `a-pch.com`으로 301 리다이렉트(SEO 권한 이전).
- **Google Search Console**: 신규 속성 `https://a-pch.com` 등록 → Sitemap 제출 → `apc-h.vercel.app` 속성에서 **Change of Address** 도구 실행.

---

## 4. 외부 서비스 구체 설정 값

### 4.1 Vercel 도메인 연결 (본 케이스)

| 위치 | 작업 | 세부 값 |
|---|---|---|
| Account/Team → Domains | 소유권 확인 | `a-pch.com` "Owned by you" 상태 + 같은 Scope |
| Project → 사이드바 Domains | Add Existing | `a-pch.com` 추가 후 Production 바인딩 확인 |
| Project → 사이드바 Domains | www 리다이렉트 | `www.a-pch.com` 우측 [Edit] → Redirect to `a-pch.com` (308) |
| 자동 발급 | SSL | Let's Encrypt (Vercel 자동, 수 분 이내) |

> **DNS 레지스트라 수동 입력은 불필요**. Nameserver가 `ns1/ns2.vercel-dns.com`으로 Vercel 자동 관리되므로 A/CNAME 레코드는 "Add Domain" 시점에 Vercel이 내부적으로 자동 주입한다.

### 4.2 Vercel Environment Variables (Production)

| 변수명 | 값 | 환경 |
|---|---|---|
| `NEXT_PUBLIC_SITE_URL` | `https://a-pch.com` | Production |
| `AUTH_URL` | `https://a-pch.com` | Production |

> Preview 환경은 변경 불필요. Preview는 각 배포마다 고유 URL을 가지므로 `NEXT_PUBLIC_SITE_URL`을 설정하지 않거나 비워두는 것이 권장(Modal 콜백이 동기 모드로 폴백됨 — `inngest/functions.ts:83` 참고).
> Development는 그대로 `http://localhost:3000`.

### 4.3 Google Cloud Console — OAuth 2.0 Client

**Authorized JavaScript origins** (모두 유지):
- `http://localhost:3000`
- `https://apc-h.vercel.app` (Phase 7까지 병렬 유지)
- `https://a-pch.com` ← **신규**

**Authorized redirect URIs**:
- `http://localhost:3000/api/auth/callback/google`
- `https://apc-h.vercel.app/api/auth/callback/google` (Phase 7까지 병렬 유지)
- `https://a-pch.com/api/auth/callback/google` ← **신규**

**OAuth 동의 화면 → Authorized domains**:
- `a-pch.com` 추가

### 4.4 Polar.sh Webhook

- Endpoint URL: `https://a-pch.com/api/webhooks/polar`
- 기존 Webhook Secret(`POLAR_WEBHOOK_SECRET_PROD`)은 URL만 교체하면 **재생성 불필요**하다. 서명 검증은 서명 키에 의존하며 URL과 독립적.

### 4.5 Google Search Console

1. 신규 속성 추가: URL prefix 방식으로 `https://a-pch.com`
2. 소유권 확인: HTML 태그 방식 → 토큰을 `src/app/layout.tsx`의 `metadata.verification.google`에 추가 (seo-search-visibility-proposal §4.5 참고)
3. Sitemaps → `https://a-pch.com/sitemap.xml` 제출
4. URL 검사 도구로 홈페이지 색인 요청
5. `apc-h.vercel.app` 속성 → **Change of Address** 도구로 `a-pch.com`으로 이전

---

## 5. 코드 변경 상세

### 5.1 [신규] `src/fsd/shared/lib/site.ts`

4개 파일에 중복된 `SITE_URL` 선언을 단일 모듈로 통합하고, trailing-slash 버그를 원천 차단한다. (`seo-search-visibility-proposal.md` §4.3과 동일 방향.)

```ts
// src/fsd/shared/lib/site.ts
/**
 * 사이트 전역 URL 상수 및 유틸리티.
 * 환경 변수 `NEXT_PUBLIC_SITE_URL`이 후행 슬래시를 포함하더라도 안전하게 정규화한다.
 */
export const SITE_URL = (
  process.env.NEXT_PUBLIC_SITE_URL?.trim() ?? "https://a-pch.com"
).replace(/\/+$/, "");

export const SITE_NAME = "AI Podcast Clipper";

/**
 * 경로를 SITE_URL에 안전하게 결합한다.
 * @example buildUrl("/terms") // => "https://a-pch.com/terms"
 */
export const buildUrl = (path: string): string =>
  new URL(path, `${SITE_URL}/`).toString();
```

### 5.2 [수정] `src/app/layout.tsx`

```diff
-const SITE_URL =
-  process.env.NEXT_PUBLIC_SITE_URL?.trim() ?? "https://apc-h.vercel.app/";
-const SITE_NAME = "AI Podcast Clipper";
+import { SITE_URL, SITE_NAME, buildUrl } from "~/fsd/shared/lib/site";
```

그리고 `canonical: SITE_URL`, `openGraph.url: SITE_URL`은 그대로 두되, 후행 슬래시가 제거된 값이 들어가므로 `metadataBase: new URL(SITE_URL)`는 계속 정상 동작한다.

### 5.3 [수정] `src/app/sitemap.ts`

```diff
-const SITE_URL =
-  process.env.NEXT_PUBLIC_SITE_URL?.trim() ?? "https://apc-h.vercel.app/";
+import { buildUrl } from "~/fsd/shared/lib/site";
 ...
-    { url: SITE_URL,            lastModified: LAST_UPDATED, ... },
-    { url: `${SITE_URL}terms`,  lastModified: LAST_UPDATED, ... },   // ❌ 슬래시 누락 버그
-    { url: `${SITE_URL}privacy`, lastModified: LAST_UPDATED, ... },  // ❌ 슬래시 누락 버그
+    { url: buildUrl("/"),        lastModified: LAST_UPDATED, ... },
+    { url: buildUrl("/terms"),   lastModified: LAST_UPDATED, ... },
+    { url: buildUrl("/privacy"), lastModified: LAST_UPDATED, ... },
```

### 5.4 [수정] `src/app/robots.ts`

```diff
-const SITE_URL =
-  process.env.NEXT_PUBLIC_SITE_URL?.trim() ?? "https://apc-h.vercel.app/";
+import { SITE_URL } from "~/fsd/shared/lib/site";
 ...
-    sitemap: `${SITE_URL}/sitemap.xml`,   // ❌ env에 후행 슬래시가 있을 경우 //sitemap.xml
+    sitemap: `${SITE_URL}/sitemap.xml`,   // ✅ SITE_URL은 정규화되어 슬래시 없음
```

### 5.5 [수정] `src/fsd/shared/lib/seo.ts`

```diff
-const SITE_URL =
-  process.env.NEXT_PUBLIC_SITE_URL?.trim() ?? "https://apc-h.vercel.app/";
-const SITE_NAME = "AI Podcast Clipper";
+import { SITE_URL, SITE_NAME, buildUrl } from "./site";
 ...
-    screenshot: `${SITE_URL}/og-image.png`,
+    screenshot: buildUrl("/og-image.png"),
```

### 5.6 [수정] `src/app/api/checkout/route.ts`

```diff
+import { SITE_URL } from "~/fsd/shared/lib/site";
 ...
 const getBaseUrl = () => {
   if (env.NODE_ENV === "development") {
     return "http://localhost:3000";
   }
-  return env.NEXT_PUBLIC_SITE_URL ?? "https://apc-h.vercel.app";
+  return SITE_URL;
 };
```

### 5.7 [수정] `.env.example`

```diff
-AUTH_URL=""                          # Production: https://podcastclipper.com
+AUTH_URL=""                          # Production: https://a-pch.com

-NEXT_PUBLIC_SITE_URL="http://localhost:3000"
+NEXT_PUBLIC_SITE_URL="http://localhost:3000"  # Production: https://a-pch.com (후행 슬래시 없음)
```

### 5.8 배포 전 로컬 검증 명령

```bash
npm run check          # lint + typecheck
npm run build          # 환경 변수 검증 포함 (env.js 스키마)
```

> Windows 개발 환경에서 `Edit`/`Write` 도구 사용 시 파일 경로는 반드시 백슬래시(`\`)를 사용한다 (`CLAUDE.md` 경고 참조).

---

## 6. 불변(선택) 변경 및 후속 작업

### 6.1 `metadata.verification` 추가
Google Search Console 소유권 확인 토큰을 `src/app/layout.tsx`의 `metadata` 객체에 추가:

```ts
verification: {
  google: "<GSC 발급 토큰>",
},
```

### 6.2 연락처 이메일 전환 (선택)
`src/app/privacy/page.tsx:42, 362` — 현재 `hamsoo159@gmail.com`. 필요 시 도메인 기반 주소(`contact@a-pch.com` 등)로 교체하려면 도메인 메일 서비스(Google Workspace, Cloudflare Email Routing 등) 별도 설정이 필요하다. **현 단계 필수 아님.**

### 6.3 레거시 문서 용어 정정
`podcastclipper.com`이 남아있는 **문서** 6개는 본 이전이 완료된 시점에 일괄 `a-pch.com`으로 치환하는 것이 깨끗하다. 코드 동작엔 영향 없으므로 별도 PR로 분리.

### 6.4 CloudFront CDN 서브도메인 (장기)
`cloudfront-cdn-setup-guide.md`가 `cdn.podcastclipper.com`을 전제한다. CDN 도입 시 `cdn.a-pch.com`으로 교체하고, CNAME 레코드와 ACM 인증서(us-east-1) 발급을 병행한다. **지금은 불필요.**

---

## 7. 검증 체크리스트

### 7.1 Phase별 중간 검증 (Phase 1 완료됨)

- [x] **Phase 1-1**: Vercel Account/Team → Domains에 `a-pch.com`이 "Owned by you"로 표시됨
- [x] **Phase 1-3**: Project → 사이드바 Domains에서 `a-pch.com` **"Valid Configuration"** 상태
- [x] **Phase 1-3**: `dig a-pch.com`(또는 `nslookup`)으로 Vercel IP 응답 확인 (Vercel 자동 관리된 A 레코드)
- [x] **Phase 1-3**: `https://a-pch.com`에 브라우저 자물쇠(SSL) 정상 표시
- [x] **Phase 1-4**: `https://www.a-pch.com` → `https://a-pch.com` 308 리다이렉트 동작
- [ ] **Phase 2**: Google Cloud Console에서 신규 redirect URI가 리스트에 **표시**됨
- [ ] **Phase 4**: `npm run build`가 env 검증 포함하여 로컬에서 성공

### 7.2 Phase 5 재배포 직후 필수 검증

- [ ] `curl -I https://a-pch.com/` → `200 OK`, `x-robots-tag` 없음
- [ ] `curl -s https://a-pch.com/sitemap.xml | grep -E "loc"` →
      `/terms`, `/privacy`가 **슬래시 포함된 정상 URL**로 출력(기존 버그 수정 확인)
- [ ] `curl -s https://a-pch.com/robots.txt | grep Sitemap` →
      `https://a-pch.com/sitemap.xml` (이중 슬래시 없음)
- [ ] 브라우저 개발자 도구에서 홈페이지 HTML의 `<link rel="canonical">` 값이 `https://a-pch.com`
- [ ] **Google 로그인** 전체 플로우 → 대시보드 진입까지 성공
- [ ] **Polar 결제 플로우** → `success_url`이 `https://a-pch.com/dashboard/billing?...`으로 리다이렉트
- [ ] **Polar Webhook** → Polar 대시보드에서 "Send test event" → 200 OK
- [ ] **Modal 비동기 콜백** → 실제 업로드 → 처리 완료 시 clip 생성 DB 기록 정상(`inngest/functions.ts`의 `callback_url`이 새 도메인으로 조립됨)
- [ ] **Inngest 대시보드 싱크** → [app.inngest.com](https://app.inngest.com) → 해당 앱의 "Apps" 또는 "Functions" 탭에서 가장 최근 배포 커밋 해시가 반영됨. 미반영 시 수동 "Sync new deploy" 클릭
- [ ] **Inngest 이벤트 발송** → 업로드 트리거 후 Inngest 대시보드의 "Runs" 탭에서 `process-video-events`가 수신·실행됨
- [ ] **Inngest → Serve endpoint 호출** → 업로드 시 `/api/inngest`로의 요청이 200 OK (Vercel Logs에서 확인)
- [ ] `https://www.a-pch.com` → `https://a-pch.com` 301 리다이렉트
- [ ] `https://apc-h.vercel.app/` → (Phase 7 이후) `https://a-pch.com` 301 리다이렉트

### 7.3 Phase 6~7 장기 검증

- [ ] GSC: `https://a-pch.com` 속성에서 Sitemap "성공" 상태
- [ ] GSC: URL 검사 → "색인 생성 가능"
- [ ] Rich Results Test → `WebApplication` JSON-LD 유효
- [ ] `site:a-pch.com` 구글 검색 결과 노출(수일~2주)

---

## 8. 리스크 및 주의사항

| 리스크 | 원인 | 완화책 |
|---|---|---|
| Google 로그인 전면 실패 | Phase 5에서 `AUTH_URL` 교체 시 Google에 redirect URI 미등록 | **Phase 2에서 선제 등록** → Phase 5에서 env 교체 순서 준수 |
| 결제 Webhook 누락 | Polar 단일 엔드포인트 구조로 병렬 운영 불가 | **Phase 5 재배포 직후** 수 분 내 원자적 URL 교체, 트래픽 적은 시간대 수행 |
| sitemap 재버그 | 새 env 값에 후행 슬래시가 포함될 경우 | `site.ts`의 `.replace(/\/+$/, "")`로 원천 차단 — **env 설정 시 트레일링 슬래시 없이 입력 엄수** |
| 도메인 Scope 불일치 | Vercel 도메인 구매 Scope(개인/Team)와 프로젝트 Scope가 다름 | Phase 1-2에서 Domain Transfer 또는 Project Transfer로 정렬 |
| DNS 전파 지연 | 외부 레지스트라 케이스 한정 | 본 케이스(Vercel 구매)에서는 발생 안 함. 외부 레지스트라라면 부록 A의 Phase A1을 Phase 3보다 선행 |
| Preview 배포에서 `callback_url` 오류 | Preview에 `NEXT_PUBLIC_SITE_URL`을 설정하면 Modal이 Preview 도메인으로 콜백 → Modal이 Preview 특유의 보호로 접근 불가 가능 | Preview에는 `NEXT_PUBLIC_SITE_URL` **비워둠** → 동기 모드로 폴백 (`inngest/functions.ts:83`) |
| `apc-h.vercel.app` SEO 잔존 | Vercel 자동 도메인은 삭제 불가 | Vercel Redirect로 301 설정 + GSC Change of Address 도구로 권한 이전 |
| `metadataBase`의 trailing slash 재발 | 향후 누군가 `NEXT_PUBLIC_SITE_URL`을 수동으로 바꿀 때 | `.env.example`에 "후행 슬래시 없음" 주석 명시(§5.7) + `site.ts`에서 정규화 |

---

## 9. 작업 체크리스트 (실행용)

### 사전
- [ ] 본 제안서 검토 및 승인

### Phase 1: Vercel 도메인 연결 (완료 🎉)
- [x] Vercel Account/Team → Domains에서 `a-pch.com` 소유 및 Scope 확인
- [x] (필요 시) Domain Transfer 또는 Project Transfer로 Scope 정렬
- [x] ApcH 프로젝트 → 좌측 사이드바 Domains → **Add Existing** `a-pch.com`
- [x] "Valid Configuration" 상태 확인 (수 분 이내)
- [x] `www.a-pch.com` 우측 **[Edit]** → Redirect to `a-pch.com` (308)
- [x] SSL(Let's Encrypt) `Valid Configuration` 상태 확인
- [x] 브라우저에서 `https://a-pch.com` 접속 → 현재 Production 빌드 서빙 확인

### Phase 2: 외부 서비스(병렬)
- [ ] Google Cloud Console: JS origin에 `https://a-pch.com` 추가
- [ ] Google Cloud Console: redirect URI에 `https://a-pch.com/api/auth/callback/google` 추가
- [ ] Google Cloud Console: OAuth 동의 화면에 `a-pch.com` 추가

### Phase 3: (스킵) DNS 레지스트라 — 본 케이스 해당 없음

### Phase 4: 코드
- [ ] §5.1 `src/fsd/shared/lib/site.ts` 신규 생성
- [ ] §5.2 `src/app/layout.tsx` 수정
- [ ] §5.3 `src/app/sitemap.ts` 수정 (trailing slash 버그 동반 수정)
- [ ] §5.4 `src/app/robots.ts` 수정
- [ ] §5.5 `src/fsd/shared/lib/seo.ts` 수정
- [ ] §5.6 `src/app/api/checkout/route.ts` 수정
- [ ] §5.7 `.env.example` 주석 수정
- [ ] `npm run check && npm run build` 로컬 통과
- [ ] PR 생성 → 리뷰 → `main` 머지 → Vercel 자동 배포 확인

### Phase 5: 환경 변수 교체 (원자적 이벤트)
- [ ] Vercel Production `NEXT_PUBLIC_SITE_URL` = `https://a-pch.com` 설정
- [ ] Vercel Production `AUTH_URL` = `https://a-pch.com` 설정
- [ ] "Redeploy" 트리거
- [ ] 재배포 완료 직후 Polar Webhook URL을 `https://a-pch.com/api/webhooks/polar`로 교체
- [ ] Polar "Send test event" → 200 OK

### Phase 6: 검증 (§7 수행)
- [ ] §7.1, §7.2 전체 체크

### Phase 7: 정리
- [ ] Vercel에 `apc-h.vercel.app` → `a-pch.com` 301 Redirect 추가
- [ ] GSC 신규 속성 등록 + Sitemap 제출 + 색인 요청
- [ ] GSC Change of Address 도구 실행
- [ ] (시간차 후) Google OAuth에서 `apc-h.vercel.app` 관련 URI 제거
- [ ] 레거시 문서 내 `podcastclipper.com` → `a-pch.com` 일괄 정정(별도 PR)

---

## 10. 결론

`a-pch.com` 전환은 **단일 env 변수 교체로 끝나는 작업이 아니라**, (a) 4-way 하드코딩 제거 및 trailing-slash 버그 동반 수정, (b) Vercel 도메인/env/재배포 3 연동, (c) Google OAuth·Polar·GSC 3-방향 외부 서비스 동기화가 얽힌 **크로스-레이어 이벤트**이다.

본 제안서의 **Phase 1→2→3→4→5→6→7** 순서를 준수하면 Google 로그인·Polar 결제·Modal 비동기 처리·SEO 어느 하나도 끊김 없이 무중단 전환이 가능하다. 또한 이 작업은 `seo-search-visibility-proposal.md` §4.1~§4.4에서 이미 제안된 "sitemap/robots URL 조립 버그 수정 + SITE_URL 단일 모듈화"를 **도메인 전환 PR에 번들**하여 한 번에 해결한다.

**가장 중요한 단일 실수 포인트**: Phase 5에서 `NEXT_PUBLIC_SITE_URL` 값을 Vercel env에 **후행 슬래시 없이** 입력할 것. 이것만 지키면 나머지 버그는 `site.ts`의 정규화 로직이 대신 막아준다.

---

## 부록 A. 외부 레지스트라에서 구매한 경우의 대체 절차

> 본 케이스(Vercel 구매)에는 해당되지 않는다. 향후 다른 도메인을 Namecheap, Cloudflare Registrar, GoDaddy 등 **외부에서 구매**했을 때를 위한 참고용 절차.

### Phase A1. DNS 레지스트라 레코드 입력

도메인 관리 콘솔에서 다음 레코드 추가:

| 타입 | 이름 | 값 | 용도 |
|------|------|-----|------|
| A | `@` | `76.76.21.21` | 루트 도메인 → Vercel |
| CNAME | `www` | `cname.vercel-dns.com` | `www` → Vercel |

- DNS 전파는 수 분 ~ 최대 48시간 소요.
- `dig a-pch.com`으로 응답 IP가 `76.76.21.21`인지 확인 후 Phase A2 진행.

### Phase A2. Vercel Project → Settings → Domains → Add Domain

1. `Add Domain` → `a-pch.com` 입력
2. Vercel이 DNS를 검증 → 성공 시 `Valid Configuration`
3. 실패 시 안내받은 TXT 레코드(소유권 검증)를 레지스트라에 추가 후 재검증

### Phase A3. (대안) Nameserver를 Vercel로 위임

외부 레지스트라에서 구매했더라도 Nameserver를 `ns1.vercel-dns.com` / `ns2.vercel-dns.com`으로 변경하면 이후 DNS 관리를 Vercel에서 할 수 있다. 이 경우 이후 절차는 본 제안서의 Phase 1과 동일해진다.

### Phase A4 이후

Phase 2 ~ Phase 7은 본 제안서와 동일.

---

## 부록 B. 참고 자료

- Vercel Docs — [Adding a domain you own](https://vercel.com/docs/projects/domains/add-a-domain)
- Vercel Docs — [Domains purchased through Vercel](https://vercel.com/docs/projects/domains/working-with-domains/buy-a-domain)
- Vercel Docs — [Transferring a domain to another team](https://vercel.com/docs/projects/domains/working-with-domains/transfer-a-domain)
- Auth.js v5 — [Trust Host / AUTH_URL](https://authjs.dev/reference/core#authconfig)
- Polar — [Webhook configuration](https://docs.polar.sh/integrate/webhooks)
