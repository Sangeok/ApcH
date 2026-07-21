import type { Prisma } from "generated/prisma";
import { env } from "~/env";
import {
  countClipsForAttemptS3Keys,
  createClipsBulk,
  updateClipMetadataFromBackendClips,
} from "~/fsd/entities/clip";
import {
  completeUploadedFileProcessingAttempt,
  findCurrentProcessingAttemptContext,
  isUploadedFileAttemptStillProcessing,
  markUploadedFileAttemptFailed,
  markUploadedFileAttemptNoCredits,
  markUploadedFileAttemptReviewPending,
  startUploadedFileProcessingAttempt,
} from "~/fsd/entities/uploaded-file";
import { createClipDraftsBulk } from "~/fsd/entities/clip-draft";
import { cleanupExpiredAnalyticsEvents } from "~/fsd/entities/analytics-event";
import { listS3Objects, objectExists } from "~/fsd/shared/api/s3";
import { inngest } from "./client";
import type { AnalyzedMoment } from "./client";

const MODAL_RESULT_POLL_INTERVAL = "1m";
const MODAL_RESULT_MAX_POLLS = 60;
const MODAL_METADATA_GRACE_INTERVAL = "2m";

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
    // analyzeVideo와 동일한 account 스코프 키로 "유저당 1개 실행"을 두 함수에 걸쳐 보장.
    // 함수 스코프로 두면 analyzeVideo와 별도 큐가 되어 직렬화가 깨진다.
    concurrency: [
      {
        scope: "account",
        key: "event.data.userId",
        limit: 1,
      },
    ],
  },
  async ({ event, step }) => {
    const {
      uploadedFileId,
      language,
      clipCount,
      attempt,
      outputPrefix,
      moments,
      transcriptS3Key,
    } = event.data;

    const context = await step.run("load-processing-context", async () => {
      return findCurrentProcessingAttemptContext(uploadedFileId, attempt);
    });

    if (context?.status !== "queued") {
      return { skipped: true };
    }

    const sourceCheck = await step.run(
      "check-source-object-exists",
      async () => {
        try {
          return {
            status: "checked" as const,
            exists: await objectExists(context.s3Key),
          };
        } catch (error) {
          console.error("Failed to check source object before processing", {
            uploadedFileId,
            attempt,
            s3Key: context.s3Key,
            error,
          });

          return {
            status: "error" as const,
            errorMessage: toErrorMessage(error),
          };
        }
      },
    );

    if (sourceCheck.status === "error") {
      await step.run("mark-source-check-failed", async () => {
        await markUploadedFileAttemptFailed(
          uploadedFileId,
          attempt,
          "backend_failed",
          {
            now: new Date(),
            statuses: ["queued"],
          },
        );
      });

      return {
        skipped: false,
        status: "backend_failed",
        error: sourceCheck.errorMessage,
      };
    }

    if (!sourceCheck.exists) {
      await step.run("mark-missing-source-object", async () => {
        await markUploadedFileAttemptFailed(
          uploadedFileId,
          attempt,
          "missing_source_object",
          {
            now: new Date(),
            statuses: ["queued"],
          },
        );
      });

      return { skipped: false, status: "missing_source_object" };
    }

    if (context.user.credits < clipCount) {
      await step.run("mark-no-credits", async () => {
        await markUploadedFileAttemptNoCredits(uploadedFileId, attempt, {
          now: new Date(),
        });
      });

      return { skipped: false, status: "no credits" };
    }

    const claimResult = await step.run("claim-processing-attempt", async () => {
      return startUploadedFileProcessingAttempt(
        uploadedFileId,
        context.userId,
        attempt,
        {
          now: new Date(),
        },
      );
    });

    if (claimResult.status === "already_processing") {
      console.warn(
        "Skipping processing: user already has an active processing run",
        {
          uploadedFileId,
          attempt,
          userId: context.userId,
        },
      );

      return { skipped: true, status: "already_processing" };
    }

    if (claimResult.status !== "started") {
      return { skipped: true };
    }

    try {
      const callbackUrl = env.NEXT_PUBLIC_SITE_URL
        ? `${env.NEXT_PUBLIC_SITE_URL}/api/webhooks/modal`
        : undefined;

      const modalResponse = await step.run("send-to-modal", async () => {
        // Render dispatch는 항상 비어 있지 않은 moments를 싣는다(디스패처가 빈 선택을
        // 가드). auto/analyze 이벤트에는 moments 필드 자체가 없다.
        const shouldRenderSelectedMoments =
          moments !== undefined && moments.length > 0;

        const response = await fetch(env.PROCESS_VIDEO_ENDPOINT, {
          method: "POST",
          body: JSON.stringify({
            uploaded_file_id: uploadedFileId,
            s3_key: context.s3Key,
            attempt,
            language,
            clip_count: clipCount,
            mode: shouldRenderSelectedMoments ? "render" : "auto",
            moments: shouldRenderSelectedMoments ? moments : undefined,
            transcript_s3_key: transcriptS3Key ?? undefined,
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

      const stillProcessing = await step.run(
        "check-attempt-still-processing",
        async () => {
          return isUploadedFileAttemptStillProcessing(uploadedFileId, attempt);
        },
      );

      if (!stillProcessing) {
        return { skipped: true, status: "attempt_no_longer_active" };
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

      const callbackTimedOutWithoutOutputs =
        shouldWaitForCallback &&
        !modalCallbackReceived &&
        !generatedClipsDetected &&
        generatedClipCount < clipCount;

      if (callbackTimedOutWithoutOutputs && clipsFound === 0) {
        await step.run("mark-callback-timeout", async () => {
          await markUploadedFileAttemptFailed(
            uploadedFileId,
            attempt,
            "callback_timeout",
            {
              now: new Date(),
              statuses: ["processing"],
            },
          );
        });

        return { skipped: false, status: "callback_timeout" };
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

      const completion = await step.run(
        "complete-processing-attempt",
        async () => {
          return completeUploadedFileProcessingAttempt({
            uploadedFileId,
            attempt,
            userId: context.userId,
            clipsFound,
            now: new Date(),
          });
        },
      );

      if (!completion.completed) {
        return { skipped: true, status: "attempt_no_longer_active" };
      }

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

const ANALYSIS_RESULT_TIMEOUT = "60m";

// 동기(로컬 개발) 경로의 미신뢰 wire 형태. 비동기 경로는 이벤트 스키마가
// AnalyzedMoment를 보장하지만 두 경로를 한 변수로 다루기 위해 Partial로 통일한다.
// canonical 형태는 src/inngest/client.ts의 AnalyzedMoment 하나다.
type AnalyzedMomentPayload = Partial<AnalyzedMoment>;

export const analyzeVideo = inngest.createFunction(
  {
    id: "analyze-video",
    retries: 1,
    cancelOn: [
      {
        event: "process-video-events/cancel",
        match: "data.matchKey",
      },
    ],
  },
  {
    event: "analyze-video-events",
    // processVideo와 반드시 동일한 account 스코프 concurrency 키를 공유한다.
    // 함수 레벨 concurrency는 함수 ID별 독립 큐라, 함수 스코프로 두면 두 함수가 서로
    // 직렬화되지 않아 유저의 analyze/render가 동시에 돌다 DB 클레임 레이스로 한쪽이 stranded된다.
    concurrency: [
      {
        scope: "account",
        key: "event.data.userId",
        limit: 1,
      },
    ],
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

    const sourceCheck = await step.run(
      "check-source-object-exists",
      async () => {
        try {
          return {
            status: "checked" as const,
            exists: await objectExists(context.s3Key),
          };
        } catch (error) {
          console.error("Failed to check source object before analysis", {
            uploadedFileId,
            attempt,
            s3Key: context.s3Key,
            error,
          });

          return {
            status: "error" as const,
            errorMessage: toErrorMessage(error),
          };
        }
      },
    );

    if (sourceCheck.status === "error" || !sourceCheck.exists) {
      await step.run("mark-analysis-source-failed", async () => {
        await markUploadedFileAttemptFailed(
          uploadedFileId,
          attempt,
          sourceCheck.status === "error"
            ? "backend_failed"
            : "missing_source_object",
          {
            now: new Date(),
            statuses: ["queued"],
          },
        );
      });

      return { skipped: false, status: "analysis_source_failed" };
    }

    // 분석 자체는 크레딧을 차감하지 않지만, 잔여 크레딧이 없는 사용자의
    // GPU 사용을 막기 위해 최소 1 크레딧을 요구한다.
    if (context.user.credits < 1) {
      await step.run("mark-no-credits", async () => {
        await markUploadedFileAttemptNoCredits(uploadedFileId, attempt, {
          now: new Date(),
        });
      });

      return { skipped: false, status: "no credits" };
    }

    const claimResult = await step.run("claim-processing-attempt", async () => {
      return startUploadedFileProcessingAttempt(
        uploadedFileId,
        context.userId,
        attempt,
        {
          now: new Date(),
        },
      );
    });

    if (claimResult.status !== "started") {
      return {
        skipped: true,
        status:
          claimResult.status === "already_processing"
            ? "already_processing"
            : undefined,
      };
    }

    try {
      const callbackUrl = env.NEXT_PUBLIC_SITE_URL
        ? `${env.NEXT_PUBLIC_SITE_URL}/api/webhooks/modal`
        : undefined;

      const modalResponse = await step.run("send-analyze-to-modal", async () => {
        const response = await fetch(env.PROCESS_VIDEO_ENDPOINT, {
          method: "POST",
          body: JSON.stringify({
            uploaded_file_id: uploadedFileId,
            s3_key: context.s3Key,
            attempt,
            language,
            clip_count: clipCount,
            mode: "analyze",
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
            `Modal analyze dispatch failed (${response.status}): ${text.slice(0, 500)}`,
          );
        }

        return (await response.json()) as Record<string, unknown>;
      });

      const shouldWaitForCallback = modalResponse.status === "accepted";

      if (shouldWaitForCallback && !callbackUrl) {
        throw new Error(
          "Modal accepted async analysis, but NEXT_PUBLIC_SITE_URL is not configured for callbacks",
        );
      }

      let analysisStatus: unknown;
      let analysisError: unknown;
      let analyzedMoments: AnalyzedMomentPayload[] = [];
      let transcriptS3Key: string | null = null;

      if (shouldWaitForCallback) {
        const analysisResult = await step.waitForEvent(
          "wait-for-analysis-result",
          {
            event: "modal/video.analyzed",
            match: "data.matchKey",
            timeout: ANALYSIS_RESULT_TIMEOUT,
          },
        );

        if (!analysisResult) {
          await step.run("mark-analysis-timeout", async () => {
            await markUploadedFileAttemptFailed(
              uploadedFileId,
              attempt,
              "analysis_timeout",
              {
                now: new Date(),
                statuses: ["processing"],
              },
            );
          });

          return { skipped: false, status: "analysis_timeout" };
        }

        analysisStatus = analysisResult.data.status;
        analysisError = analysisResult.data.error;
        analyzedMoments = analysisResult.data.moments ?? [];
        transcriptS3Key = analysisResult.data.transcriptS3Key ?? null;
      } else {
        // 동기 모드 (로컬 개발): 응답 본문이 곧 분석 결과다.
        analysisStatus = modalResponse.status;
        analysisError = modalResponse.error;
        analyzedMoments = Array.isArray(modalResponse.moments)
          ? (modalResponse.moments as AnalyzedMomentPayload[])
          : [];
        transcriptS3Key =
          typeof modalResponse.transcript_s3_key === "string"
            ? modalResponse.transcript_s3_key
            : null;
      }

      if (!isSuccessfulModalStatus(analysisStatus)) {
        throw new Error(
          `Modal analysis reported status "${String(analysisStatus)}": ${toErrorMessage(
            analysisError ?? "Unknown analysis error",
          )}`,
        );
      }

      const validMoments = analyzedMoments.filter(
        (moment): moment is AnalyzedMomentPayload & {
          startSeconds: number;
          endSeconds: number;
        } =>
          typeof moment.startSeconds === "number" &&
          typeof moment.endSeconds === "number",
      );

      if (validMoments.length === 0) {
        await step.run("mark-no-moments-found", async () => {
          await markUploadedFileAttemptFailed(
            uploadedFileId,
            attempt,
            "no_moments_found",
            {
              now: new Date(),
              statuses: ["processing"],
            },
          );
        });

        return { skipped: false, status: "no_moments_found" };
      }

      await step.run("persist-clip-drafts", async () => {
        await createClipDraftsBulk(
          validMoments.map((moment, order) => ({
            uploadedFileId,
            attempt,
            index: moment.index ?? order,
            aiStartSeconds: moment.startSeconds,
            aiEndSeconds: moment.endSeconds,
            startSeconds: moment.startSeconds,
            endSeconds: moment.endSeconds,
            clipType: moment.clipType ?? null,
            hook: moment.hook ?? null,
            payoff: moment.payoff ?? null,
            // 상위 clipCount개만 기본 선택 (Gemini 랭킹 순)
            selected: order < clipCount,
          })),
        );
      });

      const marked = await step.run("mark-review-pending", async () => {
        return markUploadedFileAttemptReviewPending(
          uploadedFileId,
          attempt,
          { transcriptS3Key },
          { now: new Date() },
        );
      });

      if (marked.count !== 1) {
        return { skipped: true, status: "attempt_no_longer_active" };
      }

      return {
        skipped: false,
        status: "review_pending",
        draftCount: validMoments.length,
      };
    } catch (error) {
      await step.run("mark-analysis-failed", async () => {
        await markUploadedFileAttemptFailed(
          uploadedFileId,
          attempt,
          "analysis_failed",
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

export const cleanupAnalyticsEvents = inngest.createFunction(
  {
    id: "cleanup-analytics-events",
  },
  {
    cron: "0 3 * * *",
  },
  async ({ step }) => {
    const result = await step.run("delete-expired-analytics-events", () =>
      cleanupExpiredAnalyticsEvents(),
    );

    return {
      deleted: result.count,
    };
  },
);
