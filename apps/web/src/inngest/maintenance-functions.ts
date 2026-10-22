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
          ? {
              wakeAt: wake.wakeAt.toISOString(),
              pastDueStreak: wake.pastDueStreak,
            }
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
