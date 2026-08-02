import type { Metadata } from "next";

import type { AnalyticsDateRangeKey, FunnelId } from "@repo/db";

import { requireAdmin } from "~/auth/guard";
import {
  getAnalyticsOverview,
  getDropOffReport,
  getFunnelReport,
  getRecentFailureEvents,
} from "~/analytics/queries";
import { AdminHeader } from "~/ui/admin-header";
import { AdminAnalyticsPage } from "~/ui/analytics-page";

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
  robots: { index: false, follow: false },
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
  const admin = await requireAdmin();

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
    <>
      <AdminHeader email={admin.email} />
      <main>
        <AdminAnalyticsPage
          range={range}
          funnel={funnel}
          overview={overview}
          funnelReport={funnelReport}
          dropOffReport={dropOffReport}
          recentFailureEvents={recentFailureEvents}
        />
      </main>
    </>
  );
}
