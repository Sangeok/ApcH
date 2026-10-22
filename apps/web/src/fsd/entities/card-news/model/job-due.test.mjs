import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  CARD_NEWS_HEARTBEAT_STALE_MS,
  cardNewsJobDueAt,
} from "./job-due.ts";

const NOW_MS = 10_000_000;
const now = new Date(NOW_MS);
const DEADLINE_MS = NOW_MS + 900_000; // 15m default job timeout, far future.

function timing(overrides) {
  return {
    deadlineAt: new Date(DEADLINE_MS),
    claimedAt: null,
    heartbeatAt: null,
    nextDispatchAt: null,
    dispatchLeaseUntil: null,
    ...overrides,
  };
}

test("unclaimed job with no nextDispatchAt is due now", () => {
  assert.equal(cardNewsJobDueAt(timing({}), now).getTime(), NOW_MS);
});

test("unclaimed job with a future nextDispatchAt is due then", () => {
  assert.equal(
    cardNewsJobDueAt(
      timing({ nextDispatchAt: new Date(NOW_MS + 60_000) }),
      now,
    ).getTime(),
    NOW_MS + 60_000,
  );
});

test("a later dispatch lease pushes the due time", () => {
  assert.equal(
    cardNewsJobDueAt(
      timing({
        nextDispatchAt: new Date(NOW_MS + 60_000),
        dispatchLeaseUntil: new Date(NOW_MS + 70_000),
      }),
      now,
    ).getTime(),
    NOW_MS + 70_000,
  );
});

test("claimed job with a fresh heartbeat is due at heartbeat + 90s (future)", () => {
  assert.equal(
    cardNewsJobDueAt(
      timing({
        claimedAt: new Date(NOW_MS - 20_000),
        heartbeatAt: new Date(NOW_MS - 10_000),
        nextDispatchAt: new Date(NOW_MS - 5_000),
      }),
      now,
    ).getTime(),
    NOW_MS - 10_000 + CARD_NEWS_HEARTBEAT_STALE_MS,
  );
});

test("claimed job with a stale heartbeat is due at heartbeat + 90s (past = processable)", () => {
  const due = cardNewsJobDueAt(
    timing({
      claimedAt: new Date(NOW_MS - 110_000),
      heartbeatAt: new Date(NOW_MS - 100_000),
      nextDispatchAt: new Date(NOW_MS - 20_000),
    }),
    now,
  ).getTime();
  assert.equal(due, NOW_MS - 100_000 + CARD_NEWS_HEARTBEAT_STALE_MS);
  assert.ok(due < NOW_MS, "a dead worker's job is already processable");
});

test("claimed job with a fresh heartbeat still defers to a later nextDispatchAt", () => {
  assert.equal(
    cardNewsJobDueAt(
      timing({
        claimedAt: new Date(NOW_MS - 20_000),
        heartbeatAt: new Date(NOW_MS - 10_000),
        nextDispatchAt: new Date(NOW_MS + 100_000),
      }),
      now,
    ).getTime(),
    NOW_MS + 100_000,
  );
});

test("claimed job without a heartbeat falls back to nextDispatchAt (gate does not block)", () => {
  assert.equal(
    cardNewsJobDueAt(
      timing({
        claimedAt: new Date(NOW_MS - 20_000),
        heartbeatAt: null,
        nextDispatchAt: new Date(NOW_MS + 60_000),
      }),
      now,
    ).getTime(),
    NOW_MS + 60_000,
  );
});

test("a heartbeat without a claim is ignored (&&, not ||)", () => {
  // heartbeat는 신선한 값(now-10s)이라 heartbeat+90(now+80s)가 nextDispatchAt(now+60s)보다 늦다.
  // `&&`→`||` 돌연변이는 now+80s를 내므로 now+60s 단언이 죽인다.
  assert.equal(
    cardNewsJobDueAt(
      timing({
        claimedAt: null,
        heartbeatAt: new Date(NOW_MS - 10_000),
        nextDispatchAt: new Date(NOW_MS + 60_000),
      }),
      now,
    ).getTime(),
    NOW_MS + 60_000,
  );
});

test("the deadline wins when it is the earliest", () => {
  assert.equal(
    cardNewsJobDueAt(
      timing({
        deadlineAt: new Date(NOW_MS + 30_000),
        nextDispatchAt: new Date(NOW_MS + 60_000),
      }),
      now,
    ).getTime(),
    NOW_MS + 30_000,
  );
});

test("the 90s stale constant matches the dispatch and claim gates in job-lifecycle.ts", () => {
  const source = readFileSync(
    new URL(
      "../../../features/card-news/api/job-lifecycle.ts",
      import.meta.url,
    ),
    "utf8",
  );
  const checks = [
    ...source.matchAll(/heartbeatAt\.getTime\(\) < (\d[\d_]*)/g),
  ];
  assert.equal(
    checks.length,
    2,
    "both the dispatch gate and the claim gate compare heartbeat staleness",
  );
  for (const [, literal] of checks)
    assert.equal(Number(literal.replace(/_/g, "")), CARD_NEWS_HEARTBEAT_STALE_MS);
});
