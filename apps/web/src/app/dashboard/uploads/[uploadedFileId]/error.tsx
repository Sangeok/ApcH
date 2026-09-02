"use client";

import { useEffect } from "react";
import { ErrorDisplay } from "~/fsd/shared/ui/error-display";

export default function UploadDetailError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("Upload detail error boundary caught:", error);
  }, [error]);

  return (
    <ErrorDisplay
      title="Failed to load upload details"
      description="Something went wrong while loading the file details. The file may have been deleted or you may not have access."
      digest={error.digest}
      variant="section"
      retry={{ onRetry: reset }}
      back={{ href: "/dashboard", label: "Back to dashboard" }}
    />
  );
}
