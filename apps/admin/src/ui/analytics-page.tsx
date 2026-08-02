import Link from "next/link";

import {
  FUNNEL_LABELS,
  type AnalyticsDateRangeKey,
  type FunnelId,
} from "@repo/db";

import { Badge } from "~/ui/atoms/badge";
import { Button } from "~/ui/atoms/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "~/ui/atoms/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "~/ui/atoms/table";

import { formatRate } from "./format-rate";
import type { AdminAnalyticsPageProps } from "./types";

const RANGE_LABELS = {
  "7d": "7 days",
  "30d": "30 days",
  "90d": "90 days",
} as const satisfies Record<AnalyticsDateRangeKey, string>;

function analyticsHref(range: AnalyticsDateRangeKey, funnel: FunnelId) {
  return `/analytics?range=${range}&funnel=${funnel}`;
}

function EmptyRow({ colSpan }: { colSpan: number }) {
  return (
    <TableRow>
      <TableCell colSpan={colSpan} className="py-8 text-center text-muted-foreground">
        No data for the selected range.
      </TableCell>
    </TableRow>
  );
}

export function AdminAnalyticsPage({
  range,
  funnel,
  overview,
  funnelReport,
  dropOffReport,
  recentFailureEvents,
}: AdminAnalyticsPageProps) {
  const overviewCards = [
    ["Unique visitors", overview.uniqueVisitors.toLocaleString()],
    ["Logged-in users", overview.loggedInUsers.toLocaleString()],
    ["Total tracked events", overview.totalEvents.toLocaleString()],
    [
      "Landing-to-dashboard conversion",
      formatRate(overview.dashboardConversionRate),
    ],
  ];

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-6 px-4 py-8">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight">
            Admin Analytics
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            First-party funnel analytics for onboarding, upload, and billing.
          </p>
        </div>
        <Badge variant="secondary">Raw events retained for 90 days</Badge>
      </div>

      <div className="flex flex-wrap gap-2">
        {(Object.keys(RANGE_LABELS) as AnalyticsDateRangeKey[]).map(
          (rangeKey) => (
            <Button
              key={rangeKey}
              asChild
              variant={rangeKey === range ? "default" : "outline"}
              size="sm"
            >
              <Link href={analyticsHref(rangeKey, funnel)}>
                {RANGE_LABELS[rangeKey]}
              </Link>
            </Button>
          ),
        )}
      </div>

      <section className="grid gap-4 md:grid-cols-4">
        {overviewCards.map(([label, value]) => (
          <Card key={label}>
            <CardHeader className="pb-2">
              <CardDescription>{label}</CardDescription>
              <CardTitle className="text-2xl">{value}</CardTitle>
            </CardHeader>
          </Card>
        ))}
      </section>

      <Card>
        <CardHeader>
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div>
              <CardTitle>Funnel</CardTitle>
              <CardDescription>
                Steps count a visitor only when the next event appears after the
                previous step.
              </CardDescription>
            </div>
            <div className="flex flex-wrap gap-2">
              {(Object.keys(FUNNEL_LABELS) as FunnelId[]).map((funnelKey) => (
                <Button
                  key={funnelKey}
                  asChild
                  variant={funnelKey === funnel ? "default" : "outline"}
                  size="sm"
                >
                  <Link href={analyticsHref(range, funnelKey)}>
                    {FUNNEL_LABELS[funnelKey]}
                  </Link>
                </Button>
              ))}
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Step</TableHead>
                <TableHead>Visitors</TableHead>
                <TableHead>Conversion from previous</TableHead>
                <TableHead>Drop-off</TableHead>
                <TableHead>Drop-off rate</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {funnelReport.length === 0 ? (
                <EmptyRow colSpan={5} />
              ) : (
                funnelReport.map((row) => (
                  <TableRow key={row.step}>
                    <TableCell className="font-medium">{row.step}</TableCell>
                    <TableCell>{row.visitors.toLocaleString()}</TableCell>
                    <TableCell>
                      {formatRate(row.conversionFromPrevious)}
                    </TableCell>
                    <TableCell>
                      {row.dropOffFromPrevious === null
                        ? "--"
                        : row.dropOffFromPrevious.toLocaleString()}
                    </TableCell>
                    <TableCell>{formatRate(row.dropOffRateFromPrevious)}</TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Observed Drop-off</CardTitle>
          <CardDescription>
            Last meaningful event per anonymous browser session.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Last step</TableHead>
                <TableHead>Path</TableHead>
                <TableHead>Sessions</TableHead>
                <TableHead>Share</TableHead>
                <TableHead>Suggested interpretation</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {dropOffReport.length === 0 ? (
                <EmptyRow colSpan={5} />
              ) : (
                dropOffReport.map((row) => (
                  <TableRow key={`${row.eventName}:${row.path}`}>
                    <TableCell className="font-medium">{row.eventName}</TableCell>
                    <TableCell>{row.path}</TableCell>
                    <TableCell>{row.sessions.toLocaleString()}</TableCell>
                    <TableCell>{formatRate(row.share)}</TableCell>
                    <TableCell className="text-muted-foreground">
                      Inspect the previous funnel step before this stop point.
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Recent Upload Failures</CardTitle>
          <CardDescription>
            Upload-related failure events grouped by event and path.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Event</TableHead>
                <TableHead>Count</TableHead>
                <TableHead>Last seen</TableHead>
                <TableHead>Primary affected path</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {recentFailureEvents.length === 0 ? (
                <EmptyRow colSpan={4} />
              ) : (
                recentFailureEvents.map((row) => (
                  <TableRow key={`${row.eventName}:${row.path}`}>
                    <TableCell className="font-medium">{row.eventName}</TableCell>
                    <TableCell>{row.count.toLocaleString()}</TableCell>
                    <TableCell>{row.lastSeenAt.toLocaleString()}</TableCell>
                    <TableCell>{row.path}</TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
