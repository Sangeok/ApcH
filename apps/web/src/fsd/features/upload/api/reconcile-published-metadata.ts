import "server-only";
import { db } from "~/server/db";
import { findProcessingDispatchForAttempt } from "~/fsd/entities/processing-dispatch/server";
import { lockUserForCredits } from "~/fsd/entities/user/server";
import {
  lockUploadedFileForProcessing,
  findUploadedFileForDeletion,
} from "~/fsd/entities/uploaded-file/server";
import { updateClipMetadataFromBackendClips } from "~/fsd/entities/clip/server";
import type { ProcessVideoBackendClip } from "~/inngest/modal-contract";

export async function reconcilePublishedVideoMetadata(
  uploadedFileId: string,
  attempt: number,
  clips: ProcessVideoBackendClip[],
): Promise<void> {
  const hint = await findProcessingDispatchForAttempt(uploadedFileId, attempt);
  if (!hint || hint.reservation?.status !== "settled") return;
  await db.$transaction(async (tx) => {
    const userId = hint.uploadedFile.userId;
    await lockUserForCredits(userId, tx);
    await lockUploadedFileForProcessing(uploadedFileId, tx);
    const current = await findUploadedFileForDeletion(uploadedFileId, userId, {
      tx,
    });
    if (
      !current ||
      current.deletedAt ||
      current.currentAttempt !== attempt ||
      current.lastSuccessfulAttempt !== attempt
    )
      return;
    await updateClipMetadataFromBackendClips(
      { uploadedFileId, processingAttempt: attempt, clips },
      { tx },
    );
  });
}
