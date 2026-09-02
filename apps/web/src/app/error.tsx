"use client";

import { useEffect } from "react";
import { ErrorDisplay } from "~/fsd/shared/ui/error-display";

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("Root error boundary caught:", error);
  }, [error]);

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
