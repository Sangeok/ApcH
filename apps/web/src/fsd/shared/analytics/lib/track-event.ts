"use client";

import type { AnalyticsEventName } from "../event-catalog";
import { sanitizeAnalyticsMetadata } from "./metadata";
import { normalizeAnalyticsPath } from "./normalize-path";
import { getOrCreateAnalyticsIds } from "./anonymous-id";

type TrackAnalyticsEventOptions = {
  path?: string;
  referrer?: string | null;
  dedupeKey?: string;
  useBeacon?: boolean;
};

// 페이지 세션(하드 내비게이션 사이) 동안만 산다. 클라이언트 라우팅으로
// 계속 도는 SPA에서는 무한히 자라므로 상한에서 통째로 비운다 — 최근 키를
// 골라 남기는 것보다 단순하고, 최악의 결과는 이벤트 한 건의 중복 전송이다.
const MAX_DEDUPE_KEYS = 500;
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

    if (sentDedupeKeys.size >= MAX_DEDUPE_KEYS) {
      sentDedupeKeys.clear();
    }

    sentDedupeKeys.add(options.dedupeKey);
  }

  const ids = getOrCreateAnalyticsIds();

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
