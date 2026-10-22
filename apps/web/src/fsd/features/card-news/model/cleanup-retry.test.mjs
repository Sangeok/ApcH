import assert from "node:assert/strict";
import test from "node:test";

import {
  CLEANUP_RETRY_CEILING_MS,
  cleanupRetryDelayMs,
} from "./cleanup-retry.ts";

test("cleanupRetryDelayMs doubles from 60s per attempt", () => {
  assert.equal(cleanupRetryDelayMs(1), 60_000);
  assert.equal(cleanupRetryDelayMs(2), 120_000);
  assert.equal(cleanupRetryDelayMs(3), 240_000);
});

test("cleanupRetryDelayMs caps at 24 hours", () => {
  // 60_000 * 2^n first exceeds the ceiling around attempt 12; both stay capped.
  assert.equal(cleanupRetryDelayMs(20), CLEANUP_RETRY_CEILING_MS);
  assert.equal(cleanupRetryDelayMs(31), CLEANUP_RETRY_CEILING_MS);
  assert.equal(cleanupRetryDelayMs(1000), CLEANUP_RETRY_CEILING_MS);
});

test("cleanupRetryDelayMs treats non-positive and invalid input as the first attempt", () => {
  assert.equal(cleanupRetryDelayMs(0), 60_000);
  assert.equal(cleanupRetryDelayMs(-5), 60_000);
  assert.equal(cleanupRetryDelayMs(Number.NaN), 60_000);
  assert.equal(cleanupRetryDelayMs(Number.POSITIVE_INFINITY), 60_000);
});
