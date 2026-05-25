import type { Prisma } from "generated/prisma";
import { env } from "~/env";
import {
  countClipsForAttemptS3Keys,
  createClipsBulk,
  updateClipMetadataFromBackendClips,
} from "~/fsd/entities/clip";
import {
  dispatchPendingProcessingRequests,
  findStaleQueuedSentProcessingDispatches,
  markProcessingDispatchRetryableNow,
  markStaleQueuedDispatchDeadLetter,
} from "~/fsd/entities/processing-dispatch";
import {
  confirmUploadedFileSourceByIdIfObjectExists,
  deleteUploadedFileRecordById,
  findRawUploadDraftsForPromotion,
  findStaleProcessingUploadedFiles,
  findStaleRawUploadDrafts,
  findStaleRecoverableUploadDrafts,
  findCurrentProcessingAttemptContext,
  hasProcessingUploadForUser,
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

const MODAL_RESULT_POLL_INTERVAL = "1m";
const MODAL_RESULT_MAX_POLLS = 60;
const MODAL_METADATA_GRACE_INTERVAL = "2m";
const STALE_QUEUED_DISPATCH_INTERVAL_MS = 15 * 60 * 1000;
const STALE_QUEUED_DISPATCH_DEAD_LETTER_MS = 2 * 60 * 60 * 1000;
const STALE_QUEUED_MAX_DISPATCH_COUNT = 10;

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

type RawProcessVideoBackendClip = {
  index?: number | string;
  startSeconds?: number | null;
  start_seconds?: number | null;
  endSeconds?: number | null;
  end_seconds?: number | null;
  s3Key?: string | null;
  s3_key?: string | null;
  scriptText?: string | null;
  script_text?: string | null;
  language?: string | null;
  youtubeTitle?: string | null;
  youtube_title?: string | null;
  youtubeDescription?: string | null;
  youtube_description?: string | null;
  youtubeHashtags?: string[] | null;
  youtube_hashtags?: string[] | null;
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

function isSuccessfulModalStatus(status: unknown): boolean {
  if (typeof status !== "string") {
    return false;
  }

  return ["ok", "success", "completed", "done"].includes(
    status.trim().toLowerCase(),
  );
}

function toStrictNonNegativeInteger(value: unknown): number | null {
  if (typeof value === "number" && Number.isInteger(value) && value >= 0) {
    return value;
  }

  if (typeof value === "string") {
    const normalized = value.trim();

    if (!/^\d+$/.test(normalized)) {
      return null;
    }

    const parsed = Number(normalized);
    return Number.isSafeInteger(parsed) ? parsed : null;
  }

  return null;
}

function normalizeBackendClip(clip: unknown): ProcessVideoBackendClip | null {
  if (!clip || typeof clip !== "object") {
    return null;
  }

  const rawClip = clip as RawProcessVideoBackendClip;
  const index = toStrictNonNegativeInteger(rawClip.index);

  if (index === null) {
    return null;
  }

  return {
    index,
    startSeconds: rawClip.startSeconds ?? rawClip.start_seconds ?? null,
    endSeconds: rawClip.endSeconds ?? rawClip.end_seconds ?? null,
    s3Key: rawClip.s3Key ?? rawClip.s3_key ?? null,
    scriptText: rawClip.scriptText ?? rawClip.script_text ?? null,
    language: rawClip.language ?? null,
    youtubeTitle: rawClip.youtubeTitle ?? rawClip.youtube_title ?? null,
    youtubeDescription:
      rawClip.youtubeDescription ?? rawClip.youtube_description ?? null,
    youtubeHashtags:
      rawClip.youtubeHashtags ?? rawClip.youtube_hashtags ?? null,
  };
}

function normalizeBackendClips(
  clips: unknown,
): ProcessVideoBackendClip[] | undefined {
  if (!Array.isArray(clips)) {
    return undefined;
  }

  return clips
    .map(normalizeBackendClip)
    .filter((clip): clip is ProcessVideoBackendClip => clip !== null);
}

async function findAttemptGeneratedClipKeys(
  outputPrefix: string,
): Promise<string[]> {
  const clipCandidates = await listS3Objects(`${outputPrefix}/`);

  return clipCandidates
    .filter(
      (key) => key.startsWith(`${outputPrefix}/clip_`) && key.endsWith(".mp4"),
    )
    .sort();
}

async function persistGeneratedClips(args: {
  backendClips?: ProcessVideoBackendClip[];
  outputPrefix: string;
  uploadedFileId: string;
  userId: string;
  attempt: number;
  expectedClipCount: number;
}): Promise<{ clipsFound: number }> {
  const {
    backendClips,
    outputPrefix,
    uploadedFileId,
    userId,
    attempt,
    expectedClipCount,
  } = args;

  const attemptClipKeys = await findAttemptGeneratedClipKeys(outputPrefix);
  const cappedClipKeys = attemptClipKeys.slice(0, expectedClipCount);
  const allowedClipKeys = new Set(cappedClipKeys);
  const createDataByS3Key = new Map<string, Prisma.ClipCreateManyInput>();

  if (Array.isArray(backendClips)) {
    for (const clip of backendClips) {
      if (
        typeof clip.s3Key !== "string" ||
        clip.s3Key.length === 0 ||
        !allowedClipKeys.has(clip.s3Key)
      ) {
        continue;
      }

      createDataByS3Key.set(clip.s3Key, {
        s3Key: clip.s3Key,
        uploadedFileId,
        userId,
        processingAttempt: attempt,
        startSeconds: clip.startSeconds ?? null,
        endSeconds: clip.endSeconds ?? null,
        scriptText: clip.scriptText ?? null,
        youtubeTitle: clip.youtubeTitle ?? null,
        youtubeDescription: clip.youtubeDescription ?? null,
        youtubeHashtags: clip.youtubeHashtags
          ? JSON.stringify(clip.youtubeHashtags)
          : null,
      });
    }
  }

  for (const clipKey of cappedClipKeys) {
    if (createDataByS3Key.has(clipKey)) {
      continue;
    }

    createDataByS3Key.set(clipKey, {
      s3Key: clipKey,
      uploadedFileId,
      userId,
      processingAttempt: attempt,
    });
  }

  await createClipsBulk([...createDataByS3Key.values()]);

  const metadataClips = Array.isArray(backendClips)
    ? backendClips.filter(
        (clip): clip is ProcessVideoBackendClip & { s3Key: string } =>
          typeof clip.s3Key === "string" &&
          clip.s3Key.length > 0 &&
          allowedClipKeys.has(clip.s3Key),
      )
    : [];

  if (metadataClips.length > 0) {
    await updateClipMetadataFromBackendClips({
      uploadedFileId,
      processingAttempt: attempt,
      clips: metadataClips,
    });
  }

  const dbClipCount = await countClipsForAttemptS3Keys(
    uploadedFileId,
    attempt,
    cappedClipKeys,
  );

  return {
    clipsFound: Math.min(dbClipCount, expectedClipCount),
  };
}

async function countGeneratedClipKeys(outputPrefix: string): Promise<number> {
  return (await findAttemptGeneratedClipKeys(outputPrefix)).length;
}

async function promoteRecoverableUploadDrafts(limit = 25): Promise<number> {
  const drafts = await findRawUploadDraftsForPromotion(limit);
  let promoted = 0;

  for (const draft of drafts) {
    try {
      const result = await confirmUploadedFileSourceByIdIfObjectExists(
        draft.id,
      );

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
      const result = await confirmUploadedFileSourceByIdIfObjectExists(
        draft.id,
      );

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

async function cleanupStaleRecoverableUploadDrafts(
  limit = 25,
): Promise<number> {
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

async function recoverStaleProcessingAttempts(limit = 25): Promise<number> {
  const staleBefore = new Date(Date.now() - 2 * 60 * 60 * 1000);
  const staleFiles = await findStaleProcessingUploadedFiles(
    staleBefore,
    limit,
  );
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

async function recoverStaleQueuedDispatches(): Promise<number> {
  const now = new Date();
  const staleBefore = new Date(
    now.getTime() - STALE_QUEUED_DISPATCH_INTERVAL_MS,
  );
  const dispatches = await findStaleQueuedSentProcessingDispatches(staleBefore);
  let recovered = 0;

  for (const dispatch of dispatches) {
    try {
      const userHasProcessingUpload = await hasProcessingUploadForUser(
        dispatch.uploadedFile.userId,
      );

      if (userHasProcessingUpload) {
        continue;
      }

      const shouldDeadLetter =
        dispatch.dispatchCount >= STALE_QUEUED_MAX_DISPATCH_COUNT ||
        now.getTime() - dispatch.createdAt.getTime() >=
          STALE_QUEUED_DISPATCH_DEAD_LETTER_MS;

      const result = shouldDeadLetter
        ? await markStaleQueuedDispatchDeadLetter({
            dispatchId: dispatch.id,
            uploadedFileId: dispatch.uploadedFile.id,
            attempt: dispatch.attempt,
            errorMessage: "queued_worker_not_started",
            now,
          })
        : await markProcessingDispatchRetryableNow({
            dispatchId: dispatch.id,
            uploadedFileId: dispatch.uploadedFile.id,
            attempt: dispatch.attempt,
            errorMessage: "queued_worker_not_started",
            now,
          });

      recovered += result.count;
    } catch (error) {
      console.error("Failed to recover stale queued dispatch", {
        dispatchId: dispatch.id,
        uploadedFileId: dispatch.uploadedFile.id,
        attempt: dispatch.attempt,
        error,
      });
    }
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
    const { uploadedFileId, language, clipCount, attempt, outputPrefix } =
      event.data;

    const context = await step.run("load-processing-context", async () => {
      return findCurrentProcessingAttemptContext(uploadedFileId, attempt);
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
      const result = await startUploadedFileProcessingAttempt(
        uploadedFileId,
        attempt,
        {
          now: new Date(),
        },
      );

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
      let backendFailureMessage: string | null = null;
      let generatedClipsDetected = false;
      let modalCallbackReceived = false;
      let generatedClipCount = 0;
      const shouldWaitForCallback = modalResponse.status === "accepted";

      function applyModalPayload(args: {
        status: unknown;
        error?: unknown;
        clips?: unknown;
        source: "modal-response" | "modal-callback";
      }) {
        modalCallbackReceived = true;

        if (!isSuccessfulModalStatus(args.status)) {
          backendFailureMessage = `Modal ${args.source} reported status "${String(args.status)}": ${toErrorMessage(
            args.error ?? "Unknown modal processing error",
          )}`;
          return;
        }

        backendClips = normalizeBackendClips(args.clips);
      }

      if (shouldWaitForCallback && !callbackUrl) {
        throw new Error(
          "Modal accepted async processing, but NEXT_PUBLIC_SITE_URL is not configured for callbacks",
        );
      }

      if (!shouldWaitForCallback) {
        applyModalPayload({
          status: modalResponse.status,
          error: modalResponse.error,
          clips: modalResponse.clips,
          source: "modal-response",
        });
      }

      for (
        let pollAttempt = 1;
        pollAttempt <= MODAL_RESULT_MAX_POLLS;
        pollAttempt++
      ) {
        if (shouldWaitForCallback && !modalCallbackReceived) {
          const waitStepId =
            pollAttempt === 1
              ? "wait-for-modal-result"
              : `wait-for-modal-result-${pollAttempt}`;

          const modalResult = await step.waitForEvent(waitStepId, {
            event: "modal/video.processed",
            match: "data.matchKey",
            timeout: MODAL_RESULT_POLL_INTERVAL,
          });

          if (modalResult) {
            applyModalPayload({
              status: modalResult.data.status,
              error: modalResult.data.error,
              clips: modalResult.data.clips,
              source: "modal-callback",
            });
          }
        } else if (pollAttempt > 1) {
          await step.sleep(
            `wait-for-generated-clips-${pollAttempt}`,
            MODAL_RESULT_POLL_INTERVAL,
          );
        }

        generatedClipCount = await step.run(
          `check-generated-clips-${pollAttempt}`,
          async () => countGeneratedClipKeys(outputPrefix),
        );

        if (generatedClipCount >= clipCount) {
          if (!modalCallbackReceived) {
            const metadataResult = await step.waitForEvent(
              "wait-for-modal-metadata-after-s3-complete",
              {
                event: "modal/video.processed",
                match: "data.matchKey",
                timeout: MODAL_METADATA_GRACE_INTERVAL,
              },
            );

            if (metadataResult) {
              applyModalPayload({
                status: metadataResult.data.status,
                error: metadataResult.data.error,
                clips: metadataResult.data.clips,
                source: "modal-callback",
              });
            }
          }

          generatedClipsDetected = true;
          break;
        }

        if (backendFailureMessage) {
          break;
        }
      }

      if (!generatedClipsDetected && !backendFailureMessage) {
        console.warn(
          "Timed out before expected generated clips were detected",
          {
            uploadedFileId,
            attempt,
            generatedClipCount,
            expectedClipCount: clipCount,
          },
        );
      }

      const { clipsFound } = await step.run(
        "persist-generated-clips",
        async () => {
          return persistGeneratedClips({
            backendClips,
            outputPrefix,
            uploadedFileId,
            userId: context.userId,
            attempt,
            expectedClipCount: clipCount,
          });
        },
      );

      if (backendFailureMessage && clipsFound >= clipCount) {
        console.warn(
          "Modal reported failure after expected clips were generated",
          backendFailureMessage,
        );
      }

      if (backendFailureMessage && clipsFound === 0) {
        throw new Error(backendFailureMessage);
      }

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

      if (clipsFound < clipCount) {
        await step.run("mark-incomplete-clips-generated", async () => {
          await markUploadedFileAttemptFailed(
            uploadedFileId,
            attempt,
            "incomplete_clips_generated",
            {
              now: new Date(),
              statuses: ["processing"],
            },
          );
        });

        return {
          skipped: false,
          status: "incomplete_clips_generated",
          clipsFound,
          expectedClips: clipCount,
        };
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

export const processingMaintenanceSweep = inngest.createFunction(
  { id: "processing-maintenance-sweep" },
  { cron: "*/15 * * * *" },
  async () => {
    const processingRecovered = await recoverStaleProcessingAttempts(25);
    const queuedRecovered = await recoverStaleQueuedDispatches();
    const dispatched = await dispatchPendingProcessingRequests(25);

    return {
      dispatched,
      processingRecovered,
      queuedRecovered,
    };
  },
);

export const uploadDraftSweep = inngest.createFunction(
  { id: "upload-draft-sweep" },
  { cron: "0 * * * *" },
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
