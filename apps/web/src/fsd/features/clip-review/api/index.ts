"use server";

import { revalidatePath } from "next/cache";
import {
  createCustomClipDraft,
  findClipDraftWithUpload,
  updateClipDraftEdit,
} from "~/fsd/entities/clip-draft/server";
import { findUploadedFileReviewState } from "~/fsd/entities/uploaded-file/server";
import { getS3ObjectText } from "~/fsd/shared/api/s3";
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
import { type TranscriptWord, parseTranscriptWords } from "../model/transcript";

// 검토 UI가 단어 경계 스냅·미리보기에 쓰는 단어 단위 전사를 서버에서 읽어 넘긴다.
// 브라우저가 S3를 직접 GET하지 않으므로 크로스 오리진(CORS)이 없고 presign URL도
// 노출되지 않는다.
export async function getTranscript(
  uploadedFileId: string,
): Promise<ActionResult<{ words: TranscriptWord[] }>> {
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

    const raw = await getS3ObjectText(file.transcriptS3Key);
    return success({ words: parseTranscriptWords(JSON.parse(raw)) });
  } catch (error) {
    console.error("Failed to load transcript", error);
    return failure("Failed to load transcript");
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
