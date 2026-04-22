import "server-only";

import type { Prisma } from "generated/prisma";
import { inngest } from "~/inngest/client";
import { db } from "~/server/db";
import {
  getAttemptOutputPrefix,
  getProcessingMatchKey,
} from "~/fsd/entities/uploaded-file/model/attempt-prefix";
import {
  markUploadedFileAttemptFailed,
  markUploadedFileQueuedFromDispatch,
} from "~/fsd/entities/uploaded-file";

type DbClient = Prisma.TransactionClient | typeof db;

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

export async function createProcessingDispatch(
  data: {
    uploadedFileId: string;
    attempt: number;
  },
  options?: { tx?: Prisma.TransactionClient; now?: Date },
) {
  const now = options?.now ?? new Date();

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

      await db.$transaction(async (tx) => {
        await markProcessingDispatchSent(dispatch.id, { tx, now });
        await markUploadedFileQueuedFromDispatch(dispatch.uploadedFile.id, dispatch.attempt, {
          tx,
          now,
        });
      });

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
              statuses: ["pending_enqueue"],
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
