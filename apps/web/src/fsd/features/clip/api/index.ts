"use server";

import { acceptClipAssetDeletion } from "./delete-clip-assets";
import { revalidatePath } from "next/cache";
import { findClipById } from "~/fsd/entities/clip/server";
import { generatePresignedGetUrl, S3_CONFIG } from "~/fsd/shared/api/s3";
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
): Promise<ActionResult<{ status: "deleting"; cleanupId: string }>> {
  const authResult = await requireAuth();
  if (!authResult.success) return authResult;
  try {
    const result = await acceptClipAssetDeletion(
      authResult.data.userId,
      clipId,
    );
    revalidatePath("/dashboard");
    return success(result);
  } catch (error) {
    return failure(
      error instanceof Error
        ? error.message
        : "Failed to request clip deletion",
    );
  }
}
