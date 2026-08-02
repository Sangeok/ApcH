# Proposal: `queued` 무한 대기 방지와 디스패치 순서 보정

## 0. TL;DR

현재 프로젝트에서 `original.mp4`가 S3에 정상 업로드되었는데도 업로드가 무한 `Queued` 상태에 남는 핵심 원인은 S3가 아니라 **DB 상태 전이와 Inngest 이벤트 발송 순서의 레이스**다.

현재 디스패처는 다음 순서로 동작한다.

1. `ProcessingDispatch`를 `sending`으로 claim한다.
2. `inngest.send(...)`로 `process-video-events`를 먼저 보낸다.
3. 그 다음 `UploadedFile.status`를 `queued`로 바꾼다.

하지만 `processVideo` 워커는 시작 직후 DB를 다시 읽고, `UploadedFile.status !== "queued"`이면 바로 `skipped: true`로 종료한다. Inngest 이벤트가 2번 직후 너무 빨리 실행되면 DB는 아직 `pending_enqueue`라서 워커가 스킵한다. 이후 디스패처가 DB를 `queued`로 바꾸지만 이벤트는 이미 소비되었고 재발송되지 않는다. 이때 row는 다음 상태로 고착된다.

```sql
UploadedFile.status = 'queued'
UploadedFile.uploaded = true
UploadedFile.queuedAt IS NOT NULL
UploadedFile.processingStartedAt IS NULL
ProcessingDispatch.status = 'sent'
ProcessingDispatch.attempt = UploadedFile.currentAttempt
```

해결은 다음 세 가지를 같이 적용해야 한다.

1. **Inngest 이벤트 발송 전에 `UploadedFile.status = "queued"`를 먼저 확정한다.**
2. **이벤트 발송 실패 또는 dead letter 처리에서 `queued` 상태도 복구/실패 대상으로 포함한다.**
3. **이미 발생한 `queued` 고착 row를 다시 디스패치할 recovery sweep을 추가한다.**
4. **stale queued recovery에는 최대 재발송 횟수와 dead letter 경로를 둬서 무한 재발송을 막는다.**

워커에서 `pending_enqueue`를 잠깐 기다렸다가 재조회하는 보강도 가능하지만, 이번 실제 수정 범위에는 포함하지 않는다. 근본 조치는 디스패처 순서 보정, dispatch 실패 처리 보정, stale queued recovery다.

---

## 1. 현재 실패 모드

### 1-1. 정상 업로드 후 처리 요청 흐름

관련 파일:

- `src/fsd/features/upload/api/index.ts`
- `src/fsd/entities/processing-dispatch/api/index.ts`
- `src/inngest/functions.ts`
- `src/fsd/entities/uploaded-file/api/index.ts`

현재 새 업로드 흐름은 다음과 같다.

1. `prepareUpload()`가 DB에 upload draft를 만든다.
   - `UploadedFile.status = "upload_pending"`
   - `UploadedFile.uploaded = false`
2. 클라이언트가 presigned URL로 S3에 파일을 PUT한다.
   - S3 key 예: `{uuid}/original.mp4`
3. `confirmUploadObjectExists()`가 `HeadObject`로 S3 object 존재를 확인한다.
   - `UploadedFile.uploaded = true`
   - `UploadedFile.status`는 아직 `"upload_pending"`
4. `scheduleUploadedFileProcessing()`가 처리 시도를 만든다.
   - `UploadedFile.status = "pending_enqueue"`
   - `UploadedFile.currentAttempt += 1`
   - `ProcessingDispatch.status = "pending"`
5. `dispatchPendingProcessingRequests()`가 pending dispatch를 Inngest로 보낸다.

### 1-2. 문제가 되는 현재 디스패처 순서

현재 `dispatchPendingProcessingRequests()` 안의 핵심 순서는 다음과 같다.

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

await db.$transaction(async (tx) => {
  await markProcessingDispatchSent(dispatch.id, { tx, now });
  await markUploadedFileQueuedFromDispatch(dispatch.uploadedFile.id, dispatch.attempt, {
    tx,
    now,
  });
});
```

즉, 이벤트가 먼저 나가고 `queued` 상태 기록은 나중에 된다.

### 1-3. 워커의 즉시 스킵 조건

`src/inngest/functions.ts`의 `processVideo`는 시작하자마자 현재 attempt의 DB 상태를 읽는다.

```ts
const context = await step.run("load-processing-context", async () => {
  return findCurrentProcessingAttemptContext(uploadedFileId, attempt);
});

if (context?.status !== "queued") {
  return { skipped: true };
}
```

따라서 Inngest가 이벤트를 빠르게 실행하면, 워커가 아직 `pending_enqueue`인 상태를 보고 정상 이벤트를 스스로 버린다.

### 1-4. 왜 자동 복구되지 않는가

현재 복구 로직은 `processing` 상태만 본다.

```ts
async function recoverStaleProcessingAttempts(): Promise<number> {
  const staleBefore = new Date(Date.now() - 2 * 60 * 60 * 1000);
  const staleFiles = await findStaleProcessingUploadedFiles(staleBefore);
  ...
}
```

`findStaleProcessingUploadedFiles()`도 다음 조건만 조회한다.

```ts
where: {
  status: "processing",
  processingStartedAt: {
    lt: staleBefore,
  },
}
```

그래서 `status = "queued"`이고 `processingStartedAt IS NULL`인 row는 영원히 recovery 대상이 아니다.

---

## 2. 목표 상태 전이 불변식

이 문제를 막으려면 다음 규칙을 코드 레벨에서 지켜야 한다.

### 2-1. 이벤트보다 DB 상태가 먼저다

`process-video-events`를 보낼 때는 워커가 즉시 실행되어도 항상 다음 조건이 참이어야 한다.

```sql
UploadedFile.status = 'queued'
UploadedFile.currentAttempt = event.data.attempt
UploadedFile.uploaded = true
```

즉, `inngest.send(...)` 호출 전에 `UploadedFile.status = "queued"`가 DB에 먼저 commit되어 있어야 한다.

### 2-2. `queued`는 dispatch retry 대상이어야 한다

순서를 바꾸면 `UploadedFile.status = "queued"`가 된 뒤 `inngest.send(...)`가 실패할 수 있다. 이 경우 업로드 파일은 `queued`로 보이지만 `ProcessingDispatch.status`는 `retryable_failed`여야 하며, 기존 dispatch sweep이 다시 전송해야 한다.

따라서 dispatch 실패 처리에서 `queued`를 실패/복구 대상으로 포함해야 한다.

현재 dead letter 처리:

```ts
statuses: ["pending_enqueue"]
```

변경 후:

```ts
statuses: ["pending_enqueue", "queued"]
```

### 2-3. `queued` 고착 row는 별도 recovery 대상이어야 한다

이미 이벤트가 유실되었거나 과거 race로 워커가 스킵한 row는 다음 조건으로 탐지해야 한다.

```sql
UploadedFile.status = 'queued'
UploadedFile.processingStartedAt IS NULL
UploadedFile.queuedAt < now - threshold
ProcessingDispatch.status = 'sent'
ProcessingDispatch.attempt = UploadedFile.currentAttempt
```

이 row는 `ProcessingDispatch.status`를 `retryable_failed`로 되돌리고 `nextRetryAt = now()`로 설정해서 기존 `dispatchPendingProcessingRequests()`가 다시 이벤트를 보내게 한다.

단, 같은 user에 이미 `processing` 중인 업로드가 있으면 Inngest concurrency 때문에 정상 대기일 수 있으므로 recovery 대상에서 제외해야 한다.

또한 이 recovery는 무한히 반복되면 안 된다. `dispatchCount` 또는 `ProcessingDispatch.createdAt` 기준으로 한계를 넘은 row는 더 이상 재발송하지 말고 `UploadedFile.status = "failed"`, `UploadedFile.failureCode = "queued_worker_not_started"`, `ProcessingDispatch.status = "dead_letter"`로 닫아야 한다.

---

## 3. 구현 계획

## Phase 1. 디스패처 순서 보정

### Step 1. `UploadedFile`를 dispatch 전에 `queued`로 보장하는 helper 추가

대상 파일:

- `src/fsd/entities/uploaded-file/api/index.ts`
- `src/fsd/entities/uploaded-file/index.ts`

기존 `markUploadedFileQueuedFromDispatch()`는 `pending_enqueue`만 `queued`로 바꾸고 결과를 호출부에서 해석하지 않는다. retry 상황에서는 이미 `queued`일 수 있으므로, 호출부가 명확하게 판단할 수 있는 helper를 추가하는 편이 안전하다.

권장 helper:

```ts
type EnsureUploadedFileQueuedForDispatchResult =
  | { status: "queued" }
  | { status: "already_advanced"; currentStatus: ProcessingStatus }
  | { status: "not_found" }
  | {
      status: "not_queueable";
      currentStatus: string;
      uploaded: boolean;
    };

export async function ensureUploadedFileQueuedForDispatch(
  uploadedFileId: string,
  attempt: number,
  options?: { tx?: Prisma.TransactionClient; now?: Date },
): Promise<EnsureUploadedFileQueuedForDispatchResult> {
  const now = options?.now ?? new Date();
  const client = getClient(options?.tx);

  const queued = await client.uploadedFile.updateMany({
    where: {
      id: uploadedFileId,
      currentAttempt: attempt,
      status: "pending_enqueue",
      uploaded: true,
    },
    data: {
      status: "queued",
      queuedAt: now,
    },
  });

  if (queued.count === 1) {
    return { status: "queued" };
  }

  const current = await client.uploadedFile.findFirst({
    where: {
      id: uploadedFileId,
      currentAttempt: attempt,
    },
    select: {
      status: true,
      uploaded: true,
    },
  });

  if (!current) {
    return { status: "not_found" };
  }

  if (current.status === "queued") {
    return { status: "queued" };
  }

  if (
    current.status === "processing" ||
    current.status === "processed" ||
    current.status === "failed" ||
    current.status === "no credits"
  ) {
    return {
      status: "already_advanced",
      currentStatus: current.status,
    };
  }

  return {
    status: "not_queueable",
    currentStatus: current.status,
    uploaded: current.uploaded,
  };
}
```

이 helper의 의도:

- `pending_enqueue + uploaded=true`이면 최초로 `queued`로 전환한다.
- 이미 `queued`이면 retry 상황으로 보고 정상 처리한다.
- 이미 `processing`, `processed`, `failed`, `no credits`이면 이전 이벤트가 이미 진행된 것이므로 dispatch row만 닫을 수 있게 한다.
- `upload_pending`, `pending_enqueue + uploaded=false`, attempt mismatch 등은 정상 전송 가능한 상태가 아니다.

`src/fsd/entities/uploaded-file/index.ts`에도 export를 추가한다.

```ts
export {
  ...
  ensureUploadedFileQueuedForDispatch,
  ...
} from "./api";
```

기존 `markUploadedFileQueuedFromDispatch()`는 바로 제거하지 말고, 이번 변경에서 더 이상 쓰지 않게 만든 뒤 후속 cleanup에서 삭제해도 된다.

### Step 2. `dispatchPendingProcessingRequests()` 순서 변경

대상 파일:

- `src/fsd/entities/processing-dispatch/api/index.ts`

import 변경:

```ts
import {
  ensureUploadedFileQueuedForDispatch,
  markUploadedFileAttemptFailed,
} from "~/fsd/entities/uploaded-file";
```

기존:

```ts
await inngest.send(...);

await db.$transaction(async (tx) => {
  await markProcessingDispatchSent(dispatch.id, { tx, now });
  await markUploadedFileQueuedFromDispatch(dispatch.uploadedFile.id, dispatch.attempt, {
    tx,
    now,
  });
});
```

변경 후 구조:

```ts
const queueResult = await ensureUploadedFileQueuedForDispatch(
  dispatch.uploadedFile.id,
  dispatch.attempt,
  { now },
);

if (queueResult.status === "already_advanced") {
  await markProcessingDispatchSent(dispatch.id, { now });
  continue;
}

if (queueResult.status !== "queued") {
  throw new Error(
    `Upload is not queueable for dispatch: ${queueResult.status}`,
  );
}

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

await markProcessingDispatchSent(dispatch.id, { now });

dispatchedCount += 1;
```

중요한 점:

- `ensureUploadedFileQueuedForDispatch()`가 먼저 성공해야 `inngest.send(...)`를 호출한다.
- `markProcessingDispatchSent()`는 이벤트 발송 성공 후에만 실행한다.
- `already_advanced`는 이전 이벤트가 이미 실행된 retry/중복 상황으로 보고 dispatch row를 `sent`로 닫는다.
- `not_queueable`은 throw해서 기존 retry/dead letter 경로를 타게 한다.

### Step 3. process crash window 허용

순서 변경 후 다음 window가 생긴다.

1. `ProcessingDispatch.status = "sending"`
2. `UploadedFile.status = "queued"`
3. 서버 프로세스가 `inngest.send(...)` 전에 죽음

이 경우 현재 코드의 `DISPATCH_STALE_LOCK_MS = 60_000`가 이미 안전장치 역할을 한다. `sending` 상태가 60초 넘게 stale이면 다음 sweep에서 다시 claim한다.

따라서 별도 테이블 추가 없이 기존 lock recovery를 그대로 활용할 수 있다.

---

## Phase 2. dispatch 실패 처리 보정

### Step 4. dead letter에서 `queued`도 실패 처리

대상 파일:

- `src/fsd/entities/processing-dispatch/api/index.ts`

현재 catch block의 dead letter 처리:

```ts
await markUploadedFileAttemptFailed(
  dispatch.uploadedFile.id,
  dispatch.attempt,
  "dispatch_dead_letter",
  {
    tx,
    now,
    statuses: ["pending_enqueue"],
  },
);
```

변경:

```ts
await markUploadedFileAttemptFailed(
  dispatch.uploadedFile.id,
  dispatch.attempt,
  "dispatch_dead_letter",
  {
    tx,
    now,
    statuses: ["pending_enqueue", "queued"],
  },
);
```

이유:

- `queued`를 이벤트 발송 전에 먼저 기록하므로, 발송 실패가 반복되면 upload row는 `queued` 상태일 수 있다.
- dead letter 시 `queued`도 `failed`로 닫아야 UI가 무한 대기하지 않는다.

### Step 5. retryable failure에서는 upload status를 되돌리지 않는다

`inngest.send(...)`가 일시적으로 실패한 경우 `ProcessingDispatch.status = "retryable_failed"`가 되고, `UploadedFile.status = "queued"`는 그대로 둔다.

이 상태는 의도된 상태다.

```sql
UploadedFile.status = 'queued'
ProcessingDispatch.status = 'retryable_failed'
ProcessingDispatch.nextRetryAt <= now()
```

다음 dispatch sweep이 같은 dispatch row를 다시 claim하고 이벤트를 다시 보낸다. 이때 `ensureUploadedFileQueuedForDispatch()`는 이미 `queued`인 상태를 정상으로 취급해야 한다.

---

## Phase 3. 기존 `queued` 고착 row 복구

순서 보정은 앞으로의 race를 막지만, 이미 발생한 row는 자동으로 복구되지 않는다. 기존 고착 row와 미래의 알 수 없는 이벤트 유실을 위해 recovery sweep을 추가한다.

### Step 6. stale queued dispatch 조회 함수 추가

대상 파일:

- `src/fsd/entities/processing-dispatch/api/index.ts`
- `src/fsd/entities/processing-dispatch/index.ts`

추가할 함수 예시:

```ts
type StaleQueuedSentProcessingDispatch = {
  id: string;
  attempt: number;
  dispatchCount: number;
  createdAt: Date;
  uploadedFile: {
    id: string;
    userId: string;
    currentAttempt: number;
  };
};

export async function findStaleQueuedSentProcessingDispatches(
  staleBefore: Date,
  limit = 25,
): Promise<StaleQueuedSentProcessingDispatch[]> {
  const rows = await db.$queryRaw<
    Array<{
      id: string;
      attempt: number;
      dispatchCount: number;
      createdAt: Date;
      uploadedFileId: string;
      userId: string;
      currentAttempt: number;
    }>
  >`
    SELECT
      pd.id,
      pd.attempt,
      pd."dispatchCount",
      pd."createdAt",
      uf.id AS "uploadedFileId",
      uf."userId",
      uf."currentAttempt"
    FROM "UploadedFile" uf
    JOIN "ProcessingDispatch" pd
      ON pd."uploadedFileId" = uf.id
     AND pd.attempt = uf."currentAttempt"
    WHERE uf.status = 'queued'
      AND uf.uploaded = true
      AND uf."processingStartedAt" IS NULL
      AND uf."queuedAt" < ${staleBefore}
      AND pd.status = 'sent'
      AND NOT EXISTS (
        SELECT 1
        FROM "UploadedFile" active
        WHERE active."userId" = uf."userId"
          AND active.status = 'processing'
      )
    ORDER BY uf."queuedAt" ASC
    LIMIT ${limit}
  `;

  return rows.map((row) => ({
    id: row.id,
    attempt: row.attempt,
    dispatchCount: row.dispatchCount,
    createdAt: row.createdAt,
    uploadedFile: {
      id: row.uploadedFileId,
      userId: row.userId,
      currentAttempt: row.currentAttempt,
    },
  }));
}
```

Prisma relation filter 안에서 `ProcessingDispatch.attempt = UploadedFile.currentAttempt` 같은 field-to-field 비교를 직접 하기 어렵다. 이 조회는 `limit`이 걸리는 recovery 대상 선별이므로, `findMany()`로 후보를 먼저 가져온 뒤 JS에서 attempt를 필터링하면 안 된다. current attempt와 맞지 않는 이전 dispatch 또는 current attempt에 `sent` dispatch가 없는 파일이 `take(limit)`을 잠식해서 실제 복구 대상이 계속 밀릴 수 있기 때문이다.

따라서 이 함수는 `$queryRaw`를 사용해 DB join 단계에서 `pd.attempt = uf."currentAttempt"`와 `NOT EXISTS active processing` 조건을 적용한 뒤 `LIMIT`을 걸어야 한다. 위 SQL은 4-2 진단 SQL의 실제 복구 대상 조건을 코드로 옮긴 것이다. 같은 user의 정상 대기 row를 `LIMIT` 전에 제외해야 정상 대기 row가 앞쪽 후보를 계속 차지해서 실제 고착 row 복구가 밀리는 일을 막을 수 있다.

`dispatchCount`와 `createdAt`은 stale queued recovery가 무한 재발송으로 빠지는 것을 막기 위해 필요하다. 조회 함수는 복구 대상 후보를 찾는 역할만 하고, 재발송할지 dead letter로 닫을지는 recovery 함수에서 결정한다.

### Step 7. sent dispatch를 retryable로 되돌리는 함수 추가

대상 파일:

- `src/fsd/entities/processing-dispatch/api/index.ts`

추가할 함수 예시:

```ts
export async function markProcessingDispatchRetryableNow(
  args: {
    dispatchId: string;
    uploadedFileId: string;
    attempt: number;
    errorMessage: string;
    now?: Date;
  },
) {
  const now = args.now ?? new Date();

  return db.processingDispatch.updateMany({
    where: {
      id: args.dispatchId,
      uploadedFileId: args.uploadedFileId,
      attempt: args.attempt,
      status: "sent",
      uploadedFile: {
        is: {
          currentAttempt: args.attempt,
          status: "queued",
          processingStartedAt: null,
        },
      },
    },
    data: {
      status: "retryable_failed",
      lastError: args.errorMessage,
      nextRetryAt: now,
      lockedAt: null,
      dispatchedAt: null,
    },
  });
}
```

이 함수는 event redelivery를 유도하기 위한 함수다. upload row 자체는 `queued`로 유지한다.

조회 후 update 사이에 upload row가 이미 `processing`, `processed`, `failed`로 진행될 수 있으므로 `id + status = sent`만 조건으로 쓰면 안 된다. 반드시 `uploadedFileId`, `attempt`, relation filter의 `status = "queued"`, `processingStartedAt = null`, `currentAttempt = attempt`까지 같이 걸어야 불필요한 재발송을 막을 수 있다.

추가로 stale queued recovery가 한계를 넘었을 때 닫는 helper도 둔다.

```ts
export async function markStaleQueuedDispatchDeadLetter(args: {
  dispatchId: string;
  uploadedFileId: string;
  attempt: number;
  errorMessage: string;
  now?: Date;
}) {
  const now = args.now ?? new Date();

  return db.$transaction(async (tx) => {
    const deadLetteredDispatch = await tx.processingDispatch.updateMany({
      where: {
        id: args.dispatchId,
        uploadedFileId: args.uploadedFileId,
        attempt: args.attempt,
        status: "sent",
        uploadedFile: {
          is: {
            id: args.uploadedFileId,
            currentAttempt: args.attempt,
            status: "queued",
            processingStartedAt: null,
          },
        },
      },
      data: {
        status: "dead_letter",
        lastError: args.errorMessage,
        nextRetryAt: null,
        lockedAt: null,
        dispatchedAt: now,
      },
    });

    if (deadLetteredDispatch.count !== 1) {
      return { count: 0 };
    }

    const failedFile = await tx.uploadedFile.updateMany({
      where: {
        id: args.uploadedFileId,
        currentAttempt: args.attempt,
        status: "queued",
        processingStartedAt: null,
        dispatches: {
          some: {
            id: args.dispatchId,
            attempt: args.attempt,
            status: "dead_letter",
          },
        },
      },
      data: {
        status: "failed",
        terminalStatusAt: now,
        failureCode: "queued_worker_not_started",
      },
    });

    if (failedFile.count !== 1) {
      throw new Error(
        `Failed to mark queued upload as failed after dead-lettering dispatch ${args.dispatchId}`,
      );
    }

    return { count: 1 };
  });
}
```

이 helper는 `queued` 상태에서 worker가 계속 시작되지 않는 row를 최종 실패로 닫는다. `failureCode`는 dispatch 발송 실패와 구분되도록 `"queued_worker_not_started"`를 사용한다.

중요한 점:

- `ProcessingDispatch` update 결과가 `1`이 아니면 이미 다른 실행이 처리한 것으로 보고 `{ count: 0 }`을 반환한다.
- `ProcessingDispatch`를 `dead_letter`로 바꾼 뒤 `UploadedFile` update가 실패하면 예외를 던진다. 트랜잭션이 rollback되어 dispatch만 `dead_letter`로 남는 부분 성공을 막기 위해서다.
- recovery loop에서는 이 helper 호출을 dispatch별 `try/catch`로 감싸서 한 row의 예외가 전체 sweep을 중단하지 않게 한다.

새 failure code는 detail timeline에도 노출해야 한다.

대상 파일:

- `src/fsd/pages/upload-detail/ui/_component/ProcessingTimeline.tsx`

추가할 라벨:

```ts
case "queued_worker_not_started":
  return "Worker did not start";
```

### Step 8. 같은 user의 정상 processing 여부 확인 helper 추가

대상 파일:

- `src/fsd/entities/uploaded-file/api/index.ts`

추가할 함수 예시:

```ts
export async function hasProcessingUploadForUser(userId: string): Promise<boolean> {
  const count = await db.uploadedFile.count({
    where: {
      userId,
      status: "processing",
    },
  });

  return count > 0;
}
```

이 helper는 Inngest concurrency 때문에 정상적으로 대기 중인 queued upload를 불필요하게 redeliver하지 않기 위해 사용한다. `findStaleQueuedSentProcessingDispatches()`의 raw SQL에서도 같은 조건을 `LIMIT` 전에 적용하지만, 조회 후 update 사이에 같은 user의 다른 upload가 `processing`으로 진입할 수 있으므로 recovery loop의 2차 확인으로도 유지한다.

현재 `processVideo`는 다음 concurrency 설정을 사용한다.

```ts
concurrency: {
  limit: 1,
  key: "event.data.userId",
}
```

따라서 같은 user에게 이미 `processing` 중인 파일이 있으면, 다른 파일이 `queued`이고 `processingStartedAt = null`이어도 정상일 수 있다.

### Step 9. stale queued recovery sweep 추가

대상 파일:

- `src/inngest/functions.ts`

기존 `staleProcessingSweep`에 같이 붙이는 방식을 권장한다. 이미 `cron: "*/15 * * * *"`로 15분마다 실행되고 있으므로 별도 Inngest function을 만들지 않아도 된다.

import 추가:

```ts
import {
  dispatchPendingProcessingRequests,
  findStaleQueuedSentProcessingDispatches,
  markProcessingDispatchRetryableNow,
  markStaleQueuedDispatchDeadLetter,
} from "~/fsd/entities/processing-dispatch";
```

`uploaded-file` entity import에도 `hasProcessingUploadForUser`를 추가한다.

```ts
import {
  ...
  hasProcessingUploadForUser,
  ...
} from "~/fsd/entities/uploaded-file";
```

추가할 recovery 함수 예시:

```ts
const STALE_QUEUED_DISPATCH_INTERVAL_MS = 15 * 60 * 1000;
const STALE_QUEUED_DISPATCH_DEAD_LETTER_MS = 2 * 60 * 60 * 1000;
const STALE_QUEUED_MAX_DISPATCH_COUNT = 10;

async function recoverStaleQueuedDispatches(): Promise<number> {
  const now = new Date();
  const staleBefore = new Date(
    now.getTime() - STALE_QUEUED_DISPATCH_INTERVAL_MS,
  );
  const dispatches = await findStaleQueuedSentProcessingDispatches(staleBefore);
  let recovered = 0;

  for (const dispatch of dispatches) {
    try {
      const userHasProcessingUpload = await hasProcessingUploadForUser(
        dispatch.uploadedFile.userId,
      );

      if (userHasProcessingUpload) {
        continue;
      }

      const shouldDeadLetter =
        dispatch.dispatchCount >= STALE_QUEUED_MAX_DISPATCH_COUNT ||
        now.getTime() - dispatch.createdAt.getTime() >=
          STALE_QUEUED_DISPATCH_DEAD_LETTER_MS;

      const result = shouldDeadLetter
        ? await markStaleQueuedDispatchDeadLetter({
            dispatchId: dispatch.id,
            uploadedFileId: dispatch.uploadedFile.id,
            attempt: dispatch.attempt,
            errorMessage: "queued_worker_not_started",
            now,
          })
        : await markProcessingDispatchRetryableNow({
            dispatchId: dispatch.id,
            uploadedFileId: dispatch.uploadedFile.id,
            attempt: dispatch.attempt,
            errorMessage: "queued_worker_not_started",
            now,
          });

      recovered += result.count;
    } catch (error) {
      console.error("Failed to recover stale queued dispatch", {
        dispatchId: dispatch.id,
        uploadedFileId: dispatch.uploadedFile.id,
        attempt: dispatch.attempt,
        error,
      });
    }
  }

  return recovered;
}
```

여기서는 `dispatchPendingProcessingRequests(recovered)`를 바로 호출하지 않는다. 기존 `processingDispatchSweep`가 1분마다 `retryable_failed` row를 가져가므로 충분하다. 즉시 호출을 넣어도 전체 eligible dispatch를 `createdAt asc`로 가져오기 때문에 방금 복구한 row가 반드시 선택된다는 보장이 없다. 즉시 재발송을 보장하고 싶다면 특정 dispatch id 목록만 보내는 targeted dispatcher를 별도로 만들어야 한다.

기존 sweep 반환값 변경:

```ts
export const staleProcessingSweep = inngest.createFunction(
  { id: "stale-processing-sweep" },
  { cron: "*/15 * * * *" },
  async () => {
    const processingRecovered = await recoverStaleProcessingAttempts();
    const queuedRecovered = await recoverStaleQueuedDispatches();

    return {
      processingRecovered,
      queuedRecovered,
    };
  },
);
```

주의:

- `recoverStaleProcessingAttempts()`와 `recoverStaleQueuedDispatches()`는 병렬로 실행하지 않는다. 같은 user의 stale `processing` row가 먼저 `failed`로 닫혀야 queued recovery가 정상 대기와 고착 상태를 정확히 구분할 수 있다.
- stale queued recovery는 `retryable_failed`로만 되돌리고, 실제 재발송은 다음 `processingDispatchSweep`에 맡긴다.
- `STALE_QUEUED_MAX_DISPATCH_COUNT` 또는 `STALE_QUEUED_DISPATCH_DEAD_LETTER_MS`를 넘으면 더 이상 재발송하지 않고 `failed`로 닫는다.
- threshold는 최소 15분을 권장한다. 너무 짧으면 정상적인 Inngest 대기와 구분하기 어렵다.

---

## Phase 4. 워커 쪽 보강

이 단계는 **이번 실제 수정 범위에서 제외하는 후속 선택 사항**이다.

디스패처 순서 보정이 근본 해결이고, stale queued recovery가 이미 과거 고착 row와 이벤트 유실을 복구한다. 따라서 워커 진입부까지 같이 바꾸면 수정 범위가 불필요하게 커진다. 특히 `context`를 `let`으로 바꾸면 이후 `send-to-modal`, clip persistence, credit deduction 등 async closure에서 `processingContext`를 쓰도록 여러 사용처를 함께 바꿔야 한다.

다만 배포 중 구버전 이벤트 또는 외부에서 직접 보낸 이벤트까지 더 관대하게 받고 싶다면 아래 보강을 후속 작업으로 검토할 수 있다.

대상 파일:

- `src/inngest/functions.ts`

현재:

```ts
if (context?.status !== "queued") {
  return { skipped: true };
}
```

선택 보강안:

```ts
let context = await step.run("load-processing-context", async () => {
  return findCurrentProcessingAttemptContext(uploadedFileId, attempt);
});

if (context?.status === "pending_enqueue") {
  await step.sleep("wait-for-queued-state", "5s");

  const refreshedContext = await step.run(
    "reload-processing-context-after-queue-wait",
    async () => findCurrentProcessingAttemptContext(uploadedFileId, attempt),
  );

  if (refreshedContext?.status !== "queued") {
    return { skipped: true };
  }

  context = refreshedContext;
}

if (context?.status !== "queued") {
  return { skipped: true };
}

const processingContext = context;
```

이후 `send-to-modal`, clip persistence, credit deduction 등 async closure 안에서는 `context`를 직접 쓰지 말고 `processingContext`를 사용한다.

예:

```ts
s3_key: processingContext.s3Key;
userId: processingContext.userId;
```

`context`를 `let`으로 재할당하면 TypeScript가 이후 async closure 안에서 null 가능성을 다시 넓게 볼 수 있다. 최종 guard 직후 `const processingContext = context`로 고정하면 `context is possibly null` 류의 타입 오류를 피할 수 있다.

권장 우선순위:

1. 반드시 적용: 디스패처 순서 보정
2. 반드시 적용: dead letter status 보정
3. 반드시 적용: stale queued recovery
4. 이번 수정에서는 적용하지 않음: 워커 진입부 1회 wait/reload

워커 보강만 단독으로 적용하는 것은 근본 해결이 아니다. 이벤트가 이미 스킵된 뒤 `queued`로 고착된 기존 row는 그래도 복구되지 않는다.

---

## 4. 기존 운영 데이터 진단 SQL

### 4-1. 현재 고착 row 조회

```sql
SELECT
  uf.id,
  uf."userId",
  uf."currentAttempt",
  uf.status AS uploaded_file_status,
  uf.uploaded,
  uf."queuedAt",
  uf."processingStartedAt",
  uf."updatedAt",
  pd.id AS dispatch_id,
  pd.status AS dispatch_status,
  pd.attempt AS dispatch_attempt,
  pd."dispatchCount",
  pd."dispatchedAt",
  pd."lastError"
FROM "UploadedFile" uf
JOIN "ProcessingDispatch" pd
  ON pd."uploadedFileId" = uf.id
 AND pd.attempt = uf."currentAttempt"
WHERE uf.status = 'queued'
  AND uf.uploaded = true
  AND uf."processingStartedAt" IS NULL
  AND uf."queuedAt" < NOW() - INTERVAL '15 minutes'
  AND pd.status = 'sent'
ORDER BY uf."queuedAt" ASC;
```

### 4-2. 같은 user에 processing 중인 파일이 없는 고착 row만 조회

```sql
SELECT
  uf.id,
  uf."userId",
  uf."currentAttempt",
  uf."queuedAt",
  pd.id AS dispatch_id,
  pd.status AS dispatch_status
FROM "UploadedFile" uf
JOIN "ProcessingDispatch" pd
  ON pd."uploadedFileId" = uf.id
 AND pd.attempt = uf."currentAttempt"
WHERE uf.status = 'queued'
  AND uf.uploaded = true
  AND uf."processingStartedAt" IS NULL
  AND uf."queuedAt" < NOW() - INTERVAL '15 minutes'
  AND pd.status = 'sent'
  AND NOT EXISTS (
    SELECT 1
    FROM "UploadedFile" active
    WHERE active."userId" = uf."userId"
      AND active.status = 'processing'
  )
ORDER BY uf."queuedAt" ASC;
```

이 조회 결과가 실제 복구 대상이다.

### 4-3. 수동 복구 SQL

코드 배포 전에 긴급 복구가 필요하면 dispatch row를 retryable로 되돌린다.

```sql
UPDATE "ProcessingDispatch" pd
SET
  status = 'retryable_failed',
  "lastError" = 'manual_requeue_queued_worker_not_started',
  "nextRetryAt" = NOW(),
  "lockedAt" = NULL,
  "dispatchedAt" = NULL
FROM "UploadedFile" uf
WHERE pd."uploadedFileId" = uf.id
  AND pd.attempt = uf."currentAttempt"
  AND uf.status = 'queued'
  AND uf.uploaded = true
  AND uf."processingStartedAt" IS NULL
  AND uf."queuedAt" < NOW() - INTERVAL '15 minutes'
  AND pd.status = 'sent'
  AND NOT EXISTS (
    SELECT 1
    FROM "UploadedFile" active
    WHERE active."userId" = uf."userId"
      AND active.status = 'processing'
  );
```

이 SQL은 `UploadedFile.status`를 바꾸지 않는다. upload row는 계속 `queued`로 남고, dispatch sweep이 이벤트만 다시 보낸다.

---

## 5. 테스트 계획

### 5-1. 정적 확인

변경 후 다음 조건을 확인한다.

- `dispatchPendingProcessingRequests()` 안에서 `inngest.send(...)`보다 `ensureUploadedFileQueuedForDispatch(...)`가 먼저 호출된다.
- `markProcessingDispatchSent(...)`는 `inngest.send(...)` 성공 후 호출된다.
- dispatch dead letter에서 `statuses: ["pending_enqueue", "queued"]`를 사용한다.
- `queued + processingStartedAt IS NULL + sent dispatch`를 복구하는 sweep이 존재한다.
- stale queued 조회는 `$queryRaw`로 `pd.attempt = uf."currentAttempt"`와 `NOT EXISTS active processing`을 DB 단계에서 적용한 뒤 `LIMIT`을 건다.
- stale queued recovery에 `STALE_QUEUED_MAX_DISPATCH_COUNT` 또는 `STALE_QUEUED_DISPATCH_DEAD_LETTER_MS` 기반 dead letter 경로가 존재한다.
- `staleProcessingSweep`는 stale processing 복구를 먼저 실행하고, 그 다음 stale queued 복구를 실행한다.
- `markStaleQueuedDispatchDeadLetter()`는 dispatch update와 upload update 결과를 모두 확인하며, 둘 중 하나만 반영되는 부분 성공을 만들지 않는다.
- `"queued_worker_not_started"`가 `ProcessingTimeline`의 실패 라벨에 표시된다.

### 5-2. 수동 시나리오 테스트

#### 신규 업로드 정상 처리

1. 대시보드에서 새 mp4를 업로드한다.
2. S3 PUT 성공 후 DB 상태를 확인한다.

```sql
SELECT id, status, uploaded, "currentAttempt", "queuedAt", "processingStartedAt"
FROM "UploadedFile"
ORDER BY "createdAt" DESC
LIMIT 5;
```

기대 흐름:

- `upload_pending`
- `pending_enqueue`
- `queued`
- `processing`
- `processed` 또는 `failed`

#### dispatch send 실패 재시도

개발 환경에서 `inngest.send(...)` 직전에 강제로 throw하거나 Inngest 연결을 끊어서 확인한다.

기대 상태:

```sql
UploadedFile.status = 'queued'
ProcessingDispatch.status = 'retryable_failed'
ProcessingDispatch.nextRetryAt IS NOT NULL
```

이후 연결을 복구하면 sweep이 다시 보내고 `processing`으로 전환되어야 한다.

#### dead letter

`inngest.send(...)`가 계속 실패하도록 만든 뒤 `MAX_DISPATCH_ATTEMPTS` 또는 `DISPATCH_DEAD_LETTER_AGE_MS` 조건을 만족시킨다.

기대 상태:

```sql
UploadedFile.status = 'failed'
UploadedFile.failureCode = 'dispatch_dead_letter'
ProcessingDispatch.status = 'dead_letter'
```

중요: 이때 `UploadedFile.status`가 `queued`에서 `failed`로 닫혀야 한다.

#### 기존 stuck row 복구

테스트 DB에서 다음 상태를 만든다.

```sql
UPDATE "UploadedFile"
SET
  status = 'queued',
  uploaded = true,
  "queuedAt" = NOW() - INTERVAL '30 minutes',
  "processingStartedAt" = NULL
WHERE id = '<uploaded-file-id>';

UPDATE "ProcessingDispatch"
SET
  status = 'sent',
  "dispatchedAt" = NOW() - INTERVAL '30 minutes',
  "nextRetryAt" = NULL,
  "lockedAt" = NULL
WHERE "uploadedFileId" = '<uploaded-file-id>'
  AND attempt = (
    SELECT "currentAttempt"
    FROM "UploadedFile"
    WHERE id = '<uploaded-file-id>'
  );
```

`staleProcessingSweep` 실행 후 기대 상태:

```sql
ProcessingDispatch.status = 'retryable_failed'
ProcessingDispatch.nextRetryAt <= NOW()
```

그리고 dispatch sweep 실행 후 Inngest 이벤트가 다시 발송되어야 한다.

#### stale queued dead letter

같은 stuck row에서 `ProcessingDispatch.dispatchCount`를 `STALE_QUEUED_MAX_DISPATCH_COUNT` 이상으로 만들거나 `ProcessingDispatch.createdAt`을 `STALE_QUEUED_DISPATCH_DEAD_LETTER_MS`보다 오래되게 만든다.

기대 상태:

```sql
UploadedFile.status = 'failed'
UploadedFile.failureCode = 'queued_worker_not_started'
ProcessingDispatch.status = 'dead_letter'
```

이 테스트가 통과해야 stale queued recovery가 무한 재발송하지 않는다고 볼 수 있다.

### 5-3. build 확인

변경 후 최소한 다음을 실행한다.

```bash
pnpm run build
```

Prisma client 변경이 있으면 다음도 실행한다.

```bash
npx prisma generate
```

이번 제안의 핵심 구현은 Prisma schema 변경 없이 가능하므로 migration은 필요하지 않다.

---

## 6. 코드 변경 체크리스트

### `src/fsd/entities/uploaded-file/api/index.ts`

- [ ] `ensureUploadedFileQueuedForDispatch()` 추가
- [ ] `hasProcessingUploadForUser()` 추가
- [ ] 필요하면 기존 `markUploadedFileQueuedFromDispatch()` 사용처 제거 후 후속 cleanup에서 삭제

### `src/fsd/entities/uploaded-file/index.ts`

- [ ] 새 helper export 추가

### `src/fsd/entities/processing-dispatch/api/index.ts`

- [ ] `markUploadedFileQueuedFromDispatch` import 제거
- [ ] `ensureUploadedFileQueuedForDispatch` import 추가
- [ ] `dispatchPendingProcessingRequests()`에서 `inngest.send(...)` 전에 queue 보장
- [ ] `markProcessingDispatchSent()`는 send 성공 후 실행
- [ ] dead letter의 `markUploadedFileAttemptFailed()` 대상 status에 `"queued"` 추가
- [ ] `findStaleQueuedSentProcessingDispatches()` 추가
- [ ] `findStaleQueuedSentProcessingDispatches()`는 `$queryRaw`로 current attempt `sent` dispatch와 active processing 제외 조건을 `LIMIT` 전에 적용해 이전 attempt, dispatch가 없는 파일, 정상 대기 파일이 `limit`을 잠식하지 않게 함
- [ ] `markProcessingDispatchRetryableNow()` 추가
- [ ] `markStaleQueuedDispatchDeadLetter()` 추가

### `src/fsd/entities/processing-dispatch/index.ts`

- [ ] stale queued recovery helper export 추가

### `src/inngest/functions.ts`

- [ ] `recoverStaleQueuedDispatches()` 추가
- [ ] `staleProcessingSweep`가 `recoverStaleProcessingAttempts()` 실행 후 `recoverStaleQueuedDispatches()`를 순차 실행하도록 변경

### `src/fsd/pages/upload-detail/ui/_component/ProcessingTimeline.tsx`

- [ ] `getFailureLabel()`에 `"queued_worker_not_started"` 라벨 추가

### 후속 선택 사항

- [ ] 필요성이 별도로 확인될 때만 `pending_enqueue`를 본 워커가 5초 후 한 번 재조회하도록 보강
- [ ] 위 보강을 적용할 경우 최종 guard 뒤 `const processingContext = context`를 만들고 이후 async closure에서는 `processingContext`만 사용

---

## 7. 주의할 점

### 7-1. `queuedAt`을 retry마다 갱신하지 않는다

이미 `queued`인 row를 retry할 때 `queuedAt`을 계속 현재 시각으로 덮어쓰면 stale queued recovery 기준이 흔들린다.

그래서 helper는 다음 방식이어야 한다.

- `pending_enqueue -> queued` 전환 때만 `queuedAt = now`
- 이미 `queued`이면 그대로 정상으로 간주하고 timestamp를 건드리지 않음

### 7-2. `queued`를 `pending_enqueue`로 되돌리지 않는다

이 문제는 dispatch row를 재시도 대상으로 돌려 해결해야 한다. upload row의 status를 `pending_enqueue`로 되돌리면 UI와 timeline 의미가 흔들린다.

권장 복구:

```sql
ProcessingDispatch.status = 'retryable_failed'
ProcessingDispatch.nextRetryAt = NOW()
```

비권장 복구:

```sql
UploadedFile.status = 'pending_enqueue'
```

### 7-3. user concurrency를 고려한다

`processVideo`는 user별 concurrency limit 1을 사용한다. 따라서 같은 user에게 이미 `processing` 중인 파일이 있으면 다른 파일이 오래 `queued`로 남는 것이 정상일 수 있다.

stale queued recovery는 반드시 같은 user의 `processing` row가 없는 경우만 redelivery해야 한다.

### 7-4. duplicate event는 허용 가능한 구조로 유지한다

네트워크 실패는 ambiguous하다. `inngest.send(...)`가 실제로는 성공했지만 클라이언트가 실패로 인식할 수 있다. 이 경우 retry로 duplicate event가 발생할 수 있다.

현재 워커는 다음 조건 때문에 duplicate에 비교적 안전하다.

- current attempt만 처리한다.
- `status !== "queued"`이면 skip한다.
- `startUploadedFileProcessingAttempt()`가 `status = "queued"`이고 `processingStartedAt = null`인 row만 `processing`으로 claim한다.

따라서 redelivery를 완전히 없애려고 복잡한 exactly-once 처리를 추가하기보다, 현재의 idempotent claim 구조를 유지하는 편이 맞다.

### 7-5. stale queued recovery는 반드시 종료 조건이 있어야 한다

`ProcessingDispatch.status = "sent"`인 row를 `retryable_failed`로 되돌리는 것은 이벤트 재발송을 유도할 뿐, worker가 실제로 시작된다는 보장은 아니다. Inngest registration 문제, `/api/inngest` 장애, 환경 변수 문제처럼 이벤트가 계속 소비되지 않는 장애에서는 recovery가 영원히 같은 row를 다시 열 수 있다.

따라서 stale queued recovery에는 반드시 다음 종료 조건을 둔다.

- `dispatch.dispatchCount >= STALE_QUEUED_MAX_DISPATCH_COUNT`
- 또는 `now - dispatch.createdAt >= STALE_QUEUED_DISPATCH_DEAD_LETTER_MS`

둘 중 하나라도 참이면 `retryable_failed`로 되돌리지 말고 `UploadedFile.status = "failed"`, `failureCode = "queued_worker_not_started"`, `ProcessingDispatch.status = "dead_letter"`로 닫는다.

---

## 8. 완료 기준

이 제안이 완료되었다고 보려면 다음 조건을 만족해야 한다.

1. `process-video-events`가 발송되는 시점에는 DB가 이미 `queued`다.
2. `inngest.send(...)` 실패 시 `ProcessingDispatch`가 retryable/dead letter로 명확하게 닫힌다.
3. dead letter 시 `queued` upload도 `failed`로 닫힌다.
4. `queued` 상태에서 `processingStartedAt`이 없는 오래된 row가 recovery sweep으로 다시 dispatch된다.
5. stale queued recovery가 최대 재발송 횟수 또는 최대 대기 시간을 넘긴 row를 `failed`로 닫는다.
6. 같은 user에 `processing` 중인 upload가 있으면 queued recovery가 redelivery하지 않는다.
7. stale processing recovery가 먼저 실행되고, 그 다음 stale queued recovery가 실행된다.
8. stale queued dead letter 처리에서 `UploadedFile`과 `ProcessingDispatch`가 부분 업데이트로 갈라지지 않는다.
9. `"queued_worker_not_started"` 실패 원인이 detail timeline에 표시된다.
10. stale queued recovery 조회에서 previous attempt dispatch가 current attempt 복구를 막지 않는다.
11. 같은 user의 active `processing` row 때문에 정상 대기 중인 queued row가 stale queued recovery 조회의 `LIMIT`을 잠식하지 않는다.
12. 기존 stuck row를 수동 SQL 또는 sweep으로 복구할 수 있다.
13. `pnpm run build`가 통과한다.

---

## 9. 결론

이 문제는 `original.mp4`가 S3에 올라갔는지 여부의 문제가 아니다. S3 업로드와 DB confirmation은 완료되었지만, **Inngest 이벤트가 DB의 `queued` 상태보다 먼저 실행될 수 있는 순서** 때문에 정상 이벤트가 워커에서 스킵되는 문제다.

따라서 조치는 S3 재확인이나 Modal 쪽 보정보다 먼저, frontend 서버의 dispatch outbox 흐름을 다음 순서로 바꾸는 것이다.

```text
ProcessingDispatch claim
-> UploadedFile queued 확정
-> Inngest event send
-> ProcessingDispatch sent 확정
```

그리고 `queued` 이후 이벤트 발송 실패와 기존 `queued` 고착 row까지 복구 대상으로 포함해야 같은 문제가 다시 발생하지 않는다.
