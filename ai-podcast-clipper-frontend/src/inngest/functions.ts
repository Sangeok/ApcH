import { env } from "~/env";
import { createClipsBulk } from "~/fsd/entities/clip";
import { dispatchPendingProcessingRequests } from "~/fsd/entities/processing-dispatch";
import {
  confirmUploadedFileSourceByIdIfObjectExists,
  deleteUploadedFileRecordById,
  findRawUploadDraftsForPromotion,
  findStaleProcessingUploadedFiles,
  findStaleRawUploadDrafts,
  findStaleRecoverableUploadDrafts,
  findUploadedFileProcessingContext,
  markUploadedFileAttemptFailed,
  markUploadedFileAttemptNoCredits,
  markUploadedFileAttemptProcessed,
  startUploadedFileProcessingAttempt,
} from "~/fsd/entities/uploaded-file";
import { decrementUserCreditsFloorZero } from "~/fsd/entities/user";
import {
  deleteS3Object,
  listS3Objects,
  objectExists,
} from "~/fsd/shared/api/s3";
import { inngest } from "./client";

type ProcessVideoBackendClip = {
  index: number;
  startSeconds?: number | null;
  endSeconds?: number | null;
  s3Key?: string | null;
  scriptText?: string | null;
  language?: string | null;
  youtubeTitle?: string | null;
  youtubeDescription?: string | null;
  youtubeHashtags?: string[] | null;
};

function toErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }

  if (typeof error === "string" && error.trim().length > 0) {
    return error;
  }

  if (error && typeof error === "object") {
    try {
      return JSON.stringify(error);
    } catch {
      return "Unexpected backend failure";
    }
  }

  return "Unexpected backend failure";
}

async function promoteRecoverableUploadDrafts(limit = 25): Promise<number> {
  const drafts = await findRawUploadDraftsForPromotion(limit);
  let promoted = 0;

  for (const draft of drafts) {
    try {
      const result = await confirmUploadedFileSourceByIdIfObjectExists(draft.id);

      if (result.status === "confirmed" && result.confirmedNow) {
        promoted += 1;
      }
    } catch (error) {
      console.error("Failed to promote recoverable upload draft", error);
    }
  }

  return promoted;
}

async function cleanupStaleRawUploadDrafts(limit = 25): Promise<number> {
  const staleBefore = new Date(Date.now() - 24 * 60 * 60 * 1000);
  const drafts = await findStaleRawUploadDrafts(staleBefore, limit);
  let deleted = 0;

  for (const draft of drafts) {
    try {
      const result = await confirmUploadedFileSourceByIdIfObjectExists(draft.id);

      if (result.status === "confirmed" || result.status === "skipped") {
        continue;
      }

      if (result.status === "not_found") {
        continue;
      }

      await deleteUploadedFileRecordById(draft.id);
      deleted += 1;
    } catch (error) {
      console.error("Failed to cleanup stale raw upload draft", error);
    }
  }

  return deleted;
}

async function cleanupStaleRecoverableUploadDrafts(limit = 25): Promise<number> {
  const staleBefore = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
  const drafts = await findStaleRecoverableUploadDrafts(staleBefore, limit);
  let deleted = 0;

  for (const draft of drafts) {
    try {
      if (await objectExists(draft.s3Key)) {
        await deleteS3Object(draft.s3Key);
      }

      await deleteUploadedFileRecordById(draft.id);
      deleted += 1;
    } catch (error) {
      console.error("Failed to cleanup stale recoverable upload draft", error);
    }
  }

  return deleted;
}

async function recoverStaleProcessingAttempts(): Promise<number> {
  const staleBefore = new Date(Date.now() - 2 * 60 * 60 * 1000);
  const staleFiles = await findStaleProcessingUploadedFiles(staleBefore);
  let recovered = 0;

  for (const file of staleFiles) {
    const result = await markUploadedFileAttemptFailed(
      file.id,
      file.currentAttempt,
      "worker_timeout",
      {
        statuses: ["processing"],
      },
    );

    recovered += result.count;
  }

  return recovered;
}

export const processVideo = inngest.createFunction(
  {
    id: "process-video",
    retries: 1,
    cancelOn: [
      {
        event: "process-video-events/cancel",
        match: "data.matchKey",
      },
    ],
  },
  {
    event: "process-video-events",
    concurrency: {
      limit: 1,
      key: "event.data.userId",
    },
  },
  async ({ event, step }) => {
    const {
      uploadedFileId,
      language,
      clipCount,
      attempt,
      outputPrefix,
    } = event.data;

    const context = await step.run("load-processing-context", async () => {
      return findUploadedFileProcessingContext(uploadedFileId, attempt);
    });

    if (context?.status !== "queued") {
      return { skipped: true };
    }

    if (context.user.credits <= 0) {
      await step.run("mark-no-credits", async () => {
        await markUploadedFileAttemptNoCredits(uploadedFileId, attempt, {
          now: new Date(),
        });
      });

      return { skipped: false, status: "no credits" };
    }

    const claimed = await step.run("claim-processing-attempt", async () => {
      const result = await startUploadedFileProcessingAttempt(uploadedFileId, attempt, {
        now: new Date(),
      });

      return result.count === 1;
    });

    if (!claimed) {
      return { skipped: true };
    }

    try {
      const callbackUrl = env.NEXT_PUBLIC_SITE_URL
        ? `${env.NEXT_PUBLIC_SITE_URL}/api/webhooks/modal`
        : undefined;

      const modalResponse = await step.run("send-to-modal", async () => {
        const response = await fetch(env.PROCESS_VIDEO_ENDPOINT, {
          method: "POST",
          body: JSON.stringify({
            uploaded_file_id: uploadedFileId,
            s3_key: context.s3Key,
            attempt,
            language,
            clip_count: clipCount,
            output_prefix: outputPrefix,
            callback_url: callbackUrl,
          }),
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${env.PROCESS_VIDEO_ENDPOINT_AUTH}`,
          },
        });

        if (!response.ok) {
          const text = await response.text().catch(() => "");
          throw new Error(
            `Modal dispatch failed (${response.status}): ${text.slice(0, 500)}`,
          );
        }

        return (await response.json()) as Record<string, unknown>;
      });

      let backendClips: ProcessVideoBackendClip[] | undefined;

      if (modalResponse.status === "accepted") {
        if (!callbackUrl) {
          throw new Error(
            "Modal accepted async processing, but NEXT_PUBLIC_SITE_URL is not configured for callbacks",
          );
        }

        const modalResult = await step.waitForEvent("wait-for-modal-result", {
          event: "modal/video.processed",
          match: "data.matchKey",
          timeout: "1h",
        });

        if (!modalResult) {
          throw new Error(
            "Modal processing timed out while waiting for modal/video.processed",
          );
        }

        if (modalResult.data.status !== "ok") {
          throw new Error(
            `Modal callback reported status "${modalResult.data.status}": ${toErrorMessage(
              modalResult.data.error ?? "Unknown modal callback error",
            )}`,
          );
        }

        backendClips = modalResult.data.clips as ProcessVideoBackendClip[] | undefined;
      } else if (modalResponse.status === "ok") {
        backendClips = modalResponse.clips as ProcessVideoBackendClip[] | undefined;
      } else {
        throw new Error(
          toErrorMessage(modalResponse.error ?? "Modal processing failed"),
        );
      }

      const { clipsFound } = await step.run("persist-generated-clips", async () => {
        if (Array.isArray(backendClips) && backendClips.length > 0) {
          const createData = backendClips
            .filter(
              (clip): clip is ProcessVideoBackendClip & { s3Key: string } =>
                typeof clip.s3Key === "string" && clip.s3Key.length > 0,
            )
            .map((clip) => ({
              s3Key: clip.s3Key,
              uploadedFileId,
              userId: context.userId,
              processingAttempt: attempt,
              startSeconds: clip.startSeconds ?? null,
              endSeconds: clip.endSeconds ?? null,
              scriptText: clip.scriptText ?? null,
              youtubeTitle: clip.youtubeTitle ?? null,
              youtubeDescription: clip.youtubeDescription ?? null,
              youtubeHashtags: clip.youtubeHashtags
                ? JSON.stringify(clip.youtubeHashtags)
                : null,
            }));

          if (createData.length > 0) {
            await createClipsBulk(createData);
          }

          return { clipsFound: createData.length };
        }

        const clipKeys = (await listS3Objects(`${outputPrefix}/`)).filter(
          (key) => key.startsWith(`${outputPrefix}/clip_`) && key.endsWith(".mp4"),
        );

        if (clipKeys.length > 0) {
          await createClipsBulk(
            clipKeys.map((clipKey) => ({
              s3Key: clipKey,
              uploadedFileId,
              userId: context.userId,
              processingAttempt: attempt,
            })),
          );
        }

        return { clipsFound: clipKeys.length };
      });

      if (clipsFound === 0) {
        await step.run("mark-no-clips-generated", async () => {
          await markUploadedFileAttemptFailed(
            uploadedFileId,
            attempt,
            "no_clips_generated",
            {
              now: new Date(),
              statuses: ["processing"],
            },
          );
        });

        return { skipped: false, status: "no_clips_generated" };
      }

      await step.run("deduct-credits", async () => {
        await decrementUserCreditsFloorZero(context.userId, clipsFound);
      });

      await step.run("mark-processed", async () => {
        await markUploadedFileAttemptProcessed(uploadedFileId, attempt, {
          now: new Date(),
        });
      });

      return { skipped: false, status: "processed" };
    } catch (error) {
      await step.run("mark-backend-failed", async () => {
        await markUploadedFileAttemptFailed(
          uploadedFileId,
          attempt,
          "backend_failed",
          {
            now: new Date(),
            statuses: ["processing"],
          },
        );
      });

      throw error;
    }
  },
);

export const processingDispatchSweep = inngest.createFunction(
  { id: "processing-dispatch-sweep" },
  { cron: "* * * * *" },
  async () => {
    return {
      dispatched: await dispatchPendingProcessingRequests(),
    };
  },
);

export const uploadDraftSweep = inngest.createFunction(
  { id: "upload-draft-sweep" },
  { cron: "* * * * *" },
  async () => {
    const [promoted, cleanedRaw, cleanedRecoverable] = await Promise.all([
      promoteRecoverableUploadDrafts(),
      cleanupStaleRawUploadDrafts(),
      cleanupStaleRecoverableUploadDrafts(),
    ]);

    return {
      promoted,
      cleanedRaw,
      cleanedRecoverable,
    };
  },
);

export const staleProcessingSweep = inngest.createFunction(
  { id: "stale-processing-sweep" },
  { cron: "* * * * *" },
  async () => {
    return {
      recovered: await recoverStaleProcessingAttempts(),
    };
  },
);
