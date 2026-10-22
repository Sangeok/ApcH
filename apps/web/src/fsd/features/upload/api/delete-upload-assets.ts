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
import {
  findUploadedFileForDeletion,
  lockUploadedFileForProcessing,
  markUploadedFileDeleting,
} from "~/fsd/entities/uploaded-file/server";
import {
  getUploadedFilePrefix,
  isActiveProcessingStatus,
} from "~/fsd/entities/uploaded-file";
import {
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
import { kickMaintenanceDrain } from "~/inngest/maintenance-event";

export async function acceptUploadAssetDeletion(
  userId: string,
  uploadedFileId: string,
): Promise<{ status: "deleting"; cleanupId: string }> {
  const result: { status: "deleting"; cleanupId: string } =
    await db.$transaction(async (tx) => {
      await lockUserForCredits(userId, tx);
      await lockUploadedFileForProcessing(uploadedFileId, tx);
      const file = await findUploadedFileForDeletion(uploadedFileId, userId, {
        tx,
      });
      if (!file) throw new Error("Uploaded file not found");
      if (isActiveProcessingStatus(file.status))
        throw new Error("Wait for active video processing before deleting");
      for (const clip of file.clips) await lockClipForCardNews(clip.id, tx);
      const existingCleanup = (
        await findAssetCleanupJobsForScope(
          userId,
          "uploaded-file",
          uploadedFileId,
          tx,
        )
      )[0];
      if (existingCleanup)
        return { status: "deleting", cleanupId: existingCleanup.id };
      const sets = await findCardNewsSetsForParent(
        userId,
        { uploadedFileId },
        tx,
      );
      for (const set of sets) await lockCardNewsSet(set.id, tx);
      const jobs = sets
        .flatMap((set) => set.jobs)
        .sort((a, b) => a.id.localeCompare(b.id));
      for (const job of jobs) await lockCardNewsJob(job.id, tx);
      if (jobs.some((job) => ["pending", "running"].includes(job.status)))
        throw new Error("Wait for active card news jobs before deleting");
      const dispatches = await listProcessingDispatchesForUpload(
        uploadedFileId,
        tx,
      );
      if (dispatches.some((entry) => entry.reservation?.status === "held"))
        throw new Error("Held video reservation prevents deletion");
      const producers = [
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
      ];
      await markUploadedFileDeleting(uploadedFileId, tx);
      await markClipsDeleting(
        file.clips.map((clip) => clip.id),
        tx,
      );
      await markCardNewsSetsDeleting(
        sets.map((set) => set.id),
        tx,
      );
      const cleanup = await createAssetCleanupJob(
        {
          userId,
          kind: "uploaded-file",
          scopeId: uploadedFileId,
          scopeSnapshot: {
            scopeKind: "uploaded-file",
            scopeId: uploadedFileId,
            uploadedFileId,
            clipIds: file.clips.map((clip) => clip.id),
            setIds: sets.map((set) => set.id),
            jobIds: jobs.map((job) => job.id),
            dispatchIds: dispatches.map((entry) => entry.id),
          },
          exactKeys: [file.s3Key, ...file.clips.map((clip) => clip.s3Key)],
          dedicatedPrefixes: [
            `${getUploadedFilePrefix(file.s3Key)}/`,
            ...sets.map((set) => `card-news/${userId}/${set.id}/`),
          ],
          producerReferences: producers,
        },
        tx,
      );
      return { status: "deleting", cleanupId: cleanup.id };
    });
  await kickMaintenanceDrain("upload-deletion");
  return result;
}
