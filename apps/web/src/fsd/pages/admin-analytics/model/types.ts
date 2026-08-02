import type {
  AnalyticsDateRangeKey,
  AnalyticsOverview,
  DropOffReportRow,
  FunnelId,
  FunnelStepReport,
  RecentFailureEventRow,
} from "~/fsd/entities/analytics-event/model/types";

export type AdminAnalyticsPageProps = {
  range: AnalyticsDateRangeKey;
  funnel: FunnelId;
  overview: AnalyticsOverview;
  funnelReport: FunnelStepReport[];
  dropOffReport: DropOffReportRow[];
  recentFailureEvents: RecentFailureEventRow[];
};
