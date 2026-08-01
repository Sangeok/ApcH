import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  buildDropOffReportFromEvents,
  buildFunnelReportFromEvents,
  buildOverviewFromEvents,
} from "./reporting.ts";

const baseDate = new Date("2026-06-16T00:00:00.000Z");

function event(overrides) {
  return {
    name: "landing_view",
    anonymousId: "anon-1",
    sessionId: "session-1",
    path: "/",
    userId: null,
    createdAt: baseDate,
    ...overrides,
  };
}

describe("analytics reporting", () => {
  it("calculates landing-to-dashboard conversion only from landing visitors", () => {
    const overview = buildOverviewFromEvents([
      event({ anonymousId: "a", name: "landing_view", createdAt: new Date("2026-06-16T00:00:00.000Z") }),
      event({ anonymousId: "a", name: "dashboard_viewed", userId: "user-a", createdAt: new Date("2026-06-16T00:01:00.000Z") }),
      event({ anonymousId: "b", name: "dashboard_viewed", userId: "user-b", createdAt: new Date("2026-06-16T00:02:00.000Z") }),
    ]);

    assert.equal(overview.uniqueVisitors, 2);
    assert.equal(overview.loggedInUsers, 2);
    assert.equal(overview.totalEvents, 3);
    assert.equal(overview.dashboardConversionRate, 1);
  });

  it("counts funnel steps only when they appear after the previous step", () => {
    const report = buildFunnelReportFromEvents(
      [
        event({ anonymousId: "a", name: "dashboard_viewed", createdAt: new Date("2026-06-16T00:00:00.000Z") }),
        event({ anonymousId: "a", name: "upload_file_selected", createdAt: new Date("2026-06-16T00:01:00.000Z") }),
        event({ anonymousId: "a", name: "upload_started", createdAt: new Date("2026-06-16T00:02:00.000Z") }),
        event({ anonymousId: "b", name: "upload_started", createdAt: new Date("2026-06-16T00:00:00.000Z") }),
        event({ anonymousId: "b", name: "dashboard_viewed", createdAt: new Date("2026-06-16T00:01:00.000Z") }),
      ],
      ["dashboard_viewed", "upload_file_selected", "upload_started"],
    );

    assert.deepEqual(
      report.map((row) => row.visitors),
      [2, 1, 1],
    );
    assert.equal(report[1].conversionFromPrevious, 0.5);
    assert.equal(report[1].dropOffFromPrevious, 1);
  });

  it("uses the last meaningful event per browser session for drop-off rows", () => {
    const rows = buildDropOffReportFromEvents([
      event({ anonymousId: "a", sessionId: "s1", name: "landing_view", path: "/", createdAt: new Date("2026-06-16T00:00:00.000Z") }),
      event({ anonymousId: "a", sessionId: "s1", name: "page_exited", path: "/", createdAt: new Date("2026-06-16T00:01:00.000Z") }),
      event({ anonymousId: "b", sessionId: "s2", name: "billing_viewed", path: "/dashboard/billing", createdAt: new Date("2026-06-16T00:02:00.000Z") }),
    ]);

    assert.deepEqual(rows, [
      {
        eventName: "landing_view",
        path: "/",
        sessions: 1,
        share: 0.5,
      },
      {
        eventName: "billing_viewed",
        path: "/dashboard/billing",
        sessions: 1,
        share: 0.5,
      },
    ]);
  });
});
