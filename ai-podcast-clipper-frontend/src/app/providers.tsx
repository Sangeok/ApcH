"use client";

import {
  focusManager,
  isServer,
  QueryClient,
  QueryClientProvider,
} from "@tanstack/react-query";
import type { ReactNode } from "react";
import { AnalyticsTracker } from "~/fsd/shared/analytics";

focusManager.setEventListener((handleFocus) => {
  if (typeof window === "undefined" || typeof document === "undefined") {
    return;
  }

  const listener = () => handleFocus();

  document.addEventListener("visibilitychange", listener, false);
  window.addEventListener("focus", listener, false);

  return () => {
    document.removeEventListener("visibilitychange", listener);
    window.removeEventListener("focus", listener);
  };
});

function makeQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 60_000,
      },
    },
  });
}

let browserQueryClient: QueryClient | undefined;

function getQueryClient() {
  if (isServer) {
    return makeQueryClient();
  }

  browserQueryClient ??= makeQueryClient();
  return browserQueryClient;
}

export default function Providers({ children }: { children: ReactNode }) {
  return (
    <QueryClientProvider client={getQueryClient()}>
      <AnalyticsTracker />
      {children}
    </QueryClientProvider>
  );
}
