"use client";

import { useReportBoundaryError } from "~/fsd/shared/observability/use-report-boundary-error";
import { ErrorDisplay } from "~/fsd/shared/ui/error-display";

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useReportBoundaryError(error, "Root");

  return (
    <ErrorDisplay
      title="An unexpected error occurred"
      description="Something went wrong while loading the page. Please try again later."
      digest={error.digest}
      variant="full-page"
      retry={{ onRetry: reset }}
      home
    />
  );
}
