"use server";

import { revalidatePath } from "next/cache";
import { deleteClipRecord, findClipById } from "~/fsd/entities/clip";
import {
  deleteS3Object,
  generatePresignedGetUrl,
  S3_CONFIG,
} from "~/fsd/shared/api/s3";
import { requireAuth } from "~/fsd/shared/api/auth-guard";
import { type ActionResult, failure, success } from "~/fsd/shared/api/result";

export async function getClipPlayUrl(
  clipId: string,
): Promise<ActionResult<{ url: string }>> {
  const authResult = await requireAuth();
  if (!authResult.success) return authResult;

  try {
    const clip = await findClipById(clipId, authResult.data.userId);

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

export async function deleteClip(
  clipId: string,
): Promise<ActionResult<void>> {
  const authResult = await requireAuth();
  if (!authResult.success) return authResult;

  try {
    const clip = await findClipById(clipId, authResult.data.userId);

    if (
      clip.uploadedFile?.lastSuccessfulAttempt === clip.processingAttempt
    ) {
      return failure("Visible clips cannot be deleted");
    }

    await deleteS3Object(clip.s3Key);
    await deleteClipRecord(clip.id);

    revalidatePath("/dashboard");
    return success();
  } catch (error) {
    console.error("Failed to delete clip", error);
    return failure("Failed to delete clip");
  }
}
