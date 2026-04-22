"use server";

import { Prisma } from "generated/prisma";
import { revalidatePath } from "next/cache";
import { auth } from "~/server/auth";
import { db } from "~/server/db";
import { deleteClipsByUploadedFileId } from "~/fsd/entities/clip";
import {
  createProcessingDispatch,
  dispatchPendingProcessingRequests,
} from "~/fsd/entities/processing-dispatch";
import {
  HiddenUploadDraftError,
  confirmUploadedFileSourceIfObjectExists,
  createUploadedFile,
  deleteUploadedFileRecord,
  findUploadedFileForDeletion,
  findUploadedFileForReprocess,
  findUploadedFileS3Key,
  getUploadedFileDetailsById,
  getUploadedFilePrefix,
  getUploadedFileProcessingRequestState,
  isActiveProcessingStatus,
  listRecoverableUploadDraftsByUserId,
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
  generateUploadUrlSchema,
  isSupportedClipCount,
  requestProcessingAttemptSchema,
} from "../model/schemas";

async function nudgeProcessingDispatch(): Promise<void> {
  try {
    await dispatchPendingProcessingRequests(1);
  } catch (error) {
    console.error("Best-effort processing dispatch nudge failed", error);
  }
}

async function deleteUploadedFileS3Assets(s3Key: string): Promise<void> {
  const prefix = `${getUploadedFilePrefix(s3Key)}/`;
  const keys = await listS3Objects(prefix);

  if (keys.length > 0) {
    await deleteS3Objects(keys);
    return;
  }

  await deleteS3Object(s3Key);
}

async function createProcessingAttempt(
  uploadedFileId: string,
  userId: string,
  allowedStatuses: string[],
): Promise<ActionResult<void>> {
  try {
    const now = new Date();
    const scheduled = await db.$transaction(async (tx) => {
      const uploadedFile = await tx.uploadedFile.findFirst({
        where: { id: uploadedFileId, userId },
        select: {
          id: true,
          userId: true,
          status: true,
          uploaded: true,
          currentAttempt: true,
          targetClipCount: true,
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

      if (!allowedStatuses.includes(uploadedFile.status)) {
        if (isActiveProcessingStatus(uploadedFile.status as never)) {
          return failure("Processing has already been requested");
        }

        return failure("This file cannot be scheduled right now");
      }

      const nextAttempt = uploadedFile.currentAttempt + 1;
      const claimed = await tx.uploadedFile.updateMany({
        where: {
          id: uploadedFileId,
          userId,
          uploaded: true,
          status: {
            in: allowedStatuses,
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

      await createProcessingDispatch(
        {
          uploadedFileId,
          attempt: nextAttempt,
        },
        { tx, now },
      );

      return success();
    });

    if (!scheduled.success) {
      return scheduled;
    }
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

  await nudgeProcessingDispatch();
  revalidatePath("/dashboard");
  revalidatePath(`/dashboard/uploads/${uploadedFileId}`);

  return success();
}

export async function generateUploadUrl(fileInfo: {
  fileName: string;
  contentType: string;
  language: string;
  clipCount: number;
}): Promise<ActionResult<{ signedUrl: string; uploadedFileId: string; key: string }>> {
  const authResult = await requireAuth();
  if (!authResult.success) return authResult;

  const validated = generateUploadUrlSchema.safeParse(fileInfo);

  if (!validated.success) {
    return failure(validated.error.issues[0]?.message ?? "Invalid upload request");
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

    const uploadedFileDbRecord = await createUploadedFile({
      userId: authResult.data.userId,
      s3Key: key,
      displayName: fileName,
      language,
      targetClipCount: clipCount,
    });

    return success({ key, uploadedFileId: uploadedFileDbRecord.id, signedUrl });
  } catch (error) {
    console.error("Failed to generate upload URL", error);
    return failure("Failed to generate upload URL");
  }
}

export async function confirmUploadCompleted(
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

export async function reconcileUploadConfirmation(
  uploadedFileId: string,
) {
  const authResult = await requireAuth();
  if (!authResult.success) return authResult;

  try {
    const confirmationState = await getUploadedFileProcessingRequestState(
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

    return success({
      status: confirmationState.status as never,
      uploaded: confirmationState.uploaded,
      currentAttempt: confirmationState.currentAttempt,
    });
  } catch (error) {
    console.error("Failed to reconcile upload confirmation", error);
    return failure("Failed to reconcile upload confirmation");
  }
}

export async function reconcileProcessingRequest(uploadedFileId: string) {
  const authResult = await requireAuth();
  if (!authResult.success) return authResult;

  try {
    const requestState = await getUploadedFileProcessingRequestState(
      uploadedFileId,
      authResult.data.userId,
    );

    if (requestState.status === "pending_enqueue") {
      await nudgeProcessingDispatch();
    }

    return success({
      status: requestState.status as never,
      uploaded: requestState.uploaded,
      currentAttempt: requestState.currentAttempt,
    });
  } catch (error) {
    console.error("Failed to reconcile processing request", error);
    return failure("Failed to reconcile processing request");
  }
}

export async function requestProcessingAttempt(
  uploadedFileId: string,
): Promise<ActionResult<void>> {
  const authResult = await requireAuth();
  if (!authResult.success) return authResult;

  const validated = requestProcessingAttemptSchema.safeParse({ uploadedFileId });

  if (!validated.success) {
    return failure(validated.error.issues[0]?.message ?? "Invalid request");
  }

  return createProcessingAttempt(uploadedFileId, authResult.data.userId, [
    "upload_pending",
  ]);
}

export async function getUploadedFileDetails(uploadedFileId: string) {
  const session = await auth();

  if (!session?.user?.id) {
    throw new Error("Unauthorized");
  }

  try {
    return await getUploadedFileDetailsById(uploadedFileId, session.user.id);
  } catch (error) {
    if (error instanceof HiddenUploadDraftError) {
      return null;
    }

    throw error;
  }
}

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

export async function deleteUploadedFile(
  uploadedFileId: string,
): Promise<ActionResult<void>> {
  return deleteUploadedFileWithClips(uploadedFileId);
}

export async function deleteUploadedFileWithClips(
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

    if (isActiveProcessingStatus(uploadedFile.status as never)) {
      return failure("Active uploads cannot be deleted");
    }

    await deleteUploadedFileS3Assets(uploadedFile.s3Key);

    await db.$transaction(async (tx) => {
      await deleteClipsByUploadedFileId(uploadedFileId, { tx });
      await deleteUploadedFileRecord(uploadedFileId, authResult.data.userId, {
        tx,
      });
    });

    revalidatePath("/dashboard");
    revalidatePath(`/dashboard/uploads/${uploadedFileId}`);
    return success();
  } catch (error) {
    console.error("Failed to delete uploaded file with clips", error);
    return failure("Failed to delete uploaded file with clips");
  }
}

export async function reprocessUploadedFile(
  uploadedFileId: string,
): Promise<ActionResult<void>> {
  const authResult = await requireAuth();
  if (!authResult.success) return authResult;

  try {
    const uploadedFile = await findUploadedFileForReprocess(
      uploadedFileId,
      authResult.data.userId,
    );

    if (isActiveProcessingStatus(uploadedFile.status as never)) {
      return failure("Already processing");
    }

    if (!uploadedFile.uploaded) {
      return failure("Source upload has not been confirmed");
    }

    return createProcessingAttempt(uploadedFileId, authResult.data.userId, [
      "processed",
      "failed",
      "no credits",
    ]);
  } catch (error) {
    console.error("Failed to reprocess file", error);
    return failure("Failed to reprocess file");
  }
}

export async function listRecoverableUploads() {
  const authResult = await requireAuth();
  if (!authResult.success) return authResult;

  try {
    return success(
      await listRecoverableUploadDraftsByUserId(authResult.data.userId),
    );
  } catch (error) {
    console.error("Failed to load recoverable uploads", error);
    return failure("Failed to load recoverable uploads");
  }
}
