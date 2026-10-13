import "server-only";

import { createHash } from "node:crypto";
import type { AnalyticsEventName } from "@repo/db";
import { recordAnalyticsEvent } from "~/fsd/entities/analytics-event/server";
import { sanitizeAnalyticsMetadata } from "~/fsd/shared/analytics/lib/metadata";
import {
  findCardNewsJob,
  updateCardNewsJob,
} from "~/fsd/entities/card-news/server";
import {
  cardNewsTransaction,
  jsonValue,
  lockedCardNewsJob,
} from "./reservation-tx";

type Metadata = Record<string, string | number | boolean>;
type PendingEvent = { name: AnalyticsEventName; metadata: Metadata };

export function queueAnalytics(
  name: AnalyticsEventName,
  metadata: Metadata,
): PendingEvent {
  if (typeof metadata.failureCode === "string") {
    if (
      /^text_overflow_cards_[0-6]_(title|body|highlight)$/.test(
        metadata.failureCode,
      )
    )
      metadata = { ...metadata, failureCode: "text_overflow" };
    else if (
      /^unsupported_glyph_cards_[0-6]_(title|body|highlight)$/.test(
        metadata.failureCode,
      )
    )
      metadata = { ...metadata, failureCode: "unsupported_glyph" };
    else if (
      /^highlight_not_in_body_cards_[0-6]_highlight$/.test(metadata.failureCode)
    )
      metadata = { ...metadata, failureCode: "render_failed" };
  }
  return { name, metadata: sanitizeAnalyticsMetadata(name, metadata) ?? {} };
}

export async function flushCardNewsAnalytics(jobId: string): Promise<void> {
  const hint = await findCardNewsJob(jobId);
  if (
    !hint ||
    !Array.isArray(hint.pendingAnalytics) ||
    hint.pendingAnalytics.length === 0
  )
    return;
  try {
    await cardNewsTransaction(async (tx) => {
      const job = await lockedCardNewsJob(jobId, tx);
      const pending = Array.isArray(job.pendingAnalytics)
        ? job.pendingAnalytics
        : [];
      for (const entry of pending) {
        if (
          !entry ||
          typeof entry !== "object" ||
          Array.isArray(entry) ||
          !("name" in entry) ||
          typeof entry.name !== "string" ||
          !("metadata" in entry) ||
          !entry.metadata ||
          typeof entry.metadata !== "object" ||
          Array.isArray(entry.metadata)
        )
          continue;
        const anonymousId = createHash("sha256")
          .update(`card-news:${job.userId}`)
          .digest("hex");
        const metadata =
          sanitizeAnalyticsMetadata(
            entry.name as AnalyticsEventName,
            entry.metadata,
          ) ?? {};
        await recordAnalyticsEvent(
          {
            name: entry.name as AnalyticsEventName,
            anonymousId,
            sessionId: `server:${anonymousId.slice(0, 48)}`,
            userId: job.userId,
            path: "/dashboard/card-news/[cardNewsId]",
            metadata,
          },
          {
            tx,
            id: `card-news:${job.id}:${entry.name}:${String(metadata.revision ?? 0)}`,
          },
        );
      }
      await updateCardNewsJob(jobId, { pendingAnalytics: jsonValue([]) }, tx);
    });
  } catch (error) {
    console.warn("Card news analytics deferred", {
      jobId,
      reason: error instanceof Error ? error.name : "unknown",
    });
  }
}

export async function recordCardNewsDownload(
  userId: string,
  setId: string,
  jobId: string,
  revision: number,
  cardCount: number,
): Promise<void> {
  const anonymousId = createHash("sha256")
    .update(`card-news:${userId}`)
    .digest("hex");
  try {
    await recordAnalyticsEvent({
      name: "card_news_downloaded",
      anonymousId,
      sessionId: `server:${anonymousId.slice(0, 48)}`,
      userId,
      path: "/dashboard/card-news/[cardNewsId]",
      metadata: sanitizeAnalyticsMetadata("card_news_downloaded", {
        setId,
        jobId,
        revision,
        cardCount,
        billingStatus: "free",
      }),
    });
  } catch (error) {
    console.warn("Card news download analytics unavailable", {
      jobId,
      reason: error instanceof Error ? error.name : "unknown",
    });
  }
}
