# Inngest 프로덕션 설정 감사 보고서

> **감사 일자**: 2026-03-29
> **참조 문서**: [`saas-deployment-checklist.md`](./saas-deployment-checklist.md) 섹션 1.3
> **대상 버전**: inngest `^3.45.1` (`package.json`)

---

## 요약

| # | 체크리스트 항목 | 상태 | 근거 |
|---|----------------|------|------|
| 1 | retries 횟수 증가 (3-5회 권장) | ✅ 완료 | `retries: 3` 설정됨 |
| 2 | 지수 백오프(exponential backoff) 설정 | ✅ 완료 (암묵적) | Inngest v3 기본값 사용 |
| 3 | DLQ 구성으로 실패 이벤트 추적 | ❌ 미완료 | `onFailure` 핸들러 없음 |
| 4 | Inngest Cloud 연동 (프로덕션 환경) | ✅ 완료 | Vercel Integration 설치 및 프로덕션 키 설정 완료 |
| 5 | 동시성 설정 리뷰 | ❌ 미완료 | concurrency가 trigger config에 위치하여 **실제 미적용**, 글로벌 제한 없음 |
| 6 | 타임아웃 설정 (영상 처리 시간 고려) | ❌ 미완료 | function/fetch 타임아웃 모두 없음 |

**완료 3건 · 미완료 3건** | **추가 발견 3건 (A~C) · 구현 이슈 14건 (해결 완료 2건, 섹션 5 승격 1건 포함) · 런타임 검증 이슈 27건 (R1~R14 + R15~R22 + R23~R27) · 실행 검증 이슈 10건 (V1~V10)**

> **체크리스트 불일치 주의**: 체크리스트에는 "retries: 1, backoff 없음"으로 기재되어 있으나, 실제 코드는 이미 `retries: 3`으로 변경되었고 Inngest v3는 기본적으로 지수 백오프를 적용합니다. 체크리스트가 outdated 상태입니다.

---

## 감사 대상 파일

| 파일 | 역할 |
|------|------|
| `src/inngest/functions.ts` | processVideo 함수 정의 (235줄) |
| `src/inngest/client.ts` | Inngest 클라이언트 초기화 (4줄) |
| `src/app/api/inngest/route.ts` | Next.js route handler (10줄) |
| `src/env.js` | 환경 변수 스키마 검증 |

---

## 상세 감사

### 1. retries 횟수 증가 — ✅ 완료

**체크리스트 기술**: "retries: 1" → 3-5회로 증가 권장

**현재 코드** (`src/inngest/functions.ts:42`):

```typescript
retries: 3,
```

**판정**: 권장 범위(3-5회) 내에 해당하는 3회로 설정됨. **완료**.

**불일치 사항**: 체크리스트는 현재 상태를 "retries: 1"로 기록했으나, 코드는 이미 `retries: 3`. 체크리스트 작성 이후 수정된 것으로 보임.

---

### 2. 지수 백오프(exponential backoff) 설정 — ✅ 완료 (암묵적)

**체크리스트 기술**: "backoff 전략 없음" → 지수 백오프 설정 필요

**현재 코드**: `src/inngest/functions.ts` 전체에 `backoff`, `retryPolicy` 등 커스텀 백오프 설정 없음.

**판정**: Inngest v3 SDK는 **기본값으로 지수 백오프(exponential backoff with jitter)**를 적용합니다. 명시적 설정이 없어도 기본 동작으로 충족됨. **완료**.

**권장사항**: 현재 기본값으로 충분하나, 영상 처리 외부 API(`call-modal-endpoint`)의 특성상 더 긴 대기 간격이 필요하다면 향후 명시적 백오프 설정을 고려할 수 있음.

---

### 3. DLQ 구성으로 실패 이벤트 추적 — ❌ 미완료

**체크리스트 기술**: Dead Letter Queue 구성으로 실패 이벤트 추적

**현재 코드** (`src/inngest/functions.ts:39-48`):

```typescript
export const processVideo = inngest.createFunction(
  {
    id: "process-video",
    retries: 3,
    cancelOn: [
      {
        event: "process-video-events/cancel",
        match: "data.uploadedFileId",
      },
    ],
  },
  // ...
```

- `onFailure` 핸들러: **없음**
- `NonRetriableError` 사용: **없음**
- 외부 DLQ 서비스 연동: **없음**

**현재 에러 처리** (`src/inngest/functions.ts:222-231`):

```typescript
catch (error) {
  await db.uploadedFile.update({
    where: { id: uploadedFileId },
    data: { status: "failed" },
  });
  throw error; // Inngest에 에러를 다시 throw → 재시도 및 로그 기록
}
```

DB에 "failed" 상태를 기록하고 에러를 다시 throw하여 Inngest 재시도를 트리거합니다. 그러나 **3회 재시도가 모두 소진된 후의 영구 실패에 대한 처리가 없습니다**.

**판정**: **미완료**. 최종 실패 시 후처리 메커니즘이 부재.

**권장 구현**:

```typescript
import { NonRetriableError } from "inngest";

export const processVideo = inngest.createFunction(
  {
    id: "process-video",
    retries: 3,
    onFailure: async ({ error, event, step }) => {
      // ⚠️ onFailure는 SDK 내부에서 retries: { attempts: 1 }로 하드코딩 (R10)
      // DB 실패 시 재시도 없이 조용히 종료되므로, step.run 내부에 try-catch 필수
      await step.run("record-permanent-failure", async () => {
        try {
          await db.uploadedFile.updateMany({  // update 대신 updateMany 사용 (P2025 방지)
            where: { id: event.data.event.data.uploadedFileId },
            data: { status: "failed" },
          });
        } catch (dbError) {
          console.error("[DLQ] Failed to update status:", dbError);
          // DB 실패해도 onFailure 자체는 throw하지 않음 — 로그로 감지
        }
        console.error("[DLQ] processVideo permanently failed:", {
          uploadedFileId: event.data.event.data.uploadedFileId,
          error: error.message,
        });
      });
    },
    cancelOn: [/* ... */],
  },
  // ...
);
```

> **⚠️ 구현 시 주의사항**:
>
> **(1) `onFailure` 이벤트 접근 경로 검증 필수**
>
> 위 코드의 `event.data.event.data.uploadedFileId` 경로는 Inngest v3의 failure event 구조에 의존합니다. SDK 버전에 따라 구조가 다를 수 있으므로, 구현 전 `node_modules/inngest`의 `onFailure` 타입 정의를 확인하거나 Inngest dev 서버에서 실제 failure event를 로깅하여 경로를 검증해야 합니다. 잘못된 경로는 `undefined`로 Prisma 쿼리를 실행하여 의도치 않은 동작을 유발합니다.
>
> **(2) catch 블록과 `onFailure`의 상태 충돌 — 반드시 함께 수정**
>
> 현재 catch 블록(`functions.ts:222-231`)이 매 실패마다 status를 `"failed"`로 설정합니다. `set-status-processing` step은 memoized되어 재시도 시 재실행되지 않으므로, 재시도 중에도 status가 `"failed"`로 남는 문제가 있습니다:
>
> ```
> 시도 1 실패 → catch: status="failed" → throw → 재시도
> 시도 2: set-status-processing memoized(재실행 안 됨) → status "failed" 그대로
> 시도 3 실패 → catch: status="failed" → onFailure: status="failed" (중복)
> ```
>
> **해결**: `onFailure` 추가 시, catch 블록에서 `"failed"` 상태 설정을 제거하고 `onFailure`에서만 영구 실패를 처리해야 합니다. 아래 "추가 발견사항 A"와 반드시 함께 작업할 것.

또한 재시도가 무의미한 에러에는 `NonRetriableError`를 적용합니다.

> **⚠️ 구현 시 주의사항: 코드 구조 변경 필요**
>
> 현재 `check-credits` step은 `findUniqueOrThrow`를 사용하므로(`functions.ts:67`), Prisma의 `NotFoundError`가 발생하여 그대로 재시도됩니다. `NonRetriableError`를 적용하려면 **쿼리 메서드 자체를 교체**해야 합니다:

```typescript
// ❌ 현재 코드 — findUniqueOrThrow는 Prisma NotFoundError를 던지므로 NonRetriableError 적용 불가
const uploadedFile = await db.uploadedFile.findUniqueOrThrow({
  where: { id: uploadedFileId },
  // ...
});

// ✅ 변경 필요 — findUnique + null 체크 + NonRetriableError
const uploadedFile = await db.uploadedFile.findUnique({
  where: { id: uploadedFileId },
  // ...
});
if (!uploadedFile) {
  throw new NonRetriableError("Uploaded file not found");
}
```

---

### 4. Inngest Cloud 연동 (프로덕션 환경) — ✅ 완료

**체크리스트 기술**: Inngest Cloud 연동

**현재 상태**:

- **클라이언트** (`src/inngest/client.ts:4`): Inngest SDK가 환경 변수 자동 감지로 Cloud 연결.

  ```typescript
  export const inngest = new Inngest({ id: "ai-podcast-clipper-frontend" });
  ```

- **환경 변수** (`src/env.js:31-33`): `INNGEST_EVENT_KEY`, `INNGEST_SIGNING_KEY` 정의됨.
- **CSP 헤더** (`next.config.js:59`): `https://*.inngest.com` 허용됨.
- **로컬 개발** (`package.json:8`): `inngest-dev` 스크립트 존재.
- **인프라**: Vercel 프로젝트에 Inngest Integration 설치 완료, 프로덕션 환경에서 키 설정 완료.

**판정**: **완료**.

---

### 5. 동시성 설정 리뷰 — ❌ 미완료 (기존 설정 미적용 + 글로벌 제한 없음)

**체크리스트 기술**: 현재 userId 기준 1건 제한 → 리뷰 필요

**현재 코드** (`src/inngest/functions.ts:52-55`):

```typescript
concurrency: {
  limit: 1,
  key: "event.data.userId",
},
```

> **🚨 Critical: 위 concurrency 설정이 실제로 적용되지 않고 있습니다**
>
> 이 `concurrency`는 `createFunction`의 **2번째 인자(trigger config)**에 위치합니다:
>
> ```typescript
> inngest.createFunction(
>   { id: "process-video", retries: 3, cancelOn: [...] },       // 1st: function config
>   { event: "...", concurrency: { limit: 1, key: "..." } },    // 2nd: trigger config ← 현재 위치
>   async () => { ... }
> );
> ```
>
> Inngest SDK 내부(`InngestFunction.js`)에서 `concurrency`는 **function config(1번째 인자)에서만 읽힙니다**. trigger config 안의 `concurrency`는 타입 체크도 통과하고 에러도 발생하지 않지만, **조용히 무시(silently ignored)**됩니다. 결과적으로 사용자별 동시성 제한이 **프로덕션에서 전혀 작동하지 않고 있으며**, 동일 사용자가 동시에 여러 영상을 처리할 수 있어 크레딧 차감, 상태 전이 등의 데이터 무결성이 위협받습니다.
>
> **런타임 검증**: `node_modules/inngest/components/InngestFunction.js:78`에서 `this.opts`(function config)에서만 `concurrency`를 destructure하며, `triggers` 배열 내부의 속성은 `event`, `cron`, `if`만 참조합니다.

**분석**:

| 항목 | 현재 상태 | 평가 |
|------|-----------|------|
| 사용자별 동시성 | 설정은 존재하나 **trigger config 위치로 미적용** | **프로덕션 버그** — 즉시 수정 필요 |
| 글로벌 동시성 | 제한 없음 | Modal 백엔드 과부하 위험 |

**판정**: **미완료**. 사용자별 제한이 코드에 존재하지만 잘못된 위치(trigger config)에 있어 실제로 적용되지 않음. 글로벌 제한도 없음.

**권장 구현** — **function config(1번째 인자)로 이동 필수**:

```typescript
inngest.createFunction(
  {
    id: "process-video",
    retries: 3,
    concurrency: [
      { limit: 1, key: "event.data.userId" },  // 사용자별: 순차 처리
      { limit: 10 },                             // 글로벌: Modal 백엔드 보호
    ],
    cancelOn: [/* ... */],
  },
  { event: "process-video-events" },  // trigger config에서 concurrency 제거
  async () => { ... }
);
```

글로벌 제한 값은 Modal 엔드포인트의 동시 처리 용량에 따라 조정.

> **⚠️ 이 수정은 P0 비동기 전환과 독립적으로 즉시 적용 가능하며, 적용해야 합니다.** 현재 프로덕션에서 동시성 보호가 전혀 없는 상태입니다.

---

### 6. 타임아웃 설정 (영상 처리 시간 고려) — ❌ 미완료 (아키텍처 변경 필요)

**체크리스트 기술**: 영상 처리 시간을 고려한 타임아웃 설정

**현재 코드**:

- **Function-level timeout**: `src/inngest/functions.ts:39-48`에 `timeouts` 속성 **없음**
- **Route handler** (`src/app/api/inngest/route.ts:5`):

  ```typescript
  export const maxDuration = 10; // Hobby 플랜 최대값. Pro 전환 시 300으로 상향 권장
  ```

**근본 문제**: 현재 `call-modal-endpoint` step은 Modal 응답을 **동기적으로 대기**합니다. 영상 처리는 수십 분이 걸리므로, Vercel 서버리스 함수의 maxDuration 제한(Hobby 10초, Pro 300초)을 어떤 플랜에서든 초과합니다. **maxDuration을 올리는 것은 해결책이 아닙니다.**

```
현재 구조 (동기 대기 — 서버리스 환경과 비호환):

[프론트엔드] Inngest step.run("call-modal-endpoint")
    → fetch(Modal) → 응답 대기 중...
    → Vercel maxDuration(10초) 초과 → 강제 종료 ❌

[백엔드] Modal process_video (main.py:821-950)
    → S3 다운로드 → WhisperX 음성 인식 → Gemini 클립 선정
    → 클립별 세로 영상 생성 → 자막 합성 → S3 업로드
    → HTTP 응답 반환 (전체 동기 처리, timeout=900초)
    → 그러나 프론트엔드는 이미 죽어있음 ❌
```

프론트엔드와 백엔드 양쪽 모두 **완전한 동기 구조**입니다. 백엔드(`main.py`)의 `process_video` 엔드포인트는 모든 처리를 하나의 HTTP 요청-응답 안에서 수행하며, jobId 반환이나 webhook 콜백 같은 비동기 메커니즘이 없습니다.

**판정**: **미완료**. 타임아웃 설정이 아닌, Modal 연동 아키텍처 자체를 비동기 패턴으로 전환해야 합니다.

**권장 구현 — Modal 비동기 패턴 전환**:

```
변경 구조 (비동기 — maxDuration 무관):
step.run("trigger-modal")        → fetch(Modal) → jobId 즉시 반환 (1초 이내)
step.waitForEvent("modal/done")  → Modal 완료 시 webhook 수신 대기 (성공 또는 실패)
step.run("create-clips-in-db")   → 클립 저장 (성공 시)

실패 경로 (통합 이벤트 패턴 — 단일 이벤트명, data.status로 구분):
Modal 처리 성공 → webhook: modal/processing.done {status:"ok"}    → 클립 저장 → 정상 완료 ✅
Modal 처리 실패 → webhook: modal/processing.done {status:"error"} → 에러 throw → onFailure ✅
Modal 인프라 장애 → webhook 미전송 → waitForEvent 1h timeout → 에러 throw ⚠️
```

**(1) Modal 백엔드 변경** (`ai-podcast-clipper-backend/main.py`):

현재 `process_video` 엔드포인트(`main.py:821-950`)는 모든 처리를 동기적으로 수행하고 결과를 HTTP 응답으로 반환합니다. 이를 두 부분으로 분리해야 합니다:

- **트리거 엔드포인트** (신규): 요청을 받으면 jobId를 즉시 반환하고, 백그라운드에서 처리 시작
- **처리 완료 시**: 프론트엔드 webhook URL로 결과를 POST 전송

Modal은 `.spawn()`을 지원하므로, 기존 `process_video` 로직을 백그라운드 함수로 분리하고 트리거 엔드포인트에서 `.spawn()`으로 호출하는 방식이 적합합니다.

> **⚠️ `spawn()` API 주의사항 — 클래스 기반 아키텍처**
>
> 현재 백엔드는 `@app.cls()` 기반 클래스 구조(`AiPodcastClipper`)입니다. `modal.Function.spawn()`은 standalone function용 API이며, **클래스 메서드에서는 호출 방식이 다릅니다**:
>
> ```python
> # standalone function — 문서에서 언급한 방식
> my_function.spawn(args)
>
> # class method — 현재 아키텍처에 맞는 방식
> # 같은 클래스 내에서 호출:
> self.process_video_background.spawn(args)
> # 또는 외부에서 호출:
> AiPodcastClipper().process_video_background.spawn(args)
> ```
>
> `modal==1.2.1`에서 class method `spawn()` 지원 여부를 확인하고, 필요 시 standalone function으로 분리하거나 Modal 버전을 업그레이드해야 합니다.

**(2) Webhook 수신 엔드포인트 추가**: Modal의 완료 콜백을 받아 Inngest 이벤트를 발행하는 API 라우트 생성.

```typescript
// src/app/api/webhooks/modal/route.ts (신규)
import { env } from "~/env";
import { inngest } from "~/inngest/client";

export const maxDuration = 10; // 프로젝트 내 다른 라우트와 일관성 유지

export async function POST(req: Request) {
  // 시크릿 토큰 검증 (Polar webhook 패턴 참고)
  // ⚠️ env.js에서 optional()일 경우 undefined 가능 — 명시적 가드 필수 (R24)
  if (!env.MODAL_WEBHOOK_SECRET) {
    console.error("[Webhook] MODAL_WEBHOOK_SECRET not configured");
    return new Response("Server misconfigured", { status: 500 });
  }
  const authHeader = req.headers.get("Authorization");
  if (authHeader !== `Bearer ${env.MODAL_WEBHOOK_SECRET}`) {
    return new Response("Unauthorized", { status: 401 });
  }

  // 전체 핸들러를 try-catch로 감싸 — JSON 파싱 실패, inngest.send() 실패 모두 처리 (R11, R6)
  try {
    const payload = await req.json();
    const uploadedFileId = payload.uploaded_file_id; // ⚠️ snake_case — Python 백엔드 컨벤션

    // 통합 패턴: 성공/실패 모두 같은 이벤트명으로 발행, data.status로 구분
    await inngest.send({
      name: "modal/processing.done",
      data: {
        uploadedFileId,
        status: payload.status ?? "ok",           // "ok" | "error"
        clips: payload.clips ?? [],               // 성공 시 클립 배열
        error: payload.error ?? null,             // 실패 시 에러 메시지
      },
    });

    return new Response("ok");
  } catch (error) {
    console.error("[Webhook] Failed to process Modal callback:", error);
    // 500 반환하여 Modal 측 재시도 가능성 확보
    return new Response("Internal Server Error", { status: 500 });
  }
}
```

**(3) Inngest 함수 변경** (`src/inngest/functions.ts`):

```typescript
// call-modal-endpoint step을 두 단계로 분리:

// 1. Modal에 처리 요청 (즉시 반환)
await step.run("trigger-modal", async () => {
  const res = await fetch(env.PROCESS_VIDEO_ENDPOINT, {
    method: "POST",
    body: JSON.stringify({ s3_key: s3Key, language, clip_count: clipCount, uploaded_file_id: uploadedFileId }),
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${env.PROCESS_VIDEO_ENDPOINT_AUTH}`,
    },
  });
  if (!res.ok) throw new Error(`Modal trigger failed (${res.status})`);
});

// 2. Modal 완료/실패 이벤트 대기 (통합 패턴 — 단일 이벤트명 사용 권장)
// webhook에서 성공/실패 모두 "modal/processing.done" 이벤트로 발행하고,
// data.status 필드로 결과를 구분합니다.
// ⚠️ `match` 대신 `if` 사용 (R9):
//   - `match`는 SDK에서 deprecated (InngestStepTools.d.ts:351)
//   - `match`는 양쪽 모두 null일 때 null == null → true로 교차 오염 위험
//   - `if`에 null guard 추가하여 uploadedFileId 누락 시 잘못된 매칭 방지
const modalResult = await step.waitForEvent("wait-for-modal", {
  event: "modal/processing.done",
  if: "async.data.uploadedFileId != null && event.data.uploadedFileId == async.data.uploadedFileId",
  timeout: "1h", // Modal 처리 최대 대기 시간
});

if (!modalResult) {
  // ⚠️ NonRetriableError 사용 — timeout은 재시도로 해결될 가능성이 낮으며,
  // 일반 Error 사용 시 waitForEvent가 재대기하여 retries(3) × timeout(1h) = 최대 3시간 대기 위험.
  // NonRetriableError로 즉시 onFailure 핸들러로 이동하여 사용자 대기 시간 최소화.
  throw new NonRetriableError("Modal processing timed out after 1 hour — Modal 인프라 장애 가능성 확인 필요");
}

// Modal 처리 실패 시 (webhook에서 status: "error"로 전송)
if (modalResult.data.status === "error") {
  throw new Error(`Modal processing failed: ${modalResult.data.error}`);
}
// ※ Modal 처리 실패는 일반 Error — 일시적 장애일 수 있으므로 재시도 허용.
// timeout과 달리 재시도 시 waitForEvent가 즉시 memoized 결과를 반환하므로 대기 시간 없음.
```

> **이 변경으로 해결되는 문제들**:
> - maxDuration 제한과 무관하게 동작 (Hobby 플랜에서도 가능)
> - Vercel Pro 전환 불필요
> - 중복 처리 위험 제거 (Modal 요청은 1회만 발생)
> - function-level timeout, fetch AbortController 모두 불필요
> - Modal 처리 실패 시에도 명확한 에러 전파 (webhook 기반 실패 통보)
>
> **필요한 작업**:
>
> | 레포 | 작업 | 대상 파일 |
> |------|------|-----------|
> | `ai-podcast-clipper-backend` | `process_video`를 트리거 엔드포인트 + 백그라운드 처리로 분리, `uploaded_file_id` 수신 | `main.py` |
> | `ai-podcast-clipper-backend` | `ProcessVideoRequest` Pydantic 모델에 `uploaded_file_id: str` 필드 추가 | `main.py` |
> | `ai-podcast-clipper-backend` | 처리 완료 시 프론트엔드 webhook으로 결과 POST 전송 (`uploaded_file_id` 포함) | `main.py` |
> | `ai-podcast-clipper-backend` | 처리 **실패** 시에도 webhook으로 에러 정보 POST 전송 (try-except 감싸기) | `main.py` |
> | `ai-podcast-clipper-backend` | Modal Secret에 `MODAL_WEBHOOK_SECRET` 추가 | Modal Dashboard |
> | `ai-podcast-clipper-frontend` | Webhook 수신 엔드포인트 생성 (성공/실패 분기 + 시크릿 인증) | `src/app/api/webhooks/modal/route.ts` (신규) |
> | `ai-podcast-clipper-frontend` | `call-modal-endpoint` → `trigger-modal` + `waitForEvent` 분리 | `src/inngest/functions.ts` |
> | `ai-podcast-clipper-frontend` | `MODAL_WEBHOOK_SECRET` 환경 변수 스키마 추가 | `src/env.js` |
> | `ai-podcast-clipper-frontend` | webhook URL을 환경 변수로 관리 (백엔드에 전달) | `src/env.js` |

---

## 추가 발견사항

감사 과정에서 체크리스트에 명시되지 않았으나 프로덕션 안정성에 영향을 미치는 이슈를 발견했습니다.

### A. catch 블록 DB 업데이트가 step 바깥에서 실행

**위치**: `src/inngest/functions.ts:222-231`

```typescript
catch (error) {
  await db.uploadedFile.update({
    where: { id: uploadedFileId },
    data: { status: "failed" },
  });
  throw error;
}
```

`step.run()` 바깥에서 DB 업데이트를 실행하므로, 매 재시도마다 status가 `"failed"`로 설정됩니다. `set-status-processing` step은 memoized되어 재실행되지 않으므로, 재시도 중에도 status가 `"failed"`로 남는 문제가 발생합니다.

**`onFailure` 핸들러(항목 3)와 반드시 함께 수정해야 합니다.** 권장 방향: catch 블록에서 status 업데이트를 제거하고, `onFailure`에서만 영구 실패 status를 설정.

### B. console.log 잔존

**위치**: `src/inngest/functions.ts:60`

```typescript
console.log("clipCount", clipCount);
```

프로덕션 환경에서는 제거해야 합니다.

### C. S3 Fallback 로직의 prefix 추출 버그 — 클립 매칭 불가

**위치**: `src/inngest/functions.ts:168`

```typescript
const folderPrefix = s3Key.split("/")[0]!;
```

> **⚠️ 실행 검증(V1)에서 S3 키 형식 전제 오류 확인됨 — 아래 설명은 조건부 버그입니다**
>
> 코드 검증 결과, `src/actions/s3.ts:35`와 `src/fsd/features/upload/api/index.ts:32` **양쪽 모두** `{uuid}/original.{ext}` 형식을 사용합니다. `{userId}` 접두사가 포함된 S3 키는 현재 코드에 **존재하지 않습니다**. CLAUDE.md의 `{userId}/{uuid}/original.mp4` 기술은 outdated입니다.
>
> 따라서 신규 업로드의 경우 `split("/")[0]` → `{uuid}` (정상 추출)이며, 아래 기술된 버그는 **프로덕션 S3에 구 형식 객체가 잔존하는 경우에만 발현**됩니다. 상세 분석은 V1 참조.

~~S3 키 구조는 `{userId}/{uuid}/original.mp4`이므로 `split("/")[0]`은 **`userId`만 추출**합니다.~~ **(V1 정정: 현재 코드는 `{uuid}/original.{ext}` 형식 사용. 이하 설명은 구 형식 S3 객체에만 해당)** 구 형식의 경우 `split("/")[0]`은 `userId`만 추출합니다. 이후 필터(`functions.ts:171-176`):

```typescript
key.startsWith(`${folderPrefix}/clip_`)  // 구 형식: → "{userId}/clip_" (버그)
                                          // 신 형식: → "{uuid}/clip_" (정상)
```

구 형식에서 실제 클립 경로는 `{userId}/{uuid}/clip_0.mp4`이므로 `{userId}/clip_`으로 시작하지 않아 **매칭이 실패**합니다:

```
구 형식 경로: userId/abc-uuid/clip_0.mp4
구 형식 패턴: userId/clip_                  ← uuid 디렉토리 누락 → 0건 매칭

신 형식 경로: abc-uuid/clip_0.mp4
신 형식 패턴: abc-uuid/clip_                ← 정상 매칭 ✅
```

**해결**: `s3Key.split("/").slice(0, -1).join("/") + "/"` 패턴으로 마지막 세그먼트(파일명)를 제거하여 폴더 경로를 추출. 이 패턴은 구 형식과 신 형식 모두에서 정확히 동작합니다. 또는 비동기 전환(항목 6) 시 `waitForEvent`에서 클립 데이터를 직접 수신하는 방식으로 전환하여 S3 fallback 의존도를 제거.

**실행 우선순위 재평가**: 신규 업로드에서는 버그가 발현되지 않으므로, **P1에서 P2로 하향 조정 권장**. 단, 프로덕션 S3에 구 형식 객체가 존재하는지 확인 후 최종 결정.

> **⚠️ 동일한 prefix 버그가 `removeGeneratedClipsFromS3`에도 존재합니다** (R21). 이 함수는 재처리 시 기존 클립 삭제에 사용되며, 구 형식 키에서 **사용자의 모든 업로드 클립을 삭제**하는 더 심각한 영향을 미칩니다. 해결 시 3곳 모두 함께 수정 필수. 신 형식에서는 정상 동작.

---

## 구현 시 발견된 문제점

감사 문서의 권장 코드를 실제 구현할 때 발생하는 문제점을 SDK 타입 검증 및 코드 교차 분석으로 확인했습니다.

### Critical: `StepRunner` 커스텀 타입에 `waitForEvent` 미정의 — P0 차단

**위치**: `src/inngest/functions.ts:35-37`

```typescript
// 현재 — run만 정의되어 있음
type StepRunner = {
  run<T>(name: string, handler: () => Promise<T> | T): Promise<T>;
};
```

P0의 핵심인 `step.waitForEvent()`를 호출하면 **TypeScript 컴파일 에러** 발생. `StepRunner` 커스텀 타입을 제거하고 Inngest SDK 내장 타입을 사용하거나, `waitForEvent` 시그니처를 추가해야 합니다. **P0 구현의 선행 조건**.

### ~~High: Webhook 엔드포인트 인증 부재 — 보안 취약점~~ → 섹션 6 코드에서 해결 완료

**원래 문제**: 최초 권장 코드에 인증이 없어, 누구나 가짜 `modal/processing.done` 이벤트를 발생시킬 수 있었음.

**해결 완료**: 섹션 6 권장 코드에 Bearer 토큰 인증(`env.MODAL_WEBHOOK_SECRET`) 추가됨. 조치 항목 P0-보안에서 `env.js` 스키마 추가 및 Modal Secret/Vercel 환경 변수 설정을 함께 다룸.

### High: `NonRetriableError` + `onFailure` 조합 시 Prisma P2025 에러

P1 두 항목(NonRetriableError + onFailure)을 함께 구현할 때:

```
UploadedFile 레코드 삭제 상태 → findUnique → null → throw NonRetriableError
→ onFailure 실행 → db.uploadedFile.update({ where: { id } })
→ 레코드 없음 → Prisma P2025: "Record to update not found"
→ onFailure 자체가 throw
```

**해결**: `onFailure` 핸들러에서 `update` 대신 `updateMany` 사용(0건 매치 시 에러 없음), 또는 try-catch로 감싸기.

### High: `trigger-modal` 요청에 `uploadedFileId` 미포함 — `waitForEvent` 매칭 불가

섹션 6 권장 코드의 `trigger-modal` step이 Modal에 `{ s3_key, language, clip_count }` 만 전송합니다. `uploadedFileId`가 포함되지 않으면 Modal 백엔드가 webhook 콜백에 이 값을 포함할 수 없고, `waitForEvent`의 `match: "data.uploadedFileId"` 매칭이 **영원히 성공하지 않습니다** (1h timeout → 재시도 → 다시 timeout → 영구 실패).

`s3Key`(`{userId}/{uuid}/original.mp4`의 uuid)와 `uploadedFileId`(Prisma CUID)는 **서로 다른 값**이므로 역추적도 불가능합니다.

```
① functions.ts → trigger-modal: { s3_key, language, clip_count }  ⚠️ uploadedFileId 없음
② Modal 백엔드 → webhook 콜백: { uploadedFileId: ??? }           ⚠️ 받은 적 없는 값
③ waitForEvent match: "data.uploadedFileId"                       ❌ 매칭 실패
```

**해결**: 권장 코드에 `uploaded_file_id: uploadedFileId`를 추가했습니다 (위 섹션 6 코드 참조). Modal 백엔드도 이 값을 받아 webhook 콜백에 그대로 포함해야 합니다.

### ~~High: snake_case / camelCase 키 이름 불일치 — `waitForEvent` 매칭 실패~~ → 섹션 6 코드에서 해결 완료

**원래 문제**: webhook 엔드포인트가 `payload.uploadedFileId`(camelCase)를 읽으면, Python 백엔드가 보낸 `uploaded_file_id`(snake_case)와 불일치하여 `undefined`가 됨:

```
① trigger-modal → Modal: { uploaded_file_id: "cuid_abc" }   ← snake_case
② Modal → webhook:       { "uploaded_file_id": "cuid_abc" } ← Python이 그대로 반환
③ webhook route:          payload.uploadedFileId             ← camelCase 기대 → undefined
```

**해결 완료**: 섹션 6 webhook 코드에서 `payload.uploaded_file_id`(snake_case)로 읽도록 수정됨. 변환 후 `data.uploadedFileId`(camelCase)로 Inngest 이벤트에 포함하여 `waitForEvent` 매칭 정상 작동.

### High: `create-clips-in-db` 데이터 참조 경로 변경 누락

현재 `modalPayload?.clips`로 접근하지만, `waitForEvent` 반환값은 Inngest event 전체이므로 `modalResult.data.clips`로 변경해야 합니다. 섹션 6의 권장 코드에 이 데이터 흐름 변경이 기술되어 있지 않습니다. 기존 S3 fallback 로직(`functions.ts:167-189`)과의 연결도 재설계 필요.

**구체적 변경 가이드**:

```typescript
// ❌ 현재 코드 (functions.ts:134-137) — 직접 API 응답 참조
const { clipsFound } = await step.run("create-clips-in-db", async () => {
  const backendClips = modalPayload?.clips;  // ← ProcessVideoBackendResponse

// ✅ 변경 필요 — waitForEvent 결과에서 읽기
const { clipsFound } = await step.run("create-clips-in-db", async () => {
  const backendClips = modalResult.data.clips;  // ← Inngest event data
  // ※ modalResult는 waitForEvent 성공 후 도달하므로 non-null 보장
  // ※ 이벤트 스키마 미등록(R-이슈) 상태이므로 data.clips는 any 타입 — 런타임 에러 주의
```

> **⚠️ Webhook relay 시 clip 데이터의 camelCase/snake_case 불일치 위험 (R26)**
>
> 현재 직접 API 응답에서 작동하는 clips 필드명(`s3Key`, `startSeconds` 등)이 webhook 경유 후에도 동일 형식을 유지하는지 **보장되지 않습니다**. 직접 API 응답은 Pydantic 응답 직렬화를 거치지만, webhook 콜백의 `httpx.post()`는 raw dict를 직접 전송합니다. Python dict가 snake_case(`s3_key`, `start_seconds`)라면:
>
> ```
> webhook relay: { clips: [{ s3_key: "...", start_seconds: 10 }] }
> frontend 기대: c.s3Key (camelCase) → undefined
> filter: typeof c?.s3Key === "string" → false → 모든 클립 탈락 → clipsFound: 0
> ```
>
> **검증 필수**: Modal 백엔드의 현재 API 응답 형식(camelCase vs snake_case)을 확인하고, webhook 콜백에서도 동일 형식을 보장해야 합니다. 상세 분석은 R26 참조.

### High: Modal 백그라운드 처리 실패 시 webhook 미전송 — 영구 행(hang) 위험

섹션 6 권장 코드는 Modal 성공 경로만 설계합니다. **Modal 처리가 실패(OOM, GPU 에러, 코드 버그)할 때 webhook을 보내는 메커니즘이 없습니다**:

```
Modal spawn() → 백그라운드 처리 시작
  ├─ 성공 → webhook POST(done) → waitForEvent 수신 → 정상 흐름 ✅
  ├─ 코드 에러 → webhook 미전송 → waitForEvent 1h 대기 → timeout → 에러 throw ⚠️
  └─ 인프라 장애 → spawn 성공했으나 실행 안 됨 → 영원히 대기 → timeout ⚠️
```

timeout 에러 메시지는 "timed out"이지만 **실제 원인(GPU OOM, 네트워크 에러 등)은 알 수 없습니다**. 사용자는 최대 1시간 동안 "processing" 상태에 갇힙니다.

**해결**: Modal 백그라운드 함수 전체를 try-except로 감싸고, 실패 시에도 webhook을 전송:

```python
# ai-podcast-clipper-backend/main.py (백그라운드 함수)
# 통합 패턴: 성공/실패 모두 같은 webhook URL로 전송, status 필드로 구분
# ※ httpx 사용 — fastapi[standard] 의존성에 포함되어 별도 설치 불필요.
#   requirements.txt에 requests가 없으므로 httpx를 사용합니다.
import httpx

try:
    result = process_video_internal(...)
    httpx.post(webhook_url, json={
        "status": "ok",
        "uploaded_file_id": uploaded_file_id,
        "clips": result["clips"],
    }, headers={"Authorization": f"Bearer {webhook_secret}"})
except Exception as e:
    try:
        httpx.post(webhook_url, json={
            "status": "error",
            "uploaded_file_id": uploaded_file_id,
            "error": str(e),
        }, headers={"Authorization": f"Bearer {webhook_secret}"})
    except Exception:
        pass  # webhook 전송 자체 실패 시 waitForEvent timeout이 최후의 안전장치로 작동
```

### High: S3 Fallback 로직 기존 버그 — 비동기 전환 시 함께 수정 필요

추가 발견사항 C에서 기술한 바와 같이, 현재 S3 fallback의 prefix 추출이 `{userId}`만 사용하여 **클립 매칭이 불가능**합니다. 비동기 전환 시 `modalResult.data.clips`로 데이터 소스가 변경되므로, 기존 S3 fallback 로직(`functions.ts:167-189`)을 그대로 유지하면:

1. `modalResult.data.clips` → `modalPayload?.clips` 경로 불일치로 primary 경로도 실패
2. S3 fallback은 기존 prefix 버그로 인해 0건 매칭

**해결 방향**:
- **Primary**: `modalResult.data.clips`로 참조 경로 변경 (기존 `create-clips-in-db` 이슈와 동일)
- **Fallback**: prefix를 `s3Key.split("/").slice(0, 2).join("/")`로 수정하거나, webhook에서 클립 데이터를 필수로 포함하여 fallback 자체를 제거

### Medium: `cancelOn` + `waitForEvent` 취소 시 고아 파일 발생

현재 `cancelOn`(`functions.ts:43-47`)이 `data.uploadedFileId`로 매칭합니다. 비동기 전환 후 함수가 `waitForEvent` 상태에서 대기 중일 때 cancel 이벤트가 도착하면:

```
1. 사용자가 취소 → cancel 이벤트 발행
2. Inngest 함수 취소 → waitForEvent 종료
3. 그러나 Modal 백그라운드 처리는 계속 진행 (취소 메커니즘 없음)
4. Modal 완료 → webhook POST → inngest.send("modal/processing.done")
5. 수신할 Inngest 함수 없음 → 이벤트 소실
6. S3에 클립 업로드 완료 → DB에 레코드 없음 → 고아 파일(orphaned files) 잔존
```

**영향**: S3 스토리지 누수 (클립당 수십~수백 MB). 즉각적인 문제는 아니지만, 대량 사용 시 비용 증가.

**해결 방향**:
- `onFailure` 또는 별도 정리 작업에서 `cancelOn` 취소된 파일의 S3 클립을 주기적으로 정리
- 또는 Modal 백그라운드 함수에 취소 확인 로직 추가 (처리 시작 전 Inngest 함수 상태 조회)

### ~~Medium: `concurrency` 배열 배치 위치 미검증 — 글로벌 제한 미작동 가능~~ → Critical로 승격 (섹션 5 참조)

**런타임 검증 결과**: trigger config의 `concurrency`는 "미검증"이 아니라 **확실히 미적용**입니다. Inngest SDK 내부 코드(`InngestFunction.js:78`)에서 function config(1번째 인자)에서만 `concurrency`를 읽으며, trigger config 내부의 `concurrency`는 조용히 무시됩니다. **기존 사용자별 제한(단일 객체)도 배열 문법도 모두 동일하게 미적용**.

이 문제는 글로벌 제한 배열뿐 아니라 **기존 `{ limit: 1, key: "event.data.userId" }` 설정 자체가 프로덕션에서 작동하지 않는 Critical 이슈**입니다. 상세 분석 및 해결은 **섹션 5**에 통합했습니다.

### Low: Webhook 시크릿 환경 변수 — `env.js` 스키마 변경 누락 + 빌드 실패 위험

P0-보안으로 "시크릿 토큰 인증 추가"를 권장하고 대상 파일에 `src/env.js`를 포함하지만, **실제 스키마 변경 코드가 제공되지 않습니다**.

> **⚠️ 런타임 검증: 빌드 타임 실패 위험**
>
> `@t3-oss/env-nextjs`는 모듈 import 시점에 환경 변수를 검증합니다. `z.string()`(필수)로 추가하면, **Vercel에 환경 변수를 먼저 설정하지 않는 한 `next build`가 실패**합니다. `env` 모듈은 `functions.ts` 등 다수 파일에서 import되므로, 이 변수 하나가 빠지면 **애플리케이션 전체 빌드가 중단**됩니다.
>
> **안전한 롤아웃 순서**:
> - **방법 A** (권장): 초기에 `z.string().optional()`로 추가하고, webhook 라우트에서 명시적 검증 → 환경 변수 배포 확인 후 `z.string()`으로 변경
> - **방법 B**: Vercel/Modal 환경 변수를 **먼저** 설정한 후 코드 배포 (배포 순서 강제)

```typescript
// src/env.js server 스키마에 추가
// 방법 A: 안전한 점진적 롤아웃
MODAL_WEBHOOK_SECRET: z.string().optional(),

// 방법 B: 환경 변수 선행 설정 후
MODAL_WEBHOOK_SECRET: z.string(),
```

> **⚠️ `runtimeEnv` 매핑도 반드시 함께 추가해야 합니다 (R23)**
>
> `@t3-oss/env-nextjs`는 `server` 스키마에 정의된 모든 변수가 `runtimeEnv` 섹션에도 매핑되어야 합니다. `server`에만 추가하고 `runtimeEnv`를 누락하면, `env.MODAL_WEBHOOK_SECRET`이 항상 `undefined`로 반환되거나 빌드 시 validation 에러가 발생합니다:
>
> ```typescript
> // src/env.js runtimeEnv 섹션에 추가 (server 스키마와 함께 반드시 추가)
> runtimeEnv: {
>   // ...기존 변수들...
>   MODAL_WEBHOOK_SECRET: process.env.MODAL_WEBHOOK_SECRET,
> },
> ```

> **⚠️ `optional()` + webhook 코드의 `undefined` 비교 문제 (R24)**
>
> 방법 A(`optional()`)를 사용하면 `env.MODAL_WEBHOOK_SECRET`이 `undefined`가 될 수 있습니다. 이때 webhook 라우트의 인증 비교가 `authHeader !== "Bearer undefined"`가 되어, **환경 변수 미설정 시 정상적인 webhook 요청도 모두 거부**됩니다 (Unauthorized 401). 에러 없이 조용히 실패하므로 원인 파악이 어렵습니다.
>
> **해결**: 섹션 6(2) webhook 코드에 `env.MODAL_WEBHOOK_SECRET` undefined 가드를 추가했습니다. `optional()` 사용 시 반드시 명시적 undefined 체크를 선행해야 합니다.

또한 이 시크릿을 Modal 백엔드 환경에도 설정해야 하므로 **Modal Secret(`ai-podcast-clipper-secret`)에 `MODAL_WEBHOOK_SECRET`을 추가하는 작업**과, Vercel 환경 변수에도 동일 값 설정이 필요합니다.

### Low: `ProcessVideoRequest` Pydantic 모델에 `uploaded_file_id` 필드 추가 미명시

섹션 6 권장 코드에서 `trigger-modal`이 `uploaded_file_id`를 Modal로 전송하지만, 백엔드의 `ProcessVideoRequest`(`main.py:26-29`)는:

```python
class ProcessVideoRequest(BaseModel):
    s3_key: str
    language: str = "Korean"
    clip_count: int
    # uploaded_file_id 필드 없음
```

Pydantic v2 기본 동작은 extra 필드를 무시하므로 422 에러는 발생하지 않지만, **해당 값이 request 객체에서 접근 불가능**하여 webhook 콜백에 포함할 수 없습니다. 필요한 작업 표에는 "uploaded_file_id 수신"이 기재되어 있으나, **Pydantic 모델 변경이 명시되지 않아** 구현자가 놓칠 수 있습니다.

**해결**: 명시적 필드 추가 필요:

```python
class ProcessVideoRequest(BaseModel):
    s3_key: str
    language: str = "Korean"
    clip_count: int
    uploaded_file_id: str  # 추가 — webhook 콜백에 포함하기 위해 필수
```

### Medium: `modal/processing.done` 이벤트 스키마 미등록

Inngest 클라이언트(`client.ts`)에 이벤트 타입이 정의되지 않아, 이벤트명이나 `data` 구조의 오타를 TypeScript가 잡지 못합니다. `step.waitForEvent`의 `match: "data.uploadedFileId"` 매칭 오류도 런타임에서만 발견 가능.

**해결**: Inngest 클라이언트에 이벤트 스키마 타입 추가 권장.

### Medium: 백엔드 webhook URL 전달 방식 미결정

구체적 전달 방식이 미결정:
- **방법 A**: `trigger-modal` fetch body에 `webhook_url` 동적 전달 → 유연하나 매 요청마다 URL 포함
- **방법 B**: Modal 환경 변수로 고정 → 단순하나 프론트 URL 변경 시 백엔드 재배포 필요

선택에 따라 양쪽 코드 구조가 달라지므로, 구현 전 결정 필요.

### 검증 완료 (문제 없음)

| 항목 | 검증 결과 |
|------|-----------|
| `onFailure` 이벤트 경로 `event.data.event.data.xxx` | Inngest v3 SDK `FailureEventPayload` 타입 직접 확인 — **정확** |
| `onFailure` 파라미터 `{ error, event, step }` | SDK `FailureEventArgs` 타입 확인 — **정확** |
| `onFailure`의 `error.message` 접근 | `FailureEventArgs.error`는 Error 인스턴스 → `.message` 유효 — **정확** |
| concurrency 배열 문법 | Inngest v3 function config에서 배열 형태 지원 확인 — **정확**. ⚠️ **단, trigger config에서는 concurrency가 조용히 무시됨** (런타임 검증으로 확인, 섹션 5 참조) |
| catch 블록 + onFailure 동시 수정 경고 | 이미 명시됨 — **적절** |
| `waitForEvent`의 `match: "data.uploadedFileId"` 매칭 | 원본 이벤트(`process-video-events`)와 대기 이벤트(`modal/processing.done`) 양쪽 모두 `data.uploadedFileId` 경로 존재 — **정상 작동**. ⚠️ 단, `match`는 SDK에서 deprecated → `if` 구문으로 변경 완료. null guard 추가하여 교차 오염 방지 (R9) |
| `waitForEvent` timeout `"1h"` 문법 | Inngest v3 duration string 규격 준수 — **유효** |
| timeout 후 재시도 동작 | `trigger-modal` step은 memoized → 재시도 시 Modal 중복 호출 없음, `waitForEvent`는 재대기. ⚠️ **`NonRetriableError` 적용으로 해결** — timeout 시 즉시 `onFailure`로 이동하여 retries × timeout 누적 대기 방지. `waitForEvent` timeout memoization 여부는 Inngest dev 서버에서 추가 검증 권장. |
| `cancelOn` 기본 동작 | Inngest v3에서 `waitForEvent` 중 cancel 이벤트 수신 시 함수 정상 취소 — **정상 작동** (단, Modal 측 처리 중단 불가 → 고아 파일 위험 별도 기술). ⚠️ **`cancelOn` 취소는 `onFailure`를 트리거하지 않음** — `inngest/function.cancelled`는 `inngest/function.failed`와 다른 이벤트 (R16) |

---

## 런타임 검증 이슈 (Stage 2: proposal-runtime-validator)

코드베이스 교차 검증(Stage 1) 이후, 권장 코드의 **런타임 동작, SDK 제약, 플랫폼 한계, 경쟁 조건**을 검증하여 발견한 이슈입니다. "구현 시 발견된 문제점"에 이미 기술된 항목은 제외하고 **신규 발견만** 포함합니다.

### R1. Critical: `concurrency` 설정이 trigger config에서 조용히 무시됨 — 프로덕션 버그

**상세 분석**: 섹션 5에 통합 기술. Inngest SDK 내부 코드 검증으로 확인된 **기존 프로덕션 버그**입니다. 동일 사용자의 동시 처리가 제한 없이 가능한 상태이며, 크레딧 이중 차감, 상태 전이 충돌 등 데이터 무결성 위험이 있습니다.

**즉시 조치 가능**: P0 비동기 전환과 독립적으로 concurrency를 function config로 이동하는 것만으로 해결됩니다.

### R2. High: `waitForEvent` 경쟁 조건 — 이벤트 선도착 시 영구 손실

비동기 전환 후, `trigger-modal`이 Modal에 요청을 보내고 `step.waitForEvent`가 대기를 시작합니다. Modal이 매우 빠르게 처리를 완료하거나, 재시도 시 `trigger-modal`이 memoized되어 스킵되면, **webhook 이벤트가 `waitForEvent` 등록 전에 도착**할 수 있습니다.

```
정상 흐름:
  trigger-modal(1초) → waitForEvent 등록 → ... → Modal 완료(수분) → webhook → 수신 ✅

경쟁 조건:
  trigger-modal(1초) → Modal 즉시 완료 → webhook 전송
  → waitForEvent 아직 미등록 → 이벤트 소실 ❌ → 1h timeout → 실패

재시도 경쟁 조건:
  시도1: trigger-modal(실행) → waitForEvent → [Modal 완료 + webhook 전송] → 관련 없는 에러로 실패
  시도2: trigger-modal(memoized/스킵) → waitForEvent(새로 등록) → 이벤트는 시도1에서 이미 소비됨 → 영구 대기 ❌
```

Inngest 공식 문서: *"wait for event begins listening for new events from when the code is executed. Events sent before will not be handled."*

**영향**: 빠른 처리 시나리오나 재시도 시 함수가 1시간 동안 행(hang) 후 실패. 사용자는 "processing" 상태에 갇힘.

**완화 방안**:
- 영상 처리는 일반적으로 수분~수십분 소요되므로 경쟁 창(race window)은 실질적으로 매우 좁음
- Modal 백그라운드 함수 시작 시 **최소 5-10초 지연** 후 webhook 전송 (step 등록 시간 확보)
- timeout 실패 모니터링을 설정하여 이 경쟁 조건 발생 시 감지
- 장기적으로 Inngest의 "lookback" 기능 도입 시 근본 해결 가능

### R3. High: `waitForEvent` 재시도는 근본적으로 무효 — `NonRetriableError` 필수성 재확인

`waitForEvent`가 timeout 후 일반 Error를 throw하면 재시도가 시작됩니다. 이때:

1. `trigger-modal`은 memoized → Modal에 중복 요청 없음 (정상)
2. `waitForEvent`는 memoized되지 않음 → **새로 등록하여 대기 시작**
3. 그러나 Modal은 이미 처리를 완료하고 webhook을 전송했음 (시도1에서 소비됨)
4. 새 `waitForEvent`는 이미 전송된 이벤트를 수신할 수 없음 → **다시 1h timeout**
5. 이 사이클이 retries(3) 횟수만큼 반복 → **최대 3시간 대기 후 영구 실패**

이는 단순한 "대기 시간 누적" 문제가 아니라, **재시도 자체가 구조적으로 성공할 수 없는** 설계 결함입니다. `NonRetriableError` 사용은 "효율"이 아닌 **필수**입니다.

기존 문서의 `NonRetriableError` 권장은 정확하며, 이 분석은 그 필수성에 대한 근거를 강화합니다. 추가로, `onFailure` 핸들러에서 **S3에 클립이 이미 존재하는지 확인**하는 로직을 추가하면, Modal은 성공했으나 이벤트가 소실된 경우를 복구할 수 있습니다.

### R4. High: Modal GPU timeout(900s) SIGKILL — try-except 무효화

현재 Modal 클래스는 `timeout=900`(15분)으로 설정되어 있습니다(`main.py:674`). 이 시간을 초과하면 Modal은 컨테이너를 **SIGKILL로 강제 종료**합니다. Python의 `try-except`는 SIGKILL을 잡을 수 없으므로, 문서의 권장 에러 처리 코드:

```python
try:
    result = process_video_internal(...)
    httpx.post(webhook_url, json={"status": "ok", ...})
except Exception as e:
    httpx.post(webhook_url, json={"status": "error", ...})  # ← SIGKILL 시 실행 안 됨
```

**15분을 초과하는 영상 처리 시 webhook이 전혀 전송되지 않습니다.** 30분 이상 팟캐스트의 경우 WhisperX 전사 + Gemini 분석 + 다수 클립의 ASD + GPU 인코딩을 합산하면 15분을 쉽게 초과할 수 있습니다.

**영향**: 긴 영상에서 사용자가 1시간(`waitForEvent` timeout) 동안 "processing" 상태에 갇힘.

**해결**:
- Modal timeout을 `timeout=1800`(30분) 이상으로 상향
- 처리 시작 직후 "processing started" 확인 webhook 전송 (heartbeat)
- 클립별 처리를 개별 Modal 함수 호출로 분리하여 단일 호출 시간 단축 검토

### R5. Medium: `@modal.fastapi_endpoint`는 `.spawn()` 미지원 — 엔드포인트 분리 필요

현재 `process_video`는 `@modal.fastapi_endpoint(method="POST")`로 데코레이트되어 있습니다. FastAPI 엔드포인트는 웹 서버 경로이지, Modal 함수가 아니므로 **`.spawn()` 메서드가 존재하지 않습니다**.

비동기 전환 시 아키텍처:

```python
@app.cls(gpu="L40S", timeout=1800)
class AiPodcastClipper:
    # HTTP 진입점 — 즉시 응답
    @modal.fastapi_endpoint(method="POST")
    def trigger_video(self, request: TriggerRequest):
        self.process_video_background.spawn(...)  # 백그라운드 시작
        return {"status": "accepted"}

    # 백그라운드 처리 — @modal.method() 사용 필수
    @modal.method()
    def process_video_background(self, ...):
        # 기존 process_video 로직 전체
        ...
        httpx.post(webhook_url, json={...})  # 완료 시 webhook
```

기존 문서의 `spawn()` 경고 박스를 **보완**합니다: 클래스 vs standalone 차이뿐 아니라, **`fastapi_endpoint` vs `method` 데코레이터 차이**가 핵심입니다.

### R6. Medium: Webhook 라우트 `inngest.send()` 에러 처리 부재

섹션 6 권장 webhook 코드에서 `await inngest.send({...})`에 try-catch가 없습니다. Inngest SDK 내부(`Inngest.js:396-418`)에서 5회 재시도 후 실패 시 throw하며, 이 에러가 라우트 핸들러로 전파되어 500 응답을 반환합니다.

Modal 백그라운드 함수의 `httpx.post()`는 500 응답을 받지만, 이미 `.spawn()`으로 분리된 상태에서 webhook 재시도 메커니즘이 없으면 **이벤트가 영구 손실**됩니다.

**해결**: webhook 라우트에 에러 처리 추가:

```typescript
// src/app/api/webhooks/modal/route.ts
try {
  await inngest.send({ name: "modal/processing.done", data: { ... } });
} catch (error) {
  console.error("[Webhook] Failed to send Inngest event:", error);
  // 500 반환하여 Modal 측 재시도 가능성 확보
  return new Response("Internal Server Error", { status: 500 });
}
```

또는 실패 시 Prisma에 직접 상태를 기록하는 fallback 로직 추가.

### R7. Medium: `MODAL_WEBHOOK_SECRET` 필수 추가 시 빌드 실패 위험

상세 분석은 "Low: Webhook 시크릿 환경 변수" 항목에 통합 기술. `@t3-oss/env-nextjs`의 빌드 타임 검증으로 인해, `z.string()`(필수)로 추가하면 환경 변수 미설정 시 전체 빌드가 중단됩니다. `z.string().optional()` → 확인 후 필수 전환 방식을 권장합니다.

### R8. Medium: 중복 `uploadedFileId` 이벤트 — concurrency 미적용과 복합 위험

R1(concurrency 미적용)으로 인해 동일 사용자가 같은 파일에 대해 처리를 중복 트리거할 수 있습니다. 두 Inngest 함수가 동시에 실행되면:

```
함수 A: trigger-modal → waitForEvent(match: uploadedFileId=X)
함수 B: trigger-modal → waitForEvent(match: uploadedFileId=X)
    ↓
Modal 완료 → webhook: modal/processing.done {uploadedFileId: X}
    ↓
Inngest: 이벤트를 함수 A 또는 B 중 하나에만 전달 (비결정적)
    ↓
함수 A: 수신 → 정상 처리 ✅
함수 B: 미수신 → 1h timeout → 실패 ❌ (그러나 Modal 처리는 2회 실행됨 → GPU 비용 2배)
```

**해결**: R1(concurrency를 function config로 이동) 해결이 선행되면 대부분 완화됩니다. 추가로 동일 파일 중복 처리를 원천 차단하려면 `singleton`을 사용합니다:

```typescript
singleton: {
  key: "event.data.uploadedFileId",
  mode: "cancel",  // 새 요청이 기존 실행을 취소하고 시작
},
```

> **⚠️ `idempotency`는 사용 금지 — 재처리(reprocess) 기능 파괴**
>
> `idempotency: "event.data.uploadedFileId"`를 사용하면, 동일 `uploadedFileId`에 대한 **두 번째 이벤트가 조용히 무시(skip)**됩니다. 이는 대시보드의 "재처리" 기능(`uploaded-files.ts:168`, `upload/api/index.ts:215`)이 같은 `uploadedFileId`로 이벤트를 발행하므로, **재처리 요청이 영원히 실행되지 않습니다**.
>
> SDK 타입 정의(`InngestFunction.d.ts:162-165`): *"Allow the specification of an idempotency key using event data. If specified, this overrides the rateLimit object."* — `idempotency`는 이벤트 자체를 중복 제거하므로 재실행이 불가능합니다.
>
> `singleton: { mode: "cancel" }`은 기존 **실행 중인 run**을 취소하고 새 실행을 시작합니다(`InngestFunction.d.ts:305-324`). 이벤트는 정상 수신되므로 재처리 시나리오에서 올바르게 동작합니다.

> **⚠️ `singleton: { mode: "cancel" }` + `trigger-modal` = Modal 이중 호출 + GPU 비용 2배 (R25)**
>
> `singleton`이 기존 run을 취소할 때, 해당 run이 이미 `trigger-modal` step을 완료한 상태라면 Modal 백그라운드 처리는 **이미 진행 중**입니다. 새 run이 시작되면 `trigger-modal`이 다시 실행되어 **두 번째 Modal 요청**이 전송됩니다:
>
> ```
> Run A: check-credits ✅ → trigger-modal ✅ (Modal 요청 전송) → waitForEvent 대기 중...
> 새 이벤트 도착 → singleton cancel: Run A 취소 (Modal은 여전히 처리 중)
> Run B: check-credits → trigger-modal (두 번째 Modal 요청!) → waitForEvent 대기...
>
> 결과: Modal GPU 2건 동시 실행 → GPU 비용 2배 (L40S 기준 건당 수 달러)
>       + Run A의 Modal 결과물 → S3에 클립 업로드 → DB 레코드 없음 → 고아 파일
> ```
>
> **완화**: Modal 백그라운드 함수 시작 시 DB에서 해당 `uploadedFileId`의 현재 상태를 확인하고, `status`가 `"cancelled"`이면 처리를 즉시 중단하는 early-exit 로직 추가. 상세 분석은 R25 참조.

### R9. High: `match` 필드의 `null == null` 교차 오염 + deprecated API 사용

`waitForEvent`와 `cancelOn`에서 사용하는 `match: "data.uploadedFileId"`는 두 가지 문제가 있습니다:

**(1) `null == null` 교차 오염 (High)**

`match`는 내부적으로 CEL 표현식 `event.data.uploadedFileId == async.data.uploadedFileId`로 변환됩니다. `uploadedFileId`가 양쪽 이벤트에서 모두 누락되거나 undefined이면:

```
CEL 평가: null == null → true → 매칭 성공 ❌

시나리오:
  webhook 코드에서 필드명 오타: payload.uploaded_filed_id (오타)
  → uploadedFileId = undefined
  → Inngest 이벤트: { data: { uploadedFileId: undefined, ... } }
  → match: null == null → true
  → 대기 중인 모든 함수 중 하나에 무작위 전달 → 잘못된 결과를 잘못된 사용자에게 전달
```

**영향**: 단일 필드명 오타가 **조용한 데이터 교차 오염**을 유발. 에러 없이 잘못된 클립이 잘못된 사용자에게 연결됨.

**(2) `match` deprecated (Low)**

SDK `InngestStepTools.d.ts:351`에서 `match`에 `@deprecated Use \`if\` instead.` 표시. `cancelOn`의 `match`도 `types.d.ts:930`에서 deprecated. 현재 런타임에서 작동하지만, 향후 SDK 업그레이드 시 제거 위험.

**해결**: 섹션 6(3) 권장 코드에서 `match` → `if` + null guard로 변경 완료:

```typescript
// waitForEvent — 변경 완료
if: "async.data.uploadedFileId != null && event.data.uploadedFileId == async.data.uploadedFileId"

// cancelOn — 함께 변경 필요
cancelOn: [{
  event: "process-video-events/cancel",
  if: "async.data.uploadedFileId != null && event.data.uploadedFileId == async.data.uploadedFileId",
}],
```

### R10. Medium: `onFailure` 재시도 0회 — SDK 하드코딩 `attempts: 1`

Inngest SDK 내부(`InngestFunction.js:140`)에서 `onFailure` 함수는 `retries: { attempts: 1 }`로 하드코딩됩니다. 즉 **재시도 없이 단 1회만 실행**됩니다.

```
processVideo 영구 실패 → onFailure 실행
  → step.run("record-permanent-failure") 내 DB 업데이트
  → Neon cold start / 네트워크 일시 장애 → Prisma 에러
  → onFailure 자체 실패 (재시도 없음)
  → uploadedFile status가 "processing"에 영구 고착
  → 사용자는 영원히 "처리 중" 상태를 봄
```

**영향**: DLQ(onFailure)가 보장되지 않으며, 상태 고착 시 복구 경로 없음.

**해결**: 섹션 3 권장 코드에 `step.run` 내부 try-catch 추가 완료. `updateMany` + try-catch 조합으로 DB 실패 시에도 onFailure 자체는 정상 종료되고, 로그로 실패를 감지.

### R11. Medium: Webhook `req.json()` 파싱 실패 미처리 — 1시간 무음 timeout

R6(inngest.send() 에러 처리)는 기술되었으나, 그 **이전 단계**인 `req.json()` 실패는 미처리였습니다:

```
Modal → webhook POST (malformed JSON / empty body / Content-Type 불일치)
  → req.json() throw → uncaught error → 500 응답
  → Inngest 이벤트 미전송 → waitForEvent 1h timeout
```

**해결**: 섹션 6(2) webhook 코드에서 전체 핸들러 body를 try-catch로 감싸도록 수정 완료. JSON 파싱 실패와 inngest.send() 실패를 모두 처리하며, 500 반환으로 Modal 측 재시도 가능성 확보.

### R12. Low: Webhook 라우트 `maxDuration` export 누락

프로젝트 내 다른 API 라우트(`inngest/route.ts:5`, `polar/route.ts:6`)는 모두 `export const maxDuration = 10;`을 포함합니다. 신규 webhook 라우트에도 일관성을 위해 추가가 필요합니다.

**해결**: 섹션 6(2) webhook 코드에 `export const maxDuration = 10;` 추가 완료.

### R13. Low: `cancelOn`의 `match` → `if` 변경 필요

R9에서 기술한 바와 같이, 현재 코드의 `cancelOn`(`functions.ts:43-47`)도 `match`를 사용합니다:

```typescript
cancelOn: [{
  event: "process-video-events/cancel",
  match: "data.uploadedFileId",  // deprecated + null == null 위험
}],
```

`waitForEvent`의 `if` 변경과 함께 `cancelOn`도 동일하게 수정해야 합니다.

### R14. Low: Vercel 재배포 중 in-flight 함수의 step ID 안정성

`waitForEvent`로 최대 1시간 대기하는 동안 Vercel 재배포가 발생하면, Inngest Cloud는 **최신 배포의 함수 엔드포인트**를 호출합니다. 만약 재배포에서 step 이름이 변경되었다면(예: `"trigger-modal"` → `"trigger-modal-v2"`), memoized 상태와 불일치하여 함수가 실패합니다.

**영향**: 비동기 전환 이후 step 이름 변경을 포함하는 재배포 시 in-flight 함수 실패. 일반적인 코드 변경에서는 발생하지 않음.

**권장**: step ID(`"trigger-modal"`, `"wait-for-modal"`, `"create-clips-in-db"` 등)를 **안정적 식별자(stable identifier)**로 취급. 변경이 필요하면 in-flight 함수가 모두 완료된 후 배포하거나, in-flight run 실패를 감수.

### R15. High: 재처리(reprocess) 경로에 `clipCount` 누락 — 기존 프로덕션 버그

**위치**: ~~`src/actions/uploaded-files.ts:168-174`~~ (V6: dead code), `src/fsd/features/upload/api/index.ts:215-222`

대시보드의 "재처리" 기능이 Inngest 이벤트를 발행할 때 `clipCount`를 포함하지 않습니다:

```typescript
// uploaded-files.ts:168-174 (reprocess)
await inngest.send({
  name: "process-video-events",
  data: {
    uploadedFileId: uploadedFile.id,
    userId: uploadedFile.userId,
    language: uploadedFile.language ?? "English",
    // ⚠️ clipCount 누락
  },
});

// upload/api/index.ts:215-222 (reprocess) — 동일하게 누락
```

반면 최초 업로드 경로는 `clipCount`를 정상적으로 포함합니다:
- `generation.ts:46-54` — `clipCount` 파라미터에서 직접 전달
- `clip/api/index.ts:67-75` — `count` 파라미터에서 `clipCount`로 전달

> **참고**: 이벤트 전송 경로는 총 **4곳** 존재합니다:
> 1. ~~`src/actions/generation.ts:46` — 최초 업로드 (clipCount ✅)~~ **(V7: dead code)**
> 2. `src/fsd/features/clip/api/index.ts:67` — 최초 업로드 (clipCount ✅) **← Active 초기 업로드 경로**
> 3. ~~`src/actions/uploaded-files.ts:168` — 재처리 (clipCount ❌)~~ **(V6: dead code — 수정 불필요)**
> 4. `src/fsd/features/upload/api/index.ts:215` — 재처리 (clipCount ❌) **← 유일한 수정 대상**

**영향**: `functions.ts:58`에서 `event.data.clipCount`이 `undefined`가 됩니다. Modal 엔드포인트에 `clip_count: undefined`가 전달되어:
- Pydantic `clip_count: int` 필드 검증 실패 → 422 에러 → Inngest 재시도 3회 후 영구 실패
- 또는 Python에서 `None`으로 처리될 경우 예측 불가능한 동작

**이 버그는 현재 프로덕션에서 활성 상태**이며, 비동기 전환과 무관하게 즉시 수정 필요합니다.

**해결**: `UploadedFile` Prisma 모델(`prisma/schema.prisma:61-80`)에는 `clipCount` 필드가 **존재하지 않으므로**, DB에서 조회할 수 없습니다. 명시적 기본값을 사용하거나 스키마에 필드를 추가해야 합니다:

```typescript
// 방법 A (즉시 적용): 명시적 기본값 사용
// uploaded-files.ts & upload/api/index.ts — reprocess 이벤트에 clipCount 추가
await inngest.send({
  name: "process-video-events",
  data: {
    uploadedFileId: uploadedFile.id,
    userId: uploadedFile.userId,
    language: uploadedFile.language ?? "English",
    clipCount: 3, // UploadedFile 스키마에 clipCount 필드 없음 — 기본값 사용
  },
});

// 방법 B (장기): prisma/schema.prisma에 clipCount 필드 추가
// model UploadedFile {
//   ...
//   clipCount Int @default(3)
// }
// → 이후 uploadedFile.clipCount로 접근 가능
```

### R16. High: `cancelOn` 취소는 `onFailure`를 트리거하지 않음 — 상태 고착

Inngest SDK 내부에서 `onFailure`는 `inngest/function.failed` 이벤트에만 반응합니다(`InngestFunction.js:130`):

```javascript
// InngestFunction.js:129-131
triggers: [{
  event: internalEvents.FunctionFailed,  // "inngest/function.failed"
  expression: `event.data.function_id == '${fnId}'`
}],
```

`cancelOn`으로 함수가 취소되면 `inngest/function.cancelled` 이벤트가 발행됩니다(`helpers/consts.js:163`). 이는 `inngest/function.failed`와 **다른 이벤트**이므로 `onFailure`가 실행되지 않습니다:

```
취소 흐름:
  cancel 이벤트 도착 → 함수 취소 → inngest/function.cancelled 발행
  → onFailure는 inngest/function.failed만 구독 → 실행 안 됨 ❌
  → status가 "processing"에 영구 고착 → 사용자는 "처리 중" 상태에 갇힘
```

**영향**: 사용자가 처리를 취소해도 파일 상태가 "processing"에서 변경되지 않음. 대시보드에서 영원히 "처리 중"으로 표시.

> **⚠️ 추가 gap: `singleton: { mode: "cancel" }` 취소도 동일 문제 발생**
>
> R8에서 권장하는 `singleton: { mode: "cancel" }`은 동일 `uploadedFileId`에 대한 새 이벤트가 도착하면 **기존 run을 자동 취소**합니다. 이 취소도 `inngest/function.cancelled`를 발생시키므로 `onFailure`가 실행되지 않습니다. `cancelOn`과 달리 singleton 취소는 Inngest Cloud 내부에서 자동 발생하므로, 사용자 서버 액션에서 DB 상태를 업데이트할 hook이 없습니다.
>
> **결론**: `cancelOn`과 `singleton` 모두에서 취소 후 상태 고착이 발생할 수 있으며, 서버 액션 hook으로는 singleton 취소를 커버할 수 없습니다. 아래 해결 방안 중 "방법 B(크론)"이 양쪽 모두를 커버합니다.

> **⚠️ 현재 `cancelOn`은 dead code — 취소 이벤트 전송 코드 미존재 (R20)**
>
> `process-video-events/cancel` 이벤트를 `inngest.send()`하는 코드가 `src/` 디렉토리 전체에 **존재하지 않습니다** (`functions.ts:45`의 `cancelOn` 정의만 존재). cancel 서버 액션이 아직 구현되지 않은 상태이므로, 아래 해결 방안은 **cancel 서버 액션 신규 생성**을 전제로 합니다.

**해결**:

**방법 A**: cancel 서버 액션 **신규 생성** + DB 상태 직접 업데이트:

```typescript
// src/actions/generation.ts (또는 별도 cancel 액션 파일) — 신규
"use server";

export async function cancelProcessing(uploadedFileId: string) {
  const session = await auth();
  if (!session?.user?.id) throw new Error("Unauthorized");

  await inngest.send({
    name: "process-video-events/cancel",
    data: { uploadedFileId },
  });
  // cancelOn은 onFailure를 트리거하지 않으므로, 여기서 직접 상태 변경
  await db.uploadedFile.update({
    where: { id: uploadedFileId, userId: session.user.id },
    data: { status: "cancelled" },
  });
}
```

**방법 B** (singleton 취소도 커버): "processing" 상태가 일정 시간(예: 2시간) 이상 지속된 레코드를 감지하는 **Inngest 크론 함수** 추가. `cancelOn` 취소, `singleton` 취소, 기타 예상치 못한 고착을 모두 포괄하는 안전장치로 작동.

> **참고**: `status` 필드는 Prisma enum이 아닌 `String` 타입(`schema.prisma:66`)이므로, "cancelled" 값 사용에 스키마 마이그레이션은 불필요합니다. 다만 프론트엔드 UI에서 "cancelled" 상태 표시 지원이 필요합니다.

### R17. Medium: `inngest.send()` + DB 업데이트 비원자성 — 중복 이벤트 위험

**위치**: ~~`src/actions/generation.ts:44-64`~~ (V7: dead code), `src/fsd/features/clip/api/index.ts:63-80` **(Active 경로 — 동일 패턴 존재)**

```typescript
if (uploadedVideo.uploaded) return;  // 가드 (line 44)

await inngest.send({ ... });          // 이벤트 발행 (line 46)

await db.uploadedFile.update({        // uploaded = true (line 56)
  where: { id: uploadedVideo.id },
  data: { uploaded: true },
});
```

`inngest.send()` 성공 후 DB 업데이트가 실패하면(네트워크 일시 장애, Neon cold start 등), `uploaded`가 `false`로 남습니다. 사용자가 재시도하면 가드(`uploaded === true`)를 통과하여 **동일 이벤트가 두 번 발행**됩니다.

R1(concurrency 미적용)이 함께 존재하면 두 Inngest 함수가 동시에 실행되어 GPU 비용 이중 청구 및 데이터 충돌 위험.

**영향**: R1 수정(concurrency → function config)으로 동시 실행은 방지되나, 중복 이벤트 발행 자체는 해결되지 않음. `singleton: { mode: "cancel" }` (R8)이 적용되면 기존 실행이 취소되므로 실질적 피해는 최소화.

**해결 방향**:
- **단기**: R1(concurrency) + R8(`singleton`) 수정으로 중복 실행 영향 최소화
- **장기**: DB 업데이트를 `inngest.send()` **이전**으로 이동하거나, 트랜잭션으로 묶어 원자성 확보:

```typescript
// 가드 + 상태 선점을 원자적으로 수행
const updated = await db.uploadedFile.updateMany({
  where: { id: uploadedVideo.id, uploaded: false },
  data: { uploaded: true },
});
if (updated.count === 0) return; // 이미 처리됨

await inngest.send({ ... }); // 실패 시 uploaded=true이지만 이벤트 미발행 → 별도 복구 필요
```

### R18. Low: CEL 표현식 런타임 전용 검증 — 오타 시 프로덕션에서만 발견

`waitForEvent`와 `cancelOn`의 `if` CEL 표현식:

```typescript
if: "async.data.uploadedFileId != null && event.data.uploadedFileId == async.data.uploadedFileId"
```

이 문자열은 TypeScript 컴파일 타임에 검증되지 않습니다. Inngest SDK는 이를 Inngest Cloud에 등록하고, **런타임에서만 CEL 파서가 평가**합니다. 필드명 오타(`uploadedFileId` → `uploadedFildId`)나 문법 오류가 있어도:

- `npm run build` 통과 ✅
- `npm run typecheck` 통과 ✅
- Inngest dev 서버에서 함수 등록 시 발견 가능 (부분적)
- 프로덕션에서 실제 이벤트 매칭 시 실패 → `waitForEvent` 영구 미매칭 → 1h timeout

**영향**: Low — CEL 표현식이 자주 변경되지 않으며, Inngest dev 서버 테스트로 사전 검증 가능.

**권장**: 비동기 전환 구현 후, Inngest dev 서버(`npm run inngest-dev`)에서 실제 이벤트 매칭 테스트를 **필수** 검증 단계로 포함. CEL 표현식 변경 시 반드시 dev 서버 테스트 수행.

> **⚠️ `cancelOn`의 `if` CEL 표현식에서 `async`/`event` 참조 방향 검증 필요**
>
> `waitForEvent`의 CEL에서 `async`는 원래 함수 트리거 이벤트, `event`는 수신 이벤트를 참조합니다. `cancelOn`의 `if` CEL에서도 동일한 참조 방향인지 SDK 문서에서 명확하지 않습니다. `cancelOn`은 step-level이 아닌 function-level에서 동작하므로 CEL 컨텍스트가 다를 수 있습니다. **Inngest dev 서버에서 실제 cancel 이벤트 매칭을 반드시 테스트해야 합니다.** `waitForEvent` 테스트만으로는 `cancelOn`의 CEL 정확성을 보장할 수 없습니다.

### R19. Low: `onFailure` 함수에 concurrency 미상속 — 동시 실패 시 DB 경합

`onFailure` 핸들러는 부모 함수(`processVideo`)의 concurrency 설정을 상속하지 않습니다. SDK 내부(`InngestFunction.js:126-142`)에서 `onFailure`는 별도 함수로 등록되며, `concurrency` 속성이 포함되지 않습니다.

동일 사용자의 여러 함수가 동시에 실패하면(예: Modal 일시 장애 시), 여러 `onFailure`가 동시에 실행되어 동일 `uploadedFile` 레코드에 대해 `updateMany`가 경합할 수 있습니다.

**영향**: Low — `updateMany`는 멱등(idempotent) 연산이므로 데이터 무결성 위험은 낮음. 다만 로깅이 중복 발생하여 모니터링 노이즈가 증가할 수 있음.

**권장**: 현재 `onFailure` 구현(try-catch + `updateMany`)으로 충분히 안전. 대규모 동시 실패 시나리오가 관측되면 `onFailure`에도 concurrency 제한 추가를 검토.

### R20. Medium: `cancelOn` dead code — 취소 이벤트 전송 코드 미존재

`cancelOn`(`functions.ts:43-47`)이 `process-video-events/cancel` 이벤트를 구독하지만, 이 이벤트를 `inngest.send()`하는 코드가 `src/` 디렉토리 전체에 **존재하지 않습니다**.

```bash
# src/ 전체 검색 결과
$ grep -r "process-video-events/cancel" src/
src/inngest/functions.ts:45:        event: "process-video-events/cancel",
# → cancelOn 정의만 존재, 이벤트 전송 코드 없음
```

**영향**: `cancelOn` 설정은 현재 dead code. 사용자가 처리를 취소하는 UI/서버 액션이 없으므로, 취소 기능 자체가 미구현 상태. R16에서 권장하는 "cancel 서버 액션에서 DB 상태 업데이트"도 해당 서버 액션이 존재하지 않으므로, **cancel 서버 액션 신규 생성**이 R16의 전제 조건.

**해결**: R16 해결 시 cancel 서버 액션을 함께 생성. R16의 "방법 A" 코드 참조.

### R21. ~~Medium~~ Low: `removeGeneratedClipsFromS3` prefix 버그 — Finding C와 동일 (V1 정정: 조건부)

**위치**: ~~`src/actions/uploaded-files.ts:195`~~ (V6: dead code), `src/fsd/features/upload/api/index.ts:274`

> **⚠️ V1 실행 검증: 현재 S3 키 형식(`{uuid}/original.{ext}`)에서는 이 버그가 발현되지 않습니다.** `split("/")[0]` → `{uuid}` (정상). 구 형식 S3 객체가 프로덕션에 잔존하는 경우에만 활성. 상세 분석은 V1 참조.

재처리 시 기존 클립을 삭제하는 `removeGeneratedClipsFromS3` 함수에 Finding C와 **동일한 prefix 추출 패턴**이 있습니다:

```typescript
// uploaded-files.ts:195 & upload/api/index.ts:274
const prefix = originalKey.split("/")[0] + "/";
```

구 형식 S3 키(`{userId}/{uuid}/original.mp4`)의 경우:
- `split("/")[0]` → `{userId}` (uuid 누락)
- prefix → `{userId}/` → **해당 사용자의 모든 업로드 폴더를 대상으로 S3 ListObjects 실행**
- 결과: 재처리 시 해당 사용자의 **다른 업로드 클립까지 삭제** 위험

```
재처리 대상: userId/abc-uuid/original.mp4
prefix: userId/              ← abc-uuid 누락
S3 listing: userId/abc-uuid/clip_0.mp4, userId/def-uuid/clip_0.mp4, ...
삭제 대상: 사용자의 모든 클립 ❌ (abc-uuid뿐 아니라 def-uuid 클립도 포함)
```

> **⚠️ 이 버그는 Finding C(`functions.ts:168`)의 S3 fallback 버그와 근본 원인이 동일하지만, 영향이 더 심각합니다.** Finding C는 "매칭 실패(0건)"이지만, 이 버그는 "과도한 매칭 → 데이터 손실" 위험입니다.

**해결**: Finding C와 동일하게 `split("/").slice(0, 2).join("/")` 적용. 단, R22의 S3 키 형식 불일치를 함께 고려해야 합니다.

### R22. ~~Medium~~ Low: S3 키 형식 불일치 — ~~신규 업로드 vs 구 업로드~~ CLAUDE.md 문서 vs 실제 코드 (V1 정정)

**위치**: `src/fsd/features/upload/api/index.ts:32`, `src/actions/s3.ts:35`

> **⚠️ V1 실행 검증에서 전제 오류 확인됨**
>
> 원래 이 항목은 `actions/s3.ts`가 `{userId}/{uuid}/original.mp4` 형식을 사용한다고 기술했습니다. **실제 코드 검증 결과, `actions/s3.ts:35`도 `{uuid}/original.{ext}` 형식을 사용합니다.** 두 파일 모두 동일한 형식이며, `{userId}` 접두사를 사용하는 코드는 현재 코드베이스에 존재하지 않습니다. CLAUDE.md의 `{userId}/{uuid}/original.mp4` 기술이 outdated입니다.

현재 코드베이스의 S3 키 형식:

| 경로 | 형식 | 예시 |
|------|------|------|
| `upload/api/index.ts:32` (`generateUploadUrl`) | `{uuid}/original.{ext}` | `abc-uuid/original.mp4` |
| `actions/s3.ts:35` (`generateUploadUrl`) | `{uuid}/original.{ext}` | `abc-uuid/original.mp4` |

**양쪽 모두 동일한 형식입니다.** `{userId}/{uuid}/original.mp4` 형식은 CLAUDE.md에만 기술되어 있으며, 이전 버전의 잔재로 추정됩니다.

**영향 재평가**:
- **Finding C**: 현재 형식에서 `split("/")[0]` → `{uuid}` (정상). **신규 업로드에서는 버그가 발현되지 않음.**
- **R21**: 현재 형식에서 `removeGeneratedClipsFromS3`는 정상 동작.
- **구 형식 S3 객체**: 프로덕션 S3에 이전 버전에서 생성된 `{userId}/{uuid}/...` 형식 객체가 잔존하면 해당 객체에 대해서만 버그 활성.

**권장 조치**:
1. 프로덕션 S3 버킷에서 구 형식 객체 존재 여부 확인 (`aws s3 ls` 또는 콘솔)
2. 구 형식 객체가 없다면 Finding C, R21은 **비활성 이슈** — P2 이하로 하향
3. prefix 추출 수정은 방어적 코드로서 여전히 유효하나, 긴급도는 낮음

**해결** (방어적 수정 — 양쪽 형식 모두 지원):

```typescript
// 형식 무관 prefix 추출 — 마지막 세그먼트(파일명)를 제거
const prefix = originalKey.split("/").slice(0, -1).join("/") + "/";
// 현재 형식: "abc-uuid/original.mp4"         → "abc-uuid/"
// 구 형식:   "userId/abc-uuid/original.mp4" → "userId/abc-uuid/"
```

4. CLAUDE.md의 S3 키 패턴 기술을 현재 코드에 맞게 업데이트 필요.

### R23. High: `env.js` `runtimeEnv` 매핑 누락 — `MODAL_WEBHOOK_SECRET` 접근 불가

**위치**: `src/env.js:59-84`

문서는 `MODAL_WEBHOOK_SECRET`을 `server` 스키마에 추가하라고 권장하지만, **`runtimeEnv` 섹션에 대한 매핑 추가를 언급하지 않습니다.** `@t3-oss/env-nextjs`는 `server`에 정의된 모든 변수가 `runtimeEnv`에도 매핑되어야 합니다.

```typescript
// src/env.js — 누락 시 env.MODAL_WEBHOOK_SECRET이 항상 undefined 반환

// ① server 스키마 (문서에 기술됨)
server: {
  // ...기존 변수들...
  MODAL_WEBHOOK_SECRET: z.string().optional(),
},

// ② runtimeEnv 매핑 (문서에 기술되지 않음 — 반드시 함께 추가)
runtimeEnv: {
  // ...기존 변수들...
  MODAL_WEBHOOK_SECRET: process.env.MODAL_WEBHOOK_SECRET,  // ← 필수
},
```

**영향**: `runtimeEnv` 매핑 없이 배포하면 `env.MODAL_WEBHOOK_SECRET`이 항상 `undefined`가 됩니다. webhook 라우트의 인증 비교가 실패하여 **모든 Modal 콜백이 거부**되고, Inngest 함수는 1시간 waitForEvent timeout 후 실패합니다. 빌드 에러가 아닌 **런타임 무음 실패**이므로 원인 파악이 매우 어렵습니다.

**해결**: "Low: Webhook 시크릿 환경 변수" 항목에 `runtimeEnv` 매핑 코드를 추가했습니다.

### R24. High: `MODAL_WEBHOOK_SECRET` optional + webhook `"Bearer undefined"` 비교 — 모든 정상 요청 거부

**위치**: `src/app/api/webhooks/modal/route.ts` (신규), `src/env.js`

문서는 안전한 롤아웃을 위해 `z.string().optional()`을 권장합니다. 이때 `env.MODAL_WEBHOOK_SECRET`이 `undefined`가 되면 webhook 라우트의 인증 비교에서:

```
authHeader !== `Bearer ${env.MODAL_WEBHOOK_SECRET}`
→ authHeader !== `Bearer ${undefined}`
→ authHeader !== "Bearer undefined"
→ Modal이 정상 시크릿을 보내도: "Bearer real-secret" !== "Bearer undefined" → true
→ return new Response("Unauthorized", { status: 401 })  ← 모든 정상 요청 거부
```

**영향**: 환경 변수 미설정 상태에서 배포하면 **모든 webhook 호출이 401로 거부**됩니다. 에러 로그 없이 조용히 실패하므로(Unauthorized 응답만 반환), Inngest 함수는 1시간 timeout 후 실패하고 사용자는 "처리 중" 상태에 갇힙니다.

**해결**: 섹션 6(2) webhook 코드에 `env.MODAL_WEBHOOK_SECRET` undefined 가드를 추가했습니다:

```typescript
if (!env.MODAL_WEBHOOK_SECRET) {
  console.error("[Webhook] MODAL_WEBHOOK_SECRET not configured");
  return new Response("Server misconfigured", { status: 500 });
}
```

이 가드는 환경 변수 미설정 시 500 에러 + 에러 로그를 생성하여 문제를 **즉시 감지**할 수 있게 합니다.

### R25. Medium: `singleton: { mode: "cancel" }` + `trigger-modal` = Modal 이중 호출 + GPU 비용 2배

**관련**: R8(`singleton` 권장), "cancelOn + waitForEvent 취소 시 고아 파일" 섹션

R8에서 권장하는 `singleton: { mode: "cancel" }`이 기존 run을 취소할 때, 해당 run이 이미 `trigger-modal` step을 완료한 상태라면 Modal 백그라운드 처리는 **취소 불가능한 상태에서 계속 진행**됩니다. 새 run이 시작되면 `trigger-modal`이 다시 실행되어 **두 번째 Modal 요청**이 전송됩니다:

```
Run A: check-credits ✅ → trigger-modal ✅ (Modal 요청 전송) → waitForEvent 대기...
  새 이벤트 도착 (재처리 등) → singleton cancel → Run A 취소
  그러나 Modal 백그라운드 처리는 진행 중 (취소 메커니즘 없음)

Run B 시작: check-credits → trigger-modal (두 번째 Modal 요청!) → waitForEvent 대기...

결과:
  - Modal GPU 2건 동시 실행 → GPU 비용 2배 (L40S 기준 건당 수 달러)
  - Run A의 Modal 결과물 → S3에 클립 업로드 → DB 레코드 없음 → 고아 파일
  - Run A의 webhook → modal/processing.done 이벤트 → Run B의 waitForEvent가 수신 가능
    (uploadedFileId 동일 → 매칭 성공, 그러나 Run A의 결과를 Run B가 소비하는 타이밍 경쟁)
```

기존 문서의 "고아 파일" 섹션은 `cancelOn`(사용자 명시적 취소)을 다루지만, **`singleton`에 의한 자동 취소 → Modal 이중 호출**은 사용자가 인지하지 못한 채 GPU 비용이 누적되는 운영 비용 문제입니다.

**영향**: 사용자가 빠르게 재처리를 반복하면 건수만큼 Modal GPU 비용 발생. S3 고아 파일 누적.

**해결**:
- **Modal 백그라운드 함수 early-exit**: 처리 시작 시 DB에서 `uploadedFileId`의 상태를 확인하고, `status`가 `"cancelled"` 또는 이미 다른 run이 진행 중이면 즉시 종료 (webhook으로 `status: "cancelled"` 전송)
- **대안**: R8의 `singleton` 대신 R1(concurrency `limit: 1, key: userId`) + 프론트엔드 가드로 중복 방지. GPU 비용이 민감한 경우 `singleton` 도입을 재검토

### R26. Medium: Webhook relay 시 clip 데이터 camelCase/snake_case 불일치 가능성 — 클립 메타데이터 유실

**관련**: "create-clips-in-db 데이터 참조 경로 변경 누락" 섹션

현재 직접 API 응답에서 작동하는 clips 필드명이 webhook 경유 후에도 동일 형식을 유지하는지 **보장되지 않습니다**. 두 경로의 데이터 직렬화 과정이 다릅니다:

| 경로 | 직렬화 방식 | 형식 |
|------|-------------|------|
| 현재 (직접 API) | Pydantic 응답 직렬화 (`@modal.fastapi_endpoint`) | camelCase 가능 (Pydantic `alias_generator` 또는 `by_alias`) |
| 변경 후 (webhook) | `httpx.post(json=dict)` — raw Python dict 전송 | snake_case (Python 기본) |

프론트엔드의 타입 기대(`ProcessVideoBackendClip`):

```typescript
type ProcessVideoBackendClip = {
  s3Key?: string | null;         // camelCase
  startSeconds?: number | null;  // camelCase
  // ...
};
```

Python dict가 snake_case(`s3_key`, `start_seconds`)라면:

```
webhook relay: { clips: [{ s3_key: "...", start_seconds: 10 }] }
→ create-clips-in-db: c.s3Key → undefined
→ filter(typeof c?.s3Key === "string") → false → 모든 클립 탈락
→ clipsFound: 0 → 크레딧 0 차감 → 사용자는 클립 없는 "processed" 상태
```

**영향**: 현재 직접 API가 camelCase로 작동 중이라면 Pydantic alias 등이 적용된 것이며, webhook 경로에서는 이 변환이 빠질 수 있습니다. 클립 메타데이터(startSeconds, endSeconds, scriptText, youtubeTitle 등)가 모두 null로 저장되거나, s3Key 필터에서 탈락하여 클립이 0건 생성될 위험.

**해결**:
- **방법 A**: Modal 백그라운드 함수의 webhook 전송 시 camelCase 변환 적용:
  ```python
  def to_camel(snake: str) -> str:
      parts = snake.split("_")
      return parts[0] + "".join(p.capitalize() for p in parts[1:])

  clips_payload = [{to_camel(k): v for k, v in clip.items()} for clip in clips]
  ```
- **방법 B**: 프론트엔드 webhook 라우트에서 snake_case → camelCase 변환 후 Inngest 이벤트에 포함
- **방법 C**: 프론트엔드 `create-clips-in-db` step에서 양쪽 형식 모두 처리:
  ```typescript
  s3Key: (c.s3Key ?? c.s3_key) as string | undefined,
  ```
- **검증 필수**: 구현 전 Modal 백엔드의 현재 직접 API 응답에서 clip 필드가 camelCase인지 snake_case인지 확인

### R27. Low: 로컬 개발 환경에서 비동기 flow 전체 테스트 불가

비동기 전환 후 전체 데이터 흐름:

```
Frontend → Modal (cloud) → webhook POST → Frontend → Inngest
```

Modal은 클라우드에서 실행되므로 `localhost:3000/api/webhooks/modal`로 POST할 수 없습니다. 문서는 프로덕션 배포에 집중하며, **로컬 개발 및 테스트 전략을 다루지 않습니다.**

**영향**: 개발 중 비동기 flow의 end-to-end 테스트가 불가능하여 개발 속도 저하. webhook 관련 버그(R23, R24, R26 등)가 프로덕션 배포 전까지 발견되지 않을 위험.

**해결 방향**:
- **Inngest dev 서버 활용**: `npm run inngest-dev` + dev UI에서 `modal/processing.done` 이벤트를 **수동 발행**하여 waitForEvent 이후 flow 테스트 가능. Modal → webhook 구간은 스킵.
- **터널링**: ngrok 또는 Cloudflare Tunnel로 `localhost:3000`을 외부 노출하여 Modal webhook 수신. `webhook_url`을 동적 전달(방법 A) 시 dev 환경에서 터널 URL 사용 가능.
- **Mock webhook**: 로컬에서 `curl`로 직접 webhook POST 호출하여 라우트 핸들러 단독 테스트:
  ```bash
  curl -X POST http://localhost:3000/api/webhooks/modal \
    -H "Authorization: Bearer dev-secret" \
    -H "Content-Type: application/json" \
    -d '{"status":"ok","uploaded_file_id":"test-id","clips":[{"s3Key":"test/clip_0.mp4"}]}'
  ```
- **테스트 전략 문서화**: P0 비동기 전환 구현 시, 각 구간별 테스트 방법을 운영 문서에 명시

---

## 실행 검증 이슈 (Stage 3: 코드베이스 교차 재검증)

감사 문서의 권장 코드를 **실제 코드베이스와 재교차 검증**하여 발견한 이슈입니다. Stage 1~2에서 가정한 전제(S3 키 형식, 파일 구조 등)가 실제 코드와 불일치하거나, 권장 코드를 구현할 때 **문서가 다루지 않는 실행 단계의 공백**을 식별합니다.

### V1. High: S3 키 형식 전제 오류 — Finding C, R21, R22의 버그 설명이 현재 코드와 불일치

**검증 대상**: Finding C, R21, R22

**검증 결과**: 감사 문서는 S3 키 형식을 `{userId}/{uuid}/original.mp4`(구 형식)로 가정하고, `split("/")[0]`이 `userId`만 추출하여 클립 매칭이 실패한다고 기술합니다. 그러나 **실제 코드 검증 결과, 양쪽 업로드 경로 모두 동일한 형식을 사용합니다**:

| 파일 | 코드 | 실제 S3 키 형식 |
|------|------|-----------------|
| `src/actions/s3.ts:35` | `` `${uniqueId}/original.${fileExtentsion}` `` | `{uuid}/original.{ext}` |
| `src/fsd/features/upload/api/index.ts:32` | `` `${uniqueId}/original.${fileExtension}` `` | `{uuid}/original.{ext}` |

`{userId}` 접두사를 사용하는 **active 코드**는 현재 코드베이스에 **존재하지 않습니다**. 단, deprecated 함수 `upload/api/index.ts:getPresignedUploadUrl`에 `${userId}/${fileId}/original.mp4` 형식이 잔존합니다 (V8 참조 — dead code이지만 과거 프로덕션에서 사용된 이력을 시사). CLAUDE.md의 `{userId}/{uuid}/original.mp4` 기술은 outdated이며, R22가 주장한 "두 가지 S3 키 형식이 코드베이스에 공존" 역시 **active 코드 기준으로는 사실과 다릅니다**.

**영향**:

| 항목 | 문서 주장 | 실제 동작 (현재 형식) |
|------|-----------|----------------------|
| Finding C: S3 fallback 매칭 | `split("/")[0]` → `userId` → 0건 매칭 | `split("/")[0]` → `uuid` → **정상 매칭** |
| R21: `removeGeneratedClipsFromS3` | `prefix = userId/` → 사용자 전체 클립 삭제 위험 | `prefix = uuid/` → **해당 업로드만 대상** |
| R22: 두 형식 공존 | `actions/s3.ts`는 구 형식 | `actions/s3.ts`도 **신 형식 사용** |

**조치**:
- Finding C, R21은 **조건부 버그**로 재분류 — 프로덕션 S3에 구 형식 객체가 잔존하는 경우에만 발현
- 프로덕션 S3 버킷에서 `{userId}/{uuid}/` 패턴 존재 여부 확인 후 최종 우선순위 결정
- `split("/").slice(0, -1).join("/") + "/"` 방어적 수정은 양쪽 형식 모두 지원하므로 여전히 유효하나 긴급도 하향
- CLAUDE.md의 S3 키 패턴 기술을 현재 코드에 맞게 업데이트 필요

### V2. Critical: P0 비동기 전환 배포 순서 미정의 — 중간 상태에서 전체 처리 실패

**검증 대상**: 섹션 6 (P0 비동기 전환), 조치 항목 P0 전체

감사 문서는 프론트엔드/백엔드 양쪽의 변경사항을 나열하지만, **배포 순서를 명시하지 않습니다**. 프론트엔드와 백엔드 변경이 원자적으로 배포될 수 없으므로(별도 레포, 별도 플랫폼), 중간 상태가 반드시 발생합니다:

```
시나리오 A: 프론트엔드 먼저 배포
  Inngest 함수: trigger-modal → fetch(새 트리거 엔드포인트)
  백엔드: 아직 구 동기 엔드포인트만 존재 → 404 또는 스키마 불일치
  → 모든 영상 처리 실패 ❌

시나리오 B: 백엔드 먼저 배포 (구 엔드포인트 제거)
  Inngest 함수: call-modal-endpoint → fetch(구 동기 엔드포인트)
  백엔드: 구 엔드포인트 없음 → 404
  → 모든 영상 처리 실패 ❌

시나리오 C: 백엔드 먼저 배포 (구 엔드포인트 유지 + 새 트리거 엔드포인트 추가)
  Inngest 함수: call-modal-endpoint → fetch(구 동기 엔드포인트)
  백엔드: 구 엔드포인트 정상 응답 → 기존 흐름 유지
  → 정상 동작 ✅ (새 트리거 엔드포인트는 아직 미사용)
  → 이후 프론트엔드 배포 시 새 엔드포인트로 전환
```

**유일하게 안전한 배포 순서**:

| 단계 | 대상 | 작업 | 검증 |
|------|------|------|------|
| 1 | Backend | 기존 `process_video` 동기 엔드포인트 **유지** + 새 `trigger_video` 엔드포인트 **병행 추가** + `@modal.method()` 백그라운드 함수 추가 + webhook 전송 로직 | 구 엔드포인트 정상 동작 확인 |
| 2 | Frontend | webhook 라우트 생성 + `env.js`에 `MODAL_WEBHOOK_SECRET` 추가 | webhook 라우트 단독 테스트 (curl) |
| 3 | Infra | Vercel/Modal에 `MODAL_WEBHOOK_SECRET` 환경 변수 설정 | 환경 변수 존재 확인 |
| 4 | Frontend | Inngest 함수를 `trigger-modal` + `waitForEvent`로 전환 (`PROCESS_VIDEO_ENDPOINT`를 새 트리거 엔드포인트 URL로 변경) | Inngest dev 서버에서 전체 flow 테스트 |
| 5 | Backend | 구 `process_video` 동기 엔드포인트 제거 (선택) | 구 엔드포인트 호출 없음 확인 |

> **⚠️ 단계 4 배포 시 `PROCESS_VIDEO_ENDPOINT` 환경 변수도 새 트리거 엔드포인트 URL로 변경해야 합니다.** 코드 배포와 환경 변수 변경을 동시에 진행해야 하며, Vercel에서는 환경 변수 변경 후 재배포가 필요합니다.

### V3. High: `create-clips-in-db` step 완전 리팩터링 코드 부재 — 구현 시 다수 이슈 동시 발생

**검증 대상**: "create-clips-in-db 데이터 참조 경로 변경 누락" 섹션, R26

감사 문서는 `modalPayload?.clips` → `modalResult.data.clips` 변경을 언급하지만, **현재 step 전체(functions.ts:134-189)의 리팩터링 코드를 제공하지 않습니다**. 이 step은 다음 이슈가 **동시에 교차**하는 지점입니다:

1. **데이터 소스 변경**: `modalPayload`(직접 API 응답) → `modalResult.data`(Inngest event)
2. **타입 안전성 부재**: `modalResult.data.clips`는 이벤트 스키마 미등록으로 `any` 타입
3. **camelCase/snake_case 불일치 (R26)**: webhook relay 시 clip 필드명 변환 필요 가능성
4. **S3 fallback 유지 여부**: webhook에서 클립 데이터를 필수로 받으면 fallback 제거 가능, 아니면 기존 fallback 유지 + prefix 수정
5. **`ProcessVideoBackendClip` 타입 재사용 가능 여부**: webhook 경유 데이터가 동일 형식인지 보장 안 됨

구현자는 이 5가지를 하나의 step 안에서 동시에 해결해야 하며, 문서의 파편적 안내만으로는 실수 가능성이 높습니다.

**권장 구현 가이드**:

```typescript
// ✅ 비동기 전환 후 create-clips-in-db step 전체 (권장)
const { clipsFound } = await step.run("create-clips-in-db", async () => {
  // 1. webhook relay 데이터에서 클립 추출 — any 타입 주의
  const rawClips = modalResult.data.clips as Array<Record<string, unknown>> | undefined;

  if (Array.isArray(rawClips) && rawClips.length > 0) {
    const createData = rawClips
      .filter((c) => {
        // 2. camelCase/snake_case 양쪽 지원 (R26 방어)
        const key = (c.s3Key ?? c.s3_key) as string | undefined;
        return typeof key === "string" && key.length > 0;
      })
      .map((c) => ({
        s3Key: ((c.s3Key ?? c.s3_key) as string),
        uploadedFileId,
        userId,
        startSeconds: (c.startSeconds ?? c.start_seconds ?? null) as number | null,
        endSeconds: (c.endSeconds ?? c.end_seconds ?? null) as number | null,
        scriptText: (c.scriptText ?? c.script_text ?? null) as string | null,
        youtubeTitle: (c.youtubeTitle ?? c.youtube_title ?? null) as string | null,
        youtubeDescription: (c.youtubeDescription ?? c.youtube_description ?? null) as string | null,
        youtubeHashtags: (() => {
          const tags = (c.youtubeHashtags ?? c.youtube_hashtags) as string[] | null | undefined;
          return tags ? JSON.stringify(tags) : null;
        })(),
      }));

    if (createData.length > 0) {
      await db.clip.createMany({ data: createData });
    }
    return { clipsFound: createData.length };
  }

  // 3. S3 fallback (webhook에서 clips 누락 시)
  const folderPrefix = s3Key.split("/").slice(0, -1).join("/");
  const allKeys = await listS3Objects(folderPrefix);

  const clipKeys = allKeys.filter(
    (key): key is string =>
      typeof key === "string" &&
      key.startsWith(`${folderPrefix}/clip_`) &&
      key.endsWith(".mp4"),
  );

  if (clipKeys.length > 0) {
    await db.clip.createMany({
      data: clipKeys.map((clipKey) => ({
        s3Key: clipKey,
        uploadedFileId,
        userId,
      })),
    });
  }
  return { clipsFound: clipKeys.length };
});
```

> **⚠️ 이 코드는 R26의 검증 결과에 따라 조정이 필요합니다.** Modal 백엔드의 현재 API 응답이 camelCase라면 webhook에서도 동일 형식을 보장하도록 백엔드를 수정하고, 양쪽 지원 코드를 제거하여 단순화합니다.

### V4. High: Webhook URL 전달 방식 미결정 — P0 착수 차단

**검증 대상**: "백엔드 webhook URL 전달 방식 미결정" 섹션

감사 문서는 방법 A(동적 전달) vs 방법 B(환경 변수 고정)를 제시하고 "구현 전 결정 필요"라고만 기술합니다. 이 결정은 P0의 **다수 작업에 영향을 미치는 차단 의존성(blocking dependency)**입니다:

| 영향받는 파일 | 방법 A (동적) | 방법 B (환경 변수) |
|--------------|--------------|-------------------|
| `functions.ts` — `trigger-modal` body | `webhook_url` 필드 추가 | 불변 |
| `main.py` — `ProcessVideoRequest` | `webhook_url: str` 필드 추가 | 불변 |
| `main.py` — 백그라운드 함수 | 파라미터에서 URL 수신 | `modal.Secret`에서 URL 읽기 |
| `env.js` | `MODAL_WEBHOOK_CALLBACK_URL` 추가 (프론트 자신의 URL) | 불변 |
| Modal Dashboard | Secret 불변 | `MODAL_WEBHOOK_CALLBACK_URL` Secret 추가 |
| 로컬 개발 | ngrok URL을 동적 전달 → 터널링 없이 테스트 가능 | `.env`마다 고정 URL → 터널링 필수 |

**방법 B가 단순하지만**, 프론트엔드 URL 변경 시(Preview 배포, 도메인 이전 등) 백엔드 재배포가 필요합니다. **방법 A가 유연하지만**, 환경 변수와 Pydantic 모델 양쪽에 추가 필드가 필요합니다.

**권장**: P0 작업 시작 **전에** 방법을 확정하고, 확정 결과를 이 문서에 기록. 방법 선택에 따라 V2(배포 순서)의 구체적 단계도 달라집니다.

### V5. Medium: `StepRunner` 타입 제거 시 구체적 대체 경로 부재 — P0 선행 공수 과소 추정

**검증 대상**: "StepRunner 커스텀 타입에 waitForEvent 미정의" 섹션

감사 문서는 `StepRunner` 커스텀 타입(`functions.ts:35-37`)을 제거하고 Inngest SDK 내장 타입을 사용하라고 권장하지만, **구체적 대체 코드를 제공하지 않습니다**. 실제 수정 시 다음 사항을 함께 처리해야 합니다:

**(1) 타입 어노테이션 제거 방식**

```typescript
// ❌ 현재 코드 — 커스텀 타입 명시
async ({ event, step }: { event: ProcessVideoEvent; step: StepRunner }) => {

// ✅ 방법 A: 타입 어노테이션 완전 제거 (SDK 추론에 의존)
// createFunction의 3번째 인자 콜백은 SDK가 타입을 자동 추론합니다.
// 단, 이벤트 스키마가 Inngest 클라이언트에 미등록이면 event.data가 any 타입.
async ({ event, step }) => {

// ✅ 방법 B: Inngest 이벤트 스키마 등록 (완전한 타입 안전성)
// src/inngest/client.ts에서:
type Events = {
  "process-video-events": {
    data: {
      uploadedFileId: string;
      userId: string;
      language: string;
      clipCount: number;
    };
  };
  "process-video-events/cancel": {          // ⚠️ V9: cancelOn + R16 cancel 서버 액션에 필수
    data: {
      uploadedFileId: string;
    };
  };
  "modal/processing.done": {
    data: {
      uploadedFileId: string;
      status: "ok" | "error";
      clips?: Array<{/* ... */}>;
      error?: string | null;
    };
  };
};
export const inngest = new Inngest({ id: "ai-podcast-clipper-frontend", schemas: new EventSchemas().fromRecord<Events>() });
```

**(2) `ProcessVideoEvent` 커스텀 타입의 처리**

`functions.ts:6-13`의 `ProcessVideoEvent` 타입도 함께 제거하고 이벤트 스키마로 대체해야 합니다. 방법 A에서는 `event.data` 접근 시 타입 가드 또는 `as` 캐스팅이 필요하여, 기존보다 타입 안전성이 **오히려 낮아질 수** 있습니다.

**(3) `waitForEvent` 반환 타입**

이벤트 스키마 미등록 시 `step.waitForEvent`의 반환 타입이 `any`가 되어, `modalResult.data.clips` 접근에서 타입 체크가 불가능합니다. V3의 `create-clips-in-db` 리팩터링과 직결됩니다.

**공수 재추정**: 30분 → **1-2시간** (방법 B 이벤트 스키마 등록 포함 시). 방법 A는 30분이지만 타입 안전성 저하.

**권장**: 방법 B(이벤트 스키마 등록)를 P0-선행에 포함. `ProcessVideoEvent` 커스텀 타입, `StepRunner` 커스텀 타입, `ProcessVideoBackendResponse` 타입을 모두 이벤트 스키마와 SDK 타입으로 대체하는 **단일 작업**으로 묶어 처리. ⚠️ Events 타입에 `process-video-events/cancel` 이벤트 **반드시** 포함 — 누락 시 기존 `cancelOn` 설정(functions.ts:43-48)도 컴파일 실패하여 V5 작업 자체가 차단됨 (V10). R16 cancel 서버 액션의 `inngest.send()` 호출에서도 컴파일 실패 (V9).

---

### V6. Medium: `src/actions/uploaded-files.ts`의 `reprocessUploadedFile`, `deleteUploadedFileWithClips`는 dead code

**검증 대상**: R15(clipCount 누락), R21(S3 prefix 버그) 등에서 `src/actions/uploaded-files.ts`를 수정 대상으로 지정한 부분

`src/actions/uploaded-files.ts`의 import chain을 추적한 결과, **5개 exported 함수 중 4개가 dead code**임을 확인했습니다.

**(1) Import chain 분석**

외부에서 이 파일을 import하는 곳은 **단 1곳**입니다:

```
src/app/dashboard/uploads/[uploadedFileId]/page.tsx
  → import { getUploadedFileDetails } from "~/actions/uploaded-files"
```

나머지 4개 함수는 어디에서도 import되지 않습니다:

| 함수 | 라인 | Import 여부 | 상태 |
|------|------|------------|------|
| `getUploadedFiles` | ~31 | ❌ 미사용 | Dead code |
| `deleteUploadedFileWithClips` | ~95 | ❌ 미사용 | Dead code |
| `reprocessUploadedFile` | ~133 | ❌ 미사용 | Dead code |
| `removeGeneratedClipsFromS3` | ~190 | 내부 전용 (dead 함수에서만 호출) | Dead code |
| `getUploadedFileDetails` | ~54 | ✅ `[uploadedFileId]/page.tsx`에서 사용 | **Active** |

**(2) Active 코드 경로**

대시보드에서 실제로 사용되는 재처리/삭제 기능은 FSD 구조의 별도 파일에 구현되어 있습니다:

```
src/fsd/features/upload/ui/index.tsx (대시보드 UI)
  → import { reprocessUploadedFile, deleteUploadedFileWithClips } from "~/fsd/features/upload/api"
  → src/fsd/features/upload/api/index.ts (Active 버전)
```

**(3) 감사 보고서에 대한 영향**

| 감사 항목 | `actions/uploaded-files.ts` 수정 | 실제 필요 여부 |
|-----------|--------------------------------|--------------|
| R15 (clipCount 누락) | `uploaded-files.ts:168` | ❌ Dead code — **`upload/api/index.ts:215`만 수정하면 됨** |
| R21 (S3 prefix 버그) | `uploaded-files.ts:195` | ❌ Dead code — **`upload/api/index.ts:274`만 수정하면 됨** |
| S3 prefix 조치 항목 | `uploaded-files.ts` 포함 | ❌ 제거 — FSD 경로만 관련 |

**권장**:
1. R15, R21 등 조치 항목에서 `src/actions/uploaded-files.ts` 참조를 제거하고, `src/fsd/features/upload/api/index.ts`만 대상으로 변경
2. 별도 P3 항목으로 `src/actions/uploaded-files.ts`의 dead code를 정리 (미사용 함수 삭제 또는 파일 전체를 `getUploadedFileDetails`만 남기고 축소)

---

### V7. High: `src/actions/generation.ts` 전체가 dead code — R17이 dead code를 타겟팅

**검증 대상**: R17(inngest.send + DB 비원자성), R15 이벤트 경로 #1 등에서 `src/actions/generation.ts`를 참조한 부분

V6에서 `src/actions/uploaded-files.ts`의 dead code를 식별한 후, `src/actions/` 디렉토리 전체의 import chain을 확장 추적했습니다.

**(1) Import chain 분석**

`src/actions/` 디렉토리 전체를 외부에서 import하는 곳은 **프로젝트 전체에서 단 1건**입니다:

```
src/app/dashboard/uploads/[uploadedFileId]/page.tsx
  → import { getUploadedFileDetails } from "~/actions/uploaded-files"
```

`~/actions/generation`, `~/actions/s3`를 import하는 파일은 **0건**입니다. 즉, `src/actions/` 디렉토리는 `getUploadedFileDetails` 단일 함수를 제외하면 **전체가 dead code**입니다.

**(2) `actions/generation.ts` ↔ `fsd/features/clip/api/index.ts` 대응**

| Dead code (`actions/generation.ts`) | Active code (`fsd/features/clip/api/index.ts`) |
|--------------------------------------|-----------------------------------------------|
| `processVideo` (line 18) | `processVideo` (line 21) |
| `getClipPlayUrl` (line 72) | `getClipPlayUrl` (line 99) |
| `deleteClip` (line 110) | `deleteClip` (line 135) |

추가로 `src/actions/s3.ts` 역시 외부 import 0건 — dead code입니다. Active S3 함수는 `src/fsd/shared/api/s3.ts`와 `src/fsd/features/upload/api/index.ts:generateUploadUrl`에 존재합니다.

**(3) 감사 보고서에 대한 영향**

| 감사 항목 | Dead code 참조 | 실제 수정 대상 |
|-----------|---------------|--------------|
| **R17** (inngest.send 비원자성) | `actions/generation.ts:44-64` | **`fsd/features/clip/api/index.ts:63-80`** (동일 패턴 확인 — 이슈 유효, 파일만 변경) |
| R15 이벤트 경로 #1 | `actions/generation.ts:46` | `fsd/features/clip/api/index.ts:67` (V7: dead code 표시 완료) |
| P2 R17 조치 항목 | `src/actions/generation.ts` | `src/fsd/features/clip/api/index.ts`로 변경 |

**권장**:
1. R17 및 관련 조치 항목의 파일 참조를 `fsd/features/clip/api/index.ts`로 변경
2. V6의 P3 dead code 정리 항목을 `src/actions/` 디렉토리 전체로 확대 — `generation.ts`, `s3.ts` 포함

---

### V8. Medium: V1의 "`{userId}` 접두사 코드 미존재" 주장이 부정확 — deprecated 함수에 구 형식 잔존

**검증 대상**: V1의 "현재 코드베이스에 `{userId}` 접두사 코드가 존재하지 않는다"는 전제

V1에서 S3 키 형식을 검증할 때, active 코드만 확인하고 deprecated 함수를 누락했습니다.

**(1) Deprecated 함수 발견**

`src/fsd/features/upload/api/index.ts`의 `getPresignedUploadUrl` (line ~248):

```typescript
/**
 * @deprecated generateUploadUrl 함수를 사용하세요. 이 함수는 다음 버전에서 제거됩니다.
 */
export async function getPresignedUploadUrl(...) {
  const s3Key = `${userId}/${fileId}/original.mp4`;  // ← 구 형식 {userId}/{fileId}/original.mp4
  // ...
}
```

이 함수는 현재 어디에서도 import되지 않으므로 dead code이지만, **과거에 active였던 이력을 시사**합니다.

**(2) 프로덕션 영향**

| 관점 | 의미 |
|------|------|
| 구 형식 S3 객체 잔존 가능성 | **상승** — 이 deprecated 함수가 과거 프로덕션에서 사용되어 `{userId}/{uuid}/original.mp4` 형식 객체를 생성했을 가능성이 높음 |
| Finding C, R21 버그 발현 | 구 형식 객체에서 `split("/")[0]` → `userId` → **잘못된 prefix** → 버그 발현 |
| V1의 P1→P2 하향 근거 | 약화 — 구 형식 객체 잔존 시 버그가 실제 프로덕션에서 발현 가능 |

**(3) V1 문구 정정 완료**

V1의 "`{userId}` 접두사를 사용하는 코드는 현재 코드베이스에 존재하지 않습니다" 문구를 "**active 코드**에 존재하지 않습니다 (deprecated 함수에 잔존)" 으로 정정했습니다.

**권장**:
1. 프로덕션 S3 확인(기존 P3 항목)의 긴급도를 **P2로 상향** — deprecated 함수 존재로 구 형식 객체 잔존 가능성이 높아졌으므로, S3 prefix 수정(Finding C, R21)의 최종 우선순위를 조기에 확정해야 함
2. S3 prefix 수정(~~P1~~ P2)은 프로덕션 S3 확인 결과에 따라 **P1 복원 가능성** 있음을 명시
3. V6의 dead code 정리 P3 항목에 이 deprecated 함수 제거도 포함

---

### V9. Medium: V5의 Events 타입에 `process-video-events/cancel` 이벤트 누락 — R16 cancel 서버 액션 동시 구현 시 TypeScript 컴파일 실패

**검증 대상**: V5에서 권장하는 `EventSchemas` 이벤트 스키마 등록 코드

SDK 내부를 직접 검증한 결과, `EventSchemas.fromRecord<Events>()`는 **컴파일 타임에 이벤트 이름을 엄격하게 제한**합니다. `Inngest.send()`의 타입 시그니처가 `SendEventPayload<GetEvents<this>>`를 사용하여, Events 타입에 등록되지 않은 이벤트 이름은 TypeScript 에러를 발생시킵니다.

**(1) 문제 상황**

V5의 원래 Events 타입은 2개 이벤트만 등록:
- `"process-video-events"` — 메인 처리 이벤트
- `"modal/processing.done"` — webhook 콜백 이벤트

그러나 다음 코드에서 `"process-video-events/cancel"` 이벤트를 **send**해야 합니다:

| 위치 | 용도 | 코드 |
|------|------|------|
| `functions.ts:43-48` `cancelOn` | 취소 이벤트 수신 대기 | `event: "process-video-events/cancel"` |
| R16 cancel 서버 액션 (신규) | 취소 이벤트 발행 | `inngest.send({ name: "process-video-events/cancel", data: { uploadedFileId } })` |

EventSchemas 적용 후 cancel 이벤트가 Events에 미등록이면:
```typescript
// ❌ TypeScript 컴파일 에러 — "process-video-events/cancel" is not assignable
await inngest.send({
  name: "process-video-events/cancel",
  data: { uploadedFileId },
});
```

**(2) SDK 검증 근거**

`node_modules/inngest/components/Inngest.d.ts`에서 `send()` 메서드:
```typescript
send(payload: SendEventPayload<GetEvents<this>>): Promise<SendEventsOutput>;
```

`GetEvents<this>`는 `EventSchemas.fromRecord<Events>()`에 등록된 이벤트만 반환하므로, 미등록 이벤트명은 타입 에러를 발생시킵니다. 이는 **런타임 validation이 아닌 컴파일 타임 제한**이므로, 빌드 자체가 실패합니다.

**(3) 수정 사항**

V5의 Events 타입에 cancel 이벤트 추가 (본 문서의 V5 코드 예시는 이미 정정 완료):

```typescript
type Events = {
  "process-video-events": {
    data: { uploadedFileId: string; userId: string; language: string; clipCount: number; };
  };
  "process-video-events/cancel": {       // ← 추가 필수
    data: { uploadedFileId: string; };
  };
  "modal/processing.done": {
    data: { uploadedFileId: string; status: "ok" | "error"; clips?: Array<{}>; error?: string | null; };
  };
};
```

**(4) 영향 범위**

| 항목 | 영향 |
|------|------|
| V5 P0-선행 공수 | 미변경 — 이벤트 타입 1개 추가는 1-2시간 범위 내 |
| R16 cancel 서버 액션 (P1) | **V5와 반드시 동시 구현** — V5에서 EventSchemas 등록 시 cancel 이벤트 누락하면 R16 구현 불가 |
| ~~`cancelOn` 기존 설정~~ | ~~영향 없음~~ **(V10 정정: 영향 있음)** — `cancelOn.event`도 EventSchemas 타입 체크 대상. cancel 이벤트 미등록 시 **기존 `cancelOn` 설정도 컴파일 실패**. 상세 분석은 V10 참조 |

**권장**: V5 P0-선행 작업 시 3개 이벤트(process-video-events, process-video-events/cancel, modal/processing.done)를 **한 번에 등록**. cancel 이벤트 누락 시 기존 `cancelOn` 설정이 깨지므로 **선택이 아닌 필수** (V10). 향후 이벤트 추가 시에도 Events 타입 동시 갱신 필수.

---

### V10. High: V9의 `cancelOn` 영향 평가 오류 — `cancelOn.event`도 EventSchemas 타입 체크 대상, V5 P0-선행 차단

**검증 대상**: V9의 영향 범위 테이블 — "`cancelOn` 기존 설정 | 영향 없음"

V9는 `cancelOn`이 SDK 내부에서 이벤트명을 문자열로 처리하여 EventSchemas 타입 체크 대상이 아니라고 기술했습니다. **SDK 타입 정의를 직접 검증한 결과, 이 주장은 사실과 다릅니다.**

**(1) SDK 타입 검증 근거**

```typescript
// node_modules/inngest/types.d.ts:888-908
type Cancellation<Events extends Record<string, EventPayload>> = {
  [K in keyof Events & string]: {
    event: K;  // ← 등록된 이벤트명으로 제한되는 매핑된 타입
    if?: string;
    // ...
  }
}[keyof Events & string];

// node_modules/inngest/components/InngestFunction.d.ts:325
cancelOn?: Cancellation<GetEvents<TClient, true>>[];
```

`cancelOn.event`는 `[K in keyof Events & string]`으로 매핑되어, **EventSchemas에 등록된 이벤트명만 허용**합니다. plain `string`이 아닙니다. 동일하게 trigger config의 `event`도 `Trigger<TriggersFromClient<TClient>>`로 제한됩니다.

**(2) 실제 영향 — V5 P0-선행 작업 자체가 차단됨**

V5에서 EventSchemas를 적용할 때, `process-video-events/cancel` 이벤트를 미등록하면:

```
기존 코드 functions.ts:43-48:
  cancelOn: [{
    event: "process-video-events/cancel",  // ← TypeScript 에러
           ^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^
           Type '"process-video-events/cancel"' is not assignable to
           type '"process-video-events" | "modal/processing.done"'
    match: "data.uploadedFileId",
  }]
```

**이는 V9의 "R16과 동시 구현 시에만 문제" 평가를 뒤집습니다.** cancel 이벤트 미등록 시:
- R16 cancel 서버 액션(P1, 미래 코드)뿐 아니라
- **기존 `cancelOn` 설정(현재 코드)**도 컴파일 실패
- 따라서 V5 P0-선행 작업 자체가 빌드되지 않음

**(3) trigger config `event`도 동일하게 제한**

```typescript
// node_modules/inngest/components/InngestFunction.d.ts:88-93
type Trigger<T extends string> = StrictUnion<{ event: T; } | { cron: string; }>;
```

trigger config의 `event: "process-video-events"`도 등록된 이벤트명으로 제한됩니다. 현재 이 이벤트는 V5 Events 타입에 포함되어 있으므로 문제 없으나, **향후 새 트리거 이벤트 추가 시 Events 타입 동시 갱신 필수**.

**(4) V9 영향 범위 정정**

| 항목 | V9 원래 평가 | V10 정정 |
|------|-------------|----------|
| `cancelOn` 기존 설정 | 영향 없음 | **영향 있음** — cancel 이벤트 미등록 시 기존 `cancelOn`도 컴파일 실패 |
| V5 P0-선행 차단 여부 | R16과 동시 구현 시에만 | **V5 자체가 차단** — cancel 이벤트 등록은 선택이 아닌 P0-선행 필수 |
| cancel 이벤트 등록 긴급도 | P1 (R16과 함께) | **P0-선행** (V5와 함께) |

**권장**: V9의 권장사항(3개 이벤트 한 번에 등록)은 이미 정확합니다. V10은 그 근거를 강화합니다 — cancel 이벤트 등록이 "R16을 위한 사전 준비"가 아니라 "V5 작업 완료의 필수 조건"입니다.

---

### SDK 검증 결과 요약 (4차·5차 분석 통합)

| 항목 | SDK 검증 결과 |
|------|---------------|
| `EventSchemas.fromRecord<T>()` | v3.45.1에 존재 ✅ — 제네릭 파라미터만 사용, 런타임 인자 없음 |
| `Inngest` 생성자 `schemas` 속성 | `ClientOptions.schemas?: EventSchemas<...>` — 문서 기술 정확 ✅ |
| `cancelOn.event` 타입 제한 | `Cancellation<GetEvents<TClient, true>>[]` — **등록된 이벤트명만 허용** ⚠️ V10 |
| trigger config `event` 타입 제한 | `Trigger<TriggersFromClient<TClient>>` — **등록된 이벤트명만 허용** ✅ (현재 이벤트 등록됨) |
| `waitForEvent` | 첫 번째 인자 = step ID string, options = `{ event, timeout, if?, match? }`, 반환 = `EventPayload \| null` ✅ |
| `singleton` | `{ key?: string, mode: "skip" \| "cancel" }` — InngestFunction.d.ts:311-324 ✅ |
| `NonRetriableError` | `(message: string, options?: { cause?: unknown })`, `inngest` 패키지에서 export ✅ |
| `onFailure` | 내부적으로 `retries: { attempts: 1 }` 하드코딩 ✅ |
| `onFailure` 이벤트 접근 경로 | `event.data.event.data.uploadedFileId` — `FailureEventPayload` 중첩 구조 확인 ✅ |

---

### 추가 확인: CLAUDE.md 데이터베이스 기술 오류

CLAUDE.md는 데이터베이스를 "**Prisma + SQLite**"로 기술합니다:

```
- Uses Prisma adapter with SQLite database    (CLAUDE.md:64)
- **Database (Prisma + SQLite)**:              (CLAUDE.md:77)
```

실제 `prisma/schema.prisma`는 **PostgreSQL**(Neon)을 사용합니다:

```prisma
datasource db {
    provider  = "postgresql"
    url       = env("DATABASE_URL")
    directUrl = env("DATABASE_URL_UNPOOLED")
}
```

감사 문서는 R10, R17 등에서 Neon cold start를 정확히 언급하므로 감사 자체에 영향은 없으나, CLAUDE.md P3 업데이트 항목에 포함해야 합니다.

---

## 조치 항목

| 우선순위 | 항목 | 관련 파일 | 예상 공수 | 런타임 검증 |
|----------|------|-----------|-----------|-------------|
| **P0-긴급** | 🚨 concurrency를 trigger config → function config로 이동 (R1). **기존 프로덕션 버그** — 사용자별 동시성 미적용 중. P0 비동기 전환과 독립적으로 즉시 적용 | `src/inngest/functions.ts` | 10분 | R1 |
| **P0-긴급** | 🚨 재처리(reprocess) 이벤트에 `clipCount` 추가 (R15). **기존 프로덕션 버그** — 재처리 시 Modal 422 에러로 영구 실패. P0 비동기 전환과 독립적으로 즉시 적용. ~~`actions/uploaded-files.ts`~~ V6: dead code — FSD만 수정 | `src/fsd/features/upload/api/index.ts` | 10분 | R15, V6 |
| **P0-선행** | 🚨 Webhook URL 전달 방식 확정 — 방법 A(동적) vs 방법 B(환경 변수). **P0 전체의 차단 의존성** — 미결정 시 프론트/백엔드 코드 구조가 확정되지 않음 (V4) | 설계 문서 | 30분 (설계) | V4 |
| **P0-선행** | 🚨 P0 비동기 전환 배포 순서 계획 수립 — 백엔드 하위 호환 유지 → 프론트 전환 → 구 엔드포인트 제거 (V2) | 설계 문서 | 30분 (설계) | V2 |
| **P0-선행** | `StepRunner` + `ProcessVideoEvent` + `ProcessVideoBackendResponse` 커스텀 타입 제거 → Inngest SDK 이벤트 스키마 등록으로 대체. ⚠️ Events 타입에 `process-video-events/cancel` 포함 **필수** (V10: 누락 시 기존 `cancelOn` 설정도 컴파일 실패 — R16과 무관하게 V5 자체가 차단됨). P0 필수 선행, 공수 재추정 (V5, V9, V10) | `src/inngest/client.ts`, `src/inngest/functions.ts` | **1-2시간** (V5 정정) | V5, V9, V10 |
| **P0-선행** | `ProcessVideoRequest` Pydantic 모델에 `uploaded_file_id: str` 필드 추가 ⚠️ P0 필수 선행 | `ai-podcast-clipper-backend/main.py` | 10분 | |
| **P0** | Modal 비동기 패턴 전환 — 백엔드: 기존 `process_video` 동기 엔드포인트 **유지** + 새 `trigger_video` 엔드포인트 **병행 추가** + `@modal.method()` 백그라운드 분리 (V2 배포 순서 준수, R5) | `ai-podcast-clipper-backend/main.py` | 1-2일 | R5, V2 |
| **P0** | Modal 비동기 패턴 전환 — 프론트: webhook 라우트 생성 + Inngest 함수 변경 + `create-clips-in-db` step 완전 리팩터링 (V3 권장 코드 적용, `trigger-modal`에 `uploadedFileId` 포함) | `src/inngest/functions.ts`, `src/app/api/webhooks/modal/route.ts` (신규), `src/env.js` | 1일 | V3 |
| **P0** | Modal 실패 경로 설계 — 백엔드 try-except + 실패 시에도 webhook 전송 (`status: "error"`), 프론트 통합 이벤트 패턴으로 성공/실패 분기 처리. ⚠️ GPU timeout SIGKILL은 try-except로 잡을 수 없음 (R4) | `main.py`, `src/app/api/webhooks/modal/route.ts`, `src/inngest/functions.ts` | P0과 함께 | R4 |
| **P0** | Modal timeout `900` → `1800`+ 상향 (R4). GPU timeout 시 SIGKILL로 webhook 미전송 위험 | `ai-podcast-clipper-backend/main.py` | 5분 | R4 |
| **P0-보안** | Webhook 엔드포인트에 시크릿 토큰 인증 추가 + `env.js` 스키마 **및 `runtimeEnv`** 에 `MODAL_WEBHOOK_SECRET` 추가 (⚠️ `z.string().optional()` 우선 + undefined 가드 필수, R7, R23, R24) + Modal Secret/Vercel 환경 변수 설정 | `src/app/api/webhooks/modal/route.ts`, `src/env.js`, Modal Dashboard, Vercel Dashboard | 30분 | R7, R23, R24 |
| **P0-보안** | Webhook 라우트 `inngest.send()` try-catch 에러 처리 추가 (R6) | `src/app/api/webhooks/modal/route.ts` | 10분 | R6 |
| **P1** | onFailure 핸들러 추가 + catch 블록 status 제거 (DLQ) ⚠️ 함께 작업 필수 | `src/inngest/functions.ts` | 1시간 | |
| **P1** | NonRetriableError 적용 (findUniqueOrThrow → findUnique 변경 포함) | `src/inngest/functions.ts` | 30분 | |
| **P1** | `waitForEvent` timeout 시 `NonRetriableError` 사용 — 재시도가 구조적으로 성공 불가하므로 **필수** (R3) | `src/inngest/functions.ts` | 10분 | R3 |
| **P1** | cancel 서버 액션 **신규 생성** + `cancelOn` 취소 시 DB 상태 직접 업데이트 (R16, R20). cancel 이벤트 전송 코드가 현재 미존재하므로 서버 액션부터 생성. ⚠️ V5 EventSchemas에 `process-video-events/cancel` 등록 필수 — 미등록 시 `inngest.send()` 컴파일 실패 (V9). ⚠️ `singleton` 취소는 서버 액션 hook 불가 → 크론 정리 함수 검토 | cancel 서버 액션 (신규), `src/inngest/functions.ts` | 1시간 | R16, R20, V9 |
| **P1-보완** | onFailure 핸들러에서 `update` → `updateMany` 변경 (Prisma P2025 방지) | `src/inngest/functions.ts` | 10분 | |
| **P1-보완** | onFailure에서 S3 클립 존재 여부 확인 → Modal 성공 + 이벤트 소실 복구 (R2, R3) | `src/inngest/functions.ts` | 30분 | R2, R3 |
| **~~P1~~ P2** | S3 prefix 추출 방어적 수정 — `split("/").slice(0, -1).join("/") + "/"` 패턴으로 Finding C + R21 동시 해결. ⚠️ V1 검증: **현재 S3 키 형식에서는 버그 미발현** — 구 형식 S3 객체 잔존 시에만 활성. 프로덕션 S3 확인 후 최종 우선순위 결정. ~~`actions/uploaded-files.ts`~~ V6: dead code — 수정 불필요 | `src/inngest/functions.ts`, `src/fsd/features/upload/api/index.ts` | 20분 | R21, R22, V1, V6 |
| **P1** | Webhook relay 시 clip 데이터 camelCase/snake_case 형식 검증 + 불일치 시 변환 로직 추가 (R26). ⚠️ P0 비동기 전환 구현 시 반드시 함께 검증. 현재 Modal API 응답 형식 확인 후 webhook 경로 일치 보장 | `ai-podcast-clipper-backend/main.py`, `src/app/api/webhooks/modal/route.ts` 또는 `src/inngest/functions.ts` | 1시간 | R26 |
| **P2** | `waitForEvent` 경쟁 조건 완화 — Modal 백그라운드 함수 시작 시 5-10초 지연 + timeout 실패 모니터링 (R2) | `ai-podcast-clipper-backend/main.py`, 모니터링 설정 | 1시간 | R2 |
| **P2** | 중복 처리 방지 — `singleton: { key: "event.data.uploadedFileId", mode: "cancel" }` 추가 (R8). ⚠️ `idempotency` 사용 금지 — 재처리 기능 파괴. ⚠️ singleton 취소 시 Modal 이중 호출 + GPU 비용 2배 위험 (R25) — Modal early-exit 로직 함께 검토 | `src/inngest/functions.ts`, `ai-podcast-clipper-backend/main.py` | 10분 + 설계 | R8, R25 |
| **P2** | `cancelOn` 취소 시 고아 파일 정리 방안 설계 + `singleton` 취소 시 Modal 이중 호출 방지 — Modal 백그라운드 함수에 DB 상태 확인 early-exit 로직 추가 (R25) | 설계 문서, `ai-podcast-clipper-backend/main.py` | 1시간 | R25 |
| **P2** | `cancelOn`의 `match` → `if` + null guard 변경 (R9, R13). `waitForEvent` 변경과 함께 적용 | `src/inngest/functions.ts` | 10분 | R9, R13 |
| **P2** | 초기 업로드 이벤트 발행 + DB 업데이트 원자성 확보 — DB 선행 업데이트 또는 `updateMany` 가드 패턴 (R17). R1 + R8 수정으로 실질적 피해 최소화 가능. ~~`actions/generation.ts`~~ V7: dead code — FSD 경로만 수정 | `src/fsd/features/clip/api/index.ts` | 30분 | R17, V7 |
| **P3** | CEL 표현식 변경 시 Inngest dev 서버 매칭 테스트 필수화 — `cancelOn`의 `if` CEL 컨텍스트(`async`/`event` 방향)도 별도 검증 필수 (R18) | 운영 문서, CI 체크리스트 | 15분 | R18 |
| **P3** | step ID 안정성 정책 문서화 — 비동기 전환 후 step 이름 변경 시 in-flight 함수 실패 위험 (R14) | 운영 문서 | 15분 | R14 |
| **P3** | 비동기 전환 로컬 개발 테스트 전략 문서화 — Inngest dev 서버 이벤트 수동 발행, Mock webhook curl, 터널링(ngrok) 방법 정리 (R27) | 운영 문서 | 30분 | R27 |
| **P3** | console.log 제거 | `src/inngest/functions.ts` | 5분 | |
| **P3** | CLAUDE.md S3 키 패턴 기술 업데이트 — `{userId}/{uuid}/original.mp4` → `{uuid}/original.{ext}` (V1) | `CLAUDE.md` | 5분 | V1 |
| **~~P3~~ P2** | 프로덕션 S3 버킷에서 구 형식(`{userId}/{uuid}/...`) 객체 존재 여부 확인 — 결과에 따라 Finding C, R21 우선순위 최종 결정. ⚠️ V8: deprecated `getPresignedUploadUrl` 발견으로 구 형식 객체 잔존 가능성 상승 → 조기 확인 필요 (V1, V8) | AWS 콘솔 또는 CLI | 10분 | V1, V8 |
| **P3** | `src/actions/` 디렉토리 dead code 전면 정리 — `uploaded-files.ts`의 `getUploadedFileDetails`만 존속, 나머지 전체 제거 대상: `generation.ts` (3함수), `s3.ts` (전체), `uploaded-files.ts`의 미사용 4함수, `upload/api/index.ts`의 deprecated `getPresignedUploadUrl`. FSD 구조에 모든 active 버전 존재하므로 안전 삭제 가능 (V6, V7, V8) | `src/actions/generation.ts`, `src/actions/s3.ts`, `src/actions/uploaded-files.ts`, `src/fsd/features/upload/api/index.ts` | 30분 | V6, V7, V8 |
| **P3** | CLAUDE.md 데이터베이스 기술 수정 — "Prisma + SQLite" → "Prisma + PostgreSQL (Neon)" (실제 schema.prisma: `provider = "postgresql"`, `directUrl = env("DATABASE_URL_UNPOOLED")`) | `CLAUDE.md` | 5분 | V8 |

---

## 코드 수정 현황 (2026-03-30)

> **수정 일자**: 2026-03-30
> **수정 범위**: 프론트엔드 전용 (백엔드 변경 별도 필요)

### 완료된 수정

| 파일 | 수정 내용 | 관련 이슈 |
|------|-----------|-----------|
| `src/inngest/client.ts` | `EventSchemas().fromRecord<Events>()` 등록 — `process-video-events`, `process-video-events/cancel`, `modal/processing.done` 3개 이벤트 타입 등록 | V5, V9, V10 |
| `src/inngest/functions.ts` | `concurrency` trigger config → function config 이동 + 글로벌 제한(`limit: 10`) 추가 | R1 |
| `src/inngest/functions.ts` | `cancelOn.match` → `if` + null guard 교체 | R9, R13 |
| `src/inngest/functions.ts` | `onFailure` 핸들러 추가 (`updateMany` + try-catch) | 섹션3, R10 |
| `src/inngest/functions.ts` | catch 블록에서 `status="failed"` DB 업데이트 제거 | Finding A |
| `src/inngest/functions.ts` | `findUniqueOrThrow` → `findUnique` + `NonRetriableError` | 섹션3 |
| `src/inngest/functions.ts` | `console.log("clipCount", ...)` 제거 | Finding B |
| `src/inngest/functions.ts` | `call-modal-endpoint` → `trigger-modal` + `step.waitForEvent("wait-for-modal")` P0 비동기 전환 | 섹션6 |
| `src/inngest/functions.ts` | `trigger-modal` body에 `uploaded_file_id` 포함 | High 이슈 |
| `src/inngest/functions.ts` | timeout 시 `NonRetriableError` 적용 | R3 |
| `src/inngest/functions.ts` | `create-clips-in-db` 완전 리팩터링 — `modalResult.data.clips` 기반, camelCase/snake_case 양쪽 지원 | V3, R26 |
| `src/inngest/functions.ts` | S3 fallback prefix — `split("/")[0]` → `split("/").slice(0, -1).join("/")` | Finding C, R22 |
| `src/inngest/functions.ts` | `StepRunner`, `ProcessVideoEvent`, `ProcessVideoBackendResponse`, `ProcessVideoBackendClip` 커스텀 타입 제거 → SDK 추론 사용 | V5 |
| `src/env.js` | `MODAL_WEBHOOK_SECRET: z.string().optional()` 추가 (server 스키마 + runtimeEnv 매핑 동시) | R7, R23, R24 |
| `src/app/api/webhooks/modal/route.ts` | 신규 생성 — Bearer 토큰 인증, undefined 가드, try-catch 전체 감싸기, `maxDuration = 10`, snake_case `uploaded_file_id` 수신 | 섹션6, R6, R11, R12, R24 |
| `src/fsd/features/upload/api/index.ts` | `reprocessUploadedFile`에 `clipCount: 3` 추가 | R15 |
| `src/fsd/features/upload/api/index.ts` | `removeGeneratedClipsFromS3` prefix 추출 방어적 수정 | R21 |

### ⚠️ P0 배포 순서 — functions.ts 비동기 전환은 반드시 아래 순서 준수

`functions.ts`는 이미 P0 비동기 전환 코드로 교체되었습니다. **백엔드 준비 없이 배포하면 모든 영상 처리가 실패합니다.** (V2 시나리오 A)

| 단계 | 대상 | 작업 | 검증 |
|------|------|------|------|
| **1** | **Backend** | 기존 `process_video` 동기 엔드포인트 **유지** + 새 `trigger_video` 비동기 엔드포인트 **병행 추가** (`@modal.method()` 백그라운드 분리 + webhook 전송 로직 + 실패 시에도 webhook 전송) | 구 동기 엔드포인트 정상 동작 확인 |
| **2** | **Infra** | Vercel에 `MODAL_WEBHOOK_SECRET` 환경 변수 설정 + Modal Secret에 동일 값 + `MODAL_WEBHOOK_CALLBACK_URL` 결정 (방법 A/B 선택) | 환경 변수 존재 확인 후 재배포 |
| **3** | **Frontend** | `PROCESS_VIDEO_ENDPOINT`를 새 트리거 엔드포인트 URL로 변경하여 배포 (`src/inngest/functions.ts`는 이미 수정 완료) | Inngest dev 서버에서 전체 flow 테스트 |
| **4** | **Backend** | 구 `process_video` 동기 엔드포인트 제거 (선택 — 트래픽 없음 확인 후) | 구 엔드포인트 호출 없음 확인 |

> **단계 3 주의**: `PROCESS_VIDEO_ENDPOINT` 환경 변수 변경과 코드 배포를 동시에 진행해야 합니다. Vercel에서 환경 변수 변경 후 재배포가 필요합니다.

### 미완료 항목 (백엔드 또는 별도 작업 필요)

| 항목 | 이유 | 우선순위 |
|------|------|----------|
| Modal `trigger_video` 비동기 엔드포인트 추가 | 백엔드 별도 레포 | P0 |
| Modal `@modal.method()` 백그라운드 분리 + webhook 전송 | 백엔드 별도 레포 | P0 |
| Modal GPU timeout `900` → `1800`+ 상향 | 백엔드 별도 레포 (R4) | P0 |
| `ProcessVideoRequest`에 `uploaded_file_id: str` 추가 | 백엔드 별도 레포 | P0 선행 |
| `MODAL_WEBHOOK_SECRET` 환경 변수 실제 설정 | Vercel/Modal Dashboard | P0 보안 |
| cancel 서버 액션 신규 생성 + DB 상태 업데이트 | 프론트엔드 미구현 기능 (R16, R20) | P1 |
| Webhook relay 시 clip 데이터 직렬화 형식 검증 | Modal API 응답 형식 확인 필요 (R26) | P1 |
| `singleton: { mode: "cancel" }` 추가 | R25 설계 검토 필요 (R8) | P2 |
| `src/actions/` dead code 정리 | 별도 PR 권장 (V6, V7) | P3 |
