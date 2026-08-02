# AI Podcast Clipper - SaaS 배포 체크리스트

> 최종 업데이트: 2026-03-30
> 프로젝트: AI Podcast Clipper Frontend (Next.js 15 / T3 Stack)

## 요약

현재 프로젝트는 MVP 수준으로 핵심 기능(업로드 → 영상 처리 → 클립 관리)은 동작하나, 프로덕션 SaaS 배포에 필수적인 인프라, 보안, 결제 등이 부재합니다.

### 우선순위별 항목 요약

| # | 항목 | 우선순위 | 카테고리 | 진행 상태 | 예상 공수 |
|---|------|----------|----------|-----------|-----------|
| 1 | SQLite → PostgreSQL 마이그레이션 | 🚨 CRITICAL | 인프라 | ✅ 완료 (Neon PostgreSQL) | - |
| 2 | Server Action 인가 누락 수정 | 🚨 CRITICAL | 보안 | ✅ 완료 (requireAuth 적용) | - |
| 3 | Polar 결제 구현 | 🚨 CRITICAL | 결제 | ✅ 완료 (SDK + Webhook + Billing 페이지) | - |
| 4 | 배포 인프라 구성 | 🚨 CRITICAL | 인프라 | 🔶 부분 완료 (Vercel만, CI/CD 없음) | 0.5-1일 |
| 5 | 에러 바운더리 구현 | 🚨 CRITICAL | 에러 처리 | ✅ 완료 (error/not-found/global-error) | - |
| 6 | 환경 변수 보안 강화 | 🚨 CRITICAL | 보안 | ✅ 완료 (.env.example + Zod 검증) | - |
| 7 | 인증 체계 강화 | 🔴 HIGH | 보안 | ✅ 완료 (Google OAuth 추가) | - |
| 8 | Inngest 프로덕션 설정 | 🔴 HIGH | 인프라 | ✅ 완료 (retries: 3, concurrency 설정) | - |
| 9 | 법적 페이지 작성 | 🔴 HIGH | 법적 | ❌ 미완료 | 1-2일 |
| 10 | CDN 구성 | 🔴 HIGH | 성능 | 🔶 부분 완료 (env 정의됨, 미적용) | 0.5일 |
| 11 | SEO 최적화 | 🟡 MEDIUM | SEO | ✅ 완료 (메타데이터 + sitemap + robots) | - |
| 12 | 사용자 관리 기능 | 🟡 MEDIUM | UI/UX | ❌ 미완료 | 2-3일 |
| 13 | 보안 헤더 설정 | 🟡 MEDIUM | 보안 | ✅ 완료 (CSP + HSTS + 전체 헤더) | - |
| 14 | 성능 최적화 | 🟡 MEDIUM | 성능 | ❌ 미완료 | 1-2일 |

---

## 1. 인프라 & 배포

### 1.1 SQLite → PostgreSQL 마이그레이션 ✅ 완료

- **현재 상태**: Neon PostgreSQL로 마이그레이션 완료. `@prisma/adapter-neon` 사용, pooled/unpooled 연결 지원.
- **완료 작업**:
  - [x] Prisma schema에서 `provider`를 `"postgresql"`로 변경
  - [x] `DATABASE_URL`을 PostgreSQL 연결 문자열로 교체 (Neon)
  - [x] 데이터 타입 호환성 확인 (DateTime, Boolean 등)
  - [x] `@default(autoincrement())` → `@default(cuid())` 또는 UUID 검토
  - [x] 마이그레이션 실행 및 기존 데이터 이관 스크립트 작성
- **관련 파일**: `prisma/schema.prisma`, `src/env.js`

### 1.2 배포 인프라 구성 🔶 부분 완료

- **현재 상태**: Vercel 배포 구성 완료 (`vercel.json` + region: icn1). CI/CD 파이프라인 미구성.
- **완료 작업**:
  - [x] 배포 플랫폼 선정 (Vercel)
  - [x] `vercel.json` 설정 파일 작성 (framework: nextjs, regions: icn1)
  - [x] 환경별 설정 분리 (development / staging / production)
  - [x] 도메인 및 SSL 인증서 설정
- **잔여 작업**:
  - [ ] GitHub Actions CI/CD 파이프라인 구성
    - lint/typecheck → build → deploy
    - staging/production 브랜치 전략
- **관련 파일**: `vercel.json`
- **잔여 공수**: 0.5-1일

### 1.3 Inngest 프로덕션 설정 ✅ 완료

- **현재 상태**: retries: 3, userId 기준 동시성 제한, cancelOn 지원 구성 완료.
- **완료 작업**:
  - [x] retries 횟수 증가 (3회)
  - [x] Inngest Cloud 연동 (프로덕션 환경 — INNGEST_EVENT_KEY, INNGEST_SIGNING_KEY)
  - [x] 동시성 설정 (userId 기준 1건 제한)
  - [x] cancelOn 이벤트 취소 지원
- **참고**: 상세 프로덕션 감사는 `inngest-production-audit.md` 참조
- **관련 파일**: `src/inngest/functions.ts`, `src/inngest/client.ts`

---

## 2. 보안 & 인증

### 2.1 Server Action 인가 누락 수정 ✅ 완료

- **현재 상태**: 모든 Server Action에 `requireAuth()` 또는 `auth()` 적용 완료. 공통 인가 헬퍼 `requireAuth()` 구현됨.
- **완료 작업**:
  - [x] 누락된 Server Action에 `requireAuth()` 체크 추가
  - [x] 리소스 소유자 검증 (userId 매칭 확인)
  - [x] 모든 Server Action에 대한 인가 감사 수행
  - [x] 공통 인가 헬퍼 함수 작성 (`src/fsd/shared/api/auth-guard.ts`)
- **관련 파일**: `src/fsd/features/upload/api/index.ts`, `src/fsd/features/clip/api/index.ts`, `src/fsd/shared/api/auth-guard.ts`

### 2.2 환경 변수 보안 강화 ✅ 완료

- **현재 상태**: `.env.example` 작성 완료. `src/env.js`에 Zod 스키마로 모든 환경 변수 타입-안전 검증. Vercel 시크릿 관리 사용.
- **완료 작업**:
  - [x] 프로덕션 환경변수는 배포 플랫폼의 시크릿 관리 사용 (Vercel)
  - [x] `.env.example` 파일 작성 (실제 값 없이 키 이름만)
  - [x] `src/env.js`에 Polar, Inngest, CloudFront 등 환경 변수 추가
- **관련 파일**: `.env.example`, `src/env.js`

### 2.3 인증 체계 강화 ✅ 완료

- **현재 상태**: Google OAuth 추가 완료. Credentials + Google 이중 인증 지원. JWT 세션 전략.
- **완료 작업**:
  - [x] OAuth 프로바이더 추가 (Google)
  - [x] 이메일 계정 연결 허용 (`allowDangerousEmailAccountLinking`)
  - [x] JWT 세션 전략 및 콜백 설정
- **관련 파일**: `src/server/auth/config.ts`

### 2.4 보안 헤더 설정 ✅ 완료

- **현재 상태**: `next.config.js`에 포괄적 보안 헤더 구성 완료. 개발 환경에서는 CSP 비활성화.
- **완료 작업**:
  - [x] Content Security Policy (CSP) 헤더 설정 (Polar, S3, Neon, Inngest 등 허용)
  - [x] `X-Frame-Options: DENY` 설정
  - [x] `X-Content-Type-Options: nosniff` 설정
  - [x] `Strict-Transport-Security` (HSTS) 설정 (63072000s, preload)
  - [x] `Referrer-Policy: strict-origin-when-cross-origin` 설정
  - [x] `Permissions-Policy` 설정 (camera, microphone, geolocation 비활성화)
- **관련 파일**: `next.config.js`

---

## 3. 결제 & 과금

### 3.1 Polar 결제 시스템 구현 ✅ 완료

- **현재 상태**: `@polar-sh/sdk` + `@polar-sh/nextjs` 연동 완료. Webhook, Billing 페이지, Subscription/Order 모델 구현됨.
- **완료 작업**:
  - [x] `@polar-sh/sdk` (v0.46.6) + `@polar-sh/nextjs` (v0.9.5) 설치
  - [x] Polar API 키를 `src/env.js`에 추가 (ACCESS_TOKEN, WEBHOOK_SECRET_DEV/PROD, POLAR_SERVER)
  - [x] Polar Webhook 핸들러 구현 (`/api/webhooks/polar/route.ts`)
    - `onSubscriptionCreated`, `onSubscriptionActive` 등 이벤트 처리
  - [x] `/dashboard/billing` 페이지 구현 (에러 바운더리 포함)
  - [x] `prisma/schema.prisma` User 모델에 `polarCustomerId` 필드 추가
  - [x] Subscription, Order 모델 추가
- **관련 파일**: `src/app/api/webhooks/polar/route.ts`, `src/app/dashboard/billing/`, `prisma/schema.prisma`

---

## 4. 에러 처리

### 4.1 에러 바운더리 구현 ✅ 완료

- **현재 상태**: 루트 및 주요 라우트별 에러 바운더리 전체 구현 완료.
- **완료 작업**:
  - [x] 루트 `app/error.tsx` (글로벌 에러 바운더리) 생성
  - [x] 루트 `app/not-found.tsx` (404 페이지) 생성
  - [x] 주요 라우트별 `error.tsx` 생성 (dashboard, billing, upload detail)
  - [x] `app/global-error.tsx` (루트 레이아웃 에러) 생성
- **관련 파일**: `src/app/error.tsx`, `src/app/not-found.tsx`, `src/app/global-error.tsx`, `src/app/dashboard/error.tsx`, `src/app/dashboard/billing/error.tsx`, `src/app/dashboard/uploads/[uploadedFileId]/error.tsx`

---

## 5. 성능 & SEO

### 5.1 CDN 구성 🔶 부분 완료

- **현재 상태**: CloudFront 환경 변수(`CLOUDFRONT_DOMAIN`, `CLOUDFRONT_KEY_PAIR_ID`, `CLOUDFRONT_PRIVATE_KEY`)가 `src/env.js`에 정의되어 있으나 optional. 현재 S3 직접 presigned URL 사용 중.
- **완료 작업**:
  - [x] CloudFront 환경 변수 스키마 정의 (`src/env.js`)
- **잔여 작업**:
  - [ ] CloudFront 배포 생성 (S3 Origin) 및 환경 변수 설정
  - [ ] Presigned URL 생성 시 CloudFront 도메인 사용으로 전환
  - [ ] OAI 설정으로 S3 직접 접근 차단
  - [ ] 캐싱 정책 설정 (클립 파일 TTL)
- **관련 파일**: `src/fsd/shared/api/s3.ts`, `src/env.js`
- **잔여 공수**: 0.5일

### 5.2 SEO 최적화 ✅ 완료

- **현재 상태**: 메타데이터, OG/Twitter Card, sitemap, robots 전체 구현 완료.
- **완료 작업**:
  - [x] `app/layout.tsx`에 메타데이터 강화 (title template, description, keywords 10개)
  - [x] Open Graph / Twitter Card 메타 태그 추가 (이미지, locale 포함)
  - [x] `app/sitemap.ts` 생성 (동적 사이트맵)
  - [x] `app/robots.ts` 생성 (dashboard, api, login 차단)
  - [x] googleBot 설정 (indexifembedded 등)
- **관련 파일**: `src/app/layout.tsx`, `src/app/sitemap.ts`, `src/app/robots.ts`

### 5.3 성능 최적화 🟡 MEDIUM

- **현재 상태**: 번들 분석, 이미지 최적화, 캐싱 전략 없음.
- **필요 작업**:
  - [ ] `@next/bundle-analyzer` 도입 및 번들 크기 분석
  - [ ] 동적 import / 코드 스플리팅 적용
  - [ ] Next.js Image 컴포넌트 활용 (이미지 최적화)
  - [ ] API 응답 캐싱 전략 수립 (ISR, SWR)
  - [ ] Core Web Vitals 측정 및 개선
  - [ ] 대용량 영상 업로드 시 프로그레스 바 및 청크 업로드 검토
- **관련 파일**: `next.config.js`, `package.json`
- **예상 공수**: 1-2일

---

## 6. UI/UX & 기능

### 6.1 사용자 관리 기능 🟡 MEDIUM

- **현재 상태**: 프로필 수정, 비밀번호 변경, 계정 삭제 불가.
- **필요 작업**:
  - [ ] `/dashboard/settings` 페이지 구현
    - 프로필 정보 수정 (이름, 이메일)
    - 비밀번호 변경
    - 계정 삭제 (GDPR 대응)
  - [ ] 프로필 이미지 업로드
  - [ ] 알림 설정 (이메일, 인앱)
  - [ ] 사용 내역 조회
- **관련 파일**: `src/app/dashboard/`, `prisma/schema.prisma`
- **예상 공수**: 2-3일

---

## 7. 법적 & 규정 준수

### 7.1 법적 페이지 작성 🔴 HIGH

- **현재 상태**: 이용약관(ToS), 개인정보 처리방침(Privacy Policy), 쿠키 동의(Cookie Consent) 모두 부재.
- **필요 작업**:
  - [ ] 이용약관 페이지 작성 (`/terms`)
  - [ ] 개인정보 처리방침 페이지 작성 (`/privacy`)
  - [ ] 쿠키 동의 배너 구현
  - [ ] GDPR 준수 검토 (데이터 삭제 요청 처리 등)
  - [ ] 회원가입 시 약관 동의 체크박스 추가
  - [ ] 법률 자문 검토
- **관련 파일**: `src/app/` (신규 라우트), 회원가입 폼
- **예상 공수**: 1-2일

---

## Phase별 배포 로드맵

### Phase 1: 출시 차단 해제 ✅ 완료

보안 및 인프라 기반을 갖추어 최소한의 프로덕션 배포 가능 상태를 만든다.

| 순서 | 항목 | 상태 |
|------|------|------|
| 1 | Server Action 인가 누락 수정 (#2) | ✅ 완료 |
| 2 | 환경 변수 보안 강화 (#6) | ✅ 완료 |
| 3 | SQLite → PostgreSQL 마이그레이션 (#1) | ✅ 완료 |
| 4 | 에러 바운더리 구현 (#5) | ✅ 완료 |
| 5 | 배포 인프라 구성 (#4) | 🔶 Vercel 완료, CI/CD 잔여 |
| 6 | 보안 헤더 설정 (#13) | ✅ 완료 |

### Phase 2: MVP 결제 연동 🔶 대부분 완료

수익화를 위한 결제 시스템과 법적 요건을 구축한다.

| 순서 | 항목 | 상태 |
|------|------|------|
| 1 | Polar 결제 시스템 구현 (#3) | ✅ 완료 |
| 2 | 법적 페이지 작성 (#9) | ❌ 미완료 (1-2일) |
| 3 | Inngest 프로덕션 설정 (#8) | ✅ 완료 |

### Phase 3: 안정화 & 품질 🔶 대부분 완료

서비스 안정성과 사용자 경험을 개선한다.

| 순서 | 항목 | 상태 |
|------|------|------|
| 1 | 인증 체계 강화 (#7) | ✅ 완료 |
| 2 | CDN 구성 (#10) | 🔶 부분 완료 (0.5일) |

### Phase 4: 성장 & 최적화 🔶 일부 완료

사용자 확보와 서비스 확장을 위한 기능을 추가한다.

| 순서 | 항목 | 상태 |
|------|------|------|
| 1 | SEO 최적화 (#11) | ✅ 완료 |
| 2 | 사용자 관리 기능 (#12) | ❌ 미완료 (2-3일) |
| 3 | 성능 최적화 (#14) | ❌ 미완료 (1-2일) |

---

## 전체 예상 일정

| Phase | 상태 | 잔여 공수 |
|-------|------|-----------|
| Phase 1: 출시 차단 해제 | ✅ 완료 (CI/CD만 잔여) | 0.5-1일 |
| Phase 2: MVP 결제 연동 | 🔶 대부분 완료 (법적 페이지 잔여) | 1-2일 |
| Phase 3: 안정화 & 품질 | 🔶 대부분 완료 (CDN 적용 잔여) | 0.5일 |
| Phase 4: 성장 & 최적화 | 🔶 일부 완료 (SEO 완료) | 3-5일 |
| **전체 잔여** | | **5-8.5일** |

> **진행률**: 14개 항목 중 9개 완료 (64%), 2개 부분 완료, 3개 미완료. 잔여 항목: CI/CD 파이프라인, 법적 페이지, CDN 적용, 사용자 관리, 성능 최적화.
