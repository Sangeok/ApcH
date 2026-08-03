# AI Podcast Clipper (ApcH)

[English](README.md) | [한국어](README.ko.md)

> AI 기반 화자 감지와 다국어 자막으로 긴 팟캐스트 영상을 매력적인 세로형 숏폼 클립으로 자동 변환합니다.

## 개요

AI Podcast Clipper (ApcH)는 팟캐스트 에피소드에서 “바이럴 될 만한” 순간을 자동으로 추출하는 지능형 영상 처리 플랫폼입니다. 영상 내용을 분석해 흥미로운 Q&A 구간을 식별하고, 액티브 스피커(현재 말하는 사람)를 추적하며, SNS에 최적화된 세로형(1080x1920) 영상을 생성하고, 전문적인 스타일의 다국어 자막(영어/한국어)을 오버레이합니다.

### 주요 기능

- **AI 기반 하이라이트 추출**: Gemini 2.5가 흥미로운 Q&A 구간(30~90초)을 자동으로 식별
- **단어(Word) 단위 전사**: WhisperX의 단어 단위 타임스탬프로 정밀 자막 생성
- **액티브 스피커 탐지**: Columbia ASD로 발화자 추적 및 지능형 얼굴 크롭
- **세로형 영상 생성**: 가로 영상을 1080x1920 세로 포맷으로 변환(스마트 크롭 또는 블러 배경)
- **다국어 자막**: Gemini 자동 번역을 통한 영어/한국어 자막 지원
- **실시간 처리 큐**: Inngest 워크플로 오케스트레이션 기반 비동기 작업 처리

## 아키텍처

```
┌─────────────────────────────────────────────────────────────────┐
│                     Frontend (Next.js)                          │
│  ┌──────────────┐  ┌──────────────┐  ┌────────────────────┐     │
│  │   Homepage   │  │  Dashboard   │  │  Upload Detail     │     │
│  │              │  │  - Uploads   │  │  - Clip Gallery    │     │
│  │              │  │  - Queue     │  │  - Timeline        │     │
│  └──────────────┘  └──────────────┘  └────────────────────┘     │
│                                                                 │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │      NextAuth + Prisma (PostgreSQL)                      │   │
│  │      User Management & Credit System                     │   │
│  └──────────────────────────────────────────────────────────┘   │
└──────────────────────────────┬──────────────────────────────────┘
                               │
                               │ API Calls
                               │
┌──────────────────────────────┴───────────────────────────────────┐
│                      AWS S3 Storage                              │
│  - Users upload videos via presigned URLs                        │
│  - Backend stores processed clips                                │
└──────────────────────────────┬───────────────────────────────────┘
                               │
                               │ Inngest Events
                               │
┌──────────────────────────────┴───────────────────────────────────┐
│          Backend (Modal.com Serverless GPU)                      │
│  ┌────────────────────────────────────────────────────────────┐  │
│  │  Processing Pipeline (L40S GPU - 3600s timeout)            │  │
│  │                                                            │  │
│  │  1. WhisperX Transcription                                 │  │
│  │     └─> Word-level timestamps (large-v2 model)             │  │
│  │                                                            │  │
│  │  2. Gemini Highlight Detection                             │  │
│  │     └─> Identify Q&A clips (30-90s, non-overlapping)       │  │
│  │                                                            │  │
│  │  3. Columbia ASD (Active Speaker Detection)                │  │
│  │     └─> Face tracking + speaker scoring                    │  │
│  │                                                            │  │
│  │  4. Vertical Video Generation                              │  │
│  │     └─> Smart crop (speaker tracking) or blur background   │  │
│  │                                                            │  │
│  │  5. Subtitle Overlay (FFmpeg + ASS)                        │  │
│  │     └─> English or Korean with custom styling              │  │
│  │                                                            │  │
│  │  6. S3 Upload                                              │  │
│  │     └─> Store final clips with language suffix (_en/_kr)   │  │
│  └────────────────────────────────────────────────────────────┘  │
└──────────────────────────────────────────────────────────────────┘
```

## 기술 스택

### 프론트엔드

- **프레임워크**: Next.js 15 (App Router)
- **인증**: NextAuth.js 5.0
- **데이터베이스**: Prisma + PostgreSQL (Neon)
- **스타일링**: Tailwind CSS 4.0 + shadcn/ui
- **아키텍처**: Feature-Sliced Design (FSD)
- **폼 처리**: React Hook Form + Zod
- **파일 업로드**: AWS S3 presigned URLs
- **워크플로**: Inngest (비동기 작업 오케스트레이션)
- **결제**: Polar (체크아웃, 고객 포털, 웹훅). `NEXT_PUBLIC_SUBSCRIPTION_ENABLED`로 on/off
- **모니터링**: Sentry

### 백엔드

- **배포**: Modal.com (서버리스 GPU 컨테이너)
- **GPU**: L40S + CUDA 12.4
- **AI 모델**:
  - WhisperX (large-v2): 음성 → 텍스트 전사
  - Gemini 2.5 Flash: 하이라이트 검출, 한국어 번역, YouTube 메타데이터 생성
  - Columbia ASD: 액티브 스피커 탐지
- **영상 처리**: FFmpeg, ffmpegcv (GPU 가속)
- **자막 생성**: pysubs2 (ASS 포맷)
- **스토리지**: AWS S3
- **API**: FastAPI (Bearer 인증)

## 설치 & 설정

### 사전 준비

- Node.js 20+ 및 npm 10+
- Python 3.12+
- AWS 계정(S3 버킷)
- Modal.com 계정
- Gemini API 키

### 프론트엔드 설정

이 저장소는 **npm workspaces 모노레포**입니다. 모든 명령은 저장소 루트에서
실행합니다 — `.env`도 lockfile도 하나뿐입니다.

```bash
# 전 워크스페이스 의존성 설치
npm install

# 환경 변수 설정
cp .env.example .env

# DB 초기화
npm run db:push

# 개발 서버 실행
npm run dev                       # web
npm run dev:admin                 # admin

# Inngest 개발 서버 실행(별도 터미널)
npm run inngest-dev -w apps/web
```

변수 목록은 `.env.example`에 있습니다 — 인증(`AUTH_SECRET`, `AUTH_URL`,
`AUTH_GOOGLE_ID`, `AUTH_GOOGLE_SECRET`), DB, S3, Modal 엔드포인트, Inngest 키,
Polar 결제, Sentry, 그리고 어드민 앱용 `ADMIN_EMAILS`까지 포함합니다. 실제로
강제하는 곳은 `apps/web/src/env.js`입니다 — 빌드 시점에 검증해서 필수 변수가
없으면 빌드를 실패시키므로, 빌드가 환경 변수로 불평하면 목록이 아니라 이 파일을
먼저 보십시오. 이 README는 목록을 다시 적지 않습니다 — 복사한 목록은 어긋나고,
빠지는 변수는 항상 아무도 옮겨 적지 않은 그 변수입니다.

| 앱 | 로컬 | 프로덕션 |
|---|---|---|
| `apps/web` | http://localhost:3000 | https://a-pch.com |
| `apps/admin` | http://localhost:3001 | https://admin.a-pch.com |

두 앱은 각각 별도의 Vercel 프로젝트로 배포되며, `Root Directory`가 각각
`apps/web`과 `apps/admin`으로 설정되어 있습니다.

### 백엔드 설정

로컬 Python venv는 저장소 밖에 둡니다. 경로와 이유는 `apps/backend/CLAUDE.md`에
기록돼 있습니다. Modal은 배포 시 `requirements.txt`로 자체 이미지를 빌드하므로,
이 venv는 로컬에서 파이썬을 직접 돌릴 때만 필요합니다.

```bash
cd apps/backend

# 필요한 환경 변수로 Modal secret 생성
modal secret create ai-podcast-clipper-secret \
  AWS_ACCESS_KEY_ID=<your-aws-key> \
  AWS_SECRET_ACCESS_KEY=<your-aws-secret> \
  AWS_DEFAULT_REGION=ap-southeast-2 \
  GEMINI_API_KEY=<your-gemini-key> \
  AUTH_TOKEN=<generate-secure-token> \
  MODAL_WEBHOOK_SECRET=<.env 의 MODAL_WEBHOOK_SECRET 과 동일한 값>

# Modal에 배포
modal deploy main.py

# 로컬 테스트(배포된 엔드포인트 호출)
modal run main.py
```

## 사용 방법

### 사용자 워크플로

1. **회원가입 / 로그인**: `/signup`에서 회원가입하거나 `/login`에서 로그인
2. **팟캐스트 업로드**: `/dashboard`로 이동해 MP4 영상을 S3로 업로드
3. **옵션 선택**: 자막 언어(영어/한국어), 생성할 클립 개수(1~4개, 기본 3개),
   렌더링 전에 AI 제안을 검토할지 여부
4. **분석**: Inngest가 Modal 엔드포인트를 `analyze` 모드로 호출 — WhisperX 전사와
   Gemini 구간 검출까지 수행
5. **검토**(활성화한 경우): 실행이 `review_pending`에서 멈추고 제안이 `ClipDraft`
   레코드로 저장됩니다. 클립별 시작/종료 구간을 조정하고, 원하지 않는 클립을 해제하고,
   자막 스타일을 개별로 덮어쓸 수 있습니다. AI의 원래 구간은
   `aiStartSeconds` / `aiEndSeconds`에 따로 보존돼 되돌리기가 가능합니다.
6. **렌더링**: 확정된 구간을 `render` 모드로 다시 Modal에 전달
7. **확인 및 다운로드**: 업로드 상세 페이지에서 클립 갤러리를 열고 세로형 영상을 다운로드

### 크레딧 & 결제

- 신규 계정은 무료 크레딧 3개로 시작(`User.credits` 기본값 3)
- 크레딧은 성공한 실행 이후 **생성된 클립 1개당 1개** 차감됩니다. 3클립 실행이
  완료되면 체험 잔액을 모두 사용합니다. 실패하거나 일부만 완료된 실행은 차감하지 않습니다.
- 유료 결제는 Stripe가 아니라 **Polar**로 동작합니다: `/api/checkout`,
  `/api/portal`, `/api/webhooks/polar`. DB에는 `Subscription`과 `Order` 레코드가 남습니다.
- 결제 화면은 `/dashboard/billing`이며, 전체 흐름이
  `NEXT_PUBLIC_SUBSCRIPTION_ENABLED`로 게이팅됩니다

## API 문서

### 백엔드 엔드포인트

**URL**: `https://[your-modal-username]--ai-podcast-clipper-process-video.modal.run`

**Method**: POST

**Headers**:

```json
{
  "Authorization": "Bearer <AUTH_TOKEN>",
  "Content-Type": "application/json"
}
```

**Request Body**:

```json
{
  "s3_key": "user-id/video-name.mp4",
  "clip_count": 3,
  "language": "Korean",
  "callback_url": "https://a-pch.com/api/webhooks/modal",
  "uploaded_file_id": "clx...",
  "mode": "auto"
}
```

- `s3_key`와 `clip_count`는 필수입니다. `clip_count`에는 기본값이 없어서 빠뜨리면
  `422`가 반환됩니다.
- `language`: `"English"` 또는 `"Korean"`(기본값 `"Korean"`)
- `mode`: `"auto"`(전사 → 검출 → 렌더링), `"analyze"`(검출까지만. 검토 단계용),
  `"render"`(전달받은 `moments`만 렌더링). 기본값 `"auto"`
- `callback_url`이 실행 방식을 결정합니다. 있으면 `.spawn()`으로 디스패치되어 즉시
  반환하고, 없으면 엔드포인트가 파이프라인을 동기로 끝까지 돌린 뒤 결과를 반환합니다.
- `moments`, `transcript_s3_key`, `output_prefix`, `attempt`는 `render` 모드에서 사용합니다.

**Response**(비동기 — `callback_url` 있음):

```json
{
  "status": "accepted",
  "call_id": "fc-..."
}
```

`callback_url` 없이 호출하면 확인 응답 대신 파이프라인 결과 자체가 반환됩니다.

### 처리 상세

**입력(Input)**: S3 버킷 `ai-podcast-clipper-hamsoo` 에 업로드된 MP4 영상

**출력(Output)**:

- 영어: `{s3_key_dir}/clip_{index}_en.mp4`
- 한국어: `{s3_key_dir}/clip_{index}_kr.mp4`

**제약(Constraints)**:

- 영상 1개당 클립 개수: 사용자가 1~4개 선택(기본 3개)
- 클립 길이: 30~90초 — 범위를 벗어난 구간은 버려집니다
- 타임아웃: 3600초(60분)
- GPU: L40S (48GB VRAM)

## 개발

### 저장소 구조

```
ApcH/
├── package.json                    # npm workspaces: apps/*, packages/*
├── .env                            # 단일본. 두 앱과 Prisma CLI가 공유
├── apps/
│   ├── web/                        # a-pch.com — 서비스
│   │   └── src/
│   │       ├── app/                # Next.js App Router
│   │       ├── fsd/                # Feature-Sliced Design
│   │       │   ├── pages/          # 페이지 컴포넌트
│   │       │   ├── widgets/        # 복합 블록
│   │       │   ├── features/       # 서버 액션과 상호작용
│   │       │   ├── entities/       # 도메인 모델
│   │       │   └── shared/         # analytics, ui, lib
│   │       └── inngest/            # 비동기 영상 파이프라인 워커
│   ├── admin/                      # admin.a-pch.com — 내부 대시보드
│   │   └── src/
│   │       ├── app/                # /login, /analytics, /observability
│   │       ├── analytics/          # 집계 쿼리
│   │       └── auth/               # 자체 인증 (ADMIN_EMAILS 화이트리스트)
│   └── backend/                    # Python (Modal). package.json 이 없어 npm 워크스페이스 아님
└── packages/
    └── db/                         # @repo/db
        ├── prisma/schema.prisma    # 데이터베이스 스키마
        └── src/analytics-contract.ts   # 이벤트 이름, 퍼널, 공용 타입
```

`packages/db`가 존재하는 이유는 analytics 계약의 정의를 하나로 두기 위해서입니다.
web이 이벤트를 기록하고 admin이 집계하는데, 계약을 복사해 두 벌로 만들면 한쪽에서
이벤트 이름을 바꿔도 다른 쪽은 그대로 컴파일되고 대시보드가 조용히 0을 보여줍니다.

### 백엔드 구조

```
apps/backend/
├── main.py                     # Modal 앱 엔트리포인트
├── asd/                        # Columbia ASD 모델
│   ├── Columbia_test.py        # Active speaker detection
│   ├── ASD.py                  # Model architecture
│   └── weight/                 # Model weights
├── requirements.txt            # Python 의존성 (torch 고정, 주변 패키지도 함께 고정)
├── CLAUDE.md                   # 백엔드 규약. venv 위치 포함
└── ytdownload.py               # YouTube 다운로드 유틸리티
```

### 핵심 구성 요소

**프론트엔드 페이지**:

- `/` - 기능 소개 홈
- `/dashboard` - 업로드 큐가 있는 사용자 대시보드
- `/dashboard/uploads/[uploadedFileId]` - 클립 검토, 갤러리, 처리 타임라인
- `/dashboard/billing` - 플랜 및 크레딧 잔액 (Polar)
- `/login`, `/signup`, `/privacy`, `/terms`
- `(public-marketing)/` - 마케팅·SEO 라우트 그룹: `/pricing`, `/features`,
  `/how-it-works`, `/product-tour`, `/compare`, `/guides/[slug]`, `/about`,
  `/contact`, `/security`, `/changelog`, 그리고 랜딩 페이지
  `/ai-podcast-clipper`, `/podcast-to-shorts`, `/youtube-shorts-generator`

**백엔드 함수**:

- `transcribe_video()` - WhisperX 단어 단위 전사
- `identify_moments()` - Gemini Q&A 구간 추출
- `process_clip()` - 전체 클립 처리 파이프라인
- `create_vertical_video()` - 스마트 크롭 및 세로 변환
- `create_subtitles_with_ffmpeg()` - 영어 자막 오버레이
- `create_korean_subtitles_with_ffmpeg()` - 한국어 번역 및 자막 생성

## 알려진 이슈 & 제한사항

- 한국어 번역이 API 오류 시 영어로 폴백될 수 있음
- S3 업로드 실패에 대한 에러 핸들링이 없음
- 성공/실패와 무관하게 임시 디렉토리 정리가 수행됨
- 파이프라인 중간 실패 시 크레딧이 차감되지 않을 수 있음

## 라이선스

비공개 프로젝트 - 모든 권리 보유

## Acknowledgments

- **Columbia ASD**: IJCV 2025의 LR-ASD 모델
- **WhisperX**: 단어 단위 타임스탬프를 제공하는 고속 ASR
- **T3 Stack**: 타입-세이프 Next.js 스타터 템플릿
- **shadcn/ui**: 아름답게 디자인된 컴포넌트 라이브러리
