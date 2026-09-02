"use client";

import { useReportBoundaryError } from "~/fsd/shared/observability/use-report-boundary-error";
import { ErrorDisplay } from "~/fsd/shared/ui/error-display";

export default function DashboardError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useReportBoundaryError(error, "Dashboard");

  return (
    <ErrorDisplay
      title="Failed to load dashboard"
      description="Something went wrong while loading the dashboard. Please try again later."
      digest={error.digest}
      variant="section"
      retry={{ onRetry: reset }}
      home
    />
  );
}
