# AI Podcast Clipper (ApcH)

> Automatically transform long podcast videos into engaging short-form vertical clips with AI-powered speaker detection and multilingual subtitles.

## Overview

AI Podcast Clipper (ApcH) is an intelligent video processing platform that extracts viral-worthy moments from podcast episodes. The system analyzes video content to identify engaging Q&A segments, tracks active speakers, generates social media-optimized vertical videos, and overlays professional-styled subtitles in multiple languages (English, Korean).

### Key Features

- **AI-Powered Highlight Extraction**: Gemini 2.5 automatically identifies engaging Q&A segments (30-60 seconds)
- **Word-Level Transcription**: WhisperX provides word-level timestamps for precise subtitles
- **Active Speaker Detection**: Columbia ASD tracks speakers with intelligent face cropping
- **Vertical Video Generation**: Converts landscape videos to 1080x1920 portrait format (smart crop or blur background)
- **Multilingual Subtitles**: Support for English and Korean with automatic translation via Gemini
- **Real-time Processing Queue**: Asynchronous job processing with Inngest workflow orchestration

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                     Frontend (Next.js)                           │
│  ┌──────────────┐  ┌──────────────┐  ┌────────────────────┐    │
│  │   Homepage   │  │  Dashboard   │  │  Upload Detail     │    │
│  │              │  │  - Uploads   │  │  - Clip Gallery    │    │
│  │              │  │  - Queue     │  │  - Timeline        │    │
│  └──────────────┘  └──────────────┘  └────────────────────┘    │
│                                                                  │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │      NextAuth + Prisma (SQLite)                          │  │
│  │      User Management & Credit System                     │  │
│  └──────────────────────────────────────────────────────────┘  │
└──────────────────────────────┬───────────────────────────────────┘
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
│  ┌────────────────────────────────────────────────────────────┐ │
│  │  Processing Pipeline (L40S GPU - 900s timeout)             │ │
│  │                                                             │ │
│  │  1. WhisperX Transcription                                 │ │
│  │     └─> Word-level timestamps (large-v2 model)             │ │
│  │                                                             │ │
│  │  2. Gemini Highlight Detection                             │ │
│  │     └─> Identify Q&A clips (30-60s, non-overlapping)       │ │
│  │                                                             │ │
│  │  3. Columbia ASD (Active Speaker Detection)                │ │
│  │     └─> Face tracking + speaker scoring                    │ │
│  │                                                             │ │
│  │  4. Vertical Video Generation                              │ │
│  │     └─> Smart crop (speaker tracking) or blur background   │ │
│  │                                                             │ │
│  │  5. Subtitle Overlay (FFmpeg + ASS)                        │ │
│  │     └─> English or Korean with custom styling              │ │
│  │                                                             │ │
│  │  6. S3 Upload                                              │ │
│  │     └─> Store final clips with language suffix (_en/_kr)   │ │
│  └────────────────────────────────────────────────────────────┘ │
└──────────────────────────────────────────────────────────────────┘
```

## Tech Stack

### Frontend

- **Framework**: Next.js 15 (App Router)
- **Authentication**: NextAuth.js 5.0
- **Database**: Prisma + SQLite
- **Styling**: Tailwind CSS 4.0 + shadcn/ui
- **Architecture**: Feature-Sliced Design (FSD)
- **Form Handling**: React Hook Form + Zod
- **File Upload**: AWS S3 presigned URLs
- **Workflows**: Inngest (async job orchestration)

### Backend

- **Deployment**: Modal.com (serverless GPU containers)
- **GPU**: L40S with CUDA 12.4
- **AI Models**:
  - WhisperX (large-v2): Speech-to-text transcription
  - Gemini 2.5 Flash/Pro: Highlight detection and translation
  - Columbia ASD: Active speaker detection
- **Video Processing**: FFmpeg, ffmpegcv (GPU-accelerated)
- **Subtitle Generation**: pysubs2 (ASS format)
- **Storage**: AWS S3
- **API**: FastAPI (Bearer authentication)

## Installation & Setup

### Prerequisites

- Node.js 20+ and npm 10+
- Python 3.12+
- AWS account (S3 bucket)
- Modal.com account
- Gemini API key

### Frontend Setup

```bash
cd ai-podcast-clipper-frontend

# Install dependencies
npm install

# Configure environment variables
cp .env.example .env

# Required environment variables in .env:
- AUTH_SECRET

- DATABASE_URL
- PROCESS_VIDEO_ENDPOINT
- PROCESS_VIDEO_ENDPOINT_AUTH

- S3_BUCKET_NAME
- AWS_REGION
- AWS_ACCESS_KEY_ID
- AWS_SECRET_ACCESS_KEY

# Initialize database
npm run db:push

# Start development server
npm run dev

# Start Inngest development server (separate terminal)
npm run inngest-dev
```

Frontend will be available at http://localhost:3000

### Backend Setup

```bash
cd ai-podcast-clipper-backend

# Create Modal secret with required environment variables
modal secret create ai-podcast-clipper-secret \
  AWS_ACCESS_KEY_ID=<your-aws-key> \
  AWS_SECRET_ACCESS_KEY=<your-aws-secret> \
  AWS_DEFAULT_REGION=ap-southeast-2 \
  GEMINI_API_KEY=<your-gemini-key> \
  AUTH_TOKEN=<generate-secure-token>

# Deploy to Modal
modal deploy main.py

# Local testing (calls deployed endpoint)
modal run main.py
```

## Usage

### User Workflow

1. **Sign Up / Log In**: Create an account at `/signup` or log in at `/login`
2. **Upload Podcast**: Navigate to `/dashboard` and upload an MP4 video to S3
3. **Select Language**: Choose English or Korean subtitles
4. **Processing**: Inngest triggers Modal endpoint, processing takes 5-15 minutes
5. **View Clips**: Navigate to upload detail page to see generated clips
6. **Download**: Click on clips to download vertical videos

### Credit System (Currently in Development)

- New users receive 3 free credits
- Each video processing consumes 1 credit
- Credits required before processing starts
- Credit purchase via Stripe integration (planned)

## API Documentation

### Backend Endpoint

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
  "language": "English" // or "Korean"
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

### Processing Details

**Input**: MP4 video uploaded to S3 bucket `ai-podcast-clipper-hamsoo`

**Output**:

- English: `{s3_key_dir}/clip_{index}_en.mp4`
- Korean: `{s3_key_dir}/clip_{index}_kr.mp4`

**Constraints**:

- Maximum 3 clips processed per video
- Clip duration: 30-60 seconds
- Timeout: 900 seconds (15 minutes)
- GPU: L40S (48GB VRAM)

## Development

### Frontend Structure (FSD)

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

### Backend Structure

```
ai-podcast-clipper-backend/
├── main.py                     # Modal app entry point
├── asd/                        # Columbia ASD model
│   ├── Columbia_test.py        # Active speaker detection
│   ├── ASD.py                  # Model architecture
│   └── weight/                 # Model weights
├── requirements.txt            # Python dependencies
└── ytdownload.py               # YouTube download utility
```

### Key Components

**Frontend Pages**:

- `/` - Feature showcase homepage
- `/dashboard` - User dashboard with upload queue
- `/dashboard/uploads/[id]` - Clip gallery and processing timeline

**Backend Functions**:

- `transcribe_video()` - WhisperX word-level transcription
- `identify_moments()` - Gemini Q&A extraction
- `process_clip()` - Complete clip processing pipeline
- `create_vertical_video()` - Smart crop and vertical conversion
- `create_subtitles_with_ffmpeg()` - English subtitle overlay
- `create_korean_subtitles_with_ffmpeg()` - Korean translation and subtitles

## Known Issues & Limitations

- Only the first 3 clips are processed per video (hardcoded limit)
- Korean translation may fallback to English on API errors
- No error handling for S3 upload failures
- Temporary directory cleanup regardless of success
- Credits not consumed if pipeline fails mid-process

## License

Private project - All rights reserved

## Acknowledgments

- **Columbia ASD**: LR-ASD model from IJCV 2025
- **WhisperX**: Fast automatic speech recognition with word-level timestamps
- **T3 Stack**: Type-safe Next.js starter template
- **shadcn/ui**: Beautifully designed component library
