# BUG-19: 매분 cron 4개를 이벤트 구동 단일 정비 함수로 대체

agent: web-dev

## 현재 동작

프로덕션 Inngest에 **매분 도는 cron 함수가 4개** 등록돼 있다.

- `apps/web/src/inngest/card-news-functions.ts:112` `{ cron: "* * * * *" }` — `dispatch-pending-card-news`. 본문은 `listRecoverableCardNewsJobs(new Date(), 100)`(`:114`)로 발송 대상 job을 뽑아 각각 `dispatchCardNewsJob(id)`를 `step.run`으로 돌리고(`:118`), `listPendingCardNewsAnalyticsJobs(100)`(`:122`)로 analytics outbox를 비운다(`:125`).
- `card-news-functions.ts:132` `{ cron: "* * * * *" }` — `reconcile-card-news-jobs`. `listRecoverableCardNewsJobs`로 뽑아 각각 `reconcileCardNewsJob(id)`(`:138`).
- `card-news-functions.ts:143` `{ cron: "* * * * *" }` — `cleanup-card-news-assets`. `listAssetCleanupJobs(new Date(), 100)`(`:148`)로 뽑아 각각 `runCardNewsCleanup(id)`(`:153`).
- `apps/web/src/inngest/video-reservation-functions.ts:5` `{ cron: "* * * * *" }` — `reconcile-video-credit-reservations`. 본문은 `reconcileVideoReservations`를 한 step으로 부른다(`:7`).

넷은 `apps/web/src/app/api/inngest/route.ts:30-33`에서 `serve`에 등록된다. 같은 파일 `:19` `export const maxDuration = 300` — step당 300초 예산.

**이미 같은 뜻의 벌크 헬퍼가 존재한다.** 위 cron들은 리스트+루프를 인라인했지만, 본문과 동일한 헬퍼가 따로 있다:
- `apps/web/src/fsd/features/card-news/api/job-lifecycle.ts:1126` `export async function dispatchPendingCardNewsJobs(): Promise<void>` — recoverable job마다 `dispatchCardNewsJob`+`flushCardNewsAnalytics`, 그 뒤 analytics outbox flush.
- `job-lifecycle.ts:1138` `export async function recoverCardNewsJobs(): Promise<void>` — recoverable job마다 `reconcileCardNewsJob`.
- `apps/web/src/fsd/features/card-news/api/cleanup.ts:504` `export async function cleanupPendingCardNewsAssets(): Promise<void>` — 대상 cleanup마다 `runCardNewsCleanup`.
- `apps/web/src/fsd/features/upload/api/reconcile-video-reservations.ts:34` `export async function reconcileVideoReservations()` — 전역 복구(최대 20건). 셋은 `features/card-news/server`(`:8·:10·:20`)로, 넷째는 `features/upload/server`(`:3`)로 수출된다.

**할 일의 기한은 이미 DB 행이 알고 있다.**
- 미클레임 카드뉴스 job의 다음 발송 시각은 `nextDispatchAt`. 생성 시 `nextDispatchAt: now`(`job-lifecycle.ts:302`), 발송 성공 뒤 `now+60_000`(`:356`), 발송 실패 뒤도 `now+60_000`(`:373`). 클레임된 job은 자기 워커(generate/render)의 30회×30초 루프가 스스로 reconcile하고 `deadlineAt`(`job-lifecycle.ts:301`, 생성 시 `now+CARD_NEWS_CONFIG.jobTimeoutMs`=900초)까지 산다.
- `listRecoverableCardNewsJobs`의 필터(`entities/card-news/api/index.ts:168-184`)는 status pending/running이고 `nextDispatchAt: null | nextDispatchAt <= now | deadlineAt <= now`인 행이다.
- 정리 행의 기한은 `notBefore`·`nextRetryAt`·`leaseUntil`. `listAssetCleanupJobs`(`entities/card-news/api/index.ts:295-313`)는 status != completed, `notBefore <= now`, `(nextRetryAt null | <= now)`, `(leaseUntil null | <= now)`. 재시도는 **60초 고정**이다: `cleanup.ts:492` `nextRetryAt: new Date(cardNewsRuntime().now().getTime() + 60_000)`. 막힌 정리 행이 끝없이 매분 재시도됨은 주석에도 있다(`entities/card-news/api/index.ts:308-309`).
- 영상 복구 후보의 기한은 `ProcessingDispatch.deadlineAt`(claim 시 `apps/web/src/fsd/features/upload/api/claim-processing-attempt.ts:151` `now + 65*60_000`). `listProcessingDispatchRecoveryCandidates`(`entities/processing-dispatch/api/index.ts:69-82`)는 `r.status='held' OR (f.status='processing' AND f.currentAttempt=d.attempt AND d.kind='analyze')`를 `deadlineAt ASC NULLS LAST`로 뽑는다.

**깨우는 이벤트는 이미 다 있다.** `apps/web/src/inngest/client.ts`의 `Events`에 `card-news/generate.requested`·`card-news/render.requested`·`card-news/completed`(`card-news-contract.ts:7-11`), `processing/attempt.claimed`(`client.ts:50-58`)가 정의돼 있다. `processing/attempt.claimed`는 `functions.ts:222`·`:637`에서 발송되고 `watchProcessingAttempt`(`functions.ts:902`)가 이미 이벤트 구동+`step.sleep`로 돈다(cron 아닌 패턴의 선례).

**읽기 시 복구 선례**: `apps/web/src/app/dashboard/page.tsx:26` `await reconcileStaleUploadedFilesForUser(session.user.id)` — 대시보드 방문이 그 사용자의 밀린 업로드를 동기 reconcile한다.

**이벤트 없이 정리 행을 만드는 경로**(커밋 뒤 아무도 깨우지 않음): `cleanup.ts:210`(`acceptCardNewsDeletion`), `delete-clip-assets.ts:69`(`acceptClipAssetDeletion`), `delete-upload-assets.ts:116`(`acceptUploadAssetDeletion`). 나머지 세 `createAssetCleanupJob` 호출(`cleanup.ts:113`·`:170`, `settle-processing-attempt.ts:199`)은 이미 트리거된 흐름(reconcile 완료·fail·settleProcessingAttempt) 안에서 생기므로 별도 깨움이 필요 없다.

**매분 워커를 전제한 주석**: `job-lifecycle.ts:658` `/* Inbox is durable; the minute recovery worker reads it directly. */`.

**설치된 SDK**: `inngest@3.54.0`(`node_modules/inngest/package.json`). 타입으로 확인:
- `createFunction(options, trigger, handler)`의 `trigger`는 `SingleOrArray<Trigger>` — **배열로 다중 트리거 허용**(`node_modules/inngest/components/Inngest.d.ts:425`). `Trigger<T>`는 `{ event: T; if? } | { cron }`(`InngestFunction.d.ts:89-94`).
- `singleton?: { mode: "skip"|"cancel"; key? }`(`InngestFunction.d.ts:312-325`). 문서: `"cancel"`는 "cancels the existing run and starts the new one"(`:322`), "while another is still **in progress**"(`:307`).
- `onFailure?`(`:341`), `debounce?`(`types.d.ts:1385`) 존재.
- `step.sleepUntil(idOrOptions, time: Date | string | ...)`(`node_modules/inngest/components/InngestStepTools.d.ts:225`).

**관련 스키마 필드는 모두 존재하고 인덱스도 충분하다**(읽기 전용 — 변경 안 함): `CardNewsJob.deadlineAt DateTime`(비null), `nextDispatchAt DateTime?`, `claimedAt DateTime?`, 인덱스 `@@index([status, nextDispatchAt])`·`@@index([status, deadlineAt])`(`schema.prisma:321·324·328·354·355`). `AssetCleanupJob.notBefore DateTime @default(now())`(비null)·`leaseUntil DateTime?`·`nextRetryAt DateTime?`, 인덱스 `@@index([status, notBefore, nextRetryAt])`. `ProcessingDispatch.deadlineAt DateTime?`.

## 문제

요구의 원천은 `TASK_BACKLOG.md`의 BUG-19 `source`다(관측 1~7·진단·요구 ①~⑦·채택안 (c)). 사용자 0명에도 네 cron이 매분 돌아 런당 step 2·1·1·1 = 분당 9 execution → 하루 약 12,960(관측 2)이 나가고, 네 함수 모두 매분 DB를 조회해 **Neon compute가 자동 정지하지 못한다**. 소유자가 대시보드에서 4개를 일시정지한 상태다(관측 3).

진단(백로그): 복구 로직이 아니라 **깨어나는 시각**이 문제다. 할 일의 기한은 DB 행(`nextDispatchAt`·`deadlineAt`·`notBefore`·`nextRetryAt`)이 이미 아는데(위 「현재 동작」에서 확인), cron은 그걸 무시하고 고정 1분 간격으로 전체를 훑는다. 평소 흐름은 요청 직후 직접 발송·워커 자체 reconcile로 돌고, cron이 메우는 것은 런이 죽거나 발송이 실패한 경우뿐이다(관측 5). 더해 정리 재시도가 60초 고정이라 막힌 행 하나가 cron 비용을 영구화한다(관측 6).

소유자 지시는 「cron이 아닌 방식」이고, 백로그 요구 ①~⑦에 채택 설계가 있다: 이벤트 다중 트리거+singleton cancel로 **단일 정비 함수**를 깨워 기존 헬퍼를 그대로 부르고(복구 의미 불변), DB의 다음 기한까지 `step.sleepUntil`로 잔다. 일이 없으면 런이 끝난다 — 사용자 0명이면 **실행 0**.

백로그와 코드가 어긋난 점: 백로그가 부르라는 헬퍼(`dispatchPendingCardNewsJobs` 등)는 존재하나, 현재 cron 본문은 그 헬퍼를 호출하지 않고 리스트+루프를 인라인한다. 본 계획은 cron을 제거하고 **헬퍼를 호출**하는 단일 함수로 대체한다(의미 동일, 단 step 입도는 per-item→per-helper로 바뀜 — 「대안」 참조).

## 고칠 파일

| 파일 | 변경 |
| --- | --- |
| `src/inngest/maintenance-schedule.ts` `(신규)` | 다음 깨움 시각 계산 순수 함수 `computeNextWake`(바닥 30초·상한 6시간·전부 null→null) + 상수 |
| `src/inngest/maintenance-schedule.test.mjs` `(신규)` | `computeNextWake` 테스트 |
| `src/inngest/maintenance-event.ts` `(신규)` | `kickMaintenanceDrain(reason)` best-effort 킥 + 이벤트명 상수 |
| `src/inngest/maintenance-functions.ts` `(신규)` | `maintenanceDrain` — 다중 트리거+singleton cancel, 4개 헬퍼를 step으로 드레인→다음 기한 계산→`sleepUntil`, idle면 종료 |
| `src/inngest/maintenance-functions.test.mjs` `(신규)` | `maintenanceDrain`의 구조 시험(vm+transpile, 기존 `card-news-functions.test.mjs` 기법) |
| `src/fsd/features/card-news/model/cleanup-retry.ts` `(신규)` | 정리 재시도 지수 백오프 순수 함수 `cleanupRetryDelayMs`(60초→2배→24시간 상한) |
| `src/fsd/features/card-news/model/cleanup-retry.test.mjs` `(신규)` | `cleanupRetryDelayMs` 테스트 |
| `src/inngest/card-news-functions.ts` | cron 3개(`dispatchPendingCardNews`·`reconcileCardNewsJobs`·`cleanupCardNewsAssets`) 제거, 쓰이지 않게 된 import 정리. `generateCardNews`·`renderCardNews`는 유지 |
| `src/inngest/video-reservation-functions.ts` `(삭제)` | 유일 export(cron)가 `maintenanceDrain`으로 흡수됨 |
| `src/app/api/inngest/route.ts` | cron 4개 등록 제거, `maintenanceDrain` 등록 |
| `src/inngest/client.ts` | `Events`에 `"maintenance/drain.requested": { data: { reason?: string } }` 추가 |
| `src/fsd/entities/card-news/api/index.ts` | 다음 기한 쿼리 `nextCardNewsJobWakeAt`·`nextAssetCleanupWakeAt`, 읽기 게이트 `hasOverdueActiveCardNewsJob` 추가(읽기 전용) |
| `src/fsd/entities/processing-dispatch/api/index.ts` | 다음 기한 쿼리 `nextVideoReservationWakeAt` 추가(읽기 전용) |
| `src/fsd/entities/processing-dispatch/server.ts` | `nextVideoReservationWakeAt` 재수출 |
| `src/fsd/features/card-news/api/cleanup.ts` | `cleanup.ts:492` 60초 고정→`cleanupRetryDelayMs(current.attemptCount)`(요구 ⑥), `acceptCardNewsDeletion` 커밋 뒤 킥(요구 ④) |
| `src/fsd/features/card-news/api/job-lifecycle.ts` | `:658` 매분 워커 전제 주석 정정(요구 ⑦) |
| `src/fsd/features/card-news/api/index.ts` | `listCardNews`·`getCardNewsDetail`에 읽기 시 안전망 킥(요구 ⑤) |
| `src/fsd/features/clip/api/delete-clip-assets.ts` | `acceptClipAssetDeletion` 커밋 뒤 킥(요구 ④) |
| `src/fsd/features/upload/api/delete-upload-assets.ts` | `acceptUploadAssetDeletion` 커밋 뒤 킥(요구 ④) |
| `src/app/dashboard/page.tsx` | 방문 시 overdue 카드뉴스 작업이 있으면 킥(요구 ⑤, `:26` 선례 옆) |

여기 없는 파일은 고치지 않는다. 특히 복구 헬퍼의 **내부 의미**(FEAT-63 소관)는 건드리지 않는다 — cleanup.ts의 변경은 재시도 **간격 리터럴**(⑥은 BUG-19 범위)과 삭제 경로의 킥뿐이다.

## 구현 스케치

### `src/inngest/maintenance-schedule.ts` (신규, 순수)

```ts
// 정비 드레인이 DB의 다음 기한까지 잘 때, 그 시각을 계산한다.
// 각 도메인의 "다음 깨어날 시각" 후보(없으면 null)를 받아 최소값을 바닥·상한으로 클램프한다.
// 모두 null이면 할 일이 없다 → null(런 종료). 바닥 30초: 캡(100건)으로 남은 due 행이
// 즉시 재깨움(hot loop)하는 것을 막는다. 상한 6시간: 1회 sleep을 Free 플랜 런 길이(30일) 한참 아래로 묶는다.
export const MAINTENANCE_WAKE_FLOOR_MS = 30_000;
export const MAINTENANCE_WAKE_CEILING_MS = 6 * 60 * 60 * 1000;
export const MAINTENANCE_MAX_DRAIN_CYCLES = 32;

export function computeNextWake(
  now: Date,
  deadlines: readonly (Date | null | undefined)[],
): Date | null {
  const times = deadlines
    .filter((d): d is Date => d instanceof Date && Number.isFinite(d.getTime()))
    .map((d) => d.getTime());
  if (times.length === 0) return null;
  const earliest = Math.min(...times);
  const floor = now.getTime() + MAINTENANCE_WAKE_FLOOR_MS;
  const ceiling = now.getTime() + MAINTENANCE_WAKE_CEILING_MS;
  return new Date(Math.min(Math.max(earliest, floor), ceiling));
}
```

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

(이 모듈은 `./client`만 의존하므로 feature → maintenance-event → feature 순환이 없다. `maintenance-functions.ts`는 헬퍼를 import하므로 킥 함수를 여기 두지 않는다.)

### `src/inngest/client.ts` (편집) — `Events`에 추가

`type Events = CardNewsEvents & { ... }` 안, 기존 `"modal/video.analyzed"` 블록 뒤에:

```ts
  "maintenance/drain.requested": {
    data: { reason?: string };
  };
```

### `src/inngest/maintenance-functions.ts` (신규)

```ts
import { inngest } from "./client";
import {
  dispatchPendingCardNewsJobs,
  recoverCardNewsJobs,
  cleanupPendingCardNewsAssets,
} from "~/fsd/features/card-news/server";
import { reconcileVideoReservations } from "~/fsd/features/upload/server";
import {
  nextCardNewsJobWakeAt,
  nextAssetCleanupWakeAt,
} from "~/fsd/entities/card-news/server";
import { nextVideoReservationWakeAt } from "~/fsd/entities/processing-dispatch/server";
import {
  computeNextWake,
  MAINTENANCE_MAX_DRAIN_CYCLES,
} from "./maintenance-schedule";

// cron 없는 단일 정비 함수. 일이 생길 때만(이벤트) 깨어나 기존 복구 헬퍼를 그대로 부르고,
// DB의 다음 기한까지 잔다. 할 일이 없으면 런이 끝난다 — 사용자 0명이면 실행 0.
// singleton cancel: 새 트리거 이벤트가 자고 있는(또는 도는) 이전 런을 대체해 일정을 다시 잡는다.
export const maintenanceDrain = inngest.createFunction(
  { id: "maintenance-drain", retries: 1, singleton: { mode: "cancel" } },
  [
    { event: "card-news/generate.requested" },
    { event: "card-news/render.requested" },
    { event: "card-news/completed" },
    { event: "processing/attempt.claimed" },
    { event: "maintenance/drain.requested" },
  ],
  async ({ step }) => {
    for (let cycle = 0; cycle < MAINTENANCE_MAX_DRAIN_CYCLES; cycle += 1) {
      // 복구 의미는 2026-10-20 출시 검증을 거친 기존 헬퍼 그대로. 각 헬퍼는 행 잠금·compare-and-set·
      // claim 리스로 멱등하므로 step 재시도/재실행이 안전하다.
      await step.run(`drain-card-news-dispatch-${cycle}`, dispatchPendingCardNewsJobs);
      await step.run(`drain-card-news-recover-${cycle}`, recoverCardNewsJobs);
      await step.run(`drain-card-news-cleanup-${cycle}`, cleanupPendingCardNewsAssets);
      await step.run(`drain-video-reservations-${cycle}`, reconcileVideoReservations);
      const nextWakeIso = await step.run(`plan-next-wake-${cycle}`, async () => {
        const now = new Date();
        const next = computeNextWake(now, [
          await nextCardNewsJobWakeAt(now),
          await nextAssetCleanupWakeAt(),
          await nextVideoReservationWakeAt(),
        ]);
        return next ? next.toISOString() : null;
      });
      if (!nextWakeIso) return { idle: true, cycles: cycle + 1 };
      await step.sleepUntil(`sleep-until-${cycle}`, nextWakeIso);
    }
    return { cyclesExhausted: true };
  },
);
```

드레인을 먼저 돌려 due 행을 처리(그 과정에서 기한이 앞으로 이동 — 발송 뒤 `nextDispatchAt`+60초)한 **뒤에** 다음 기한을 계산한다. 캡(100/20)에 걸려 due 행이 남으면 `computeNextWake`의 바닥값이 30초 뒤로 묶어 다음 배치를 돈다. `MAINTENANCE_MAX_DRAIN_CYCLES`에 닿으면 런을 끝내고 다음 트리거 이벤트/방문이 재개한다(실기한 ≤24시간이라 연속 32사이클은 비현실적이고, 읽기 안전망이 backstop).

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

### `src/inngest/card-news-functions.ts` (편집)

- `:110-155`의 세 export(`dispatchPendingCardNews`·`reconcileCardNewsJobs`·`cleanupCardNewsAssets`)를 통째로 제거. `generateCardNews`(`:18`)·`renderCardNews`(`:64`)는 유지.
- import 정리: `features/card-news/server`에서 `generate`/`render`가 쓰는 `claimCardNewsJob`·`prepareCardNewsCpuSpawn`·`callCardNewsCpu`·`recordCardNewsCpuSpawn`·`reconcileCardNewsJob`만 남기고 `runCardNewsCleanup`·`dispatchCardNewsJob`·`flushCardNewsAnalytics` 제거. `entities/card-news/server` import 블록(`listRecoverableCardNewsJobs`·`listPendingCardNewsAnalyticsJobs`·`listAssetCleanupJobs`)은 전부 cron 전용이므로 블록째 제거(안 그러면 `noUnusedLocals`로 `check` 실패).

### `src/fsd/entities/card-news/api/index.ts` (편집, 끝에 추가)

`db`는 이미 `:9`에서 import됨.

```ts
export async function nextCardNewsJobWakeAt(now: Date): Promise<Date | null> {
  const [row] = await db.$queryRaw<{ next: Date | null }[]>`
    SELECT MIN(CASE WHEN "claimedAt" IS NULL
                    THEN COALESCE("nextDispatchAt", ${now})
                    ELSE "deadlineAt" END) AS next
    FROM "CardNewsJob"
    WHERE "status" IN ('pending', 'running')`;
  return row?.next ?? null;
}

export async function nextAssetCleanupWakeAt(): Promise<Date | null> {
  // GREATEST는 Postgres에서 NULL을 무시한다. notBefore는 비null이라 행마다 결과가 비null이다.
  const [row] = await db.$queryRaw<{ next: Date | null }[]>`
    SELECT MIN(GREATEST("notBefore", "nextRetryAt", "leaseUntil")) AS next
    FROM "AssetCleanupJob"
    WHERE "status" <> 'completed'`;
  return row?.next ?? null;
}

// 읽기 시 안전망의 게이트. listRecoverableCardNewsJobs(:168)의 필터를 userId로 좁힌 존재 검사.
export async function hasOverdueActiveCardNewsJob(
  userId: string,
  now: Date,
): Promise<boolean> {
  const row = await db.cardNewsJob.findFirst({
    where: {
      userId,
      status: { in: ["pending", "running"] },
      OR: [
        { nextDispatchAt: null },
        { nextDispatchAt: { lte: now } },
        { deadlineAt: { lte: now } },
      ],
    },
    select: { id: true },
  });
  return row !== null;
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
  import { hasOverdueActiveCardNewsJob } from "~/fsd/entities/card-news/server";
  import { kickMaintenanceDrain } from "~/inngest/maintenance-event";
  ```
  (`findCardNewsSet`·`listCardNewsSets` 등은 이미 `~/fsd/entities/card-news/server`에서 import 중이므로 `hasOverdueActiveCardNewsJob`은 그 블록에 합류.)
- `listCardNews`(`:96`) 콜백 시작에:
  ```ts
  return authenticatedAction(async (userId) => {
    if (await hasOverdueActiveCardNewsJob(userId, new Date()))
      await kickMaintenanceDrain("card-news-read");
  ```
- `getCardNewsDetail`(`:111`) 콜백 시작에 같은 두 줄 추가.
  (게이트가 있어 폴링마다 보내지 않는다: 드레인이 발송하면 `nextDispatchAt`이 +60초로 밀려 overdue가 해제되므로 다음 폴링은 킥하지 않는다.)

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
  import { hasOverdueActiveCardNewsJob } from "~/fsd/entities/card-news/server";
  import { kickMaintenanceDrain } from "~/inngest/maintenance-event";
  ```
- `:27` `await reconcileUploadDraftsForUser(session.user.id);` 뒤:
  ```ts
  if (await hasOverdueActiveCardNewsJob(session.user.id, new Date()))
    await kickMaintenanceDrain("dashboard-visit");
  ```
  (업로드/영상 밀림은 `:26` `reconcileStaleUploadedFilesForUser`가 동기 처리하고, held 영상 예약은 `processing/attempt.claimed` 트리거+타이머가 덮으므로, 방문 킥은 카드뉴스 overdue에만 건다.)

### 함수 id 결정 — 새 id, 옛 4개는 소멸

`maintenance-drain`은 **새 id**다(옛 id 재사용 안 함). 트리거·본문이 전혀 다른 함수이고, 옛 id를 재사용하면 일시정지 상태까지 상속해 배포 후 Resume이 필요하다. 새 id는 un-paused로 배포되고, 옛 4개(`dispatch-pending-card-news`·`reconcile-card-news-jobs`·`cleanup-card-news-assets`·`reconcile-video-credit-reservations`)는 등록이 사라지므로 대시보드에서 자동 소멸한다 — Resume 불필요.

## 테스트

- **덮는 것**:
  - `maintenance-schedule.test.mjs` — `computeNextWake`: 전부 null→null, 한 값만 유효, 최소값 선택, 바닥 클램프(최솟값 < now+30초 → now+30초), 상한 클램프(최솟값 > now+6시간 → now+6시간), `null`/`undefined`/비유한(`new Date(NaN)`) 혼재 필터, 경계(정확히 바닥/상한).
  - `cleanup-retry.test.mjs` — `cleanupRetryDelayMs`: attempt 1→60_000, 2→120_000, 3→240_000, 큰 값→상한 86_400_000, 0·음수→60_000, 비유한→60_000(=attempts 1), 지수 상한(2^30에서 포화).
  - `maintenance-functions.test.mjs` — 구조 시험(기존 `card-news-functions.test.mjs`의 vm+`typescript` transpile 기법 재사용, `./client`·features·entities·`./maintenance-schedule`을 require로 스텁): (1) 한 사이클에서 네 드레인 헬퍼가 각각 `step.run`으로 불린다, (2) `plan-next-wake`가 null을 주면 `sleepUntil` 없이 `{ idle: true }`로 종료, (3) ISO를 주면 `sleepUntil`을 그 값으로 부른 뒤 다음 사이클로 간다, (4) 다중 트리거 배열과 `singleton.mode === "cancel"`이 설정됐다.
- **못 덮는 범위**(Node 내장 러너·DOM/DB/외부 I/O 없음):
  - **singleton cancel이 자고 있는(sleeping) 런도 대체하는지는 SDK 문서에 명시가 없다**(`InngestFunction.d.ts:307` "while another is still in progress"·`:322`까지). 어느 쪽이어도 설계는 정확하다: 헬퍼가 행 잠금(`lockedCardNewsJob`·`lockAssetCleanupJob`·`FOR UPDATE`)과 compare-and-set(`compareAndSetCardNewsJob`)·claim 리스(`claimAssetCleanupJob`의 `leaseUntil`)로 멱등이라, 자는 런과 새 런이 겹쳐 중복 실행돼도 두 번째가 이미 처리된 행을 건너뛴다. 다른 점은 중복 실행 비용뿐이다. 배포 후 Inngest 대시보드로 관측(아래 원장).
  - 세 raw SQL 다음 기한 쿼리(`$queryRaw`)의 실제 결과 — DB 없이는 판정 불가. `GREATEST`의 NULL 무시·`COALESCE` 폴백은 코드 독해로만 확인(실행 미확인).
  - 킥 이벤트 발송·트리거 매칭·`step.sleepUntil`의 실제 수면 — 전부 Inngest 런타임 I/O.
  - 읽기 안전망의 `hasOverdueActiveCardNewsJob` 쿼리와 킥 — DB+I/O.
  - **배포 후 수동 확인(원장 등재 대상)**: ① 유휴 시(사용자 0명) `maintenance-drain` 실행 0. ② 업로드 1건이면 claim 직후 1회 + `deadlineAt`에 1회(=한 런에 사이클 2). ③ Neon compute Idle 복귀. ④ 일시정지했던 4개 id는 배포로 소멸(새 id라 Resume 불필요 — 위 「함수 id 결정」).
- **테스트 목록 표 갱신**(`apps/web/CLAUDE.md`는 읽기 전용이라 직접 안 고침 — 보고에 추가 행 제안): `inngest/maintenance-schedule.test.mjs`, `inngest/maintenance-functions.test.mjs`, `features/card-news/model/cleanup-retry.test.mjs` 3행 추가, `inngest/card-news-functions.test.mjs` 행 제거(파일 삭제).

## 범위 밖 의존

**없음.** 전부 `apps/web` 안이다. 백로그가 확인하라던 「기한 계산이 스키마 변경·인덱스 추가 없이 되는가」를 직접 검산했다: 세 쿼리가 쓰는 컬럼(`CardNewsJob.claimedAt`·`nextDispatchAt`·`deadlineAt`·`status`, `AssetCleanupJob.notBefore`·`nextRetryAt`·`leaseUntil`·`status`, `ProcessingDispatch.deadlineAt` + join 컬럼)은 모두 현 스키마에 존재하고(「현재 동작」 schema 인용), 기존 인덱스 `@@index([status, nextDispatchAt])`·`@@index([status, deadlineAt])`·`@@index([status, notBefore, nextRetryAt])`로 충분하다. 영상 쿼리는 `listProcessingDispatchRecoveryCandidates`가 이미 deadlineAt 전용 인덱스 없이 같은 WHERE/ORDER로 도는 것을 그대로 쓴다. 따라서 `packages/db` 변경이 **필요 없다**.

**FEAT-63(main-loop) 경계**: 복구 헬퍼의 **의미**는 FEAT-63 소관이라 건드리지 않는다. 본 계획은 (a) cron **스케줄**을 이벤트+sleepUntil로 바꾸고(BUG-19 소관), (b) 정리 재시도 **간격 리터럴**만 60초→지수 백오프로 바꾼다(요구 ⑥은 과업 지시로 BUG-19 범위임이 명시됨) — 둘 다 복구 로직의 판정·분기를 바꾸지 않는다. FEAT-63 행·계획서는 손대지 않는다. 두 항목이 같은 파일(`cleanup.ts`·`job-lifecycle.ts`)을 만질 수 있으나, 본 변경 지점(재시도 간격·주석·삭제 후 킥)은 복구 의미와 독립적이다.

## 대안

- **깨우는 방식 — 채택안 (c) vs (a)(b)**(백로그 판단 근거): (a) 주기만 낮추기(`*/15`·매시)는 가장 작은 수정이나 할 일이 없어도 비용이 0이 아니고 Neon이 주기마다 깨며 복구 지연이 주기만큼 는다. (b) 작업별 개별 가드(job마다 `sleepUntil`·정리 행마다 이벤트)는 `createAssetCleanupJob` 호출 6곳(`cleanup.ts:113·:170·:210`·`delete-clip-assets.ts:69`·`delete-upload-assets.ts:116`·`settle-processing-attempt.ts:199`)이 모두 트랜잭션 안이라 커밋 뒤 발송을 곳곳에 심어야 하고, 하나라도 빠지면 그 행은 영영 안 돈다(전체 훑기 안전망 없음). 채택안 (c)는 「DB가 진실이고 매번 전체를 훑는다」는 cron의 정확성을 유지하고 깨어나는 시각만 DB 기한에 맞춘다 — 킥이 빠져도 다음 아무 이벤트·방문이 전체를 훑는다.
- **step 입도 — per-helper(채택) vs per-item vs one-step**: 옛 cron은 item마다 `step.run`(`dispatch-card-news-${id}` 등)을 두어 요청 예산을 쪼갰다(`card-news-functions.test.mjs`가 그 불변을 지킴). 백로그는 **벌크 헬퍼 호출**을 요구하는데 헬퍼는 내부 루프에 step 경계가 없으므로 per-item은 불가능하다. 채택: 헬퍼 하나당 step 하나(한 사이클 4 step). 캡(100/20)에 걸린 최악의 경우 cleanup 헬퍼가 producer-status HTTP를 순차로 돌려 한 step이 300초 예산에 근접할 수 있으나, (1) 실 사용량은 0~소수(사용자 0명), (2) cleanup은 완료·리스 행을 건너뛰어 step 재시도마다 **전진**하므로(남은 행만 처리) 예산 초과 시 재시도가 이어서 끝낸다 — 정확성은 멱등으로 보장되고 벽시계만 늘어난다. one-step(넷을 한 step)은 execution을 더 줄이지만 관측성·재시도 입도가 나빠 택하지 않았다. 어느 쪽이든 유휴 비용은 0이라(온디맨드 실행) cron 문제와 무관하다.
- **상한 6시간 vs 24시간**: 실 최대 기한은 retention 24시간(`CARD_NEWS_CONFIG.retentionDelayMs`)·백오프 상한 24시간. 상한을 24시간으로 두면 그런 행을 1회에 깨우지만 단일 런이 최대 32×24시간까지 길어질 수 있다. 6시간은 retention 행을 몇 번 더 깨우지만(건당 소수 execution, 삭제가 드물어 무시 가능) 런 길이를 30일 한참 아래로 묶는다 — 런 길이 상한을 우선해 6시간 채택. 수치는 조정 가능하도록 상수로 뺐다.
- **`onFailure` 미사용**: 런이 재시도 소진으로 완전 실패해도 다음 트리거 이벤트/방문이 singleton으로 새 런을 시작한다. `onFailure`에서 재킥하면 영구 실패 시 재킥 루프(=우리가 없애려는 매분 비용)가 되므로 넣지 않는다. 옛 cron도 `onFailure` 없이 `retries: 1`이었고 그대로 맞춘다.
- **킥 이벤트 데이터**: `{ reason?: string }` — 대시보드에서 어느 경로가 깨웠는지 보려는 관측용 옵션 필드. 드레인 본문은 `event.data`를 읽지 않는다(전역 드레인).
