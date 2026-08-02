---
status: "completed"
stage: null
proposal-size: "standard"
created-at: "2026-03-31"
approved-by: null
approved-at: null
approval-scope: null
completed-at: "2026-03-31"
verification-summary: "마이그레이션 전 문서. 개별 검증 기록 없음"
closed-at: null
closed-by: null
closed-reason: null
owners: []
related: []
---

# Vercel 환경에서 Upload and Generate Clips 시 Modal 지속적 Re-post 원인 분석

## 1. 문제 현상

- **로컬**: "Upload and Generate Clips" 클릭 → 정상 동작 (Modal.run 1회 호출, 클립 생성 완료)
- **Vercel**: "Upload and Generate Clips" 클릭 → Modal.run으로 **지속적인 re-post 요청** 발생

---

## 2. 근본 원인

**Vercel Hobby Plan의 `maxDuration=10s` 제약과 Inngest의 `retries: 3` 설정이 충돌한다.**

### 2.1 Inngest Step Function 실행 원리

Inngest는 각 `step.run()`을 **별도의 HTTP 요청**으로 Vercel의 `/api/inngest` 라우트에 보낸다.

```
inngest.send() → Inngest Cloud 큐잉
  → Inngest Cloud가 /api/inngest (Vercel) 호출하여 step #1 실행
  → Inngest Cloud가 /api/inngest (Vercel) 호출하여 step #2 실행
  → ...각 step마다 별도 HTTP 요청
```

### 2.2 문제의 Step: `call-modal-endpoint`

**파일**: `src/inngest/functions.ts` (line 102-131)

```typescript
const modalPayload = await step.run("call-modal-endpoint", async () => {
  const res = await fetch(env.PROCESS_VIDEO_ENDPOINT, {
    method: "POST",
    body: JSON.stringify({ s3_key: s3Key, language, clip_count: clipCount }),
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${env.PROCESS_VIDEO_ENDPOINT_AUTH}`,
    },
  });
  return await res.json();
});
```

이 step은 Modal.run 백엔드의 `process_video` 엔드포인트를 호출한다. Modal 백엔드(`main.py:821-950`)는 **완전히 동기적**으로 다음을 처리한다:

1. S3에서 영상 다운로드
2. WhisperX로 전사 (GPU 연산)
3. Gemini로 모먼트 식별
4. 각 클립별: ASD 스피커 감지 → 세로 영상 생성 → 자막 오버레이 → S3 업로드

**이 전체 파이프라인은 짧게는 6분, 길게는 30분까지 소요된다.**

### 2.3 Vercel Timeout 제약

**파일**: `src/app/api/inngest/route.ts` (line 5)

```typescript
export const maxDuration = 10; // Hobby 플랜 최대값. Pro 전환 시 300으로 상향 권장
```

Vercel Hobby Plan은 serverless 함수의 최대 실행 시간이 **10초**이다.

### 2.4 Inngest Retry 설정

**파일**: `src/inngest/functions.ts` (line 39-42)

```typescript
export const processVideo = inngest.createFunction(
  {
    id: "process-video",
    retries: 3,  // ← 실패 시 3회 재시도
    ...
  },
```

### 2.5 장애 시퀀스 (Vercel 환경)

```
[1] 사용자가 "Upload and Generate Clips" 클릭
    → handleUpload() (UploadPodcast.tsx:41)
    → processVideo 서버 액션 (clip/api/index.ts:20)
    → inngest.send({ name: "process-video-events" })
    → Inngest Cloud 큐잉

[2] Inngest Cloud → /api/inngest (Vercel) → "check-credits" step
    → DB 조회만 하므로 즉시 완료 ✅

[3] Inngest Cloud → /api/inngest (Vercel) → "set-status-processing" step
    → DB update만 하므로 즉시 완료 ✅

[4] Inngest Cloud → /api/inngest (Vercel) → "call-modal-endpoint" step
    → Vercel 함수가 Modal.run에 POST 요청 전송
    → Modal.run은 영상 처리 중... (6분~30분 소요)
    → ❌ 10초 후 Vercel serverless 함수 TIMEOUT
    → Inngest Cloud: "step 실패" 판정

[5] Inngest retry #1 → /api/inngest (Vercel) → "call-modal-endpoint" step
    → Modal.run에 새 POST 요청 전송 (2번째)
    → ❌ 10초 후 다시 TIMEOUT

[6] Inngest retry #2 → Modal.run에 POST (3번째) → ❌ TIMEOUT

[7] Inngest retry #3 → Modal.run에 POST (4번째) → ❌ TIMEOUT

[8] 최종: 총 4회 Modal.run POST (1 original + 3 retries)
    → 모두 Vercel 측에서 timeout
    → 하지만 Modal.run은 각 요청을 독립적으로 처리 중
    → 동일 영상에 대해 4개의 처리 작업이 병렬 실행될 수 있음
```

### 2.6 로컬에서 정상 동작하는 이유

| 환경 | timeout 제약 | `call-modal-endpoint` step | 결과 |
|------|-------------|---------------------------|------|
| **로컬** (Next.js dev server) | 없음 (무제한) | Modal 응답까지 대기 가능 (6~30분) | ✅ 1회 호출로 성공, retry 없음 |
| **Vercel Hobby** | `maxDuration=10s` | 10초 후 강제 종료 | ❌ 4회 POST (1+3 retry) |
| **Vercel Pro** | `maxDuration=300s` | 5분 후 강제 종료 | ❌ 처리 시간 6~30분이므로 여전히 timeout |

---

## 3. 관련 핵심 파일

| 파일 | 라인 | 역할 |
|------|------|------|
| `src/app/api/inngest/route.ts` | 5 | `maxDuration = 10` (Hobby Plan 최대값) |
| `src/inngest/functions.ts` | 42 | `retries: 3` 설정 |
| `src/inngest/functions.ts` | 102-131 | `call-modal-endpoint` step - 동기적 Modal.run fetch |
| `src/fsd/features/clip/api/index.ts` | 67-75 | `inngest.send()` 이벤트 발행 |
| `src/fsd/pages/dashboard/ui/_component/UploadPodcast.tsx` | 72 | `processVideo()` 서버 액션 호출 |
| `ai-podcast-clipper-backend/main.py` | 820-950 | `process_video` - 6~30분 걸리는 동기 처리 |

---

## 4. 해결 방안: Modal `.spawn()` + Inngest `step.waitForEvent()` 패턴

### 왜 Vercel Pro 업그레이드로는 해결 불가능한가

Vercel Pro의 `maxDuration` 최대값은 **300초 (5분)**이다. 그러나 Modal.run의 영상 처리 파이프라인은 **짧게 6분, 길게 30분**까지 소요된다. Pro로 업그레이드해도 `call-modal-endpoint` step은 5분 후 timeout되며, 동일한 retry 루프가 발생한다. **Vercel의 어떤 플랜으로도 동기적 대기 방식으로는 해결할 수 없다.**

### 왜 단순 callback 추가만으로는 부족한가

⚠️ **주의**: `process_video` 끝에 callback 호출만 추가하고, Frontend에서 `AbortSignal.timeout(8000)`으로 fetch를 끊는 방식은 **동일한 문제를 재발**시킨다.

Modal의 `@modal.web_endpoint`는 함수가 완료될 때까지 HTTP 응답을 반환하지 않는다. 따라서:

1. `send-to-modal` step에서 fetch → Modal은 처리 중 (30-50분 소요)
2. `AbortSignal.timeout(8000)` → 8초 후 **AbortError** throw
3. Inngest가 step **실패**로 판정 → retry 발동
4. **여전히 중복 Modal 호출 발생** (1 original + N retries)

핵심 문제: Modal 엔드포인트가 동기적이므로, Frontend가 fetch를 아무리 빨리 끊어도 Inngest는 step 실패로 간주한다. **Backend가 즉시 응답하도록 구조를 변경해야 한다.**

### 해결: Modal `.spawn()` + Inngest `step.waitForEvent()` 패턴

**난이도**: ⭐⭐⭐ | **비용**: 없음

두 가지 핵심 변경의 조합:

1. **Backend**: Modal의 `.spawn()`으로 무거운 처리를 비동기 실행하고, HTTP 요청에는 **즉시 응답** (밀리초 이내)
2. **Frontend**: Inngest `step.waitForEvent()`로 Vercel serverless 함수를 점유하지 않고 대기

이 방식은 Vercel 함수 timeout에 **완전히 독립적**이며, 처리 시간이 6분이든 30분이든 문제가 없다.

#### 4.1 Backend 변경 (`main.py`)

**Step 1**: `ProcessVideoRequest`에 callback 필드 추가:

```python
class ProcessVideoRequest(BaseModel):
    s3_key: str
    language: str = "Korean"
    clip_count: int
    callback_url: str | None = None
    uploaded_file_id: str | None = None
```

**Step 2**: 기존 `process_video` 웹 엔드포인트를 **디스패처**로 변경하고, 무거운 처리를 별도 함수로 분리:

```python
# 가벼운 디스패처 — 즉시 응답 (밀리초 이내)
@modal.web_endpoint(method="POST")
def process_video(self, request: ProcessVideoRequest):
    # 인증 검증 (기존 로직 유지)
    # ...

    # 무거운 처리를 비동기로 spawn (즉시 반환)
    call = self._do_process_video.spawn(
        s3_key=request.s3_key,
        language=request.language,
        clip_count=request.clip_count,
        callback_url=request.callback_url,
        uploaded_file_id=request.uploaded_file_id,
    )

    return {"status": "accepted", "call_id": call.object_id}


# 실제 처리 (비동기 실행, 완료 후 callback)
@modal.method()
def _do_process_video(self, s3_key, language, clip_count, callback_url, uploaded_file_id):
    # ... 기존 process_video의 모든 무거운 처리 로직 이동 ...
    # S3 다운로드 → WhisperX → Gemini → ASD → 비디오 생성 → 자막 → S3 업로드

    # 처리 완료 후 callback 호출
    if callback_url and uploaded_file_id:
        import requests as req
        req.post(callback_url, json={
            "uploadedFileId": uploaded_file_id,
            "status": "ok",
            "clips": clip_results,
        }, headers={"Authorization": f"Bearer {os.environ['AUTH_TOKEN']}"})
```

**왜 `.spawn()`인가**: Modal의 `.spawn()`은 함수를 비동기로 실행하고 **즉시** `FunctionCall` 객체를 반환한다. 웹 엔드포인트는 처리 완료를 기다리지 않으므로 HTTP 응답이 밀리초 내에 돌아온다. Vercel의 10초 timeout 내에 충분히 완료되며, Inngest step도 성공으로 판정된다.

**추가 권장**: 현재 `timeout=900` (15분) 설정이지만 실제 처리 시간이 6-50분이므로, `_do_process_video`의 timeout을 `3600` (1시간)으로 상향해야 한다.

#### 4.2 Frontend webhook route 신규 생성

`src/app/api/webhooks/modal/route.ts`:

```typescript
import { inngest } from "~/inngest/client";

export async function POST(req: Request) {
  // Auth token 검증
  const authHeader = req.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.PROCESS_VIDEO_ENDPOINT_AUTH}`) {
    return new Response("Unauthorized", { status: 401 });
  }

  const body = await req.json();

  // Inngest 이벤트 발행 → waitForEvent가 수신
  await inngest.send({
    name: "modal/video.processed",
    data: {
      uploadedFileId: body.uploadedFileId,
      status: body.status,
      clips: body.clips,
    },
  });

  return new Response("OK", { status: 200 });
}
```

#### 4.3 Inngest function 리팩터 (`functions.ts`)

기존 `call-modal-endpoint` step을 2단계로 분리:

```typescript
// Step 1: Modal에 요청 전송 (Modal .spawn() 덕분에 즉시 응답 — Vercel timeout 안전)
await step.run("send-to-modal", async () => {
  const res = await fetch(env.PROCESS_VIDEO_ENDPOINT, {
    method: "POST",
    body: JSON.stringify({
      s3_key: s3Key,
      language,
      clip_count: clipCount,
      callback_url: `${env.AUTH_URL}/api/webhooks/modal`,
      uploaded_file_id: uploadedFileId,
    }),
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${env.PROCESS_VIDEO_ENDPOINT_AUTH}`,
    },
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Modal dispatch failed (${res.status}): ${text.slice(0, 500)}`);
  }

  return await res.json(); // { status: "accepted", call_id: "..." }
});

// Step 2: Modal 완료 대기 (Inngest Cloud에서 대기 → Vercel 함수 점유 안 함)
const modalResult = await step.waitForEvent("wait-for-modal-result", {
  event: "modal/video.processed",
  match: "data.uploadedFileId",
  timeout: "1h",
});
```

`step.waitForEvent()`는 **Inngest Cloud 측에서 대기**하므로 Vercel serverless 함수를 점유하지 않는다 → 처리 시간이 6분이든 30분이든 timeout 무관.

> **참고**: `AbortSignal.timeout()`은 불필요하다. Modal `.spawn()` 덕분에 HTTP 응답이 밀리초 내에 반환되므로, fetch는 정상 완료된다. 만약 Modal 서버 자체가 응답하지 않는 경우를 대비한 안전장치가 필요하다면 15-30초 정도의 넉넉한 timeout을 설정할 수 있다.

### 변경 범위 요약

| 변경 대상 | 파일 | 작업 |
|-----------|------|------|
| Backend (수정) | `main.py` | `process_video`를 디스패처로 변환, `.spawn()`으로 비동기 처리, callback 호출 추가, timeout 상향 |
| Frontend (신규) | `src/app/api/webhooks/modal/route.ts` | Modal 콜백 수신 → Inngest 이벤트 발행 |
| Frontend (수정) | `src/inngest/functions.ts` | `call-modal-endpoint` → `send-to-modal` + `step.waitForEvent()` 분리 |

---

## 5. 부수 이슈

### 5.1 `retries: 3` → `retries: 1` 권장

`functions.ts:42`에서 `retries: 3`으로 설정되어 있으나, CLAUDE.md에는 "Retries: 1 attempt"로 문서화되어 있음. `.spawn()` 패턴 적용 후에도 retry 시 새로운 Modal job이 spawn될 수 있으므로, `retries: 1`로 줄여 불필요한 중복 처리를 방지해야 한다.

### 5.2 catch 블록의 DB 직접 호출

`functions.ts:222-231`:
```typescript
catch (error) {
  await db.uploadedFile.update({
    where: { id: uploadedFileId },
    data: { status: "failed" },
  });
  throw error;
}
```

`step.run()` 외부에서 DB를 직접 호출하므로, retry 시 이 코드가 중복 실행될 수 있다. `step.run("set-status-failed", ...)` 으로 감싸야 안전.

### 5.3 Legacy `actions/generation.ts` 파일

현재 프로젝트 어디에서도 import되지 않는 dead code (전체 주석 처리됨). `src/fsd/features/clip/api/index.ts`로 완전히 대체됨. 혼동 방지를 위해 삭제 권장.

### 5.4 Modal `timeout=900` 부족

`main.py`의 `@app.cls(gpu="L40S", timeout=900, ...)`는 15분 timeout이지만, 실제 처리 시간이 6-50분까지 소요될 수 있다. `.spawn()`으로 분리한 `_do_process_video` 함수의 timeout을 최소 `3600` (1시간)으로 상향해야 한다.

### 5.5 멱등성 (Idempotency) 고려

`send-to-modal` step이 성공한 후 Inngest function이 비정상 종료되면, Inngest replay 시 step은 memoized되어 skip된다 (중복 spawn 없음). 그러나 Inngest retry로 `send-to-modal` 자체가 재실행되면 동일 영상에 대해 두 번째 Modal job이 spawn될 수 있다. `uploaded_file_id`를 idempotency key로 활용하여 Backend에서 중복 처리를 감지·방지하는 것을 권장한다.

---

## 6. 검증 방법

### 6.1 현재 문제 확인
1. **Inngest Dashboard** 확인: function run 목록에서 `call-modal-endpoint` step이 timeout 에러로 실패 후 retry되는 패턴 확인
2. **Vercel Function Logs** 확인: `/api/inngest` 라우트에서 `FUNCTION_INVOCATION_TIMEOUT` 에러 로그 확인

### 6.2 수정 후 테스트
1. **Backend `.spawn()` 응답 확인**: Modal 엔드포인트에 직접 POST → `{"status": "accepted", "call_id": "..."}` 응답이 밀리초 내에 반환되는지 확인
2. **Inngest Dashboard**: `send-to-modal` step이 **즉시 성공** (timeout/retry 없음)하고, `wait-for-modal-result` step이 "waiting" 상태로 전환되는지 확인
3. **Webhook 수신 확인**: Modal 처리 완료 후 `/api/webhooks/modal` 라우트가 호출되고, Inngest 이벤트 `modal/video.processed`가 발행되는지 확인
4. **End-to-End**: `wait-for-modal-result` step이 Modal 콜백 수신 후 정상 완료되고, 이후 `create-clips-in-db` → `deduct-credits` → `set-status-processed` step이 순차 실행되는지 확인
5. **중복 호출 없음 검증**: Modal Dashboard에서 동일 영상에 대해 `_do_process_video`가 **1회만** 실행되는지 확인

---

## 7. 실현 가능성 분석 (코드 검증 결과)

> 이 섹션은 현재 코드베이스를 기준으로 제안서(섹션 4)를 **그대로 적용했을 때** 발생하는 문제점을 정리한 것이다.

### 최종 판정

| 적용 방식 | 결과 |
|-----------|------|
| 제안서를 **그대로** 적용 | **빌드 실패** — `StepRunner` 타입 에러로 TypeScript 컴파일 불가 |
| Critical 이슈 3개만 수정 후 적용 | **대부분 동작**하나, Modal 처리 실패 시 1시간 무한 대기 등 엣지 케이스 장애 |
| 모든 이슈 수정 후 적용 | **목표대로 정상 동작**. Vercel 타임아웃에 완전히 독립적인 비동기 파이프라인 구축 |

**핵심 아키텍처 방향(`.spawn()` + `waitForEvent()`)은 올바르다.** 아래 이슈들을 함께 수정해야 한다.

### 7.1 Critical Issues (그대로 적용 시 빌드/런타임 실패)

#### CRITICAL-1: `StepRunner` 타입에 `waitForEvent` 미정의 → TypeScript 컴파일 에러

- **파일**: `src/inngest/functions.ts:35-37`
- **현재 코드**:
  ```typescript
  type StepRunner = {
    run<T>(name: string, handler: () => Promise<T> | T): Promise<T>;
  };
  ```
- **문제**: `step.waitForEvent()` 호출 시 `Property 'waitForEvent' does not exist on type 'StepRunner'` 컴파일 에러 발생
- **수정**: 커스텀 `StepRunner` 타입 제거 → Inngest v3 SDK의 빌트인 타입 사용 (또는 `waitForEvent` 시그니처 추가)

#### CRITICAL-2: Backend `requirements.txt`에 `requests` 라이브러리 미포함 → 콜백 실패

- **파일**: `ai-podcast-clipper-backend/requirements.txt`
- **문제**: 섹션 4.1의 콜백 코드가 `import requests as req` → `req.post(callback_url, ...)` 사용하지만, `requirements.txt`에 `requests` 미포함. Modal 컨테이너에서 `ModuleNotFoundError` 발생
- **참고**: `google-genai` 의존성이 `requests`를 전이적으로 설치할 가능성 있으나 보장 불가
- **수정**: `requirements.txt`에 `requests` 명시 추가, 또는 `urllib.request`(표준 라이브러리) 사용

#### CRITICAL-3: `reprocessUploadedFile`이 `clipCount` 미전송 → Backend 422 에러 (기존 버그)

- **파일**: `src/fsd/features/upload/api/index.ts:215-222`
- **현재 코드**:
  ```typescript
  await inngest.send({
    name: "process-video-events",
    data: {
      uploadedFileId: uploadedFile.id,
      userId: uploadedFile.userId,
      language: uploadedFile.language ?? "English",
      // clipCount 없음!
    },
  });
  ```
- **문제**: Backend `ProcessVideoRequest`에서 `clip_count: int`는 필수 필드(기본값 없음). `clipCount`가 `undefined`면 JSON 직렬화 시 누락되어 Pydantic 422 에러 발생
- **참고**: **기존 버그**이나, 비동기 전환 시에도 반드시 해결 필요
- **수정**: `functions.ts`에서 `const clipCount = event.data.clipCount ?? 3` 기본값 적용, 또는 모든 caller에서 `clipCount` 포함

### 7.2 Significant Issues (간헐적 실패/데이터 불일치 가능)

#### SIG-1: `AUTH_URL`이 optional → 콜백 URL 구성 불가능할 수 있음

- **파일**: `src/env.js:39`
- **현재**: `AUTH_URL: z.string().url().optional()`
- **문제**: 섹션 4.3에서 `callback_url: \`${env.AUTH_URL}/api/webhooks/modal\``로 콜백 URL을 구성하지만, `AUTH_URL` 미설정 시 `undefined/api/webhooks/modal`이 되어 콜백 실패
- **수정**: 콜백 URL 구성을 위한 환경변수를 필수로 설정하거나, `NEXT_PUBLIC_SITE_URL` fallback 추가

#### SIG-2: Webhook 엔드포인트 인증 미흡 → 외부 공격에 취약

- **파일**: 섹션 4.2의 `/api/webhooks/modal/route.ts` (신규)
- **문제**: `PROCESS_VIDEO_ENDPOINT_AUTH` Bearer 토큰으로 검증하는데, 이 값은 현재 `"123123"`으로 매우 약함. 또한 이 토큰은 **Frontend→Backend 방향**용인데 **Backend→Frontend 방향**에도 동일 토큰을 쓰면 용도 혼동
- **참고**: 기존 Polar webhook은 전용 서명 키(`POLAR_WEBHOOK_SECRET`)를 사용
- **수정**: Modal 콜백 전용 시크릿(`MODAL_WEBHOOK_SECRET`) 별도 생성 권장

#### SIG-3: Modal 처리 실패 시 콜백 미발송 → Inngest 1시간 무한 대기

- **파일**: `ai-podcast-clipper-backend/main.py:865-942`
- **문제**: `.spawn()`된 `_do_process_video`에서 예외 발생 시 (GPU OOM, ffmpeg 크래시, S3 업로드 실패 등) 콜백이 호출되지 않음 → `waitForEvent`가 timeout(1h) 될 때까지 대기 → 그제야 `catch` 블록에서 `status: "failed"` 설정
- **수정**: `_do_process_video` 전체를 `try/except/finally`로 감싸고, **실패 시에도 반드시 콜백 발송** (`status: "error"`, `error_message` 포함)

#### SIG-4: `cancelOn` + `waitForEvent` 경합 → 고아 S3 객체 발생

- **파일**: `src/inngest/functions.ts:43-47`
- **문제**: 사용자가 `process-video-events/cancel` 이벤트로 취소 시, Inngest 함수는 중단되나 이미 `.spawn()`된 Modal 작업은 계속 실행됨. 처리 완료 후 콜백이 오지만 수신할 Inngest 함수 없음 → S3에 클립은 있으나 DB 레코드 없음
- **수정**: (a) 고아 클립 정리 배치 잡 추가, 또는 (b) 취소 시 Modal `FunctionCall` 핸들로 작업 취소

#### SIG-5: `catch` 블록의 DB 호출이 `step.run()` 외부 → retry 시 비정상 동작

- **파일**: `src/inngest/functions.ts:222-231`
- **문제**: `db.uploadedFile.update({ status: "failed" })`가 `step.run()` 외부에서 실행. retry 시 매번 재실행됨. 비동기 패턴에서는 이미 `waitForEvent`로 수신한 이벤트가 소비되어 retry 시 재수신 불가
- **수정**: `step.run("set-status-failed", ...)` 으로 감싸기 (섹션 5.2에서 언급되었으나 구현 코드에 미반영)

#### SIG-6: 로컬 개발 환경에서 콜백 불가능

- **문제**: `npm run inngest-dev`로 로컬 개발 시, Modal 컨테이너가 `localhost:3000/api/webhooks/modal`에 도달 불가능
- **수정**: 개발 가이드에 ngrok 등 터널링 설정 추가, 또는 로컬용 동기 폴백 메커니즘 구현

### 7.3 Design Gaps (제안서에서 누락된 고려사항)

#### GAP-1: `env.js`에 새 환경변수 정의 누락

제안서 적용 시 최소한 아래 추가 필요:
- `MODAL_WEBHOOK_SECRET` (콜백 인증용) — `env.js`의 `server` 스키마에 추가
- 콜백 URL 환경변수 (또는 `AUTH_URL`을 required로 변경)
- Modal 시크릿(`ai-podcast-clipper-secret`)에도 동일 시크릿 등록

#### GAP-2: `waitForEvent` timeout 시 S3 폴백 로직 미설계

`waitForEvent`가 timeout(1h)되면 `null` 반환. 이때 Modal은 처리를 완료했을 수 있으므로, 기존 S3 listing 폴백(`functions.ts:167-188`)을 활용하여 클립 복구가 가능해야 한다. timeout 후 S3를 확인하여 클립이 있으면 DB에 등록하는 보조 로직 필요.

#### GAP-3: `modal/video.processed` 이벤트 스키마 미정의

Inngest 클라이언트에 새 이벤트 타입 등록 필요. `waitForEvent`의 `match: "data.uploadedFileId"` 표현식이 정확히 동작하려면:
- webhook이 보내는 이벤트 `data`에 반드시 `uploadedFileId` 필드 포함
- `clips` 배열 구조가 기존 `ProcessVideoBackendClip[]`과 동일해야 후속 step에서 호환

#### GAP-4: `create-clips-in-db` step의 입력 데이터 구조 변경 미반영

- **현재**: `modalPayload`가 `ProcessVideoBackendResponse | null` 타입 (Modal 직접 반환)
- **변경 후**: `modalResult`가 `waitForEvent`에서 수신한 Inngest 이벤트의 `data` 필드
- webhook route에서 `inngest.send()`의 `data` 구조가 기존 응답 구조를 정확히 반영하도록 매핑 필요

### 7.4 제안서의 사실 오류 (해결 방향에 영향 없음)

| 항목 | 제안서 기술 | 실제 코드 |
|------|-----------|----------|
| Modal 데코레이터 | `@modal.web_endpoint(method="POST")` | `@modal.fastapi_endpoint(method="POST")` (`main.py:820`) |
| Retry 설정 | CLAUDE.md에 "Retries: 1 attempt" 기재 | 실제 `retries: 3` (`functions.ts:42`) |
| `process_clip` 위치 | 클래스 메서드로 암시 | 독립 함수 (클래스 메서드 아님, `main.py:555`) |

### 7.5 제안서가 올바른 부분

| 항목 | 평가 |
|------|------|
| 핵심 아키텍처 (`.spawn()` + `waitForEvent`) | **정확**. Vercel 타임아웃과 완전히 독립적인 유일한 해결책 |
| Vercel Pro로도 해결 불가 분석 | **정확**. `maxDuration=300s` < 처리시간 6~30분 |
| `AbortSignal.timeout()` 비효과 분석 | **정확**. Inngest가 step 실패로 판정하므로 retry 발동 |
| `send-to-modal` + `wait-for-modal-result` 분리 | **정확**. 각 step이 독립적으로 재시도/디버깅 가능 |
| Webhook 기반 콜백 메커니즘 | **정확**. 폴링 대비 즉각적 알림 가능 |
| `retries: 3` → `retries: 1` 권장 | **적절**. 비동기 패턴에서 retry는 새 Modal job spawn → 중복 처리 위험 |
| `timeout=900` → `3600` 상향 권장 | **적절**. 독립 실행되는 `_do_process_video`는 충분한 timeout 필요 |
| 멱등성 고려 | **적절**. `uploaded_file_id`를 idempotency key로 활용 권장은 타당 |

### 7.6 구현 전 필수 수정 사항 체크리스트 (구현 완료)

- [x] `StepRunner` 커스텀 타입 → Inngest SDK 빌트인 타입으로 교체
- [x] `requirements.txt`에 `requests` 추가 (또는 `urllib.request` 사용)
- [x] `reprocessUploadedFile`에 `clipCount` 추가 (또는 기본값 처리)
- [x] `AUTH_URL` 또는 콜백 URL 환경변수를 필수로 설정
- [x] `_do_process_video`에 `try/except` + 실패 시에도 에러 콜백 발송
- [x] `catch` 블록 DB 호출을 `step.run("set-status-failed", ...)` 으로 감싸기
- [x] Webhook 전용 인증 시크릿(`MODAL_WEBHOOK_SECRET`) 추가
- [x] `env.js`에 새 환경변수 스키마 추가
- [x] `waitForEvent` timeout 시 S3 폴백 로직 추가
- [x] 데코레이터를 `@modal.fastapi_endpoint` 기준으로 코드 작성
- [x] `modal/video.processed` 이벤트 스키마 정의 및 데이터 구조 매핑
- [x] `src/actions/uploaded-files.ts`의 `inngest.send()`에도 `clipCount` 추가 (추가 발견)

---

## 8. 배포 전 필수 작업 체크리스트

### 8.1 환경변수 설정

- [ ] **`MODAL_WEBHOOK_SECRET` 생성**: 충분히 강력한 랜덤 시크릿 생성 (예: `openssl rand -hex 32`)
- [ ] **Vercel에 `MODAL_WEBHOOK_SECRET` 등록**: Vercel Dashboard → Settings → Environment Variables에 추가
- [ ] **Modal Secret에 `MODAL_WEBHOOK_SECRET` 등록**: `ai-podcast-clipper-secret`에 동일한 값으로 `MODAL_WEBHOOK_SECRET` 키 추가
  ```bash
  modal secret create ai-podcast-clipper-secret \
    MODAL_WEBHOOK_SECRET="<생성한 시크릿>" \
    # ... 기존 시크릿 키들 유지
  ```
- [ ] **Vercel에 `NEXT_PUBLIC_SITE_URL` 확인**: Vercel 배포 URL(예: `https://your-app.vercel.app`)이 설정되어 있는지 확인. 콜백 URL 구성에 사용됨 (`${NEXT_PUBLIC_SITE_URL}/api/webhooks/modal`)
- [ ] **로컬 `.env`에서 `NEXT_PUBLIC_SITE_URL` 제거**: 로컬 개발 시 동기 모드로 동작시키기 위해 제거. `NEXT_PUBLIC_SITE_URL` 유무로 비동기/동기 모드가 결정됨
  - `NEXT_PUBLIC_SITE_URL` 있음 (Vercel) → `.spawn()` + callback + `waitForEvent` (비동기)
  - `NEXT_PUBLIC_SITE_URL` 없음 (로컬) → 동기 처리, 결과 직접 반환

### 8.2 Backend 배포 (Modal)

- [ ] **Modal 재배포**: Backend 코드 변경사항 반영
  ```bash
  cd ai-podcast-clipper-backend
  modal deploy main.py
  ```
- [ ] **배포 출력 확인**: `modal deploy` 터미널 출력에서 `process_video` 웹 엔드포인트 URL이 표시되는지 확인
- [ ] **엔드포인트 응답 테스트**: `callback_url`을 포함하여 POST → `{"status": "accepted", "call_id": "..."}` 응답이 밀리초 내에 반환되는지 확인. 이후 Modal Dashboard → Function Calls에서 `_do_process_video` 실행 기록이 생성되는지 확인

### 8.3 Frontend 배포 (Vercel)

- [ ] **Vercel 재배포**: Git push 또는 수동 재배포
- [ ] **빌드 성공 확인**: Vercel 빌드 로그에서 TypeScript 컴파일 에러 없는지 확인
- [ ] **Webhook 라우트 확인**: `https://your-app.vercel.app/api/webhooks/modal`에 인증 없이 POST → 401 응답 반환하는지 확인

### 8.4 통합 테스트

- [ ] **1단계**: Modal 엔드포인트에 직접 POST → `{"status": "accepted", "call_id": "..."}` 응답이 밀리초 내에 반환되는지 확인
- [ ] **2단계**: Inngest Dashboard에서 `send-to-modal` step이 즉시 성공하고, `wait-for-modal-result` step이 "waiting" 상태로 전환되는지 확인
- [ ] **3단계**: Modal 처리 완료 후 `/api/webhooks/modal`로 콜백이 도착하고, Inngest 이벤트 `modal/video.processed`가 발행되는지 확인
- [ ] **4단계**: `wait-for-modal-result` → `create-clips-in-db` → `deduct-credits` → `set-status-processed` 순차 실행 확인
- [ ] **5단계**: Modal Dashboard에서 동일 영상에 대해 `_do_process_video`가 **1회만** 실행되는지 확인 (중복 호출 없음)
