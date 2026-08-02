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

export async function cleanupExpiredAnalyticsEvents(now = new Date()) {
  const expiresBefore = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000);

  return db.analyticsEvent.deleteMany({
    where: {
      createdAt: {
        lt: expiresBefore,
      },
    },
  });
}
