import "server-only";

import type { Prisma } from "@repo/db";
import { inngest } from "~/inngest/client";
import { db } from "~/server/db";
import {
  getAttemptOutputPrefix,
  getProcessingMatchKey,
  type ProcessingStatus,
} from "~/fsd/entities/uploaded-file";
import {
  ensureUploadedFileQueuedForDispatch,
  markUploadedFileAttemptFailed,
} from "~/fsd/entities/uploaded-file/server";
import { getSelectedRenderMomentsForAttempt } from "~/fsd/entities/clip-draft/server";
import { reportPipelineFailure } from "~/fsd/shared/observability";
import type { ProcessingDispatchStatus } from "../model/types";

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

// DB status 리터럴을 union에 묶는다. 이 상수를 거치지 않으면 `"dead-letter"` 같은
// 오타가 컴파일을 통과하고, findPendingProcessingDispatchById가 회수할 수 없는 행이 남는다.
const DISPATCH_STATUS = {
  pending: "pending",
  sending: "sending",
  sent: "sent",
  deadLetter: "dead_letter",
} as const satisfies Record<string, ProcessingDispatchStatus>;

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
      status: DISPATCH_STATUS.pending,
    },
  });
}

async function findPendingProcessingDispatchById(dispatchId: string) {
  return db.processingDispatch.findFirst({
    where: {
      id: dispatchId,
      status: DISPATCH_STATUS.pending,
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
      status: DISPATCH_STATUS.pending,
    },
    data: {
      status: DISPATCH_STATUS.sending,
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
      status: DISPATCH_STATUS.sent,
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
      status: DISPATCH_STATUS.deadLetter,
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

    // 트랜잭션 커밋 후에 보고한다. 트랜잭션 안에서 보내면
    // (a) 롤백 시 DB는 되돌아갔는데 이벤트는 이미 나간 유령 알림이 되고
    // (b) 열린 Prisma 커넥션을 붙잡은 채 네트워크 I/O를 하게 된다.
    //
    // 이 catch는 dead-letter 마킹과 uploadedFile 실패 마킹을 모두 포함하는
    // "한 사건"이므로 여기서 정확히 한 번만 보고한다.
    reportPipelineFailure({
      kind: "dispatch-failure",
      failureCode: "dispatch_failed",
      uploadedFileId: dispatch.uploadedFile.id,
      attempt: dispatch.attempt,
    });

    return {
      status: "failed",
      failureCode: "dispatch_failed",
      error: errorMessage,
    };
  }
}
