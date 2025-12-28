# AI Podcast Clipper (ApcH)

[English](README.md) | [한국어](README.ko.md)

> AI 기반 화자 감지와 다국어 자막으로 긴 팟캐스트 영상을 매력적인 세로형 숏폼 클립으로 자동 변환합니다.

## 개요

AI Podcast Clipper (ApcH)는 팟캐스트 에피소드에서 “바이럴 될 만한” 순간을 자동으로 추출하는 지능형 영상 처리 플랫폼입니다. 영상 내용을 분석해 흥미로운 Q&A 구간을 식별하고, 액티브 스피커(현재 말하는 사람)를 추적하며, SNS에 최적화된 세로형(1080x1920) 영상을 생성하고, 전문적인 스타일의 다국어 자막(영어/한국어)을 오버레이합니다.

### 주요 기능

- **AI 기반 하이라이트 추출**: Gemini 2.5가 흥미로운 Q&A 구간(30~60초)을 자동으로 식별
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
│  │      NextAuth + Prisma (SQLite)                          │   │
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
│  │  Processing Pipeline (L40S GPU - 900s timeout)             │  │
│  │                                                            │  │
│  │  1. WhisperX Transcription                                 │  │
│  │     └─> Word-level timestamps (large-v2 model)             │  │
│  │                                                            │  │
│  │  2. Gemini Highlight Detection                             │  │
│  │     └─> Identify Q&A clips (30-60s, non-overlapping)       │  │
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
- **데이터베이스**: Prisma + SQLite
- **스타일링**: Tailwind CSS 4.0 + shadcn/ui
- **아키텍처**: Feature-Sliced Design (FSD)
- **폼 처리**: React Hook Form + Zod
- **파일 업로드**: AWS S3 presigned URLs
- **워크플로**: Inngest (비동기 작업 오케스트레이션)

### 백엔드

- **배포**: Modal.com (서버리스 GPU 컨테이너)
- **GPU**: L40S + CUDA 12.4
- **AI 모델**:
  - WhisperX (large-v2): 음성 → 텍스트 전사
  - Gemini 2.5 Flash/Pro: 하이라이트 검출 및 번역
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

```bash
cd ai-podcast-clipper-frontend

# 의존성 설치
npm install

# 환경 변수 설정
cp .env.example .env

# .env에 필요한 환경 변수:
- AUTH_SECRET

- DATABASE_URL
- PROCESS_VIDEO_ENDPOINT
- PROCESS_VIDEO_ENDPOINT_AUTH

- S3_BUCKET_NAME
- AWS_REGION
- AWS_ACCESS_KEY_ID
- AWS_SECRET_ACCESS_KEY

# DB 초기화
npm run db:push

# 개발 서버 실행
npm run dev

# Inngest 개발 서버 실행(별도 터미널)
npm run inngest-dev
```

프론트엔드는 `http://localhost:3000` 에서 확인할 수 있습니다.

### 백엔드 설정

```bash
cd ai-podcast-clipper-backend

# 필요한 환경 변수로 Modal secret 생성
modal secret create ai-podcast-clipper-secret \
  AWS_ACCESS_KEY_ID=<your-aws-key> \
  AWS_SECRET_ACCESS_KEY=<your-aws-secret> \
  AWS_DEFAULT_REGION=ap-southeast-2 \
  GEMINI_API_KEY=<your-gemini-key> \
  AUTH_TOKEN=<generate-secure-token>

# Modal에 배포
modal deploy main.py

# 로컬 테스트(배포된 엔드포인트 호출)
modal run main.py
```

## 사용 방법

### 사용자 워크플로

1. **회원가입 / 로그인**: `/signup`에서 회원가입하거나 `/login`에서 로그인
2. **팟캐스트 업로드**: `/dashboard`로 이동해 MP4 영상을 S3로 업로드
3. **언어 선택**: 영어 또는 한국어 자막 선택
4. **처리**: Inngest가 Modal 엔드포인트를 트리거하며, 처리 시간은 5~15분 소요
5. **클립 확인**: 업로드 상세 페이지에서 생성된 클립을 확인
6. **다운로드**: 클립을 클릭해 세로형 영상을 다운로드

### 크레딧 시스템(현재 개발 중)

- 신규 유저는 3개의 무료 크레딧 제공
- 영상 처리 1회당 1 크레딧 사용
- 처리 시작 전에 크레딧 필요
- Stripe 결제 연동(예정)

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
  "language": "English" // 또는 "Korean"
}
```

**Response**:

```json
{
  "status": "ok",
  "clips_planned": 3,
  "s3_prefix": "user-id"
}
```

### 처리 상세

**입력(Input)**: S3 버킷 `ai-podcast-clipper-hamsoo` 에 업로드된 MP4 영상

**출력(Output)**:

- 영어: `{s3_key_dir}/clip_{index}_en.mp4`
- 한국어: `{s3_key_dir}/clip_{index}_kr.mp4`

**제약(Constraints)**:

- 영상 1개당 최대 3개 클립 처리(하드코딩된 제한)
- 클립 길이: 30~60초
- 타임아웃: 900초(15분)
- GPU: L40S (48GB VRAM)

## 개발

### 프론트엔드 구조(FSD)

```
ai-podcast-clipper-frontend/
├── src/
│   ├── app/                    # Next.js App Router
│   │   ├── api/                # API routes
│   │   ├── dashboard/          # Dashboard pages
│   │   ├── login/              # Authentication pages
│   │   └── signup/
│   ├── fsd/                    # Feature-Sliced Design
│   │   ├── pages/              # Page components
│   │   │   ├── dashboard/
│   │   │   ├── home/
│   │   │   └── uploadDetail/
│   │   ├── shared/             # Shared utilities
│   │   └── widgets/            # Reusable widgets
│   └── components/             # UI components (shadcn)
└── prisma/
    ├── schema.prisma           # Database schema
    └── db.sqlite               # SQLite database
```

### 백엔드 구조

```
ai-podcast-clipper-backend/
├── main.py                     # Modal 앱 엔트리포인트
├── asd/                        # Columbia ASD 모델
│   ├── Columbia_test.py        # Active speaker detection
│   ├── ASD.py                  # Model architecture
│   └── weight/                 # Model weights
├── requirements.txt            # Python dependencies
└── ytdownload.py               # YouTube 다운로드 유틸리티
```

### 핵심 구성 요소

**프론트엔드 페이지**:

- `/` - 기능 소개 홈
- `/dashboard` - 업로드 큐가 있는 사용자 대시보드
- `/dashboard/uploads/[id]` - 클립 갤러리 및 처리 타임라인

**백엔드 함수**:

- `transcribe_video()` - WhisperX 단어 단위 전사
- `identify_moments()` - Gemini Q&A 구간 추출
- `process_clip()` - 전체 클립 처리 파이프라인
- `create_vertical_video()` - 스마트 크롭 및 세로 변환
- `create_subtitles_with_ffmpeg()` - 영어 자막 오버레이
- `create_korean_subtitles_with_ffmpeg()` - 한국어 번역 및 자막 생성

## 알려진 이슈 & 제한사항

- 영상 1개당 최초 3개 클립만 처리(하드코딩)
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
