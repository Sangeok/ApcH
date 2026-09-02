"use client";

import { useReportBoundaryError } from "~/fsd/shared/observability/use-report-boundary-error";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useReportBoundaryError(error, "Global");

  return (
    <html>
      <body>
        <div
          style={{
            display: "flex",
            minHeight: "100vh",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            fontFamily: "system-ui, -apple-system, sans-serif",
            padding: "2rem",
            backgroundColor: "#fafafa",
          }}
        >
          <div
            style={{
              maxWidth: "28rem",
              textAlign: "center",
              padding: "2rem",
              borderRadius: "0.75rem",
              border: "1px solid #e5e5e5",
              backgroundColor: "#ffffff",
              boxShadow: "0 1px 3px rgba(0,0,0,0.1)",
            }}
          >
            <div
              style={{
                width: "3rem",
                height: "3rem",
                borderRadius: "50%",
                backgroundColor: "#fef2f2",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                margin: "0 auto 1rem",
                fontSize: "1.5rem",
              }}
            >
              ⚠
            </div>
            <h1 style={{ fontSize: "1.25rem", fontWeight: 700, margin: "0 0 0.5rem" }}>
              A critical error occurred
            </h1>
            <p style={{ color: "#737373", fontSize: "0.875rem", margin: "0 0 1.5rem" }}>
              Unable to display the page. Please try again later.
            </p>
            <button
              onClick={reset}
              style={{
                padding: "0.5rem 1rem",
                borderRadius: "0.375rem",
                border: "none",
                backgroundColor: "#171717",
                color: "#ffffff",
                fontSize: "0.875rem",
                fontWeight: 500,
                cursor: "pointer",
              }}
            >
              Try again
            </button>
            {error.digest && (
              <p style={{ color: "#a3a3a3", fontSize: "0.75rem", marginTop: "1rem" }}>
                Error code:{" "}
                <code style={{ fontFamily: "monospace" }}>{error.digest}</code>
              </p>
            )}
          </div>
        </div>
      </body>
    </html>
  );
}
