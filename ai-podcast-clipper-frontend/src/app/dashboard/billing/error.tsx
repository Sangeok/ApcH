"use client";

import { useEffect } from "react";
import { ErrorDisplay } from "~/fsd/shared/ui/error-display";

export default function BillingError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("Billing error boundary caught:", error);
  }, [error]);

  return (
    <ErrorDisplay
      title="Failed to load billing information"
      description="Something went wrong while loading the billing page. Please try again later."
      digest={error.digest}
      variant="section"
      showRetry
      onRetry={reset}
      showBack
      backHref="/dashboard"
      backLabel="Back to dashboard"
    />
  );
}
