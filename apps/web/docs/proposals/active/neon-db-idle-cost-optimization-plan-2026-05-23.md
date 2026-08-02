---
status: "pending"
stage: "draft"
proposal-size: "standard"
created-at: "2026-05-25"
approved-by: null
approved-at: null
approval-scope: null
completed-at: null
verification-summary: null
closed-at: null
closed-by: null
closed-reason: null
owners: []
related: []
---

# Neon DB Idle Cost Optimization Implementation Plan

**Goal:** Neon DB가 사용자가 없을 때 idle/suspend로 들어갈 수 있도록 불필요한 주기성 DB 접근을 줄이되, 업로드/처리/복구 UX가 stale 상태로 남지 않게 만든다. 특히 Inngest cron이 서로 다른 주기로 계속 DB를 깨우는 구조를 정리해 실제 idle window를 만든다.

**Architecture:** 새 업로드 직후에는 방금 생성한 dispatch id를 직접 처리한다. processing fallback과 stale recovery는 하나의 15분 `processingMaintenanceSweep`으로 통합하고, upload draft cleanup/promotion sweep은 1시간 단위로 낮춘다. dashboard의 `router.refresh()` polling은 active queue 전용 TanStack Query polling으로 바꾸고, 전체 uploaded-file list는 polling하지 않는다. 성공/삭제/복구 경로에서는 필요한 query invalidation과 제한적인 one-shot refresh만 수행한다.

---

## 0. 최종 판단

현재 프로젝트에서 Neon 비용을 가장 크게 방해할 수 있는 경로는 네 가지다.

1. `processingDispatchSweep`가 `* * * * *`로 매분 실행되어 사용자가 없어도 DB를 깨운다.
2. `uploadDraftSweep`가 `*/10 * * * *`로 10분마다 실행되어 `processingDispatchSweep`를 낮춰도 Neon idle window를 계속 끊을 수 있다.
3. `staleProcessingSweep`가 `*/15 * * * *`로 processing recovery를 별도 cron에서 수행해 processing maintenance가 중복된다.
4. dashboard에 active upload가 있으면 `QueueStatus.tsx`가 7.5초마다 `router.refresh()`를 호출해 `DashboardLayout`, `DashboardPage`의 DB query를 같이 재실행한다.

따라서 최적 방안은 다음 순서다.

1. dispatch id 기반 즉시 처리 경로를 추가한다.
2. processing cron은 15분 `processingMaintenanceSweep` 하나로 통합하되 stale recovery와 dispatch drain을 모두 batch 제한하고, upload draft sweep은 1시간 단위로 낮춘다.
3. dashboard active polling은 전체 uploaded-file list가 아니라 active queue 전용 경량 query만 refetch하게 바꾸고, QueueStatus와 My Clips의 data source를 분리한다.
4. upload/resume/delete/clip-delete 경로의 invalidation을 보완한다.
5. active uploaded-file id set diff로 처리 완료를 감지해 header credits 갱신용 `router.refresh()`를 한 번만 수행한다.

## 1. Task 1: Dispatch 단일 row 처리 경로 추가

- [ ] **Step 1: dead-letter age를 60분으로 늘린다**

`src/fsd/entities/processing-dispatch/api/index.ts`

```ts
const DISPATCH_DEAD_LETTER_AGE_MS = 60 * 60_000;
```

이 변경이 필요한 이유는 cron이 15분 fallback이 되면 기존 `15 * 60_000`은 retry window와 맞지 않기 때문이다. 60분이면 기존 backoff `[30s, 60s, 120s, 300s, 600s]`가 여러 번 실행될 기회를 가진다.

- [ ] **Step 2: eligible where/select를 재사용 가능하게 분리한다**

`listEligibleProcessingDispatches()` 위에 다음 helper를 추가한다.

```ts
function getEligibleProcessingDispatchWhere(
  now: Date,
  dispatchId?: string,
): Prisma.ProcessingDispatchWhereInput {
  const staleBefore = new Date(now.getTime() - DISPATCH_STALE_LOCK_MS);

  return {
    ...(dispatchId ? { id: dispatchId } : {}),
    OR: [
      { status: "pending" },
      {
        status: "retryable_failed",
        OR: [{ nextRetryAt: null }, { nextRetryAt: { lte: now } }],
      },
      {
        status: "sending",
        lockedAt: { lt: staleBefore },
      },
    ],
  };
}

const eligibleProcessingDispatchSelect = {
  id: true,
  attempt: true,
  dispatchCount: true,
  createdAt: true,
  uploadedFile: {
    select: {
      id: true,
      userId: true,
      language: true,
      targetClipCount: true,
      s3Key: true,
      currentAttempt: true,
      uploaded: true,
    },
  },
} satisfies Prisma.ProcessingDispatchSelect;
```

`listEligibleProcessingDispatches()`는 다음 형태로 바꾼다.

```ts
async function listEligibleProcessingDispatches(limit: number, now: Date) {
  return db.processingDispatch.findMany({
    where: getEligibleProcessingDispatchWhere(now),
    orderBy: {
      createdAt: "asc",
    },
    take: limit,
    select: eligibleProcessingDispatchSelect,
  });
}

async function findEligibleProcessingDispatchById(
  dispatchId: string,
  now: Date,
) {
  return db.processingDispatch.findFirst({
    where: getEligibleProcessingDispatchWhere(now, dispatchId),
    select: eligibleProcessingDispatchSelect,
  });
}
```

- [ ] **Step 3: 단일 dispatch 처리 helper를 추출한다**

`dispatchPendingProcessingRequests()`의 loop 내부 로직을 아래 helper로 이동한다.

```ts
type EligibleProcessingDispatch = Awaited<
  ReturnType<typeof listEligibleProcessingDispatches>
>[number];

async function processEligibleProcessingDispatch(
  dispatch: EligibleProcessingDispatch,
  now: Date,
): Promise<boolean> {
  const claimed = await claimProcessingDispatchForSend(dispatch.id, now);

  if (!claimed) {
    return false;
  }

  const dispatchAttempt = dispatch.dispatchCount + 1;

  try {
    if (dispatch.uploadedFile.currentAttempt !== dispatch.attempt) {
      await markProcessingDispatchDeadLetter(dispatch.id, "stale_attempt");
      return false;
    }

    if (!dispatch.uploadedFile.uploaded) {
      throw new Error("Source upload has not been confirmed");
    }

    const queueResult = await ensureUploadedFileQueuedForDispatch(
      dispatch.uploadedFile.id,
      dispatch.attempt,
      { now },
    );

    if (queueResult.status === "already_advanced") {
      await markProcessingDispatchSent(dispatch.id, { now });
      return false;
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
    return true;
  } catch (error) {
    const errorMessage = toErrorMessage(error);
    const isDeadLetter =
      dispatchAttempt >= MAX_DISPATCH_ATTEMPTS ||
      now.getTime() - dispatch.createdAt.getTime() >=
        DISPATCH_DEAD_LETTER_AGE_MS;

    if (isDeadLetter) {
      await db.$transaction(async (tx) => {
        await markProcessingDispatchDeadLetter(dispatch.id, errorMessage, {
          tx,
          now,
        });
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
      });
    } else {
      await markProcessingDispatchRetry(
        dispatch.id,
        errorMessage,
        dispatchAttempt,
        { now },
      );
    }

    return false;
  }
}
```

- [ ] **Step 4: id 기반 export 함수를 추가한다**

`processEligibleProcessingDispatch()` 아래에 추가한다.

```ts
export async function dispatchProcessingRequestById(
  dispatchId: string,
): Promise<boolean> {
  const now = new Date();
  const dispatch = await findEligibleProcessingDispatchById(dispatchId, now);

  if (!dispatch) {
    return false;
  }

  return processEligibleProcessingDispatch(dispatch, now);
}
```

- [ ] **Step 5: 기존 batch dispatcher는 helper를 재사용한다**

`dispatchPendingProcessingRequests()`는 아래처럼 단순화한다.

```ts
export async function dispatchPendingProcessingRequests(
  limit = 25,
): Promise<number> {
  const now = new Date();
  const dispatches = await listEligibleProcessingDispatches(limit, now);
  let dispatchedCount = 0;

  for (const dispatch of dispatches) {
    const dispatched = await processEligibleProcessingDispatch(dispatch, now);

    if (dispatched) {
      dispatchedCount += 1;
    }
  }

  return dispatchedCount;
}
```

- [ ] **Step 6: barrel export를 반드시 추가한다**

`src/fsd/entities/processing-dispatch/index.ts`

```ts
export {
  createProcessingDispatch,
  dispatchPendingProcessingRequests,
  dispatchProcessingRequestById,
  findStaleQueuedSentProcessingDispatches,
  markProcessingDispatchRetryableNow,
  markStaleQueuedDispatchDeadLetter,
} from "./api";
```

이 export가 없으면 `src/fsd/features/upload/api/index.ts`에서 새 함수를 import할 수 없어 실제 적용이 실패한다.

## 2. Task 2: 업로드 직후 방금 생성한 dispatch를 먼저 처리

- [ ] **Step 1: import를 수정한다**

```ts
import {
  createProcessingDispatch,
  dispatchPendingProcessingRequests,
  dispatchProcessingRequestById,
} from "~/fsd/entities/processing-dispatch";
```

- [ ] **Step 2: nudge signature를 backward-compatible하게 바꾼다**

기존 `reconcileProcessingRequest()`는 no-arg로 `nudgeProcessingDispatch()`를 호출한다. 따라서 required parameter로 바꾸면 안 된다.

```ts
async function nudgeProcessingDispatch(
  dispatchId: string | null = null,
): Promise<void> {
  try {
    if (dispatchId) {
      const dispatched = await dispatchProcessingRequestById(dispatchId);

      if (dispatched) {
        return;
      }
    }

    await dispatchPendingProcessingRequests(5);
  } catch (error) {
    console.error("Best-effort processing dispatch nudge failed", error);
  }
}
```

fallback `5`는 새 dispatch id 처리 실패 시 오래된 backlog를 조금 비우기 위한 값이다. 매 요청마다 큰 batch를 처리하면 upload server action의 응답 시간이 늘어난다.

- [ ] **Step 3: schedule transaction이 dispatch id를 반환하게 한다**

`scheduleProcessingAttempt()` 안의 transaction에서 `createProcessingDispatch()` 결과를 보관한다.

```ts
const dispatch = await createProcessingDispatch(
  {
    uploadedFileId,
    attempt: nextAttempt,
  },
  { tx, now },
);

return success({ dispatchId: dispatch.id });
```

transaction 이후에는 다음처럼 nudge한다.

```ts
if (!scheduled.success) {
  return scheduled;
}

await nudgeProcessingDispatch(scheduled.data.dispatchId);
revalidatePath("/dashboard");
revalidatePath(`/dashboard/uploads/${uploadedFileId}`);

return success();
```

`scheduleProcessingAttempt()`의 public return type은 그대로 `Promise<ActionResult<void>>`로 유지한다. 내부 transaction의 success data는 nudge에만 사용하고 외부로 노출하지 않는다.

- [ ] **Step 4: reconcileProcessingRequest는 no-arg 호출을 유지해도 된다**

아래 코드는 그대로 둬도 깨지지 않는다.

```ts
if (requestState.status === "pending_enqueue") {
  await nudgeProcessingDispatch();
}
```

pending enqueue 상태를 복구하는 fallback 목적이므로 특정 dispatch id가 없어도 괜찮다.

## 3. Task 3: Inngest maintenance cron을 통합하고 저빈도화한다

현재 `src/inngest/functions.ts`에는 DB를 깨우는 cron이 세 개 있다.

- `processingDispatchSweep`: `* * * * *`
- `uploadDraftSweep`: `*/10 * * * *`
- `staleProcessingSweep`: `*/15 * * * *`

`processingDispatchSweep`만 15분으로 낮추면 `uploadDraftSweep`가 여전히 10분마다 Neon을 깨운다. 비용 최적화 목표를 실제로 달성하려면 processing 계열은 하나의 15분 maintenance sweep으로 합치고, upload draft maintenance는 1시간 단위로 낮춘다. 또한 `maxDuration = 10` 안에서 끝나도록 stale processing recovery와 dispatch drain을 모두 batch 제한해야 한다. 이때 `UploadedFile`에는 현재 `@@index([s3Key])`만 있고 `ProcessingDispatch`에는 `@@index([status, nextRetryAt])`만 있으므로, 새 maintenance/query path가 테이블 스캔이나 큰 정렬에 가까워지지 않도록 필요한 복합 인덱스를 migration으로 함께 추가한다.

- [ ] **Step 1: UploadedFile/ProcessingDispatch maintenance/query 인덱스를 추가한다**

`prisma/schema.prisma`의 `UploadedFile` model 하단을 다음처럼 확장한다.

```prisma
model UploadedFile {
  // existing fields...

  @@index([s3Key])
  @@index([status, processingStartedAt])
  @@index([status, uploaded, processingStartedAt, queuedAt])
  @@index([status, uploaded, createdAt])
  @@index([status, uploaded, sourceUploadedAt])
  @@index([userId, status, createdAt])
  @@index([userId, createdAt])
}
```

같은 파일의 `ProcessingDispatch` model 하단도 다음처럼 확장한다. 기존 `@@index([status, nextRetryAt])`는 유지한다.

```prisma
model ProcessingDispatch {
  // existing fields...

  @@unique([uploadedFileId, attempt])
  @@index([status, nextRetryAt])
  @@index([status, createdAt])
  @@index([status, lockedAt])
}
```

각 인덱스의 목적은 다음과 같다.

- `@@index([status, processingStartedAt])`: `findStaleProcessingUploadedFiles(status = "processing", processingStartedAt < staleBefore)`가 오래된 processing row만 빠르게 찾는다.
- `@@index([status, uploaded, processingStartedAt, queuedAt])`: `findStaleQueuedSentProcessingDispatches()`의 raw SQL이 `queued/uploaded/processingStartedAt null/queuedAt < staleBefore/order by queuedAt` 조건을 빠르게 탄다.
- `@@index([status, uploaded, createdAt])`: raw upload draft promotion/cleanup이 `status = "upload_pending"`, `uploaded = false`, `createdAt asc` 조건을 탄다.
- `@@index([status, uploaded, sourceUploadedAt])`: recoverable draft cleanup/list가 `status = "upload_pending"`, `uploaded = true`, `sourceUploadedAt` 조건을 탄다.
- `@@index([userId, status, createdAt])`: dashboard active queue가 `userId`, active `status in (...)`, `createdAt desc` 조건을 탄다.
- `@@index([userId, createdAt])`: current user list가 `userId`, `status != "upload_pending"`, `createdAt desc` 조건을 탄다. `status` inequality가 중간에 끼면 정렬 최적화가 약해질 수 있으므로 full list용으로 별도 인덱스를 둔다.
- `@@index([status, nextRetryAt])`: 기존 retryable dispatch lookup을 유지한다.
- `@@index([status, createdAt])`: `pending` dispatch drain과 전체 eligible dispatch의 `createdAt asc` 정렬 비용을 줄인다.
- `@@index([status, lockedAt])`: `sending` 상태에서 stale lock을 찾는 `lockedAt < staleBefore` 조건을 빠르게 탄다.

그 다음 migration을 생성한다.

```powershell
npx.cmd prisma migrate dev --name neon_idle_query_indexes --create-only
```

`--create-only`를 붙이는 이유는 이 프로젝트의 `DATABASE_URL`이 Neon을 가리킬 수 있기 때문이다. `migrate dev`만 실행하면 migration 파일 생성뿐 아니라 연결된 DB 적용까지 수행할 수 있다. 먼저 migration directory를 생성하고 diff를 확인한 뒤, 배포/적용 단계에서는 기존 프로젝트 흐름에 맞춰 `npx.cmd prisma migrate deploy` 또는 `npm.cmd run db:migrate`를 사용한다. schema만 수정하고 migration directory를 누락하면 실제 Neon DB에는 인덱스가 생기지 않는다.

생성된 migration SQL에는 최소 다음 신규 index가 있어야 한다. `ProcessingDispatch_status_nextRetryAt_idx`는 현재 schema에 이미 존재하므로 새 migration에 다시 만들면 안 된다.

```sql
CREATE INDEX "UploadedFile_status_processingStartedAt_idx" ON "UploadedFile"("status", "processingStartedAt");
CREATE INDEX "UploadedFile_status_uploaded_processingStartedAt_queuedAt_idx" ON "UploadedFile"("status", "uploaded", "processingStartedAt", "queuedAt");
CREATE INDEX "UploadedFile_status_uploaded_createdAt_idx" ON "UploadedFile"("status", "uploaded", "createdAt");
CREATE INDEX "UploadedFile_status_uploaded_sourceUploadedAt_idx" ON "UploadedFile"("status", "uploaded", "sourceUploadedAt");
CREATE INDEX "UploadedFile_userId_status_createdAt_idx" ON "UploadedFile"("userId", "status", "createdAt");
CREATE INDEX "UploadedFile_userId_createdAt_idx" ON "UploadedFile"("userId", "createdAt");
CREATE INDEX "ProcessingDispatch_status_createdAt_idx" ON "ProcessingDispatch"("status", "createdAt");
CREATE INDEX "ProcessingDispatch_status_lockedAt_idx" ON "ProcessingDispatch"("status", "lockedAt");
```

- [ ] **Step 2: stale processing recovery에 batch limit을 추가한다**

`src/fsd/entities/uploaded-file/api/index.ts`

```ts
export async function findStaleProcessingUploadedFiles(
  staleBefore: Date,
  limit = 25,
) {
  return db.uploadedFile.findMany({
    where: {
      status: "processing",
      processingStartedAt: {
        lt: staleBefore,
      },
    },
    orderBy: {
      processingStartedAt: "asc",
    },
    take: limit,
    select: {
      id: true,
      currentAttempt: true,
    },
  });
}
```

`src/inngest/functions.ts`

```ts
async function recoverStaleProcessingAttempts(limit = 25): Promise<number> {
  const staleBefore = new Date(Date.now() - 2 * 60 * 60 * 1000);
  const staleFiles = await findStaleProcessingUploadedFiles(
    staleBefore,
    limit,
  );
  let recovered = 0;

  for (const file of staleFiles) {
    const result = await markUploadedFileAttemptFailed(
      file.id,
      file.currentAttempt,
      "worker_timeout",
      {
        statuses: ["processing"],
      },
    );

    recovered += result.count;
  }

  return recovered;
}
```

현재 실제 코드의 `findStaleProcessingUploadedFiles()`에는 `take`가 없다. 이 상태로 cron을 통합하면 stale processing row가 많이 쌓인 날에 `recoverStaleProcessingAttempts()`가 모든 row를 처리하려고 하고, `dispatchPendingProcessingRequests(25)`까지 도달하기 전에 `maxDuration = 10`을 넘길 수 있다.

- [ ] **Step 3: processing 계열 cron을 하나로 통합한다**

`src/inngest/functions.ts`

```ts
export const processingMaintenanceSweep = inngest.createFunction(
  { id: "processing-maintenance-sweep" },
  { cron: "*/15 * * * *" },
  async () => {
    const processingRecovered = await recoverStaleProcessingAttempts(25);
    const queuedRecovered = await recoverStaleQueuedDispatches();
    const dispatched = await dispatchPendingProcessingRequests(25);

    return {
      dispatched,
      processingRecovered,
      queuedRecovered,
    };
  },
);
```

기존 `processingDispatchSweep` export는 `processingMaintenanceSweep`로 대체한다. 기존 `staleProcessingSweep` export block은 삭제한다. 같은 15분 주기의 processing recovery 작업을 별도 cron으로 둘 이유가 없고, export를 남기면 추후 route에 다시 등록될 여지가 있다.

순서는 중요하다. `recoverStaleQueuedDispatches()`가 오래된 `sent` dispatch를 `retryable_failed`로 되돌린 뒤 `dispatchPendingProcessingRequests(25)`가 같은 run에서 즉시 다시 보낼 수 있어야 한다. 이 세 작업을 `Promise.all`로 병렬 실행하면 방금 retryable로 바뀐 dispatch가 다음 15분 sweep까지 밀릴 수 있다.

중요: 처음부터 `dispatchPendingProcessingRequests(50)`로 올리지 않는다. 현재 `src/app/api/inngest/route.ts`에 `maxDuration = 10`이 있으므로, backlog가 커졌을 때 50개 dispatch 처리와 Inngest send가 10초에 걸릴 수 있다. 초기값은 stale processing recovery와 dispatch drain 모두 `25`로 배포하고, Inngest run duration과 timeout 여부를 본 뒤 늘린다.

- [ ] **Step 4: upload draft maintenance를 1시간 단위로 낮춘다**

`uploadDraftSweep`는 raw upload draft promotion, stale raw draft cleanup, stale recoverable draft cleanup을 담당한다. 사용자 업로드의 정상 경로는 `confirmUploadObjectExists()`와 `reconcileUploadConfirmation()`이 먼저 처리하므로, 이 sweep은 즉시성이 낮은 fallback/cleanup 성격이다.

`src/inngest/functions.ts`

```ts
export const uploadDraftSweep = inngest.createFunction(
  { id: "upload-draft-sweep" },
  { cron: "0 * * * *" },
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
```

이 변경으로 background DB wake-up은 기본적으로 15분 processing maintenance와 1시간 upload draft maintenance로 제한된다. 완전한 multi-hour idle을 보장하지는 않지만, 기존 매분 dispatch 및 10분 upload draft wake-up보다 비용 측면에서 훨씬 낫다.

- [ ] **Step 5: Inngest route 등록을 갱신한다**

`src/app/api/inngest/route.ts`

```ts
import {
  processVideo,
  processingMaintenanceSweep,
  uploadDraftSweep,
} from "~/inngest/functions";
```

```ts
export const { GET, POST, PUT } = serve({
  client: inngest,
  functions: [
    processVideo,
    processingMaintenanceSweep,
    uploadDraftSweep,
  ],
});
```

`staleProcessingSweep`와 `processingDispatchSweep`는 route 등록에서 제거한다.

- [ ] **Step 6: 실행 후 관측 기준을 기록한다**

배포 후 24시간 동안 다음을 확인한다.

- Inngest `processing-maintenance-sweep` run duration p95가 10초보다 충분히 낮은지
- Inngest `upload-draft-sweep` run duration p95가 10초보다 충분히 낮은지
- timeout 또는 function cancellation이 없는지
- stale processing row가 많아도 한 run에서 최대 25개씩만 복구되는지
- `ProcessingDispatch.status = "pending"` backlog가 계속 증가하지 않는지
- Neon active compute time이 매분 또는 10분마다 깨어나는 패턴에서 벗어났는지

## 4. Task 4: current user list와 active queue query 분리

핵심은 full uploaded-file list를 polling하지 않는 것이다. 현재 `listUploadedFileSummariesByUserId()`는 사용자의 모든 non-draft file을 읽은 뒤 모든 file id에 대해 `clip.groupBy()`를 수행한다. active upload가 하나 있을 때 이 쿼리를 7.5초마다 반복하면 `router.refresh()`보다는 낫지만, Neon idle/cost 최적화 관점에서는 여전히 과하다.

- [ ] **Step 1: active queue state 타입과 entity API를 추가한다**

`src/fsd/entities/uploaded-file/model/types.ts`

```ts
export interface ActiveUploadedFileQueueState {
  queueFiles: UploadedFileSummary[];
  activeUploadedFileIds: string[];
}
```

`queueFiles`는 화면에 표시할 최근 active upload만 담는다. `activeUploadedFileIds`는 completion detection용이므로 limit 없이 전체 active id를 담는다. 이 둘을 분리해야 queue 표시를 가볍게 유지하면서도 오래된 active row의 완료를 놓치지 않는다.

`src/fsd/entities/uploaded-file/api/index.ts`

기존 import를 다음처럼 확장한다.

```ts
import type {
  ActiveUploadedFileQueueState,
  RecoverableUploadDraftSummary,
  UploadedFileDetail,
  UploadedFileSummary,
  UploadLifecycleState,
} from "../model/types";

import {
  ACTIVE_PROCESSING_STATUSES,
  isProcessingStatus,
  type ProcessingStatus,
} from "../model/processing-status";
```

`listUploadedFileSummariesByUserId()` 아래에 추가한다.

```ts
export async function listActiveUploadedFileQueueStateByUserId(
  userId: string,
  queueLimit = 25,
): Promise<ActiveUploadedFileQueueState> {
  const [activeIdRows, queueFiles] = await Promise.all([
    db.uploadedFile.findMany({
      where: {
        userId,
        status: {
          in: [...ACTIVE_PROCESSING_STATUSES],
        },
      },
      select: {
        id: true,
      },
    }),
    db.uploadedFile.findMany({
      where: {
        userId,
        status: {
          in: [...ACTIVE_PROCESSING_STATUSES],
        },
      },
      orderBy: {
        createdAt: "desc",
      },
      take: queueLimit,
      select: {
        id: true,
        displayName: true,
        status: true,
        createdAt: true,
        lastSuccessfulAttempt: true,
      },
    }),
  ]);

  const activeUploadedFileIds = activeIdRows.map((file) => file.id);
  const visibleQueueFileIds = queueFiles.map((file) => file.id);
  const activeAttemptPairs = queueFiles
    .filter((file) => file.lastSuccessfulAttempt > 0)
    .map((file) => ({
      uploadedFileId: file.id,
      processingAttempt: file.lastSuccessfulAttempt,
    }));

  const groupedCounts =
    visibleQueueFileIds.length > 0 && activeAttemptPairs.length > 0
      ? await db.clip.groupBy({
          by: ["uploadedFileId", "processingAttempt"],
          where: {
            OR: activeAttemptPairs,
          },
          _count: {
            _all: true,
          },
        })
      : [];

  const countsByAttempt = new Map(
    groupedCounts.map((group) => [
      `${group.uploadedFileId ?? ""}:${group.processingAttempt}`,
      group._count._all,
    ]),
  );

  return {
    activeUploadedFileIds,
    queueFiles: queueFiles.map((file) => ({
      id: file.id,
      fileName: file.displayName ?? "Untitled",
      status: toNonHiddenStatus(file.status),
      createdAt: file.createdAt,
      visibleClipsCount:
        file.lastSuccessfulAttempt > 0
          ? (countsByAttempt.get(`${file.id}:${file.lastSuccessfulAttempt}`) ?? 0)
          : 0,
    })),
  };
}
```

이 쿼리는 active status만 대상으로 한다. completion detection은 모든 active id를 가져오고, 화면 표시와 `clip.groupBy()`는 최근 `queueLimit`개에만 제한한다. 대부분의 active upload는 `lastSuccessfulAttempt = 0`이므로 clip query 자체가 생략된다.

`src/fsd/entities/uploaded-file/index.ts`의 existing `export { ... } from "./api";` block에 다음 한 줄을 추가한다. 현재 파일 기준으로 `listRecoverableUploadDraftsByUserId` 바로 위에 두면 된다.

```ts
  listActiveUploadedFileQueueStateByUserId,
```

type export block에는 다음 타입을 추가한다.

```ts
  ActiveUploadedFileQueueState,
```

- [ ] **Step 2: server action import를 추가한다**

`src/fsd/features/upload/api/index.ts`

```ts
import {
  confirmUploadedFileSourceIfObjectExists,
  createUploadDraft,
  deleteUploadedFileRecord,
  findUploadedFileForDeletion,
  findUploadedFileS3Key,
  findUploadedFileSourceState,
  getUploadedFileDetailsById,
  getUploadedFilePrefix,
  isActiveProcessingStatus,
  isProcessingStatus,
  listActiveUploadedFileQueueStateByUserId,
  listUploadedFileSummariesByUserId,
  type ActiveUploadedFileQueueState,
  type ProcessingStatus,
  type UploadedFileSummary,
} from "~/fsd/entities/uploaded-file";
```

`listUploadedFileSummariesByUserId`와 `listActiveUploadedFileQueueStateByUserId`는 value import다. type-only import로 넣으면 server action에서 사용할 수 없다.

- [ ] **Step 3: full list와 active queue server action을 추가한다**

`getUploadedFileDetails()` 근처에 추가한다.

```ts
export async function listCurrentUserUploadedFileSummaries(): Promise<
  UploadedFileSummary[]
> {
  const authResult = await requireAuth();
  if (!authResult.success) {
    throw new Error(authResult.error);
  }

  return listUploadedFileSummariesByUserId(authResult.data.userId);
}

export async function listCurrentUserActiveUploadedFileQueueState(): Promise<
  ActiveUploadedFileQueueState
> {
  const authResult = await requireAuth();
  if (!authResult.success) {
    throw new Error(authResult.error);
  }

  return listActiveUploadedFileQueueStateByUserId(authResult.data.userId);
}
```

- [ ] **Step 4: query key에 userId 포함 key를 추가한다**

`src/fsd/entities/uploaded-file/model/query-keys.ts`

```ts
export const uploadedFileKeys = {
  all: ["uploadedFiles"] as const,
  lists: () => [...uploadedFileKeys.all, "list"] as const,
  list: (filters: UploadedFileListFilters = {}) =>
    [...uploadedFileKeys.lists(), filters] as const,
  currentUserList: (userId: string) =>
    [...uploadedFileKeys.lists(), "current-user", userId] as const,
  currentUserActiveQueue: (userId: string) =>
    [...uploadedFileKeys.lists(), "current-user-active-queue", userId] as const,
  details: () => [...uploadedFileKeys.all, "detail"] as const,
  detail: (uploadedFileId: string) =>
    [...uploadedFileKeys.details(), uploadedFileId] as const,
};
```

server action은 auth session을 사용하더라도 query key에는 `userId`를 넣는다. 그래야 같은 브라우저에서 계정 전환이 발생했을 때 이전 사용자의 uploaded-file list cache를 재사용하지 않는다. active queue key는 `uploadedFileKeys.lists()` 하위에 둔다. 이렇게 해야 upload/delete/clip-delete 경로에서 기존처럼 `invalidateQueries({ queryKey: uploadedFileKeys.lists() })`를 호출해도 full list와 active queue가 함께 갱신된다.

- [ ] **Step 5: query options를 추가한다**

`src/fsd/features/upload/model/query-options.ts`

```ts
import { queryOptions } from "@tanstack/react-query";
import { uploadedFileKeys } from "~/fsd/entities/uploaded-file/model/query-keys";
import { ACTIVE_UPLOAD_POLLING_INTERVAL_MS } from "~/fsd/entities/uploaded-file/model/polling";
import type {
  ActiveUploadedFileQueueState,
  UploadedFileSummary,
} from "~/fsd/entities/uploaded-file/model/types";
import {
  getUploadedFileDetails,
  listCurrentUserActiveUploadedFileQueueState,
  listCurrentUserUploadedFileSummaries,
} from "../api";

export const uploadedFileDetailQueryOptions = (uploadedFileId: string) =>
  queryOptions({
    queryKey: uploadedFileKeys.detail(uploadedFileId),
    queryFn: async () => {
      const uploadedFileData = await getUploadedFileDetails(uploadedFileId);

      if (!uploadedFileData) {
        throw new Error("Upload detail not found");
      }

      return uploadedFileData;
    },
  });

export const currentUserUploadedFileListQueryOptions = (
  userId: string,
  initialData: UploadedFileSummary[],
) =>
  queryOptions({
    queryKey: uploadedFileKeys.currentUserList(userId),
    queryFn: async () => listCurrentUserUploadedFileSummaries(),
    initialData,
    staleTime: 60_000,
  });

export const currentUserActiveUploadQueueQueryOptions = (
  userId: string,
  initialData: ActiveUploadedFileQueueState,
) =>
  queryOptions({
    queryKey: uploadedFileKeys.currentUserActiveQueue(userId),
    queryFn: async () => listCurrentUserActiveUploadedFileQueueState(),
    initialData,
    refetchInterval: (query) => {
      const queueState = query.state.data;

      if (!queueState?.activeUploadedFileIds.length) {
        return false;
      }

      return ACTIVE_UPLOAD_POLLING_INTERVAL_MS;
    },
    refetchIntervalInBackground: false,
  });
```

server action을 `queryFn`에 직접 대입하지 않는다. TanStack Query는 `queryFn(context)` 형태로 호출하고, 그 context에는 `QueryClient`, `AbortSignal`, `queryKey` 등이 들어간다. 이 객체가 Next server action 인자로 전달되면 직렬화 문제가 날 수 있으므로 항상 `async () => serverAction()`처럼 감싼다.

full list query에는 `refetchInterval`을 넣지 않는다. active upload가 있는 동안 polling하는 것은 `currentUserActiveUploadQueueQueryOptions()`뿐이다. full list는 upload success, recoverable resume/discard, detail delete, clip delete 같은 사용자 액션에서 `uploadedFileKeys.lists()` invalidation으로 갱신한다.

## 5. Task 5: Dashboard에서 `router.refresh()` polling 제거

- [ ] **Step 1: DashboardPage가 userId를 넘긴다**

`src/app/dashboard/page.tsx`

```tsx
return (
  <DashboardView
    userId={session.user.id}
    uploadedFiles={uploadedFiles}
    recoverableDrafts={recoverableDrafts}
  />
);
```

`uploadedFiles`는 서버에서 이미 한 번 조회한 full list다. 여기서 별도의 active queue server query를 추가하지 않는다. 초기 active queue data는 이 full list에서 client가 파생해 추가 DB 접근을 만들지 않는다.

- [ ] **Step 2: DashboardView props를 확장하고 full list query와 active queue query를 분리한다**

`src/fsd/pages/dashboard/ui/index.tsx`

```tsx
"use client";

import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useOptimistic, useRef } from "react";
import { env } from "~/env";
import { isActiveProcessingStatus } from "~/fsd/entities/uploaded-file/model/processing-status";
import type {
  ActiveUploadedFileQueueState,
  RecoverableUploadDraftSummary,
  UploadedFileSummary,
} from "~/fsd/entities/uploaded-file/model/types";
import {
  currentUserActiveUploadQueueQueryOptions,
  currentUserUploadedFileListQueryOptions,
} from "~/fsd/features/upload/model/query-options";
```

props:

```ts
interface DashboardViewProps {
  userId: string;
  uploadedFiles: UploadedFileSummary[];
  recoverableDrafts: RecoverableUploadDraftSummary[];
}
```

component 내부:

```tsx
const router = useRouter();
const initialActiveQueueFiles = useMemo(
  () => uploadedFiles.filter((file) => isActiveProcessingStatus(file.status)),
  [uploadedFiles],
);
const initialActiveQueueState = useMemo<ActiveUploadedFileQueueState>(
  () => ({
    queueFiles: initialActiveQueueFiles.slice(0, 25),
    activeUploadedFileIds: initialActiveQueueFiles.map((file) => file.id),
  }),
  [initialActiveQueueFiles],
);

const uploadedFilesQuery = useQuery(
  currentUserUploadedFileListQueryOptions(userId, uploadedFiles),
);
const activeQueueQuery = useQuery(
  currentUserActiveUploadQueueQueryOptions(userId, initialActiveQueueState),
);

const queriedUploadedFiles = uploadedFilesQuery.data ?? uploadedFiles;
const activeQueueState = activeQueueQuery.data ?? initialActiveQueueState;
const activeQueueFiles = activeQueueState.queueFiles;
const [optimisticFiles, addOptimisticFile] = useOptimistic(
  queriedUploadedFiles,
  (state, newFile: UploadedFileSummary) => [newFile, ...state],
);

const optimisticQueueFiles = useMemo(
  () =>
    optimisticFiles.filter((file) => file.id.startsWith("optimistic-")),
  [optimisticFiles],
);
const queueStatusFiles = useMemo(
  () => [...optimisticQueueFiles, ...activeQueueFiles],
  [activeQueueFiles, optimisticQueueFiles],
);

const activeUploadedFileIds = useMemo(
  () => new Set(activeQueueState.activeUploadedFileIds),
  [activeQueueState.activeUploadedFileIds],
);
```

`optimisticFiles`는 full list를 기반으로 optimistic row를 얹은 값이라 그대로 `QueueStatus`에 넘기면 과거 완료 파일까지 queue table에 섞인다. `QueueStatus`에는 `optimistic-*` row와 active queue query의 `queueFiles`만 넘긴다. 처리 완료 감지는 제한된 `queueFiles`가 아니라 limit 없는 `activeUploadedFileIds`로 수행한다.

- [ ] **Step 3: 처리 완료 시 header credits 갱신을 위해 한 번만 refresh한다**

`DashboardLayout`의 credits는 server component data라 active queue query polling만으로 갱신되지 않는다. 매 7.5초 refresh는 제거하되, active upload id가 active set에서 빠지는 순간 한 번만 refresh한다.

```tsx
const previousActiveUploadedFileIdsRef = useRef(activeUploadedFileIds);
const refetchUploadedFiles = uploadedFilesQuery.refetch;

useEffect(() => {
  const previousActiveUploadedFileIds =
    previousActiveUploadedFileIdsRef.current;
  const hasCompletedUpload = [...previousActiveUploadedFileIds].some(
    (uploadedFileId) => !activeUploadedFileIds.has(uploadedFileId),
  );

  if (hasCompletedUpload) {
    router.refresh();
    void refetchUploadedFiles();
  }

  previousActiveUploadedFileIdsRef.current = activeUploadedFileIds;
}, [activeUploadedFileIds, refetchUploadedFiles, router]);
```

이 refresh는 실제 DB row 기준 active upload가 terminal 상태로 바뀔 때 발생한다. boolean `hasActiveUpload` 전환만 보면 active upload가 여러 개일 때 하나가 끝나도 다른 active upload가 남아 refresh가 발생하지 않는다. id set diff를 사용하면 여러 개가 동시에 처리되는 상황에서도 완료된 항목을 감지할 수 있다. `uploadedFilesQuery.refetch()`는 terminal 상태가 된 row와 `visibleClipsCount`를 My Clips에 반영하기 위한 one-shot refetch다.

- [ ] **Step 4: QueueStatus와 UploadedFileList의 data source를 분리한다**

```tsx
<UploadPodcast onOptimisticAdd={addOptimisticFile} />
<RecoverableUploadDrafts drafts={recoverableDrafts} />
<QueueStatus
  uploadedFiles={queueStatusFiles}
  isFetching={activeQueueQuery.isFetching}
  onRefresh={() => void activeQueueQuery.refetch()}
/>
```

`QueueStatus`는 방금 선택한 파일을 즉시 보여줘야 하므로 optimistic row를 포함한다. 단, active queue query data만 합쳐야 하며 full list query data를 그대로 넘기면 안 된다.

`My Clips` tab은 stale prop 대신 query data를 사용하되, optimistic row는 넘기지 않는다.

```tsx
<UploadedFileList files={queriedUploadedFiles} />
```

`UploadedFileCard`는 `file.id`로 `/dashboard/uploads/${file.id}` detail link와 `getOriginalPlayUrl(file.id)` 호출을 만든다. `optimistic-*` id가 들어가면 깨진 detail link와 실패하는 play-url server action이 생기므로, My Clips에는 실제 DB row만 넘긴다.

- [ ] **Step 5: QueueStatus에서 interval refresh를 제거한다**

`src/fsd/pages/dashboard/ui/_component/QueueStatus.tsx`

```tsx
interface QueueStatusProps {
  uploadedFiles: UploadedFileSummary[];
  isFetching: boolean;
  onRefresh: () => void;
}

export default function QueueStatus({
  uploadedFiles,
  isFetching,
  onRefresh,
}: QueueStatusProps) {
  if (uploadedFiles.length === 0) {
    return null;
  }

  return (
    <div className="pt-6">
      <div className="mb-2 flex items-center justify-between">
        <h3 className="text-md font-semibold">Queue status</h3>
        <Button
          variant="outline"
          size="sm"
          onClick={onRefresh}
          disabled={isFetching}
        >
          {isFetching && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          Refresh
        </Button>
      </div>
      {/* 기존 table markup 유지 */}
    </div>
  );
}
```

다음 import는 제거한다.

```ts
import { useRouter } from "next/navigation";
import { useEffect, useTransition } from "react";
import { ACTIVE_UPLOAD_POLLING_INTERVAL_MS } from "~/fsd/entities/uploaded-file/model/polling";
import { isActiveProcessingStatus } from "~/fsd/entities/uploaded-file/model/processing-status";
```

## 6. Task 6: Upload success/failure 경로 invalidation 보완

- [ ] **Step 1: queryClient와 router를 추가한다**

```ts
import { useQueryClient } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { uploadedFileKeys } from "~/fsd/entities/uploaded-file/model/query-keys";
```

hook 내부:

```ts
const queryClient = useQueryClient();
const router = useRouter();
```

- [ ] **Step 2: async helper를 만든다**

```ts
const markUploadVisible = async () => {
  await queryClient.invalidateQueries({
    queryKey: uploadedFileKeys.lists(),
  });
  onSuccess?.();
};

const refreshRecoverableDrafts = () => {
  router.refresh();
};
```

`markUploadVisible()`는 반드시 `await`한다. 성공 toast만 띄우고 invalidation을 fire-and-forget으로 두면 optimistic row가 실제 row와 교체되는 시점이 늦어져 UI가 흔들릴 수 있다.

`currentUserActiveQueue(userId)`를 `uploadedFileKeys.lists()` 하위에 둔 이유가 여기서 중요하다. 이 invalidation 한 번으로 full list와 active queue가 함께 stale 처리되어 새 업로드 성공 후 active queue polling이 시작된다.

- [ ] **Step 3: confirm 실패 후 draft kept 경로에서 drafts를 갱신한다**

```ts
if (!confirmResult.success) {
  const reconcileResult = await reconcileUploadConfirmation(createdFileId);

  if (!reconcileResult.success || !reconcileResult.data.uploaded) {
    toast.error("Upload finished, but confirmation could not be verified.", {
      id: toastId,
      description:
        "The upload draft was kept. Retry later from Recoverable Uploads.",
    });
    refreshRecoverableDrafts();
    return;
  }
}
```

- [ ] **Step 4: schedule 실패 후 reconcile 성공 경로는 await 후 return한다**

```ts
if (!processResult.success) {
  const reconcileResult = await reconcileProcessingRequest(createdFileId);

  if (reconcileResult.success && reconcileResult.data.status !== "upload_pending") {
    createdFileId = null;
    toast.success("Video uploaded successfully", {
      id: toastId,
      description:
        "Your video has been scheduled for processing. Check the status below.",
      duration: 5000,
    });
    await markUploadVisible();
    return;
  }

  toast.error(processResult.error, {
    id: toastId,
    description:
      "The upload draft was kept. Resume processing from Recoverable Uploads.",
  });
  refreshRecoverableDrafts();
  return;
}
```

- [ ] **Step 5: 정상 성공 경로도 await한다**

```ts
createdFileId = null;
toast.success("Video uploaded successfully", {
  id: toastId,
  description:
    "Your video has been scheduled for processing. Check the status below.",
  duration: 5000,
});
await markUploadVisible();
```

- [ ] **Step 6: catch-reconcile 성공 경로는 error toast로 떨어지지 않게 return한다**

현재 코드에는 `processState?.success && status !== "upload_pending"`일 때 `createdFileId = null`만 하고 catch 하단의 error toast로 떨어지는 문제가 있다. 다음처럼 바꾼다.

```ts
if (processState?.success && processState.data.status !== "upload_pending") {
  createdFileId = null;
  toast.success("Video uploaded successfully", {
    id: toastId,
    description:
      "Your video has been scheduled for processing. Check the status below.",
    duration: 5000,
  });
  await markUploadVisible();
  return;
}
```

catch 하단의 draft-kept failure toast 앞에는 recoverable drafts 갱신을 추가한다.

```ts
if (!canAutoDeleteDraft) {
  refreshRecoverableDrafts();
}

toast.error("Failed to upload video", {
  id: toastId,
  description: canAutoDeleteDraft
    ? "There was a problem uploading your video. Please try again."
    : "The upload draft was kept. Resume later from Recoverable Uploads if needed.",
});
```

## 7. Task 7: Recoverable Uploads resume/discard invalidation

- [ ] **Step 1: queryClient를 추가한다**

```ts
import { useQueryClient } from "@tanstack/react-query";
import { uploadedFileKeys } from "~/fsd/entities/uploaded-file/model/query-keys";
```

component 내부:

```ts
const queryClient = useQueryClient();
```

- [ ] **Step 2: resume 성공 후 list invalidation과 router.refresh를 둘 다 수행한다**

```ts
toast.success("Processing resumed");
await queryClient.invalidateQueries({
  queryKey: uploadedFileKeys.lists(),
});
router.refresh();
```

- [ ] **Step 3: discard 성공 후에도 동일하게 수행한다**

```ts
toast.success("Upload discarded");
await queryClient.invalidateQueries({
  queryKey: uploadedFileKeys.lists(),
});
router.refresh();
```

여기서 `router.refresh()`는 유지한다. Recoverable Uploads 자체가 `DashboardPage` server prop인 `recoverableDrafts`를 사용하므로, resume/discard 후 draft 목록을 제거하려면 server prop 갱신이 필요하다. 이 refresh는 사용자 액션 성공 시에만 발생하므로 Neon idle 최적화와 충돌하지 않는다.

## 8. Task 8: Uploaded-file detail delete cache 정리

- [ ] **Step 1: queryClient와 types를 추가한다**

```ts
import { useQueryClient } from "@tanstack/react-query";
import { uploadedFileKeys } from "~/fsd/entities/uploaded-file/model/query-keys";
import type { UploadedFileSummary } from "~/fsd/entities/uploaded-file/model/types";
```

component 내부:

```ts
const queryClient = useQueryClient();
```

- [ ] **Step 2: runAction이 async onSuccess를 기다리게 한다**

```ts
type RunOptions = {
  action: () => Promise<ActionResult<void>>;
  successMessage: string;
  confirmationMessage?: string;
  onSuccess?: () => void | Promise<void>;
  startTransition: ReturnType<typeof useTransition>[1];
};
```

```ts
toast.success(successMessage);
await onSuccess?.();
```

- [ ] **Step 3: delete 성공 후 cache에서 즉시 제거한다**

`handleDelete()`의 `onSuccess`를 다음처럼 바꾼다.

```ts
onSuccess: async () => {
  queryClient.setQueriesData<UploadedFileSummary[]>(
    {
      queryKey: uploadedFileKeys.lists(),
      predicate: (query) => Array.isArray(query.state.data),
    },
    (old) => old?.filter((file) => file.id !== uploadedFileId),
  );
  queryClient.removeQueries({
    queryKey: uploadedFileKeys.detail(uploadedFileId),
  });
  await queryClient.invalidateQueries({
    queryKey: uploadedFileKeys.lists(),
  });
  router.push("/dashboard");
},
```

단순 invalidate만 하면 `/dashboard`로 이동했을 때 기존 list cache가 잠깐 보일 수 있다. 먼저 `setQueriesData`로 제거하고, 그 다음 invalidate로 서버 상태와 맞춘다.

중요: `currentUserActiveQueue(userId)`도 `uploadedFileKeys.lists()` 하위에 있으므로 `setQueriesData`는 반드시 `predicate: (query) => Array.isArray(query.state.data)`로 제한한다. `ActiveUploadedFileQueueState`는 `{ queueFiles, activeUploadedFileIds }` 객체라서 predicate 없이 `old?.filter(...)`를 적용하면 runtime error 또는 cache corruption이 생길 수 있다. `invalidateQueries({ queryKey: uploadedFileKeys.lists() })`는 full list와 active queue를 함께 stale 처리해야 하므로 그대로 prefix를 사용한다.

## 9. Task 9: Clip delete 후 detail clips와 `visibleClipsCount` 갱신

- [ ] **Step 1: queryClient와 detail 타입 import를 추가한다**

```ts
import { useQueryClient } from "@tanstack/react-query";
import { uploadedFileKeys } from "~/fsd/entities/uploaded-file/model/query-keys";
import type { UploadedFileDetail } from "~/fsd/entities/uploaded-file/model/types";
```

component 내부:

```ts
const queryClient = useQueryClient();
```

- [ ] **Step 2: 서버 delete 성공 후에만 detail cache와 list cache를 갱신한다**

현재 코드처럼 `onDeleteSuccess(clip.id)`를 `await onDelete(clip.id)`보다 먼저 호출하지 않는다. 서버 삭제가 실패하면 rollback 경로가 없기 때문이다.

```ts
const result = await onDelete(clip.id);

if (result.success) {
  const uploadedFileId = clip.uploadedFileId;

  if (uploadedFileId) {
    queryClient.setQueryData<UploadedFileDetail>(
      uploadedFileKeys.detail(uploadedFileId),
      (old) =>
        old
          ? {
              ...old,
              clips: old.clips.filter((item) => item.id !== clip.id),
            }
          : old,
    );
  }

  onDeleteSuccess(clip.id);

  await Promise.all([
    uploadedFileId
      ? queryClient.invalidateQueries({
          queryKey: uploadedFileKeys.detail(uploadedFileId),
        })
      : Promise.resolve(),
    queryClient.invalidateQueries({
      queryKey: uploadedFileKeys.lists(),
    }),
  ]);

  toast.success("Clip deleted");
} else {
  toast.error(result.error ?? "Failed to delete clip");
}
```

이 방식은 optimistic delete보다 반응이 약간 늦지만 가장 단순하고 안전하다. 실패 시에는 clip이 그대로 남고 error toast만 뜬다. 성공 시에는 detail query cache의 `clips` 배열에서 clip을 즉시 제거하고, detail/list query를 모두 invalidate해 서버 상태와 맞춘다. `clip.uploadedFileId`는 Prisma `Clip` 타입상 nullable이므로 guard를 둔다.

## 10. Task 10: Verification

- [ ] **Step 1: 정적 검색으로 위험 패턴을 확인한다**

```powershell
rg -n "setInterval|ACTIVE_UPLOAD_POLLING_INTERVAL_MS|router.refresh\\(\\)" src/fsd/pages/dashboard/ui/_component/QueueStatus.tsx
rg -n "dispatchPendingProcessingRequests\\(50\\)|queryFn: listCurrentUserUploadedFileSummaries" src
rg -n "async function nudgeProcessingDispatch" src/fsd/features/upload/api/index.ts
rg -n "dispatchId: string \\| null = null" src/fsd/features/upload/api/index.ts
rg -n "@@index\\(\\[status, processingStartedAt\\]\\)" prisma/schema.prisma
rg -n "@@index\\(\\[status, uploaded, processingStartedAt, queuedAt\\]\\)" prisma/schema.prisma
rg -n "@@index\\(\\[status, uploaded, createdAt\\]\\)" prisma/schema.prisma
rg -n "@@index\\(\\[status, uploaded, sourceUploadedAt\\]\\)" prisma/schema.prisma
rg -n "@@index\\(\\[userId, status, createdAt\\]\\)" prisma/schema.prisma
rg -n "@@index\\(\\[userId, createdAt\\]\\)" prisma/schema.prisma
rg -n "@@index\\(\\[status, nextRetryAt\\]\\)" prisma/schema.prisma
rg -n "@@index\\(\\[status, createdAt\\]\\)" prisma/schema.prisma
rg -n "@@index\\(\\[status, lockedAt\\]\\)" prisma/schema.prisma
rg -n "UploadedFile_status_processingStartedAt_idx" prisma/migrations
rg -n "UploadedFile_status_uploaded_processingStartedAt_queuedAt_idx" prisma/migrations
rg -n "UploadedFile_status_uploaded_createdAt_idx" prisma/migrations
rg -n "UploadedFile_status_uploaded_sourceUploadedAt_idx" prisma/migrations
rg -n "UploadedFile_userId_status_createdAt_idx" prisma/migrations
rg -n "UploadedFile_userId_createdAt_idx" prisma/migrations
rg -n "ProcessingDispatch_status_createdAt_idx" prisma/migrations
rg -n "ProcessingDispatch_status_lockedAt_idx" prisma/migrations
rg -n "cron:" src/inngest/functions.ts
rg -n "findStaleProcessingUploadedFiles\\(|take: limit|recoverStaleProcessingAttempts\\(25\\)" src/fsd/entities/uploaded-file/api/index.ts src/inngest/functions.ts
rg -n "processingMaintenanceSweep|uploadDraftSweep|processingDispatchSweep|staleProcessingSweep" src/app/api/inngest/route.ts src/inngest/functions.ts
rg -n "ActiveUploadedFileQueueState|listActiveUploadedFileQueueStateByUserId|listCurrentUserActiveUploadedFileQueueState|currentUserActiveQueue|currentUserActiveUploadQueueQueryOptions" src
rg -n "currentUserUploadedFileListQueryOptions|refetchInterval|currentUserActiveUploadQueueQueryOptions" src/fsd/features/upload/model/query-options.ts
rg -n "hadActiveUploadRef|UploadedFileList files=\\{optimisticFiles\\}" src/fsd/pages/dashboard/ui/index.tsx
rg -n "previousActiveUploadedFileIdsRef|activeUploadedFileIds|queueStatusFiles|UploadedFileList files=\\{queriedUploadedFiles\\}" src/fsd/pages/dashboard/ui/index.tsx
rg -n "setQueriesData<UploadedFileSummary\\[\\]>|predicate: \\(query\\) => Array\\.isArray\\(query\\.state\\.data\\)|removeQueries\\(" src/fsd/features/upload/ui/index.tsx
rg -n "setQueryData<UploadedFileDetail>|uploadedFileKeys\\.detail\\(|uploadedFileKeys\\.lists\\(|onDeleteSuccess\\(clip\\.id\\)" src/fsd/widgets/clip-display/ui/_component/ClipActions.tsx
```

기대 결과:

- `QueueStatus.tsx`에 active polling용 `setInterval`, `ACTIVE_UPLOAD_POLLING_INTERVAL_MS`, `router.refresh()`가 남아 있지 않다.
- 초기 구현에 `dispatchPendingProcessingRequests(50)`가 없다.
- `nudgeProcessingDispatch`는 `dispatchId: string | null = null` 형태다.
- `queryFn: listCurrentUserUploadedFileSummaries` 직접 대입이 없다.
- `prisma/schema.prisma`의 `UploadedFile` model에 `status/processingStartedAt`, `status/uploaded/processingStartedAt/queuedAt`, `status/uploaded/createdAt`, `status/uploaded/sourceUploadedAt`, `userId/status/createdAt`, `userId/createdAt` 인덱스가 있다.
- `prisma/schema.prisma`의 `ProcessingDispatch` model에 `status/nextRetryAt`, `status/createdAt`, `status/lockedAt` 인덱스가 있다.
- `prisma/migrations`에 신규 `UploadedFile_*` index 6개와 신규 `ProcessingDispatch_status_createdAt_idx`, `ProcessingDispatch_status_lockedAt_idx` 생성 SQL이 각각 있다.
- 새 migration에는 기존 `ProcessingDispatch_status_nextRetryAt_idx`를 다시 생성하는 SQL이 없다. schema에는 유지되어야 하지만 migration 중복 생성은 피한다.
- `src/inngest/functions.ts`의 processing cron은 `processingMaintenanceSweep` 하나이고 cron은 `*/15 * * * *`다.
- `findStaleProcessingUploadedFiles()`에는 `take: limit`가 있고 `processingMaintenanceSweep`는 `recoverStaleProcessingAttempts(25)`를 호출한다.
- `uploadDraftSweep` cron은 `0 * * * *`다.
- `src/app/api/inngest/route.ts`에는 `processingMaintenanceSweep`, `uploadDraftSweep`만 등록되고 `processingDispatchSweep`, `staleProcessingSweep`는 등록되지 않는다.
- active queue state type, entity API, server action, query key, query option이 모두 존재한다.
- `currentUserUploadedFileListQueryOptions()`에는 `refetchInterval`이 없고, `currentUserActiveUploadQueueQueryOptions()`에만 `refetchInterval`이 있다.
- `DashboardView`에 `hadActiveUploadRef`가 남아 있지 않고 `previousActiveUploadedFileIdsRef`와 `activeUploadedFileIds`가 있다.
- `QueueStatus`는 `queueStatusFiles`를 받고, `UploadedFileList files={optimisticFiles}`가 없고 `UploadedFileList files={queriedUploadedFiles}`가 있다.
- `src/fsd/features/upload/ui/index.tsx`의 detail delete cache mutation은 `setQueriesData<UploadedFileSummary[]>`와 `predicate: (query) => Array.isArray(query.state.data)`를 함께 사용한다.
- detail delete는 `uploadedFileKeys.lists()` prefix invalidation은 유지하되, 직접 `setQueriesData` mutation은 배열 list cache에만 적용한다.
- `src/fsd/widgets/clip-display/ui/_component/ClipActions.tsx`에서 `const result = await onDelete(clip.id);`가 `onDeleteSuccess(clip.id);`보다 먼저 나온다.
- `ClipActions.tsx`에 `setQueryData<UploadedFileDetail>`, `uploadedFileKeys.detail(...)`, `uploadedFileKeys.lists()`가 모두 있다.

- [ ] **Step 2: typecheck를 실행한다**

```powershell
npx.cmd prisma validate
npm.cmd run typecheck
```

기대 결과:

- Prisma schema와 새 인덱스 정의가 유효하다.
- `dispatchProcessingRequestById` import/export 오류가 없다.
- `listUploadedFileSummariesByUserId` value import 오류가 없다.
- `ActiveUploadedFileQueueState`, `listActiveUploadedFileQueueStateByUserId` import/export 오류가 없다.
- TanStack Query option callback 타입 오류가 없다.
- `RunOptions.onSuccess` async 변경에 따른 타입 오류가 없다.

- [ ] **Step 3: build를 실행한다**

```powershell
npm.cmd run build
```

기대 결과:

- Next Server Action boundary 오류가 없다.
- server/client import boundary 오류가 없다.
- dashboard page/layout build 오류가 없다.

- [ ] **Step 4: 수동 시나리오를 확인한다**

1. 새 파일 업로드
   - optimistic row가 즉시 표시된다.
   - 성공 후 실제 row로 교체된다.
   - 처리 중에는 active queue query만 polling되고 full uploaded-file list query는 polling되지 않는다.
   - 처리 완료 후 header credits가 한 번 갱신된다.
   - My Clips tab에는 `optimistic-*` detail link가 생기지 않는다.

2. 동시 업로드 2개 이상
   - active upload가 2개 이상인 상태에서 하나만 먼저 완료되어도 header credits가 한 번 갱신된다.
   - 나머지 active upload polling은 계속 active queue query로만 수행된다.
   - active upload가 25개를 넘어도 `activeUploadedFileIds` 전체 set에서 완료된 id를 감지한다.

3. S3 업로드 후 confirm 실패
   - draft가 자동 삭제되지 않는다.
   - Recoverable Uploads에 표시된다.

4. Recoverable Uploads resume
   - draft 목록에서 제거된다.
   - Queue status에 active row가 표시된다.

5. Uploaded file detail delete
   - `/dashboard`로 이동한다.
   - 삭제된 row가 list cache에서 즉시 사라진다.

6. Clip delete
   - 서버 delete 성공 후 detail 화면 clip이 사라진다.
   - 서버 delete 실패 시 detail 화면 clip은 그대로 남고 error toast가 뜬다.
   - detail query의 `clips` cache에서 삭제된 clip이 즉시 제거된다.
   - dashboard list의 `visibleClipsCount`가 다음 조회에서 갱신된다.

7. 사용자가 없는 시간대
   - `processingDispatchSweep`가 매분 실행되지 않고 `processingMaintenanceSweep`가 15분 단위로만 실행된다.
   - stale processing row가 많아도 한 번에 25개씩만 복구되어 Inngest 10초 제한을 넘길 가능성을 낮춘다.
   - `uploadDraftSweep`가 10분 단위가 아니라 1시간 단위로만 실행된다.
   - `staleProcessingSweep`가 별도 cron으로 route에 등록되지 않는다.
   - Neon active compute time이 이전보다 줄어든다.

## 11. 리스크와 대응

| 리스크 | 원인 | 대응 |
| --- | --- | --- |
| 새 업로드 dispatch가 오래된 pending row에 밀림 | 기존 `dispatchPendingProcessingRequests(1)`은 createdAt asc batch 처리 | `dispatchProcessingRequestById(dispatchId)`를 먼저 호출하고 실패 시에만 small batch fallback |
| dispatch가 너무 빨리 dead-letter됨 | cron을 15분으로 낮추면서 dead-letter age가 15분 그대로임 | `DISPATCH_DEAD_LETTER_AGE_MS = 60 * 60_000` |
| Inngest timeout | `maxDuration = 10`인데 fallback batch를 너무 크게 잡음 | 초기 `25`, duration 관측 후 `50` 검토 |
| processing maintenance가 stale recovery에서 timeout | `findStaleProcessingUploadedFiles()`가 limit 없이 모든 stale processing row를 읽음 | `findStaleProcessingUploadedFiles(staleBefore, limit = 25)`와 `recoverStaleProcessingAttempts(25)`로 제한 |
| maintenance/query가 인덱스를 제대로 못 탐 | `UploadedFile`에 `@@index([s3Key])`만 있고 새 status/time/user 조건 인덱스가 없음 | `status/processingStartedAt`, `status/uploaded/processingStartedAt/queuedAt`, `status/uploaded/createdAt`, `status/uploaded/sourceUploadedAt`, `userId/status/createdAt`, `userId/createdAt` 복합 인덱스와 migration 추가 |
| current user list가 정렬 최적화를 못 탐 | 실제 쿼리는 `status != "upload_pending"` + `createdAt desc`라 `userId/status/createdAt`만으로는 `createdAt` ordering이 약해질 수 있음 | full list 전용 `@@index([userId, createdAt])`를 추가하고, `userId/status/createdAt`는 active queue 전용으로 유지 |
| ProcessingDispatch sweep이 backlog에서 scan/sort가 커짐 | 기존 `status/nextRetryAt`는 `pending createdAt asc`와 `sending lockedAt < staleBefore`에 충분하지 않음 | `@@index([status, createdAt])`, `@@index([status, lockedAt])`를 추가하고 기존 `@@index([status, nextRetryAt])`는 유지 |
| migration 생성 중 Neon dev DB에 바로 적용됨 | `prisma migrate dev`는 migration 파일 생성과 DB 적용을 함께 수행할 수 있음 | `npx.cmd prisma migrate dev --name neon_idle_query_indexes --create-only`로 파일만 만들고 적용은 `npm.cmd run db:migrate`로 분리 |
| Neon idle window가 여전히 짧음 | `processingDispatchSweep`만 낮추면 `uploadDraftSweep`가 10분마다 DB를 깨움 | `uploadDraftSweep` cron을 `0 * * * *`로 낮추고 정상 업로드 경로는 즉시 reconcile에 맡긴다 |
| processing recovery cron이 중복됨 | `staleProcessingSweep`가 15분 별도 cron으로 남아 processing maintenance를 따로 실행 | `processingMaintenanceSweep`에서 dispatch drain과 stale recovery를 함께 실행하고 route 등록은 하나로 유지 |
| recovered dispatch가 15분 더 지연됨 | `recoverStaleQueuedDispatches()`와 `dispatchPendingProcessingRequests(25)`를 `Promise.all`로 병렬 실행하면 dispatch drain이 방금 retryable로 바뀐 row를 못 볼 수 있음 | `processingMaintenanceSweep`에서 stale recovery를 먼저 실행하고 마지막에 dispatch drain을 실행 |
| active upload 중 polling DB work가 큼 | full uploaded-file list query는 모든 non-draft file과 전체 file id 대상 `clip.groupBy()`를 읽음 | full list는 polling하지 않고 `listActiveUploadedFileQueueStateByUserId(userId, 25)` 기반 active queue state query만 polling |
| active upload가 25개를 넘을 때 완료 감지 누락 | queue 표시용 `queueFiles`만으로 active id set diff를 만들면 오래된 active row가 limit 밖으로 빠질 수 있음 | `ActiveUploadedFileQueueState.activeUploadedFileIds`는 limit 없이 전체 active id를 담고, `queueFiles`만 25개로 제한 |
| 성공했는데 error toast가 뜸 | catch-reconcile 성공 후 `return` 없음 | 성공 toast, `await markUploadVisible()`, `return` |
| Recoverable Uploads stale | `router.refresh()` polling 제거 후 draft prop 갱신 경로 없음 | draft-kept failure와 resume/discard 성공 시 `router.refresh()` |
| 여러 active upload 중 하나 완료 시 credits stale | `hasActiveUpload` boolean이 계속 true라 one-shot refresh가 발생하지 않음 | 이전/현재 active uploaded-file id set을 비교해 빠진 id가 있으면 `router.refresh()` |
 ㅎ