# 클립 생성 전 편집(Pre-generation Clip Review & Edit) 기능 개발 문서

Date: 2026-07-20
Status: Proposal (구현 전)

---

## 1. 배경/동기

### 비즈니스 맥락 (사용자 브리프)

현재 프로젝트에서는 생성되는 클립에 대해 사용자가 개입할 수 있는 지점이 없다. 업로드 시 언어와 클립 개수만 고르면, 어떤 구간이 클립으로 만들어질지·자막이 어떤 모양으로 입혀질지는 전적으로 시스템이 결정하고 결과물만 받아본다. 이번 기능의 목표는 **클립이 실제로 생성(GPU 렌더링)되기 전에, "어떤 구간을 어떻게 자를지"(구간 편집)와 "캡션(자막)을 어떤 스타일·위치로 입힐지"(캡션 편집)를 사용자가 검토하고 편집할 수 있게** 하는 것이다. 특히 캡션 스타일/위치 편집은 사용자가 명시한 핵심 요구사항이다.

### 기술적 맥락 (코드베이스에서 확인)

현재 파이프라인은 한 번의 Modal 호출 안에서 끝까지 진행되는 단일 단계 구조다 (`ai-podcast-clipper-backend/main.py`의 `_do_process_video`, main.py:825-954):

1. S3에서 원본 다운로드
2. WhisperX 전사 (`transcribe_video`, main.py:693-738) — 단어 단위 타임스탬프
3. Gemini 하이라이트 추출 (`identify_moments`, main.py:740-821) — `clip_count * 2`개 요청, `{start, end, type, hook, payoff}` 배열 반환
4. 30~90초 범위 검증 후 `validated_moments[:clip_count]`를 순회하며 `process_clip` (main.py:559-675) — ffmpeg 구간 절단 → Columbia ASD → 세로 영상 → 자막 → S3 업로드
5. 완료/실패 콜백 → 프론트엔드 웹훅 (`src/app/api/webhooks/modal/route.ts`) → Inngest 이벤트 → `processVideo` 함수가 Clip 레코드 생성 및 크레딧 차감 (`src/inngest/functions.ts`)

캡션(자막) 관점에서도 개입 지점이 없다. 자막 스타일은 `create_subtitles_with_ffmpeg`(영어, main.py:164-263)와 `create_korean_subtitles_with_ffmpeg`(한국어, main.py:265-452) 내부에 전부 하드코딩되어 있다 — 폰트(Anton / Noto Sans KR), 크기(122/130), 색상(흰색), 외곽선/그림자, 정렬(`alignment = 5`), 세로 마진(`marginv` 165/155), 줄당 단어 수(`max_word` 5/3). 자막은 FFmpeg ASS 필터로 영상에 burn-in되므로(main.py:255-259, 445-448) 생성 후에는 자막만 바꿀 수 없고, 사용 가능한 폰트는 Modal 컨테이너 이미지에 설치된 2종뿐이다(main.py:40-45).

이 구조에서 사용자 개입 지점이 없는 이유는 **2~3단계(분석)와 4단계(렌더링)가 한 호출에 붙어 있기 때문**이다. 비용 구조상으로도 4단계(클립당 Columbia ASD + 세로 영상 인코딩)가 GPU 시간의 대부분을 차지하므로, 분석 결과를 먼저 보여주고 사용자가 확정한 구간만 렌더링하면 "마음에 안 드는 클립을 통째로 재처리"하는 낭비도 줄어든다.

---

## 2. 목표 상태

### 목표

- 업로드 시 **"Review before generate"(생성 전 검토)** 모드를 선택할 수 있다. 선택하지 않으면 기존 자동 파이프라인이 그대로 동작한다.
- 검토 모드에서는 백엔드가 **전사 + 하이라이트 추출까지만** 수행하고, AI가 제안한 후보 구간(최대 `clip_count * 2`개)을 프론트엔드 DB에 `ClipDraft`로 저장한 뒤 업로드 상태를 `review_pending`으로 전환한다.
- 업로드 상세 페이지에서 사용자는 후보 구간별로:
  - 원본 영상을 해당 구간으로 시크(seek)해 미리 듣고/보고,
  - 시작/종료 시각을 조정하고 (단어 타임스탬프 스냅 지원),
  - 생성할 후보를 선택/제외하고,
  - **캡션 스타일(위치 상/중/하, 글자 크기, 색상, 줄당 단어 수)을 클립별로 편집**하고 9:16 목업 캔버스의 근사 미리보기로 확인하고,
  - AI 원안(구간)·기본 스타일(캡션)로 리셋할 수 있다.
- "Generate clips" 확정 시 선택된 구간만 백엔드로 전달되어 렌더링(ASD + 세로 영상 + 자막)이 수행되고, 이후 흐름(클립 저장, 크레딧 차감, 상태 전이)은 기존과 동일하다.
- 분석 단계에서 생성한 **단어 단위 전사 JSON을 S3에 저장**해 렌더 단계에서 재전사 없이 재사용한다 (GPU 시간 절약 + 편집 UI의 단어 스냅 데이터로도 사용).

### 비목표

- **생성 후 편집(re-render)**: 이미 생성된 클립의 구간 수정/재렌더링은 이번 범위가 아니다 (기존 "Reprocess"가 전체 재분석으로 대체 수단 역할).
- **완전 커스텀 구간 추가**: v1은 AI가 제안한 후보의 조정/선택만 지원한다. 사용자가 전사 텍스트에서 임의 구간을 새로 만드는 기능은 v2 (Open Questions 참고).
- **폰트 변경·자막 세부 타이포그래피**: 폰트는 컨테이너 이미지에 설치된 2종(Anton / Noto Sans KR)으로 언어에 고정된다. outline·그림자·자간 등 세부 값도 v1에서는 기존 기본값을 유지한다. 클립별 언어 선택도 범위 밖.
- **정확한 WYSIWYG 캡션 미리보기**: 검토 화면의 미리보기는 CSS 근사(9:16 목업 + 원본 중앙 크롭 배경)다. 실제 출력은 ASS 렌더 + ASD 크롭이므로 폰트 메트릭·배경 구도가 미리보기와 다를 수 있다.
- **세로 크롭 미리보기**: ASD는 렌더 단계에만 실행되므로 크롭 결과 미리보기는 불가능.
- **파형(waveform)·썸네일 타임라인 스크러버**: v1은 시간 입력 + 스텝 버튼 + 단어 스냅으로 충분.

### 성공 기준

- 검토 모드 업로드가 `review_pending` 상태에 도달하고, `ClipDraft`가 1개 이상 생성되며, `{uploadPrefix}/transcript.json`이 S3에 존재한다.
- 후보 구간의 시작/종료를 조정·저장한 뒤 확정하면, **선택한 개수만큼** 클립이 생성되고 각 Clip 레코드의 `startSeconds`/`endSeconds`가 편집한 값과 일치한다.
- 검토 화면에서 지정한 캡션 스타일(위치/크기/색/줄당 단어 수)이 생성된 클립의 자막에 반영된다 (예: 위치 bottom 선택 시 ASS `alignment = 2`로 생성). 캡션 스타일을 건드리지 않은 클립과 자동 모드 클립의 자막 출력은 변경 전과 동일하다.
- 자동 모드(기존) 업로드의 동작·상태 전이·크레딧 차감이 변경 전과 동일하다.
- 크레딧은 기존과 동일하게 **렌더 완료 시점에 clipsFound 만큼만** 차감된다 (`completeUploadedFileProcessingAttempt`, `src/fsd/entities/uploaded-file/api/index.ts`).
- `npm run check`(lint + typecheck)가 통과한다.

---

## 3. 대안 분석

### Option A: 단일 파이프라인 중간 일시정지 (Inngest `waitForEvent`로 사용자 확정 대기)

`processVideo` 함수 내부에서 분석 후 `step.waitForEvent("user/clips.confirmed")`로 사용자 입력을 기다리는 방식.

- 장점: 상태 머신 변경 최소화. Modal 호출 1회로 유지 가능(분석 후 대기 → 같은 컨테이너에서 렌더).
- 단점:
  - `processVideo`는 `concurrency: { limit: 1, key: "event.data.userId" }`(src/inngest/functions.ts:264-267)라서, 사용자가 며칠 검토를 미루면 **그 사용자의 다른 업로드 전체가 블로킹**된다.
  - 업로드는 `processing` 상태로 남아 stale 정책(`processingTimeoutMs: 2h`, `src/fsd/entities/uploaded-file/model/stale-policy.ts`)이 `worker_timeout`으로 강제 실패시킨다.
  - Modal 컨테이너도 대기 시간 동안 유지 불가(타임아웃 3600초, main.py:678).

### Option B: 2-phase 분리 — 분석 attempt와 렌더 attempt를 별도 실행으로 나누고 사이에 `review_pending` 상태를 둠 (선택)

분석은 attempt N으로 실행되어 `review_pending`에서 멈추고, 사용자가 확정하면 **기존 `scheduleProcessingAttempt` 흐름 그대로** attempt N+1이 렌더용으로 스케줄된다. `ProcessingDispatch`에 `kind`("auto" | "analyze" | "render") 컬럼만 추가해 디스패처가 보낼 이벤트를 구분한다.

- 장점:
  - `pending_enqueue → queued → processing → (터미널)` 상태 머신, attempt 증가, dispatch, stale 회수, one-processing-per-user 가드(partial unique index, prisma/schema.prisma:94-98 주석)를 **전부 재사용**한다.
  - `review_pending`은 워커가 없는 "사용자 대기" 상태라 stale 회수 대상이 아니다 (`reconcileStaleUploadedFileForUser`는 active 상태만 처리, src/fsd/entities/uploaded-file/api/index.ts:936).
  - 렌더 재시도 = 새 attempt 생성이므로 `@@unique([uploadedFileId, attempt])`(ProcessingDispatch) 제약 변경이 불필요하다.
  - 클립 산출물이 렌더 attempt의 `attempt-{N+1}/` prefix에 기록되어 기존 `persistGeneratedClips`/`findAttemptGeneratedClipKeys` 로직이 그대로 동작한다.
- 단점: Modal 호출이 2회(분석 1 + 렌더 1)로 늘어 원본 다운로드가 2번 발생한다. 전사는 S3 재사용으로 1회로 유지.
- 주의(설계에 반영됨): 분석과 렌더가 **별도 Inngest 함수**(`analyzeVideo` / `processVideo`)이므로, 각자 함수 스코프 concurrency를 선언하면 **유저당 직렬화가 깨진다**(Inngest 함수 레벨 concurrency는 함수 ID별 독립 큐 — 같은 key라도 서로를 직렬화하지 않는다). 한 유저가 분석 중인 업로드와 렌더 중인 업로드를 동시에 굴리면 두 함수가 동시에 돌아 one-processing-per-user 인덱스에서 한쪽이 밀려나고, 밀려난 attempt는 재디스패치 없이 `queued`에 갇혔다 stale 타임아웃으로 실패한다. 이를 막기 위해 **두 함수 모두 account 스코프의 동일 concurrency 키**(`{ scope: "account", key: "event.data.userId", limit: 1 }`)를 쓴다(4.7(b) 수정 3 / 4.7(c)). 그래야 기존 auto 흐름과 동일하게 "유저당 1개 실행 + 나머지는 Inngest 큐 대기 후 자동 실행"이 성립한다.

### Option C: 업로드 직후 동기 분석 (프론트엔드에서 분석 API를 직접 await)

- 장점: Inngest/상태 머신 변경 없음.
- 단점: WhisperX 전사는 수 분~수십 분 소요. Vercel 서버리스 함수와 브라우저 요청이 그 시간을 버틸 수 없고, Modal 엔드포인트도 이미 `spawn` 기반 비동기 설계다(main.py:970-981). 실패 복구 상태가 DB에 남지 않는다.

### 선택: Option B

- 근거: 기존 attempt/dispatch/claim/stale 아키텍처가 이미 "한 번의 실행 단위"를 안전하게 다루도록 정교하게 짜여 있다 (PR #65 processing-concurrency-hardening 반영). 분석과 렌더를 각각 그 실행 단위에 태우는 것이 신규 코드가 가장 적고, 실패 모드가 기존과 동일해 예측 가능하다.

---

## 4. 구현 계획

### 4.0 전체 흐름 (검토 모드)

```
[업로드: reviewBeforeGenerate=true]
        │ scheduleUploadedFileProcessing (기존)
        ▼
attempt N: pending_enqueue → queued ──(dispatch kind="analyze")──▶ Inngest analyzeVideo
        │                                                              │ Modal mode="analyze"
        │                                                              │  - WhisperX 전사
        │                                                              │  - transcript.json S3 저장
        │                                                              │  - Gemini 후보 추출(≤ clipCount*2)
        ▼                                                              ▼
   processing ◀──────────────────────────── 콜백(phase="analyze", moments[])
        │ ClipDraft 저장, reviewAttempt=N, transcriptS3Key 저장
        ▼
  review_pending  ◀━━ 사용자: 구간 조정 / 선택 / 캡션 스타일 편집 / 리셋 (ClipDraft 편집)
        │ confirmClipDraftsAndGenerate
        ▼
attempt N+1: pending_enqueue → queued ──(dispatch kind="render", moments 포함)──▶ Inngest processVideo (기존 + moments 전달)
        │                                                              │ Modal mode="render"
        │                                                              │  - transcript.json 재사용
        │                                                              │  - 선택 구간만 process_clip
        ▼                                                              ▼
   processing → processed (기존 완료 경로: Clip 저장, 크레딧 차감)
```

자동 모드(`reviewBeforeGenerate=false`)는 dispatch kind="auto"로 기존 경로가 바이트 단위로 동일하게 동작한다.

### 4.1 신규 코드

| 파일 | 역할 |
|------|------|
| `ai-podcast-clipper-frontend/prisma/schema.prisma` 내 `ClipDraft` 모델 | AI 후보 구간 + 사용자 편집값 저장 |
| `src/fsd/entities/clip-draft/api/index.ts` | ClipDraft CRUD (server-only) |
| `src/fsd/entities/clip-draft/model/types.ts` | ClipDraft DTO 타입 |
| `src/fsd/entities/clip-draft/index.ts` | 엔티티 배럴 export |
| `src/fsd/features/clip-review/api/index.ts` | 서버 액션: 전사 URL 조회, draft 구간/캡션 편집 저장 (확정·렌더 스케줄은 기존 `features/upload/api`에 추가 — 4.8) |
| `src/fsd/features/clip-review/model/schemas.ts` | zod 검증 스키마 |
| `src/fsd/features/clip-review/index.ts` | 피처 배럴 export |
| `src/fsd/widgets/clip-draft-review/ui/index.tsx` | 검토/편집 섹션 위젯 |
| `src/fsd/widgets/clip-draft-review/ui/_component/ClipDraftCard.tsx` | 후보 카드 (구간 조정 UI) |
| `src/fsd/widgets/clip-draft-review/ui/_component/CaptionStyleEditor.tsx` | 캡션 스타일 편집 + 9:16 근사 미리보기 |
| `src/fsd/widgets/clip-draft-review/model/use-clip-draft-review.ts` | 편집/확정 mutation 훅 |

### 4.2 데이터 모델 변경 (`prisma/schema.prisma`)

**`UploadedFile` 모델**

Before (prisma/schema.prisma:62-98):

```prisma
model UploadedFile {
    id                    String   @id @default(cuid())
    s3Key                 String
    displayName           String?
    uploaded              Boolean  @default(false)
    status                String   @default("upload_pending") // upload_pending, pending_enqueue, queued, processing, processed, failed, no credits
    createdAt             DateTime @default(now())
    updatedAt             DateTime @updatedAt
    sourceUploadedAt      DateTime?
    enqueueRequestedAt    DateTime?
    queuedAt              DateTime?
    processingStartedAt   DateTime?
    terminalStatusAt      DateTime?
    currentAttempt        Int      @default(0)
    lastSuccessfulAttempt Int      @default(0)
    failureCode           String?
    language              String   @default("English")
    targetClipCount       Int      @default(3)
    userId                String

    clips      Clip[]
    dispatches ProcessingDispatch[]

    user User @relation(fields: [userId], references: [id], onDelete: Cascade)

    @@index([s3Key])
    @@index([status, processingStartedAt])
    @@index([status, uploaded, processingStartedAt, queuedAt])
    @@index([status, uploaded, createdAt])
    @@index([status, uploaded, sourceUploadedAt])
    @@index([userId, status, createdAt])
    @@index([userId, createdAt])
    // Partial unique index "UploadedFile_one_processing_per_user_idx"
    // (userId WHERE status = 'processing') enforces one processing run per user.
    // Defined in migration 20260630000000_one_processing_per_user_index because
    // Prisma cannot express partial indexes in the schema.
}
```

After (필드 4개 + relation 1개 추가, status 주석에 `review_pending` 추가):

```prisma
model UploadedFile {
    id                    String   @id @default(cuid())
    s3Key                 String
    displayName           String?
    uploaded              Boolean  @default(false)
    status                String   @default("upload_pending") // upload_pending, pending_enqueue, queued, processing, review_pending, processed, failed, no credits
    createdAt             DateTime @default(now())
    updatedAt             DateTime @updatedAt
    sourceUploadedAt      DateTime?
    enqueueRequestedAt    DateTime?
    queuedAt              DateTime?
    processingStartedAt   DateTime?
    terminalStatusAt      DateTime?
    currentAttempt        Int      @default(0)
    lastSuccessfulAttempt Int      @default(0)
    failureCode           String?
    language              String   @default("English")
    targetClipCount       Int      @default(3)
    // Pre-generation review mode. When true, processing runs analyze -> review -> render.
    reviewBeforeGenerate  Boolean  @default(false)
    // The analysis attempt whose ClipDrafts are currently under review / were confirmed.
    reviewAttempt         Int?
    reviewReadyAt         DateTime?
    transcriptS3Key       String?
    userId                String

    clips      Clip[]
    dispatches ProcessingDispatch[]
    clipDrafts ClipDraft[]

    user User @relation(fields: [userId], references: [id], onDelete: Cascade)

    @@index([s3Key])
    @@index([status, processingStartedAt])
    @@index([status, uploaded, processingStartedAt, queuedAt])
    @@index([status, uploaded, createdAt])
    @@index([status, uploaded, sourceUploadedAt])
    @@index([userId, status, createdAt])
    @@index([userId, createdAt])
    // Partial unique index "UploadedFile_one_processing_per_user_idx"
    // (userId WHERE status = 'processing') enforces one processing run per user.
    // Defined in migration 20260630000000_one_processing_per_user_index because
    // Prisma cannot express partial indexes in the schema.
}
```

**`ClipDraft` 모델 (신규)**

```prisma
model ClipDraft {
    id             String   @id @default(cuid())
    uploadedFileId String
    // Analysis attempt that produced this draft (UploadedFile.reviewAttempt).
    attempt        Int
    // Gemini ranking order (0 = most engaging).
    index          Int

    // Immutable AI proposal (reset target).
    aiStartSeconds Float
    aiEndSeconds   Float

    // User-editable range. Initialized to the AI values.
    startSeconds   Float
    endSeconds     Float

    clipType       String?
    hook           String?
    payoff         String?
    selected       Boolean  @default(true)

    // Per-clip caption style override. null = language defaults (backend hardcoded values).
    // Shape: shared CaptionStyle type (src/fsd/shared/config/constants.ts),
    // validated by captionStyleSchema (features/clip-review/model/schemas.ts).
    captionStyle   Json?

    createdAt      DateTime @default(now())
    updatedAt      DateTime @updatedAt

    uploadedFile UploadedFile @relation(fields: [uploadedFileId], references: [id], onDelete: Cascade)

    @@unique([uploadedFileId, attempt, index])
    @@index([uploadedFileId, attempt])
}
```

**`ProcessingDispatch` 모델**

Before (prisma/schema.prisma:126-145):

```prisma
model ProcessingDispatch {
    id             String   @id @default(cuid())
    uploadedFileId String
    attempt        Int
    status         String   @default("pending") // pending, sending, sent, retryable_failed, dead_letter
    dispatchCount  Int      @default(0)
    lastError      String?
    dispatchedAt   DateTime?
    nextRetryAt    DateTime?
    lockedAt       DateTime?
    createdAt      DateTime @default(now())
    updatedAt      DateTime @updatedAt

    uploadedFile UploadedFile @relation(fields: [uploadedFileId], references: [id], onDelete: Cascade)

    @@unique([uploadedFileId, attempt])
    @@index([status, nextRetryAt])
    @@index([status, createdAt])
    @@index([status, lockedAt])
}
```

After (`kind` 컬럼만 추가 — 렌더는 항상 새 attempt이므로 `@@unique([uploadedFileId, attempt])`는 그대로 유지):

```prisma
model ProcessingDispatch {
    id             String   @id @default(cuid())
    uploadedFileId String
    attempt        Int
    kind           String   @default("auto") // auto, analyze, render
    status         String   @default("pending") // pending, sending, sent, retryable_failed, dead_letter
    dispatchCount  Int      @default(0)
    lastError      String?
    dispatchedAt   DateTime?
    nextRetryAt    DateTime?
    lockedAt       DateTime?
    createdAt      DateTime @default(now())
    updatedAt      DateTime @updatedAt

    uploadedFile UploadedFile @relation(fields: [uploadedFileId], references: [id], onDelete: Cascade)

    @@unique([uploadedFileId, attempt])
    @@index([status, nextRetryAt])
    @@index([status, createdAt])
    @@index([status, lockedAt])
}
```

마이그레이션: 전부 additive(기본값 있는 컬럼 추가 + 신규 테이블)라 기존 row와 충돌하지 않는다. `npm run db:generate` → `npm run db:migrate` (frontend CLAUDE.md의 Database 명령).

### 4.3 백엔드 변경 (`ai-podcast-clipper-backend/main.py`)

**행동 불변식: `mode`를 보내지 않는 기존 요청(auto)은 변경 전과 동일하게 동작해야 한다.** Pydantic 기본값 `mode: str = "auto"` 덕분에 프론트엔드보다 백엔드를 먼저 배포해도 안전하다.

**(a) `ProcessVideoRequest`**

Before (main.py:26-33):

```python
class ProcessVideoRequest(BaseModel):
    s3_key: str
    language: str = "Korean"
    clip_count: int
    attempt: int | None = None
    output_prefix: str | None = None
    callback_url: str | None = None
    uploaded_file_id: str | None = None
```

After:

```python
class ProcessVideoRequest(BaseModel):
    s3_key: str
    language: str = "Korean"
    clip_count: int
    # auto: 기존 단일 파이프라인 / analyze: 전사+후보 추출만 / render: 전달받은 구간만 렌더링
    mode: str = "auto"
    # render 모드 전용: [{"index": int, "start": float, "end": float, "type": str|None,
    #   "hook": str|None, "payoff": str|None,
    #   "caption_style": {"position": str, "fontSize": int|None, "color": str|None, "maxWordsPerLine": int|None} | None}]
    moments: list[dict] | None = None
    # render 모드 전용: 분석 단계에서 저장한 전사 JSON의 S3 키 (없거나 로드 실패 시 재전사)
    transcript_s3_key: str | None = None
    attempt: int | None = None
    output_prefix: str | None = None
    callback_url: str | None = None
    uploaded_file_id: str | None = None
```

**(b) 클립 길이 상수 모듈 레벨로 승격 + 검증 헬퍼 추가** (현재 상수는 `_do_process_video` 내부 지역 변수, main.py:881-882)

```python
# 클립 길이 제한: analyze/render/auto 모든 경로가 공유
MAX_CLIP_DURATION = 90
MIN_CLIP_DURATION = 30

def validate_moments(clip_moments, video_duration: float | None = None) -> list:
    """30~90초 범위(및 옵션으로 영상 길이 범위)를 벗어난 구간을 걸러낸다."""
    validated = []
    for moment in clip_moments:
        start = moment.get("start")
        end = moment.get("end")
        if start is None or end is None:
            continue
        duration = end - start
        if duration < MIN_CLIP_DURATION or duration > MAX_CLIP_DURATION:
            print(f"Skipping moment ({duration:.1f}s): outside [{MIN_CLIP_DURATION}, {MAX_CLIP_DURATION}]s range")
            continue
        if video_duration is not None and (start < 0 or end > video_duration):
            print(f"Skipping moment ({start:.1f}-{end:.1f}s): outside video duration {video_duration:.1f}s")
            continue
        validated.append(moment)
    return validated
```

**(b-2) 캡션 스타일 해석 헬퍼 추가** — 프론트엔드가 보낸 `caption_style` dict를 ASS 스타일 값으로 변환한다. **모든 기본값은 기존 하드코딩 값과 동일해야 한다 (`caption_style`이 None이면 출력 불변).** `re`는 이미 import되어 있다(main.py:21).

```python
# 캡션 위치 → ASS alignment (numpad 표기). "middle"(5)이 기존 하드코딩 값.
CAPTION_POSITION_ALIGNMENT = {
    "top": 8,
    "middle": 5,
    "bottom": 2,
}

# top/bottom 선택 시 사용할 세로 마진 초기값. 시각 튜닝 대상 (Open Questions 참고).
CAPTION_POSITION_MARGINV = {
    "top": 200,
    "bottom": 260,
}

def parse_hex_color(value):
    """'#RRGGBB' 문자열을 pysubs2.Color로 변환. 형식이 아니면 None."""
    if not isinstance(value, str):
        return None
    m = re.fullmatch(r"#?([0-9a-fA-F]{6})", value.strip())
    if not m:
        return None
    r, g, b = (int(m.group(1)[i:i + 2], 16) for i in (0, 2, 4))
    return pysubs2.Color(r, g, b)

def resolve_caption_style(caption_style, *, default_fontsize: int, default_max_word: int, default_marginv: int) -> dict:
    """사용자 캡션 스타일을 언어별 기본값 위에 얹어 ASS 스타일 파라미터로 해석한다.

    잘못된/누락된 값은 조용히 기본값으로 대체한다 (렌더 실패보다 기본 스타일 출력이 낫다).
    """
    style = caption_style if isinstance(caption_style, dict) else {}

    position = style.get("position")
    if position not in CAPTION_POSITION_ALIGNMENT:
        position = "middle"

    fontsize = style.get("fontSize")
    if not isinstance(fontsize, (int, float)) or not (60 <= fontsize <= 200):
        fontsize = default_fontsize

    max_word = style.get("maxWordsPerLine")
    if not isinstance(max_word, int) or not (1 <= max_word <= 8):
        max_word = default_max_word

    primary_color = parse_hex_color(style.get("color")) or pysubs2.Color(255, 255, 255)

    return {
        "alignment": CAPTION_POSITION_ALIGNMENT[position],
        "marginv": default_marginv if position == "middle" else CAPTION_POSITION_MARGINV[position],
        "fontsize": int(fontsize),
        "max_word": max_word,
        "primary_color": primary_color,
    }
```

**(c) `_do_process_video` — mode 분기**

Before는 main.py:824-954 전체 (auto 단일 경로). After:

```python
    # 실제 영상 처리 (비동기 실행, 완료/실패 시 callback)
    @modal.method()
    def _do_process_video(self, s3_key: str, language: str, clip_count: int, callback_url: str | None, uploaded_file_id: str | None, attempt: int | None = None, output_prefix: str | None = None, mode: str = "auto", moments: list | None = None, transcript_s3_key: str | None = None):
        import requests as req

        clip_results = []
        analyze_payload = None

        run_id = str(uuid.uuid4())
        base_dir = pathlib.Path("/tmp") / run_id
        base_dir.mkdir(parents=True, exist_ok=True)
        video_path = base_dir / "input.mp4"

        # ... (unchanged: AWS 자격 증명 확인 및 s3_client 생성 — 기존 main.py:835-846과 동일)

        try:
            s3_client.download_file("ai-podcast-clipper-hamsoo", s3_key, str(video_path))

            # 1. transcription — render 모드는 저장된 전사를 재사용, 실패 시 재전사
            transcript_segments = None
            if mode == "render" and transcript_s3_key:
                try:
                    obj = s3_client.get_object(Bucket="ai-podcast-clipper-hamsoo", Key=transcript_s3_key)
                    transcript_segments = json.loads(obj["Body"].read())
                    print(f"Reusing stored transcript: {transcript_s3_key}")
                except Exception as e:
                    print(f"Failed to load stored transcript ({e}); falling back to transcription")

            if transcript_segments is None:
                transcript_segments_json = self.transcribe_video(base_dir, video_path)
                transcript_segments = json.loads(transcript_segments_json)
            else:
                transcript_segments_json = json.dumps(transcript_segments)

            if mode == "analyze":
                # 전사 JSON을 업로드 prefix에 저장해 렌더 단계와 편집 UI에서 재사용
                transcript_key = f"{os.path.dirname(s3_key)}/transcript.json"
                s3_client.put_object(
                    Bucket="ai-podcast-clipper-hamsoo",
                    Key=transcript_key,
                    Body=transcript_segments_json.encode("utf-8"),
                    ContentType="application/json",
                )

                # 후보 추출 (기존 auto 경로의 파싱 로직과 동일)
                print("Identifying moments for clips...")
                identified_moments_raws = self.identify_moments(transcript_segments, clip_count * 2)

                raw = identified_moments_raws.strip()
                if raw.startswith("```"):
                    raw = raw[len("```"):].strip()
                    if raw.lower().startswith("json"):
                        raw = raw[4:].lstrip()
                if raw.endswith("```"):
                    raw = raw[:-3].strip()

                try:
                    clip_moments = json.loads(raw)
                except json.JSONDecodeError:
                    print("Error: Identified moments is not valid JSON")
                    clip_moments = []

                if not clip_moments or not isinstance(clip_moments, list):
                    print("Error: Identified moments is not a list")
                    clip_moments = []

                validated_moments = validate_moments(clip_moments)

                analyze_payload = {
                    "transcript_s3_key": transcript_key,
                    "moments": [
                        {
                            "index": idx,
                            "startSeconds": float(m["start"]),
                            "endSeconds": float(m["end"]),
                            "clipType": m.get("type"),
                            "hook": m.get("hook"),
                            "payoff": m.get("payoff"),
                        }
                        for idx, m in enumerate(validated_moments)
                    ],
                }

                if callback_url and uploaded_file_id:
                    req.post(callback_url, json={
                        "uploadedFileId": uploaded_file_id,
                        "attempt": attempt,
                        "status": "ok",
                        "phase": "analyze",
                        **analyze_payload,
                    }, headers={"Authorization": f"Bearer {os.environ.get('MODAL_WEBHOOK_SECRET', '')}"}, timeout=30)

            else:
                # auto: Gemini가 구간 결정 / render: 전달받은 구간 사용
                if mode == "render":
                    video_duration = get_video_duration_seconds(video_path)
                    validated_moments = validate_moments(
                        [
                            {
                                "start": m.get("start"),
                                "end": m.get("end"),
                                "type": m.get("type"),
                                "hook": m.get("hook"),
                                "payoff": m.get("payoff"),
                                "caption_style": m.get("caption_style"),
                            }
                            for m in (moments or [])
                        ],
                        video_duration,
                    )
                else:
                    # 2. Identify moments for clips (기존 auto 경로와 동일)
                    print("Identifying moments for clips...")
                    identified_moments_raws = self.identify_moments(transcript_segments, clip_count * 2)

                    raw = identified_moments_raws.strip()
                    if raw.startswith("```"):
                        raw = raw[len("```"):].strip()
                        if raw.lower().startswith("json"):
                            raw = raw[4:].lstrip()
                    if raw.endswith("```"):
                        raw = raw[:-3].strip()

                    try:
                        clip_moments = json.loads(raw)
                    except json.JSONDecodeError:
                        print("Error: Identified moments is not valid JSON")
                        clip_moments = []

                    if not clip_moments or not isinstance(clip_moments, list):
                        print("Error: Identified moments is not a list")
                        clip_moments = []

                    print(f"Final identified moments: {clip_moments}")
                    validated_moments = validate_moments(clip_moments)

                for index, moment in enumerate(validated_moments[:clip_count]):
                    print(f"Processing clip {index} from {moment['start']} to {moment['end']}")

                    clip_result = process_clip(
                        base_dir,
                        video_path,
                        s3_key,
                        moment["start"],
                        moment["end"],
                        index,
                        transcript_segments,
                        self.gemini_client,
                        language,
                        output_prefix,
                        caption_style=moment.get("caption_style"),
                    )

                    clip_result["clipType"] = moment.get("type")
                    clip_result["hook"] = moment.get("hook")
                    clip_result["payoff"] = moment.get("payoff")

                    clip_results.append(clip_result)

                # 성공 콜백 (기존과 동일 + phase 필드 추가)
                if callback_url and uploaded_file_id:
                    req.post(callback_url, json={
                        "uploadedFileId": uploaded_file_id,
                        "attempt": attempt,
                        "status": "ok",
                        "phase": mode,
                        "clips": clip_results,
                    }, headers={"Authorization": f"Bearer {os.environ.get('MODAL_WEBHOOK_SECRET', '')}"}, timeout=30)

        except Exception as e:
            print(f"Error processing video: {e}")
            # 실패 시에도 콜백 발송 (phase를 포함해 프론트가 분석/렌더 실패를 구분)
            if callback_url and uploaded_file_id:
                try:
                    req.post(callback_url, json={
                        "uploadedFileId": uploaded_file_id,
                        "attempt": attempt,
                        "status": "error",
                        "phase": mode,
                        "error": str(e),
                        "clips": [],
                    }, headers={"Authorization": f"Bearer {os.environ.get('MODAL_WEBHOOK_SECRET', '')}"}, timeout=30)
                except Exception as cb_err:
                    print(f"Failed to send error callback: {cb_err}")
            raise

        finally:
            if base_dir.exists():
                print(f"Cleaning up temp dir after {base_dir}")
                shutil.rmtree(base_dir, ignore_errors=True)

        if mode == "analyze":
            return {
                "status": "ok",
                "phase": "analyze",
                **(analyze_payload or {"moments": []}),
            }

        return {
            "status": "ok",
            "phase": mode,
            "clips_processed": len(clip_results),
            "s3_prefix": output_prefix or os.path.dirname(s3_key),
            "language": language,
            "clips": clip_results,
        }
```

구현 참고:

- auto 경로의 후보 추출·파싱·렌더 루프는 기존 코드(main.py:855-916)를 그대로 옮긴 것이며, 지역 상수 `MAX_CLIP_DURATION`/`MIN_CLIP_DURATION` 선언(main.py:881-882)과 인라인 검증 루프(main.py:884-894)만 모듈 레벨 `validate_moments` 호출로 치환된다.
- analyze/auto의 후보 파싱 블록이 중복이므로 구현 시 `_parse_identified_moments(raw: str) -> list` 헬퍼로 추출하는 것을 권장한다(선택 사항).
- Open Question: `identify_moments`의 Gemini 프롬프트는 "MOST ENGAGING → LEAST" 순 정렬을 지시하지만(main.py:791), 모델 출력 순서는 보장이 아니다. `index`는 응답 순서를 그대로 채택한다.

**(d) `process_video` FastAPI 엔드포인트 — 새 필드 전달**

Before (main.py:958-992)의 `spawn`/`remote` 호출 인자에 세 필드를 추가한다 (인증/분기 로직은 동일):

```python
@app.function(secrets=[modal.Secret.from_name("ai-podcast-clipper-secret")], min_containers=1)
@modal.fastapi_endpoint(method="POST")
def process_video(request: ProcessVideoRequest, token: HTTPAuthorizationCredentials = Depends(auth_scheme)):
    if token.credentials != os.environ["AUTH_TOKEN"]:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Incorrect bearer token",
            headers={"WWW-Authenticate": "Bearer"},
        )

    clipper = AiPodcastClipper()

    if request.callback_url:
        # 비동기 모드: .spawn()으로 즉시 반환, 완료 후 callback_url로 결과 전송
        call = clipper._do_process_video.spawn(
            s3_key=request.s3_key,
            language=request.language,
            clip_count=int(request.clip_count),
            callback_url=request.callback_url,
            uploaded_file_id=request.uploaded_file_id,
            attempt=request.attempt,
            output_prefix=request.output_prefix,
            mode=request.mode,
            moments=request.moments,
            transcript_s3_key=request.transcript_s3_key,
        )
        return {"status": "accepted", "call_id": call.object_id}
    else:
        # 동기 모드 (로컬 개발): Modal 워커에서 동기 실행, 결과 직접 반환
        return clipper._do_process_video.remote(
            s3_key=request.s3_key,
            language=request.language,
            clip_count=int(request.clip_count),
            callback_url=None,
            uploaded_file_id=request.uploaded_file_id,
            attempt=request.attempt,
            output_prefix=request.output_prefix,
            mode=request.mode,
            moments=request.moments,
            transcript_s3_key=request.transcript_s3_key,
        )
```

**(e) 자막 함수 캡션 스타일 파라미터화**

행동 불변식: `caption_style=None`(auto 모드 전체, 스타일 미편집 draft)일 때 세 함수의 출력은 변경 전과 동일해야 한다 — `resolve_caption_style`의 기본값이 기존 하드코딩 값과 같기 때문이다.

`process_clip` 시그니처 (main.py:559) — `caption_style` 파라미터 추가:

Before:

```python
def process_clip(base_dir: str, original_video_path: str, s3_key: str, start_time: float, end_time: float, clip_index: int, transcript_segments: list, gemini_client, selected_language: str, output_prefix: str | None = None):
```

After:

```python
def process_clip(base_dir: str, original_video_path: str, s3_key: str, start_time: float, end_time: float, clip_index: int, transcript_segments: list, gemini_client, selected_language: str, output_prefix: str | None = None, caption_style: dict | None = None):
```

`process_clip` 내부의 자막 함수 호출 2곳 (main.py:638, 649):

Before:

```python
        script_text = create_subtitles_with_ffmpeg(transcript_segments, start_time, end_time, vertical_mp4_path, english_output_path, max_word=5)
```

```python
        script_text = create_korean_subtitles_with_ffmpeg(transcript_segments, start_time, end_time, vertical_mp4_path, korean_output_path, gemini_client, max_word=3)
```

After:

```python
        script_text = create_subtitles_with_ffmpeg(transcript_segments, start_time, end_time, vertical_mp4_path, english_output_path, max_word=5, caption_style=caption_style)
```

```python
        script_text = create_korean_subtitles_with_ffmpeg(transcript_segments, start_time, end_time, vertical_mp4_path, korean_output_path, gemini_client, max_word=3, caption_style=caption_style)
```

`create_subtitles_with_ffmpeg` (main.py:164-263) — 시그니처, `max_word` 해석, 스타일 블록(main.py:225-241)만 변경:

Before (변경되는 스타일 블록):

```python
    style_name = "Default"
    new_style = pysubs2.SSAStyle()
    new_style.fontname = "Anton"
    new_style.fontsize = 122
    new_style.primary_color = pysubs2.Color(255, 255, 255)
    new_style.border_style = 1
    new_style.outline = 1.1
    new_style.shadow = 6.5
    new_style.shadowcolor = pysubs2.Color(12, 12, 12, 210)
    new_style.alignment = 5
    new_style.marginl = 44
    new_style.marginr = 44
    new_style.marginv = 165
    new_style.spacing = 1.8

    subs.styles[style_name] = new_style
```

After (함수 단위):

```python
def create_subtitles_with_ffmpeg(transcript_segments: list, clip_start: float, clip_end: float, clip_video_path: str, output_path: str, max_word: int = 5, caption_style: dict | None = None):
    temp_dir = os.path.dirname(output_path)
    subtitle_path = os.path.join(temp_dir, "temp_subtitles.ass")

    resolved = resolve_caption_style(
        caption_style,
        default_fontsize=122,
        default_max_word=max_word,
        default_marginv=165,
    )
    max_word = resolved["max_word"]

    # ... (unchanged: 클립 범위 필터링, max_word 단위 그룹핑, SSAFile 생성과 info 설정 — 기존 main.py:168-223과 동일)

    # Set subtitles style
    style_name = "Default"
    new_style = pysubs2.SSAStyle()
    new_style.fontname = "Anton"
    new_style.fontsize = resolved["fontsize"]
    new_style.primary_color = resolved["primary_color"]
    new_style.border_style = 1
    new_style.outline = 1.1
    new_style.shadow = 6.5
    new_style.shadowcolor = pysubs2.Color(12, 12, 12, 210)
    new_style.alignment = resolved["alignment"]
    new_style.marginl = 44
    new_style.marginr = 44
    new_style.marginv = resolved["marginv"]
    new_style.spacing = 1.8

    subs.styles[style_name] = new_style

    # ... (unchanged: 이벤트 추가, ASS 저장, FFmpeg 오버레이, script_text 반환 — 기존 main.py:243-263과 동일)
```

`create_korean_subtitles_with_ffmpeg` (main.py:265-452) — 동일 패턴. 시그니처에 `caption_style: dict | None = None` 추가, 함수 시작부에 `resolved = resolve_caption_style(caption_style, default_fontsize=130, default_max_word=max_word, default_marginv=155)` + `max_word = resolved["max_word"]` 삽입, 스타일 블록(main.py:417-432)에서 `korean_style.fontsize`/`primary_color`/`alignment`/`marginv`를 `resolved` 값으로 치환. 그룹핑·번역·이벤트·FFmpeg 부분(main.py:269-415, 434-452)은 변경 없음.

주의: `max_word` 해석은 반드시 **단어 그룹핑 루프 이전**에 이루어져야 한다 (그룹핑이 `max_word`를 사용하므로, 스타일 블록에서만 치환하면 줄당 단어 수 편집이 무시된다).

### 4.4 프론트엔드 — 상태/타입 계층

**(a) `src/fsd/entities/uploaded-file/model/processing-status.ts`**

Before (전체 파일):

```ts
export const PROCESSING_STATUSES = [
  "upload_pending",
  "pending_enqueue",
  "queued",
  "processing",
  "processed",
  "failed",
  "no credits",
] as const;

export type ProcessingStatus = (typeof PROCESSING_STATUSES)[number];

const PROCESSING_STATUS_SET = new Set<string>(PROCESSING_STATUSES);

export const ACTIVE_PROCESSING_STATUSES = [
  "pending_enqueue",
  "queued",
  "processing",
] as const satisfies ProcessingStatus[];

const ACTIVE_PROCESSING_STATUS_SET = new Set<string>(ACTIVE_PROCESSING_STATUSES);

export function isProcessingStatus(status: string): status is ProcessingStatus {
  return PROCESSING_STATUS_SET.has(status);
}

export function isActiveProcessingStatus(status: string): boolean {
  return ACTIVE_PROCESSING_STATUS_SET.has(status);
}
```

After — `review_pending` 추가. **의도적으로 ACTIVE에 넣지 않는다**: 워커가 돌지 않는 사용자 대기 상태이므로 stale 회수(`reconcileStaleUploadedFileForUser`)·삭제 차단(`deleteUploadedFile`의 `isActiveProcessingStatus` 가드)·폴링(`useLiveUploadedFileDetail`) 대상에서 제외되는 것이 올바른 동작이다:

```ts
export const PROCESSING_STATUSES = [
  "upload_pending",
  "pending_enqueue",
  "queued",
  "processing",
  "review_pending",
  "processed",
  "failed",
  "no credits",
] as const;

export type ProcessingStatus = (typeof PROCESSING_STATUSES)[number];

const PROCESSING_STATUS_SET = new Set<string>(PROCESSING_STATUSES);

export const ACTIVE_PROCESSING_STATUSES = [
  "pending_enqueue",
  "queued",
  "processing",
] as const satisfies ProcessingStatus[];

const ACTIVE_PROCESSING_STATUS_SET = new Set<string>(ACTIVE_PROCESSING_STATUSES);

export function isProcessingStatus(status: string): status is ProcessingStatus {
  return PROCESSING_STATUS_SET.has(status);
}

export function isActiveProcessingStatus(status: string): boolean {
  return ACTIVE_PROCESSING_STATUS_SET.has(status);
}
```

`isActiveProcessingStatus`/`ACTIVE_PROCESSING_STATUSES` 소비처는 grep으로 전수 확인했다: `src/inngest/functions.ts`, `src/fsd/entities/uploaded-file/api/index.ts`, `src/fsd/features/upload/{api,ui}`, `src/fsd/entities/processing-dispatch/api/index.ts`, `src/fsd/pages/dashboard/ui/index.tsx`, `src/fsd/pages/upload-detail/model/use-live-uploaded-file-detail.ts` — 모두 "active = 워커 진행 중" 의미로 사용하므로 `review_pending` 제외가 맞다.

**(b) `src/fsd/entities/uploaded-file/ui/UploadedFileStatusBadge.tsx`**

`STATUS_BADGE_CONFIG`는 `satisfies Record<ProcessingStatus, StatusBadgeConfig>`라서 상태 추가 시 컴파일 에러로 강제된다. 항목 추가:

Before (해당 상수만):

```ts
const STATUS_BADGE_CONFIG = {
  upload_pending: { label: "Upload Pending", variant: "outline" },
  pending_enqueue: { label: "Scheduling", variant: "outline" },
  queued: { label: "Waiting", variant: "outline" },
  processing: { label: "Processing", variant: "outline" },
  processed: { label: "Processed", variant: "outline" },
  failed: { label: "Failed", variant: "destructive" },
  "no credits": { label: "No Credits", variant: "destructive" },
} as const satisfies Record<ProcessingStatus, StatusBadgeConfig>;
```

After:

```ts
const STATUS_BADGE_CONFIG = {
  upload_pending: { label: "Upload Pending", variant: "outline" },
  pending_enqueue: { label: "Scheduling", variant: "outline" },
  queued: { label: "Waiting", variant: "outline" },
  processing: { label: "Processing", variant: "outline" },
  review_pending: { label: "Review Needed", variant: "default" },
  processed: { label: "Processed", variant: "outline" },
  failed: { label: "Failed", variant: "destructive" },
  "no credits": { label: "No Credits", variant: "destructive" },
} as const satisfies Record<ProcessingStatus, StatusBadgeConfig>;
```

**(c) `src/fsd/shared/config/constants.ts` — 클립 길이 제한 상수 추가** (백엔드 `MIN_CLIP_DURATION`/`MAX_CLIP_DURATION`과 값 동기 필수):

```ts
/**
 * Clip duration limits. Must stay in sync with
 * ai-podcast-clipper-backend/main.py MIN_CLIP_DURATION / MAX_CLIP_DURATION.
 */
export const CLIP_DURATION_LIMITS = {
  MIN_SECONDS: 30,
  MAX_SECONDS: 90,
} as const;

/**
 * Caption style editing options. Defaults must stay in sync with the hardcoded
 * values in ai-podcast-clipper-backend/main.py:
 * create_subtitles_with_ffmpeg (en: fontsize 122, max_word 5) /
 * create_korean_subtitles_with_ffmpeg (kr: fontsize 130, max_word 3),
 * and with resolve_caption_style's validation ranges.
 */
export const CAPTION_STYLE_OPTIONS = {
  POSITIONS: ["top", "middle", "bottom"],
  DEFAULT_POSITION: "middle",
  FONT_SIZE_RANGE: { MIN: 60, MAX: 200 },
  DEFAULT_FONT_SIZE: { English: 122, Korean: 130 },
  COLOR_PRESETS: ["#FFFFFF", "#FFE45E", "#7CF3FF", "#111111"],
  DEFAULT_COLOR: "#FFFFFF",
  MAX_WORDS_RANGE: { MIN: 1, MAX: 8 },
  DEFAULT_MAX_WORDS: { English: 5, Korean: 3 },
} as const;

// 30~90초 검증의 단일 지점. zod refine과 서버 액션 가드가 모두 이 함수를 사용한다.
export function isClipDurationWithinLimits(
  startSeconds: number,
  endSeconds: number,
): boolean {
  const duration = endSeconds - startSeconds;
  return (
    duration >= CLIP_DURATION_LIMITS.MIN_SECONDS &&
    duration <= CLIP_DURATION_LIMITS.MAX_SECONDS
  );
}

/**
 * 캡션 스타일 계약의 단일 원천(canonical) 타입.
 * 검증 스키마(features/clip-review/model/schemas.ts의 captionStyleSchema),
 * 렌더 이벤트 페이로드(src/inngest/client.ts의 RenderCaptionStyle),
 * 렌더 디스패처의 JSON 캐스팅, 검토 UI가 전부 이 타입 하나를 참조한다.
 * 모든 필드는 required-but-nullable: null = 백엔드가 언어별 기본값으로 해석.
 */
export type CaptionStyle = {
  position: (typeof CAPTION_STYLE_OPTIONS.POSITIONS)[number];
  fontSize: number | null;
  color: string | null;
  maxWordsPerLine: number | null;
};
```

**(d) `src/fsd/entities/uploaded-file/model/types.ts` — `UploadedFileDetail` 확장**

Before (해당 인터페이스만):

```ts
export interface UploadedFileDetail {
  id: string;
  displayName: string | null;
  createdAt: Date;
  status: Exclude<ProcessingStatus, "upload_pending">;
  language: string;
  targetClipCount: number;
  failureCode: string | null;
  enqueueRequestedAt: Date | null;
  queuedAt: Date | null;
  processingStartedAt: Date | null;
  terminalStatusAt: Date | null;
  currentAttempt: number;
  lastSuccessfulAttempt: number;
  currentUserCredits: number;
  clips: Clip[];
}
```

After (import에 `ClipDraft` 추가: `import type { Clip, ClipDraft } from "generated/prisma";`):

```ts
export interface UploadedFileDetail {
  id: string;
  displayName: string | null;
  createdAt: Date;
  status: Exclude<ProcessingStatus, "upload_pending">;
  language: string;
  targetClipCount: number;
  failureCode: string | null;
  enqueueRequestedAt: Date | null;
  queuedAt: Date | null;
  processingStartedAt: Date | null;
  terminalStatusAt: Date | null;
  currentAttempt: number;
  lastSuccessfulAttempt: number;
  reviewBeforeGenerate: boolean;
  reviewAttempt: number | null;
  reviewReadyAt: Date | null;
  currentUserCredits: number;
  clips: Clip[];
  clipDrafts: ClipDraft[];
}
```

### 4.5 프론트엔드 — 엔티티 계층

**(a) `src/fsd/entities/clip-draft/api/index.ts` (신규)** — 기존 `entities/clip/api/index.ts`의 컨벤션(`server-only`, `getClient(tx)`, `createMany skipDuplicates`)을 미러링:

```ts
import "server-only";

// Prisma.JsonNull 값을 쓰므로 type-only import가 아니어야 한다.
import { Prisma } from "generated/prisma";
import { db } from "~/server/db";
import type { CaptionStyle } from "~/fsd/shared/config/constants";

type DbClient = Prisma.TransactionClient | typeof db;

function getClient(tx?: Prisma.TransactionClient): DbClient {
  return tx ?? db;
}

// Persists AI-proposed clip drafts for an analysis attempt.
// Duplicate (uploadedFileId, attempt, index) rows are ignored for retry idempotency.
export async function createClipDraftsBulk(
  data: Prisma.ClipDraftCreateManyInput[],
  options?: { tx?: Prisma.TransactionClient },
) {
  if (data.length === 0) {
    return { count: 0 };
  }

  return getClient(options?.tx).clipDraft.createMany({
    data,
    skipDuplicates: true,
  });
}

export async function listClipDraftsForAttempt(
  uploadedFileId: string,
  attempt: number,
  options?: { tx?: Prisma.TransactionClient },
) {
  return getClient(options?.tx).clipDraft.findMany({
    where: { uploadedFileId, attempt },
    orderBy: { index: "asc" },
  });
}

// Loads a draft together with its parent upload for ownership/state checks.
export async function findClipDraftWithUpload(
  clipDraftId: string,
  userId: string,
) {
  return db.clipDraft.findFirst({
    where: {
      id: clipDraftId,
      uploadedFile: { userId },
    },
    select: {
      id: true,
      attempt: true,
      aiStartSeconds: true,
      aiEndSeconds: true,
      uploadedFile: {
        select: {
          id: true,
          status: true,
          reviewAttempt: true,
        },
      },
    },
  });
}

export async function updateClipDraftEdit(
  clipDraftId: string,
  data: {
    startSeconds: number;
    endSeconds: number;
    selected: boolean;
    // undefined = 스타일 변경 없음, null = 기본 스타일로 리셋
    captionStyle?: Prisma.InputJsonValue | null;
  },
  options?: { tx?: Prisma.TransactionClient },
) {
  const { captionStyle, ...rest } = data;

  return getClient(options?.tx).clipDraft.update({
    where: { id: clipDraftId },
    data: {
      ...rest,
      ...(captionStyle !== undefined
        ? { captionStyle: captionStyle ?? Prisma.JsonNull }
        : {}),
    },
  });
}

// 렌더 디스패치용: 분석 attempt의 선택된 draft를 ProcessVideoRequest.moments
// 계약(caption_style는 백엔드 snake_case 키)으로 매핑한다. ClipDraft 컬럼 지식과
// 캡션 타입 해석은 이 엔티티가 소유하고, 디스패처는 결과 배열만 사용한다.
export async function getSelectedRenderMomentsForAttempt(
  uploadedFileId: string,
  attempt: number,
) {
  const drafts = await db.clipDraft.findMany({
    where: { uploadedFileId, attempt, selected: true },
    orderBy: { index: "asc" },
  });

  return drafts.map((draft, order) => ({
    index: order,
    start: draft.startSeconds,
    end: draft.endSeconds,
    type: draft.clipType,
    hook: draft.hook,
    payoff: draft.payoff,
    // 저장 시 captionStyleSchema(shared CaptionStyle)로 검증된 JSON.
    caption_style: (draft.captionStyle as CaptionStyle | null) ?? undefined,
  }));
}
```

`model/types.ts`에는 `export type { ClipDraft } from "generated/prisma";` 수준의 재노출과, 검토 UI용 DTO가 필요하면 추가한다. `index.ts` 배럴은 기존 엔티티 패턴을 따르되, `src/fsd/entities/clip/index.ts`가 `export { ... } from "./api";`로 함수명을 **명시적으로 나열**하는 방식이므로(확인함 — `export *` 아님), api의 5개 함수(`createClipDraftsBulk`, `listClipDraftsForAttempt`, `findClipDraftWithUpload`, `updateClipDraftEdit`, `getSelectedRenderMomentsForAttempt`)를 **모두 명시적으로 export**해야 한다. `features/upload`·`processing-dispatch`·`functions.ts`가 이 배럴에서 import하므로, 하나라도 빠지면 컴파일 실패다.

**(b) `src/fsd/entities/uploaded-file/api/index.ts` — 전이 함수 2개 추가** (기존 `markUploadedFileAttemptProcessed`, main.py 아님 — src/fsd/entities/uploaded-file/api/index.ts:705-725 패턴 미러링):

```ts
// Marks an analysis attempt as awaiting user review. Records which attempt's
// drafts are under review and where the reusable transcript lives.
export async function markUploadedFileAttemptReviewPending(
  uploadedFileId: string,
  attempt: number,
  args: { transcriptS3Key: string | null },
  options?: { tx?: Prisma.TransactionClient; now?: Date },
) {
  const now = options?.now ?? new Date();

  return getClient(options?.tx).uploadedFile.updateMany({
    where: {
      id: uploadedFileId,
      currentAttempt: attempt,
      status: "processing",
    },
    data: {
      status: "review_pending",
      reviewAttempt: attempt,
      reviewReadyAt: now,
      transcriptS3Key: args.transcriptS3Key,
      failureCode: null,
    },
  });
}
```

`markUploadedFileAttemptReviewPending`는 `src/fsd/entities/uploaded-file/index.ts` 배럴의 **명시적 named export 목록에 추가**해야 한다. 이 배럴은 `export *`가 아니라 `export { markUploadedFileAttemptFailed, markUploadedFileAttemptNoCredits, markUploadedFileAttemptProcessed, ... } from "./api";`처럼 함수명을 하나씩 나열하는 방식임을 확인했다. 빠뜨리면 `functions.ts`의 `import { markUploadedFileAttemptReviewPending } from "~/fsd/entities/uploaded-file"`가 컴파일되지 않는다.

또한 `getUploadedFileDetailsById`(현재 src/fsd/entities/uploaded-file/api/index.ts:375-428)의 select에 `reviewBeforeGenerate`, `reviewAttempt`, `reviewReadyAt`을 추가하고, 반환 직전에 draft를 로드한다. 현재 clips 로드는 `lastSuccessfulAttempt > 0`일 때만 수행되고(확인함), 검토 단계에서는 `lastSuccessfulAttempt`가 아직 0이라 `clips`는 `[]`이며 `clipDrafts`만 `reviewAttempt`로 로드된다:

```ts
  // getUploadedFileDetailsById 내부, clips 로드 뒤에 추가
  const clipDrafts =
    file.reviewAttempt !== null
      ? await db.clipDraft.findMany({
          where: {
            uploadedFileId: file.id,
            attempt: file.reviewAttempt,
          },
          orderBy: { index: "asc" },
        })
      : [];

  return {
    ...fileData,
    status: toNonHiddenStatus(file.status),
    currentUserCredits: user.credits,
    clips,
    clipDrafts,
  };
```

(엔티티 계층에서 clipDraft를 직접 조회하는 대신 `entities/clip-draft`의 `listClipDraftsForAttempt`를 import해도 되지만, FSD에서 entity 간 peer import는 금지이므로 — frontend CLAUDE.md "Peer imports within same layer are forbidden" — `db.clipDraft` 직접 조회로 둔다.)

**(c) `src/fsd/entities/processing-dispatch/api/index.ts` — kind 분기**

`createProcessingDispatch` (현재 :36-49) After — `kind` 수용:

```ts
export async function createProcessingDispatch(
  data: {
    uploadedFileId: string;
    attempt: number;
    kind: "auto" | "analyze" | "render";
  },
  options?: { tx?: Prisma.TransactionClient },
) {
  return getClient(options?.tx).processingDispatch.create({
    data: {
      ...data,
      status: "pending",
    },
  });
}
```

`findPendingProcessingDispatchById` (현재 :51-73) After — `kind`와 렌더에 필요한 필드 추가 select:

```ts
async function findPendingProcessingDispatchById(dispatchId: string) {
  return db.processingDispatch.findFirst({
    where: {
      id: dispatchId,
      status: "pending",
    },
    select: {
      id: true,
      attempt: true,
      kind: true,
      uploadedFile: {
        select: {
          id: true,
          userId: true,
          language: true,
          targetClipCount: true,
          s3Key: true,
          currentAttempt: true,
          uploaded: true,
          reviewAttempt: true,
          transcriptS3Key: true,
        },
      },
    },
  });
}
```

`dispatchProcessingRequestByIdOrFail` (현재 :136-234) — **`inngest.send` 블록만** kind 분기로 교체한다. claim/stale/dead-letter/에러 처리 로직은 변경하지 않는다:

Before (해당 블록, :190-207):

```ts
    await inngest.send({
      name: "process-video-events",
      data: {
        uploadedFileId: dispatch.uploadedFile.id,
        userId: dispatch.uploadedFile.userId,
        language: dispatch.uploadedFile.language,
        clipCount: dispatch.uploadedFile.targetClipCount,
        attempt: dispatch.attempt,
        outputPrefix: getAttemptOutputPrefix(
          dispatch.uploadedFile.s3Key,
          dispatch.attempt,
        ),
        matchKey: getProcessingMatchKey(
          dispatch.uploadedFile.id,
          dispatch.attempt,
        ),
      },
    });
```

After:

```ts
    const baseEventData = {
      uploadedFileId: dispatch.uploadedFile.id,
      userId: dispatch.uploadedFile.userId,
      language: dispatch.uploadedFile.language,
      attempt: dispatch.attempt,
      outputPrefix: getAttemptOutputPrefix(
        dispatch.uploadedFile.s3Key,
        dispatch.attempt,
      ),
      matchKey: getProcessingMatchKey(
        dispatch.uploadedFile.id,
        dispatch.attempt,
      ),
    };

    if (dispatch.kind === "analyze") {
      await inngest.send({
        name: "analyze-video-events",
        data: {
          ...baseEventData,
          clipCount: dispatch.uploadedFile.targetClipCount,
        },
      });
    } else if (dispatch.kind === "render") {
      if (dispatch.uploadedFile.reviewAttempt === null) {
        throw new Error("Render dispatch requires a completed analysis attempt");
      }

      // 선택 draft → RenderMoment 매핑은 clip-draft 엔티티가 소유한다(4.5(a)).
      // 빈 선택은 confirm 액션이 사용자 경로에서 이미 막으므로, 아래 가드는
      // 사용자 메시지가 아니라 방어선(dead_letter 경로)이다.
      const renderMoments = await getSelectedRenderMomentsForAttempt(
        dispatch.uploadedFile.id,
        dispatch.uploadedFile.reviewAttempt,
      );

      if (renderMoments.length === 0) {
        throw new Error("Render dispatch requires at least one selected clip draft");
      }

      await inngest.send({
        name: "process-video-events",
        data: {
          ...baseEventData,
          clipCount: renderMoments.length,
          transcriptS3Key: dispatch.uploadedFile.transcriptS3Key,
          moments: renderMoments,
        },
      });
    } else {
      await inngest.send({
        name: "process-video-events",
        data: {
          ...baseEventData,
          clipCount: dispatch.uploadedFile.targetClipCount,
        },
      });
    }
```

(파일 상단 import에 `import { getSelectedRenderMomentsForAttempt } from "~/fsd/entities/clip-draft";` 추가. 이것이 entity 간 peer import가 남는 **유일한 지점**이며, ClipDraft 컬럼 지식·캡션 타입 해석은 헬퍼 안에 캡슐화되어 디스패처는 결과 배열만 만진다. 금지를 엄격 적용하려면 헬퍼의 쿼리+매핑을 이 파일에 `db.clipDraft` 직접 조회로 인라인한다. Open Questions 참고.)

여기서 `throw`된 에러는 기존 catch(:211-233)가 dead_letter + `dispatch_failed` 마킹으로 처리하므로 신규 실패 모드도 기존 복구 경로를 탄다.

### 4.6 프론트엔드 — 스케줄링(서버 액션) 계층

**(a) `src/fsd/features/upload/api/index.ts`의 `scheduleProcessingAttempt`** (현재 :68-206)

변경점은 두 가지다: (1) 로드하는 select에 `reviewBeforeGenerate` 추가, (2) dispatch 생성 시 kind 결정. 함수 시그니처에 `kindOverride`를 추가해 확정 액션이 "render"를 강제할 수 있게 한다.

After (전체 — 표시된 두 블록 외에는 기존 코드와 동일):

```ts
async function scheduleProcessingAttempt(
  uploadedFileId: string,
  userId: string,
  allowedStatuses: readonly ProcessingStatus[],
  kindOverride?: "render",
): Promise<ActionResult<void>> {
  let dispatchId: string;
  let scheduledAttempt: number;

  try {
    const now = new Date();
    const scheduled = await db.$transaction(
      async (
        tx,
      ): Promise<ActionResult<{ dispatchId: string; attempt: number }>> => {
        const uploadedFile = await tx.uploadedFile.findFirst({
          where: { id: uploadedFileId, userId },
          select: {
            id: true,
            userId: true,
            status: true,
            uploaded: true,
            currentAttempt: true,
            targetClipCount: true,
            reviewBeforeGenerate: true,
            user: {
              select: {
                credits: true,
              },
            },
          },
        });

        if (!uploadedFile) {
          return failure("Uploaded file not found");
        }

        // ... (unchanged: uploaded / clip count / status / credits 가드 — 기존 :103-128과 동일)

        const nextAttempt = uploadedFile.currentAttempt + 1;
        const claimed = await tx.uploadedFile.updateMany({
          where: {
            id: uploadedFileId,
            userId,
            uploaded: true,
            status: {
              in: [...allowedStatuses],
            },
            currentAttempt: uploadedFile.currentAttempt,
          },
          data: {
            status: "pending_enqueue",
            enqueueRequestedAt: now,
            queuedAt: null,
            processingStartedAt: null,
            terminalStatusAt: null,
            failureCode: null,
            currentAttempt: nextAttempt,
          },
        });

        if (claimed.count !== 1) {
          return failure("Processing has already been requested");
        }

        const dispatch = await createProcessingDispatch(
          {
            uploadedFileId,
            attempt: nextAttempt,
            kind:
              kindOverride ??
              (uploadedFile.reviewBeforeGenerate ? "analyze" : "auto"),
          },
          { tx },
        );

        return success({ dispatchId: dispatch.id, attempt: nextAttempt });
      },
    );

    // ... (unchanged: scheduled 실패 반환, dispatchId/scheduledAttempt 대입, P2002 catch — 기존 :168-184와 동일)
  } catch (error) {
    // (위 unchanged 주석에 포함)
  }

  // ... (unchanged: dispatchProcessingRequestByIdOrFail 호출과 실패 시 dispatch_failed 마킹, revalidate — 기존 :186-205와 동일)
}
```

행동 불변식: `kindOverride` 없이 `reviewBeforeGenerate=false`인 파일에 대해 이 함수는 변경 전과 동일한 DB 전이와 dispatch(kind="auto")를 만들어야 한다.

**(b) 같은 파일의 `reprocessUploadedFile`** (현재 :468-492) — `review_pending`에서도 재분석을 허용:

Before (마지막 호출부만):

```ts
  return scheduleProcessingAttempt(
    validated.data.uploadedFileId,
    authResult.data.userId,
    ["processed", "failed", "no credits"],
  );
```

After:

```ts
  return scheduleProcessingAttempt(
    validated.data.uploadedFileId,
    authResult.data.userId,
    ["processed", "failed", "no credits", "review_pending"],
  );
```

**(c) 업로드 폼 → 검토 모드 플래그 전달**

- `src/fsd/features/upload/model/schemas.ts`의 `prepareUploadSchema`에 `reviewBeforeGenerate: z.boolean()` 추가:

Before (해당 스키마만):

```ts
export const prepareUploadSchema = z.object({
  fileName: z.string().min(1, "File name is required"),
  contentType: z.string().min(1, "Content type is required"),
  language: z.string().refine(
    (value) => SUPPORTED_LANGUAGE_SET.has(value),
    "Unsupported language",
  ),
  clipCount: z.number().int().refine(
    (value) => SUPPORTED_CLIP_COUNT_SET.has(value),
    "Unsupported clip count",
  ),
});
```

After:

```ts
export const prepareUploadSchema = z.object({
  fileName: z.string().min(1, "File name is required"),
  contentType: z.string().min(1, "Content type is required"),
  language: z.string().refine(
    (value) => SUPPORTED_LANGUAGE_SET.has(value),
    "Unsupported language",
  ),
  clipCount: z.number().int().refine(
    (value) => SUPPORTED_CLIP_COUNT_SET.has(value),
    "Unsupported clip count",
  ),
  reviewBeforeGenerate: z.boolean(),
});
```

- `prepareUpload`(src/fsd/features/upload/api/index.ts:209-253)의 인자 타입에 `reviewBeforeGenerate: boolean` 추가 후 `createUploadDraft` 호출에 전달.
- `createUploadDraft`(src/fsd/entities/uploaded-file/api/index.ts:188-203)의 `data` 타입에 `reviewBeforeGenerate: boolean` 추가 (create data 스프레드에 자동 포함).
- `src/fsd/pages/dashboard/ui/_component/UploadPodcast.tsx`: `const [reviewBeforeGenerate, setReviewBeforeGenerate] = useState(false)` 상태와 토글 UI(기존 언어/클립 수 DropdownMenu 옆에 "Generation: Auto / Review first" 드롭다운)를 추가하고 `upload(file, language, clipCount, reviewBeforeGenerate)`로 전달.
- `src/fsd/pages/dashboard/model/useUploadPodcast.ts`: `upload` 함수 시그니처에 `reviewBeforeGenerate: boolean` 추가, `prepareUpload({ ..., reviewBeforeGenerate })`로 전달. (분석 이벤트 metadata에도 포함 권장.)

### 4.7 프론트엔드 — Inngest 계층

**(a) `src/inngest/client.ts`**

Before (전체 파일):

```ts
import { EventSchemas, Inngest } from "inngest";

type ProcessVideoBackendClip = {
  index: number;
  startSeconds?: number | null;
  endSeconds?: number | null;
  s3Key?: string | null;
  scriptText?: string | null;
  language?: string | null;
  youtubeTitle?: string | null;
  youtubeDescription?: string | null;
  youtubeHashtags?: string[] | null;
};

type Events = {
  "process-video-events": {
    data: {
      uploadedFileId: string;
      userId: string;
      language: string;
      clipCount: number;
      attempt: number;
      outputPrefix: string;
      matchKey: string;
    };
  };
  "process-video-events/cancel": {
    data: {
      uploadedFileId: string;
      attempt: number;
      matchKey: string;
    };
  };
  "modal/video.processed": {
    data: {
      uploadedFileId: string;
      attempt: number;
      matchKey: string;
      status: string;
      clips?: ProcessVideoBackendClip[];
      error?: string;
    };
  };
};

export const inngest = new Inngest({
  id: "ai-podcast-clipper-frontend",
  schemas: new EventSchemas().fromRecord<Events>(),
});
```

After:

```ts
import { EventSchemas, Inngest } from "inngest";
import type { CaptionStyle } from "~/fsd/shared/config/constants";

type ProcessVideoBackendClip = {
  index: number;
  startSeconds?: number | null;
  endSeconds?: number | null;
  s3Key?: string | null;
  scriptText?: string | null;
  language?: string | null;
  youtubeTitle?: string | null;
  youtubeDescription?: string | null;
  youtubeHashtags?: string[] | null;
};

// 캡션 계약의 원천은 shared/config의 CaptionStyle 단일 타입이다.
// 여기서는 wire 명칭만 별칭으로 유지한다 (스키마-이벤트-디스패처 드리프트 방지).
export type RenderCaptionStyle = CaptionStyle;

type RenderMoment = {
  index: number;
  start: number;
  end: number;
  type?: string | null;
  hook?: string | null;
  payoff?: string | null;
  // 백엔드 ProcessVideoRequest.moments[].caption_style와 동일 키 (snake_case 유지)
  caption_style?: RenderCaptionStyle | null;
};

// 분석 결과 moment의 canonical 형태. 웹훅 정규화 출력(route.ts)과
// analyzeVideo의 wire 타입(Partial<AnalyzedMoment>)이 모두 이 타입에서 파생된다.
export type AnalyzedMoment = {
  index: number;
  startSeconds: number;
  endSeconds: number;
  clipType?: string | null;
  hook?: string | null;
  payoff?: string | null;
};

type Events = {
  "process-video-events": {
    data: {
      uploadedFileId: string;
      userId: string;
      language: string;
      clipCount: number;
      attempt: number;
      outputPrefix: string;
      matchKey: string;
      // render dispatch만 설정. 있으면 Modal에 mode="render"로 전달된다.
      moments?: RenderMoment[];
      transcriptS3Key?: string | null;
    };
  };
  "analyze-video-events": {
    data: {
      uploadedFileId: string;
      userId: string;
      language: string;
      clipCount: number;
      attempt: number;
      outputPrefix: string;
      matchKey: string;
    };
  };
  "process-video-events/cancel": {
    data: {
      uploadedFileId: string;
      attempt: number;
      matchKey: string;
    };
  };
  "modal/video.processed": {
    data: {
      uploadedFileId: string;
      attempt: number;
      matchKey: string;
      status: string;
      clips?: ProcessVideoBackendClip[];
      error?: string;
    };
  };
  "modal/video.analyzed": {
    data: {
      uploadedFileId: string;
      attempt: number;
      matchKey: string;
      status: string;
      moments?: AnalyzedMoment[];
      transcriptS3Key?: string | null;
      error?: string;
    };
  };
};

export const inngest = new Inngest({
  id: "ai-podcast-clipper-frontend",
  schemas: new EventSchemas().fromRecord<Events>(),
});
```

**(b) `src/inngest/functions.ts` — `processVideo` 국소 수정 3곳**

수정 1 — 이벤트 구조분해 (현재 :270-271):

Before:

```ts
    const { uploadedFileId, language, clipCount, attempt, outputPrefix } =
      event.data;
```

After:

```ts
    const {
      uploadedFileId,
      language,
      clipCount,
      attempt,
      outputPrefix,
      moments,
      transcriptS3Key,
    } = event.data;
```

수정 2 — `send-to-modal` step의 요청 body (현재 :384-410):

Before:

```ts
      const modalResponse = await step.run("send-to-modal", async () => {
        const response = await fetch(env.PROCESS_VIDEO_ENDPOINT, {
          method: "POST",
          body: JSON.stringify({
            uploaded_file_id: uploadedFileId,
            s3_key: context.s3Key,
            attempt,
            language,
            clip_count: clipCount,
            output_prefix: outputPrefix,
            callback_url: callbackUrl,
          }),
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${env.PROCESS_VIDEO_ENDPOINT_AUTH}`,
          },
        });

        if (!response.ok) {
          const text = await response.text().catch(() => "");
          throw new Error(
            `Modal dispatch failed (${response.status}): ${text.slice(0, 500)}`,
          );
        }

        return (await response.json()) as Record<string, unknown>;
      });
```

After:

```ts
      const modalResponse = await step.run("send-to-modal", async () => {
        // Render dispatch는 항상 비어 있지 않은 moments를 싣는다(디스패처가 빈 선택을
        // 가드). auto/analyze 이벤트에는 moments 필드 자체가 없다.
        const shouldRenderSelectedMoments =
          moments !== undefined && moments.length > 0;

        const response = await fetch(env.PROCESS_VIDEO_ENDPOINT, {
          method: "POST",
          body: JSON.stringify({
            uploaded_file_id: uploadedFileId,
            s3_key: context.s3Key,
            attempt,
            language,
            clip_count: clipCount,
            mode: shouldRenderSelectedMoments ? "render" : "auto",
            moments: shouldRenderSelectedMoments ? moments : undefined,
            transcript_s3_key: transcriptS3Key ?? undefined,
            output_prefix: outputPrefix,
            callback_url: callbackUrl,
          }),
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${env.PROCESS_VIDEO_ENDPOINT_AUTH}`,
          },
        });

        if (!response.ok) {
          const text = await response.text().catch(() => "");
          throw new Error(
            `Modal dispatch failed (${response.status}): ${text.slice(0, 500)}`,
          );
        }

        return (await response.json()) as Record<string, unknown>;
      });
```

수정 3 — **concurrency를 account 스코프 공유 키로 변경** (현재 :262-267). 분석(`analyzeVideo`)과 렌더(`processVideo`)는 서로 다른 Inngest 함수이고, **Inngest의 함수 레벨 concurrency는 함수 ID별로 독립된 큐**다. 두 함수가 각자 `{ limit: 1, key: "event.data.userId" }`(함수 스코프)를 선언하면 **같은 key라도 서로를 직렬화하지 못한다.** 그러면 한 유저가 업로드 A(처리 중)와 업로드 B(분석)를 동시에 굴릴 때 두 함수가 동시에 실행되어 one-processing-per-user DB 인덱스에서 한쪽이 `startUploadedFileProcessingAttempt` → `already_processing`으로 밀려나고, 그 attempt는 **재시도·재디스패치 없이 `queued`에 갇혔다가**(`already_processing` 분기는 throw가 아니라 skip, functions.ts:362-373; dispatch는 이미 `sent`; 재디스패치 cron 없음) 앞 작업 완료 후 `queuedWorkerStartTimeoutMs`(15분) 경과 시 `reconcileStaleUploadedFileForUser`가 `queued_worker_not_started`로 **실패** 처리한다(재디스패치가 아님, api/index.ts:138-149). 즉 오늘 정상 동작하는 "두 번째 업로드가 큐 대기 후 자동 실행"이 회귀로 바뀐다.

해결: 두 함수 모두 **account 스코프의 동일 concurrency 키**를 선언해 유저당 하나의 가상 큐를 공유하게 한다. 그러면 밀려난 실행은 DB 레이스로 죽지 않고 Inngest 큐에서 대기하다 앞 작업 완료 후 자동 실행된다(기존 auto 직렬화와 동일). auto 전용 워크로드에서는 이 변경이 기존 함수 스코프와 동작이 동일하다(여전히 유저당 1개) — 달라지는 건 `analyzeVideo`와 큐를 공유한다는 점뿐이다. 두 이벤트 모두 `userId`를 싣고 있어 바로 적용 가능하다.

Before (현재 :262-267):

```ts
  {
    event: "process-video-events",
    concurrency: {
      limit: 1,
      key: "event.data.userId",
    },
  },
```

After:

```ts
  {
    event: "process-video-events",
    // analyzeVideo와 동일한 account 스코프 키로 "유저당 1개 실행"을 두 함수에 걸쳐 보장.
    // 함수 스코프로 두면 analyzeVideo와 별도 큐가 되어 직렬화가 깨진다.
    concurrency: [
      {
        scope: "account",
        key: "event.data.userId",
        limit: 1,
      },
    ],
  },
```

행동 불변식: `moments`가 없는 이벤트(자동 모드)의 요청 body는 `mode: "auto"` 추가를 제외하면 기존과 동일하고, 백엔드 auto 경로는 기존과 동일하게 동작한다. 이외 `processVideo`의 크레딧 체크(`context.user.credits < clipCount`), 클립 폴링, persist, 완료/실패 처리는 **수정하지 않는다** — 렌더 이벤트는 `clipCount = 선택된 draft 수`로 오므로 기존 로직이 그대로 올바르게 동작한다.

**(c) `analyzeVideo` 함수 (신규, 같은 파일에 추가)** — `processVideo`의 가드 골격을 미러링하되, S3 클립 폴링 대신 분석 콜백 단일 대기:

```ts
// Modal 컨테이너 타임아웃(3600s = 60m, main.py:678)에 맞춘다. 이보다 짧으면
// Modal이 아직 도는데 Inngest가 먼저 analysis_timeout으로 포기해 뒤늦은 콜백이 버려진다.
const ANALYSIS_RESULT_TIMEOUT = "60m";

// 동기(로컬 개발) 경로의 미신뢰 wire 형태. 비동기 경로는 이벤트 스키마가
// AnalyzedMoment를 보장하지만 두 경로를 한 변수로 다루기 위해 Partial로 통일한다.
// canonical 형태는 src/inngest/client.ts의 AnalyzedMoment 하나다.
type AnalyzedMomentPayload = Partial<AnalyzedMoment>;

export const analyzeVideo = inngest.createFunction(
  {
    id: "analyze-video",
    retries: 1,
    cancelOn: [
      {
        event: "process-video-events/cancel",
        match: "data.matchKey",
      },
    ],
  },
  {
    event: "analyze-video-events",
    // processVideo와 반드시 동일한 account 스코프 concurrency 키를 공유한다(4.7(b) 수정 3 참고).
    // 함수 레벨 concurrency는 함수 ID별 독립 큐라, 함수 스코프로 두면 두 함수가 서로
    // 직렬화되지 않아 유저의 analyze/render가 동시에 돌다 DB 클레임 레이스로 한쪽이 stranded된다.
    concurrency: [
      {
        scope: "account",
        key: "event.data.userId",
        limit: 1,
      },
    ],
  },
  async ({ event, step }) => {
    const { uploadedFileId, language, clipCount, attempt, outputPrefix } =
      event.data;

    const context = await step.run("load-processing-context", async () => {
      return findCurrentProcessingAttemptContext(uploadedFileId, attempt);
    });

    if (context?.status !== "queued") {
      return { skipped: true };
    }

    const sourceCheck = await step.run(
      "check-source-object-exists",
      async () => {
        try {
          return {
            status: "checked" as const,
            exists: await objectExists(context.s3Key),
          };
        } catch (error) {
          console.error("Failed to check source object before analysis", {
            uploadedFileId,
            attempt,
            s3Key: context.s3Key,
            error,
          });

          return {
            status: "error" as const,
            errorMessage: toErrorMessage(error),
          };
        }
      },
    );

    if (sourceCheck.status === "error" || !sourceCheck.exists) {
      await step.run("mark-analysis-source-failed", async () => {
        await markUploadedFileAttemptFailed(
          uploadedFileId,
          attempt,
          sourceCheck.status === "error"
            ? "backend_failed"
            : "missing_source_object",
          {
            now: new Date(),
            statuses: ["queued"],
          },
        );
      });

      return { skipped: false, status: "analysis_source_failed" };
    }

    // 분석 자체는 크레딧을 차감하지 않지만, 잔여 크레딧이 없는 사용자의
    // GPU 사용을 막기 위해 최소 1 크레딧을 요구한다.
    if (context.user.credits < 1) {
      await step.run("mark-no-credits", async () => {
        await markUploadedFileAttemptNoCredits(uploadedFileId, attempt, {
          now: new Date(),
        });
      });

      return { skipped: false, status: "no credits" };
    }

    const claimResult = await step.run("claim-processing-attempt", async () => {
      return startUploadedFileProcessingAttempt(
        uploadedFileId,
        context.userId,
        attempt,
        {
          now: new Date(),
        },
      );
    });

    if (claimResult.status !== "started") {
      return {
        skipped: true,
        status:
          claimResult.status === "already_processing"
            ? "already_processing"
            : undefined,
      };
    }

    try {
      const callbackUrl = env.NEXT_PUBLIC_SITE_URL
        ? `${env.NEXT_PUBLIC_SITE_URL}/api/webhooks/modal`
        : undefined;

      const modalResponse = await step.run("send-analyze-to-modal", async () => {
        const response = await fetch(env.PROCESS_VIDEO_ENDPOINT, {
          method: "POST",
          body: JSON.stringify({
            uploaded_file_id: uploadedFileId,
            s3_key: context.s3Key,
            attempt,
            language,
            clip_count: clipCount,
            mode: "analyze",
            output_prefix: outputPrefix,
            callback_url: callbackUrl,
          }),
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${env.PROCESS_VIDEO_ENDPOINT_AUTH}`,
          },
        });

        if (!response.ok) {
          const text = await response.text().catch(() => "");
          throw new Error(
            `Modal analyze dispatch failed (${response.status}): ${text.slice(0, 500)}`,
          );
        }

        return (await response.json()) as Record<string, unknown>;
      });

      const shouldWaitForCallback = modalResponse.status === "accepted";

      if (shouldWaitForCallback && !callbackUrl) {
        throw new Error(
          "Modal accepted async analysis, but NEXT_PUBLIC_SITE_URL is not configured for callbacks",
        );
      }

      let analysisStatus: unknown;
      let analysisError: unknown;
      let analyzedMoments: AnalyzedMomentPayload[] = [];
      let transcriptS3Key: string | null = null;

      if (shouldWaitForCallback) {
        const analysisResult = await step.waitForEvent(
          "wait-for-analysis-result",
          {
            event: "modal/video.analyzed",
            match: "data.matchKey",
            timeout: ANALYSIS_RESULT_TIMEOUT,
          },
        );

        if (!analysisResult) {
          await step.run("mark-analysis-timeout", async () => {
            await markUploadedFileAttemptFailed(
              uploadedFileId,
              attempt,
              "analysis_timeout",
              {
                now: new Date(),
                statuses: ["processing"],
              },
            );
          });

          return { skipped: false, status: "analysis_timeout" };
        }

        analysisStatus = analysisResult.data.status;
        analysisError = analysisResult.data.error;
        analyzedMoments = analysisResult.data.moments ?? [];
        transcriptS3Key = analysisResult.data.transcriptS3Key ?? null;
      } else {
        // 동기 모드 (로컬 개발): 응답 본문이 곧 분석 결과다.
        analysisStatus = modalResponse.status;
        analysisError = modalResponse.error;
        analyzedMoments = Array.isArray(modalResponse.moments)
          ? (modalResponse.moments as AnalyzedMomentPayload[])
          : [];
        transcriptS3Key =
          typeof modalResponse.transcript_s3_key === "string"
            ? modalResponse.transcript_s3_key
            : null;
      }

      if (!isSuccessfulModalStatus(analysisStatus)) {
        throw new Error(
          `Modal analysis reported status "${String(analysisStatus)}": ${toErrorMessage(
            analysisError ?? "Unknown analysis error",
          )}`,
        );
      }

      const validMoments = analyzedMoments.filter(
        (moment): moment is AnalyzedMomentPayload & {
          startSeconds: number;
          endSeconds: number;
        } =>
          typeof moment.startSeconds === "number" &&
          typeof moment.endSeconds === "number",
      );

      if (validMoments.length === 0) {
        await step.run("mark-no-moments-found", async () => {
          await markUploadedFileAttemptFailed(
            uploadedFileId,
            attempt,
            "no_moments_found",
            {
              now: new Date(),
              statuses: ["processing"],
            },
          );
        });

        return { skipped: false, status: "no_moments_found" };
      }

      await step.run("persist-clip-drafts", async () => {
        await createClipDraftsBulk(
          validMoments.map((moment, order) => ({
            uploadedFileId,
            attempt,
            index: moment.index ?? order,
            aiStartSeconds: moment.startSeconds,
            aiEndSeconds: moment.endSeconds,
            startSeconds: moment.startSeconds,
            endSeconds: moment.endSeconds,
            clipType: moment.clipType ?? null,
            hook: moment.hook ?? null,
            payoff: moment.payoff ?? null,
            // 상위 clipCount개만 기본 선택 (Gemini 랭킹 순)
            selected: order < clipCount,
          })),
        );
      });

      const marked = await step.run("mark-review-pending", async () => {
        return markUploadedFileAttemptReviewPending(
          uploadedFileId,
          attempt,
          { transcriptS3Key },
          { now: new Date() },
        );
      });

      if (marked.count !== 1) {
        return { skipped: true, status: "attempt_no_longer_active" };
      }

      return {
        skipped: false,
        status: "review_pending",
        draftCount: validMoments.length,
      };
    } catch (error) {
      await step.run("mark-analysis-failed", async () => {
        await markUploadedFileAttemptFailed(
          uploadedFileId,
          attempt,
          "analysis_failed",
          {
            now: new Date(),
            statuses: ["processing"],
          },
        );
      });

      throw error;
    }
  },
);
```

import 추가: `createClipDraftsBulk`(`~/fsd/entities/clip-draft`), `markUploadedFileAttemptReviewPending`(`~/fsd/entities/uploaded-file`), `import type { AnalyzedMoment } from "./client";`. 그리고 **`src/app/api/inngest/route.ts`의 함수 등록 배열에 `analyzeVideo`를 추가**해야 한다. 현재 파일 구성을 확인했으므로(아래) import와 `functions` 배열 양쪽에 추가한다:

```ts
// 현재 (src/app/api/inngest/route.ts, 확인함)
import { cleanupAnalyticsEvents, processVideo } from "~/inngest/functions";
export const { GET, POST, PUT } = serve({
  client: inngest,
  functions: [processVideo, cleanupAnalyticsEvents],
});

// 변경: import에 analyzeVideo 추가 + functions 배열에 analyzeVideo 추가
// import { analyzeVideo, cleanupAnalyticsEvents, processVideo } from "~/inngest/functions";
// functions: [processVideo, analyzeVideo, cleanupAnalyticsEvents],
```

**(d) `src/app/api/webhooks/modal/route.ts` — phase 분기**

`RawModalWebhookBody`/`NormalizedModalWebhookBody`에 `phase`, `moments`, `transcript_s3_key` 필드를 추가하고, `POST`에서 분기한다. After (변경 부분 중심 — 기존 clip 정규화 함수들은 동일):

```ts
interface RawModalWebhookBody {
  uploadedFileId?: string;
  uploaded_file_id?: string;
  attempt?: number | string;
  status?: string;
  phase?: string;
  clips?: RawModalWebhookClip[];
  moments?: RawAnalyzedMoment[];
  transcript_s3_key?: string;
  transcriptS3Key?: string;
  error?: unknown;
}

interface RawAnalyzedMoment {
  index?: number | string;
  startSeconds?: number | null;
  start_seconds?: number | null;
  endSeconds?: number | null;
  end_seconds?: number | null;
  clipType?: string | null;
  clip_type?: string | null;
  hook?: string | null;
  payoff?: string | null;
}

interface NormalizedModalWebhookBody {
  uploadedFileId: string;
  attempt: number;
  status: string;
  // normalizeBody가 실제로 생산하는 두 값만 모델링한다. 백엔드 phase "auto"와
  // phase 없는 구버전 콜백은 모두 "render"(기존 처리 경로)로 접힌다.
  phase: "analyze" | "render";
  clips?: ModalWebhookClip[];
  moments?: AnalyzedMoment[];
  transcriptS3Key?: string | null;
  error?: string;
}

// 정규화된 moment의 canonical 타입은 이벤트 스키마와 함께 정의된 AnalyzedMoment다.
// 파일 상단에 import type { AnalyzedMoment } from "~/inngest/client"; 를 추가한다.

function normalizeAnalyzedMoment(
  raw: RawAnalyzedMoment,
): AnalyzedMoment | null {
  const index = toStrictNonNegativeInteger(raw.index);
  const startSeconds = raw.startSeconds ?? raw.start_seconds;
  const endSeconds = raw.endSeconds ?? raw.end_seconds;

  if (
    index === null ||
    typeof startSeconds !== "number" ||
    typeof endSeconds !== "number"
  ) {
    return null;
  }

  return {
    index,
    startSeconds,
    endSeconds,
    clipType: raw.clipType ?? raw.clip_type ?? null,
    hook: raw.hook ?? null,
    payoff: raw.payoff ?? null,
  };
}

function normalizeBody(
  rawBody: RawModalWebhookBody,
): NormalizedModalWebhookBody | null {
  const uploadedFileId = rawBody.uploadedFileId ?? rawBody.uploaded_file_id;
  const attempt = toStrictPositiveInteger(rawBody.attempt);

  if (
    typeof uploadedFileId !== "string" ||
    uploadedFileId.length === 0 ||
    attempt === null ||
    typeof rawBody.status !== "string" ||
    rawBody.status.length === 0
  ) {
    return null;
  }

  return {
    uploadedFileId,
    attempt,
    status: rawBody.status,
    // phase가 없으면 구버전 백엔드 콜백이므로 렌더(기존 경로)로 간주한다.
    phase: rawBody.phase === "analyze" ? "analyze" : "render",
    clips: Array.isArray(rawBody.clips)
      ? rawBody.clips
          .map(normalizeClip)
          .filter((clip): clip is ModalWebhookClip => clip !== null)
      : undefined,
    moments: Array.isArray(rawBody.moments)
      ? rawBody.moments
          .map(normalizeAnalyzedMoment)
          .filter((moment): moment is AnalyzedMoment => moment !== null)
      : undefined,
    transcriptS3Key: rawBody.transcript_s3_key ?? rawBody.transcriptS3Key ?? null,
    error: toWebhookErrorMessage(rawBody.error),
  };
}

export async function POST(req: Request) {
  const authHeader = req.headers.get("authorization");

  if (authHeader !== `Bearer ${env.MODAL_WEBHOOK_SECRET}`) {
    return new Response("Unauthorized", { status: 401 });
  }

  const rawBody = (await req.json()) as RawModalWebhookBody;
  const body = normalizeBody(rawBody);

  if (!body) {
    return new Response("Bad Request", { status: 400 });
  }

  if (body.phase === "analyze") {
    await inngest.send({
      name: "modal/video.analyzed",
      data: {
        uploadedFileId: body.uploadedFileId,
        attempt: body.attempt,
        matchKey: getProcessingMatchKey(body.uploadedFileId, body.attempt),
        status: body.status,
        moments: body.moments,
        transcriptS3Key: body.transcriptS3Key,
        error: body.error,
      },
    });

    return new Response("OK", { status: 200 });
  }

  await inngest.send({
    name: "modal/video.processed",
    data: {
      uploadedFileId: body.uploadedFileId,
      attempt: body.attempt,
      matchKey: getProcessingMatchKey(body.uploadedFileId, body.attempt),
      status: body.status,
      clips: body.clips,
      error: body.error,
    },
  });

  const isCurrentAttempt = await isUploadedFileAttemptCurrent(
    body.uploadedFileId,
    body.attempt,
  );

  if (isCurrentAttempt && body.clips && body.clips.length > 0) {
    try {
      await updateClipMetadataFromBackendClips({
        uploadedFileId: body.uploadedFileId,
        processingAttempt: body.attempt,
        clips: body.clips,
      });
    } catch (error) {
      console.error("Failed to reconcile modal clip metadata", error);
    }
  }

  return new Response("OK", { status: 200 });
}
```

행동 불변식: `phase`가 없거나 "analyze"가 아닌 콜백(자동/렌더/구버전 백엔드)은 변경 전과 동일하게 `modal/video.processed` 이벤트 발송 + 클립 메타데이터 reconcile을 수행한다.

### 4.8 프론트엔드 — 검토 서버 액션 (`features/clip-review` 신규 + `features/upload` 확장)

역할 분담: **draft 편집(전사 URL 조회, 구간/캡션 저장)은 신규 `clip-review` 피처**가, **확정·렌더 스케줄은 스케줄링을 이미 소유한 기존 `upload` 피처**가 맡는다. 이렇게 나누면 feature 간 peer import와 auth/검증 이중 실행이 생기지 않는다.

**`src/fsd/features/clip-review/api/index.ts` (신규)**

```ts
"use server";

import { revalidatePath } from "next/cache";
import { db } from "~/server/db";
import {
  findClipDraftWithUpload,
  updateClipDraftEdit,
} from "~/fsd/entities/clip-draft";
import { generatePresignedGetUrl, S3_CONFIG } from "~/fsd/shared/api/s3";
import { requireAuth } from "~/fsd/shared/api/auth-guard";
import { type ActionResult, failure, success } from "~/fsd/shared/api/result";
import {
  CLIP_DURATION_LIMITS,
  isClipDurationWithinLimits,
} from "~/fsd/shared/config/constants";
import { updateClipDraftSchema, type CaptionStyleInput } from "../model/schemas";

// Generate a short-lived URL for the stored word-level transcript JSON,
// used by the review UI for word-boundary snapping and text preview.
export async function getTranscriptUrl(
  uploadedFileId: string,
): Promise<ActionResult<{ url: string }>> {
  const authResult = await requireAuth();
  if (!authResult.success) return authResult;

  try {
    const file = await db.uploadedFile.findFirst({
      where: { id: uploadedFileId, userId: authResult.data.userId },
      select: { transcriptS3Key: true },
    });

    if (!file?.transcriptS3Key) {
      return failure("Transcript is not available for this upload");
    }

    const url = await generatePresignedGetUrl(
      file.transcriptS3Key,
      S3_CONFIG.PRESIGNED_GET_URL_EXPIRY,
    );

    return success({ url });
  } catch (error) {
    console.error("Failed to get transcript url", error);
    return failure("Failed to get transcript url");
  }
}

// Persists a single draft edit (range, selection, caption style) while under review.
export async function saveClipDraftEdit(input: {
  clipDraftId: string;
  startSeconds: number;
  endSeconds: number;
  selected: boolean;
  captionStyle?: CaptionStyleInput | null;
}): Promise<ActionResult<void>> {
  const authResult = await requireAuth();
  if (!authResult.success) return authResult;

  const validated = updateClipDraftSchema.safeParse(input);

  if (!validated.success) {
    return failure(validated.error.issues[0]?.message ?? "Invalid edit");
  }

  const { clipDraftId, startSeconds, endSeconds, selected, captionStyle } =
    validated.data;

  try {
    const draft = await findClipDraftWithUpload(
      clipDraftId,
      authResult.data.userId,
    );

    if (!draft) {
      return failure("Clip draft not found");
    }

    if (
      draft.uploadedFile.status !== "review_pending" ||
      draft.uploadedFile.reviewAttempt !== draft.attempt
    ) {
      return failure("This upload is not currently under review");
    }

    if (!isClipDurationWithinLimits(startSeconds, endSeconds)) {
      return failure(
        `Clip length must be between ${CLIP_DURATION_LIMITS.MIN_SECONDS}s and ${CLIP_DURATION_LIMITS.MAX_SECONDS}s`,
      );
    }

    await updateClipDraftEdit(clipDraftId, {
      startSeconds,
      endSeconds,
      selected,
      captionStyle,
    });

    revalidatePath(`/dashboard/uploads/${draft.uploadedFile.id}`);
    return success();
  } catch (error) {
    console.error("Failed to save clip draft edit", error);
    return failure("Failed to save clip draft edit");
  }
}
```

**`src/fsd/features/upload/api/index.ts`에 확정 액션 추가** (기존 `scheduleUploadedFileProcessing` 아래)

확정 액션을 clip-review에 두면 비공개 함수 `scheduleProcessingAttempt`에 도달하기 위해 feature 간 peer import + 얇은 래퍼(auth·zod 검증 이중 실행)가 필요해진다. 스케줄링을 소유한 upload 피처에 배치하면 둘 다 사라진다. 입력 스키마는 기존 `scheduleUploadedFileProcessingSchema`(uploadedFileId cuid)를 재사용한다:

```ts
// Validates the reviewed drafts and schedules the render attempt.
// clip-review 피처가 아니라 이 파일에 두는 이유: 비공개 scheduleProcessingAttempt를
// 직접 호출해 feature 간 peer import와 이중 auth/검증을 피한다.
export async function confirmClipDraftsAndGenerate(
  uploadedFileId: string,
): Promise<ActionResult<void>> {
  const authResult = await requireAuth();
  if (!authResult.success) return authResult;

  const validated = scheduleUploadedFileProcessingSchema.safeParse({
    uploadedFileId,
  });

  if (!validated.success) {
    return failure(validated.error.issues[0]?.message ?? "Invalid request");
  }

  try {
    const file = await db.uploadedFile.findFirst({
      where: {
        id: validated.data.uploadedFileId,
        userId: authResult.data.userId,
      },
      select: {
        id: true,
        status: true,
        reviewAttempt: true,
        targetClipCount: true,
        user: { select: { credits: true } },
      },
    });

    if (!file) {
      return failure("Uploaded file not found");
    }

    if (file.status !== "review_pending" || file.reviewAttempt === null) {
      return failure("This upload is not currently under review");
    }

    const selectedDrafts = (
      await listClipDraftsForAttempt(file.id, file.reviewAttempt)
    ).filter((draft) => draft.selected);

    if (selectedDrafts.length === 0) {
      return failure("Select at least one clip to generate");
    }

    if (selectedDrafts.length > file.targetClipCount) {
      return failure(
        `You can generate up to ${file.targetClipCount} clips for this upload`,
      );
    }

    if (file.user.credits < selectedDrafts.length) {
      return failure("Not enough credits for the selected clips");
    }

    // 겹치는 구간 방지 (백엔드 identify_moments의 non-overlap 제약을 미러링)
    const sorted = [...selectedDrafts].sort(
      (a, b) => a.startSeconds - b.startSeconds,
    );

    for (let i = 1; i < sorted.length; i++) {
      const prev = sorted[i - 1]!;
      const next = sorted[i]!;

      if (next.startSeconds < prev.endSeconds) {
        return failure("Selected clips must not overlap");
      }
    }

    for (const draft of selectedDrafts) {
      if (!isClipDurationWithinLimits(draft.startSeconds, draft.endSeconds)) {
        return failure(
          `Every selected clip must be between ${CLIP_DURATION_LIMITS.MIN_SECONDS}s and ${CLIP_DURATION_LIMITS.MAX_SECONDS}s`,
        );
      }
    }

    return scheduleProcessingAttempt(
      file.id,
      authResult.data.userId,
      ["review_pending"],
      "render",
    );
  } catch (error) {
    console.error("Failed to confirm clip drafts", error);
    return failure("Failed to start clip generation");
  }
}
```

`features/upload/api/index.ts`의 import 추가: `listClipDraftsForAttempt`(`~/fsd/entities/clip-draft` — feature→entity로 허용), `isClipDurationWithinLimits`·`CLIP_DURATION_LIMITS`(`~/fsd/shared/config/constants`). 위젯 훅(use-clip-draft-review)은 이 액션을 `~/fsd/features/upload/api`에서 직접 import한다 — `OriginalMediaCard`가 `getOriginalPlayUrl`을 가져오는 기존 관례와 동일하다.

`model/schemas.ts` (신규):

```ts
import { z } from "zod";
import {
  CAPTION_STYLE_OPTIONS,
  CLIP_DURATION_LIMITS,
  isClipDurationWithinLimits,
  type CaptionStyle,
} from "~/fsd/shared/config/constants";

// ClipDraft.captionStyle JSON의 유일한 검증 지점. 캡션 계약의 원천 타입은
// shared/config의 CaptionStyle 하나이며, satisfies가 스키마-타입 드리프트를 막는다.
// 허용 범위는 백엔드 resolve_caption_style과 동기 (main.py: fontSize 60-200, maxWordsPerLine 1-8).
export const captionStyleSchema = z.object({
  position: z.enum(CAPTION_STYLE_OPTIONS.POSITIONS),
  fontSize: z
    .number()
    .int()
    .min(CAPTION_STYLE_OPTIONS.FONT_SIZE_RANGE.MIN)
    .max(CAPTION_STYLE_OPTIONS.FONT_SIZE_RANGE.MAX)
    .nullable(),
  color: z
    .string()
    .regex(/^#[0-9a-fA-F]{6}$/, "Color must be #RRGGBB")
    .nullable(),
  maxWordsPerLine: z
    .number()
    .int()
    .min(CAPTION_STYLE_OPTIONS.MAX_WORDS_RANGE.MIN)
    .max(CAPTION_STYLE_OPTIONS.MAX_WORDS_RANGE.MAX)
    .nullable(),
}) satisfies z.ZodType<CaptionStyle>;

export type CaptionStyleInput = CaptionStyle;

export const updateClipDraftSchema = z
  .object({
    clipDraftId: z.string().cuid(),
    startSeconds: z.number().min(0),
    endSeconds: z.number().positive(),
    selected: z.boolean(),
    // undefined = 스타일 변경 없음, null = 기본 스타일로 리셋
    captionStyle: captionStyleSchema.nullable().optional(),
  })
  .refine(
    (value) => isClipDurationWithinLimits(value.startSeconds, value.endSeconds),
    {
      message: `Clip length must be between ${CLIP_DURATION_LIMITS.MIN_SECONDS}s and ${CLIP_DURATION_LIMITS.MAX_SECONDS}s`,
    },
  );
```

(별도 `confirmClipDraftsSchema`는 두지 않는다 — 확정 액션이 upload 피처에 있으므로 기존 `scheduleUploadedFileProcessingSchema`를 재사용한다. 30~90초 판정은 세 곳(스키마 refine, `saveClipDraftEdit`, `confirmClipDraftsAndGenerate`) 모두 shared의 `isClipDurationWithinLimits` 단일 지점을 호출한다.)

### 4.9 프론트엔드 — 검토 UI (`src/fsd/widgets/clip-draft-review/`, 신규)

`ui/index.tsx` — 업로드 상세 페이지가 `status === "review_pending"`일 때 렌더하는 섹션:

```tsx
"use client";

import { useMemo, useRef, useState } from "react";
import type { ClipDraft } from "generated/prisma";
import { getOriginalPlayUrl } from "~/fsd/features/upload/api";
import { usePlayUrl } from "~/fsd/shared/lib/use-play-url";
import { Button } from "~/fsd/shared/ui/atoms/button";
import { useClipDraftReview } from "../model/use-clip-draft-review";
import ClipDraftCard from "./_component/ClipDraftCard";

interface ClipDraftReviewSectionProps {
  uploadedFileId: string;
  clipDrafts: ClipDraft[];
  targetClipCount: number;
  currentUserCredits: number;
}

export default function ClipDraftReviewSection({
  uploadedFileId,
  clipDrafts,
  targetClipCount,
  currentUserCredits,
}: ClipDraftReviewSectionProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const { playUrl } = usePlayUrl(uploadedFileId, getOriginalPlayUrl);
  const [activeDraftId, setActiveDraftId] = useState<string | null>(null);
  const {
    transcriptWords,
    saveDraft,
    applyStyleToAll,
    confirmAndGenerate,
    isConfirming,
  } = useClipDraftReview(uploadedFileId);

  const selectedCount = useMemo(
    () => clipDrafts.filter((draft) => draft.selected).length,
    [clipDrafts],
  );

  // 서버 액션 confirmClipDraftsAndGenerate의 가드(선택 1개 이상, 목표 개수 이하,
  // 크레딧 충분)와 동일한 규칙의 클라이언트 미러.
  const canGenerate =
    !isConfirming &&
    selectedCount > 0 &&
    selectedCount <= targetClipCount &&
    currentUserCredits >= selectedCount;

  const handlePreview = (draft: ClipDraft) => {
    setActiveDraftId(draft.id);
    const video = videoRef.current;
    if (!video) return;
    video.currentTime = draft.startSeconds;
    void video.play();
  };

  return (
    <section className="bg-card rounded-xl border">
      <div className="flex items-center justify-between border-b px-6 py-4">
        <div>
          <p className="text-muted-foreground text-sm">Review clip plan</p>
          <h2 className="text-xl font-semibold">
            {selectedCount} of {clipDrafts.length} moments selected
          </h2>
        </div>
        <Button onClick={() => confirmAndGenerate()} disabled={!canGenerate}>
          Generate {selectedCount} clip{selectedCount === 1 ? "" : "s"}
        </Button>
      </div>

      <div className="grid grid-cols-1 gap-6 px-6 py-6 lg:grid-cols-2">
        <div className="overflow-hidden rounded-xl bg-black">
          {playUrl && (
            <video
              ref={videoRef}
              src={playUrl}
              controls
              preload="metadata"
              className="w-full rounded-md object-cover"
            />
          )}
        </div>

        <div className="flex max-h-[560px] flex-col gap-4 overflow-y-auto">
          {clipDrafts.map((draft) => (
            <ClipDraftCard
              key={draft.id}
              draft={draft}
              isActive={draft.id === activeDraftId}
              transcriptWords={transcriptWords}
              onPreview={() => handlePreview(draft)}
              onSave={saveDraft}
              onApplyToAll={applyStyleToAll}
            />
          ))}
        </div>
      </div>
    </section>
  );
}
```

`ui/_component/ClipDraftCard.tsx` — 후보 1개의 편집 카드. 핵심 동작 명세:

- 시작/종료 시각을 `mm:ss.s` 표기로 보여주고, `±0.5s` 스텝 버튼과 숫자 입력을 제공한다.
- `transcriptWords`(전사 JSON: `[{ start, end, word }]` — 백엔드 `transcribe_video` 반환 형식, main.py:727)가 로드되어 있으면 조정 시 가장 가까운 단어 경계(시작은 word.start, 종료는 word.end)로 스냅한다.
- 현재 구간에 포함되는 단어들을 이어붙인 텍스트 미리보기를 보여준다 (구간 필터 조건은 백엔드 자막 필터와 동일: `word.start >= start && word.end <= end`, main.py:168-173 참조).
- 길이(`end - start`)를 표시하고 `CLIP_DURATION_LIMITS` 위반 시 저장 버튼을 비활성화하고 경고를 노출한다.
- `hook`/`payoff`/`clipType` 배지로 AI의 추천 근거를 보여준다.
- "Reset to AI suggestion" 버튼은 `aiStartSeconds`/`aiEndSeconds`로 되돌린다.
- 카드 하단의 접이식 "Caption style" 패널(`CaptionStyleEditor`)에서 캡션 스타일을 편집한다. 스타일 변경도 카드 단위 "Save"에 함께 실려 `saveClipDraftEdit`로 저장된다. `draft.captionStyle`(Prisma `JsonValue`)은 카드가 편집 상태를 초기화하는 **한 곳에서만** shared `CaptionStyle`로 좁힌다(`(draft.captionStyle as CaptionStyle | null) ?? null`) — 캡션 형태를 UI에서 재선언하지 않는다.
- 체크박스로 `selected` 토글. 변경 사항은 카드 단위 "Save" 시 `saveClipDraftEdit` 호출.

`ui/_component/CaptionStyleEditor.tsx` — 캡션 스타일 편집 + 근사 미리보기. 동작 명세:

- 컨트롤: 위치 세그먼트(Top/Middle/Bottom), 글자 크기 슬라이더(`CAPTION_STYLE_OPTIONS.FONT_SIZE_RANGE` 범위, 언어별 기본값을 초기값으로 표시), 색상 스와치(`COLOR_PRESETS`), 줄당 단어 수 스테퍼(`MAX_WORDS_RANGE`), "Reset style"(스타일을 `null`로 저장 → 언어 기본값), "Apply style to all clips" 버튼.
- "Apply style to all clips"의 벌크 저장 로직은 이 컴포넌트가 소유하지 않는다. 에디터는 `onApplyToAll(style)` 콜백만 호출하고, draft 컬렉션을 아는 `use-clip-draft-review`가 draft별 `saveClipDraftEdit` 순차 호출을 수행한다 (컬렉션 연산은 컬렉션을 보유한 상위에 배치).
- 미리보기: `aspect-[9/16]` 컨테이너에 원본 `<video>` 프레임을 `object-cover`로 중앙 크롭해 배경으로 깔고(실제 ASD 크롭과는 다른 근사), 그 위에 절대배치 캡션을 오버레이한다. 캡션 텍스트는 현재 구간 전사 단어를 `maxWordsPerLine`개씩 묶은 첫 그룹을 사용한다.
- 좌표 환산: ASS는 `PlayResX 1080 / PlayResY 1920` 기준이므로(main.py:221-222) 미리보기 폰트 픽셀 크기는 `fontSize × (previewHeightPx / 1920)`, 세로 마진은 `marginv × (previewHeightPx / 1920)`으로 환산한다. position별 CSS: top → 상단 정렬 + 환산 마진, middle → 수직 중앙, bottom → 하단 정렬 + 환산 마진.
- 근사 한계를 UI에 명시한다: "Preview is approximate — final render may differ." (ASS 폰트 메트릭·외곽선·그림자와 CSS 렌더는 동일하지 않다.)

`model/use-clip-draft-review.ts` — tanstack query 기반 훅 (기존 `useReprocessUploadedFile`, `src/fsd/features/upload/model/use-reprocess-uploaded-file.ts` 패턴 미러링):

- `transcriptWords: TranscriptWord[]`: `getTranscriptUrl` → presigned URL fetch → JSON 파싱 (`useQuery`, staleTime Infinity). `TranscriptWord = { start: number; end: number; word: string }` 타입은 이 위젯의 `model/`에 정의·export하고(백엔드 `transcribe_video` 반환 형식, main.py:727), 카드·에디터가 동일 타입을 소비한다 — 세 소비처가 형태를 각자 인라인하지 않게 한다.
- `saveDraft`: `saveClipDraftEdit`(clip-review) mutation → 성공 시 `uploadedFileKeys.detail(uploadedFileId)` invalidate.
- `applyStyleToAll(style)`: draft 컬렉션을 순회하며 `saveClipDraftEdit`를 순차 호출하는 mutation. 벌크 저장은 컬렉션을 아는 이 훅이 소유하고, `CaptionStyleEditor`는 콜백만 호출한다.
- `confirmAndGenerate`: `confirmClipDraftsAndGenerate`(`~/fsd/features/upload/api`) mutation → 성공 시 detail invalidate (+`toast.success`). 확정 후 상태가 `pending_enqueue`(active)로 바뀌므로 기존 `useLiveUploadedFileDetail` 폴링이 자동 재개된다.

### 4.10 프론트엔드 — 업로드 상세 페이지 통합

`src/fsd/pages/upload-detail/ui/index.tsx`의 "Generated clips" 섹션(현재 :126-150) 위에 조건부 렌더를 추가한다:

```tsx
      {status === "review_pending" && liveUploadedFileData.clipDrafts.length > 0 && (
        <ClipDraftReviewSection
          uploadedFileId={uploadedFileId}
          clipDrafts={liveUploadedFileData.clipDrafts}
          targetClipCount={targetClipCount}
          currentUserCredits={currentUserCredits}
        />
      )}
```

`ProcessingTimeline`(`src/fsd/pages/upload-detail/ui/_component/ProcessingTimeline.tsx`)에는 검토 모드일 때 "Analysis → Review → Render" 단계를 표현하도록 `reviewReadyAt` prop을 추가한다 (현재 props: status, enqueueRequestedAt, queuedAt, processingStartedAt, terminalStatusAt, failureCode — 사용처 upload-detail/ui/index.tsx:114-121에서 확인). 세부 시각 표현은 구현 시 결정.

`UploadedFileActions`(`src/fsd/features/upload/ui/index.tsx`)는 수정 없이 동작한다: `review_pending`은 active가 아니므로 "Reprocess"(재분석) 버튼이 활성화되고, `reprocessUploadedFile` allowedStatuses 확장으로 재분석이 허용된다.

### 4.11 실패 코드 추가

`analyzeVideo`가 새로 만드는 `failureCode` 값: `analysis_timeout`, `analysis_failed`, `no_moments_found` (`missing_source_object`/`backend_failed`는 기존 소스 체크에서 쓰던 코드를 재사용하므로 신규 아님). `failureCode`는 UploadedFile의 자유 문자열 컬럼이므로 스키마 변경은 없다. `failureCode`를 **라벨로 렌더하는 UI 소비처는 `src/fsd/pages/upload-detail/ui/_component/ProcessingTimeline.tsx` 한 곳**임을 grep으로 확인했다(나머지 소비처 5개는 값 set·타입 선언·전달일 뿐이다). 신규 코드의 사용자 표기가 필요하면 이 파일에 라벨을 추가한다 — 자유 문자열이라 라벨이 없어도 동작에는 지장이 없다.

---

## 5. 실행 순서

각 Phase는 독립적으로 검증 가능하며, Phase 1(백엔드)은 나머지와 배포 순서를 분리할 수 있다 (additive라 선배포 안전).

### Phase 1: 백엔드 mode 지원 (`ai-podcast-clipper-backend/main.py`)

- 작업: `ProcessVideoRequest` 확장, `validate_moments`·`resolve_caption_style`·`parse_hex_color` 헬퍼, 자막 함수 캡션 파라미터화(`create_subtitles_with_ffmpeg`/`create_korean_subtitles_with_ffmpeg`/`process_clip`), `_do_process_video` mode 분기, `process_video` 엔드포인트 인자 전달. `modal deploy main.py`.
- 검증:
  - 회귀 — mode 없이 기존 payload로 호출(`modal run main.py`, 로컬 entrypoint는 main.py:996-1016) 시 기존과 동일하게 클립이 생성된다 (자막 스타일 포함 출력 불변).
  - `mode="analyze"` 동기 호출 시 응답에 `phase: "analyze"`, `moments[]`, `transcript_s3_key`가 오고 S3에 `{prefix}/transcript.json`이 생긴다.
  - `mode="render"` + 직접 만든 `moments` 동기 호출 시 해당 구간만 클립이 생성되고 전사 재사용 로그("Reusing stored transcript")가 찍힌다.
  - `mode="render"`의 moment에 `caption_style`(예: `{"position": "bottom", "fontSize": 150, "color": "#FFE45E", "maxWordsPerLine": 4}`)을 넣으면 생성된 클립 자막이 하단/확대/노란색/4단어 그룹으로 반영되고, `caption_style` 없는 moment는 기존과 동일한 자막이 나온다.

### Phase 2: DB 스키마

- 작업: `UploadedFile` 필드 4개 + `ClipDraft` 모델 + `ProcessingDispatch.kind`. `npm run db:generate` → `npm run db:migrate`.
- 검증: 마이그레이션 성공, `npm run typecheck` (기존 코드는 새 컬럼을 몰라도 컴파일됨 — 전부 optional/default).

### Phase 3: 상태/타입/엔티티 계층

- 작업: `processing-status.ts`에 `review_pending`, StatusBadge 항목, `CLIP_DURATION_LIMITS`, `UploadedFileDetail` 확장, `entities/clip-draft` 신규, `markUploadedFileAttemptReviewPending`, `getUploadedFileDetailsById` 확장, `createProcessingDispatch`/`findPendingProcessingDispatchById` kind 지원.
- 검증: `npm run check`. StatusBadge의 `satisfies Record<ProcessingStatus, ...>`가 누락 항목을 컴파일 타임에 잡는다.

### Phase 4: Inngest + 웹훅

- 작업: `client.ts` 이벤트 스키마, `analyzeVideo` 신규 함수 + `api/inngest/route.ts` 등록, `processVideo` 국소 수정 2곳, 웹훅 phase 분기, 디스패처 kind 분기.
- 검증: `npm run inngest-dev`(Inngest dev 서버, http://localhost:8288 — frontend CLAUDE.md) + `npm run dev`로 검토 모드 업로드 → `analyze-video-events` 수신 → Modal 호출 → `modal/video.analyzed` 수신 → DB에 ClipDraft 생성, 상태 `review_pending` 확인. 자동 모드 업로드가 기존과 동일하게 `processed`까지 가는지 회귀 확인.

### Phase 5: 스케줄링/서버 액션

- 작업: `scheduleProcessingAttempt` kind 지원, `reprocessUploadedFile` allowedStatuses 확장, `prepareUpload`/`createUploadDraft` 플래그 전달, `features/clip-review` 서버 액션 + 스키마(`captionStyleSchema` 및 `saveClipDraftEdit`의 captionStyle 처리 포함).
- 검증: `npm run check`. Prisma Studio(`npm run db:studio`)로 draft 편집 액션 호출 결과(값 갱신, 상태 가드 동작) 확인.

### Phase 6: UI

- 작업: `UploadPodcast` 토글, `clip-draft-review` 위젯 4파일(`CaptionStyleEditor` 포함), 업로드 상세 통합, ProcessingTimeline 확장.
- 검증: 수동 E2E (8. 검증 전략의 시나리오).

### Phase 7: 롤아웃

- 작업: `reviewBeforeGenerate` 기본값은 `false`(옵트인) 유지. 안정화 후 기본값 전환 여부 결정 (Open Questions).
- 검증: 프로덕션에서 자동 모드 지표(성공률) 변화 없음 확인 후 검토 모드 사용 시작.

---

## 6. 영향 범위

- **직접 수정 대상**:
  - 백엔드: `main.py` (1파일)
  - 프론트엔드 수정: `prisma/schema.prisma`, `src/inngest/client.ts`, `src/inngest/functions.ts`, `src/app/api/inngest/route.ts`, `src/app/api/webhooks/modal/route.ts`, `src/fsd/entities/uploaded-file/{api/index.ts, model/processing-status.ts, model/types.ts, ui/UploadedFileStatusBadge.tsx, index.ts(배럴)}`, `src/fsd/entities/processing-dispatch/api/index.ts`, `src/fsd/features/upload/{api/index.ts, model/schemas.ts}`, `src/fsd/pages/dashboard/{ui/_component/UploadPodcast.tsx, model/useUploadPodcast.ts}`, `src/fsd/pages/upload-detail/ui/index.tsx`, `src/fsd/pages/upload-detail/ui/_component/ProcessingTimeline.tsx`, `src/fsd/shared/config/constants.ts`
  - 프론트엔드 신규: `entities/clip-draft/*`, `features/clip-review/*`, `widgets/clip-draft-review/*` (`CaptionStyleEditor.tsx` 포함 약 9파일)
- **import 변경 필요**: `functions.ts`(clip-draft, uploaded-file 신규 함수), `processing-dispatch/api`(clip-draft 또는 db 직접), 배럴 파일들의 export 추가.
- **외부 의존성**: 신규 패키지 없음. Modal/Inngest/S3/Prisma 기존 스택 그대로.
- **소비자/사용처 영향**: `isActiveProcessingStatus`·`ACTIVE_PROCESSING_STATUSES`·`process-video-events` 문자열 소비처는 grep으로 전수 열거했다(4.4(a) 참조, 10개 파일). `review_pending`은 non-active로 분류되어 stale 회수·삭제 가드·폴링·큐 UI의 기존 의미가 유지된다. 폴링은 `useLiveUploadedFileDetail`이 `isActiveProcessingStatus(live status)`로 refetchInterval을 켜고 끄므로(확인함, `use-live-uploaded-file-detail.ts`), `review_pending`에서 폴링이 멈추고 확정 후 `pending_enqueue`(active)로 바뀌면 자동 재개된다. `failureCode` 문자열 소비처도 확인했다: 6개 파일 중 라벨을 렌더하는 곳은 `ProcessingTimeline.tsx` 한 곳뿐이다(4.11). Inngest 신규 이벤트(`analyze-video-events`/`modal/video.analyzed`)는 `client.ts`의 `EventSchemas`로 타입 강제되어 이름 오타가 컴파일 타임에 잡힌다.
- **하위 호환**: 구버전 백엔드(phase 미포함 콜백)와 신버전 프론트가 공존해도 웹훅이 렌더로 간주해 기존 경로로 처리한다. 신버전 백엔드와 구버전 프론트 공존 시 `mode` 기본값 "auto"로 기존 동작.

---

## 7. 리스크 + 롤백 전략

### 리스크

1. **분석과 렌더 사이 크레딧 소진** (가능성 중, 영향 저): 검토 중 다른 업로드가 크레딧을 소모하면 렌더 시점에 부족할 수 있다. `confirmClipDraftsAndGenerate`의 사전 체크 + `processVideo`의 기존 `credits < clipCount` 체크(→ `no credits` 상태)로 이중 방어되며, 사용자는 크레딧 충전 후 재확정할 수 있다. 단, `no credits` 상태에서의 재시도는 `reprocessUploadedFile`(재분석) 경로라 편집이 소실된다 — v1 한계로 문서화 (Open Questions).
2. **편집 구간이 영상 길이를 초과** (가능성 저, 영향 중): 프론트는 영상 길이를 DB에 저장하지 않으므로 서버 액션이 상한을 모른다. 클라이언트에서 `video.duration`으로 클램프하고, 백엔드 `validate_moments(..., video_duration)`이 최종 방어한다. 초과 구간이 걸러지면 생성 수가 줄어 기존 `incomplete_clips_generated` 실패 경로로 수렴한다.
3. **전사 JSON 손실/손상** (가능성 저, 영향 저): 렌더 시 로드 실패하면 재전사로 폴백한다 (GPU 시간 추가 소모만 발생).
4. **분석 타임아웃과 Modal 컨테이너 타임아웃 정렬** (가능성 중, 영향 저): `ANALYSIS_RESULT_TIMEOUT`을 Modal 컨테이너 타임아웃(3600s = 60m, main.py:678)에 맞춰 `60m`으로 둔다. 이보다 짧으면 Modal이 아직 전사/추출 중인데 Inngest가 먼저 `analysis_timeout`으로 포기해 뒤늦게 도착한 콜백이 버려지고 GPU가 낭비된다. 상수 하나라 조정 용이.
5. **`review_pending` 방치 누적** (가능성 중, 영향 저): 워커를 잡지 않는 상태라 시스템 부하는 없다. transcript.json이 S3에 남지만 업로드 삭제 시 prefix 전체 삭제(`deleteUploadedFileS3Assets`)에 포함된다. TTL 정리는 Open Questions.
6. **FSD 계층 위반** (가능성 저, 영향 저): 확정 액션을 `features/upload/api`에 배치해 feature 간 의존과 이중 auth/검증을 제거했다(4.8). 남은 예외는 렌더 디스패처의 `clip-draft` 헬퍼 호출 한 곳이며, 대안(인라인 쿼리)을 Open Questions에 명시했다.
7. **캡션 미리보기 근사 오차** (가능성 고, 영향 저): CSS 미리보기와 ASS 실제 렌더는 폰트 메트릭·외곽선·그림자·배경 구도(ASD 크롭)가 다르다. 완화: 미리보기에 근사 문구를 명시하고, 구현 시 대표 스타일 조합(3개 위치 × 크기 최소/최대 × 색상)으로 실제 렌더와 대조 QA를 수행한다. 또한 기본 `alignment = 5`는 ASS 규격상 화면 중앙 정렬인데 한국어 함수의 코드 주석은 "하단 중앙"(main.py:426)이라, 기본 출력의 실제 체감 위치를 실측해 미리보기 라벨과 일치시켜야 한다.

### 롤백 전략

- 백엔드: `mode` 기본값이 "auto"이므로 프론트 롤백만으로 기능이 비활성화된다. 백엔드 자체 롤백도 `modal deploy`로 이전 리비전 재배포하면 된다 (프론트가 구버전이면 신필드를 안 보내므로 안전).
- 프론트: 업로드 폼 토글을 제거(또는 숨김)하면 신규 업로드는 전부 auto 경로. DB 컬럼·테이블은 additive라 코드 롤백 후에도 무해하게 남는다.
- 검토 중이던 업로드가 롤백에 걸린 경우: `review_pending`은 non-active이므로 사용자가 "Reprocess"로 자동 모드 재처리하거나 삭제할 수 있다 (단, 롤백 빌드에 `review_pending` 상태 문자열이 없으면 `isProcessingStatus`가 throw하므로, **status enum 추가(Phase 3)는 롤백 대상에서 제외**하거나 롤백 전 해당 row를 `failed`로 수동 정리한다).

---

## 8. 검증 전략

- **기존 테스트**: 저장소에서 자동화 테스트 프레임워크/테스트 파일 컨벤션이 관찰되지 않았다 (frontend `npm run check`/`typecheck`/`lint`가 품질 게이트, frontend CLAUDE.md). 따라서 이번 문서는 새 단위 테스트를 성공 기준으로 명시하지 않는다 (Open Questions).
- **타입/빌드 검증**: 각 Phase 후 `npm run check`. 특히 `STATUS_BADGE_CONFIG`의 `satisfies Record<ProcessingStatus, ...>`와 Inngest `EventSchemas` 타입이 상태·이벤트 누락을 컴파일 타임에 잡는다.
- **백엔드 검증**: Phase 1의 동기 모드 3종 호출 (회귀 auto / analyze / render).
- **수동 확인 시나리오** (dev 서버 + `npm run inngest-dev`):
  1. 자동 모드 업로드 → 기존과 동일하게 `processed` + 클립 N개 (회귀).
  2. 검토 모드 업로드 → `review_pending` 도달, draft ≤ `clipCount*2`개, 상위 `clipCount`개만 selected, S3에 transcript.json.
  3. draft 구간 조정(30초 미만/90초 초과 입력 시 저장 거부 확인) 후 저장 → 새로고침에도 값 유지.
  4. 후보 2개 선택 확정 → `pending_enqueue → queued → processing → processed`, 클립 정확히 2개, Clip.startSeconds/endSeconds가 편집값과 일치, 크레딧 2 차감.
  5. 캡션 스타일 편집(위치 bottom, 크기 150, 색 #FFE45E, 줄당 4단어) 후 확정 → 생성된 클립 자막이 하단/확대/노란색/4단어 그룹으로 반영된다. 스타일을 건드리지 않은 클립의 자막은 기존 기본 스타일과 동일하다. "Reset style" 후 생성 시에도 기본 스타일과 동일하다.
  6. 겹치는 두 구간 선택 확정 → 거부 메시지.
  7. `review_pending`에서 "Reprocess" → 새 attempt로 재분석, 새 draft 세트로 교체(reviewAttempt 갱신).
  8. `review_pending`에서 업로드 삭제 → 성공 (active 아님).
  9. 분석 실패 유도(존재하지 않는 s3 key 등) → `failed` + `analysis_failed`/`missing_source_object`.

---

<!-- doc-validation-skip -->
## Open Questions

- **[크레딧 정책]** 분석 단계 무료(최소 1크레딧 보유 요구) + 렌더 시 클립당 차감으로 설계했다. 분석 자체(WhisperX GPU)에 크레딧을 매길지는 비즈니스 판단 — 유지 시 현행 설계 그대로, 과금 시 `analyzeVideo` 완료 지점에 차감 로직 추가 필요.
- **[no credits 후 재확정]** 렌더가 `no credits`로 끝난 뒤 크레딧 충전 시, 현재 설계는 재분석(reprocess)만 가능해 편집이 소실된다. `no credits`/`failed`(렌더 단계 한정)에서 기존 draft로 렌더만 재시도하는 액션(=`scheduleProcessingAttempt(..., "render")` allowedStatuses 확장 + reviewAttempt 유지)을 v1에 포함할지 결정 필요 — 포함 시 확정 액션과 동일 경로라 추가 비용은 작다.
- **[FSD 배치]** (대부분 해소 — 클린 코드 리뷰 반영) 확정 액션은 feature 간 peer import와 auth/검증 이중 실행을 피하기 위해 `features/upload/api`에 배치하는 것으로 확정했다(4.8). 남은 예외는 한 곳: 렌더 디스패처의 `processing-dispatch → clip-draft` entity 간 import(`getSelectedRenderMomentsForAttempt` 단일 호출, 4.5(c)). entity 간 금지를 엄격 적용하려면 이 헬퍼의 쿼리+매핑을 디스패처에 `db.clipDraft` 직접 조회로 인라인한다 — 이 경우 ClipDraft 컬럼 지식이 디스패처로 새는 트레이드오프를 감수한다. 최종 선택은 FSD 경계를 소유한 사람이 확정할 것.
- **[reviewBeforeGenerate 기본값]** 초기 false(옵트인)로 제안. 기능 안정화 후 기본 활성화(또는 업로드 폼에서 기억) 시점은 사용자 판단.
- **[review_pending TTL]** 장기 방치된 검토 대기 업로드의 자동 정리(예: 30일 후 failed 처리 또는 알림) 여부.
- **[커스텀 구간 추가(v2)]** 전사 텍스트 기반으로 사용자가 임의 구간을 draft로 추가하는 기능. ClipDraft 스키마는 `aiStartSeconds == startSeconds` 초기화 구조라 커스텀 draft(예: index 100+, aiStart=start)로 자연 확장 가능.
- **[검증 커버리지]** 저장소에 테스트 프레임워크가 없어 수동 검증 중심으로 설계했다. `validate_moments`(백엔드)와 overlap/duration 검증(프론트)은 단위 테스트 가치가 높은 순수 함수이므로, 테스트 도입 시 우선 대상으로 권장.
- **[캡션 위치 마진/기본 위치 라벨]** top 200 / bottom 260의 `marginv` 초기값은 제안값이며 시각 튜닝이 필요하다. 또한 현재 기본 `alignment = 5`는 ASS 규격상 화면 중앙인데 한국어 함수 주석은 "하단 중앙"(main.py:426)으로 표기되어 있어, 기본 출력의 실제 위치를 확인해 미리보기의 "Middle" 라벨과 일치시켜야 한다.
- **[색상 자유도]** v1은 `COLOR_PRESETS` 4색 스와치만 제공하는 설계다. 자유 색상 피커 허용 여부는 사용자 판단.
- **[스타일 기억]** 마지막 사용 캡션 스타일을 사용자/업로드 기본값으로 기억할지 여부 (현재는 draft별 독립 + "Apply to all clips"만 제공).
- **[코드베이스 정합화 완료 — 2026-07-20 reconciliation]** 기존 "구현 시 확인 2건"은 실제 코드 확인으로 해소됨: (1) `src/app/api/inngest/route.ts`는 현재 `import { cleanupAnalyticsEvents, processVideo } from "~/inngest/functions"` + `functions: [processVideo, cleanupAnalyticsEvents]` 구성 — import·배열에 `analyzeVideo`를 추가하면 된다(4.7(c)에 반영). (2) `failureCode`를 라벨로 렌더하는 UI 소비처는 `ProcessingTimeline.tsx` 한 곳뿐이다(4.11에 반영). 함께 확인해 문서에 반영한 사항: 신규 엔티티 함수는 `entities/uploaded-file/index.ts`·`entities/clip-draft/index.ts` 배럴이 **명시적 named export**라 각 함수를 배럴에 추가해야 컴파일된다(4.5(a)/(b)); 폴링 on/off는 `isActiveProcessingStatus(live status)` 기반이라 `review_pending` 설계가 성립한다(6장); 백엔드 `main.py`의 인용 라인·Before 블록(자막 스타일 fontsize 122/130·marginv 165/155·alignment 5, `process_clip`/자막 함수 시그니처, `get_video_duration_seconds`, 엔드포인트/엔트리포인트)은 전부 현재 코드와 일치함을 확인했다.

<!-- doc-validation-restore -->
