import "server-only";

import type { Prisma } from "generated/prisma";
import { ANALYTICS_EVENT_NAMES } from "~/fsd/shared/analytics/event-catalog";
import { db } from "~/server/db";
import { ANALYTICS_FUNNELS } from "../model/funnels";
import {
  buildDropOffReportFromEvents,
  buildFunnelReportFromEvents,
  buildOverviewFromEvents,
  buildRecentFailureEventsFromEvents,
} from "../model/reporting";
import type {
  AnalyticsDateRangeInput,
  AnalyticsDateRangeKey,
  DropOffReportRow,
  FunnelReportInput,
  FunnelStepReport,
  RecentFailureEventRow,
  RecordAnalyticsEventInput,
} from "../model/types";

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

export async function recordAnalyticsEvent(input: RecordAnalyticsEventInput) {
  await db.analyticsEvent.create({
    data: {
      name: input.name,
      anonymousId: input.anonymousId,
      sessionId: input.sessionId,
      path: input.path,
      referrer: input.referrer ?? null,
      metadata: input.metadata as Prisma.InputJsonValue | undefined,
      userId: input.userId ?? null,
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

export async function cleanupExpiredAnalyticsEvents(now = new Date()) {
  const expiresBefore = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000);

  return db.analyticsEvent.deleteMany({
    where: {
      createdAt: {
        lt: expiresBefore,
      },
    },
  });
}
