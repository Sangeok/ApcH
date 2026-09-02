import "server-only";

import { db } from "@repo/db";
import type { Prisma, RecordAnalyticsEventInput } from "@repo/db";

export async function recordAnalyticsEvent(input: RecordAnalyticsEventInput) {
  await db.analyticsEvent.create({
    data: {
      name: input.name,
      anonymousId: input.anonymousId,
      sessionId: input.sessionId,
      path: input.path,
      referrer: input.referrer ?? null,
      metadata: input.metadata as Prisma.InputJsonValue | undefined,
      userId: input.userId ?? null,
    },
  });
}

// 매일 도는 cron이 이 기준으로 행을 영구 삭제한다. 값을 바꾸면 되돌릴 수 없다.
const ANALYTICS_EVENT_RETENTION_DAYS = 90;
const ANALYTICS_EVENT_RETENTION_MS =
  ANALYTICS_EVENT_RETENTION_DAYS * 24 * 60 * 60 * 1000;

export async function cleanupExpiredAnalyticsEvents(now = new Date()) {
  const expiresBefore = new Date(now.getTime() - ANALYTICS_EVENT_RETENTION_MS);

  return db.analyticsEvent.deleteMany({
    where: {
      createdAt: {
        lt: expiresBefore,
      },
    },
  });
}
