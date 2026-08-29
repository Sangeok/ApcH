# AI Podcast Clipper (ApcH)

[English](README.md) | [한국어](README.ko.md)

> Automatically transform long podcast videos into engaging short-form vertical clips with AI-powered speaker detection and multilingual subtitles.

## Overview

AI Podcast Clipper (ApcH) is an intelligent video processing platform that extracts viral-worthy moments from podcast episodes. The system analyzes video content to identify engaging Q&A segments, tracks active speakers, generates social media-optimized vertical videos, and overlays professional-styled subtitles in multiple languages (English, Korean).

### Key Features

- **AI-Powered Highlight Extraction**: Gemini 2.5 automatically identifies engaging Q&A segments (30-90 seconds)
- **Word-Level Transcription**: WhisperX provides word-level timestamps for precise subtitles
- **Active Speaker Detection**: Columbia ASD tracks speakers with intelligent face cropping
- **Vertical Video Generation**: Converts landscape videos to 1080x1920 portrait format (smart crop or blur background)
- **Multilingual Subtitles**: Support for English and Korean with automatic translation via Gemini
- **Real-time Processing Queue**: Asynchronous job processing with Inngest workflow orchestration

## Architecture

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

## Tech Stack

### Frontend

- **Framework**: Next.js 15 (App Router)
- **Authentication**: NextAuth.js 5.0
- **Database**: Prisma + PostgreSQL (Neon)
- **Styling**: Tailwind CSS 4.0 + shadcn/ui
- **Architecture**: Feature-Sliced Design (FSD)
- **Form Handling**: React Hook Form + Zod
- **File Upload**: AWS S3 presigned URLs
- **Workflows**: Inngest (async job orchestration)
- **Billing**: Polar (checkout, customer portal, webhooks), gated by `NEXT_PUBLIC_SUBSCRIPTION_ENABLED`
- **Monitoring**: Sentry

### Backend

- **Deployment**: Modal.com (serverless GPU containers)
- **GPU**: L40S with CUDA 12.4
- **AI Models**:
  - WhisperX (large-v2): Speech-to-text transcription
  - Gemini 2.5 Flash: Highlight detection, Korean translation, YouTube metadata
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

This repository is an **npm workspaces monorepo**. Run every command from the
repository root — there is a single `.env` and a single lockfile.

```bash
# Install dependencies for all workspaces
npm install

# Configure environment variables
cp .env.example .env

# Initialize database
npm run db:push

# Start development servers
npm run dev                       # web
npm run dev:admin                 # admin

# Start Inngest development server (separate terminal)
npm run inngest-dev -w apps/web
```

`.env.example` lists the variables — auth (`AUTH_SECRET`, `AUTH_URL`,
`AUTH_GOOGLE_ID`, `AUTH_GOOGLE_SECRET`), the database, S3, the Modal endpoint,
Inngest keys, Polar billing, Sentry, and `ADMIN_EMAILS` for the admin app.
`apps/web/src/env.js` is what enforces them: it validates at build time and
fails the build when a required variable is missing, so start there when a build
complains rather than trusting any list. This README deliberately does not repeat
the list — a duplicated list drifts, and the variable it drops is always the one
nobody copied.

| App | Local | Production |
|---|---|---|
| `apps/web` | http://localhost:3000 | https://a-pch.com |
| `apps/admin` | http://localhost:3001 | https://admin.a-pch.com |

The two apps deploy as separate Vercel projects, with `Root Directory` set to
`apps/web` and `apps/admin` respectively.

### Backend Setup

The local Python venv is kept outside the repository; `apps/backend/CLAUDE.md`
records the path and the reason. Modal builds its own image from
`requirements.txt`, so the venv is only needed to run Python locally.

```bash
cd apps/backend

# Create Modal secret with required environment variables
modal secret create ai-podcast-clipper-secret \
  AWS_ACCESS_KEY_ID=<your-aws-key> \
  AWS_SECRET_ACCESS_KEY=<your-aws-secret> \
  AWS_DEFAULT_REGION=ap-southeast-2 \
  GEMINI_API_KEY=<your-gemini-key> \
  AUTH_TOKEN=<generate-secure-token> \
  MODAL_WEBHOOK_SECRET=<same value as MODAL_WEBHOOK_SECRET in .env>

# Deploy to Modal
modal deploy main.py

# Local testing (calls deployed endpoint)
modal run main.py
```

## Usage

### User Workflow

1. **Sign Up / Log In**: Create an account at `/signup` or log in at `/login`
2. **Upload Podcast**: Navigate to `/dashboard` and upload an MP4 video to S3
3. **Choose Options**: Subtitle language (English or Korean), how many clips to
   generate (1-4, default 3), and whether to review the AI's picks before rendering
4. **Analysis**: Inngest calls the Modal endpoint in `analyze` mode — WhisperX
   transcription plus Gemini moment detection
5. **Review** (when enabled): The run stops at `review_pending` and the proposals
   are stored as `ClipDraft` rows. Adjust each clip's start/end, deselect clips
   you do not want, and override caption style per clip. The AI's original range
   is kept separately (`aiStartSeconds` / `aiEndSeconds`) so a reset is possible.
6. **Render**: Confirmed segments go back to Modal in `render` mode
7. **View & Download**: Open the upload detail page for the clip gallery and
   download the vertical videos

### Credits & Billing

- New accounts start with 3 free credits (`User.credits` defaults to 3)
- Credits are deducted per generated clip, one each — a completed 3-clip run
  spends the whole trial balance. A run that produces no clips consumes
  nothing; a partial run (fewer clips than requested, even after an error)
  deducts one credit per clip it did generate.
- Paid plans run on **Polar**, not Stripe: `/api/checkout`, `/api/portal`, and
  `/api/webhooks/polar`, with `Subscription` and `Order` rows in the database
- Billing lives at `/dashboard/billing` and the whole flow is gated by
  `NEXT_PUBLIC_SUBSCRIPTION_ENABLED`

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
  "clip_count": 3,
  "language": "Korean",
  "callback_url": "https://a-pch.com/api/webhooks/modal",
  "uploaded_file_id": "clx...",
  "mode": "auto"
}
```

- `s3_key` and `clip_count` are required. `clip_count` has no default — omitting
  it returns `422`.
- `language`: `"English"` or `"Korean"` (default `"Korean"`).
- `mode`: `"auto"` (transcribe → detect → render), `"analyze"` (stop after
  detection, for the review step), or `"render"` (render supplied `moments`).
  Default `"auto"`.
- `callback_url` decides the execution model. With it the call is dispatched via
  `.spawn()` and returns immediately; without it the endpoint runs the pipeline
  synchronously and returns its result.
- `moments`, `transcript_s3_key`, `output_prefix`, and `attempt` are used by
  `render` mode.

**Response** (async — `callback_url` present):

```json
{
  "status": "accepted",
  "call_id": "fc-..."
}
```

Without `callback_url` the endpoint returns the pipeline result itself rather
than an acknowledgement.

### Processing Details

**Input**: MP4 video uploaded to S3 bucket `ai-podcast-clipper-hamsoo`

**Output**:

- English: `{s3_key_dir}/clip_{index}_en.mp4`
- Korean: `{s3_key_dir}/clip_{index}_kr.mp4`

**Constraints**:

- Clips per video: 1-4, chosen by the user (default 3)
- Clip duration: 30-90 seconds — moments outside the range are dropped
- Timeout: 3600 seconds (60 minutes)
- GPU: L40S (48GB VRAM)

## Development

### Repository Structure

```
ApcH/
├── package.json                    # npm workspaces: apps/*, packages/*
├── .env                            # single file, shared by both apps and Prisma
├── apps/
│   ├── web/                        # a-pch.com — the product
│   │   └── src/
│   │       ├── app/                # Next.js App Router
│   │       ├── fsd/                # Feature-Sliced Design
│   │       │   ├── pages/          # page components
│   │       │   ├── widgets/        # composite blocks
│   │       │   ├── features/       # server actions + interactions
│   │       │   ├── entities/       # domain models
│   │       │   └── shared/         # analytics, ui, lib
│   │       └── inngest/            # async video pipeline workers
│   ├── admin/                      # admin.a-pch.com — internal dashboard
│   │   └── src/
│   │       ├── app/                # /login, /analytics, /observability
│   │       ├── analytics/          # aggregation queries
│   │       └── auth/               # standalone auth (ADMIN_EMAILS allowlist)
│   └── backend/                    # Python (Modal). No package.json, so not an npm workspace
└── packages/
    └── db/                         # @repo/db
        ├── prisma/schema.prisma    # database schema
        └── src/analytics-contract.ts   # event names, funnels, shared types
```

`packages/db` exists so the analytics contract has exactly one definition. `web`
writes events and `admin` aggregates them; if the contract were duplicated,
renaming an event on one side would still compile on the other and the dashboard
would silently report zero.

### Backend Structure

```
apps/backend/
├── main.py                     # Modal app entry point
├── asd/                        # Columbia ASD model
│   ├── Columbia_test.py        # Active speaker detection
│   ├── ASD.py                  # Model architecture
│   └── weight/                 # Model weights
├── requirements.txt            # Python dependencies (torch pinned, so are its peers)
├── CLAUDE.md                   # backend conventions, incl. where the venv lives
└── ytdownload.py               # YouTube download utility
```

### Key Components

**Frontend Pages**:

- `/` - Feature showcase homepage
- `/dashboard` - User dashboard with upload queue
- `/dashboard/uploads/[uploadedFileId]` - Clip review, gallery, and processing timeline
- `/dashboard/billing` - Plan and credit balance (Polar)
- `/login`, `/signup`, `/privacy`, `/terms`
- `(public-marketing)/` - marketing and SEO route group: `/pricing`, `/features`,
  `/how-it-works`, `/product-tour`, `/compare`, `/guides/[slug]`, `/about`,
  `/contact`, `/security`, `/changelog`, and the landing pages
  `/ai-podcast-clipper`, `/podcast-to-shorts`, `/youtube-shorts-generator`

**Backend Functions**:

- `transcribe_video()` - WhisperX word-level transcription
- `identify_moments()` - Gemini Q&A extraction
- `process_clip()` - Complete clip processing pipeline
- `create_vertical_video()` - Smart crop and vertical conversion
- `create_subtitles_with_ffmpeg()` - English subtitle overlay
- `create_korean_subtitles_with_ffmpeg()` - Korean translation and subtitles

## Known Issues & Limitations

- Korean translation may fallback to English on API errors
- Temporary directories are always cleaned up in production (also after a failure — intended, containers are reused); on a local `modal run`, set `KEEP_TEMP_ON_FAILURE=1` to keep them after a failure for debugging

## License

Private project - All rights reserved

## Acknowledgments

- **Columbia ASD**: LR-ASD model from IJCV 2025
- **WhisperX**: Fast automatic speech recognition with word-level timestamps
- **T3 Stack**: Type-safe Next.js starter template
- **shadcn/ui**: Beautifully designed component library
