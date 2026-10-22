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
