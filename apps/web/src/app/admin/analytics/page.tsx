import type { Metadata } from "next";
import {
  getAnalyticsOverview,
  getDropOffReport,
  getFunnelReport,
  getRecentFailureEvents,
} from "~/fsd/entities/analytics-event";
import { AdminAnalyticsPage } from "~/fsd/pages/admin-analytics/ui";
import { requireAdmin } from "~/fsd/shared/api/admin-guard";
import type {
  AnalyticsDateRangeKey,
  FunnelId,
} from "~/fsd/entities/analytics-event/model/types";

const VALID_RANGES = new Set<AnalyticsDateRangeKey>(["7d", "30d", "90d"]);
const VALID_FUNNELS = new Set<FunnelId>([
  "acquisition",
  "activation",
  "billing",
  "review",
]);

type AdminAnalyticsRouteProps = {
  searchParams: Promise<{
    range?: string;
    funnel?: string;
  }>;
};

export const metadata: Metadata = {
  title: "Admin Analytics",
  robots: {
    index: false,
    follow: false,
  },
};

function parseRange(value: string | undefined): AnalyticsDateRangeKey {
  return value && VALID_RANGES.has(value as AnalyticsDateRangeKey)
    ? (value as AnalyticsDateRangeKey)
    : "30d";
}

function parseFunnel(value: string | undefined): FunnelId {
  return value && VALID_FUNNELS.has(value as FunnelId)
    ? (value as FunnelId)
    : "activation";
}

export default async function AdminAnalyticsRoute({
  searchParams,
}: AdminAnalyticsRouteProps) {
  await requireAdmin();

  const params = await searchParams;
  const range = parseRange(params.range);
  const funnel = parseFunnel(params.funnel);

  const [overview, funnelReport, dropOffReport, recentFailureEvents] =
    await Promise.all([
      getAnalyticsOverview({ range }),
      getFunnelReport({ range, funnel }),
      getDropOffReport({ range }),
      getRecentFailureEvents({ range }),
    ]);

  return (
    <AdminAnalyticsPage
      range={range}
      funnel={funnel}
      overview={overview}
      funnelReport={funnelReport}
      dropOffReport={dropOffReport}
      recentFailureEvents={recentFailureEvents}
    />
  );
}
