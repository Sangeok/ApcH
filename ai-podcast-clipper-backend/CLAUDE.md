# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

AI-powered podcast clipper backend that automatically extracts short-form clips (30-60s) from long-form podcast videos. The system performs:

1. **Transcription**: Word-level timestamps using WhisperX
2. **Moment Detection**: AI-powered identification of Q&A segments using Gemini
3. **Speaker Detection**: Active speaker detection using LR-ASD model
4. **Video Processing**: Vertical video creation with smart face tracking and cropping
5. **Subtitle Generation**: Automated subtitle overlay with custom styling

Deployed on Modal.com for serverless GPU execution with L40S GPUs.

## Development Commands

### Local Testing

```bash
# Run the Modal function locally (calls deployed endpoint)
modal run main.py

# Deploy to Modal
modal deploy main.py

# Check Modal app status
modal app list
```

### Testing Credentials

The local entrypoint uses hardcoded test credentials:

- S3 key: `test2/testmin30.mp4`
- Auth token: `123123`

## Architecture

### Modal Serverless Execution

- **Container Image**: CUDA 12.4 + Python 3.12 with GPU support
- **GPU**: L40S with 900s timeout
- **Persistent Volume**: `/root/.cache/torch` for model caching (prevents redownloads)
- **Secrets**: `ai-podcast-clipper-secret` contains AWS credentials, auth token, and Gemini API key

### Processing Pipeline (main.py)

**Entry Point**: `process_video()` FastAPI endpoint

- Bearer token authentication required
- Accepts S3 key, downloads video from `ai-podcast-clipper-hamsoo` bucket
- Creates temporary directory `/tmp/<run_id>` for processing

**Stage 1: Transcription** (`transcribe_video()`)

- WhisperX large-v2 model with CUDA acceleration
- Outputs word-level segments with start/end timestamps
- Returns JSON array: `[{"start": float, "end": float, "word": str}, ...]`

**Stage 2: Moment Identification** (`identify_moments()`)

- Gemini 2.5 Flash with structured JSON output
- Prompt engineering for Q&A extraction (30-60s clips)
- Critical constraints: no overlap, sentence boundaries, max 60s
- Returns: `[{"start": seconds, "end": seconds}, ...]`

**Stage 3: Clip Processing** (`process_clip()` for each moment)

1. **Video Segmentation**: FFmpeg extracts clip from original video
2. **Columbia ASD**: Active speaker detection via `asd/Columbia_test.py`
   - Face detection with S3FD
   - Face tracking across frames
   - Active speaker scoring
   - Outputs: `tracks.pckl`, `scores.pckl` in `pywork/`
3. **Vertical Video**: `create_vertical_video()`
   - Smart cropping: follows highest-scoring speaker face
   - Fallback: blurred background with centered content
   - 1080x1920 output with GPU-accelerated encoding
4. **Subtitle Overlay**: `create_subtitles_with_ffmpeg()`
   - ASS format with Anton font (140px, white with shadow)
   - Max 5 words per subtitle
   - Bottom-aligned (margin: 50px)
5. **S3 Upload**: Final clip uploaded to same directory as source

### Columbia ASD Integration (asd/)

Third-party active speaker detection model (LR-ASD from IJCV 2025). Key workflow:

1. Deletes and recreates output directory on each run
2. Extracts frames to `pyframes/`, audio to `pyavi/audio.wav`
3. Scene detection → face detection → face tracking
4. Crops face clips to `pycrop/*.avi` with corresponding audio
5. Runs ASD model inference, outputs scores to `pywork/scores.pckl`

**Important**: Columbia script expects video file at `{videoFolder}/{videoName}.mp4` and uses `weight/finetuning_TalkSet.model` for optimal podcast performance.

## Critical Implementation Details

### Timestamp Alignment

- WhisperX provides word-level timestamps relative to original video
- Clip subtitles must offset by `clip_start` time
- Always use `max(0.0, timestamp - clip_start)` for relative positioning

### Columbia ASD Directory Structure

Columbia script deletes `savePath` directory on initialization. To preserve clip segments:

1. Copy segment to `base_dir/{clip_name}.mp4` (outside `clip_dir`)
2. Run Columbia script with `--videoName {clip_name} --videoFolder {base_dir}`
3. Columbia creates `clip_dir/` with all processing subdirectories

### Video Encoding

- **Vertical video creation**: Uses `ffmpegcv.VideoWriterNV` for GPU acceleration
- **Subtitle overlay**: FFmpeg with ASS filter (`-vf "ass={subtitle_path}"`)
- **Final encoding**: H.264 with CRF 23, AAC audio at 128K

### Face Tracking Logic

For each frame, select face with highest 60-frame rolling average score:

- Window: `[fidx-30 : fidx+30]` clamped to score array bounds
- Negative scores trigger fallback to resize mode (blurred background)
- Positive scores enable crop mode (face tracking)

## Environment Variables (Modal Secret)

- `AWS_ACCESS_KEY_ID`: S3 access
- `AWS_SECRET_ACCESS_KEY`: S3 secret
- `AWS_DEFAULT_REGION`: Default is `ap-southeast-2`
- `GEMINI_API_KEY`: For moment identification
- `AUTH_TOKEN`: Bearer token for endpoint authentication

## Dependencies

Key packages in requirements.txt:

- `modal==1.2.1`: Serverless deployment
- `whisperx`: Transcription with word-level alignment
- `google-genai`: Gemini API for moment detection
- `torch/torchaudio/torchvision`: CUDA 12.1 builds for GPU
- `ffmpegcv`: GPU-accelerated video I/O
- `pysubs2`: ASS subtitle generation
- `boto3`: S3 operations

## Current Known Issues

- Only processes first 3 clips from identified moments (hardcoded `[:3]` in line 482)
- Gemini responses may include markdown code fences that need stripping
- No error handling for failed S3 uploads
- Temporary directories cleaned up regardless of processing success

## CRITICAL: File Editing on Windows

### ⚠️ MANDATORY: Always Use Backslashes on Windows for File Paths

**When using Edit or MultiEdit tools on Windows, you MUST use backslashes (`\`) in file paths, NOT forward slashes (`/`).**

#### ❌ WRONG - Will cause errors:

```
Edit(file_path: "D:/repos/project/file.tsx", ...)
MultiEdit(file_path: "D:/repos/project/file.tsx", ...)
```

#### ✅ CORRECT - Always works:

```
Edit(file_path: "D:\repos\project\file.tsx", ...)
MultiEdit(file_path: "D:\repos\project\file.tsx", ...)
```
