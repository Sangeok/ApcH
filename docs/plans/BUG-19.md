# BUG-19: 매분 cron 4개를 이벤트 구동 단일 정비 함수로 대체

agent: web-dev

## 현재 동작

프로덕션 Inngest에 **매분 도는 cron 함수가 4개** 등록돼 있다.

- `apps/web/src/inngest/card-news-functions.ts:112` `{ cron: "* * * * *" }` — `dispatch-pending-card-news`. 본문은 `listRecoverableCardNewsJobs(new Date(), 100)`(`:114`)로 발송 대상 job을 뽑아 각각 `dispatchCardNewsJob(id)`를 `step.run`으로 돌리고(`:118`), `listPendingCardNewsAnalyticsJobs(100)`(`:122`)로 analytics outbox를 비운다(`:125`).
- `card-news-functions.ts:132` `{ cron: "* * * * *" }` — `reconcile-card-news-jobs`. `listRecoverableCardNewsJobs`로 뽑아 각각 `reconcileCardNewsJob(id)`(`:138`).
- `card-news-functions.ts:143` `{ cron: "* * * * *" }` — `cleanup-card-news-assets`. `listAssetCleanupJobs(new Date(), 100)`(`:148`)로 뽑아 각각 `runCardNewsCleanup(id)`(`:153`).
- `apps/web/src/inngest/video-reservation-functions.ts:5` `{ cron: "* * * * *" }` — `reconcile-video-credit-reservations`. 본문은 `reconcileVideoReservations`를 한 step으로 부른다(`:7`).

넷은 `apps/web/src/app/api/inngest/route.ts:30-33`에서 `serve`에 등록된다. 같은 파일 `:19` `export const maxDuration = 300` — step당 300초 예산.

**작업별 step은 운영 504의 수정이다 — 되돌리면 안 된다.** 카드뉴스 cron 셋은 원래 벌크 헬퍼(`job-lifecycle.ts:1126` `dispatchPendingCardNewsJobs`·`:1138` `recoverCardNewsJobs`·`cleanup.ts:504` `cleanupPendingCardNewsAssets` — 목록을 받아 내부 루프로 처리)를 한 step에서 불렀다. 2026-10-20 운영에서 이 구조가 HTTP 504 `FUNCTION_INVOCATION_TIMEOUT`을 냈고(`docs/card-news-release-verification-20261020.md:62` — 「최대 100개 작업을 한 step에서 순차 처리하는 구조」), `4859d2e`(PR #136)가 목록 step 1개 + **작업별 step**으로 바꾸고 `maxDuration`을 10→300으로 올렸다. `apps/web/src/inngest/card-news-functions.test.mjs`가 이 불변을 지킨다 — 작업 하나가 예산의 60%를 쓰는 모델에서 셋 cron이 4개 작업에 모두 닿아야 통과한다(`:27-32` 예산 모델·`:88-96` 단언). 벌크 헬퍼는 지금 어디서도 불리지 않는다.

**할 일의 기한은 이미 DB 행이 알고 있다.**
- 카드뉴스 job: `listRecoverableCardNewsJobs`(`entities/card-news/api/index.ts:168-184`)는 status pending/running이고 `nextDispatchAt: null | nextDispatchAt <= now | deadlineAt <= now`인 행이다. 생성 시 `nextDispatchAt: now`(`job-lifecycle.ts:302`), 발송 성공·실패 뒤 `now+60_000`(`:356`·`:373`). `deadlineAt`은 생성 시 `now+CARD_NEWS_CONFIG.jobTimeoutMs`(900초, `:301`).
- **claim은 `nextDispatchAt`을 지우지 않는다**: `claimCardNewsJob`의 갱신은 `status`·`workerRunId`·`claimedAt`·`heartbeatAt`뿐이다(`job-lifecycle.ts:412-420`). 그래서 워커가 도는 job도 발송 60초 뒤부터는 계속 목록에 남는다.
- **발송 게이트**: `dispatchCardNewsJob`(`job-lifecycle.ts:321`)은 비활성·마감 경과·발송 리스(`dispatchLeaseUntil > now`)·**claim됐고 heartbeat가 90초 안**이면 아무것도 하지 않고 돌아간다(`:325-333`, `:331` `now.getTime() - job.heartbeatAt.getTime() < 90_000)`). 이 경우 `nextDispatchAt`도 갱신하지 않는다. 반대로 **heartbeat가 90초 넘게 끊긴 claim job은 다시 발송한다** — 새 워커 런은 heartbeat가 낡았으면 다른 `workerRunId`로도 claim할 수 있다(`:405-411`, `:409` 같은 `< 90_000`). 매분 cron이 해 주던 「죽은 워커의 재발송」이 이것이다. 발송 리스는 `now+45_000`(`:338`).
- 정리 행: `listAssetCleanupJobs`(`entities/card-news/api/index.ts:295-313`)는 status != completed, `notBefore <= now`, `(nextRetryAt null | <= now)`, `(leaseUntil null | <= now)`. claim은 리스 50초를 잡고 `attemptCount`를 1 올린다(`entities/card-news/api/index.ts:385`, `cleanup.ts:326`). 실행의 모든 실패는 catch에서 리스를 풀고 `nextRetryAt`을 **60초 고정**으로 잡는다(`cleanup.ts:480-501`, `:492` `nextRetryAt: new Date(cardNewsRuntime().now().getTime() + 60_000)`). 막힌 정리 행이 끝없이 매분 재시도됨은 주석에도 있다(`entities/card-news/api/index.ts:308-309`).
- 영상 복구 후보: `listProcessingDispatchRecoveryCandidates`(`entities/processing-dispatch/api/index.ts:69-82`)는 `r.status='held' OR (f.status='processing' AND f.currentAttempt=d.attempt AND d.kind='analyze')`. 기한은 `ProcessingDispatch.deadlineAt`(claim 시 `apps/web/src/fsd/features/upload/api/claim-processing-attempt.ts:151` `now + 65*60_000`). `reconcileVideoReservations`(`features/upload/api/reconcile-video-reservations.ts:34`)는 후보의 producer가 끝났거나 마감이 지났어도 **업로드가 `processing`이 아니면 정산하지 않고 넘어간다**(`:68`) — 그런 후보는 다음 틱에도 그대로 후보다.

**깨우는 이벤트는 이미 다 있다.** `apps/web/src/inngest/client.ts`의 `Events`에 `card-news/generate.requested`·`card-news/render.requested`·`card-news/completed`(`card-news-contract.ts:7-11`), `processing/attempt.claimed`(`client.ts:50-58`)가 정의돼 있다. `processing/attempt.claimed`는 `functions.ts:222`·`:637`에서 발송되고 `watchProcessingAttempt`(`functions.ts:902`)가 이미 이벤트 구동+`step.sleep`로 돈다(cron 아닌 패턴의 선례).

**카드뉴스 화면은 활성 작업이 있는 동안 5초마다 폴링한다**: `features/card-news/model/query-options.ts:24-30`(목록)·`:53-58`(상세) `refetchInterval` → `5000`. 폴링이 부르는 서버 함수는 `features/card-news/api/index.ts`의 `listCardNews`(`:96`)·`getCardNewsDetail`(`:111`)이다.

**읽기 시 복구 선례**: `apps/web/src/app/dashboard/page.tsx:26` `await reconcileStaleUploadedFilesForUser(session.user.id)` — 대시보드 방문이 그 사용자의 밀린 업로드를 동기 reconcile한다.

**이벤트 없이 정리 행을 만드는 경로**(커밋 뒤 아무도 깨우지 않음): `cleanup.ts:210`(`acceptCardNewsDeletion`), `delete-clip-assets.ts:69`(`acceptClipAssetDeletion`), `delete-upload-assets.ts:116`(`acceptUploadAssetDeletion`). 나머지 세 `createAssetCleanupJob` 호출(`cleanup.ts:113`·`:170`, `settle-processing-attempt.ts:199`)은 이미 트리거된 흐름(reconcile 완료·fail·settleProcessingAttempt) 안에서 생기므로 별도 깨움이 필요 없다.

**매분 워커를 전제한 주석**: `job-lifecycle.ts:658` `/* Inbox is durable; the minute recovery worker reads it directly. */`.

**설치된 SDK**: `inngest@3.54.0`(`node_modules/inngest/package.json`). 타입으로 확인:
- `createFunction(options, trigger, handler)`의 `trigger`는 `SingleOrArray<Trigger>` — **배열로 다중 트리거 허용**(`node_modules/inngest/components/Inngest.d.ts:425`). `Trigger<T>`는 `{ event: T; if? } | { cron }`(`InngestFunction.d.ts:89-94`).
- `singleton?: { mode: "skip"|"cancel"; key? }`(`InngestFunction.d.ts:312-325`). 문서: `"cancel"`는 "cancels the existing run and starts the new one"(`:322`), "while another is still **in progress**"(`:307`).
- `onFailure?`(`:341`), `debounce?`(`types.d.ts:1385`) 존재.
- `step.sleepUntil(idOrOptions, time: Date | string | ...)`(`InngestStepTools.d.ts:225`), `step.sleep(idOrOptions, time: number | string | DurationLike)`(`:218`), `step.sendEvent(idOrOptions, payload)`(`:114`).
- 재시도를 소진한 step은 핸들러 안에서 **잡을 수 있는 `StepError`를 던진다**: `node_modules/inngest/components/StepError.d.ts:2-4` "An error that represents a step exhausting all retries and failing. This is thrown by an Inngest step if it fails." (`index.d.ts`가 `StepError`를 수출).
- 플랫폼 한도(Inngest usage-limits 문서, 2026-10-22 확인): 함수 런당 step **1,000개**, step 반환 4 MiB, 런 길이는 sleep 포함 Free 30일.

**관련 스키마 필드는 모두 존재하고 인덱스도 충분하다**(읽기 전용 — 변경 안 함): `CardNewsJob.userId`·`deadlineAt DateTime`(비null)·`dispatchLeaseUntil DateTime?`·`nextDispatchAt DateTime?`·`claimedAt DateTime?`·`heartbeatAt DateTime?`, 인덱스 `@@index([status, nextDispatchAt])`·`@@index([status, deadlineAt])`. `AssetCleanupJob.notBefore DateTime @default(now())`(비null)·`leaseUntil DateTime?`·`nextRetryAt DateTime?`, 인덱스 `@@index([status, notBefore, nextRetryAt])`. `ProcessingDispatch.deadlineAt DateTime?`. 모델에 `@@map`이 없어 raw SQL의 테이블 이름은 모델 이름 그대로다(기존 선례 `entities/card-news/api/index.ts:79`·`:292`, `entities/processing-dispatch/api/index.ts:70-75`).

## 문제

요구의 원천은 `TASK_BACKLOG.md`의 BUG-19 `source`다(관측 1~7·진단·요구 ①~⑦·채택안 (c)). 사용자 0명에도 네 cron이 매분 돌아 런당 step 2·1·1·1 = 분당 9 execution → 하루 약 12,960(관측 2)이 나가고, 네 함수 모두 매분 DB를 조회해 **Neon compute가 자동 정지하지 못한다**. 소유자가 대시보드에서 4개를 일시정지한 상태다(관측 3).

진단(백로그): 복구 로직이 아니라 **깨어나는 시각**이 문제다. 할 일의 기한은 DB 행이 이미 아는데(위 「현재 동작」), cron은 그걸 무시하고 고정 1분 간격으로 전체를 훑는다. 평소 흐름은 요청 직후 직접 발송·워커 자체 reconcile로 돌고, cron이 메우는 것은 런이 죽거나 발송이 실패한 경우뿐이다(관측 5). 더해 정리 재시도가 60초 고정이라 막힌 행 하나가 cron 비용을 영구화한다(관측 6).

소유자 지시는 「cron이 아닌 방식」이고, 백로그 요구 ①~⑦에 채택 설계가 있다: 이벤트 다중 트리거+singleton cancel로 **단일 정비 함수**를 깨워 지금의 복구 처리를 그대로 돌리고, DB의 다음 기한까지 잔 뒤 이어 간다. 일이 없으면 런이 끝난다 — 사용자 0명이면 **실행 0**.

**백로그와 코드가 어긋난 점(메인 루프 검증 라운드 1에서 확정)**:
1. 요구 ①은 「기존 헬퍼를 그대로 부른다」인데, 벌크 헬퍼를 한 step에서 부르면 위의 504가 돌아온다. 이 계획은 헬퍼가 아니라 **지금 cron 본문(목록 step + 작업별 step)을 그대로 옮긴다**. 요구 ①의 뜻(복구 의미 불변, 「언제 도는지」만 변경)은 이쪽이 지킨다.
2. 요구 ③의 「클레임된 job은 `deadlineAt`」은 죽은 워커의 재발송(위 발송 게이트)을 없앤다 — 워커가 죽으면 마감까지 아무도 다시 보내지 않고, 마감에 실패·환불된다. 다음 기한은 cron이 그 job을 **실제로 처리하게 되는 시각**(목록 조건 ∧ 발송 게이트, 또는 마감)으로 잡는다.
3. 기한이 지난 일이 드레인 뒤에도 남으면(예: 업로드가 `processing`이 아닌 영상 후보, 매번 실패하는 step) 바닥값 30초 고정으로는 정비 함수가 30초마다 깬다 — 지금 cron의 2배다. 「풀리지 않은 기한 경과」가 이어지는 동안 바닥을 2배씩 늘린다.

## 고칠 파일

| 파일 | 변경 |
| --- | --- |
| `src/inngest/maintenance-schedule.ts` `(신규)` | 다음 깨움 계산 순수 함수 `computeNextWake`·`pastDueFloorMs` + 상수, 드레인 루틴의 step 타입 `DrainStep` |
| `src/inngest/maintenance-schedule.test.mjs` `(신규)` | `computeNextWake`·`pastDueFloorMs` 테스트 |
| `src/inngest/maintenance-event.ts` `(신규)` | `kickMaintenanceDrain(reason)` best-effort 킥 + 이벤트명 상수 |
| `src/inngest/maintenance-functions.ts` `(신규)` | `maintenanceDrain` — 다중 트리거+singleton cancel. 드레인 루틴 넷 → 다음 기한 계산 → `sleepUntil` → 이어달리기 킥, idle이면 종료 |
| `src/inngest/maintenance-functions.test.mjs` `(신규)` | `maintenanceDrain`의 구조 시험(vm+transpile, `card-news-functions.test.mjs` 기법) |
| `src/inngest/card-news-functions.ts` | cron 3개의 `createFunction`을 **본문 그대로** 수출 드레인 루틴 셋(`drainCardNewsDispatch`·`drainCardNewsRecovery`·`drainCardNewsCleanup`)으로 바꾼다. step id·목록 상한 100·작업별 step 불변. `generateCardNews`·`renderCardNews`는 유지 |
| `src/inngest/card-news-functions.test.mjs` | 시험 대상 이름 셋을 새 루틴 이름으로. 예산 모델·단언은 그대로 |
| `src/inngest/video-reservation-functions.ts` | cron을 수출 드레인 루틴 `drainVideoReservations`로 바꾼다(step id 불변) |
| `src/app/api/inngest/route.ts` | cron 4개 등록 제거, `maintenanceDrain` 등록 |
| `src/inngest/client.ts` | `Events`에 `"maintenance/drain.requested": { data: { reason?: string; pastDueStreak?: number } }` 추가 |
| `src/fsd/entities/card-news/model/job-due.ts` `(신규)` | job 하나가 처리 가능해지는 시각 `cardNewsJobDueAt` + `CARD_NEWS_HEARTBEAT_STALE_MS` |
| `src/fsd/entities/card-news/model/job-due.test.mjs` `(신규)` | `cardNewsJobDueAt` 테스트 + `job-lifecycle.ts`의 90초 리터럴 고정 검사 |
| `src/fsd/entities/card-news/api/index.ts` | 다음 기한 `nextCardNewsJobWakeAt`·`nextAssetCleanupWakeAt`, 읽기 게이트 `hasDueActiveCardNewsJob` 추가(읽기 전용) |
| `src/fsd/entities/processing-dispatch/api/index.ts` | 다음 기한 쿼리 `nextVideoReservationWakeAt` 추가(읽기 전용) |
| `src/fsd/entities/processing-dispatch/server.ts` | `nextVideoReservationWakeAt` 재수출 |
| `src/fsd/features/card-news/model/cleanup-retry.ts` `(신규)` | 정리 재시도 지수 백오프 순수 함수 `cleanupRetryDelayMs`(60초→2배→24시간 상한) |
| `src/fsd/features/card-news/model/cleanup-retry.test.mjs` `(신규)` | `cleanupRetryDelayMs` 테스트 |
| `src/fsd/features/card-news/api/cleanup.ts` | `:492` 60초 고정→`cleanupRetryDelayMs(current.attemptCount)`(요구 ⑥), `acceptCardNewsDeletion` 커밋 뒤 킥(요구 ④) |
| `src/fsd/features/card-news/api/job-lifecycle.ts` | `:658` 매분 워커 전제 주석 정정(요구 ⑦) |
| `src/fsd/features/card-news/api/index.ts` | `listCardNews`·`getCardNewsDetail`에 읽기 시 안전망 킥(요구 ⑤) |
| `src/fsd/features/clip/api/delete-clip-assets.ts` | `acceptClipAssetDeletion` 커밋 뒤 킥(요구 ④) |
| `src/fsd/features/upload/api/delete-upload-assets.ts` | `acceptUploadAssetDeletion` 커밋 뒤 킥(요구 ④) |
| `src/app/dashboard/page.tsx` | 방문 시 처리할 때가 된 카드뉴스 작업이 있으면 킥(요구 ⑤, `:26` 선례 옆) |

여기 없는 파일은 고치지 않는다. 파일 삭제는 없다. 복구 함수(`dispatchCardNewsJob`·`reconcileCardNewsJob`·`runCardNewsCleanup`·`flushCardNewsAnalytics`·`reconcileVideoReservations`)의 **내부 의미**(FEAT-63 소관)는 건드리지 않는다 — cleanup.ts의 변경은 재시도 **간격 리터럴**(⑥은 BUG-19 범위)과 삭제 경로의 킥뿐이다.

## 구현 스케치

### `src/inngest/maintenance-schedule.ts` (신규, 순수)

```ts
import type { GetStepTools } from "inngest";
import type { inngest } from "./client";

// 드레인 루틴이 받는 step 도구. 루틴은 step.run만 쓴다.
export type DrainStep = Pick<GetStepTools<typeof inngest>, "run">;

// 정비 드레인이 DB의 다음 기한까지 잘 때, 그 시각을 계산한다.
// 바닥 30초: 목록 상한(100건)에 걸려 남은 일이 즉시 재깨움(hot loop)하는 것을 막는다.
// 드레인 뒤에도 기한이 지난 일이 남았거나 드레인이 실패했으면(= 이번 깨움으로 풀리지 않은 일) 바닥을
// 연속 횟수만큼 2배씩 늘린다(상한 30분) — 풀리지 않는 행 하나가 정비 함수를 30초마다 깨우지 못하게.
// 상한 6시간: 1회 sleep을 Free 플랜 런 길이(30일) 한참 아래로 묶는다.
export const MAINTENANCE_WAKE_FLOOR_MS = 30_000;
export const MAINTENANCE_WAKE_MAX_FLOOR_MS = 30 * 60_000;
export const MAINTENANCE_WAKE_CEILING_MS = 6 * 60 * 60_000;

export function pastDueFloorMs(pastDueStreak: number): number {
  const streak = Number.isFinite(pastDueStreak)
    ? Math.min(Math.max(Math.floor(pastDueStreak), 0), 16)
    : 0;
  return Math.min(
    MAINTENANCE_WAKE_FLOOR_MS * 2 ** streak,
    MAINTENANCE_WAKE_MAX_FLOOR_MS,
  );
}

export function computeNextWake(
  now: Date,
  deadlines: readonly (Date | null | undefined)[],
  previous: { pastDueStreak: number; drainFailed: boolean },
): { wakeAt: Date; pastDueStreak: number } | null {
  const times = deadlines
    .filter((d): d is Date => d instanceof Date && Number.isFinite(d.getTime()))
    .map((d) => d.getTime());
  if (times.length === 0 && !previous.drainFailed) return null;
  const earliest = times.length > 0 ? Math.min(...times) : now.getTime();
  const unresolved = previous.drainFailed || earliest <= now.getTime();
  const streak = unresolved ? previous.pastDueStreak : 0;
  const floor = now.getTime() + pastDueFloorMs(streak);
  const ceiling = now.getTime() + MAINTENANCE_WAKE_CEILING_MS;
  return {
    wakeAt: new Date(Math.min(Math.max(earliest, floor), ceiling)),
    pastDueStreak: unresolved ? streak + 1 : 0,
  };
}
```

연속 횟수 0→1→2…에 바닥은 30초→60초→120초…→30분(6회째부터 상한). 기한이 미래로 밀리면(정상 진행) 0으로 돌아간다.

### `src/fsd/entities/card-news/model/job-due.ts` (신규, 순수)

```ts
// 매분 cron이 이 job을 실제로 처리하게 되던 가장 이른 시각:
// 목록 조건(listRecoverableCardNewsJobs — nextDispatchAt null|≤now)과 발송 게이트
// (dispatchCardNewsJob — 발송 리스, claim됐으면 heartbeat 90초)를 함께 넘는 시각, 또는 마감(reconcile이 처리).
// 90초는 job-lifecycle.ts의 dispatchCardNewsJob·claimCardNewsJob 리터럴과 같아야 한다(job-due.test.mjs가 고정).
export const CARD_NEWS_HEARTBEAT_STALE_MS = 90_000;

export type CardNewsJobTiming = {
  deadlineAt: Date;
  claimedAt: Date | null;
  heartbeatAt: Date | null;
  nextDispatchAt: Date | null;
  dispatchLeaseUntil: Date | null;
};

export function cardNewsJobDueAt(job: CardNewsJobTiming, now: Date): Date {
  const dispatchAt = Math.max(
    job.nextDispatchAt?.getTime() ?? now.getTime(),
    job.dispatchLeaseUntil?.getTime() ?? Number.NEGATIVE_INFINITY,
    job.claimedAt && job.heartbeatAt
      ? job.heartbeatAt.getTime() + CARD_NEWS_HEARTBEAT_STALE_MS
      : Number.NEGATIVE_INFINITY,
  );
  return new Date(Math.min(job.deadlineAt.getTime(), dispatchAt));
}
```

워커가 살아 있는 동안(heartbeat가 계속 갱신) 이 시각은 「마지막 heartbeat + 90초」로 계속 미래에 있다 — 정비 함수는 그때 한 번 깨어 낡지 않았음을 확인하고 다시 잔다. 워커가 죽으면 그 시각이 지나 재발송된다(지금 cron과 같은 의미).

### `src/fsd/features/card-news/model/cleanup-retry.ts` (신규, 순수)

```ts
// 정리 재시도 간격: 60초에서 시작해 실패마다 2배, 24시간에서 상한.
// 60초 고정이면 막힌 정리 행 하나가 정비 함수를 끝없이 깨워 cron 비용이 돌아온다(BUG-19 관측 6).
// attemptCount는 claim마다 1씩 증가한다(entities/card-news/api/index.ts:385) — 첫 실패 시 1 → 60초(기존 동작 보존).
export const CLEANUP_RETRY_BASE_MS = 60_000;
export const CLEANUP_RETRY_CEILING_MS = 86_400_000; // 24h

export function cleanupRetryDelayMs(attemptCount: number): number {
  const attempts = Number.isFinite(attemptCount) ? Math.floor(attemptCount) : 1;
  const exponent = Math.min(Math.max(attempts - 1, 0), 30);
  return Math.min(CLEANUP_RETRY_BASE_MS * 2 ** exponent, CLEANUP_RETRY_CEILING_MS);
}
```

### `src/inngest/maintenance-event.ts` (신규)

```ts
import "server-only";
import { inngest } from "./client";

export const MAINTENANCE_DRAIN_EVENT = "maintenance/drain.requested" as const;

// 정비 드레인을 깨우는 best-effort 킥. 발송 실패가 호출자(삭제·방문)를 실패시키지 않는다 —
// 떨어진 킥은 이후 아무 트리거 이벤트나 방문이 전체를 훑어 메운다(채택안 (c)).
export async function kickMaintenanceDrain(reason: string): Promise<void> {
  try {
    await inngest.send({ name: MAINTENANCE_DRAIN_EVENT, data: { reason } });
  } catch {
    /* best-effort */
  }
}
```

(이 모듈은 `./client`만 의존하므로 feature → maintenance-event → feature 순환이 없다. `maintenance-functions.ts`는 드레인 루틴을 import하므로 킥 함수를 여기 둔다.)

### `src/inngest/client.ts` (편집) — `Events`에 추가

`type Events = CardNewsEvents & { ... }` 안, 기존 `"modal/video.analyzed"` 블록 뒤에:

```ts
  "maintenance/drain.requested": {
    // reason: 어느 경로가 깨웠는지(관측용). pastDueStreak: 이어달리기 킥만 싣는 연속 기한 경과 횟수.
    data: { reason?: string; pastDueStreak?: number };
  };
```

### `src/inngest/card-news-functions.ts` (편집)

- import에 추가: `import type { DrainStep } from "./maintenance-schedule";`. 기존 import 블록(`:1-16`)은 그대로 둔다 — 루틴이 같은 함수를 쓴다.
- `:110-155`의 세 `inngest.createFunction(...)`을 아래 셋으로 바꾼다. **본문은 지금 cron의 본문을 바이트 그대로** 옮긴다(step id·`100`·작업별 `step.run` 불변). 바뀌는 것은 껍데기뿐이다.

before (`:110-113`, 셋 모두 같은 모양):
```ts
export const dispatchPendingCardNews = inngest.createFunction(
  { id: "dispatch-pending-card-news", retries: 1, concurrency: 1 },
  { cron: "* * * * *" },
  async ({ step }) => {
```
…`:128-129`
```ts
  },
);
```
after:
```ts
export async function drainCardNewsDispatch({ step }: { step: DrainStep }) {
```
…
```ts
}
```
같은 방식으로 `reconcileCardNewsJobs`(`:130-140`) → `export async function drainCardNewsRecovery({ step }: { step: DrainStep })`, `cleanupCardNewsAssets`(`:141-155`) → `export async function drainCardNewsCleanup({ step }: { step: DrainStep })`. 본문 줄(`:114-127`·`:134-138`·`:145-153`)은 들여쓰기 한 단계만 줄어든다.

### `src/inngest/card-news-functions.test.mjs` (편집)

`:14-18`의 시험 대상 표만 바꾼다:
```ts
for (const [handler, operation] of [
  ["drainCardNewsDispatch", "dispatch"],
  ["drainCardNewsRecovery", "recover"],
  ["drainCardNewsCleanup", "cleanup"],
]) {
```
나머지(예산 모델, `require` 스텁 — 루틴이 `./client`를 여전히 import하므로 그 스텁도 그대로 쓰인다, `exports[handler]({ step })` 호출, 단언)는 바꾸지 않는다. 테스트 이름의 `${handler}`가 새 이름으로 바뀐다.

### `src/inngest/video-reservation-functions.ts` (편집 — 파일 전체)

before (`:1-12`):
```ts
import { inngest } from "./client";
import { reconcileVideoReservations } from "~/fsd/features/upload/server";
export const reconcileVideoCreditReservations = inngest.createFunction(
  { id: "reconcile-video-credit-reservations", retries: 1, concurrency: 1 },
  { cron: "* * * * *" },
  async ({ step }) => {
    await step.run(
      "recover-video-reservations-globally",
      reconcileVideoReservations,
    );
  },
);
```
after:
```ts
import { reconcileVideoReservations } from "~/fsd/features/upload/server";
import type { DrainStep } from "./maintenance-schedule";
export async function drainVideoReservations({ step }: { step: DrainStep }) {
  await step.run(
    "recover-video-reservations-globally",
    reconcileVideoReservations,
  );
}
```

### `src/inngest/maintenance-functions.ts` (신규)

```ts
import { inngest } from "./client";
import {
  drainCardNewsDispatch,
  drainCardNewsRecovery,
  drainCardNewsCleanup,
} from "./card-news-functions";
import { drainVideoReservations } from "./video-reservation-functions";
import {
  nextCardNewsJobWakeAt,
  nextAssetCleanupWakeAt,
} from "~/fsd/entities/card-news/server";
import { nextVideoReservationWakeAt } from "~/fsd/entities/processing-dispatch/server";
import { computeNextWake, pastDueFloorMs } from "./maintenance-schedule";
import { MAINTENANCE_DRAIN_EVENT } from "./maintenance-event";

// cron 없는 단일 정비 함수. 일이 생길 때만(이벤트) 깨어나 지금의 복구 처리를 그대로 돌리고,
// DB의 다음 기한까지 잔 뒤 이어달리기 킥으로 다음 런에 넘긴다. 할 일이 없으면 런이 끝난다 — 사용자 0명이면 실행 0.
// 한 런 = 한 사이클이라 step 수가 한 사이클 분(최악 약 408)으로 묶인다(런당 1,000 한도).
// singleton cancel: 새 트리거 이벤트가 자고 있는(또는 도는) 이전 런을 대체해 일정을 다시 잡는다.
export const maintenanceDrain = inngest.createFunction(
  { id: "maintenance-drain", retries: 1, singleton: { mode: "cancel" } },
  [
    { event: "card-news/generate.requested" },
    { event: "card-news/render.requested" },
    { event: "card-news/completed" },
    { event: "processing/attempt.claimed" },
    { event: MAINTENANCE_DRAIN_EVENT },
  ],
  async ({ event, step }) => {
    // 연속 기한 경과 횟수는 이어달리기 킥만 싣는다. 바깥 이벤트는 0에서 다시 센다.
    const pastDueStreak =
      event.name === MAINTENANCE_DRAIN_EVENT
        ? (event.data.pastDueStreak ?? 0)
        : 0;
    let drainFailed = false;
    for (const drain of [
      drainCardNewsDispatch,
      drainCardNewsRecovery,
      drainCardNewsCleanup,
      drainVideoReservations,
    ]) {
      try {
        await drain({ step });
      } catch {
        // 재시도를 소진한 step의 StepError. 한 도메인의 실패가 나머지 드레인과 다음 일정을 막지 않게 한다 —
        // 런이 실패로 끝나면 매분 cron과 달리 다음 깨움이 사라진다.
        drainFailed = true;
      }
    }
    let next: { wakeAt: string; pastDueStreak: number } | null;
    try {
      next = await step.run("plan-next-wake", async () => {
        const now = new Date();
        const wake = computeNextWake(
          now,
          [
            await nextCardNewsJobWakeAt(now),
            await nextAssetCleanupWakeAt(),
            await nextVideoReservationWakeAt(),
          ],
          { pastDueStreak, drainFailed },
        );
        return wake
          ? { wakeAt: wake.wakeAt.toISOString(), pastDueStreak: wake.pastDueStreak }
          : null;
      });
    } catch {
      // 기한을 읽지 못했다(DB 장애 등). 일정을 잃지 않도록 연속 횟수 바닥만큼 자고 이어 간다.
      await step.sleep("retry-after-plan-failure", pastDueFloorMs(pastDueStreak));
      await step.sendEvent("continue-after-plan-failure", {
        name: MAINTENANCE_DRAIN_EVENT,
        data: { reason: "plan-failed", pastDueStreak: pastDueStreak + 1 },
      });
      return { planFailed: true };
    }
    if (!next) return { idle: true };
    await step.sleepUntil("sleep-until-next-wake", next.wakeAt);
    await step.sendEvent("continue-drain", {
      name: MAINTENANCE_DRAIN_EVENT,
      data: { reason: "continue", pastDueStreak: next.pastDueStreak },
    });
    return { continuedAt: next.wakeAt };
  },
);
```

드레인을 먼저 돌려 처리할 때가 된 행을 처리하고(그 과정에서 기한이 앞으로 이동 — 발송 뒤 `nextDispatchAt`+60초, 정리 실패 뒤 백오프), **그 뒤에** 다음 기한을 계산한다. 런은 한 사이클 뒤 끝나고 이어달리기 킥이 다음 런을 연다 — 같은 런에서 사이클을 반복하지 않으므로 step 한도(1,000)에 닿지 않는다. 최악의 한 런: 목록 4 + 작업별 최대 100×4 + 영상 1 + 계획 1 + sleep 1 + 킥 1 = 408.

**자기 이벤트에 의한 재시작**: 드레인의 발송 루틴이 `dispatchCardNewsJob`으로 `card-news/generate.requested`·`render.requested`를 보내면 그 이벤트가 이 함수를 다시 트리거해 도는 런을 대체한다. 새 런은 방금 보낸 job을 건너뛰고(`nextDispatchAt`+60초) 나머지를 처리하므로 발송 k건이면 런이 최대 k+1번 열리고 끝난다 — 무한 반복은 없고, 비용은 발송이 있을 때만 생긴다.

### `src/app/api/inngest/route.ts` (편집)

before (`:3-10`, `:30-33`):
```ts
import {
  generateCardNews,
  renderCardNews,
  dispatchPendingCardNews,
  reconcileCardNewsJobs,
  cleanupCardNewsAssets,
} from "~/inngest/card-news-functions";
import { reconcileVideoCreditReservations } from "~/inngest/video-reservation-functions";
```
```ts
    dispatchPendingCardNews,
    reconcileCardNewsJobs,
    cleanupCardNewsAssets,
    reconcileVideoCreditReservations,
```
after:
```ts
import {
  generateCardNews,
  renderCardNews,
} from "~/inngest/card-news-functions";
import { maintenanceDrain } from "~/inngest/maintenance-functions";
```
```ts
    maintenanceDrain,
```
(`generateCardNews`·`renderCardNews`·`maintenanceDrain`과 기존 `processVideo`·`analyzeVideo`·`cleanupAnalyticsEvents`·`watchProcessingAttempt`는 `functions` 배열에 그대로 둔다.)

### `src/fsd/entities/card-news/api/index.ts` (편집)

- import 추가(파일 상단, `../model/contract` import 옆): `import { cardNewsJobDueAt } from "../model/job-due";`
- 끝에 추가. `db`는 이미 `:9`에서 import됨.

```ts
const jobTimingSelect = {
  deadlineAt: true,
  claimedAt: true,
  heartbeatAt: true,
  nextDispatchAt: true,
  dispatchLeaseUntil: true,
} as const;

// 활성 job은 마감(15분) 안에 끝나므로 행 수가 작다 — 전부 읽어 cardNewsJobDueAt으로 최솟값을 낸다.
// 기한 정의를 SQL과 TS에 두 벌 두지 않기 위해서다(읽기 게이트가 같은 함수를 쓴다).
export async function nextCardNewsJobWakeAt(now: Date): Promise<Date | null> {
  const jobs = await db.cardNewsJob.findMany({
    where: { status: { in: ["pending", "running"] } },
    select: jobTimingSelect,
  });
  let earliest: Date | null = null;
  for (const job of jobs) {
    const due = cardNewsJobDueAt(job, now);
    if (!earliest || due.getTime() < earliest.getTime()) earliest = due;
  }
  return earliest;
}

export async function nextAssetCleanupWakeAt(): Promise<Date | null> {
  // GREATEST는 Postgres에서 NULL을 무시한다. notBefore는 비null이라 행마다 결과가 비null이다.
  const [row] = await db.$queryRaw<{ next: Date | null }[]>`
    SELECT MIN(GREATEST("notBefore", "nextRetryAt", "leaseUntil")) AS next
    FROM "AssetCleanupJob"
    WHERE "status" <> 'completed'`;
  return row?.next ?? null;
}

// 읽기 시 안전망의 게이트: 그 사용자의 활성 job 중 처리할 때가 된 것이 있는가.
// 워커가 살아 있는 job은 heartbeat 때문에 아니다 — 폴링(5초)마다 킥하지 않는다.
export async function hasDueActiveCardNewsJob(
  userId: string,
  now: Date,
): Promise<boolean> {
  const jobs = await db.cardNewsJob.findMany({
    where: { userId, status: { in: ["pending", "running"] } },
    select: jobTimingSelect,
  });
  return jobs.some(
    (job) => cardNewsJobDueAt(job, now).getTime() <= now.getTime(),
  );
}
```

(세 함수 모두 `entities/card-news/server.ts:2` `export * from "./api"`로 자동 수출된다.)

### `src/fsd/entities/processing-dispatch/api/index.ts` (편집, 끝에 추가)

`listProcessingDispatchRecoveryCandidates`(`:69`)와 **동일한 WHERE**를 MIN 집계로. `db`는 `:4`에서 import됨.

```ts
export async function nextVideoReservationWakeAt(): Promise<Date | null> {
  const [row] = await db.$queryRaw<{ next: Date | null }[]>`
    SELECT MIN(d."deadlineAt") AS next
    FROM "ProcessingDispatch" d
    JOIN "UploadedFile" f ON f."id" = d."uploadedFileId"
    LEFT JOIN "CreditReservation" r ON r."id" = d."reservationId"
    WHERE r."status" = 'held'
       OR (f."status" = 'processing' AND f."currentAttempt" = d."attempt" AND d."kind" = 'analyze')`;
  return row?.next ?? null;
}
```

`deadlineAt`이 null인 후보는 MIN에서 빠진다 — 그런 후보만 남으면 정비 함수는 그 후보 때문에 깨지 않는다(「테스트」 못 덮는 범위).

### `src/fsd/entities/processing-dispatch/server.ts` (편집)

`:5-16` 수출 블록에 `nextVideoReservationWakeAt,` 추가.

### `src/fsd/features/card-news/api/cleanup.ts` (편집)

- import 추가(파일 상단 import들 옆):
  ```ts
  import { cleanupRetryDelayMs } from "../model/cleanup-retry";
  import { kickMaintenanceDrain } from "~/inngest/maintenance-event";
  ```
- `:492` before:
  ```ts
          nextRetryAt: new Date(cardNewsRuntime().now().getTime() + 60_000),
  ```
  after:
  ```ts
          nextRetryAt: new Date(
            cardNewsRuntime().now().getTime() +
              cleanupRetryDelayMs(current.attemptCount),
          ),
  ```
  (`current`은 `:482` `await lockAssetCleanupJob(cleanupId, tx)` — claim에서 증가된 `attemptCount`를 가진다.)
- `acceptCardNewsDeletion`(`:188`): 커밋 뒤 킥. before `:192`:
  ```ts
    return cardNewsTransaction(async (tx) => {
  ```
  …함수 끝 `:229-230`:
  ```ts
      return { status: "deleting", cleanupId: cleanup.id };
    });
  }
  ```
  after — 트랜잭션 결과를 받아 커밋 뒤 킥:
  ```ts
    const result = await cardNewsTransaction(async (tx) => {
  ```
  ```ts
      return { status: "deleting", cleanupId: cleanup.id };
    });
    await kickMaintenanceDrain("card-news-deletion");
    return result;
  }
  ```

### `src/fsd/features/card-news/api/job-lifecycle.ts` (편집)

`:658` before:
```ts
      /* Inbox is durable; the minute recovery worker reads it directly. */
```
after:
```ts
      /* Inbox is durable; the maintenance drain reconciles it when woken by this or any later event. */
```

### `src/fsd/features/card-news/api/index.ts` (편집)

- import 추가:
  ```ts
  import { hasDueActiveCardNewsJob } from "~/fsd/entities/card-news/server";
  import { kickMaintenanceDrain } from "~/inngest/maintenance-event";
  ```
  (`findCardNewsSet`·`listCardNewsSets` 등은 이미 `~/fsd/entities/card-news/server`에서 import 중이므로 `hasDueActiveCardNewsJob`은 그 블록에 합류.)
- `listCardNews`(`:96`) 콜백 시작에:
  ```ts
  return authenticatedAction(async (userId) => {
    if (await hasDueActiveCardNewsJob(userId, new Date()))
      await kickMaintenanceDrain("card-news-read");
  ```
- `getCardNewsDetail`(`:111`) 콜백 시작에 같은 두 줄 추가.
  (게이트가 있어 폴링마다 보내지 않는다: 워커가 살아 있는 job은 `cardNewsJobDueAt`이 「마지막 heartbeat + 90초」로 미래에 있고, 미클레임 job은 드레인이 발송하면 `nextDispatchAt`이 +60초로 밀린다.)

### `src/fsd/features/clip/api/delete-clip-assets.ts` (편집)

- import 추가: `import { kickMaintenanceDrain } from "~/inngest/maintenance-event";`
- `acceptClipAssetDeletion`(`:28`) `:34` before:
  ```ts
    return db.$transaction(async (tx) => {
  ```
  함수 끝 `:117-118`:
  ```ts
      return { status: "deleting", cleanupId: cleanup.id };
    });
  }
  ```
  after:
  ```ts
    const result = await db.$transaction(async (tx) => {
  ```
  ```ts
      return { status: "deleting", cleanupId: cleanup.id };
    });
    await kickMaintenanceDrain("clip-deletion");
    return result;
  }
  ```

### `src/fsd/features/upload/api/delete-upload-assets.ts` (편집)

- import 추가: `import { kickMaintenanceDrain } from "~/inngest/maintenance-event";`
- `acceptUploadAssetDeletion`(`:35`) `:39` `return db.$transaction(async (tx) => {` → `const result = await db.$transaction(async (tx) => {`, 함수 끝 `:139-140` 뒤에 `await kickMaintenanceDrain("upload-deletion"); return result;` 추가(위 clip와 동일 형태).

### `src/app/dashboard/page.tsx` (편집)

- import 추가:
  ```ts
  import { hasDueActiveCardNewsJob } from "~/fsd/entities/card-news/server";
  import { kickMaintenanceDrain } from "~/inngest/maintenance-event";
  ```
- `:27` `await reconcileUploadDraftsForUser(session.user.id);` 뒤:
  ```ts
  if (await hasDueActiveCardNewsJob(session.user.id, new Date()))
    await kickMaintenanceDrain("dashboard-visit");
  ```
  (업로드/영상 밀림은 `:26` `reconcileStaleUploadedFilesForUser`가 동기 처리하고, held 영상 예약은 `processing/attempt.claimed` 트리거+타이머가 덮으므로, 방문 킥은 카드뉴스에만 건다.)

### 함수 id 결정 — 새 id, 옛 4개는 소멸

`maintenance-drain`은 **새 id**다(옛 id 재사용 안 함). 트리거·본문이 전혀 다른 함수이고, 옛 id를 재사용하면 일시정지 상태까지 상속해 배포 후 Resume이 필요하다. 새 id는 un-paused로 배포되고, 옛 4개(`dispatch-pending-card-news`·`reconcile-card-news-jobs`·`cleanup-card-news-assets`·`reconcile-video-credit-reservations`)는 등록이 사라지므로 대시보드에서 자동 소멸한다 — Resume 불필요.

## 테스트

- **덮는 것**:
  - `maintenance-schedule.test.mjs` — `pastDueFloorMs`: 0→30_000, 1→60_000, 5→960_000, 6→1_800_000(상한, 30_000×64=1_920_000을 자름), 음수·`NaN`·`Infinity`→30_000, 소수 2.9→120_000(내림). `computeNextWake`: 전부 null·드레인 성공→null; 전부 null·드레인 실패→now+30초·streak 1; 최솟값 선택; 미래 최솟값이 now+30초보다 이르면 now+30초·streak 0(입력 streak 5여도 0으로 돌아감); 상한(최솟값 > now+6시간 → now+6시간); 최솟값 = now(경계) → 기한 경과로 셈(streak 증가); now+1ms → 경과 아님; 입력 streak 3·기한 경과 → now+240초·streak 4; 입력 streak 10·기한 경과 → now+30분·streak 11; `null`/`undefined`/비유한(`new Date(NaN)`) 혼재 필터.
  - `job-due.test.mjs` — `cardNewsJobDueAt`: 미클레임·`nextDispatchAt` null → now; 미클레임·미래 `nextDispatchAt` → 그 값; 발송 리스가 더 늦으면 리스; claim·heartbeat 신선(now−10초)·`nextDispatchAt` 과거 → heartbeat+90초(미래); claim·heartbeat 낡음(now−100초) → heartbeat+90초(과거 = 처리할 때); claim·heartbeat 신선·`nextDispatchAt`이 더 늦으면 그 값; claim·`heartbeatAt` null → 발송 게이트가 막지 않으므로 `nextDispatchAt ?? now`; 미클레임인데 `heartbeatAt`만 있으면 heartbeat 무시; 마감이 가장 이르면 마감. **고정 검사**: `../../../features/card-news/api/job-lifecycle.ts`를 읽어 `< 90_000`이 정확히 2번(`:331`·`:409`) 있고 그 값이 `CARD_NEWS_HEARTBEAT_STALE_MS`와 같은지 단언 — 발송 게이트 값이 바뀌면 이 계산도 같이 바뀌어야 한다.
  - `cleanup-retry.test.mjs` — `cleanupRetryDelayMs`: attempt 1→60_000, 2→120_000, 3→240_000, 큰 값→상한 86_400_000, 0·음수→60_000, 비유한→60_000(=attempts 1), 지수 상한(2^30에서 포화).
  - `card-news-functions.test.mjs`(편집) — 세 드레인 루틴이 작업마다 따로 step 예산을 받아 4개 작업에 모두 닿는다(2026-10-20 504 모델 그대로). 루틴이 벌크 헬퍼를 한 step에서 부르도록 바뀌면 `FUNCTION_INVOCATION_TIMEOUT`으로 실패한다.
  - `maintenance-functions.test.mjs` — 구조 시험(`card-news-functions.test.mjs`의 vm+`typescript` transpile 기법. `./client`·`./card-news-functions`·`./video-reservation-functions`·`./maintenance-event`·`./maintenance-schedule`·entities를 `require` 스텁으로): (1) 네 루틴이 이 순서로 `{ step }`을 받아 불린다, (2) 루틴 하나가 던져도 나머지 루틴이 불리고 계획 step이 `drainFailed: true`를 받는다, (3) 계획이 null이면 `sleepUntil`·`sendEvent` 없이 `{ idle: true }`, (4) 계획이 있으면 `sleepUntil`을 그 ISO로 부른 뒤 `sendEvent`로 `maintenance/drain.requested`와 계획의 `pastDueStreak`을 보낸다, (5) `pastDueStreak`은 `maintenance/drain.requested` 이벤트에서만 읽고 다른 이벤트는 0, (6) 계획 step이 던지면 `step.sleep(pastDueFloorMs(streak))` 뒤 streak+1로 킥한다, (7) 설정: 트리거 배열이 다섯 이벤트이고 `cron` 트리거가 없으며 `singleton.mode === "cancel"`.
- **못 덮는 범위**(Node 내장 러너·DOM/DB/외부 I/O 없음):
  - **singleton cancel이 자고 있는(sleeping) 런도 대체하는지는 SDK 문서에 명시가 없다**(`InngestFunction.d.ts:307` "while another is still in progress"·`:322`까지). 어느 쪽이어도 결과는 정확하다: 복구 함수가 행 잠금(`lockedCardNewsJob`·`lockAssetCleanupJob`·`FOR UPDATE`)과 compare-and-set(`compareAndSetCardNewsJob`)·claim 리스(`claimAssetCleanupJob`의 `leaseUntil`)로 멱등이라, 자는 런과 새 런이 겹쳐 중복 실행돼도 두 번째가 이미 처리된 행을 건너뛴다. 대체하지 않는다면 일이 남아 있는 동안 이어달리기 사슬이 바깥 이벤트 수만큼 겹칠 수 있다 — 일이 끝나면(idle) 각 사슬이 끝난다. 다른 점은 중복 실행 비용뿐이다. 배포 후 Inngest 대시보드로 관측(아래 원장).
  - 재시도를 소진한 step이 핸들러에서 잡히는 동작(`StepError`)은 SDK 타입·주석으로만 확인했다(실행 미확인).
  - 다음 기한 쿼리(`findMany`·`$queryRaw`)의 실제 결과 — DB 없이는 판정 불가. `GREATEST`의 NULL 무시는 코드 독해로만 확인. 가능하면 구현 단계에서 로컬 PostgreSQL(FEAT-63 계획서 「테스트」의 바이너리 경로)로 `nextAssetCleanupWakeAt`·`nextVideoReservationWakeAt` SQL을 읽기 전용으로 리허설한다.
  - `deadlineAt`이 null인 영상 후보(마이그레이션 전 dispatch)만 남으면 정비 함수는 그 후보 때문에 깨지 않는다 — 지금 cron은 매분 producer 상태를 물었다. 2026-10-20 전환 때 활성 업로드 0개였다(`docs/card-news-release-verification-20261020.md:42`). 다른 이벤트·방문이 깨우면 처리된다.
  - **영상 복구 지연**: 정비 함수는 영상 후보 때문에는 `deadlineAt`(claim + 65분)에만 깬다. `processVideo` 런이 죽고 웹훅 정산도 실패한 영상은 지금(매분) 대신 마감에 정산된다 — 틀리지 않고 늦다(예약은 그동안 held). 다른 이벤트가 그 사이 깨우면 더 일찍 처리된다.
  - 킥 이벤트 발송·트리거 매칭·`step.sleepUntil`의 실제 수면 — 전부 Inngest 런타임 I/O.
  - **배포 후 수동 확인(원장 등재 대상)**: ① 유휴 시(사용자 0명) `maintenance-drain` 실행 0. ② 업로드 1건이면 claim 직후 1회 + `deadlineAt`에 1회. ③ 카드뉴스 생성 1건 동안 정비 함수가 「heartbeat + 90초」 간격으로만 깨고, 상세 화면 폴링이 킥을 보내지 않는다(대시보드 runs의 trigger 이벤트로 판별). ④ Neon compute Idle 복귀. ⑤ 일시정지했던 4개 id는 배포로 소멸(새 id라 Resume 불필요 — 위 「함수 id 결정」).

## 범위 밖 의존

전부 `apps/web` 안이고 `packages/db` 변경은 없다. 백로그가 확인하라던 「기한 계산이 스키마 변경·인덱스 추가 없이 되는가」를 검산했다: 쓰는 컬럼(`CardNewsJob.userId`·`status`·`deadlineAt`·`claimedAt`·`heartbeatAt`·`nextDispatchAt`·`dispatchLeaseUntil`, `AssetCleanupJob.notBefore`·`nextRetryAt`·`leaseUntil`·`status`, `ProcessingDispatch.deadlineAt` + join 컬럼)은 모두 현 스키마에 있다(「현재 동작」). 활성 카드뉴스 job 조회는 `@@index([status, …])`를 쓰고, 영상 쿼리는 `listProcessingDispatchRecoveryCandidates`가 이미 같은 WHERE로 도는 것을 그대로 쓴다.

**FEAT-63(main-loop, 사후 인수 — `검토대기`)과의 관계**:
- 경계: 복구 함수의 **의미**는 FEAT-63 소관이라 건드리지 않는다. 본 계획은 (a) cron **스케줄**을 이벤트+sleepUntil로 바꾸고, (b) 정리 재시도 **간격 리터럴**만 60초→지수 백오프로 바꾼다(요구 ⑥) — 둘 다 복구 함수의 판정·분기를 바꾸지 않는다. FEAT-63 행·계획서는 손대지 않는다.
- **같은 파일 셋**: `app/dashboard/page.tsx`(FEAT-63 20번 `showCardNews` 전달), `fsd/entities/card-news/api/index.ts`(16번 `listUserAssetCleanupJobs`), `fsd/features/card-news/api/index.ts`(15번 `getCardNewsCreationContext`). 고치는 지점은 서로 다르지만, 두 항목 중 **나중에 구현하는 쪽은 before 블록을 그때의 트리로 다시 맞춘다**. FEAT-63은 `cleanup.ts`·`job-lifecycle.ts`·`card-news-functions.ts`·`video-reservation-functions.ts`·`route.ts`를 고치지 않는다(FEAT-63 계획서 「고칠 파일」).
- FEAT-63 V3(영상 복구 유예 — producer `ended` 관측 + 5분)이 들어오면 「ended를 먼저 본 틱」 뒤 5분에 다시 볼 틱이 필요하다. 이 계획에서 그 틱은 영상 마감(`deadlineAt`)이거나 다른 이벤트다 — 틀리지 않고 늦다(위 「영상 복구 지연」과 같은 성격). FEAT-63이 유예 기한을 DB 행에 남기면, 그 값을 `nextVideoReservationWakeAt`에 더하는 것은 FEAT-63 뒤의 후속이다.

**`apps/web/scripts/verify-card-news-surfaces.mts` — 같은 사이클에 반드시 고친다**(web-dev 수정 범위 `apps/web/src/**` 밖 — 메인 루프가 구현 직후·인수 게이트 전에 반영): `:44-56`이 route.ts에 cron 넷의 이름(`:52-55` `"dispatchPendingCardNews"`·`"reconcileCardNewsJobs"`·`"cleanupCardNewsAssets"`·`"reconcileVideoCreditReservations"`)이 있는지 단언한다. 이 계획대로면 넷이 route.ts에서 사라져 이 검사가 `Missing served worker`로 실패한다. 네 줄을 `"maintenanceDrain",` 한 줄로 바꾼다. `:17-26`의 server.ts 심볼 검사(`dispatchPendingCardNewsJobs` 등 벌크 헬퍼 이름)는 그대로 통과한다 — 이 계획은 헬퍼의 수출을 지우지 않는다. 이 스크립트는 `package.json` 스크립트에 없고 손으로 돌린다(FEAT-63 계획 단계 게이트에서 `SKIP_ENV_VALIDATION=1`로 실행).

**제안서 `docs/proposals/active/instagram-card-news-generation.md:765`**(「minute cron 4개」)는 2026-10-20 출시 검증 기록이므로 고치지 않는다(요구 ⑦의 대상은 코드 주석 `job-lifecycle.ts:658` 하나다).

**`apps/web/CLAUDE.md` 테스트 목록 표**(web-dev 읽기 전용 — 메인 루프가 인수 때 반영, FEAT-63 25번과 함께): `inngest/maintenance-schedule.test.mjs`, `inngest/maintenance-functions.test.mjs`, `entities/card-news/model/job-due.test.mjs`, `features/card-news/model/cleanup-retry.test.mjs` 4행 추가. `inngest/card-news-functions.test.mjs`는 현재 표에 없다(FEAT-63 25번 소관).

## 대안

- **깨우는 방식 — 채택안 (c) vs (a)(b)**(백로그 판단 근거): (a) 주기만 낮추기(`*/15`·매시)는 가장 작은 수정이나 할 일이 없어도 비용이 0이 아니고 Neon이 주기마다 깨며 복구 지연이 주기만큼 는다. (b) 작업별 개별 가드(job마다 `sleepUntil`·정리 행마다 이벤트)는 `createAssetCleanupJob` 호출 6곳(`cleanup.ts:113·:170·:210`·`delete-clip-assets.ts:69`·`delete-upload-assets.ts:116`·`settle-processing-attempt.ts:199`)이 모두 트랜잭션 안이라 커밋 뒤 발송을 곳곳에 심어야 하고, 하나라도 빠지면 그 행은 영영 안 돈다(전체 훑기 안전망 없음). 채택안 (c)는 「DB가 진실이고 매번 전체를 훑는다」는 cron의 정확성을 유지하고 깨어나는 시각만 DB 기한에 맞춘다 — 킥이 빠져도 다음 아무 이벤트·방문이 전체를 훑는다.
- **처리 본체 — 지금 cron 본문(작업별 step, 채택) vs 벌크 헬퍼**: 백로그 요구 ①의 문구는 벌크 헬퍼였으나, 그 구조가 2026-10-20 운영 504의 원인이었고 `4859d2e`가 작업별 step으로 고쳤다(「현재 동작」). 헬퍼를 한 step에서 부르면 `card-news-functions.test.mjs`의 예산 모델에서 첫 작업 뒤 `FUNCTION_INVOCATION_TIMEOUT`이 난다(메인 루프 라운드 1 재생). 그래서 cron 본문을 껍데기만 바꿔 루틴으로 옮기고, 그 시험을 루틴에 그대로 건다.
- **한 런 = 한 사이클 + 이어달리기 킥(채택) vs 한 런 안에서 사이클 반복**: 반복형은 작업별 step과 합쳐지면 사이클마다 최대 약 400 step이 쌓여 두 사이클 만에 런당 1,000 한도에 닿는다. 한 사이클 뒤 `step.sendEvent`로 다음 런을 여는 쪽은 런마다 step 수가 한 사이클로 묶이고 사이클 상한 상수가 필요 없다. 비용은 사이클마다 킥 1 step이다.
- **클레임 job의 기한 — 처리 가능 시각(채택) vs `deadlineAt`**: `deadlineAt`만 보면 워커가 죽은 job을 마감까지 다시 보내지 않아 지금 cron의 재발송(heartbeat 90초)이 사라진다 — 복구 의미가 바뀐다. 처리 가능 시각은 워커가 사는 동안 「heartbeat + 90초」마다 한 번 깨는 비용(활성 job이 있을 때만)으로 그 의미를 지킨다. 같은 함수(`cardNewsJobDueAt`)를 읽기 게이트에도 써서, 워커가 사는 job은 폴링 킥을 내지 않는다.
- **연속 기한 경과 백오프 vs 고정 바닥 30초**: 고정 바닥이면 드레인으로 풀리지 않는 행(예: `reconcile-video-reservations.ts:68`이 넘기는 후보, 매번 실패하는 step) 하나가 30초마다 깨운다 — cron의 2배. 연속 횟수를 이어달리기 킥에 실어 바닥을 30분까지 늘린다. 바깥 이벤트는 0부터 다시 세므로 새 일이 생기면 바로 반응한다.
- **상한 6시간 vs 24시간**: 실 최대 기한은 retention 24시간(`CARD_NEWS_CONFIG.retentionDelayMs`)·백오프 상한 24시간. 6시간은 그런 행을 몇 번 더 깨우지만(건당 소수 execution) 한 번의 sleep을 짧게 묶는다. 수치는 상수로 뺐다.
- **`onFailure` 미사용**: 드레인 실패는 핸들러에서 잡아 일정을 이어 간다(위). `onFailure`에서 재킥하면 영구 실패 시 재킥 루프(=우리가 없애려는 매분 비용)가 되므로 넣지 않는다. 옛 cron도 `onFailure` 없이 `retries: 1`이었고 그대로 맞춘다.
- **킥 이벤트 데이터**: `{ reason?, pastDueStreak? }` — `reason`은 대시보드에서 어느 경로가 깨웠는지 보려는 관측용, `pastDueStreak`은 이어달리기 킥만 싣는다. 드레인 본문은 `pastDueStreak` 외에는 `event.data`를 읽지 않는다(전역 드레인).
