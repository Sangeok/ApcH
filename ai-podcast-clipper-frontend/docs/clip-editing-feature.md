# Clip Editing Feature - Implementation Documentation

## 1. Overview

### 1.1 Feature Description
기존에 생성된 클립의 시간(시작/종료)과 자막 유무를 편집하여 새로운 영상을 재렌더링하는 기능

### 1.2 MVP Scope
| 기능 | MVP 포함 | 비고 |
|------|----------|------|
| 시간 편집 (시작/종료) | O | 원본 클립 범위 내에서 조정 |
| 자막 on/off 토글 | O | 자막 포함/제외 선택 |
| 자막 스타일 편집 | X | 추후 확장 |
| 오디오 볼륨 조절 | X | 추후 확장 |
| 배경 음악 추가 | X | 추후 확장 |

### 1.3 Business Rules
- **크레딧 정책**: 재렌더링마다 1크레딧 차감
- **최소 길이**: 클립은 최소 10초 이상
- **시간 범위**: 원본 클립의 시작/종료 시간 범위 내에서만 조정 가능
- **권한**: 본인이 생성한 클립만 편집 가능

---

## 2. System Architecture

### 2.1 High-Level Flow
```
┌─────────────────┐     ┌──────────────────┐     ┌─────────────────┐
│   Frontend      │     │   Server Action   │     │  Modal Backend  │
│  ClipEditModal  │────▶│   rerenderClip   │────▶│  rerender_clip  │
└─────────────────┘     └──────────────────┘     └─────────────────┘
        │                        │                        │
        │                        ▼                        │
        │               ┌──────────────────┐              │
        │               │   Credit Check   │              │
        │               │   & Validation   │              │
        │               └──────────────────┘              │
        │                        │                        │
        ▼                        │                        ▼
┌─────────────────┐              │              ┌─────────────────┐
│  Canvas Preview │              │              │   FFmpeg        │
│  (Client-side)  │              │              │   Processing    │
└─────────────────┘              │              └─────────────────┘
                                 │                        │
                                 ▼                        ▼
                        ┌──────────────────┐     ┌─────────────────┐
                        │   DB Update      │◀────│   S3 Upload     │
                        │  (Clip.s3Key)    │     │   (New Video)   │
                        └──────────────────┘     └─────────────────┘
```

### 2.2 Data Flow
1. **Edit 버튼 클릭** → ClipEditModal 열림
2. **설정 조정** → Canvas 미리보기로 확인
3. **Re-render 클릭** → 크레딧 확인 경고
4. **Server Action 호출** → 소유권/크레딧 검증
5. **Modal Backend 호출** → 영상 재처리
6. **S3 업로드** → 새 클립 저장
7. **DB 업데이트** → Clip.s3Key 변경, 크레딧 차감
8. **UI 갱신** → 새 영상 표시

---

## 3. Backend Implementation

### 3.1 New Request Model

**File**: `ai-podcast-clipper-backend/main.py`

```python
class RerenderClipRequest(BaseModel):
    """클립 재렌더링 요청 모델"""
    clip_s3_key: str           # 현재 클립의 S3 키
    original_s3_key: str       # 원본 영상의 S3 키 (UploadedFile.s3Key)
    new_start_seconds: float   # 조정된 시작 시간 (초)
    new_end_seconds: float     # 조정된 종료 시간 (초)
    subtitles_enabled: bool    # 자막 포함 여부
    language: str              # "English" | "Korean"
```

### 3.2 New Endpoint: `/rerender-clip`

**Location**: `AiPodcastClipper` 클래스 내부

```python
@modal.fastapi_endpoint(method="POST")
def rerender_clip(
    self,
    request: RerenderClipRequest,
    token: HTTPAuthorizationCredentials = Depends(auth_scheme)
):
    """
    클립을 사용자 설정에 맞게 재렌더링합니다.

    Processing Steps:
    1. 원본 영상 S3 다운로드
    2. 시간 범위 추출 (FFmpeg -ss -t)
    3. Columbia ASD 실행 (화자 감지)
    4. Vertical video 생성 (1080x1920)
    5. 자막 적용 (조건부)
    6. S3 업로드

    Returns:
        {
            "status": "ok" | "error",
            "new_s3_key": str | None,
            "script_text": str | None,
            "error_message": str | None
        }
    """
```

### 3.3 Processing Logic

```python
def rerender_clip(self, request: RerenderClipRequest, token):
    # 1. 인증 검증
    if token.credentials != os.environ["AUTH_TOKEN"]:
        raise HTTPException(status_code=401, detail="Unauthorized")

    run_id = str(uuid.uuid4())
    base_dir = pathlib.Path("/tmp") / run_id
    base_dir.mkdir(parents=True, exist_ok=True)

    try:
        # 2. 원본 영상 다운로드
        video_path = base_dir / "original.mp4"
        s3_client.download_file(BUCKET_NAME, request.original_s3_key, str(video_path))

        # 3. 시간 범위 추출
        segment_path = base_dir / "segment.mp4"
        duration = request.new_end_seconds - request.new_start_seconds
        extract_cmd = f"ffmpeg -i {video_path} -ss {request.new_start_seconds} -t {duration} -c copy {segment_path}"
        subprocess.run(extract_cmd, shell=True, check=True)

        # 4. Columbia ASD 실행 (화자 감지 + 트래킹)
        # process_clip과 유사한 로직 사용
        columbia_commands = (
            "python Columbia_test.py "
            f"--videoName segment "
            f"--videoFolder {str(base_dir)} "
            f"--pretrainModel weight/finetuning_TalkSet.model"
        )
        subprocess.run(columbia_commands, cwd="/asd", shell=True, check=True)

        # tracks, scores 로드
        with open(base_dir / "segment" / "pywork" / "tracks.pckl", "rb") as f:
            tracks = pickle.load(f)
        with open(base_dir / "segment" / "pywork" / "scores.pckl", "rb") as f:
            scores = pickle.load(f)

        # 5. Vertical video 생성
        vertical_path = base_dir / "vertical.mp4"
        create_vertical_video(
            tracks, scores,
            pyframes_path, pyavi_path,
            audio_path, str(vertical_path)
        )

        # 6. 자막 적용 (조건부)
        script_text = None
        if request.subtitles_enabled:
            # 세그먼트 트랜스크립션
            transcript_json = self.transcribe_video(base_dir, segment_path)
            segments = json.loads(transcript_json)

            final_path = base_dir / "final.mp4"

            if request.language == "Korean":
                script_text = create_korean_subtitles_with_ffmpeg(
                    segments, 0, duration,
                    str(vertical_path), str(final_path),
                    self.gemini_client, max_word=3
                )
            else:
                script_text = create_subtitles_with_ffmpeg(
                    segments, 0, duration,
                    str(vertical_path), str(final_path),
                    max_word=5
                )
        else:
            final_path = vertical_path

        # 7. S3 업로드
        s3_key_dir = os.path.dirname(request.clip_s3_key)
        timestamp = int(time.time())
        new_s3_key = f"{s3_key_dir}/clip_edit_{timestamp}.mp4"

        s3_client.upload_file(str(final_path), BUCKET_NAME, new_s3_key)

        return {
            "status": "ok",
            "new_s3_key": new_s3_key,
            "script_text": script_text,
        }

    except Exception as e:
        return {
            "status": "error",
            "error_message": str(e),
            "new_s3_key": None,
            "script_text": None,
        }
    finally:
        shutil.rmtree(base_dir, ignore_errors=True)
```

---

## 4. Frontend Implementation

### 4.1 Directory Structure

```
src/fsd/
├── features/
│   └── clip/
│       ├── api/
│       │   ├── index.ts          # Export all actions
│       │   └── rerender.ts       # NEW: rerenderClip action
│       └── model/
│           └── schemas.ts        # Add rerenderClipSchema
├── shared/
│   └── hooks/
│       └── useClipEdit.ts        # NEW: Edit state management
└── widgets/
    └── clip-display/
        └── ui/
            └── _component/
                ├── ClipCard.tsx       # MODIFY: Add edit modal
                ├── ClipActions.tsx    # MODIFY: Add Edit button
                ├── ClipEditModal.tsx  # NEW: Main edit modal
                ├── CanvasPreview.tsx  # NEW: Video preview
                └── TimeRangeEditor.tsx # NEW: Time inputs
```

### 4.2 Server Action: `rerenderClip`

**File**: `src/fsd/features/clip/api/rerender.ts`

```typescript
"use server";

import { z } from "zod";
import { auth } from "~/server/auth";
import { db } from "~/server/db";
import { env } from "~/env";
import { ActionResult, success, failure } from "~/fsd/shared/api/result";
import { revalidatePath } from "next/cache";
import { deleteS3Object } from "~/fsd/shared/api/s3";

// 입력 스키마
export const rerenderClipSchema = z.object({
  clipId: z.string().cuid(),
  newStartSeconds: z.number().min(0),
  newEndSeconds: z.number().min(0),
  subtitlesEnabled: z.boolean(),
});

export type RerenderClipInput = z.infer<typeof rerenderClipSchema>;

export async function rerenderClip(
  input: RerenderClipInput
): Promise<ActionResult<{ newS3Key: string }>> {
  // 1. 인증 확인
  const session = await auth();
  if (!session?.user?.id) {
    return failure("로그인이 필요합니다.");
  }

  // 2. 입력 검증
  const validated = rerenderClipSchema.safeParse(input);
  if (!validated.success) {
    return failure(validated.error.issues[0]?.message ?? "잘못된 입력입니다.");
  }

  const { clipId, newStartSeconds, newEndSeconds, subtitlesEnabled } = validated.data;

  try {
    // 3. 클립 조회 및 소유권 확인
    const clip = await db.clip.findUnique({
      where: { id: clipId, userId: session.user.id },
      include: {
        uploadedFile: true,
        user: { select: { credits: true } },
      },
    });

    if (!clip) {
      return failure("클립을 찾을 수 없습니다.");
    }

    // 4. 시간 범위 검증
    const originalStart = clip.startSeconds ?? 0;
    const originalEnd = clip.endSeconds ?? 60;

    if (newStartSeconds < originalStart || newEndSeconds > originalEnd) {
      return failure("시간 범위가 원본 클립을 벗어났습니다.");
    }

    if (newEndSeconds - newStartSeconds < 10) {
      return failure("클립 길이는 최소 10초 이상이어야 합니다.");
    }

    // 5. 크레딧 확인
    if (clip.user.credits < 1) {
      return failure("크레딧이 부족합니다. 크레딧을 충전해주세요.");
    }

    // 6. Modal Backend 호출
    const response = await fetch(env.RERENDER_CLIP_ENDPOINT, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${env.PROCESS_VIDEO_ENDPOINT_AUTH}`,
      },
      body: JSON.stringify({
        clip_s3_key: clip.s3Key,
        original_s3_key: clip.uploadedFile?.s3Key,
        new_start_seconds: newStartSeconds,
        new_end_seconds: newEndSeconds,
        subtitles_enabled: subtitlesEnabled,
        language: clip.uploadedFile?.language ?? "English",
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error("Rerender failed:", errorText);
      return failure("재렌더링에 실패했습니다. 다시 시도해주세요.");
    }

    const result = await response.json();

    if (result.status !== "ok" || !result.new_s3_key) {
      return failure(result.error_message ?? "재렌더링에 실패했습니다.");
    }

    // 7. 이전 S3 키 저장
    const oldS3Key = clip.s3Key;

    // 8. DB 업데이트
    await db.clip.update({
      where: { id: clipId },
      data: {
        s3Key: result.new_s3_key,
        startSeconds: newStartSeconds,
        endSeconds: newEndSeconds,
        scriptText: subtitlesEnabled ? result.script_text : null,
      },
    });

    // 9. 크레딧 차감
    await db.user.update({
      where: { id: session.user.id },
      data: { credits: { decrement: 1 } },
    });

    // 10. 이전 S3 파일 삭제
    await deleteS3Object(oldS3Key);

    // 11. 캐시 무효화
    revalidatePath("/dashboard");

    return success({ newS3Key: result.new_s3_key });
  } catch (error) {
    console.error("Rerender clip error:", error);
    return failure("예기치 않은 오류가 발생했습니다.");
  }
}
```

### 4.3 Component: ClipEditModal

**File**: `src/fsd/widgets/clip-display/ui/_component/ClipEditModal.tsx`

```typescript
"use client";

import type { Clip } from "generated/prisma";
import { useState, useTransition, useCallback } from "react";
import { toast } from "sonner";
import { X, Loader2, AlertCircle } from "lucide-react";
import { Button } from "~/fsd/shared/ui/atoms/button";
import { Switch } from "~/fsd/shared/ui/atoms/switch";
import { Label } from "~/fsd/shared/ui/atoms/label";
import { rerenderClip } from "~/fsd/features/clip/api/rerender";
import { CanvasPreview } from "./CanvasPreview";
import { TimeRangeEditor } from "./TimeRangeEditor";

interface ClipEditModalProps {
  clip: Clip;
  playUrl: string | null;
  isOpen: boolean;
  onClose: () => void;
  onRerendered: () => void;
}

interface EditState {
  startSeconds: number;
  endSeconds: number;
  subtitlesEnabled: boolean;
}

export function ClipEditModal({
  clip,
  playUrl,
  isOpen,
  onClose,
  onRerendered,
}: ClipEditModalProps) {
  const originalStart = clip.startSeconds ?? 0;
  const originalEnd = clip.endSeconds ?? 60;

  const [editState, setEditState] = useState<EditState>({
    startSeconds: originalStart,
    endSeconds: originalEnd,
    subtitlesEnabled: true,
  });

  const [isRendering, startRendering] = useTransition();

  const hasChanges =
    editState.startSeconds !== originalStart ||
    editState.endSeconds !== originalEnd ||
    !editState.subtitlesEnabled;

  const handleRerender = useCallback(() => {
    startRendering(async () => {
      const result = await rerenderClip({
        clipId: clip.id,
        newStartSeconds: editState.startSeconds,
        newEndSeconds: editState.endSeconds,
        subtitlesEnabled: editState.subtitlesEnabled,
      });

      if (result.success) {
        toast.success("클립이 성공적으로 재렌더링되었습니다.");
        onRerendered();
        onClose();
      } else {
        toast.error(result.error ?? "재렌더링에 실패했습니다.");
      }
    });
  }, [clip.id, editState, onRerendered, onClose]);

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60"
      role="dialog"
      aria-modal="true"
      aria-labelledby="edit-modal-title"
    >
      <div className="relative w-full max-w-2xl rounded-xl bg-zinc-900 p-6 shadow-2xl">
        {/* Header */}
        <div className="mb-6 flex items-center justify-between">
          <h2 id="edit-modal-title" className="text-xl font-semibold text-white">
            클립 편집
          </h2>
          <button
            onClick={onClose}
            className="rounded-full p-1 hover:bg-zinc-800"
            aria-label="닫기"
          >
            <X className="h-5 w-5 text-zinc-400" />
          </button>
        </div>

        {/* Preview */}
        <div className="mb-6">
          <CanvasPreview
            videoUrl={playUrl}
            startSeconds={editState.startSeconds}
            endSeconds={editState.endSeconds}
            showSubtitles={editState.subtitlesEnabled}
          />
        </div>

        {/* Time Editor */}
        <div className="mb-6">
          <TimeRangeEditor
            originalStart={originalStart}
            originalEnd={originalEnd}
            currentStart={editState.startSeconds}
            currentEnd={editState.endSeconds}
            onStartChange={(value) =>
              setEditState((s) => ({ ...s, startSeconds: value }))
            }
            onEndChange={(value) =>
              setEditState((s) => ({ ...s, endSeconds: value }))
            }
          />
        </div>

        {/* Subtitle Toggle */}
        <div className="mb-6 flex items-center justify-between rounded-lg bg-zinc-800 p-4">
          <div>
            <Label htmlFor="subtitles-toggle" className="text-white">
              자막 포함
            </Label>
            <p className="text-sm text-zinc-400">
              자막을 포함하여 재렌더링합니다
            </p>
          </div>
          <Switch
            id="subtitles-toggle"
            checked={editState.subtitlesEnabled}
            onCheckedChange={(checked) =>
              setEditState((s) => ({ ...s, subtitlesEnabled: checked }))
            }
          />
        </div>

        {/* Credit Warning */}
        <div className="mb-6 flex items-center gap-2 rounded-lg bg-amber-900/30 p-3 text-amber-200">
          <AlertCircle className="h-5 w-5 flex-shrink-0" />
          <span className="text-sm">
            재렌더링 시 <strong>1 크레딧</strong>이 차감됩니다.
          </span>
        </div>

        {/* Actions */}
        <div className="flex justify-end gap-3">
          <Button variant="outline" onClick={onClose} disabled={isRendering}>
            취소
          </Button>
          <Button
            onClick={handleRerender}
            disabled={isRendering || !hasChanges}
          >
            {isRendering ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                렌더링 중... (약 30-60초)
              </>
            ) : (
              "재렌더링"
            )}
          </Button>
        </div>
      </div>
    </div>
  );
}
```

### 4.4 Component: TimeRangeEditor

**File**: `src/fsd/widgets/clip-display/ui/_component/TimeRangeEditor.tsx`

```typescript
"use client";

import { Input } from "~/fsd/shared/ui/atoms/input";
import { Label } from "~/fsd/shared/ui/atoms/label";

interface TimeRangeEditorProps {
  originalStart: number;
  originalEnd: number;
  currentStart: number;
  currentEnd: number;
  onStartChange: (value: number) => void;
  onEndChange: (value: number) => void;
}

export function TimeRangeEditor({
  originalStart,
  originalEnd,
  currentStart,
  currentEnd,
  onStartChange,
  onEndChange,
}: TimeRangeEditorProps) {
  const duration = currentEnd - currentStart;
  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = (seconds % 60).toFixed(1);
    return `${mins}:${secs.padStart(4, "0")}`;
  };

  return (
    <div className="rounded-lg bg-zinc-800 p-4">
      <div className="mb-4 grid grid-cols-2 gap-4">
        {/* Start Time */}
        <div>
          <Label htmlFor="start-time" className="text-zinc-300">
            시작 시간 (초)
          </Label>
          <Input
            id="start-time"
            type="number"
            step="0.1"
            min={originalStart}
            max={currentEnd - 10}
            value={currentStart}
            onChange={(e) => onStartChange(parseFloat(e.target.value) || 0)}
            className="mt-1"
          />
          <p className="mt-1 text-xs text-zinc-500">
            최소: {formatTime(originalStart)}
          </p>
        </div>

        {/* End Time */}
        <div>
          <Label htmlFor="end-time" className="text-zinc-300">
            종료 시간 (초)
          </Label>
          <Input
            id="end-time"
            type="number"
            step="0.1"
            min={currentStart + 10}
            max={originalEnd}
            value={currentEnd}
            onChange={(e) => onEndChange(parseFloat(e.target.value) || 0)}
            className="mt-1"
          />
          <p className="mt-1 text-xs text-zinc-500">
            최대: {formatTime(originalEnd)}
          </p>
        </div>
      </div>

      {/* Duration Display */}
      <div className="flex items-center justify-between border-t border-zinc-700 pt-3">
        <span className="text-sm text-zinc-400">클립 길이</span>
        <span className="font-mono text-lg text-white">
          {formatTime(duration)}
        </span>
      </div>

      {/* Validation Message */}
      {duration < 10 && (
        <p className="mt-2 text-sm text-red-400">
          클립 길이는 최소 10초 이상이어야 합니다.
        </p>
      )}
    </div>
  );
}
```

### 4.5 Component: CanvasPreview

**File**: `src/fsd/widgets/clip-display/ui/_component/CanvasPreview.tsx`

```typescript
"use client";

import { useEffect, useRef, useState } from "react";
import { Play, Pause } from "lucide-react";
import { Button } from "~/fsd/shared/ui/atoms/button";

interface CanvasPreviewProps {
  videoUrl: string | null;
  startSeconds: number;
  endSeconds: number;
  showSubtitles: boolean;
}

export function CanvasPreview({
  videoUrl,
  startSeconds,
  endSeconds,
  showSubtitles,
}: CanvasPreviewProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(startSeconds);

  // Video to Canvas rendering
  useEffect(() => {
    const video = videoRef.current;
    const canvas = canvasRef.current;
    if (!video || !canvas) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const renderFrame = () => {
      // Draw video frame
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

      // Draw subtitle indicator
      if (showSubtitles) {
        ctx.fillStyle = "rgba(0, 0, 0, 0.7)";
        ctx.fillRect(0, canvas.height - 60, canvas.width, 60);
        ctx.fillStyle = "white";
        ctx.font = "14px sans-serif";
        ctx.textAlign = "center";
        ctx.fillText("자막 미리보기", canvas.width / 2, canvas.height - 30);
      }

      // Continue rendering if playing
      if (!video.paused && video.currentTime < endSeconds) {
        requestAnimationFrame(renderFrame);
      }
    };

    video.addEventListener("play", renderFrame);
    video.addEventListener("seeked", renderFrame);

    return () => {
      video.removeEventListener("play", renderFrame);
      video.removeEventListener("seeked", renderFrame);
    };
  }, [showSubtitles, endSeconds]);

  // Seek to start when times change
  useEffect(() => {
    const video = videoRef.current;
    if (video) {
      video.currentTime = startSeconds;
      setCurrentTime(startSeconds);
    }
  }, [startSeconds]);

  // Handle time updates
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    const handleTimeUpdate = () => {
      setCurrentTime(video.currentTime);
      if (video.currentTime >= endSeconds) {
        video.pause();
        video.currentTime = startSeconds;
        setIsPlaying(false);
      }
    };

    video.addEventListener("timeupdate", handleTimeUpdate);
    return () => video.removeEventListener("timeupdate", handleTimeUpdate);
  }, [startSeconds, endSeconds]);

  const togglePlayback = () => {
    const video = videoRef.current;
    if (!video) return;

    if (isPlaying) {
      video.pause();
    } else {
      if (video.currentTime >= endSeconds) {
        video.currentTime = startSeconds;
      }
      video.play();
    }
    setIsPlaying(!isPlaying);
  };

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, "0")}`;
  };

  if (!videoUrl) {
    return (
      <div className="flex h-64 items-center justify-center rounded-lg bg-zinc-800">
        <p className="text-zinc-500">영상을 불러올 수 없습니다</p>
      </div>
    );
  }

  return (
    <div className="relative">
      {/* Hidden video element */}
      <video
        ref={videoRef}
        src={videoUrl}
        className="hidden"
        crossOrigin="anonymous"
      />

      {/* Canvas for preview */}
      <canvas
        ref={canvasRef}
        width={270}
        height={480}
        className="mx-auto rounded-lg bg-black"
      />

      {/* Playback controls */}
      <div className="mt-3 flex items-center justify-center gap-4">
        <Button variant="outline" size="sm" onClick={togglePlayback}>
          {isPlaying ? (
            <Pause className="h-4 w-4" />
          ) : (
            <Play className="h-4 w-4" />
          )}
        </Button>
        <span className="font-mono text-sm text-zinc-400">
          {formatTime(currentTime)} / {formatTime(endSeconds)}
        </span>
      </div>

      {/* Timeline progress */}
      <div className="mx-auto mt-2 h-1 w-64 rounded-full bg-zinc-700">
        <div
          className="h-full rounded-full bg-blue-500 transition-all"
          style={{
            width: `${((currentTime - startSeconds) / (endSeconds - startSeconds)) * 100}%`,
          }}
        />
      </div>
    </div>
  );
}
```

### 4.6 Modifications: ClipCard & ClipActions

**ClipCard.tsx** - Add edit modal state:
```typescript
// Add state
const [isEditOpen, setIsEditOpen] = useState<boolean>(false);

// Add to ClipActions props
onEdit={() => setIsEditOpen(true)}

// Add modal
<ClipEditModal
  clip={clip}
  playUrl={playUrl}
  isOpen={isEditOpen}
  onClose={() => setIsEditOpen(false)}
  onRerendered={() => {
    // Refresh the clip
    router.refresh();
  }}
/>
```

**ClipActions.tsx** - Add Edit menu item:
```typescript
// Add prop
onEdit: () => void;

// Add menu item after "YouTube Metadata"
<DropdownMenuItem onClick={onEdit} className="cursor-pointer">
  <Pencil className="mr-2 h-4 w-4" />
  Edit
</DropdownMenuItem>
```

---

## 5. Environment Configuration

### 5.1 Backend Deployment

```bash
# Modal 배포
cd ai-podcast-clipper-backend
modal deploy main.py
```

배포 후 엔드포인트 URL 확인:
- 기존: `https://...modal.run/process_video`
- 신규: `https://...modal.run/rerender_clip`

### 5.2 Frontend Environment

**File**: `src/env.js`

```javascript
// server schema에 추가
RERENDER_CLIP_ENDPOINT: z.string().url(),
```

**.env.local** 추가:
```
RERENDER_CLIP_ENDPOINT=https://your-modal-endpoint.modal.run/rerender_clip
```

---

## 6. Database Schema (Optional)

MVP에서는 ClipEdit 모델 없이 직접 Clip 업데이트로 구현합니다.
추후 편집 히스토리 추적이 필요할 경우:

```prisma
model ClipEdit {
  id              String   @id @default(cuid())

  previousS3Key   String   // 이전 S3 키
  newS3Key        String?  // 새 S3 키 (성공 시)

  newStartSeconds Float
  newEndSeconds   Float
  subtitlesEnabled Boolean

  status          String   @default("pending") // pending, completed, failed
  errorMessage    String?

  clip            Clip     @relation(fields: [clipId], references: [id], onDelete: Cascade)
  clipId          String

  user            User     @relation(fields: [userId], references: [id], onDelete: Cascade)
  userId          String

  createdAt       DateTime @default(now())
  completedAt     DateTime?
}
```

---

## 7. Testing Checklist

### 7.1 Unit Tests
- [ ] `rerenderClipSchema` 유효성 검사
- [ ] 시간 범위 검증 로직
- [ ] 크레딧 부족 시 에러 처리

### 7.2 Integration Tests
- [ ] Server action → Modal endpoint 통신
- [ ] DB 업데이트 (s3Key, startSeconds, endSeconds)
- [ ] 크레딧 차감 검증
- [ ] S3 파일 삭제 검증

### 7.3 E2E Tests
- [ ] Edit 버튼 클릭 → 모달 열림
- [ ] 시간 조정 → Canvas 미리보기 업데이트
- [ ] Re-render → 로딩 → 성공 토스트
- [ ] 새 영상 재생 확인

---

## 8. Error Handling

| Error | User Message | Action |
|-------|--------------|--------|
| 인증 실패 | 로그인이 필요합니다 | 로그인 페이지 리다이렉트 |
| 클립 미발견 | 클립을 찾을 수 없습니다 | 모달 닫기 |
| 시간 범위 초과 | 시간 범위가 원본 클립을 벗어났습니다 | 입력 유효성 표시 |
| 최소 길이 미만 | 클립 길이는 최소 10초 이상이어야 합니다 | 입력 유효성 표시 |
| 크레딧 부족 | 크레딧이 부족합니다 | 크레딧 충전 안내 |
| Backend 오류 | 재렌더링에 실패했습니다 | 재시도 버튼 |
| Network 오류 | 네트워크 오류가 발생했습니다 | 재시도 버튼 |

---

## 9. Future Enhancements

### Phase 2 (자막 스타일)
- 폰트 선택 (Anton, Noto Sans KR, etc.)
- 색상 선택 (primary color, shadow color)
- 위치 조정 (상단, 중앙, 하단)
- 크기 조정

### Phase 3 (오디오 편집)
- 볼륨 조절 (0-200%)
- 배경 음악 라이브러리
- 페이드 인/아웃 효과

### Phase 4 (고급 기능)
- 프레임 단위 미세 조정
- 다중 클립 일괄 편집
- 편집 프리셋 저장/불러오기

---

## 10. Implementation Timeline

| Phase | Task | Estimated |
|-------|------|-----------|
| 1 | Backend endpoint 구현 | 1-2일 |
| 2 | Frontend server action | 0.5일 |
| 3 | ClipEditModal UI | 1일 |
| 4 | CanvasPreview | 1일 |
| 5 | TimeRangeEditor | 0.5일 |
| 6 | Integration & Testing | 1일 |
| **Total** | | **5-6일** |

---

## Appendix: File Changes Summary

### New Files
- `ai-podcast-clipper-frontend/src/fsd/features/clip/api/rerender.ts`
- `ai-podcast-clipper-frontend/src/fsd/widgets/clip-display/ui/_component/ClipEditModal.tsx`
- `ai-podcast-clipper-frontend/src/fsd/widgets/clip-display/ui/_component/CanvasPreview.tsx`
- `ai-podcast-clipper-frontend/src/fsd/widgets/clip-display/ui/_component/TimeRangeEditor.tsx`

### Modified Files
- `ai-podcast-clipper-backend/main.py` - Add RerenderClipRequest, rerender_clip endpoint
- `ai-podcast-clipper-frontend/src/env.js` - Add RERENDER_CLIP_ENDPOINT
- `ai-podcast-clipper-frontend/src/fsd/features/clip/api/index.ts` - Re-export rerenderClip
- `ai-podcast-clipper-frontend/src/fsd/features/clip/model/schemas.ts` - Add rerenderClipSchema
- `ai-podcast-clipper-frontend/src/fsd/widgets/clip-display/ui/_component/ClipCard.tsx` - Add edit modal
- `ai-podcast-clipper-frontend/src/fsd/widgets/clip-display/ui/_component/ClipActions.tsx` - Add Edit button
