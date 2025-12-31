# AI Podcast Clipper - 기능 제안서

## 현재 기능 요약

### 핵심 기능
- **사용자 인증**: 이메일/비밀번호 기반 로그인 (NextAuth.js + JWT)
- **비디오 업로드**: MP4 파일 드래그앤드롭 (최대 500MB, S3 저장)
- **AI 클립 생성**: Gemini 2.5 + WhisperX 기반 Q&A 클립 자동 추출 (40~60초)
- **다국어 자막**: 영어(WhisperX) 및 한국어(Gemini 번역) 자막 지원
- **자동 세로 프레이밍**: Face-aware 크롭으로 1080×1920 세로 영상 생성
- **클립 관리**: 미리보기, 다운로드, 스크립트 복사, 삭제
- **크레딧 시스템**: 기본 3크레딧, 클립당 1크레딧 차감
- **재처리 기능**: 실패한 영상 또는 결과 불만족 시 재생성

### 기술 스택
- Frontend: Next.js 15, React 19, Tailwind CSS 4, shadcn/ui
- Backend: Inngest (워커), Modal.run (AI 처리), Prisma + SQLite
- Storage: AWS S3 (presigned URL)
- Auth: NextAuth.js v5 (Credentials Provider, JWT)

---

## 기능 제안

### 1. 결제 시스템 (Stripe) - 우선순위: 높음

**현재 상태**: Stripe 패키지가 이미 설치되어 있으나 구현되지 않음. `/dashboard/billing` 링크만 존재.

**구현 내용**:
```
├── 구독 플랜
│   ├── Free: 월 3크레딧
│   ├── Pro: 월 50크레딧 ($9.99)
│   └── Team: 월 200크레딧 ($29.99)
├── 크레딧 팩 구매
│   ├── 10 크레딧 ($4.99)
│   ├── 50 크레딧 ($19.99)
│   └── 100 크레딧 ($34.99)
└── Stripe Webhook 연동
    ├── checkout.session.completed
    ├── invoice.payment_succeeded
    └── customer.subscription.updated
```

**필요한 작업**:
- `src/app/dashboard/billing/page.tsx` 생성
- `src/actions/stripe.ts` 서버 액션 구현
- `src/app/api/webhooks/stripe/route.ts` Webhook 엔드포인트
- Prisma 스키마에 `subscription`, `payment` 모델 추가

---

### 2. 소셜 미디어 직접 공유 - 우선순위: 높음

**개요**: 생성된 클립을 YouTube Shorts, TikTok, Instagram Reels에 직접 업로드

**구현 내용**:
```
├── OAuth 연동
│   ├── YouTube Data API v3
│   ├── TikTok Content Posting API
│   └── Instagram Graph API (Business 계정)
├── 플랫폼별 최적화
│   ├── 길이 제한 검증 (60초)
│   ├── 해시태그 자동 생성
│   └── 썸네일 자동 선택
└── 예약 게시 기능
```

**필요한 테이블**:
```prisma
model SocialAccount {
  id           String   @id @default(cuid())
  userId       String
  platform     String   // youtube, tiktok, instagram
  accessToken  String
  refreshToken String?
  expiresAt    DateTime?
  user         User     @relation(fields: [userId], references: [id])
}

model ScheduledPost {
  id          String   @id @default(cuid())
  clipId      String
  platform    String
  scheduledAt DateTime
  status      String   @default("pending")
  postedAt    DateTime?
  postUrl     String?
}
```

---

### 3. 클립 편집 기능 - 우선순위: 높음

**개요**: 생성된 클립의 미세 조정 기능

**구현 내용**:
```
├── 시간 편집
│   ├── 시작/종료 시간 조정 (드래그 타임라인)
│   ├── 프레임 단위 미세 조정
│   └── 재생 미리보기
├── 자막 편집
│   ├── 텍스트 수정
│   ├── 타이밍 조정
│   ├── 스타일 커스터마이징 (폰트, 색상, 위치)
│   └── 자막 on/off 토글
├── 오디오 편집
│   ├── 볼륨 조절
│   ├── 배경 음악 추가 (무료 라이브러리)
│   └── 페이드 인/아웃
└── 재렌더링
    └── 편집 완료 후 새 클립 생성 요청
```

**기술 고려사항**:
- 클라이언트 사이드 미리보기: `ffmpeg.wasm` 또는 Canvas API
- 실제 렌더링은 Modal 백엔드에서 처리
- 편집 상태 저장: `ClipEdit` 모델 추가

---

### 4. 알림 시스템 - 우선순위: 중간

**개요**: 처리 완료, 크레딧 소진 등 이벤트 알림

**구현 내용**:
```
├── 이메일 알림 (Resend 또는 SendGrid)
│   ├── 처리 완료 알림
│   ├── 처리 실패 알림
│   ├── 크레딧 잔액 부족 경고
│   └── 구독 갱신 알림
├── 인앱 알림
│   ├── 실시간 알림 (SSE 또는 WebSocket)
│   ├── 알림 센터 UI
│   └── 읽음/안읽음 상태
└── 푸시 알림 (선택)
    └── Web Push API
```

**필요한 테이블**:
```prisma
model Notification {
  id        String   @id @default(cuid())
  userId    String
  type      String   // processing_complete, credits_low, etc.
  title     String
  message   String
  read      Boolean  @default(false)
  createdAt DateTime @default(now())
  user      User     @relation(fields: [userId], references: [id])
}
```

---

### 5. 일괄 처리 및 대용량 지원 - 우선순위: 중간

**개요**: 여러 파일 동시 업로드 및 대용량 파일 지원

**구현 내용**:
```
├── 다중 파일 업로드
│   ├── 파일 큐 관리
│   ├── 순차/병렬 처리 선택
│   └── 전체 진행률 표시
├── 대용량 파일 지원
│   ├── 멀티파트 업로드 (S3 Multipart)
│   ├── 파일 크기 제한 확장 (2GB+)
│   └── 업로드 재개 기능
├── 폴더 업로드
│   └── 폴더 드래그앤드롭
└── 다양한 포맷 지원
    ├── MP4, MOV, AVI, MKV
    ├── MP3, WAV, M4A (오디오)
    └── 자동 포맷 변환
```

**기술 구현**:
- `@uppy/aws-s3-multipart` 또는 직접 S3 Multipart API 구현
- Inngest 큐에서 우선순위 관리

---

### 6. 분석 대시보드 - 우선순위: 중간

**개요**: 사용 통계 및 인사이트 제공

**구현 내용**:
```
├── 사용 통계
│   ├── 총 생성 클립 수
│   ├── 크레딧 사용 히스토리
│   ├── 처리 시간 평균
│   └── 월별/주별 트렌드
├── 클립 분석
│   ├── 언어별 분포
│   ├── 평균 클립 길이
│   └── 재처리 비율
├── 스토리지 사용량
│   ├── 총 저장 용량
│   ├── 파일별 용량
│   └── 스토리지 정리 제안
└── 차트 시각화
    └── Recharts 또는 Chart.js
```

---

### 7. 팀 협업 기능 - 우선순위: 중간

**개요**: 워크스페이스 공유 및 팀 작업 지원

**구현 내용**:
```
├── 워크스페이스
│   ├── 팀 생성 및 초대
│   ├── 역할 관리 (Admin, Editor, Viewer)
│   └── 워크스페이스별 크레딧 풀
├── 클립 공유
│   ├── 팀 내 클립 공유
│   ├── 외부 공유 링크 생성 (만료 기간 설정)
│   └── 공유 링크 비밀번호 보호
├── 승인 워크플로우
│   ├── 클립 승인 요청
│   ├── 코멘트 및 피드백
│   └── 승인/거절 이력
└── 활동 로그
    └── 팀원별 활동 기록
```

**필요한 테이블**:
```prisma
model Team {
  id        String       @id @default(cuid())
  name      String
  credits   Int          @default(0)
  members   TeamMember[]
  createdAt DateTime     @default(now())
}

model TeamMember {
  id     String @id @default(cuid())
  teamId String
  userId String
  role   String @default("editor") // admin, editor, viewer
  team   Team   @relation(fields: [teamId], references: [id])
  user   User   @relation(fields: [userId], references: [id])
}
```

---

### 8. 클립 라이브러리 관리 - 우선순위: 낮음

**개요**: 생성된 클립 정리 및 검색

**구현 내용**:
```
├── 폴더/컬렉션
│   ├── 사용자 정의 폴더 생성
│   ├── 드래그앤드롭 정리
│   └── 스마트 폴더 (자동 분류)
├── 태그 시스템
│   ├── 수동 태그 추가
│   ├── AI 자동 태그 생성
│   └── 태그별 필터링
├── 검색 기능
│   ├── 스크립트 전문 검색
│   ├── 날짜 범위 필터
│   ├── 상태별 필터
│   └── 파일명 검색
└── 정렬 옵션
    ├── 생성일순
    ├── 이름순
    └── 길이순
```

---

### 9. AI 향상 기능 - 우선순위: 낮음

**개요**: AI를 활용한 추가 자동화

**구현 내용**:
```
├── 자동 제목 생성
│   └── 클립 내용 기반 제목 제안
├── 해시태그 추천
│   ├── 트렌딩 해시태그 분석
│   └── 플랫폼별 최적화
├── 클립 품질 점수
│   ├── 바이럴 가능성 예측
│   ├── 참여도 예상
│   └── 추천 순위 정렬
├── 썸네일 자동 생성
│   ├── 주요 프레임 추출
│   ├── 텍스트 오버레이 옵션
│   └── A/B 테스트용 다중 썸네일
└── 콘텐츠 요약
    └── 클립 내용 한 줄 요약
```

---

### 10. 사용자 설정 - 우선순위: 낮음

**개요**: 개인화 설정 페이지

**구현 내용**:
```
├── 프로필 관리
│   ├── 이름, 프로필 사진 변경
│   ├── 비밀번호 변경
│   └── 계정 삭제
├── 기본 설정
│   ├── 기본 자막 언어
│   ├── 기본 출력 품질 (720p, 1080p)
│   ├── 기본 클립 길이 범위
│   └── 자막 스타일 프리셋
├── 알림 설정
│   ├── 이메일 알림 on/off
│   ├── 알림 유형별 설정
│   └── 알림 빈도
└── 연동 계정 관리
    ├── 소셜 미디어 계정 연결/해제
    └── API 키 관리
```

---

### 11. 공개 API 제공 - 우선순위: 낮음

**개요**: 외부 서비스 연동을 위한 REST API

**구현 내용**:
```
├── API 키 관리
│   ├── API 키 생성/폐기
│   ├── 키별 권한 설정
│   └── 사용량 모니터링
├── 엔드포인트
│   ├── POST /api/v1/uploads - 파일 업로드
│   ├── GET /api/v1/uploads/:id - 업로드 상태 조회
│   ├── GET /api/v1/clips - 클립 목록 조회
│   ├── GET /api/v1/clips/:id - 클립 상세 조회
│   ├── DELETE /api/v1/clips/:id - 클립 삭제
│   └── POST /api/v1/uploads/:id/reprocess - 재처리
├── Rate Limiting
│   ├── 플랜별 요청 제한
│   └── 초과 시 429 응답
└── 문서화
    └── OpenAPI/Swagger 스펙
```

---

### 12. PWA 및 모바일 최적화 - 우선순위: 낮음

**개요**: 모바일 사용성 개선

**구현 내용**:
```
├── PWA 지원
│   ├── manifest.json
│   ├── Service Worker
│   └── 오프라인 캐싱
├── 반응형 UI 개선
│   ├── 모바일 네비게이션
│   ├── 터치 친화적 인터랙션
│   └── 모바일 비디오 플레이어 최적화
└── 모바일 업로드
    ├── 카메라 직접 촬영
    └── 갤러리에서 선택
```

---

## 구현 우선순위 매트릭스

| 기능 | 비즈니스 가치 | 구현 복잡도 | 우선순위 |
|------|-------------|------------|----------|
| 결제 시스템 | 높음 | 중간 | **P0** |
| 소셜 미디어 공유 | 높음 | 높음 | **P0** |
| 클립 편집 | 높음 | 높음 | **P1** |
| 알림 시스템 | 중간 | 낮음 | **P1** |
| 일괄 처리 | 중간 | 중간 | **P1** |
| 분석 대시보드 | 중간 | 낮음 | **P2** |
| 팀 협업 | 중간 | 높음 | **P2** |
| 클립 라이브러리 | 낮음 | 낮음 | **P2** |
| AI 향상 기능 | 낮음 | 중간 | **P3** |
| 사용자 설정 | 낮음 | 낮음 | **P3** |
| 공개 API | 낮음 | 중간 | **P3** |
| PWA/모바일 | 낮음 | 중간 | **P3** |

---

## 즉시 시작 가능한 Quick Wins

다음 기능들은 비교적 적은 노력으로 큰 가치를 제공합니다:

1. **결제 페이지** - Stripe 이미 설치됨, 기본 결제 플로우만 구현
2. **이메일 알림** - Resend 연동으로 처리 완료 알림
3. **클립 검색** - 기존 스크립트 텍스트 기반 검색 기능
4. **다운로드 일괄 처리** - 선택한 클립들 ZIP 다운로드
5. **처리 상태 실시간 업데이트** - SSE로 폴링 제거

---

## 기술 부채 개선 사항

현재 코드베이스에서 개선이 필요한 부분:

1. **SQLite → PostgreSQL 마이그레이션**
   - 프로덕션 환경 대비
   - 동시성 처리 개선

2. **환경 변수 보안**
   - `.env` 파일에 실제 키가 커밋됨 (보안 위험)
   - AWS 키, AUTH_SECRET 즉시 교체 필요

3. **에러 핸들링 강화**
   - 전역 에러 바운더리 추가
   - Sentry 연동

4. **테스트 코드 추가**
   - 현재 테스트 없음
   - Vitest + React Testing Library 도입

5. **타입 안전성**
   - 서버 액션 응답 타입 통일
   - API 응답 스키마 정의 (Zod)
