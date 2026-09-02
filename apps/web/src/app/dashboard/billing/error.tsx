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
      retry={{ onRetry: reset }}
      back={{ href: "/dashboard", label: "Back to dashboard" }}
    />
  );
}
