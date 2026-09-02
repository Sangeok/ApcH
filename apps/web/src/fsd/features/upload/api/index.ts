"use server";

import { Prisma } from "@repo/db";
import { revalidatePath } from "next/cache";
import { auth } from "~/server/auth";
import { db } from "~/server/db";
import {
  createProcessingDispatch,
  dispatchProcessingRequestByIdOrFail,
} from "~/fsd/entities/processing-dispatch";
import { listClipDraftsForAttempt } from "~/fsd/entities/clip-draft";
import { flushReports } from "~/fsd/shared/observability";
import {
  confirmUploadedFileSourceIfObjectExists,
  createUploadDraft,
  deleteUploadedFileRecord,
  findUploadedFileForDeletion,
  findUploadedFileS3Key,
  findUploadedFileSourceState,
  getUploadedFileDetailsById,
  getUploadedFilePrefix,
  isActiveProcessingStatus,
  isProcessingStatus,
  listActiveUploadedFileQueueStateByUserId,
  listUploadedFileSummariesByUserId,
  markUploadedFileAttemptFailed,
  reconcileStaleUploadedFileForUser,
  reconcileStaleUploadedFilesForUser,
  type ActiveUploadedFileQueueState,
  type ProcessingStatus,
  type UploadedFileSummary,
} from "~/fsd/entities/uploaded-file";
import {
  deleteS3Object,
  deleteS3Objects,
  generatePresignedGetUrl,
  generatePresignedPutUrl,
  listS3Objects,
  S3_CONFIG,
} from "~/fsd/shared/api/s3";
import { requireAuth } from "~/fsd/shared/api/auth-guard";
import { type ActionResult, failure, success } from "~/fsd/shared/api/result";
import {
  CLIP_DURATION_LIMITS,
  isClipDurationWithinLimits,
} from "~/fsd/shared/config/constants";
import { v4 as uuidv4 } from "uuid";
import {
  isSupportedClipCount,
  prepareUploadSchema,
  scheduleUploadedFileProcessingSchema,
} from "../model/schemas";

// Delete all S3 objects under this upload's prefix.
async function deleteUploadedFileS3Assets(s3Key: string): Promise<void> {
  const prefix = `${getUploadedFilePrefix(s3Key)}/`;
  const keys = await listS3Objects(prefix);

  if (keys.length > 0) {
    await deleteS3Objects(keys);
    return;
  }

  await deleteS3Object(s3Key);
}

function revalidateUploadedFileViews(uploadedFileId: string) {
  revalidatePath("/dashboard");
  revalidatePath(`/dashboard/uploads/${uploadedFileId}`);
}

// Atomically claims an upload for a new processing attempt and records
// a pending dispatch row so the dispatcher can send it to Inngest.
async function scheduleProcessingAttempt(
  uploadedFileId: string,
  userId: string,
  allowedStatuses: readonly ProcessingStatus[],
  kindOverride?: "render",
): Promise<ActionResult<void>> {
  let dispatchId: string;
  let scheduledAttempt: number;

  try {
    const now = new Date();
    const scheduled = await db.$transaction(
      async (
        tx,
      ): Promise<ActionResult<{ dispatchId: string; attempt: number }>> => {
        const uploadedFile = await tx.uploadedFile.findFirst({
          where: { id: uploadedFileId, userId },
          select: {
            id: true,
            userId: true,
            status: true,
            uploaded: true,
            currentAttempt: true,
            targetClipCount: true,
            reviewBeforeGenerate: true,
            user: {
              select: {
                credits: true,
              },
            },
          },
        });

        if (!uploadedFile) {
          return failure("Uploaded file not found");
        }

        if (!uploadedFile.uploaded) {
          return failure("Source upload has not been confirmed");
        }

        if (!isSupportedClipCount(uploadedFile.targetClipCount)) {
          return failure("Stored clip count is no longer supported");
        }

        if (!isProcessingStatus(uploadedFile.status)) {
          return failure("This file cannot be scheduled right now");
        }

        if (!allowedStatuses.includes(uploadedFile.status)) {
          if (isActiveProcessingStatus(uploadedFile.status)) {
            return failure("Processing has already been requested");
          }

          return failure("This file cannot be scheduled right now");
        }

        if (
          uploadedFile.status === "no credits" &&
          uploadedFile.user.credits <= 0
        ) {
          return failure("Add credits before retrying this upload.");
        }

        const nextAttempt = uploadedFile.currentAttempt + 1;
        const claimed = await tx.uploadedFile.updateMany({
          where: {
            id: uploadedFileId,
            userId,
            uploaded: true,
            status: {
              in: [...allowedStatuses],
            },
            currentAttempt: uploadedFile.currentAttempt,
          },
          data: {
            status: "pending_enqueue",
            enqueueRequestedAt: now,
            queuedAt: null,
            processingStartedAt: null,
            terminalStatusAt: null,
            failureCode: null,
            currentAttempt: nextAttempt,
          },
        });

        if (claimed.count !== 1) {
          return failure("Processing has already been requested");
        }

        const dispatch = await createProcessingDispatch(
          {
            uploadedFileId,
            attempt: nextAttempt,
            kind:
              kindOverride ??
              (uploadedFile.reviewBeforeGenerate ? "analyze" : "auto"),
          },
          { tx },
        );

        return success({ dispatchId: dispatch.id, attempt: nextAttempt });
      },
    );

    if (!scheduled.success) {
      return scheduled;
    }

    dispatchId = scheduled.data.dispatchId;
    scheduledAttempt = scheduled.data.attempt;
  } catch (error) {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2002"
    ) {
      return failure("Processing has already been requested");
    }

    console.error("Failed to create processing attempt", error);
    return failure("Failed to schedule processing");
  }

  const dispatchResult = await dispatchProcessingRequestByIdOrFail(dispatchId);

  if (dispatchResult.status !== "sent") {
    await markUploadedFileAttemptFailed(
      uploadedFileId,
      scheduledAttempt,
      "dispatch_failed",
      { statuses: ["pending_enqueue", "queued"] },
    );

    // 서버리스 인스턴스가 응답 후 얼면 dispatch catch에서 보고한 이벤트가 유실된다.
    // 요청 경계인 여기서 한 번만 flush한다.
    // 사용자를 붙잡는 경로이므로 기본값(2s)보다 짧은 예산을 명시한다.
    await flushReports(1_000);

    revalidateUploadedFileViews(uploadedFileId);

    return failure(
      "Processing could not start. Retry from the upload detail page.",
    );
  }

  revalidateUploadedFileViews(uploadedFileId);

  return success();
}

// Prepares an upload by creating a draft record and a presigned S3 PUT URL.
export async function prepareUpload(fileInfo: {
  fileName: string;
  contentType: string;
  language: string;
  clipCount: number;
  reviewBeforeGenerate: boolean;
}): Promise<
  ActionResult<{ signedUrl: string; uploadedFileId: string; key: string }>
> {
  const authResult = await requireAuth();
  if (!authResult.success) return authResult;

  const validated = prepareUploadSchema.safeParse(fileInfo);

  if (!validated.success) {
    return failure(
      validated.error.issues[0]?.message ?? "Invalid upload request",
    );
  }

  try {
    const { fileName, contentType, language, clipCount, reviewBeforeGenerate } =
      validated.data;
    const fileExtension = fileName.split(".").pop() ?? "";
    const uniqueId = uuidv4();
    const key = `${uniqueId}/original.${fileExtension}`;

    const signedUrl = await generatePresignedPutUrl(
      key,
      contentType,
      S3_CONFIG.PRESIGNED_PUT_URL_EXPIRY,
    );

    const uploadDraft = await createUploadDraft({
      userId: authResult.data.userId,
      s3Key: key,
      displayName: fileName,
      language,
      targetClipCount: clipCount,
      reviewBeforeGenerate,
    });

    return success({ key, uploadedFileId: uploadDraft.id, signedUrl });
  } catch (error) {
    console.error("Failed to generate upload URL", error);
    return failure("Failed to generate upload URL");
  }
}

// Verifies the source object exists in S3 and marks the upload as completed.
export async function confirmUploadObjectExists(
  uploadedFileId: string,
): Promise<ActionResult<void>> {
  const authResult = await requireAuth();
  if (!authResult.success) return authResult;

  try {
    const confirmation = await confirmUploadedFileSourceIfObjectExists(
      uploadedFileId,
      authResult.data.userId,
    );

    if (confirmation.status === "missing_object") {
      return failure("Uploaded source object was not found");
    }

    return success();
  } catch (error) {
    console.error("Failed to confirm upload completion", error);
    return failure("Failed to confirm upload completion");
  }
}

// Re-checks the upload confirmation state for a draft upload.
export async function reconcileUploadConfirmation(uploadedFileId: string) {
  const authResult = await requireAuth();
  if (!authResult.success) return authResult;

  try {
    const confirmationState = await findUploadedFileSourceState(
      uploadedFileId,
      authResult.data.userId,
    );

    if (
      !confirmationState.uploaded &&
      confirmationState.status === "upload_pending"
    ) {
      const confirmed = await confirmUploadedFileSourceIfObjectExists(
        uploadedFileId,
        authResult.data.userId,
      );

      return success(confirmed.state);
    }

    if (!isProcessingStatus(confirmationState.status)) {
      return failure("Uploaded file has an invalid status");
    }

    return success({
      status: confirmationState.status,
      uploaded: confirmationState.uploaded,
      currentAttempt: confirmationState.currentAttempt,
    });
  } catch (error) {
    console.error("Failed to reconcile upload confirmation", error);
    return failure("Failed to reconcile upload confirmation");
  }
}

// Re-checks the processing state without reviving dispatch work.
// Stale active attempts are closed so the user can start a fresh retry.
export async function reconcileProcessingRequest(uploadedFileId: string) {
  const authResult = await requireAuth();
  if (!authResult.success) return authResult;

  try {
    await reconcileStaleUploadedFileForUser(
      uploadedFileId,
      authResult.data.userId,
    );

    const requestState = await findUploadedFileSourceState(
      uploadedFileId,
      authResult.data.userId,
    );

    if (!isProcessingStatus(requestState.status)) {
      return failure("Uploaded file has an invalid status");
    }

    return success({
      status: requestState.status,
      uploaded: requestState.uploaded,
      currentAttempt: requestState.currentAttempt,
    });
  } catch (error) {
    console.error("Failed to reconcile processing request", error);
    return failure("Failed to reconcile processing request");
  }
}

// Schedules a confirmed source upload for its initial processing attempt.
export async function scheduleUploadedFileProcessing(
  uploadedFileId: string,
): Promise<ActionResult<void>> {
  const authResult = await requireAuth();
  if (!authResult.success) return authResult;

  const validated = scheduleUploadedFileProcessingSchema.safeParse({
    uploadedFileId,
  });

  if (!validated.success) {
    return failure(validated.error.issues[0]?.message ?? "Invalid request");
  }

  return scheduleProcessingAttempt(
    validated.data.uploadedFileId,
    authResult.data.userId,
    ["upload_pending"],
  );
}

// Validates the reviewed drafts and schedules the render attempt.
// clip-review 피처가 아니라 이 파일에 두는 이유: 비공개 scheduleProcessingAttempt를
// 직접 호출해 feature 간 peer import와 이중 auth/검증을 피한다.
export async function confirmClipDraftsAndGenerate(
  uploadedFileId: string,
): Promise<ActionResult<void>> {
  const authResult = await requireAuth();
  if (!authResult.success) return authResult;

  const validated = scheduleUploadedFileProcessingSchema.safeParse({
    uploadedFileId,
  });

  if (!validated.success) {
    return failure(validated.error.issues[0]?.message ?? "Invalid request");
  }

  try {
    const file = await db.uploadedFile.findFirst({
      where: {
        id: validated.data.uploadedFileId,
        userId: authResult.data.userId,
      },
      select: {
        id: true,
        status: true,
        reviewAttempt: true,
        targetClipCount: true,
        user: { select: { credits: true } },
      },
    });

    if (!file) {
      return failure("Uploaded file not found");
    }

    if (file.status !== "review_pending" || file.reviewAttempt === null) {
      return failure("This upload is not currently under review");
    }

    const selectedDrafts = (
      await listClipDraftsForAttempt(file.id, file.reviewAttempt)
    ).filter((draft) => draft.selected);

    if (selectedDrafts.length === 0) {
      return failure("Select at least one clip to generate");
    }

    if (selectedDrafts.length > file.targetClipCount) {
      return failure(
        `You can generate up to ${file.targetClipCount} clips for this upload`,
      );
    }

    if (file.user.credits < selectedDrafts.length) {
      return failure("Not enough credits for the selected clips");
    }

    // 겹치는 구간 방지 (백엔드 identify_moments의 non-overlap 제약을 미러링)
    const sorted = [...selectedDrafts].sort(
      (a, b) => a.startSeconds - b.startSeconds,
    );

    for (let i = 1; i < sorted.length; i++) {
      const prev = sorted[i - 1]!;
      const next = sorted[i]!;

      if (next.startSeconds < prev.endSeconds) {
        return failure("Selected clips must not overlap");
      }
    }

    for (const draft of selectedDrafts) {
      if (!isClipDurationWithinLimits(draft.startSeconds, draft.endSeconds)) {
        return failure(
          `Every selected clip must be between ${CLIP_DURATION_LIMITS.MIN_SECONDS}s and ${CLIP_DURATION_LIMITS.MAX_SECONDS}s`,
        );
      }
    }

    return scheduleProcessingAttempt(
      file.id,
      authResult.data.userId,
      ["review_pending"],
      "render",
    );
  } catch (error) {
    console.error("Failed to confirm clip drafts", error);
    return failure("Failed to start clip generation");
  }
}

// Fetch the current user's upload details, returning null for hidden upload drafts.
export async function getUploadedFileDetails(uploadedFileId: string) {
  const session = await auth();

  if (!session?.user?.id) {
    throw new Error("Unauthorized");
  }

  // reconcile은 행이 있을 때만 의미가 있고, 없으면 throw한다.
  // 존재를 먼저 확인해야 라우트가 notFound()로 갈 수 있다.
  const existing = await getUploadedFileDetailsById(
    uploadedFileId,
    session.user.id,
  );
  if (!existing) {
    return null;
  }

  await reconcileStaleUploadedFileForUser(uploadedFileId, session.user.id);

  return getUploadedFileDetailsById(uploadedFileId, session.user.id);
}

export async function listCurrentUserUploadedFileSummaries(): Promise<
  UploadedFileSummary[]
> {
  const authResult = await requireAuth();
  if (!authResult.success) {
    throw new Error(authResult.error);
  }

  await reconcileStaleUploadedFilesForUser(authResult.data.userId);

  return listUploadedFileSummariesByUserId(authResult.data.userId);
}

export async function listCurrentUserActiveUploadedFileQueueState(): Promise<ActiveUploadedFileQueueState> {
  const authResult = await requireAuth();
  if (!authResult.success) {
    throw new Error(authResult.error);
  }

  await reconcileStaleUploadedFilesForUser(authResult.data.userId);

  return listActiveUploadedFileQueueStateByUserId(authResult.data.userId);
}

// Generate a short-lived S3 URL for playing the current user's uploaded source file.
export async function getOriginalPlayUrl(
  uploadedFileId: string,
): Promise<ActionResult<{ url: string }>> {
  const authResult = await requireAuth();
  if (!authResult.success) return authResult;

  try {
    const uploadedFile = await findUploadedFileS3Key(
      uploadedFileId,
      authResult.data.userId,
    );

    const signedUrl = await generatePresignedGetUrl(
      uploadedFile.s3Key,
      S3_CONFIG.PRESIGNED_GET_URL_EXPIRY,
    );

    return success({ url: signedUrl });
  } catch (error) {
    console.error("Failed to get original play url", error);
    return failure("Failed to get original play url");
  }
}

// Delete an uploaded file and all associated S3 assets.
// Returns a failure for active uploads.
export async function deleteUploadedFile(
  uploadedFileId: string,
): Promise<ActionResult<void>> {
  const authResult = await requireAuth();
  if (!authResult.success) return authResult;

  try {
    const uploadedFile = await findUploadedFileForDeletion(
      uploadedFileId,
      authResult.data.userId,
    );

    if (!uploadedFile) {
      return failure("Uploaded file not found");
    }

    if (isActiveProcessingStatus(uploadedFile.status)) {
      return failure("Active uploads cannot be deleted");
    }

    await deleteUploadedFileS3Assets(uploadedFile.s3Key);
    await deleteUploadedFileRecord(uploadedFileId, authResult.data.userId);

    revalidatePath("/dashboard");
    revalidatePath(`/dashboard/uploads/${uploadedFileId}`);
    return success();
  } catch (error) {
    console.error("Failed to delete uploaded file", error);
    return failure("Failed to delete uploaded file");
  }
}

// Schedules a new processing attempt for a processed, failed, or no-credit upload.
export async function reprocessUploadedFile(
  uploadedFileId: string,
): Promise<ActionResult<void>> {
  const authResult = await requireAuth();
  if (!authResult.success) return authResult;

  const validated = scheduleUploadedFileProcessingSchema.safeParse({
    uploadedFileId,
  });

  if (!validated.success) {
    return failure(validated.error.issues[0]?.message ?? "Invalid request");
  }

  await reconcileStaleUploadedFileForUser(
    validated.data.uploadedFileId,
    authResult.data.userId,
  );

  return scheduleProcessingAttempt(
    validated.data.uploadedFileId,
    authResult.data.userId,
    ["processed", "failed", "no credits", "review_pending"],
  );
}
