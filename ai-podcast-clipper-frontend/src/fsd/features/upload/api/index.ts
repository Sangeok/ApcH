"use server";

import { Prisma } from "generated/prisma";
import { revalidatePath } from "next/cache";
import { auth } from "~/server/auth";
import { db } from "~/server/db";
import {
  createProcessingDispatch,
  dispatchProcessingRequestByIdOrFail,
} from "~/fsd/entities/processing-dispatch";
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
    const { fileName, contentType, language, clipCount } = validated.data;
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

// Fetch the current user's upload details, returning null for hidden upload drafts.
export async function getUploadedFileDetails(uploadedFileId: string) {
  const session = await auth();

  if (!session?.user?.id) {
    throw new Error("Unauthorized");
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
    ["processed", "failed", "no credits"],
  );
}
