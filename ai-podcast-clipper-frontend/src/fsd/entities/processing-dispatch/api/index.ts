import "server-only";

import type { Prisma } from "generated/prisma";
import { inngest } from "~/inngest/client";
import { db } from "~/server/db";
import {
  ensureUploadedFileQueuedForDispatch,
  markUploadedFileAttemptFailed,
  type ProcessingStatus,
} from "~/fsd/entities/uploaded-file";
import {
  getAttemptOutputPrefix,
  getProcessingMatchKey,
} from "~/fsd/entities/uploaded-file/model/attempt-prefix";
import { getSelectedRenderMomentsForAttempt } from "~/fsd/entities/clip-draft";

type DbClient = Prisma.TransactionClient | typeof db;
type PendingProcessingDispatch = Awaited<
  ReturnType<typeof findPendingProcessingDispatchById>
>;

export type DispatchProcessingResult =
  | { status: "sent" }
  | { status: "not_found" }
  | { status: "stale_attempt" }
  | { status: "already_advanced"; currentStatus: ProcessingStatus }
  | { status: "failed"; failureCode: "dispatch_failed"; error: string };

function getClient(tx?: Prisma.TransactionClient): DbClient {
  return tx ?? db;
}

function toErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "Unknown dispatch failure";
}

export async function createProcessingDispatch(
  data: {
    uploadedFileId: string;
    attempt: number;
    kind: "auto" | "analyze" | "render";
  },
  options?: { tx?: Prisma.TransactionClient },
) {
  return getClient(options?.tx).processingDispatch.create({
    data: {
      ...data,
      status: "pending",
    },
  });
}

async function findPendingProcessingDispatchById(dispatchId: string) {
  return db.processingDispatch.findFirst({
    where: {
      id: dispatchId,
      status: "pending",
    },
    select: {
      id: true,
      attempt: true,
      kind: true,
      uploadedFile: {
        select: {
          id: true,
          userId: true,
          language: true,
          targetClipCount: true,
          s3Key: true,
          currentAttempt: true,
          uploaded: true,
          reviewAttempt: true,
          transcriptS3Key: true,
        },
      },
    },
  });
}

async function claimPendingProcessingDispatch(
  dispatchId: string,
  now: Date,
): Promise<boolean> {
  const claimed = await db.processingDispatch.updateMany({
    where: {
      id: dispatchId,
      status: "pending",
    },
    data: {
      status: "sending",
      lockedAt: now,
      dispatchCount: {
        increment: 1,
      },
    },
  });

  return claimed.count === 1;
}

export async function markProcessingDispatchSent(
  dispatchId: string,
  options?: { tx?: Prisma.TransactionClient; now?: Date },
) {
  const now = options?.now ?? new Date();

  return getClient(options?.tx).processingDispatch.update({
    where: { id: dispatchId },
    data: {
      status: "sent",
      dispatchedAt: now,
      lockedAt: null,
      lastError: null,
    },
  });
}

export async function markProcessingDispatchDeadLetter(
  dispatchId: string,
  errorMessage: string,
  options?: { tx?: Prisma.TransactionClient },
) {
  return getClient(options?.tx).processingDispatch.update({
    where: { id: dispatchId },
    data: {
      status: "dead_letter",
      lastError: errorMessage,
      lockedAt: null,
      dispatchedAt: null,
    },
  });
}

async function deadLetterClaimedNonSentDispatch(
  dispatch: NonNullable<PendingProcessingDispatch>,
  reason: string,
): Promise<void> {
  await markProcessingDispatchDeadLetter(dispatch.id, reason);
}

export async function dispatchProcessingRequestByIdOrFail(
  dispatchId: string,
): Promise<DispatchProcessingResult> {
  const now = new Date();
  const dispatch = await findPendingProcessingDispatchById(dispatchId);

  if (!dispatch) {
    return { status: "not_found" };
  }

  const claimed = await claimPendingProcessingDispatch(dispatch.id, now);

  if (!claimed) {
    return { status: "not_found" };
  }

  try {
    if (dispatch.uploadedFile.currentAttempt !== dispatch.attempt) {
      await deadLetterClaimedNonSentDispatch(dispatch, "stale_attempt");
      return { status: "stale_attempt" };
    }

    if (!dispatch.uploadedFile.uploaded) {
      throw new Error("Source upload has not been confirmed");
    }

    const queueResult = await ensureUploadedFileQueuedForDispatch(
      dispatch.uploadedFile.id,
      dispatch.attempt,
      { now },
    );

    if (queueResult.status === "not_found") {
      await deadLetterClaimedNonSentDispatch(dispatch, "not_found");
      return { status: "not_found" };
    }

    if (queueResult.status === "already_advanced") {
      await deadLetterClaimedNonSentDispatch(
        dispatch,
        `already_advanced:${queueResult.currentStatus}`,
      );
      return {
        status: "already_advanced",
        currentStatus: queueResult.currentStatus,
      };
    }

    if (queueResult.status !== "queued") {
      throw new Error(
        `Upload is not queueable for dispatch: ${queueResult.status}`,
      );
    }

    const baseEventData = {
      uploadedFileId: dispatch.uploadedFile.id,
      userId: dispatch.uploadedFile.userId,
      language: dispatch.uploadedFile.language,
      attempt: dispatch.attempt,
      outputPrefix: getAttemptOutputPrefix(
        dispatch.uploadedFile.s3Key,
        dispatch.attempt,
      ),
      matchKey: getProcessingMatchKey(
        dispatch.uploadedFile.id,
        dispatch.attempt,
      ),
    };

    if (dispatch.kind === "analyze") {
      await inngest.send({
        name: "analyze-video-events",
        data: {
          ...baseEventData,
          clipCount: dispatch.uploadedFile.targetClipCount,
        },
      });
    } else if (dispatch.kind === "render") {
      if (dispatch.uploadedFile.reviewAttempt === null) {
        throw new Error("Render dispatch requires a completed analysis attempt");
      }

      // 선택 draft → RenderMoment 매핑은 clip-draft 엔티티가 소유한다(4.5(a)).
      // 빈 선택은 confirm 액션이 사용자 경로에서 이미 막으므로, 아래 가드는
      // 사용자 메시지가 아니라 방어선(dead_letter 경로)이다.
      const renderMoments = await getSelectedRenderMomentsForAttempt(
        dispatch.uploadedFile.id,
        dispatch.uploadedFile.reviewAttempt,
      );

      if (renderMoments.length === 0) {
        throw new Error("Render dispatch requires at least one selected clip draft");
      }

      await inngest.send({
        name: "process-video-events",
        data: {
          ...baseEventData,
          clipCount: renderMoments.length,
          transcriptS3Key: dispatch.uploadedFile.transcriptS3Key,
          moments: renderMoments,
        },
      });
    } else {
      await inngest.send({
        name: "process-video-events",
        data: {
          ...baseEventData,
          clipCount: dispatch.uploadedFile.targetClipCount,
        },
      });
    }

    await markProcessingDispatchSent(dispatch.id, { now });
    return { status: "sent" };
  } catch (error) {
    const errorMessage = toErrorMessage(error);

    await db.$transaction(async (tx) => {
      await markProcessingDispatchDeadLetter(dispatch.id, errorMessage, { tx });
      await markUploadedFileAttemptFailed(
        dispatch.uploadedFile.id,
        dispatch.attempt,
        "dispatch_failed",
        {
          tx,
          now,
          statuses: ["pending_enqueue", "queued"],
        },
      );
    });

    return {
      status: "failed",
      failureCode: "dispatch_failed",
      error: errorMessage,
    };
  }
}
