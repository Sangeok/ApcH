"use server";

import { revalidatePath } from "next/cache";
import { inngest } from "~/inngest/client";
import { deleteClipRecord, findClipById } from "~/fsd/entities/clip";
import {
  findUploadedFileForProcessTrigger,
  setUploadedFileUploaded,
  updateUploadedFileLanguage,
} from "~/fsd/entities/uploaded-file";
import {
  generatePresignedGetUrl,
  deleteS3Object,
  listS3Objects,
  S3_CONFIG,
} from "~/fsd/shared/api/s3";
import { type ActionResult, success, failure } from "~/fsd/shared/api/result";
import { requireAuth } from "~/fsd/shared/api/auth-guard";
import { processVideoSchema } from "~/fsd/features/clip/model/schemas";

/**
 * Trigger video processing via Inngest
 */
export async function processVideo(
  uploadedFileId: string,
  language: string,
  clipCount: number,
): Promise<ActionResult<void>> {
  // Step 1: 인증 체크
  const authResult = await requireAuth();
  if (!authResult.success) return authResult;
  const { userId } = authResult.data;

  // Step 2: 입력 검증
  const validated = processVideoSchema.safeParse({
    uploadedFileId,
    language,
    clipCount,
  });

  if (!validated.success) {
    return failure(validated.error.issues[0]?.message ?? "Invalid input");
  }

  const {
    uploadedFileId: fileId,
    language: lang,
    clipCount: count,
  } = validated.data;

  try {
    // Update language for consistency
    await updateUploadedFileLanguage(fileId, userId, lang);

    const uploadedVideo = await findUploadedFileForProcessTrigger(fileId, userId);

    if (uploadedVideo.uploaded) {
      return failure("Video already uploaded");
    }

    await inngest.send({
      name: "process-video-events",
      data: {
        uploadedFileId: uploadedVideo.id,
        userId: uploadedVideo.userId,
        language: lang,
        clipCount: count,
      },
    });

    await setUploadedFileUploaded(uploadedVideo.id, true, { userId });

    revalidatePath("/dashboard");
    return success(undefined);
  } catch (error) {
    console.error("Failed to process video", error);
    return failure("Failed to process video");
  }
}

/**
 * Get presigned URL for playing a clip
 */
export async function getClipPlayUrl(
  clipId: string,
): Promise<ActionResult<{ url: string }>> {
  const authResult = await requireAuth();
  if (!authResult.success) return authResult;
  const { userId } = authResult.data;

  try {
    const clip = await findClipById(clipId, userId);

    const signedUrl = await generatePresignedGetUrl(
      clip.s3Key,
      S3_CONFIG.PRESIGNED_GET_URL_EXPIRY,
    );

    return success({ url: signedUrl });
  } catch (error) {
    console.error("Failed to generate play URL", error);
    return failure("Failed to generate play URL");
  }
}

/**
 * Delete a clip and cleanup S3 if folder becomes empty
 */
export async function deleteClip(
  clipId: string,
): Promise<ActionResult<void>> {
  const authResult = await requireAuth();
  if (!authResult.success) return authResult;
  const { userId } = authResult.data;

  try {
    const clip = await findClipById(clipId, userId);

    // Delete clip from S3
    await deleteS3Object(clip.s3Key);

    // Check if folder should be cleaned up
    const prefixIndex = clip.s3Key.lastIndexOf("/");
    if (prefixIndex >= 0) {
      const prefix = clip.s3Key.slice(0, prefixIndex + 1);
      const originalKey = `${prefix}original.mp4`;

      const allKeys = await listS3Objects(prefix);
      const remainingKeys = allKeys.filter(key => key !== prefix);

      const onlyOriginalRemains =
        remainingKeys.length === 1 && remainingKeys[0] === originalKey;

      if (onlyOriginalRemains) {
        // Delete original and folder
        await deleteS3Object(originalKey);
        await deleteS3Object(prefix);
      } else if (remainingKeys.length === 0) {
        // Delete empty folder
        await deleteS3Object(prefix);
      }
    }

    // Delete clip from database
    await deleteClipRecord(clip.id);
    revalidatePath("/dashboard");

    return success(undefined);
  } catch (error) {
    console.error("Failed to delete clip", error);
    return failure("Failed to delete clip");
  }
}
