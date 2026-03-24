# AI Podcast Clipper - SaaS 배포 체크리스트

> 최종 업데이트: 2026-03-19
> 프로젝트: AI Podcast Clipper Frontend (Next.js 15 / T3 Stack)

## 요약

현재 프로젝트는 MVP 수준으로 핵심 기능(업로드 → 영상 처리 → 클립 관리)은 동작하나, 프로덕션 SaaS 배포에 필수적인 인프라, 보안, 결제, 모니터링 등이 부재합니다.

### 우선순위별 항목 요약

| # | 항목 | 우선순위 | 카테고리 | 현재 상태 | 예상 공수 |
|---|------|----------|----------|-----------|-----------|
| 1 | SQLite → PostgreSQL 마이그레이션 | 🚨 CRITICAL | 인프라 | SQLite 사용 중 | 1-2일 |
| 2 | Server Action 인가 누락 수정 | 🚨 CRITICAL | 보안 | auth() 미호출 | 0.5일 |
| 3 | Polar 결제 구현 | 🚨 CRITICAL | 결제 | 미구현 | 3-5일 |
| 4 | 배포 인프라 구성 | 🚨 CRITICAL | 인프라 | 미구성 | 1-2일 |
| 5 | 에러 바운더리 구현 | 🚨 CRITICAL | 에러 처리 | 없음 | 1일 |
| 6 | 환경 변수 보안 강화 | 🚨 CRITICAL | 보안 | .env 하드코딩 | 0.5일 |
| 7 | 인증 체계 강화 | 🔴 HIGH | 보안 | 기본 Credentials만 | 2-3일 |
| 8 | 모니터링 도입 | 🔴 HIGH | 모니터링 | console.log만 사용 | 1-2일 |
| 9 | Inngest 프로덕션 설정 | 🔴 HIGH | 인프라 | retries: 1, backoff 없음 | 1일 |
| 10 | 테스트 도입 | 🔴 HIGH | 테스트 | 테스트 0개 | 3-5일 |
| 11 | 법적 페이지 작성 | 🔴 HIGH | 법적 | 없음 | 1-2일 |
| 12 | CDN 구성 | 🔴 HIGH | 성능 | S3 직접 접근 | 1일 |
| 13 | SEO 최적화 | 🟡 MEDIUM | SEO | 메타데이터 최소한 | 1일 |
| 14 | 사용자 관리 기능 | 🟡 MEDIUM | UI/UX | 프로필 수정 불가 | 2-3일 |
| 15 | 보안 헤더 설정 | 🟡 MEDIUM | 보안 | next.config.js 비어 있음 | 0.5일 |
| 16 | i18n 다국어 지원 | 🟡 MEDIUM | UI/UX | 미지원 | 2-3일 |
| 17 | 성능 최적화 | 🟡 MEDIUM | 성능 | 번들 분석 없음 | 1-2일 |

---

## 1. 인프라 & 배포

### 1.1 SQLite → PostgreSQL 마이그레이션 🚨 CRITICAL

- **현재 상태**: `prisma/schema.prisma:10`에서 `provider = "sqlite"` 사용 중. SQLite는 동시 쓰기 제한, 수평 확장 불가, 서버리스 환경 비호환.
- **필요 작업**:
  - [ ] Prisma schema에서 `provider`를 `"postgresql"`로 변경
  - [ ] `DATABASE_URL`을 PostgreSQL 연결 문자열로 교체 (Neon, Supabase, AWS RDS 등)
  - [ ] 데이터 타입 호환성 확인 (DateTime, Boolean 등)
  - [ ] `@default(autoincrement())` → `@default(cuid())` 또는 UUID 검토
  - [ ] 마이그레이션 실행 및 기존 데이터 이관 스크립트 작성
- **관련 파일**: `prisma/schema.prisma`, `src/env.js`
- **예상 공수**: 1-2일

### 1.2 배포 인프라 구성 🚨 CRITICAL

- **현재 상태**: Dockerfile, CI/CD 파이프라인, `vercel.json` 모두 부재.
- **필요 작업**:
  - [ ] 배포 플랫폼 선정 (Vercel 권장 - Next.js 네이티브 지원)
  - [ ] `vercel.json` 설정 파일 작성 (환경 변수, 빌드 설정, 리다이렉트)
  - [ ] GitHub Actions CI/CD 파이프라인 구성
    - lint/typecheck → test → build → deploy
    - staging/production 브랜치 전략
  - [ ] 환경별 설정 분리 (development / staging / production)
  - [ ] 도메인 및 SSL 인증서 설정
- **관련 파일**: 없음 (신규 생성 필요)
- **예상 공수**: 1-2일

### 1.3 Inngest 프로덕션 설정 🔴 HIGH

- **현재 상태**: `src/inngest/functions.ts`에서 `retries: 1`, backoff 전략 없음, Dead Letter Queue(DLQ) 미구성.
- **필요 작업**:
  - [ ] retries 횟수 증가 (3-5회 권장)
  - [ ] 지수 백오프(exponential backoff) 설정
  - [ ] DLQ 구성으로 실패 이벤트 추적
  - [ ] Inngest Cloud 연동 (프로덕션 환경)
  - [ ] 동시성 설정 리뷰 (현재 userId 기준 1건 제한)
  - [ ] 타임아웃 설정 (영상 처리 시간 고려)
- **관련 파일**: `src/inngest/functions.ts`, `src/inngest/client.ts`
- **예상 공수**: 1일

---

## 2. 보안 & 인증

### 2.1 Server Action 인가 누락 수정 🚨 CRITICAL

- **현재 상태**: `src/fsd/features/upload/api/index.ts:126-171`의 `deleteUploadedFile`, `deleteUploadedFileWithClips` 함수에 `auth()` 체크 없음. 인증되지 않은 사용자가 파일 삭제 가능.
- **필요 작업**:
  - [ ] 누락된 Server Action에 `auth()` 체크 추가
  - [ ] 리소스 소유자 검증 (userId 매칭 확인)
  - [ ] 모든 Server Action에 대한 인가 감사 수행
  - [ ] 공통 인가 미들웨어/헬퍼 함수 작성 고려
- **관련 파일**: `src/fsd/features/upload/api/index.ts`, `src/actions/generation.ts`, `src/actions/s3.ts`, `src/actions/uploaded-files.ts`
- **예상 공수**: 0.5일

### 2.2 환경 변수 보안 강화 🚨 CRITICAL

- **현재 상태**: `.env` 파일에 AWS 키 등 시크릿이 하드코딩되어 있음. `.gitignore`에 포함되어 있지만 로컬 환경 보안 위험.
- **필요 작업**:
  - [ ] 프로덕션 환경변수는 배포 플랫폼의 시크릿 관리 사용
  - [ ] `.env.example` 파일 작성 (실제 값 없이 키 이름만)
  - [ ] `src/env.js`에 Polar 키 등 누락된 환경 변수 추가
  - [ ] AWS IAM 역할 기반 인증 검토 (액세스 키 대신)
  - [ ] 시크릿 로테이션 정책 수립
- **관련 파일**: `.env`, `src/env.js`, `.gitignore`
- **예상 공수**: 0.5일

### 2.3 인증 체계 강화 🔴 HIGH

- **현재 상태**: `src/server/auth/config.ts`에서 Credentials provider만 사용. 이메일 인증, 비밀번호 재설정, OAuth, Rate Limiting 없음.
- **필요 작업**:
  - [ ] OAuth 프로바이더 추가 (Google, GitHub 등)
  - [ ] 이메일 인증 플로우 구현 (회원가입 시 인증 이메일 발송)
  - [ ] 비밀번호 재설정 기능 구현
  - [ ] 로그인 시도 Rate Limiting 적용
  - [ ] 비밀번호 강도 검증 강화 (현재 최소 길이만 체크)
  - [ ] CSRF 보호 확인
  - [ ] 세션 만료 정책 수립
- **관련 파일**: `src/server/auth/config.ts`, `src/actions/auth.ts`, `src/fsd/entity/auth/model/schemas.ts`
- **예상 공수**: 2-3일

### 2.4 보안 헤더 설정 🟡 MEDIUM

- **현재 상태**: `next.config.js`가 비어 있음. CSP, X-Frame-Options, X-Content-Type-Options 등 미설정.
- **필요 작업**:
  - [ ] Content Security Policy (CSP) 헤더 설정
  - [ ] `X-Frame-Options: DENY` 설정
  - [ ] `X-Content-Type-Options: nosniff` 설정
  - [ ] `Strict-Transport-Security` (HSTS) 설정
  - [ ] `Referrer-Policy` 설정
  - [ ] `Permissions-Policy` 설정
- **관련 파일**: `next.config.js`
- **예상 공수**: 0.5일

---

## 3. 결제 & 과금

### 3.1 Polar 결제 시스템 구현 🚨 CRITICAL

- **현재 상태**: 결제 시스템 미구현. `/dashboard/billing` 링크만 존재. Polar(polar.sh)를 결제 플랫폼으로 사용하여 구독 및 크레딧 과금을 구현해야 함.
- **필요 작업**:
  - [ ] `@polar-sh/sdk` 패키지 설치
  - [ ] Polar API 키를 `src/env.js`에 추가 (POLAR_ACCESS_TOKEN, POLAR_WEBHOOK_SECRET)
  - [ ] Polar 대시보드에서 요금제(Product) 설계 및 생성
  - [ ] Polar Checkout 연동 구현 (결제 페이지 리다이렉트)
  - [ ] Polar Webhook 핸들러 구현 (`/api/webhooks/polar`)
    - `order.completed` → 크레딧 충전
    - `subscription.created` / `subscription.updated` → 구독 활성화/갱신
    - `subscription.canceled` → 구독 취소 처리
  - [ ] Polar 고객 포털 연동 (구독 관리, 결제 수단 변경)
  - [ ] `/dashboard/billing` 페이지 구현
    - 현재 플랜 표시
    - 크레딧 잔여량
    - 결제 히스토리
    - 플랜 업그레이드/다운그레이드
  - [ ] 크레딧 시스템과 Polar 연동 (현재: 기본 3 크레딧, 수동 관리)
  - [ ] `prisma/schema.prisma` User 모델에 `polarCustomerId` 필드 추가
  - [ ] 무료 체험 플로우 구현
- **관련 파일**: `prisma/schema.prisma`, `package.json`, `src/env.js`
- **예상 공수**: 3-5일

---

## 4. 모니터링 & 에러 처리

### 4.1 에러 바운더리 구현 🚨 CRITICAL

- **현재 상태**: `error.tsx`, `not-found.tsx` 파일 0개. 런타임 에러 발생 시 사용자에게 빈 화면이나 기본 Next.js 에러 페이지가 표시됨.
- **필요 작업**:
  - [ ] 루트 `app/error.tsx` (글로벌 에러 바운더리) 생성
  - [ ] 루트 `app/not-found.tsx` (404 페이지) 생성
  - [ ] 주요 라우트별 `error.tsx` 생성 (dashboard, upload 등)
  - [ ] `app/global-error.tsx` (루트 레이아웃 에러) 생성
  - [ ] 사용자 친화적 에러 메시지 및 복구 액션 제공
  - [ ] 에러 발생 시 자동 리포팅 (Sentry 연동)
- **관련 파일**: `src/app/` 디렉토리
- **예상 공수**: 1일

### 4.2 모니터링 & 에러 트래킹 도입 🔴 HIGH

- **현재 상태**: `console.log`만 사용 중. 에러 트래킹, APM, 로그 수집 도구 없음.
- **필요 작업**:
  - [ ] Sentry 도입 (에러 트래킹)
    - `@sentry/nextjs` 설치 및 설정
    - Server/Client 에러 자동 캡처
    - 소스맵 업로드 설정
  - [ ] 로그 수집 시스템 구성 (LogRocket, Datadog 등)
  - [ ] 헬스 체크 엔드포인트 구현 (`/api/health`)
  - [ ] Uptime 모니터링 설정 (UptimeRobot, Better Uptime 등)
  - [ ] 핵심 비즈니스 메트릭 대시보드
    - 일별 가입 수, 영상 처리 수, 크레딧 사용량
  - [ ] 알림 설정 (Slack, 이메일 - 에러 급증, 서비스 다운 시)
  - [ ] `console.log` → 구조화된 로깅으로 교체
- **관련 파일**: `next.config.js`, `src/app/layout.tsx`
- **예상 공수**: 1-2일

---

## 5. 성능 & SEO

### 5.1 CDN 구성 🔴 HIGH

- **현재 상태**: S3에 직접 접근하여 클립 제공. CloudFront 등 CDN 미구성.
- **필요 작업**:
  - [ ] CloudFront 배포 생성 (S3 Origin)
  - [ ] OAI(Origin Access Identity) 설정으로 S3 직접 접근 차단
  - [ ] 캐싱 정책 설정 (클립 파일 TTL)
  - [ ] Presigned URL 생성 시 CloudFront 도메인 사용
  - [ ] 커스텀 도메인 연결 (예: `cdn.example.com`)
- **관련 파일**: `src/actions/s3.ts`, `src/actions/generation.ts`
- **예상 공수**: 1일

### 5.2 SEO 최적화 🟡 MEDIUM

- **현재 상태**: 메타데이터 최소한. OG 태그, sitemap.xml, robots.txt 없음.
- **필요 작업**:
  - [ ] `app/layout.tsx`에 메타데이터 강화 (title, description, keywords)
  - [ ] Open Graph / Twitter Card 메타 태그 추가
  - [ ] `app/sitemap.ts` 생성 (동적 사이트맵)
  - [ ] `app/robots.ts` 생성
  - [ ] 구조화된 데이터(JSON-LD) 추가
  - [ ] 랜딩 페이지 SEO 최적화
- **관련 파일**: `src/app/layout.tsx`
- **예상 공수**: 1일

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

### 6.2 i18n 다국어 지원 🟡 MEDIUM

- **현재 상태**: UI가 영어/한국어 혼재. 체계적인 다국어 지원 없음.
- **필요 작업**:
  - [ ] `next-intl` 또는 `next-i18next` 도입
  - [ ] 메시지 파일 분리 (ko, en)
  - [ ] 언어 전환 UI 컴포넌트 추가
  - [ ] URL 기반 로케일 라우팅 설정
- **관련 파일**: `src/app/`, `next.config.js`
- **예상 공수**: 2-3일

---

## 7. 법적 & 규정 준수 / 테스트

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

### 7.2 테스트 도입 🔴 HIGH

- **현재 상태**: 테스트 파일 0개, 테스트 프레임워크 미설치.
- **필요 작업**:
  - [ ] Vitest + Testing Library 설치 및 설정
  - [ ] 단위 테스트 작성 (유틸리티, 스키마 검증)
  - [ ] 통합 테스트 작성 (Server Actions, API)
  - [ ] E2E 테스트 작성 (Playwright)
    - 회원가입/로그인 플로우
    - 파일 업로드 플로우
    - 클립 관리 플로우
  - [ ] CI에서 테스트 자동 실행 설정
  - [ ] 커버리지 리포트 생성 및 임계값 설정
- **관련 파일**: `package.json`, `vitest.config.ts` (신규)
- **예상 공수**: 3-5일

---

## Phase별 배포 로드맵

### Phase 1: 출시 차단 해제 (1-2주)

보안 및 인프라 기반을 갖추어 최소한의 프로덕션 배포 가능 상태를 만든다.

| 순서 | 항목 | 공수 |
|------|------|------|
| 1 | Server Action 인가 누락 수정 (#2) | 0.5일 |
| 2 | 환경 변수 보안 강화 (#6) | 0.5일 |
| 3 | SQLite → PostgreSQL 마이그레이션 (#1) | 1-2일 |
| 4 | 에러 바운더리 구현 (#5) | 1일 |
| 5 | 배포 인프라 구성 (#4) | 1-2일 |
| 6 | 보안 헤더 설정 (#15) | 0.5일 |
| **합계** | | **4.5-6.5일** |

### Phase 2: MVP 결제 연동 (2-3주)

수익화를 위한 결제 시스템과 핵심 모니터링을 구축한다.

| 순서 | 항목 | 공수 |
|------|------|------|
| 1 | Polar 결제 시스템 구현 (#3) | 3-5일 |
| 2 | 모니터링 도입 (#8) | 1-2일 |
| 3 | 법적 페이지 작성 (#11) | 1-2일 |
| 4 | Inngest 프로덕션 설정 (#9) | 1일 |
| **합계** | | **6-10일** |

### Phase 3: 안정화 & 품질 (3-4주)

서비스 안정성과 사용자 경험을 개선한다.

| 순서 | 항목 | 공수 |
|------|------|------|
| 1 | 인증 체계 강화 (#7) | 2-3일 |
| 2 | 테스트 도입 (#10) | 3-5일 |
| 3 | CDN 구성 (#12) | 1일 |
| **합계** | | **6-9일** |

### Phase 4: 성장 & 최적화 (4-6주)

사용자 확보와 서비스 확장을 위한 기능을 추가한다.

| 순서 | 항목 | 공수 |
|------|------|------|
| 1 | SEO 최적화 (#13) | 1일 |
| 2 | 사용자 관리 기능 (#14) | 2-3일 |
| 3 | 성능 최적화 (#17) | 1-2일 |
| 4 | i18n 다국어 지원 (#16) | 2-3일 |
| **합계** | | **6-9일** |

---

## 전체 예상 일정

| Phase | 기간 | 누적 |
|-------|------|------|
| Phase 1: 출시 차단 해제 | 1-2주 | 1-2주 |
| Phase 2: MVP 결제 연동 | 2-3주 | 3-5주 |
| Phase 3: 안정화 & 품질 | 2-3주 | 5-8주 |
| Phase 4: 성장 & 최적화 | 2-3주 | 7-11주 |

> **참고**: 공수는 1인 기준이며, 병렬 작업 및 팀 규모에 따라 단축 가능합니다. Phase 1 완료 시 최소 배포 가능하며, Phase 2 완료 시 유료 서비스 출시가 가능합니다.
