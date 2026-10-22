import assert from "node:assert/strict";
import test from "node:test";
import {
  PRODUCER_END_SETTLE_GRACE_MS,
  canRecoverySettleVideoAttempt,
  producerEndObservedAt,
} from "./recovery-settle-policy.ts";

const now = new Date("2026-10-22T12:00:00.000Z");
const ago = (ms) => new Date(now.getTime() - ms);
const later = (ms) => new Date(now.getTime() + ms);
const settle = (deadlineAt, producerEndedAt) =>
  canRecoverySettleVideoAttempt({ now, deadlineAt, producerEndedAt });

test("the grace period is exactly five minutes", () => {
  assert.equal(PRODUCER_END_SETTLE_GRACE_MS, 300_000);
});

test("a passed deadline settles, the deadline instant included", () => {
  assert.equal(settle(ago(1), null), true);
  assert.equal(settle(now, null), true);
  assert.equal(settle(now, now), true);
});

test("before the deadline, an end settles only after the grace period", () => {
  assert.equal(settle(later(60_000), null), false);
  assert.equal(settle(later(60_000), now), false);
  assert.equal(settle(later(60_000), ago(299_999)), false);
  assert.equal(settle(later(60_000), ago(300_000)), true);
});

test("a pre-migration dispatch without a deadline waits for an old enough end", () => {
  assert.equal(settle(null, ago(10 * 60_000)), true);
  assert.equal(settle(null, null), false);
  assert.equal(settle(null, now), false);
});

test("the observed end prefers observedAt, then confirmedAt", () => {
  assert.deepEqual(
    producerEndObservedAt({ observedAt: "2026-10-22T11:58:00.000Z" }),
    new Date("2026-10-22T11:58:00.000Z"),
  );
  assert.deepEqual(
    producerEndObservedAt({ confirmedAt: "2026-10-20T07:00:00.000Z" }),
    new Date("2026-10-20T07:00:00.000Z"),
  );
  assert.deepEqual(
    producerEndObservedAt({
      observedAt: "2026-10-22T11:58:00.000Z",
      confirmedAt: "2026-10-20T07:00:00.000Z",
    }),
    new Date("2026-10-22T11:58:00.000Z"),
  );
});

test("unreadable end evidence counts as long past", () => {
  assert.deepEqual(producerEndObservedAt({ observedAt: "not a date" }), new Date(0));
  assert.deepEqual(producerEndObservedAt(null), new Date(0));
  assert.deepEqual(producerEndObservedAt("ended"), new Date(0));
});
