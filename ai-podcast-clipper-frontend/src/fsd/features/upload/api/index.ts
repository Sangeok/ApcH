"use server";

import { revalidatePath } from "next/cache";
import { auth } from "~/server/auth";
import { db } from "~/server/db";
import { inngest } from "~/inngest/client";
import { deleteClipsByUploadedFileId } from "~/fsd/entities/clip";
import {
  createUploadedFile,
  deleteUploadedFileRecord,
  findUploadedFileForDeletion,
  findUploadedFileForReprocess,
  findUploadedFileS3Key,
  getUploadedFileDetailsById,
  setUploadedFileUploaded,
  updateUploadedFileStatus,
} from "~/fsd/entities/uploaded-file";
import {
  generatePresignedGetUrl,
  generatePresignedPutUrl,
  listS3Objects,
  deleteS3Objects,
  S3_CONFIG,
} from "~/fsd/shared/api/s3";
import { type ActionResult, success, failure } from "~/fsd/shared/api/result";
import { requireAuth } from "~/fsd/shared/api/auth-guard";
import { v4 as uuidv4 } from "uuid";

/**
 * Generate presigned upload URL and create DB record
 */
export async function generateUploadUrl(fileInfo: {
  fileName: string;
  contentType: string;
  language: string;
}): Promise<ActionResult<{ signedUrl: string; uploadedFileId: string; key: string }>> {
  const authResult = await requireAuth();
  if (!authResult.success) return authResult;

  try {
    const fileExtension = fileInfo.fileName.split(".").pop() ?? "";
    const uniqueId = uuidv4();
    const key = `${uniqueId}/original.${fileExtension}`;

    const signedUrl = await generatePresignedPutUrl(
      key,
      fileInfo.contentType,
      S3_CONFIG.PRESIGNED_PUT_URL_EXPIRY,
    );

    const uploadedFileDbRecord = await createUploadedFile({
      userId: authResult.data.userId,
      s3Key: key,
      displayName: fileInfo.fileName,
      uploaded: false,
      language: fileInfo.language ?? "English",
    });

    return success({ key, uploadedFileId: uploadedFileDbRecord.id, signedUrl });
  } catch (error) {
    console.error("Failed to generate upload URL", error);
    return failure("Failed to generate upload URL");
  }
}

/**
 * Get uploaded file details with clips
 */
export async function getUploadedFileDetails(uploadedFileId: string) {
  const session = await auth();

  if (!session?.user?.id) {
    throw new Error("Unauthorized");
  }

  return getUploadedFileDetailsById(uploadedFileId, session.user.id);
}

/**
 * Get presigned URL for downloading original video
 */
export async function getOriginalPlayUrl(
  uploadedFileId: string,
): Promise<ActionResult<{ url: string }>> {
  const authResult = await requireAuth();
  if (!authResult.success) return authResult;
  const { userId } = authResult.data;

  try {
    const uploadedFile = await findUploadedFileS3Key(uploadedFileId, userId);

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

/**
 * Delete uploaded file record (DB only)
 */
export async function deleteUploadedFile(
  uploadedFileId: string,
): Promise<ActionResult<void>> {
  const authResult = await requireAuth();
  if (!authResult.success) return authResult;
  const { userId } = authResult.data;

  try {
    await deleteUploadedFileRecord(uploadedFileId, userId);
    revalidatePath("/dashboard");
    return success(undefined);
  } catch (error) {
    console.error("Failed to delete uploaded file", error);
    return failure("Failed to delete uploaded file");
  }
}

/**
 * Delete uploaded file with all clips (DB + S3)
 */
export async function deleteUploadedFileWithClips(
  uploadedFileId: string,
): Promise<ActionResult<void>> {
  const authResult = await requireAuth();
  if (!authResult.success) return authResult;
  const { userId } = authResult.data;

  try {
    const uploadedFile = await findUploadedFileForDeletion(uploadedFileId, userId);

    if (!uploadedFile) {
      return failure("Uploaded file not found");
    }

    await removeGeneratedClipsFromS3(uploadedFile.s3Key, {
      includeOriginal: true,
    });

    await db.$transaction(async (tx) => {
      await deleteClipsByUploadedFileId(uploadedFileId, { tx });
      await deleteUploadedFileRecord(uploadedFileId, userId, { tx });
    });

    revalidatePath("/dashboard");
    revalidatePath(`/dashboard/uploads/${uploadedFileId}`);
    return success(undefined);
  } catch (error) {
    console.error("Failed to delete uploaded file with clips", error);
    return failure("Failed to delete uploaded file with clips");
  }
}

/**
 * Reprocess uploaded file (delete clips and trigger new processing)
 */
export async function reprocessUploadedFile(
  uploadedFileId: string,
): Promise<ActionResult<void>> {
  const authResult = await requireAuth();
  if (!authResult.success) return authResult;
  const { userId } = authResult.data;

  try {
    const uploadedFile = await findUploadedFileForReprocess(uploadedFileId, userId);

    if (["queued", "processing"].includes(uploadedFile.status)) {
      return failure("Already processing");
    }

    await db.$transaction(async (tx) => {
      await deleteClipsByUploadedFileId(uploadedFileId, { tx });
      await updateUploadedFileStatus(uploadedFileId, "queued", { tx, processingStartedAt: null });
      await setUploadedFileUploaded(uploadedFileId, false, { tx });
    });

    await removeGeneratedClipsFromS3(uploadedFile.s3Key);

    await inngest.send({
      name: "process-video-events",
      data: {
        uploadedFileId: uploadedFile.id,
        userId: uploadedFile.userId,
        language: uploadedFile.language ?? "English",
        clipCount: 3,
      },
    });

    await setUploadedFileUploaded(uploadedFileId, true);

    revalidatePath("/dashboard");
    return success(undefined);
  } catch (error) {
    console.error("Failed to reprocess file", error);
    return failure("Failed to reprocess file");
  }
}

/**
 * Helper: Remove generated clips from S3
 */
async function removeGeneratedClipsFromS3(
  originalKey: string,
  options?: { includeOriginal?: boolean },
): Promise<void> {
  const includeOriginal = options?.includeOriginal ?? false;
  const prefix = originalKey.split("/")[0] + "/";

  const allKeys = await listS3Objects(prefix);
  const filteredTargets = includeOriginal
    ? allKeys
    : allKeys.filter((key) => !key.endsWith("original.mp4"));

  if (filteredTargets.length === 0) return;

  await deleteS3Objects(filteredTargets);
}
