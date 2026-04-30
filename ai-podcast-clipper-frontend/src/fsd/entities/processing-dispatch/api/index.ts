import "server-only";

import type { Prisma } from "generated/prisma";
import { inngest } from "~/inngest/client";
import { db } from "~/server/db";
import {
  getAttemptOutputPrefix,
  getProcessingMatchKey,
} from "~/fsd/entities/uploaded-file/model/attempt-prefix";
import {
  ensureUploadedFileQueuedForDispatch,
  markUploadedFileAttemptFailed,
} from "~/fsd/entities/uploaded-file";

type DbClient = Prisma.TransactionClient | typeof db;
export type StaleQueuedSentProcessingDispatch = {
  id: string;
  attempt: number;
  dispatchCount: number;
  createdAt: Date;
  uploadedFile: {
    id: string;
    userId: string;
    currentAttempt: number;
  };
};
type StaleQueuedSentProcessingDispatchRow = {
  id: string;
  attempt: number;
  dispatchCount: number;
  createdAt: Date;
  uploadedFileId: string;
  userId: string;
  currentAttempt: number;
};

const DISPATCH_BACKOFF_MS = [30_000, 60_000, 120_000, 300_000, 600_000] as const;
const DISPATCH_STALE_LOCK_MS = 60_000;
const DISPATCH_DEAD_LETTER_AGE_MS = 15 * 60_000;
const MAX_DISPATCH_ATTEMPTS = 10;

function getClient(tx?: Prisma.TransactionClient): DbClient {
  return tx ?? db;
}

function toErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "Unknown dispatch failure";
}

function getRetryBackoffMs(dispatchAttempt: number): number {
  const index = Math.min(dispatchAttempt - 1, DISPATCH_BACKOFF_MS.length - 1);
  return (
    DISPATCH_BACKOFF_MS[index] ??
    DISPATCH_BACKOFF_MS[DISPATCH_BACKOFF_MS.length - 1]!
  );
}

// Records a durable dispatch request for this processing attempt.                          
// The dispatcher later sends pending rows to Inngest and can retry failures.  
export async function createProcessingDispatch(
  data: {
    uploadedFileId: string;
    attempt: number;
  },
  options?: { tx?: Prisma.TransactionClient; now?: Date },
) {
  const now = options?.now ?? new Date();

  // Creates a new processingDispatch row in the DB.
  // This is the first “record of truth” that a processing request exists and is pending.
  // "pending" means the dispatch has not been sent to Inngest yet. 
  return getClient(options?.tx).processingDispatch.create({
    data: {
      ...data,
      status: "pending",
      nextRetryAt: now,
    },
  });
}

async function listEligibleProcessingDispatches(limit: number, now: Date) {
  const staleBefore = new Date(now.getTime() - DISPATCH_STALE_LOCK_MS);

  return db.processingDispatch.findMany({
    where: {
      OR: [
        {
          status: "pending",
        },
        {
          status: "retryable_failed",
          OR: [
            { nextRetryAt: null },
            { nextRetryAt: { lte: now } },
          ],
        },
        {
          status: "sending",
          lockedAt: { lt: staleBefore },
        },
      ],
    },
    orderBy: {
      createdAt: "asc",
    },
    take: limit,
    select: {
      id: true,
      attempt: true,
      dispatchCount: true,
      createdAt: true,
      uploadedFile: {
        select: {
          id: true,
          userId: true,
          language: true,
          targetClipCount: true,
          s3Key: true,
          currentAttempt: true,
          uploaded: true,
        },
      },
    },
  });
}

async function claimProcessingDispatchForSend(dispatchId: string, now: Date) {
  const staleBefore = new Date(now.getTime() - DISPATCH_STALE_LOCK_MS);

  const result = await db.processingDispatch.updateMany({
    where: {
      id: dispatchId,
      OR: [
        { status: "pending" },
        {
          status: "retryable_failed",
          OR: [
            { nextRetryAt: null },
            { nextRetryAt: { lte: now } },
          ],
        },
        {
          status: "sending",
          lockedAt: { lt: staleBefore },
        },
      ],
    },
    data: {
      status: "sending",
      lockedAt: now,
      dispatchCount: {
        increment: 1,
      },
    },
  });

  return result.count === 1;
}

async function markProcessingDispatchSent(
  dispatchId: string,
  options?: { tx?: Prisma.TransactionClient; now?: Date },
) {
  const now = options?.now ?? new Date();

  return getClient(options?.tx).processingDispatch.update({
    where: { id: dispatchId },
    data: {
      status: "sent",
      dispatchedAt: now,
      nextRetryAt: null,
      lockedAt: null,
      lastError: null,
    },
  });
}

async function markProcessingDispatchRetry(
  dispatchId: string,
  errorMessage: string,
  dispatchAttempt: number,
  options?: { tx?: Prisma.TransactionClient; now?: Date },
) {
  const now = options?.now ?? new Date();

  return getClient(options?.tx).processingDispatch.update({
    where: { id: dispatchId },
    data: {
      status: "retryable_failed",
      lastError: errorMessage,
      nextRetryAt: new Date(now.getTime() + getRetryBackoffMs(dispatchAttempt)),
      lockedAt: null,
    },
  });
}

async function markProcessingDispatchDeadLetter(
  dispatchId: string,
  errorMessage: string,
  options?: { tx?: Prisma.TransactionClient; now?: Date },
) {
  const now = options?.now ?? new Date();

  return getClient(options?.tx).processingDispatch.update({
    where: { id: dispatchId },
    data: {
      status: "dead_letter",
      lastError: errorMessage,
      nextRetryAt: null,
      lockedAt: null,
      dispatchedAt: now,
    },
  });
}

export async function findStaleQueuedSentProcessingDispatches(
  staleBefore: Date,
  limit = 25,
): Promise<StaleQueuedSentProcessingDispatch[]> {
  const rows = await db.$queryRaw<StaleQueuedSentProcessingDispatchRow[]>`
    SELECT
      pd.id,
      pd.attempt,
      pd."dispatchCount",
      pd."createdAt",
      uf.id AS "uploadedFileId",
      uf."userId",
      uf."currentAttempt"
    FROM "UploadedFile" uf
    JOIN "ProcessingDispatch" pd
      ON pd."uploadedFileId" = uf.id
     AND pd.attempt = uf."currentAttempt"
    WHERE uf.status = 'queued'
      AND uf.uploaded = true
      AND uf."processingStartedAt" IS NULL
      AND uf."queuedAt" < ${staleBefore}
      AND pd.status = 'sent'
      AND NOT EXISTS (
        SELECT 1
        FROM "UploadedFile" active
        WHERE active."userId" = uf."userId"
          AND active.status = 'processing'
      )
    ORDER BY uf."queuedAt" ASC
    LIMIT ${limit}
  `;

  return rows.map((row) => ({
    id: row.id,
    attempt: row.attempt,
    dispatchCount: row.dispatchCount,
    createdAt: row.createdAt,
    uploadedFile: {
      id: row.uploadedFileId,
      userId: row.userId,
      currentAttempt: row.currentAttempt,
    },
  }));
}

export async function markProcessingDispatchRetryableNow(args: {
  dispatchId: string;
  uploadedFileId: string;
  attempt: number;
  errorMessage: string;
  now?: Date;
}) {
  const now = args.now ?? new Date();

  return db.processingDispatch.updateMany({
    where: {
      id: args.dispatchId,
      uploadedFileId: args.uploadedFileId,
      attempt: args.attempt,
      status: "sent",
      uploadedFile: {
        is: {
          currentAttempt: args.attempt,
          status: "queued",
          processingStartedAt: null,
        },
      },
    },
    data: {
      status: "retryable_failed",
      lastError: args.errorMessage,
      nextRetryAt: now,
      lockedAt: null,
      dispatchedAt: null,
    },
  });
}

export async function markStaleQueuedDispatchDeadLetter(args: {
  dispatchId: string;
  uploadedFileId: string;
  attempt: number;
  errorMessage: string;
  now?: Date;
}) {
  const now = args.now ?? new Date();

  return db.$transaction(async (tx) => {
    const deadLetteredDispatch = await tx.processingDispatch.updateMany({
      where: {
        id: args.dispatchId,
        uploadedFileId: args.uploadedFileId,
        attempt: args.attempt,
        status: "sent",
        uploadedFile: {
          is: {
            id: args.uploadedFileId,
            currentAttempt: args.attempt,
            status: "queued",
            processingStartedAt: null,
          },
        },
      },
      data: {
        status: "dead_letter",
        lastError: args.errorMessage,
        nextRetryAt: null,
        lockedAt: null,
        dispatchedAt: now,
      },
    });

    if (deadLetteredDispatch.count !== 1) {
      return { count: 0 };
    }

    const failedFile = await tx.uploadedFile.updateMany({
      where: {
        id: args.uploadedFileId,
        currentAttempt: args.attempt,
        status: "queued",
        processingStartedAt: null,
        dispatches: {
          some: {
            id: args.dispatchId,
            attempt: args.attempt,
            status: "dead_letter",
          },
        },
      },
      data: {
        status: "failed",
        terminalStatusAt: now,
        failureCode: "queued_worker_not_started",
      },
    });

    if (failedFile.count !== 1) {
      throw new Error(
        `Failed to mark queued upload as failed after dead-lettering dispatch ${args.dispatchId}`,
      );
    }

    return { count: 1 };
  });
}

export async function dispatchPendingProcessingRequests(limit = 25): Promise<number> {
  const now = new Date();
  const dispatches = await listEligibleProcessingDispatches(limit, now);
  let dispatchedCount = 0;

  for (const dispatch of dispatches) {
    const claimed = await claimProcessingDispatchForSend(dispatch.id, now);

    if (!claimed) {
      continue;
    }

    const dispatchAttempt = dispatch.dispatchCount + 1;

    try {
      if (dispatch.uploadedFile.currentAttempt !== dispatch.attempt) {
        await markProcessingDispatchDeadLetter(dispatch.id, "stale_attempt");
        continue;
      }

      if (!dispatch.uploadedFile.uploaded) {
        throw new Error("Source upload has not been confirmed");
      }

      const queueResult = await ensureUploadedFileQueuedForDispatch(
        dispatch.uploadedFile.id,
        dispatch.attempt,
        { now },
      );

      if (queueResult.status === "already_advanced") {
        await markProcessingDispatchSent(dispatch.id, { now });
        continue;
      }

      if (queueResult.status !== "queued") {
        throw new Error(
          `Upload is not queueable for dispatch: ${queueResult.status}`,
        );
      }

      await inngest.send({
        name: "process-video-events",
        data: {
          uploadedFileId: dispatch.uploadedFile.id,
          userId: dispatch.uploadedFile.userId,
          language: dispatch.uploadedFile.language,
          clipCount: dispatch.uploadedFile.targetClipCount,
          attempt: dispatch.attempt,
          outputPrefix: getAttemptOutputPrefix(
            dispatch.uploadedFile.s3Key,
            dispatch.attempt,
          ),
          matchKey: getProcessingMatchKey(
            dispatch.uploadedFile.id,
            dispatch.attempt,
          ),
        },
      });

      await markProcessingDispatchSent(dispatch.id, { now });

      dispatchedCount += 1;
    } catch (error) {
      const errorMessage = toErrorMessage(error);
      const isDeadLetter =
        dispatchAttempt >= MAX_DISPATCH_ATTEMPTS ||
        now.getTime() - dispatch.createdAt.getTime() >= DISPATCH_DEAD_LETTER_AGE_MS;

      if (isDeadLetter) {
        await db.$transaction(async (tx) => {
          await markProcessingDispatchDeadLetter(dispatch.id, errorMessage, { tx, now });
          await markUploadedFileAttemptFailed(
            dispatch.uploadedFile.id,
            dispatch.attempt,
            "dispatch_dead_letter",
            {
              tx,
              now,
              statuses: ["pending_enqueue", "queued"],
            },
          );
        });
      } else {
        await markProcessingDispatchRetry(dispatch.id, errorMessage, dispatchAttempt, {
          now,
        });
      }
    }
  }

  return dispatchedCount;
}
