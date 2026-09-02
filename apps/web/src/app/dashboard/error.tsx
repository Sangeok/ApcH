"use client";

import { useEffect } from "react";
import { ErrorDisplay } from "~/fsd/shared/ui/error-display";

export default function DashboardError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("Dashboard error boundary caught:", error);
  }, [error]);

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
