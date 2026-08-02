---
status: "pending"
stage: "draft"
proposal-size: "standard"
created-at: "2026-06-30"
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

# Processing Concurrency Hardening Proposal

Date: 2026-06-30

## Summary

현재 프로젝트는 같은 사용자가 `generate clip` 작업을 1분 간격으로 2번 요청해도 정상 경로에서는 Modal/GPU 작업이 동시에 2개 실행되지 않아야 한다. `src/inngest/functions.ts`의 `processVideo` 함수가 Inngest concurrency를 `limit: 1`, `key: "event.data.userId"`로 설정하고 있기 때문이다.

다만 현재 구조는 Inngest concurrency에 크게 의존한다. DB와 애플리케이션 레벨에서는 같은 사용자의 두 작업이 동시에 active 상태로 존재할 수 있으며, UI에서도 두 작업이 모두 처리 중인 것처럼 보일 수 있다. 따라서 개선 방향은 "두 번째 요청은 queue로 허용하되, 실제 `processing` 상태와 Modal dispatch는 사용자당 1개만 가능하게 하드 가드로 보강"하는 것이다.

## Current Behavior

### Verified Flow

- 사용자가 업로드를 완료하면 `scheduleUploadedFileProcessing()`이 호출된다.
- `scheduleProcessingAttempt()`는 해당 `UploadedFile` row를 `pending_enqueue`로 바꾸고 `ProcessingDispatch` row를 만든다.
- `dispatchProcessingRequestByIdOrFail()`은 해당 dispatch를 claim한 뒤 Inngest event `process-video-events`를 보낸다.
- Inngest `processVideo` 함수는 `concurrency: { limit: 1, key: "event.data.userId" }`로 등록되어 있다.
- worker가 실제 시작되면 `startUploadedFileProcessingAttempt()`가 해당 업로드 상태를 `queued`에서 `processing`으로 바꾼다.
- Modal endpoint 호출은 `send-to-modal` step 이후에 발생한다.

### Important Files

- `src/fsd/entities/uploaded-file/api/index.ts`
- `src/fsd/entities/processing-dispatch/api/index.ts`
- `src/inngest/functions.ts`
- `src/app/api/webhooks/modal/route.ts`
- `prisma/schema.prisma`
- `src/fsd/entities/uploaded-file/model/processing-status.ts`
- `src/fsd/pages/pricing/config/index.ts`

## Problem Statement

현재 구조에서 가장 큰 문제는 실제 동시 실행보다 상태 의미와 하드 안전장치 부족이다.

1. `scheduleProcessingAttempt()`는 같은 사용자의 다른 active upload 존재 여부를 보지 않는다.
2. `startUploadedFileProcessingAttempt()`도 같은 사용자의 다른 `processing` row 존재 여부를 직접 확인하지 않는다.
3. `pending_enqueue`, `queued`, `processing`이 모두 active 상태로 묶여 있어 UI에서 두 작업이 모두 processing 중인 것처럼 해석될 수 있다.
4. `pricing` 문구에는 "Concurrency: one active processing run per user."라고 되어 있지만, 실제 구현은 "one running Inngest function per user"에 더 가깝다.
5. 크레딧 체크가 `credits <= 0`만 막고 있어, `clipCount`가 2~4일 때 "1 credit per generated clip" 정책과 완전히 일치하지 않는다.

## Recommendation

추천 정책은 다음과 같다.

> 같은 사용자의 여러 요청은 queue로 받을 수 있다. 하지만 실제 `processing` 상태와 Modal/GPU 실행은 사용자당 항상 1개만 허용한다.

이 방식이 현재 코드와 가장 잘 맞는다.

- 사용자가 두 번째 요청을 다시 기억해서 수동으로 누를 필요가 없다.
- Inngest의 per-user concurrency 설계와 맞다.
- 대기열 UX를 만들 수 있다.
- DB safety guard를 추가하면 Inngest 설정 변경이나 우회 호출에도 더 안전하다.

반대로 "active 작업 자체를 사용자당 1개만 허용"하는 정책도 가능하지만, 현재 `pending_enqueue`/`queued` 모델과 queue UI를 덜 활용하게 된다. 사용성도 떨어진다.

## Proposed Changes

### 1. Status Semantics Clarification

`processing`은 실제 worker가 claim했고 Modal dispatch가 진행 중인 상태에만 사용한다.

현재 active status는 유지하되 UI 표현을 분리한다.

- `pending_enqueue`: Scheduling
- `queued`: Waiting
- `processing`: Processing
- `processed`: Processed
- `failed`: Failed
- `no credits`: No Credits

사용자에게 "2 jobs processing"처럼 보이지 않게 queue table, status badge, upload detail timeline의 copy를 점검한다.

Relevant files:

- `src/fsd/entities/uploaded-file/model/processing-status.ts`
- `src/fsd/entities/uploaded-file/ui/UploadedFileStatusBadge.tsx`
- `src/fsd/pages/dashboard/ui/_component/QueueStatus.tsx`
- `src/fsd/pages/upload-detail/ui/_component/ProcessingTimeline.tsx`

### 2. DB-Level Processing Guard

Neon Postgres partial unique index를 추가한다. (참고: `CLAUDE.md`는 DB를 "SQLite"로 적고 있으나 실제 런타임은 Neon Postgres이다 — `@prisma/adapter-neon`, `package.json`. partial unique index 문법은 Postgres에서 유효하다.)

```sql
CREATE UNIQUE INDEX "UploadedFile_one_processing_per_user_idx"
ON "UploadedFile"("userId")
WHERE "status" = 'processing';
```

이 인덱스는 같은 사용자의 `processing` row가 동시에 2개 생기는 것을 DB가 직접 막는다.

전제 조건 (구현 전 확인):

- `status = 'processing'`으로 **진입하는 유일한 writer는 `startUploadedFileProcessingAttempt()`** 이다 (`src/fsd/entities/uploaded-file/api/index.ts`의 유일한 `data: { status: "processing" }`). 범용 함수 `updateUploadedFileStatus()`에 `"processing"`을 넘기는 호출자가 없는지 한 번 더 확인한다. (현재 코드 기준 진입 writer 1곳으로 확인됨)
- 이 인덱스는 `processing`으로 **들어가는** 전환만 제약한다. `processing → processed/failed`로 나가는 전환(`markUploadedFileAttemptProcessed`, `markUploadedFileAttemptFailed`, stale 회수)은 영향받지 않는다.

마이그레이션 메커니즘:

- Prisma schema는 partial index 표현에 제한이 있으므로 migration SQL에 직접 추가한다.
- `CREATE UNIQUE INDEX CONCURRENTLY`는 Prisma migrate의 트랜잭션 래핑 안에서 실행할 수 없다. 현재 테이블 규모(1인 SaaS)에서는 평범한 `CREATE UNIQUE INDEX`의 짧은 락으로 충분하므로 `CONCURRENTLY`는 사용하지 않는다.
- 이 partial unique index는 `userId` + `status='processing'` 조회 인덱스를 겸하므로 같은 목적의 인덱스를 별도로 추가하지 않는다. (기존 `@@index([userId, status, createdAt])`도 이미 존재)

### 3. Application-Level Claim Guard

`startUploadedFileProcessingAttempt()`는 **이미 attempt 단위 원자적 claim**이다 (`status: "queued", processingStartedAt: null` 가드의 `updateMany`, `src/fsd/entities/uploaded-file/api/index.ts`). 새로 만들지 말고 이 함수를 확장해 **사용자 단위** 조건을 추가한다. 빠진 것은 "사용자 단위" 한 조건뿐이다.

기존 자산을 재사용한다:

- `hasProcessingUploadForUser(userId)`가 이미 존재한다 (`src/fsd/entities/uploaded-file/api/index.ts`). 단, 현재 `db`를 직접 쓰므로 트랜잭션 일관성을 위해 `tx` 인자를 받도록 보강한다.
- P2002(unique 위반) catch 선례가 이미 있다 (`src/fsd/features/upload/api/index.ts`의 `scheduleProcessingAttempt`가 기존 `@@unique([uploadedFileId, attempt])`에 대응). 같은 패턴을 이 claim에 적용한다.

claim 트랜잭션 설계:

1. (fast path) `hasProcessingUploadForUser(userId, { tx })`로 같은 사용자의 다른 `processing` row 존재를 먼저 확인한다. 있으면 claim하지 않고 `already_processing`을 반환한다.
2. 없으면 기존 `updateMany`(queued → processing)를 수행한다.
3. **partial unique index 위반(P2002)을 반드시 catch**한다. 두 트랜잭션이 1단계 SELECT를 동시에 통과하면(아직 존재하지 않는 row는 SELECT가 잠그지 못함) 한쪽의 UPDATE가 P2002로 **throw**된다. 이때 `already_processing`으로 매핑한다.

> 중요: partial unique index가 걸린 상태에서 두 번째 `processing` row가 생기려 하면, `updateMany`는 `count: 0`을 반환하는 것이 아니라 **P2002를 throw**한다 (WHERE가 해당 queued row와 매칭되어 Postgres가 UPDATE를 시도하기 때문). 따라서 1단계 SELECT는 편의용 fast path일 뿐이고 **실제 불변식 보증은 인덱스 + P2002 catch**다. P2002를 처리하지 않으면 `processVideo`의 `step.run`(retries: 1) 안에서 throw → 재시도 실패 → catch 블록이 엉뚱하게 `backend_failed`로 마킹한다.

권장 반환 타입:

```ts
type StartProcessingAttemptResult =
  | { status: "started" }
  | { status: "already_processing" }
  | { status: "not_claimable" };
```

`processVideo` worker 처리 (`src/inngest/functions.ts`의 claim 단계는 현재 `result.count === 1`을 쓰므로 함께 수정):

- `started`: 그대로 Modal dispatch로 진행한다.
- `already_processing`: Modal을 호출하지 않는다. row는 `queued`로 그대로 두고 경고 로그를 남긴 뒤 종료한다(skip).
- `not_claimable`: (이미 다른 상태로 advance됨) skip한다.

복구 의미 (정직하게):

- 정상 경로에서 두 번째 요청이 "대기 후 실행"되는 것은 DB 가드가 아니라 **Inngest `concurrency: { limit: 1, key: "event.data.userId" }`가 두 번째 worker의 시작 자체를 지연**시키기 때문이다 (`src/inngest/functions.ts`). 이 경우 첫 작업이 끝난 뒤 두 번째 worker가 시작되며, 그 시점에는 다른 `processing` row가 없으므로 정상적으로 `started`가 된다.
- `already_processing` 분기는 **Inngest concurrency가 우회된 비정상 케이스에서만** 발생하는 방어선이다. 이때 worker는 row를 `queued`로 남기고 skip하지만, **끝난 작업을 다시 dispatch하는 메커니즘은 없다.** 해당 row는 기존 stale 회수(`reconcileStaleUploadedFilesForUser`의 `queued_worker_not_started`)로 timeout 후 `failed` 처리된다. 즉 "graceful re-queue 후 재실행"이 아니라 "대기 후 timeout 실패"로 수렴한다.
- 명시적 re-dispatch(끝난 뒤 queued 작업을 자동 재큐잉)는 이번 범위 밖이다(별도 후속 항목). 현재 구조에서는 비정상 케이스의 안전한 종료가 목표이므로 이 수렴 동작으로 충분하다.

### 4. Queue Policy Alignment

정책 문구를 코드와 맞춘다.

현재 문구:

```text
Concurrency: one active processing run per user.
```

추천 문구:

```text
Concurrency: one running processing job per user. Additional requests wait in queue.
```

이 문구는 실제 정책과 더 정확히 맞는다.

Relevant file:

- `src/fsd/pages/pricing/config/index.ts`

### 5. Credit Guard Improvement

현재 worker는 `context.user.credits <= 0`만 확인한다 (`src/inngest/functions.ts`). 그리고 완료 시 차감은 `decrementUserCreditsFloorZero(userId, clipsFound)`로 **0에서 바닥 처리**된다 (`completeUploadedFileProcessingAttempt`, `src/fsd/entities/uploaded-file/api/index.ts`).

실제 누수 지점은 이 floorZero다. 크레딧 1개로 4클립 요청 시 4개 생성 → 차감 4가 1로 floored → 3개가 무료로 나간다.

정책이 "1 credit per generated clip"이면 시작 전에 다음을 확인한다.

```ts
context.user.credits >= clipCount
```

- 왜 `clipsFound`(생성 수)가 아니라 `clipCount`(요청 수)인가: 사전 게이트는 생성 전이라 생성 수를 알 수 없다. `credits >= clipCount`를 요구하면 `clipCount >= clipsFound`이므로 완료 시 floorZero가 **절대 floor되지 않아** 누수가 사라진다. 사전 가드와 사후 차감이 정합해진다.
- `context.user.credits`는 worker 시작 시점(`load-processing-context` step)에 로드된다. Inngest concurrency로 같은 사용자 작업이 직렬 실행되므로, 두 번째 작업이 시작될 땐 첫 작업의 차감이 반영된 fresh 값이다.
- 부족 시 Modal dispatch 전에 `no credits`로 마킹한다 (`markUploadedFileAttemptNoCredits`).

정책 문구 일관성 (Section 4와 함께):

- `credits < clipCount` 차단은 과금 로직 변경이 아니라 사전 게이트다. 다만 "N클립 실행을 시작하려면 N크레딧이 필요하다"는, pricing의 `"Processing starts only when the account has a positive credit balance."`(`src/fsd/pages/pricing/config/index.ts`)보다 약간 더 엄격한 진입 조건이다. 이 copy를 진입 조건에 맞게 한 줄 갱신해 모순을 없앤다. (FAQ의 "per generated clip in a completed run, 부분 완료 시 미차감"은 사후 과금 의미이므로 그대로 유지)

더 좋은 장기 구조는 credit reservation이다.

- queue 등록 시 필요한 credit을 reserve한다.
- 성공하면 reserved credit을 확정 차감한다.
- 실패하거나 incomplete이면 reserved credit을 반환한다.

다만 reservation은 schema와 billing semantics를 건드리므로 별도 phase로 분리하는 것이 좋다. 단기적으로는 `credits < clipCount`를 `no credits`로 처리하는 보완부터 적용한다.

## Codebase Reconciliation Notes

이 제안은 현재 코드와 대조해 다음을 반영했다.

재사용 자산 (새로 만들지 않는다):

- `hasProcessingUploadForUser(userId)` — 사용자 단위 processing 존재 확인 (`tx` 인자만 보강).
- `startUploadedFileProcessingAttempt()` — 이미 attempt 단위 원자적 claim. 사용자 조건 + P2002 처리만 추가.
- P2002 catch 패턴 — `scheduleProcessingAttempt`(`src/fsd/features/upload/api/index.ts`)에 선례 존재.
- stale 회수(`reconcileStaleUploadedFilesForUser`) — `already_processing` skip 후 복구를 위임.

환경 사실:

- 런타임 DB는 Neon Postgres다 (`CLAUDE.md`의 "SQLite"는 stale). partial unique index 전제가 유효하다.
- 자동화 테스트 프레임워크가 없다 — Phase 3 참조.

핵심 불변식:

- `processing` 동시성 보증의 최종 근거는 **DB partial unique index + P2002 catch**다. app-level SELECT는 fast path일 뿐이다.
- queue 순서 보증은 Inngest concurrency가 제공한다. DB 가드는 우회 케이스의 방어선이다.

## Implementation Plan

### Phase 1: Make Status Honest

1. Status badge와 queue/timeline 문구를 점검한다.
2. `queued`와 `processing`이 같은 의미로 보이지 않게 한다.
3. **동시성** pricing 문구(Section 4)만 맞춘다. 이미 참인 동작(Inngest 직렬화)을 기술하므로 게이트 구현과 무관하게 안전하다. 크레딧 진입 게이트 문구(Section 5)는 게이트가 실제로 강제되는 Phase 2로 미룬다 (아직 강제되지 않는 약속을 막기 위해).

### Phase 2: Add Hard Processing Guard and Credit Gate

전제: `status='processing'` 진입 writer가 `startUploadedFileProcessingAttempt()` 단일임을 확인한다 (Section 2).

Processing guard:

1. partial unique index migration을 추가한다 (raw SQL, plain `CREATE UNIQUE INDEX`).
2. `hasProcessingUploadForUser()`에 `tx` 인자를 추가한다 (기존 함수 재사용).
3. `startUploadedFileProcessingAttempt()`를 transaction 기반 claim으로 바꾼다: 사용자 단위 사전 확인 + 기존 attempt 단위 `updateMany` + **P2002 catch → `already_processing`**. 반환 타입을 union으로 바꾼다 (Section 3).
4. `processVideo`의 claim 단계를 `result.count === 1`에서 union 처리로 바꾼다 (`started`/`already_processing`/`not_claimable`).
5. `already_processing`이면 Modal 미호출 + row를 `queued` 유지 + warning log + skip. (재실행은 기존 stale 회수에 위임 — Section 3 복구 의미 참조)

> index 추가(1)와 claim 코드 변경(2~4)은 **같은 배포에 묶는다.** 인덱스만 먼저 배포되면 기존 claim 코드(`result.count` 기대)가 P2002 throw에 노출된다.

Credit gate (Section 5):

6. `processVideo`의 크레딧 체크를 `credits <= 0`에서 `credits < clipCount` → `no credits`로 바꾼다 (Modal dispatch 전, `clipCount`는 `event.data.clipCount`).
7. 크레딧 진입 게이트 pricing copy를 **이 배포에서 함께** 갱신한다 (`src/fsd/pages/pricing/config/index.ts`의 `"Processing starts only when the account has a positive credit balance."` → "요청 클립 수만큼 크레딧이 있어야 시작" 취지). 게이트가 실제로 강제되는 시점에 copy를 바꿔 copy-동작 불일치 구간을 없앤다.

### Phase 3: Verification

현재 이 프로젝트에는 **테스트 프레임워크가 없다** (`package.json`에 vitest/jest/playwright 없음; `check` = `next lint && tsc --noEmit`; `src` 내 테스트 파일 0개; `CLAUDE.md`의 Testing은 수동 Inngest dev UI만 안내). 따라서 "테스트 추가"는 곧 "하네스 구축"이라는 별도 작업이다.

핵심 보증(같은 사용자 두 queued 중 하나만 `processing`)은 **DB partial unique index에 사는 보증**이라 mock 단위 테스트로 검증할 수 없다 — 실제 Postgres가 필요하다.

Core 검증 (이번 범위, 하네스 불필요):

1. 마이그레이션 전 중복 점검 SQL(아래 Pre-Migration Check)을 돌린다.
2. Inngest dev UI(`npm run inngest-dev`)로 같은 사용자 작업 2건을 연속 트리거해, 첫 번째만 `processing`, 두 번째는 `queued`로 남는지 확인한다.
3. 인덱스 적용 후, 같은 사용자에 `status='processing'` row를 2개 만들려는 SQL이 unique 위반으로 실패하는지 확인한다.
4. credit이 `clipCount`보다 부족한 업로드가 Modal dispatch 전에 `no credits`가 되는지 수동 확인한다.
5. (Phase 1) 대시보드에서 1 processing + 1 queued 상태가 "2개 처리 중"으로 보이지 않고 queue와 processing이 구분되는지, status badge·queue·timeline copy를 눈으로 확인한다.

자동화 (결정 필요, 후속):

- 아래 케이스는 실 Postgres 통합 테스트가 필요하므로, vitest + 테스트용 Postgres(또는 Neon branch) 하네스를 세운 뒤에만 작성 가능하다. **하네스 투자 여부는 별도 결정 사항이다.**
  - 같은 사용자 두 번째 queued가 첫 번째 `processing` 동안 claim되지 않는다 (P2002 → `already_processing`).
  - 서로 다른 사용자는 각각 `processing` 가능.
  - 같은 업로드의 stale attempt는 current-attempt 가드로 무시된다.

### Phase 4: Optional Credit Reservation

필요하면 별도 proposal로 분리한다.

Reservation이 필요한 이유:

- queue 시점에 사용자가 충분한 credit을 보유했는지 명확히 보장할 수 있다.
- 여러 queued 작업이 동일한 credit balance를 공유해서 과도하게 예약되는 상황을 막을 수 있다.
- 실패/partial completion/refund 정책을 더 명확히 만들 수 있다.

## Acceptance Criteria

- 같은 사용자에 대해 DB에 `status = 'processing'`인 `UploadedFile` row가 동시에 2개 생길 수 없다.
- 같은 사용자가 작업 2개를 요청하면 첫 번째만 `processing`, 두 번째는 `queued` 또는 waiting 상태로 보인다.
- Inngest concurrency가 유지되는 한 같은 사용자의 Modal dispatch는 직렬 실행된다.
- UI copy는 active queue와 actual processing을 혼동시키지 않는다.
- pricing 문구는 실제 동작과 일치한다.
- credit 부족 상태는 Modal dispatch 전에 감지된다.

## Risk Assessment

### Low Risk

- UI copy/status badge 조정
- pricing 문구 수정
- warning log 추가

### Medium Risk

- `startUploadedFileProcessingAttempt()` claim 로직 변경 (P2002 catch 누락 시 정상 경로도 `backend_failed`로 오마킹될 수 있으므로 index 추가와 claim 변경을 같은 배포로 묶는다)
- Inngest worker의 claim result 처리 변경 (`result.count === 1` → union)
- 수동 검증 절차 추가 (자동화 하네스는 별도 결정)

### Higher Risk

- credit reservation 도입
- active job scheduling 정책을 queue 허용에서 request rejection으로 변경
- existing production data에 partial unique index를 추가하기 전 중복 processing row가 존재하는 경우

## Pre-Migration Check

Partial unique index를 추가하기 전에 production DB에서 아래 조건을 확인해야 한다.

```sql
SELECT "userId", COUNT(*)
FROM "UploadedFile"
WHERE "status" = 'processing'
GROUP BY "userId"
HAVING COUNT(*) > 1;
```

결과가 있으면 먼저 stale/invalid processing row를 정리한 뒤 index를 추가한다.

배포 순서: index migration과 P2002를 처리하는 claim 코드 변경은 같은 배포에 포함한다 (Phase 2 참조). 인덱스만 먼저 적용되면 기존 claim 코드가 P2002 throw에 노출된다.

## Final Direction

가장 현실적인 개선 방향은 다음이다.

1. queue는 허용한다. (대기 순서 보증은 Inngest concurrency가 제공)
2. 실제 `processing`은 사용자당 1개만 강제한다. 최종 근거는 DB partial unique index + P2002 catch, app-level 확인은 fast path.
3. UI는 queued와 processing을 명확히 구분한다.
4. credit check는 `clipCount` 기준으로 강화한다.
5. credit reservation은 후속 단계로 분리한다.

이 방향이면 현재 Inngest 기반 구조를 유지하면서도 동시성 보장을 Inngest 설정 하나에만 의존하지 않게 된다.
