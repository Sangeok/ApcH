"use server";

import { revalidatePath } from "next/cache";
import { auth } from "~/server/auth";
import { db } from "~/server/db";
import { inngest } from "~/inngest/client";
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

    const uploadedFileDbRecord = await db.uploadedFile.create({
      data: {
        userId: authResult.data.userId,
        s3Key: key,
        displayName: fileInfo.fileName,
        uploaded: false,
        language: fileInfo.language ?? "English",
      },
      select: {
        id: true,
      },
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

  const uploadedFile = await db.uploadedFile.findUniqueOrThrow({
    where: { id: uploadedFileId, userId: session.user.id },
    select: {
      id: true,
      displayName: true,
      createdAt: true,
      updatedAt: true,
      status: true,
      language: true,
      clips: {
        orderBy: { createdAt: "desc" },
      },
    },
  });

  return uploadedFile;
}

/**
 * Get presigned URL for downloading original video
 */
export async function getOriginalPlayUrl(
  uploadedFileId: string,
): Promise<ActionResult<{ url: string }>> {
  const session = await auth();
  if (!session?.user?.id) {
    return failure("Unauthorized");
  }

  try {
    const uploadedFile = await db.uploadedFile.findUniqueOrThrow({
      where: { id: uploadedFileId, userId: session.user.id },
      select: { s3Key: true },
    });

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
    await db.uploadedFile.delete({
      where: { id: uploadedFileId, userId },
    });
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
    const uploadedFile = await db.uploadedFile.findUnique({
      where: { id: uploadedFileId, userId },
      select: { s3Key: true },
    });

    if (!uploadedFile) {
      return failure("Uploaded file not found");
    }

    await removeGeneratedClipsFromS3(uploadedFile.s3Key, {
      includeOriginal: true,
    });

    await db.$transaction([
      db.clip.deleteMany({ where: { uploadedFileId } }),
      db.uploadedFile.delete({ where: { id: uploadedFileId, userId } }),
    ]);

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
  const session = await auth();
  if (!session?.user?.id) {
    return failure("Unauthorized");
  }

  try {
    const uploadedFile = await db.uploadedFile.findFirstOrThrow({
      where: { id: uploadedFileId, userId: session.user.id },
      select: {
        id: true,
        userId: true,
        status: true,
        uploaded: true,
        s3Key: true,
        language: true,
      },
    });

    if (["queued", "processing"].includes(uploadedFile.status)) {
      return failure("Already processing");
    }

    await db.$transaction([
      db.clip.deleteMany({ where: { uploadedFileId } }),
      db.uploadedFile.update({
        where: { id: uploadedFileId },
        data: { status: "queued", uploaded: false },
      }),
    ]);

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

    await db.uploadedFile.update({
      where: { id: uploadedFileId },
      data: { uploaded: true },
    });

    revalidatePath("/dashboard");
    return success(undefined);
  } catch (error) {
    console.error("Failed to reprocess file", error);
    return failure("Failed to reprocess file");
  }
}

/**
 * Generate presigned URL for uploading to S3
 * @deprecated generateUploadUrl 함수를 사용하세요. 이 함수는 다음 버전에서 제거됩니다.
 */
export async function getPresignedUploadUrl(
  fileName: string,
  contentType: string,
  _userId: string,
  fileId: string,
): Promise<ActionResult<{ url: string; s3Key: string }>> {
  const authResult = await requireAuth();
  if (!authResult.success) return authResult;
  const { userId } = authResult.data;

  try {
    const s3Key = `${userId}/${fileId}/original.mp4`;
    const url = await generatePresignedPutUrl(
      s3Key,
      contentType,
      S3_CONFIG.PRESIGNED_PUT_URL_EXPIRY,
    );

    return success({ url, s3Key });
  } catch (error) {
    console.error("Failed to generate presigned upload URL", error);
    return failure("Failed to generate presigned upload URL");
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
