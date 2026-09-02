"use client";

import {
  focusManager,
  isServer,
  QueryClient,
  QueryClientProvider,
} from "@tanstack/react-query";
import type { ReactNode } from "react";
import { AnalyticsTracker } from "~/fsd/shared/analytics";

/**
 * 앱 전체 쿼리의 focus-refetch 동작을 바꾼다 — `refetchOnWindowFocus: "always"`를
 * 쓰는 곳(업로드 상세 폴링)이 이 리스너에 의존한다. 이름 없는 모듈 최상위
 * 표현식이면 import 부수효과로만 보여 지울 수 있는 코드처럼 읽힌다.
 */
function installVisibilityFocusListener() {
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
}

installVisibilityFocusListener();

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
