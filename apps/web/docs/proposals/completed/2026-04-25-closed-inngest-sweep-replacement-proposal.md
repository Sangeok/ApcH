---
status: "closed"
stage: null
proposal-size: "standard"
created-at: "2026-04-25"
approved-by: null
approved-at: null
approval-scope: null
completed-at: null
verification-summary: null
closed-at: "2026-04-25"
closed-by: "HamSangEok"
closed-reason: "wont-do"
owners: []
related: []
---

# Inngest Sweep Cron 주기 최적화 제안

## 0. 결론

현재 프로젝트 기준으로 `processing-dispatch-sweep`, `upload-draft-sweep`, `stale-processing-sweep` 세 함수를 모두 제거하는 방향은 권장하지 않는다.

세 함수는 단순한 부가 작업이 아니라 다음 상태 회수 책임을 가진다.

- `processing-dispatch-sweep`: `ProcessingDispatch` outbox를 비우고 `process-video-events`를 발행한다.
- `upload-draft-sweep`: S3 업로드는 끝났지만 DB confirm 단계가 끊긴 draft를 회수하고 오래된 draft를 정리한다.
- `stale-processing-sweep`: 외부 Modal/Inngest/네트워크 문제로 `processing`에 고착된 파일을 실패 상태로 회수한다.

다만 세 함수가 모두 매분 실행되는 현재 설정은 과하다. 현재 코드 구조를 유지한다면 아래 조정이 가장 안전하다.

```ts
processingDispatchSweep: "* * * * *"      // 유지
uploadDraftSweep: "*/10 * * * *"          // 10분마다
staleProcessingSweep: "*/15 * * * *"      // 15분마다
```

더 보수적으로는 `uploadDraftSweep`만 `*/5 * * * *`로 둘 수 있다.

핵심 판단:

| 함수 | 현재 주기 | 권장 주기 | 줄였을 때 문제 |
| --- | --- | --- | --- |
| `processing-dispatch-sweep` | 매분 | 매분 유지 | 줄이면 처리 시작 지연, retry/backoff 의미 약화, `pending_enqueue` 체감 증가 |
| `upload-draft-sweep` | 매분 | 5~10분 | recoverable upload 표시가 최대 주기만큼 늦어짐 |
| `stale-processing-sweep` | 매분 | 15~30분 | timeout 실패 처리가 최대 주기만큼 늦어짐 |

## 1. 현재 구조

### 1-1. Inngest 함수 등록

파일: `src/app/api/inngest/route.ts`

현재 네 함수가 Inngest endpoint에 등록되어 있다.

```ts
functions: [
  processVideo,
  processingDispatchSweep,
  uploadDraftSweep,
  staleProcessingSweep,
],
```

### 1-2. 현재 cron 설정

파일: `src/inngest/functions.ts`

```ts
export const processingDispatchSweep = inngest.createFunction(
  { id: "processing-dispatch-sweep" },
  { cron: "* * * * *" },
  async () => ({
    dispatched: await dispatchPendingProcessingRequests(),
  }),
);

export const uploadDraftSweep = inngest.createFunction(
  { id: "upload-draft-sweep" },
  { cron: "* * * * *" },
  async () => {
    const [promoted, cleanedRaw, cleanedRecoverable] = await Promise.all([
      promoteRecoverableUploadDrafts(),
      cleanupStaleRawUploadDrafts(),
      cleanupStaleRecoverableUploadDrafts(),
    ]);

    return { promoted, cleanedRaw, cleanedRecoverable };
  },
);

export const staleProcessingSweep = inngest.createFunction(
  { id: "stale-processing-sweep" },
  { cron: "* * * * *" },
  async () => ({
    recovered: await recoverStaleProcessingAttempts(),
  }),
);
```

### 1-3. 현재 호출량

현재 설정은 사용자 요청이 없어도 최소 아래 수준의 Inngest function run을 만든다.

```text
3 sweep * 1회/분 = 180 runs/hour
180 * 24 = 4,320 runs/day
4,320 * 30 = 약 129,600 runs/month
```

Preview/Production 환경이 모두 sync되어 있으면 환경 수만큼 늘어날 수 있다.

권장 설정으로 바꾸면 대략 아래 수준이 된다.

```text
processing-dispatch-sweep: 60 runs/hour
upload-draft-sweep: 6 runs/hour
stale-processing-sweep: 4 runs/hour
총 70 runs/hour

70 * 24 = 1,680 runs/day
1,680 * 30 = 약 50,400 runs/month
```

기존 대비 약 61% 감소한다.

## 2. `processing-dispatch-sweep`는 매분 유지해야 하는 이유

파일: `src/fsd/features/upload/api/index.ts`

현재 처리 요청은 `requestProcessingAttempt()`에서 바로 `processVideo`를 실행하지 않는다.

흐름:

1. `UploadedFile.status = "pending_enqueue"`로 변경
2. `ProcessingDispatch` row 생성
3. `nudgeProcessingDispatch()` 실행
4. `dispatchPendingProcessingRequests(1)`가 `inngest.send({ name: "process-video-events" })` 호출
5. event 발행 성공 시 `UploadedFile.status = "queued"`로 변경

중요한 점은 `nudgeProcessingDispatch()`가 best-effort라는 것이다.

```ts
async function nudgeProcessingDispatch(): Promise<void> {
  try {
    await dispatchPendingProcessingRequests(1);
  } catch (error) {
    console.error("Best-effort processing dispatch nudge failed", error);
  }
}
```

즉 즉시 dispatch가 실패해도 `requestProcessingAttempt()`는 성공으로 끝날 수 있다. 이때 `processing-dispatch-sweep`가 자동 회수 장치가 된다.

### 2-1. 주기를 줄이면 생기는 문제

파일: `src/fsd/entities/processing-dispatch/api/index.ts`

현재 dispatch retry 정책:

```ts
const DISPATCH_BACKOFF_MS = [30_000, 60_000, 120_000, 300_000, 600_000] as const;
const DISPATCH_STALE_LOCK_MS = 60_000;
const DISPATCH_DEAD_LETTER_AGE_MS = 15 * 60_000;
const MAX_DISPATCH_ATTEMPTS = 10;
```

이 설정은 sweep이 자주 돈다는 전제를 가진다.

주기를 5분으로 늘리면:

- 30초 backoff가 사실상 5분 backoff가 된다.
- 60초 stale lock 회수가 최대 5분 뒤로 밀린다.
- 사용자는 `pending_enqueue` 상태를 최대 5분 이상 볼 수 있다.
- dead-letter 기준은 15분이지만 실제 실패 처리는 15~20분 이상 걸릴 수 있다.

주기를 10분으로 늘리면:

- 첫 자동 회수가 최대 10분 뒤로 밀린다.
- `dispatch_dead_letter` 처리도 20분 이상 밀릴 수 있다.
- 업로드 성공 메시지와 실제 처리 시작 사이의 간극이 커진다.

### 2-2. 결론

`processing-dispatch-sweep`는 현재 outbox 구조의 핵심이다.

따라서 현재 코드를 크게 바꾸지 않는 한 이 함수는 `* * * * *`를 유지한다.

## 3. `upload-draft-sweep`는 5~10분으로 줄여도 되는 이유

파일: `src/fsd/pages/dashboard/model/useUploadPodcast.ts`

정상 업로드 흐름에서는 클라이언트가 S3 업로드 직후 `confirmUploadCompleted()`를 바로 호출한다.

```ts
await uploadFileToS3(file, uploadResult.data.signedUrl);
canAutoDeleteDraft = false;

const confirmResult = await confirmUploadCompleted(createdFileId);
```

따라서 대부분의 파일은 sweep 없이도 `uploaded = true`로 confirm된다.

`upload-draft-sweep`가 필요한 경우는 예외 상황이다.

- DB row는 생성됨
- S3 PUT은 성공함
- 그 직후 브라우저 종료, 네트워크 오류, server action 실패 등으로 confirm이 실행되지 않음

이 경우 `UploadedFile`은 `status = "upload_pending"`, `uploaded = false`로 남는다. `uploadDraftSweep`는 S3 object 존재 여부를 확인해서 `uploaded = true`로 승격한다.

### 3-1. 주기를 줄이면 생기는 변화

`uploadDraftSweep`를 `*/10 * * * *`로 바꾸면 recoverable draft 승격이 최대 10분 늦어진다.

영향:

- Recoverable Uploads UI에 나타나는 시간이 늦어진다.
- 사용자가 S3 업로드 직후 브라우저를 닫았다가 바로 돌아오면 아직 recoverable 목록에 없을 수 있다.
- 정상 업로드 경로에는 영향이 거의 없다.

이것은 기능 장애라기보다 회수 지연이다.

### 3-2. 주의점: promotion과 cleanup이 한 함수에 묶여 있음

현재 `uploadDraftSweep`는 세 작업을 같이 한다.

```ts
const [promoted, cleanedRaw, cleanedRecoverable] = await Promise.all([
  promoteRecoverableUploadDrafts(),
  cleanupStaleRawUploadDrafts(),
  cleanupStaleRecoverableUploadDrafts(),
]);
```

각 작업의 성격은 다르다.

- `promoteRecoverableUploadDrafts`: 사용자 회수 UX와 관련 있음. 너무 늦으면 불편함.
- `cleanupStaleRawUploadDrafts`: 24시간 지난 raw draft 정리. 긴급하지 않음.
- `cleanupStaleRecoverableUploadDrafts`: 7일 지난 recoverable draft 정리. 긴급하지 않음.

이 함수 전체를 하루 1회처럼 크게 줄이면 promotion도 하루 늦어질 수 있어 부적절하다.

현재 구조를 유지한다면 5~10분이 적정하다.

### 3-3. 결론

권장:

```ts
{ cron: "*/10 * * * *" }
```

더 보수적인 UX를 원하면:

```ts
{ cron: "*/5 * * * *" }
```

## 4. `stale-processing-sweep`는 15~30분으로 줄여도 되는 이유

파일: `src/inngest/functions.ts`

현재 stale 기준은 2시간이다.

```ts
async function recoverStaleProcessingAttempts(): Promise<number> {
  const staleBefore = new Date(Date.now() - 2 * 60 * 60 * 1000);
  const staleFiles = await findStaleProcessingUploadedFiles(staleBefore);
  // ...
}
```

즉 이 함수는 실시간 처리가 아니라 2시간 이상 고착된 row를 회수하는 안전망이다.

### 4-1. 주기를 줄이면 생기는 변화

`stale-processing-sweep`를 15분마다 실행하면 실제 실패 처리는 다음처럼 된다.

```text
기존: processing 시작 후 2시간 ~ 2시간 1분 사이
변경: processing 시작 후 2시간 ~ 2시간 15분 사이
```

30분마다 실행하면:

```text
processing 시작 후 2시간 ~ 2시간 30분 사이
```

영향:

- 실패 표시가 늦어진다.
- 사용자가 reprocess를 누를 수 있는 시점이 늦어진다.
- `processing` 상태가 더 오래 보인다.

데이터 정합성 문제는 낮다. 실패 처리 함수는 현재 상태 조건을 걸고 update한다.

```ts
await markUploadedFileAttemptFailed(
  file.id,
  file.currentAttempt,
  "worker_timeout",
  {
    statuses: ["processing"],
  },
);
```

이미 `processed` 또는 `failed`로 바뀐 파일은 이 sweep이 다시 실패 처리하지 않는다.

### 4-2. 결론

권장:

```ts
{ cron: "*/15 * * * *" }
```

더 줄이고 싶다면:

```ts
{ cron: "*/30 * * * *" }
```

다만 사용자에게 실패 상태를 빠르게 보여주고 reprocess를 빨리 열어주고 싶다면 15분이 더 적절하다.

## 5. 권장 코드 변경

파일: `src/inngest/functions.ts`

변경 전:

```ts
export const processingDispatchSweep = inngest.createFunction(
  { id: "processing-dispatch-sweep" },
  { cron: "* * * * *" },
  async () => {
    return {
      dispatched: await dispatchPendingProcessingRequests(),
    };
  },
);

export const uploadDraftSweep = inngest.createFunction(
  { id: "upload-draft-sweep" },
  { cron: "* * * * *" },
  async () => {
    const [promoted, cleanedRaw, cleanedRecoverable] = await Promise.all([
      promoteRecoverableUploadDrafts(),
      cleanupStaleRawUploadDrafts(),
      cleanupStaleRecoverableUploadDrafts(),
    ]);

    return {
      promoted,
      cleanedRaw,
      cleanedRecoverable,
    };
  },
);

export const staleProcessingSweep = inngest.createFunction(
  { id: "stale-processing-sweep" },
  { cron: "* * * * *" },
  async () => {
    return {
      recovered: await recoverStaleProcessingAttempts(),
    };
  },
);
```

변경 후:

```ts
export const processingDispatchSweep = inngest.createFunction(
  { id: "processing-dispatch-sweep" },
  { cron: "* * * * *" },
  async () => {
    return {
      dispatched: await dispatchPendingProcessingRequests(),
    };
  },
);

export const uploadDraftSweep = inngest.createFunction(
  { id: "upload-draft-sweep" },
  { cron: "*/10 * * * *" },
  async () => {
    const [promoted, cleanedRaw, cleanedRecoverable] = await Promise.all([
      promoteRecoverableUploadDrafts(),
      cleanupStaleRawUploadDrafts(),
      cleanupStaleRecoverableUploadDrafts(),
    ]);

    return {
      promoted,
      cleanedRaw,
      cleanedRecoverable,
    };
  },
);

export const staleProcessingSweep = inngest.createFunction(
  { id: "stale-processing-sweep" },
  { cron: "*/15 * * * *" },
  async () => {
    return {
      recovered: await recoverStaleProcessingAttempts(),
    };
  },
);
```

## 6. 예상 영향

### 6-1. 좋은 영향

- Inngest scheduled run 수 감소
- Vercel serverless invocation 감소
- S3 `HeadObject`/`DeleteObject` 호출 감소
- DB 주기 조회 감소
- 기능 구조 변경 없이 적용 가능

### 6-2. 감수해야 할 영향

`upload-draft-sweep`:

- S3 업로드 성공 후 confirm이 끊긴 파일이 Recoverable Uploads에 나타나는 시간이 최대 10분 늦어진다.

`stale-processing-sweep`:

- 2시간 timeout이 실제로는 최대 2시간 15분 뒤에 실패 처리될 수 있다.

`processing-dispatch-sweep`:

- 변경하지 않으므로 기존과 동일하다.

## 7. 운영 모니터링 포인트

변경 후 다음 상태가 늘어나는지 확인한다.

### 7-1. `pending_enqueue`

`processing-dispatch-sweep`는 유지하므로 큰 변화가 없어야 한다.

확인할 것:

- `UploadedFile.status = "pending_enqueue"`가 2~3분 이상 오래 남는 row가 증가하는지
- `ProcessingDispatch.status = "retryable_failed"`가 증가하는지
- `ProcessingDispatch.status = "dead_letter"`가 증가하는지

문제가 생기면 cron 변경 때문이 아니라 Inngest event 발행, key, 네트워크, `/api/inngest` sync 문제일 가능성이 높다.

### 7-2. `upload_pending + uploaded=false`

`upload-draft-sweep`를 10분으로 줄이면 일시적으로 더 오래 남을 수 있다.

정상 범위:

- 생성 후 10분 이내의 `upload_pending + uploaded=false` row

문제 신호:

- S3 object는 존재하는데 10분 이상 `uploaded=false`로 남음
- Recoverable Uploads에 나타나야 할 파일이 계속 안 나타남

### 7-3. `processing`

`stale-processing-sweep`를 15분으로 줄이면 2시간 이상 processing row가 최대 15분 더 남을 수 있다.

정상 범위:

- `processingStartedAt` 기준 2시간 15분 이내

문제 신호:

- 2시간 20분 이상 `processing` 유지
- `worker_timeout` 실패 전환이 전혀 발생하지 않음

## 8. 검증 계획

### 8-1. 정적 검증

```bash
npm run typecheck
npm run build
```

### 8-2. Inngest 함수 등록 확인

배포 후 `/api/inngest` debug endpoint 또는 Inngest dashboard에서 cron schedule이 바뀌었는지 확인한다.

기대:

- `processing-dispatch-sweep`: every minute
- `upload-draft-sweep`: every 10 minutes
- `stale-processing-sweep`: every 15 minutes

### 8-3. 정상 업로드 확인

1. dashboard에서 파일 업로드
2. 업로드 완료 후 즉시 처리 요청
3. `Queue status`에서 `queued` 또는 `processing`으로 넘어가는지 확인

기대:

- `processing-dispatch-sweep`는 그대로 매분이므로 처리 시작 체감은 기존과 같아야 한다.

### 8-4. recoverable upload 확인

시뮬레이션:

1. `generateUploadUrl()`로 DB row 생성
2. S3 PUT 성공
3. `confirmUploadCompleted()` 호출 없이 중단
4. 최대 10분 기다림

기대:

- sweep 이후 `uploaded=true`
- Recoverable Uploads에 표시

### 8-5. stale processing 확인

시뮬레이션:

1. test DB에서 특정 파일을 `status="processing"`, `processingStartedAt=now-2h`로 설정
2. 최대 15분 기다림

기대:

- `status="failed"`
- `failureCode="worker_timeout"`

## 9. 롤백 계획

문제가 생기면 즉시 기존 주기로 되돌린다.

```ts
export const uploadDraftSweep = inngest.createFunction(
  { id: "upload-draft-sweep" },
  { cron: "* * * * *" },
  // ...
);

export const staleProcessingSweep = inngest.createFunction(
  { id: "stale-processing-sweep" },
  { cron: "* * * * *" },
  // ...
);
```

롤백 후 Inngest app resync가 필요하다.

## 10. 후속 개선안

이번 변경은 가장 작은 안전한 최적화다. 이후 더 개선하려면 sweep을 기능별로 분리한다.

### 10-1. `upload-draft-sweep` 분리

현재:

- promotion
- raw cleanup
- recoverable cleanup

권장 분리:

```text
upload-draft-promotion-sweep: */5 * * * *
stale-raw-upload-cleanup: 0 * * * *
stale-recoverable-upload-cleanup: 0 0 * * *
```

이렇게 하면 사용자 회수 UX는 빠르게 유지하면서 cleanup 비용은 더 줄일 수 있다.

## 11. 최종 권장 작업

이번 작업에서는 코드 변경을 아래 두 줄로 제한한다.

```diff
 export const uploadDraftSweep = inngest.createFunction(
   { id: "upload-draft-sweep" },
-  { cron: "* * * * *" },
+  { cron: "*/10 * * * *" },
   async () => {
```

```diff
 export const staleProcessingSweep = inngest.createFunction(
   { id: "stale-processing-sweep" },
-  { cron: "* * * * *" },
+  { cron: "*/15 * * * *" },
   async () => {
```

`processing-dispatch-sweep`는 변경하지 않는다.
