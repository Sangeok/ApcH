"use client";

import type { AnalyticsEventName } from "../event-catalog";
import { sanitizeAnalyticsMetadata } from "./metadata";
import { normalizeAnalyticsPath } from "./normalize-path";
import { getAnalyticsIds } from "./anonymous-id";

type TrackAnalyticsEventOptions = {
  path?: string;
  referrer?: string | null;
  dedupeKey?: string;
  useBeacon?: boolean;
};

const sentDedupeKeys = new Set<string>();

function getCurrentPath() {
  if (typeof window === "undefined") {
    return "/";
  }

  return `${window.location.pathname}${window.location.search}${window.location.hash}`;
}

export async function trackAnalyticsEvent(
  name: AnalyticsEventName,
  metadata?: Record<string, unknown>,
  options: TrackAnalyticsEventOptions = {},
) {
  if (typeof window === "undefined") {
    return;
  }

  if (options.dedupeKey) {
    if (sentDedupeKeys.has(options.dedupeKey)) {
      return;
    }

    sentDedupeKeys.add(options.dedupeKey);
  }

  const ids = getAnalyticsIds();

  if (!ids) {
    return;
  }

  const path = normalizeAnalyticsPath(options.path ?? getCurrentPath());

  const payload = {
    name,
    anonymousId: ids.anonymousId,
    sessionId: ids.sessionId,
    path,
    referrer:
      options.referrer === undefined ? document.referrer : options.referrer,
    metadata: sanitizeAnalyticsMetadata(name, metadata),
  };
  const body = JSON.stringify(payload);

  if (options.useBeacon && navigator.sendBeacon) {
    navigator.sendBeacon(
      "/api/analytics/events",
      new Blob([body], { type: "application/json" }),
    );
    return;
  }

  await fetch("/api/analytics/events", {
    method: "POST",
    body,
    headers: {
      "Content-Type": "application/json",
    },
    keepalive: options.useBeacon,
  }).catch(() => undefined);
}
