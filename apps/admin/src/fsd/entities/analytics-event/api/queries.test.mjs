import assert from "node:assert/strict";
import { after, beforeEach, describe, it, mock } from "node:test";

const calls = [];
const state = { rows: [] };
const ANALYTICS_EVENT_NAMES = [
  "landing_view",
  "dashboard_viewed",
  "upload_prepare_failed",
];
const ANALYTICS_FUNNELS = {
  activation: ["dashboard_viewed", "upload_file_selected"],
};

mock.module("server-only", { namedExports: {} });
mock.module("@repo/db", {
  namedExports: {
    ANALYTICS_EVENT_NAMES,
    ANALYTICS_FUNNELS,
    db: {
      analyticsEvent: {
        findMany: async (input) => {
          calls.push(input);
          return state.rows;
        },
      },
    },
  },
});

const {
  getAnalyticsOverview,
  getDropOffReport,
  getFunnelReport,
  getRecentFailureEvents,
} = await import("./queries.ts");

after(() => mock.restoreAll());
beforeEach(() => {
  calls.length = 0;
  state.rows = [];
});

function assertReadShape(call, expectedNames) {
  assert.ok(call.where.createdAt.gte instanceof Date);
  assert.deepEqual(call.where.name.in, expectedNames);
  assert.deepEqual(call.orderBy, { createdAt: "asc" });
  assert.deepEqual(call.select, {
    name: true,
    anonymousId: true,
    sessionId: true,
    path: true,
    userId: true,
    createdAt: true,
  });
}

describe("analytics query boundary", () => {
  it("uses one read-only findMany shape for overview, funnel and drop-off", async () => {
    await getAnalyticsOverview({ range: "7d" });
    await getFunnelReport({ range: "30d", funnel: "activation" });
    await getDropOffReport({ range: "90d" });

    assert.equal(calls.length, 3);
    assertReadShape(calls[0], ANALYTICS_EVENT_NAMES);
    assertReadShape(calls[1], ANALYTICS_FUNNELS.activation);
    assertReadShape(calls[2], ANALYTICS_EVENT_NAMES);

    const now = Date.now();
    const expectedDays = [7, 30, 90];
    for (let index = 0; index < calls.length; index += 1) {
      const ageDays =
        (now - calls[index].where.createdAt.gte.getTime()) / 86_400_000;
      assert.ok(Math.abs(ageDays - expectedDays[index]) < 0.01);
    }
  });

  it("keeps the recent-failure filter and 25-row result limit", async () => {
    state.rows = Array.from({ length: 30 }, (_, index) => ({
      name: "upload_prepare_failed",
      anonymousId: `anon-${index}`,
      sessionId: `session-${index}`,
      path: `/upload/${index}`,
      userId: null,
      createdAt: new Date(`2026-08-${String(index + 1).padStart(2, "0")}T00:00:00.000Z`),
    }));
    const rows = await getRecentFailureEvents({ range: "30d" });
    assert.equal(rows.length, 25);
    assertReadShape(calls[0], [
      "upload_prepare_failed",
      "upload_s3_failed",
      "upload_confirmation_failed",
      "processing_schedule_failed",
    ]);
  });
});
