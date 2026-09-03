"use server";

import { revalidatePath } from "next/cache";
import {
  createCustomClipDraft,
  findClipDraftWithUpload,
  updateClipDraftEdit,
} from "~/fsd/entities/clip-draft/server";
import { findUploadedFileReviewState } from "~/fsd/entities/uploaded-file/server";
import { generatePresignedGetUrl, S3_CONFIG } from "~/fsd/shared/api/s3";
import { requireAuth } from "~/fsd/shared/api/auth-guard";
import { type ActionResult, failure, success } from "~/fsd/shared/api/result";
import {
  CLIP_DURATION_LIMITS,
  isClipDurationWithinLimits,
} from "~/fsd/shared/config/constants";
import {
  addCustomClipDraftSchema,
  updateClipDraftSchema,
  type CaptionStyleInput,
} from "../model/schemas";

// Generate a short-lived URL for the stored word-level transcript JSON,
// used by the review UI for word-boundary snapping and text preview.
export async function getTranscriptUrl(
  uploadedFileId: string,
): Promise<ActionResult<{ url: string }>> {
  const authResult = await requireAuth();
  if (!authResult.success) return authResult;

  try {
    const file = await findUploadedFileReviewState(
      uploadedFileId,
      authResult.data.userId,
    );

    if (!file?.transcriptS3Key) {
      return failure("Transcript is not available for this upload");
    }

    const url = await generatePresignedGetUrl(
      file.transcriptS3Key,
      S3_CONFIG.PRESIGNED_GET_URL_EXPIRY,
    );

    return success({ url });
  } catch (error) {
    console.error("Failed to get transcript url", error);
    return failure("Failed to get transcript url");
  }
}

// Persists a single draft edit (range, selection, caption style) while under review.
export async function saveClipDraftEdit(input: {
  clipDraftId: string;
  startSeconds: number;
  endSeconds: number;
  selected: boolean;
  captionStyle?: CaptionStyleInput | null;
}): Promise<ActionResult<void>> {
  const authResult = await requireAuth();
  if (!authResult.success) return authResult;

  const validated = updateClipDraftSchema.safeParse(input);

  if (!validated.success) {
    return failure(validated.error.issues[0]?.message ?? "Invalid edit");
  }

  const { clipDraftId, startSeconds, endSeconds, selected, captionStyle } =
    validated.data;

  try {
    const draft = await findClipDraftWithUpload(
      clipDraftId,
      authResult.data.userId,
    );

    if (!draft) {
      return failure("Clip draft not found");
    }

    if (
      draft.uploadedFile.status !== "review_pending" ||
      draft.uploadedFile.reviewAttempt !== draft.attempt
    ) {
      return failure("This upload is not currently under review");
    }

    if (!isClipDurationWithinLimits(startSeconds, endSeconds)) {
      return failure(
        `Clip length must be between ${CLIP_DURATION_LIMITS.MIN_SECONDS}s and ${CLIP_DURATION_LIMITS.MAX_SECONDS}s`,
      );
    }

    await updateClipDraftEdit(clipDraftId, {
      startSeconds,
      endSeconds,
      selected,
      captionStyle,
    });

    revalidatePath(`/dashboard/uploads/${draft.uploadedFile.id}`);
    return success();
  } catch (error) {
    console.error("Failed to save clip draft edit", error);
    return failure("Failed to save clip draft edit");
  }
}

// Adds a user-authored custom clip draft (AI missed it) while under review.
export async function addCustomClipDraft(input: {
  uploadedFileId: string;
  startSeconds: number;
  endSeconds: number;
}): Promise<ActionResult<{ clipDraftId: string }>> {
  const authResult = await requireAuth();
  if (!authResult.success) return authResult;

  const validated = addCustomClipDraftSchema.safeParse(input);

  if (!validated.success) {
    return failure(validated.error.issues[0]?.message ?? "Invalid clip");
  }

  const { uploadedFileId, startSeconds, endSeconds } = validated.data;

  try {
    const file = await findUploadedFileReviewState(
      uploadedFileId,
      authResult.data.userId,
    );

    if (!file) {
      return failure("Uploaded file not found");
    }

    if (file.status !== "review_pending" || file.reviewAttempt === null) {
      return failure("This upload is not currently under review");
    }

    const created = await createCustomClipDraft(file.id, file.reviewAttempt, {
      startSeconds,
      endSeconds,
    });

    revalidatePath(`/dashboard/uploads/${file.id}`);
    return success({ clipDraftId: created.id });
  } catch (error) {
    console.error("Failed to add custom clip draft", error);
    return failure("Failed to add clip");
  }
}
