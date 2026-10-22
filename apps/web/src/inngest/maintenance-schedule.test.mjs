import assert from "node:assert/strict";
import test from "node:test";

import {
  MAINTENANCE_WAKE_CEILING_MS,
  computeNextWake,
  pastDueFloorMs,
} from "./maintenance-schedule.ts";

const NOW_MS = 10_000_000;
const now = new Date(NOW_MS);

test("pastDueFloorMs doubles the 30s floor per streak, capped at 30 minutes", () => {
  assert.equal(pastDueFloorMs(0), 30_000);
  assert.equal(pastDueFloorMs(1), 60_000);
  assert.equal(pastDueFloorMs(5), 960_000);
  // streak 6 would be 30_000 * 64 = 1_920_000, capped to 1_800_000.
  assert.equal(pastDueFloorMs(6), 1_800_000);
});

test("pastDueFloorMs clamps invalid input to the base floor", () => {
  assert.equal(pastDueFloorMs(-1), 30_000);
  assert.equal(pastDueFloorMs(Number.NaN), 30_000);
  assert.equal(pastDueFloorMs(Number.POSITIVE_INFINITY), 30_000);
  // 2.9 floors to 2 -> 30_000 * 4.
  assert.equal(pastDueFloorMs(2.9), 120_000);
});

test("computeNextWake returns null when there is nothing due and the drain succeeded", () => {
  assert.equal(
    computeNextWake(now, [null, undefined], {
      pastDueStreak: 0,
      drainFailed: false,
    }),
    null,
  );
});

test("computeNextWake keeps a wake when the drain failed even with no deadlines", () => {
  const wake = computeNextWake(now, [null], {
    pastDueStreak: 0,
    drainFailed: true,
  });
  assert.ok(wake);
  assert.equal(wake.wakeAt.getTime(), NOW_MS + 30_000);
  assert.equal(wake.pastDueStreak, 1);
});

test("computeNextWake chooses the earliest future deadline", () => {
  const wake = computeNextWake(
    now,
    [
      new Date(NOW_MS + 100_000),
      new Date(NOW_MS + 50_000),
      new Date(NOW_MS + 200_000),
    ],
    { pastDueStreak: 0, drainFailed: false },
  );
  assert.ok(wake);
  assert.equal(wake.wakeAt.getTime(), NOW_MS + 50_000);
  assert.equal(wake.pastDueStreak, 0);
});

test("computeNextWake lifts a near-future deadline to the 30s floor and resets the streak", () => {
  const wake = computeNextWake(now, [new Date(NOW_MS + 10_000)], {
    pastDueStreak: 5,
    drainFailed: false,
  });
  assert.ok(wake);
  assert.equal(wake.wakeAt.getTime(), NOW_MS + 30_000);
  assert.equal(wake.pastDueStreak, 0);
});

test("computeNextWake caps a far-future deadline at the 6h ceiling", () => {
  const wake = computeNextWake(
    now,
    [new Date(NOW_MS + 7 * 60 * 60_000)],
    { pastDueStreak: 0, drainFailed: false },
  );
  assert.ok(wake);
  assert.equal(wake.wakeAt.getTime(), NOW_MS + MAINTENANCE_WAKE_CEILING_MS);
  assert.equal(wake.pastDueStreak, 0);
});

test("computeNextWake treats a deadline exactly at now as past due", () => {
  const wake = computeNextWake(now, [new Date(NOW_MS)], {
    pastDueStreak: 0,
    drainFailed: false,
  });
  assert.ok(wake);
  assert.equal(wake.wakeAt.getTime(), NOW_MS + 30_000);
  assert.equal(wake.pastDueStreak, 1);
});

test("computeNextWake treats now+1ms as not yet due", () => {
  const wake = computeNextWake(now, [new Date(NOW_MS + 1)], {
    pastDueStreak: 0,
    drainFailed: false,
  });
  assert.ok(wake);
  assert.equal(wake.wakeAt.getTime(), NOW_MS + 30_000);
  assert.equal(wake.pastDueStreak, 0);
});

test("computeNextWake grows the floor by the past-due streak", () => {
  const wake = computeNextWake(now, [new Date(NOW_MS - 1_000)], {
    pastDueStreak: 3,
    drainFailed: false,
  });
  assert.ok(wake);
  assert.equal(wake.wakeAt.getTime(), NOW_MS + 240_000);
  assert.equal(wake.pastDueStreak, 4);
});

test("computeNextWake caps the grown floor at 30 minutes", () => {
  const wake = computeNextWake(now, [new Date(NOW_MS - 1_000)], {
    pastDueStreak: 10,
    drainFailed: false,
  });
  assert.ok(wake);
  assert.equal(wake.wakeAt.getTime(), NOW_MS + 1_800_000);
  assert.equal(wake.pastDueStreak, 11);
});

test("computeNextWake does not count a drain failure as resolved even with a future deadline", () => {
  // A구현이 drainFailed를 무시하면 now+30s·streak 0을 낸다(라운드 2 생존 돌연변이).
  const wake = computeNextWake(now, [new Date(NOW_MS + 5_000)], {
    pastDueStreak: 3,
    drainFailed: true,
  });
  assert.ok(wake);
  assert.equal(wake.wakeAt.getTime(), NOW_MS + 240_000);
  assert.equal(wake.pastDueStreak, 4);
});

test("computeNextWake filters out null, undefined and non-finite dates", () => {
  const wake = computeNextWake(
    now,
    [null, undefined, new Date(Number.NaN), new Date(NOW_MS + 50_000)],
    { pastDueStreak: 0, drainFailed: false },
  );
  assert.ok(wake);
  assert.equal(wake.wakeAt.getTime(), NOW_MS + 50_000);
  assert.equal(wake.pastDueStreak, 0);
});
