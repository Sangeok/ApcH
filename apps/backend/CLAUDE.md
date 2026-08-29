# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

AI-powered podcast clipper backend that automatically extracts short-form clips (30-90s) from long-form podcast videos. The system performs:

1. **Transcription**: Word-level timestamps using WhisperX
2. **Moment Detection**: AI-powered identification of Q&A segments using Gemini
3. **Speaker Detection**: Active speaker detection using LR-ASD model
4. **Video Processing**: Vertical video creation with smart face tracking and cropping
5. **Subtitle Generation**: Automated subtitle overlay with custom styling

Deployed on Modal.com for serverless GPU execution with L40S GPUs.

## Development Commands

### Local venv

이 앱은 `.venv` 를 저장소 안에 두지 않는다. 저장소가 OneDrive 동기화 폴더
(`OneDrive/Desktop/git/ApcH`) 안에 있어서, 수 GB짜리 torch/CUDA 패키지가
그대로 클라우드로 업로드되고 OneDrive 스캐너가 `site-packages` 하위에
디렉터리 핸들을 잡는다. 실제로 이 핸들 때문에 폴더 rename 이 막힌 적이 있다.

```bash
# 위치: OneDrive 밖
C:\Users\hamso\venvs\apch-backend

# 재생성
python -m venv C:\Users\hamso\venvs\apch-backend
C:\Users\hamso\venvs\apch-backend\Scripts\python.exe -m pip install -r requirements.txt

# 사용
C:\Users\hamso\venvs\apch-backend\Scripts\activate
```

Modal 은 배포 시 `requirements.txt` 로 자체 이미지를 빌드하므로, 이 venv 는
로컬에서 파이썬을 직접 돌릴 때만 필요하다. 배포에는 없어도 된다.

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

### 자동 검증 (테스트)

저장소 루트에서, **맨 파이썬으로** 돈다. venv도 GPU도 필요 없다.

```bash
python -m unittest discover -s apps/backend -p "test_*.py"
python -m py_compile apps/backend/main.py
```

**stdlib `unittest`를 쓰는 이유**: `requirements.txt`는 Modal이 GPU 이미지를 빌드하는 입력이다.
pytest 같은 테스트 전용 패키지를 넣으면 L40S 이미지가 그만큼 불어난다. `unittest`는 표준 라이브러리라 아무것도 더하지 않는다.

**`main.py`를 import하는 테스트는 돌지 않는다.** 최상단 `import whisperx`가 torch/transformers를 끌어오고,
그 패키지들은 저장소 밖 venv에만 있다. 따라서 검증 가능한 판단 로직은 **stdlib만 import하는 별도 모듈**로 뺀다.

```
main.py             ← I/O·GPU·네트워크 껍데기
<규칙모듈>.py        ← stdlib만. 판단·계산·분기
test_<규칙모듈>.py   ← unittest
```

`backend-purity-contract: stdlib-only; torch/boto3/cv2/pysubs2/modal forbidden`

이건 `apps/admin`의 `analytics-reporting-contract: import-free`와 같은 계약이고,
`apps/web`의 `clip-count-budget`·`caption-presets`가 같은 형태다.

**⚠️ 테스트가 0개여도 종료 코드는 0이다.** 출력이 `NO TESTS RAN`이면 통과가 아니다 —
`Ran N tests ... OK`의 N을 눈으로 확인한다.

GPU·S3·Gemini·Modal이 필요한 경로는 이 러너로 덮을 수 없다. 배포와 실행 검증(`modal run`)은 사용자가 한다.

## Architecture

### Modal Serverless Execution

- **Container Image**: CUDA 12.4 + Python 3.12 with GPU support
- **GPU**: L40S with 3600s timeout
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
- Prompt engineering for Q&A extraction (30-90s clips)
- Critical constraints: no overlap, sentence boundaries, max 90s. The bounds live in `MAX_CLIP_DURATION` / `MIN_CLIP_DURATION` (`main.py:104-105`) and are shared by the analyze, render, and auto paths
- Returns: `[{"start": seconds, "end": seconds, "type": "qa" | "insight", "hook": str, "payoff": str}, ...]`. `type`, `hook`, and `payoff` were added after the original start/end pair and are consumed at `main.py:1104-1106`

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
4. **Subtitle Overlay**: `create_subtitles_with_ffmpeg()` (English) / `create_korean_subtitles_with_ffmpeg()` (Korean)
   - ASS format. The style is not fixed: `resolve_caption_style()` (`main.py:152`) layers a user-supplied `caption_style` over per-language defaults, silently falling back on anything missing or invalid — a default-styled render beats a failed one
   - Defaults differ by language:

     | | English (`main.py:288-291`) | Korean (`main.py:404-407`) |
     |---|---|---|
     | font | Anton (`main.py:355`) | Noto Sans KR (`main.py:550`) |
     | fontsize | 122 | 130 |
     | words per line | 5 | 3 |
     | marginv | 165 | 155 |
     | outline width | 1.1 | 1.3 |

   - Alignment defaults to `middle` (ASS alignment 5); `top` is 8 and `bottom` is 2 (`main.py:127-131`)
   - `marginv` uses the per-language default only for `middle`. `top` uses 200 and `bottom` uses 260 (`main.py:134-137`)
   - Accepted user values: `fontSize` 60–200, `maxWordsPerLine` 1–8, `color` and `outlineColor` as `#RRGGBB` (defaulting to white and black), `outlineWidth` 0–6, `uppercase` as a boolean (applied to the event text, so it only changes Latin characters in a Korean line)
   - **pysubs2 `SSAStyle` attribute names carry no underscore** — `primarycolor`, `outlinecolor`, `borderstyle`, `backcolor`. It is a dataclass, so assigning `primary_color` raises nothing and silently renders the default. That exact typo shipped once and made every user-picked caption color render white
5. **S3 Upload**: Final clip uploaded to same directory as source. Transient failures (throttling, timeouts, connection errors) retry with capped exponential backoff via `_s3_call_with_retry` (`main.py`), whose decisions live in the stdlib-pure `s3_upload_policy.py`; a final failure raises with the operation, key, and attempt count in the message (BUG-03)

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

- Gemini responses may include markdown code fences that need stripping
- Temporary directories are removed in `finally` regardless of outcome by design (warm containers reuse `/tmp`); set `KEEP_TEMP_ON_FAILURE=1` on a local `modal run` to keep them after a failure. The decision lives in the stdlib-pure `temp_cleanup_policy.py` (`should_cleanup_temp_dir`, BUG-04)

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
