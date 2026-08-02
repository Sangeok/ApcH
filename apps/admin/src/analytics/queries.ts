import "server-only";

import {
  ANALYTICS_EVENT_NAMES,
  ANALYTICS_FUNNELS,
  db,
  type AnalyticsDateRangeInput,
  type AnalyticsDateRangeKey,
  type DropOffReportRow,
  type FunnelReportInput,
  type FunnelStepReport,
  type RecentFailureEventRow,
} from "@repo/db";

import {
  buildDropOffReportFromEvents,
  buildFunnelReportFromEvents,
  buildOverviewFromEvents,
  buildRecentFailureEventsFromEvents,
} from "./reporting";

const RANGE_DAYS = {
  "7d": 7,
  "30d": 30,
  "90d": 90,
} as const satisfies Record<AnalyticsDateRangeKey, number>;

const FAILURE_EVENT_NAMES = [
  "upload_prepare_failed",
  "upload_s3_failed",
  "upload_confirmation_failed",
  "processing_schedule_failed",
] as const;

type AnalyticsReportEvent = {
  name: string;
  anonymousId: string;
  sessionId: string;
  path: string;
  userId: string | null;
  createdAt: Date;
};

function getRangeStart(range: AnalyticsDateRangeKey) {
  return new Date(Date.now() - RANGE_DAYS[range] * 24 * 60 * 60 * 1000);
}

async function listRangeEvents(
  input: AnalyticsDateRangeInput,
  names?: readonly string[],
): Promise<AnalyticsReportEvent[]> {
  return db.analyticsEvent.findMany({
    where: {
      createdAt: {
        gte: getRangeStart(input.range),
      },
      ...(names ? { name: { in: [...names] } } : {}),
    },
    select: {
      name: true,
      anonymousId: true,
      sessionId: true,
      path: true,
      userId: true,
      createdAt: true,
    },
    orderBy: {
      createdAt: "asc",
    },
  });
}

export async function getAnalyticsOverview(input: AnalyticsDateRangeInput) {
  const events = await listRangeEvents(input, ANALYTICS_EVENT_NAMES);
  return buildOverviewFromEvents(events);
}

export async function getFunnelReport(
  input: FunnelReportInput,
): Promise<FunnelStepReport[]> {
  const steps = ANALYTICS_FUNNELS[input.funnel];
  const events = await listRangeEvents(input, steps);

  return buildFunnelReportFromEvents(events, steps) as FunnelStepReport[];
}

export async function getDropOffReport(
  input: AnalyticsDateRangeInput,
): Promise<DropOffReportRow[]> {
  const events = await listRangeEvents(input, ANALYTICS_EVENT_NAMES);

  return buildDropOffReportFromEvents(events).slice(0, 25) as DropOffReportRow[];
}

export async function getRecentFailureEvents(
  input: AnalyticsDateRangeInput,
): Promise<RecentFailureEventRow[]> {
  const events = await listRangeEvents(input, FAILURE_EVENT_NAMES);

  return buildRecentFailureEventsFromEvents(events, FAILURE_EVENT_NAMES).slice(
    0,
    25,
  ) as RecentFailureEventRow[];
}
