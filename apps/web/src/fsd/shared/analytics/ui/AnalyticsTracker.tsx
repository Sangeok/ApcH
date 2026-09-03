"use client";

import { usePathname } from "next/navigation";
import { useEffect } from "react";
import type { AnalyticsEventName } from "../event-catalog";
import { normalizeAnalyticsPath } from "../lib/normalize-path";
import { trackAnalyticsEvent } from "../lib/track-event";

function getRouteEventName(pathname: string): AnalyticsEventName | null {
  if (pathname === "/") {
    return "landing_view";
  }

  if (pathname === "/login") {
    return "login_view";
  }

  if (pathname === "/dashboard") {
    return "dashboard_viewed";
  }

  if (pathname === "/dashboard/billing") {
    return "billing_viewed";
  }

  if (pathname.startsWith("/dashboard")) {
    return null;
  }

  return "marketing_page_view";
}

export function AnalyticsTracker() {
  const pathname = usePathname();

  useEffect(() => {
    const normalizedPath = normalizeAnalyticsPath(pathname);
    const eventName = getRouteEventName(normalizedPath);

    if (!eventName) {
      return;
    }

    void trackAnalyticsEvent(eventName, undefined, {
      path: normalizedPath,
      dedupeKey: `route:${eventName}:${normalizedPath}`,
    });
  }, [pathname]);

  useEffect(() => {
    const normalizedPath = normalizeAnalyticsPath(pathname);
    const startedAt = Date.now();
    let hasSentExitEvent = false;

    const emitExit = () => {
      if (hasSentExitEvent) {
        return;
      }

      hasSentExitEvent = true;
      void trackAnalyticsEvent(
        "page_exited",
        {
          dwellTimeMs: Math.max(Date.now() - startedAt, 0),
        },
        {
          path: normalizedPath,
          // dedupeKey를 두지 않는다 — startedAt이 들어가 매 내비게이션마다
          // 다시는 매칭되지 않을 키가 쌓이기만 했다. 위의 `hasSentExitEvent` 플래그가
          // 이 effect당 1회를 이미 보장한다.
          useBeacon: true,
        },
      );
    };

    const handleVisibilityChange = () => {
      if (document.visibilityState === "hidden") {
        emitExit();
      }
    };

    document.addEventListener("visibilitychange", handleVisibilityChange);
    window.addEventListener("pagehide", emitExit);

    return () => {
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      window.removeEventListener("pagehide", emitExit);
    };
  }, [pathname]);

  return null;
}
