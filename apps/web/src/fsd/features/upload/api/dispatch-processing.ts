import "server-only";

import {
  claimPendingProcessingDispatch,
  findPendingProcessingDispatchById,
  markProcessingDispatchDeadLetter,
  markProcessingDispatchSent,
  type PendingProcessingDispatch,
} from "~/fsd/entities/processing-dispatch";
import { getSelectedRenderMomentsForAttempt } from "~/fsd/entities/clip-draft/server";
import {
  getAttemptOutputPrefix,
  getProcessingMatchKey,
  type ProcessingStatus,
} from "~/fsd/entities/uploaded-file";
import {
  ensureUploadedFileQueuedForDispatch,
  markUploadedFileAttemptFailed,
} from "~/fsd/entities/uploaded-file/server";
import { reportPipelineFailure } from "~/fsd/shared/observability";
import { inngest } from "~/inngest/client";
// 도메인 쿼리가 아니라 두 엔티티 쓰기를 한 트랜잭션으로 묶기 위한 오케스트레이션 용도다.
import { db } from "~/server/db";

/**
 * 처리 요청 dispatch: 행 claim → UploadedFile 상태 전이 → clip draft 조회 →
 * Inngest 이벤트 발신. 네 모듈에 걸친 오케스트레이션이라 엔티티가 아니라
 * 이 피처가 소유한다(`fsd-architecture-guidelines.md` §5.2 peer 격리,
 * §3 "상위 레이어의 api/는 오케스트레이션 전용").
 *
 * 이 모듈에는 `"use server"`를 **붙이지 않는다.** 아래 함수는 auth 검사 없이
 * dispatchId만 받으므로, 서버 액션이 되면 아무 브라우저나 임의의 dispatch를
 * 발사할 수 있게 된다. 액션 모듈은 이 디렉터리의 `index.ts` 하나뿐이다.
 */

export type DispatchProcessingResult =
  | { status: "sent" }
  | { status: "not_found" }
  // 다른 워커가 먼저 claim했다 — 행은 존재하므로 not_found와 구분한다.
  // 이 경로는 try 이전에 반환하므로 dead-letter되지 않는다.
  | { status: "claim_lost" }
  | { status: "stale_attempt" }
  | { status: "already_advanced"; currentStatus: ProcessingStatus }
  | { status: "failed"; failureCode: "dispatch_failed"; error: string };

function toErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "Unknown dispatch failure";
}

async function deadLetterClaimedNonSentDispatch(
  dispatch: NonNullable<PendingProcessingDispatch>,
  reason: string,
): Promise<void> {
  await markProcessingDispatchDeadLetter(dispatch.id, reason);
}

/**
 * `OrFail` 접미사를 뗐다 — 이 코드베이스에서 그 표식은 throw를 뜻하는데
 * (Prisma의 findFirstOrThrow) 이 함수는 실패를 `{ status: "failed" }`로 **반환**한다.
 * 계약은 반환 타입 `DispatchProcessingResult`가 이미 말한다.
 */
export async function dispatchProcessingRequestById(
  dispatchId: string,
): Promise<DispatchProcessingResult> {
  const now = new Date();
  const dispatch = await findPendingProcessingDispatchById(dispatchId);

  if (!dispatch) {
    return { status: "not_found" };
  }

  const claimed = await claimPendingProcessingDispatch(dispatch.id, now);

  if (!claimed) {
    return { status: "claim_lost" };
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
