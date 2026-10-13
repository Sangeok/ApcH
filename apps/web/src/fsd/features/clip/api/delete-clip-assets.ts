import "server-only";
import type { Prisma } from "@repo/db";
type Producer = {
  kind: string;
  referenceId: string;
  modalCallId: string | null;
  ended: boolean;
  producerEndEvidence: Prisma.JsonValue;
};
import { db } from "~/server/db";
import { lockUserForCredits } from "~/fsd/entities/user/server";
import { lockUploadedFileForProcessing } from "~/fsd/entities/uploaded-file/server";
import {
  findClipForDeletion,
  lockClipForCardNews,
  markClipsDeleting,
} from "~/fsd/entities/clip/server";
import { listProcessingDispatchesForUpload } from "~/fsd/entities/processing-dispatch/server";
import {
  createAssetCleanupJob,
  findAssetCleanupJobsForScope,
  findCardNewsSetsForParent,
  lockCardNewsSet,
  lockCardNewsJob,
  markCardNewsSetsDeleting,
} from "~/fsd/entities/card-news/server";

export async function acceptClipAssetDeletion(
  userId: string,
  clipId: string,
): Promise<{ status: "deleting"; cleanupId: string }> {
  const hint = await findClipForDeletion(clipId, userId);
  if (!hint) throw new Error("Clip not found");
  return db.$transaction(async (tx) => {
    await lockUserForCredits(userId, tx);
    if (hint.uploadedFileId)
      await lockUploadedFileForProcessing(hint.uploadedFileId, tx);
    await lockClipForCardNews(clipId, tx);
    const clip = await findClipForDeletion(clipId, userId, tx);
    if (!clip || clip.uploadedFile?.deletedAt)
      throw new Error("Clip not found");
    if (clip.uploadedFile?.status === "processing")
      throw new Error("Wait for video processing before deleting");
    const existingCleanup = (
      await findAssetCleanupJobsForScope(userId, "clip", clipId, tx)
    )[0];
    if (existingCleanup)
      return { status: "deleting", cleanupId: existingCleanup.id };
    const sets = await findCardNewsSetsForParent(userId, { clipId }, tx);
    for (const set of sets) await lockCardNewsSet(set.id, tx);
    const jobs = sets
      .flatMap((set) => set.jobs)
      .sort((a, b) => a.id.localeCompare(b.id));
    for (const job of jobs) await lockCardNewsJob(job.id, tx);
    if (jobs.some((job) => ["pending", "running"].includes(job.status)))
      throw new Error("Wait for active card news jobs before deleting");
    const dispatches = clip.uploadedFileId
      ? (
          await listProcessingDispatchesForUpload(clip.uploadedFileId, tx)
        ).filter((entry) => entry.attempt === clip.processingAttempt)
      : [];
    if (dispatches.some((entry) => entry.reservation?.status === "held"))
      throw new Error("Held video reservation prevents deletion");
    await markClipsDeleting([clipId], tx);
    await markCardNewsSetsDeleting(
      sets.map((set) => set.id),
      tx,
    );
    const cleanup = await createAssetCleanupJob(
      {
        userId,
        kind: "clip",
        scopeId: clipId,
        scopeSnapshot: {
          scopeKind: "clip",
          scopeId: clipId,
          clipIds: [clipId],
          setIds: sets.map((set) => set.id),
          jobIds: jobs.map((job) => job.id),
          uploadedFileId: clip.uploadedFileId,
        },
        exactKeys: [clip.s3Key],
        dedicatedPrefixes: sets.map((set) => `card-news/${userId}/${set.id}/`),
        producerReferences: [
          ...dispatches.map((entry) => ({
            kind: "video",
            referenceId: entry.id,
            modalCallId: entry.modalCallId,
            ended: entry.modalSpawnState === "ended",
            producerEndEvidence: entry.producerEndEvidence,
          })),
          ...jobs.flatMap<Producer>((job) =>
            job.invocations.length
              ? job.invocations.map((entry) => ({
                  kind: "card-news",
                  referenceId: entry.id,
                  modalCallId: entry.modalCallId,
                  ended: entry.status === "ended",
                  producerEndEvidence: entry.producerEndEvidence,
                }))
              : job.modalSpawnState === "not_sent"
                ? []
                : [
                    {
                      kind: "card-news",
                      referenceId: job.id,
                      modalCallId: job.modalCallId,
                      ended: false,
                      producerEndEvidence: null,
                    },
                  ],
          ),
        ],
      },
      tx,
    );
    return { status: "deleting", cleanupId: cleanup.id };
  });
}
