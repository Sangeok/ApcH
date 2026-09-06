import "server-only";

import { getProcessingMatchKey } from "~/fsd/entities/uploaded-file";
import {
  isActiveProcessingStatus,
  PROCESSING_STALE_POLICY,
  toProcessingStatus,
  type ProcessingStatus,
  type UploadedFileFailureCode,
} from "~/fsd/entities/uploaded-file";
import {
  findStaleProcessingCandidate,
  findUploadedFileFailureState,
  hasProcessingUploadForUser,
  listActiveProcessingCandidatesByUserId,
  markUploadedFileAttemptFailed,
  type StaleProcessingCandidate,
} from "~/fsd/entities/uploaded-file/server";
import { inngest } from "~/inngest/client";

/**
 * 시간 기반 stale 판정 + 실패 마킹 + 워커 취소 이벤트 발신.
 *
 * 엔티티 쿼리가 아니라 정책이라 features/upload가 소유한다. 엔티티에 있는 동안에는
 * 최하위 도메인 레이어가 `~/inngest/client`의 이벤트 union에 컴파일 의존했고,
 * `inngest/functions.ts`가 다시 그 레이어를 임포트해 양방향 그래프가 됐다.
 *
 * `"use server"`를 붙이지 않는다(이 디렉터리의 index.ts만 액션 모듈).
 *
 * ⚠️ 취소 이벤트 발신은 **무조건**이다. 이걸 호출부가 넘기는 옵션으로 바꾸면
 * 빠뜨린 호출처가 폭주하는 Inngest 함수를 stuckAlertMs(90분)까지 방치하게 된다.
 */
async function sendProcessingCancelEventBestEffort(args: {
  uploadedFileId: string;
  attempt: number;
}) {
  try {
    await inngest.send({
      name: "process-video-events/cancel",
      data: {
        uploadedFileId: args.uploadedFileId,
        attempt: args.attempt,
        matchKey: getProcessingMatchKey(args.uploadedFileId, args.attempt),
      },
    });
  } catch (error) {
    console.error("Failed to send processing cancel event", {
      uploadedFileId: args.uploadedFileId,
      attempt: args.attempt,
      error,
    });
  }
}

function isOlderThan(date: Date | null, threshold: Date): boolean {
  return date !== null && date < threshold;
}

function getStaleFailureCode(
  file: StaleProcessingCandidate,
  now: Date,
  hasProcessingUploadForQueuedState: boolean,
): UploadedFileFailureCode | null {
  switch (file.status) {
    case "pending_enqueue": {
      const staleBefore = new Date(
        now.getTime() - PROCESSING_STALE_POLICY.pendingEnqueueTimeoutMs,
      );

      return isOlderThan(file.enqueueRequestedAt, staleBefore)
        ? "dispatch_timeout"
        : null;
    }
    case "queued": {
      if (hasProcessingUploadForQueuedState) {
        return null;
      }

      const staleBefore = new Date(
        now.getTime() - PROCESSING_STALE_POLICY.queuedWorkerStartTimeoutMs,
      );

      return isOlderThan(file.queuedAt, staleBefore)
        ? "queued_worker_not_started"
        : null;
    }
    case "processing": {
      const staleBefore = new Date(
        now.getTime() - PROCESSING_STALE_POLICY.processingTimeoutMs,
      );

      return isOlderThan(file.processingStartedAt, staleBefore)
        ? "worker_timeout"
        : null;
    }
    default:
      return null;
  }
}

export async function reconcileStaleUploadedFileForUser(
  uploadedFileId: string,
  userId: string,
  options?: { now?: Date },
): Promise<{
  changed: boolean;
  status: ProcessingStatus;
  // 이 필드는 컬럼을 **읽어** 돌려주는 값이다. 이미 저장된 행에는 union에
  // 없는 옛 코드가 들어 있을 수 있으므로 좁히지 않는다. 좁힌 union이 걸리는
  // 곳은 쓰기 경로(getStaleFailureCode → markUploadedFileAttemptFailed)다.
  failureCode: string | null;
}> {
  const now = options?.now ?? new Date();
  const file = await findStaleProcessingCandidate(uploadedFileId, userId);

  if (!file) {
    throw new Error("Uploaded file not found");
  }

  const status = toProcessingStatus(file.status);

  if (!isActiveProcessingStatus(status)) {
    return {
      changed: false,
      status,
      failureCode: file.failureCode,
    };
  }

  const hasProcessingForQueuedState =
    status === "queued" ? await hasProcessingUploadForUser(userId) : false;
  const failureCode = getStaleFailureCode(
    file,
    now,
    hasProcessingForQueuedState,
  );

  if (!failureCode) {
    return {
      changed: false,
      status,
      failureCode: file.failureCode,
    };
  }

  const updated = await markUploadedFileAttemptFailed(
    file.id,
    file.currentAttempt,
    failureCode,
    {
      now,
      statuses: [status],
    },
  );

  if (updated.count === 1 && failureCode === "worker_timeout") {
    await sendProcessingCancelEventBestEffort({
      uploadedFileId: file.id,
      attempt: file.currentAttempt,
    });
  }

  const latest = await findUploadedFileFailureState(uploadedFileId, userId);

  return {
    changed: updated.count === 1,
    status: toProcessingStatus(latest.status),
    failureCode: latest.failureCode,
  };
}

// status별로 다른 것은 실패 코드와 "워커 취소 이벤트를 보내는가" 둘뿐이다.
// 규칙을 표로 두면 네 번째 active status가 생겨도 루프를 복사하지 않는다.
const STALE_RECONCILE_RULES = [
  {
    status: "processing",
    failureCode: "worker_timeout",
    cancelsWorker: true,
  },
  {
    status: "pending_enqueue",
    failureCode: "dispatch_timeout",
    cancelsWorker: false,
  },
  {
    status: "queued",
    failureCode: "queued_worker_not_started",
    cancelsWorker: false,
  },
] as const;

export async function reconcileStaleUploadedFilesForUser(
  userId: string,
  options?: { now?: Date; limit?: number },
): Promise<{ changedCount: number }> {
  const now = options?.now ?? new Date();
  const limit = options?.limit ?? 50;
  const activeFiles = await listActiveProcessingCandidatesByUserId(
    userId,
    limit,
  );

  let changedCount = 0;

  for (const rule of STALE_RECONCILE_RULES) {
    // "이 사용자에게 아직 처리 중인 업로드가 있는가"는 queued 판정에만 쓰인다.
    // ⚠️ 앞선 processing 규칙이 stale 행을 실패로 바꾼 **뒤에** 세어야 한다.
    // 루프 밖에서 한 번 세면 방금 실패시킨 행이 아직 처리 중으로 잡혀,
    // 같은 사이클에서 정리됐어야 할 queued 행이 한 번 더 밀린다.
    const hasProcessing =
      rule.status === "queued" ? await hasProcessingUploadForUser(userId) : false;

    for (const file of activeFiles.filter(
      (candidate) => candidate.status === rule.status,
    )) {
      const failureCode = getStaleFailureCode(file, now, hasProcessing);

      if (failureCode !== rule.failureCode) {
        continue;
      }

      const updated = await markUploadedFileAttemptFailed(
        file.id,
        file.currentAttempt,
        failureCode,
        {
          now,
          statuses: [rule.status],
        },
      );

      if (updated.count !== 1) {
        continue;
      }

      changedCount += 1;

      if (rule.cancelsWorker) {
        await sendProcessingCancelEventBestEffort({
          uploadedFileId: file.id,
          attempt: file.currentAttempt,
        });
      }
    }
  }

  return { changedCount };
}
