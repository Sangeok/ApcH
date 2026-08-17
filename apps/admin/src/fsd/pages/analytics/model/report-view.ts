import type {
  AnalyticsDateRangeKey,
  AnalyticsOverview,
  DropOffReportRow,
  FunnelId,
  FunnelStepReport,
  RecentFailureEventRow,
} from "@repo/db";

export type AdminAnalyticsPageProps = {
  range: AnalyticsDateRangeKey;
  funnel: FunnelId;
  overview: AnalyticsOverview;
  funnelReport: FunnelStepReport[];
  dropOffReport: DropOffReportRow[];
  recentFailureEvents: RecentFailureEventRow[];
};
