import type { AnalyticsEventName } from "~/fsd/shared/analytics/event-catalog";

export type AnalyticsDateRangeKey = "7d" | "30d" | "90d";
export type FunnelId = "acquisition" | "activation" | "billing";

export type AnalyticsDateRangeInput = {
  range: AnalyticsDateRangeKey;
};

export type RecordAnalyticsEventInput = {
  name: AnalyticsEventName;
  anonymousId: string;
  sessionId: string;
  path: string;
  referrer?: string | null;
  metadata?: Record<string, unknown>;
  userId?: string | null;
};

export type FunnelReportInput = AnalyticsDateRangeInput & {
  funnel: FunnelId;
};

export type FunnelStepReport = {
  step: AnalyticsEventName;
  visitors: number;
  conversionFromPrevious: number | null;
  dropOffFromPrevious: number | null;
  dropOffRateFromPrevious: number | null;
};

export type DropOffReportRow = {
  eventName: AnalyticsEventName;
  path: string;
  sessions: number;
  share: number;
};

export type RecentFailureEventRow = {
  eventName: AnalyticsEventName;
  path: string;
  count: number;
  lastSeenAt: Date;
};

export type AnalyticsOverview = {
  uniqueVisitors: number;
  loggedInUsers: number;
  totalEvents: number;
  dashboardConversionRate: number | null;
};
