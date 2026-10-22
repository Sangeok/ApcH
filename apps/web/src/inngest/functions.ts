import { env } from "~/env";
import {
  resolveModalPollAction,
  resolvePartialClipNoteCode,
} from "~/fsd/entities/uploaded-file";
import {
  claimProcessingAttempt,
  beginProcessingSpawn,
  recordProcessingSpawnResult,
  markProcessingSpawnUnknown,
  resetRejectedProcessingSpawn,
  loadVideoProcessingContext,
} from "~/fsd/features/upload/server";
import {
  settleProcessingAttempt,
  findAttemptGeneratedClipKeys,
} from "~/fsd/features/upload/server";
import { findProcessingDispatchForAttempt } from "~/fsd/entities/processing-dispatch/server";
import {
  isUploadedFileAttemptStillProcessing,
  markUploadedFileAttemptFailed,
  markUploadedFileAttemptReviewPending,
} from "~/fsd/entities/uploaded-file/server";
import { PROCESSING_STALE_POLICY } from "~/fsd/entities/uploaded-file/model/stale-policy";
import { stuckAlertElapsedMinutes } from "~/fsd/entities/uploaded-file/model/stuck-alert";
import { createClipDraftsBulk } from "~/fsd/entities/clip-draft/server";
import { cleanupExpiredAnalyticsEvents } from "~/fsd/entities/analytics-event/server";
import { objectExists } from "~/fsd/shared/api/s3";
import {
  flushReports,
  reportError,
  reportPipelineFailure,
} from "~/fsd/shared/observability";
import { inngest } from "./client";
import type { AnalyzedMoment } from "./client";
import { requestCaptionStyle } from "./caption-style-request";
import { requestVideoFraming } from "./video-framing-request";
import type { CaptionStyle } from "~/fsd/shared/config/constants";
import {
  normalizeBackendClips,
  toModalErrorMessage,
  type ProcessVideoBackendClip,
} from "./modal-contract";

// ⚠️ 이 세 값의 곱/합(≈62m)이 uploaded-file/model/stale-policy.ts의
//    stuckAlertMs(90m) 근거다. 바꾸면 그쪽도 함께 재검토할 것.
const MODAL_RESULT_POLL_INTERVAL = "1m";
const MODAL_RESULT_MAX_POLLS = 60;
const MODAL_METADATA_GRACE_INTERVAL = "2m";

/**
 * `processVideo`·`analyzeVideo` 핸들러의 반환 형태.
 *
 * 이 값들은 Inngest 실행 기록에 그대로 남아 운영 중 무슨 일이 있었는지를
 * 읽는 유일한 근거다. 이전에는 반환 타입 선언 없이 16가지 객체 리터럴이
 * 즉석에서 만들어져, 오타 난 status나 빠진 필드를 컴파일러가 잡지 못했다.
 */
/** Modal이 HTTP 응답으로 거절했다 — 응답이 왔으니 spawn은 일어나지 않았다(FEAT-63). */
class ModalDispatchRejectedError extends Error {}

/**
 * send-to-modal이 실패한 뒤의 spawn 상태. 거절(응답 있음)은 not_sent로 되돌려 step 재시도가 다시 POST하게
 * 하고(예약 도입 전 동작), 타임아웃·네트워크 오류는 Modal이 이미 받았을 수 있어 unknown으로 둔다 — 재시도해도
 * POST하지 않고 콜백을 기다린다.
 */
async function recordFailedProcessingSpawn(
  error: unknown,
  owner: { uploadedFileId: string; attempt: number; workerRunId: string },
): Promise<void> {
  if (error instanceof ModalDispatchRejectedError)
    await resetRejectedProcessingSpawn(owner);
  else await markProcessingSpawnUnknown(owner);
}
type ProcessingSkipReason = "already_processing" | "attempt_no_longer_active";

/** 시도가 실제로 진행된 뒤의 종료 상태. */
type ProcessingRunEndStatus =
  | "processed"
  | "review_pending"
  | "no credits"
  | "missing_source_object"
  | "backend_failed"
  | "callback_timeout"
  | "no_clips_generated"
  | "analysis_source_failed"
  | "analysis_timeout"
  | "no_moments_found";

type ProcessingRunResult =
  | { skipped: true; status?: ProcessingSkipReason }
  | {
      skipped: false;
      status: ProcessingRunEndStatus;
      error?: string;
      draftCount?: number;
    };

function toErrorMessage(error: unknown): string {
  return toModalErrorMessage(error, "Unexpected backend failure");
}

function isSuccessfulModalStatus(status: unknown): boolean {
  if (typeof status !== "string") {
    return false;
  }

  return ["ok", "success", "completed", "done"].includes(
    status.trim().toLowerCase(),
  );
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
  async ({ event, step, runId }): Promise<ProcessingRunResult> => {
    const { uploadedFileId, attempt } = event.data;
    const context = await step.run("load-processing-context", () =>
      loadVideoProcessingContext(uploadedFileId, attempt),
    );
    if (!context || !["queued", "processing"].includes(context.status))
      return { skipped: true };
    if (!["auto", "render"].includes(context.mode)) return { skipped: true };
    const { language, clipCount, outputPrefix, moments, transcriptS3Key } =
      context;

    const sourceCheck = await step.run(
      "check-source-object-exists",
      async () => {
        try {
          return {
            status: "checked" as const,
            exists: await objectExists(context.s3Key),
          };
        } catch (error) {
          reportError(error, {
            origin: "processVideo.checkSourceObject",
            uploadedFileId,
            attempt,
            s3Key: context.s3Key,
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

    const claimResult = await step.run("claim-processing-attempt", () =>
      claimProcessingAttempt({
        uploadedFileId,
        userId: context.userId,
        attempt,
        workerRunId: runId,
      }),
    );
    if (claimResult.status === "no_credits")
      return { skipped: false, status: "no credits" };

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

    await step.sendEvent("schedule-stuck-watch", {
      name: "processing/attempt.claimed",
      data: {
        uploadedFileId,
        attempt,
        matchKey: event.data.matchKey,
        claimedAt: new Date().toISOString(),
      },
    });

    try {
      const callbackUrl = env.NEXT_PUBLIC_SITE_URL
        ? `${env.NEXT_PUBLIC_SITE_URL}/api/webhooks/modal`
        : undefined;

      const modalResponse = await step.run("send-to-modal", async () => {
        if (
          !(await beginProcessingSpawn({
            uploadedFileId,
            attempt,
            workerRunId: runId,
          }))
        ) {
          const existing = await findProcessingDispatchForAttempt(
            uploadedFileId,
            attempt,
          );
          return {
            status: "accepted",
            call_id: existing?.modalCallId ?? null,
          } as Record<string, unknown>;
        }
        try {
          // Render dispatch는 항상 비어 있지 않은 moments를 싣는다(디스패처가 빈 선택을
          // 가드). auto/analyze 이벤트에는 moments 필드 자체가 없다.
          const shouldRenderSelectedMoments =
            moments !== undefined && moments.length > 0;

          const response = await fetch(env.PROCESS_VIDEO_ENDPOINT, {
            method: "POST",
            signal: AbortSignal.timeout(30_000),
            body: JSON.stringify({
              uploaded_file_id: uploadedFileId,
              s3_key: context.s3Key,
              attempt,
              language,
              clip_count: clipCount,
              mode: shouldRenderSelectedMoments ? "render" : "auto",
              moments: shouldRenderSelectedMoments ? moments : undefined,
              // JSON.stringify가 undefined 키를 떨어뜨리므로 null 스냅샷에선 키가 생략된다(render·auto 공통).
              caption_style: requestCaptionStyle(
                context.captionStyle as CaptionStyle | null, // 업로드 시점 스냅샷(UploadedFile.captionStyle)
              ),
              ...requestVideoFraming(context.videoPaddingPercent),
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
            throw new ModalDispatchRejectedError(
              `Modal dispatch failed (${response.status}): ${text.slice(0, 500)}`,
            );
          }

          const result = (await response.json()) as Record<string, unknown>;
          return result;
        } catch (error) {
          await recordFailedProcessingSpawn(error, {
            uploadedFileId,
            attempt,
            workerRunId: runId,
          });
          throw error;
        }
      });
      if (modalResponse.status !== "accepted" || modalResponse.call_id) {
        await step.run("record-send-to-modal-result", () =>
          recordProcessingSpawnResult({
            uploadedFileId,
            attempt,
            workerRunId: runId,
            response: modalResponse,
          }),
        );
      }

      let backendClips: ProcessVideoBackendClip[] | undefined;
      let backendFailureMessage: string | null = null;
      let generatedClipsDetected = false;
      let modalCallbackReceived = false;
      let generatedClipCount = 0;
      const shouldWaitForCallback = modalResponse.status === "accepted";

      // 이름이 말하는 대로 "적용"만 하지 않고 바깥 루프 변수 셋을 다시 쓴다.
      // 그 값들이 resolveModalPollAction과 종료 분기를 결정하므로 이름에 드러낸다.
      function recordModalPayloadIntoAttemptState(args: {
        status: unknown;
        error?: unknown;
        clips?: unknown;
        source: "modal-response" | "modal-callback";
      }) {
        modalCallbackReceived = true;

        // 성공·실패와 무관하게 부분 완성된 클립 메타데이터를 살린다.
        // 이 함수는 콜백당 1회만 호출되므로(backendClips 초기값 undefined)
        // 성공 경로 동작은 이전과 동일하고, 실패 상태에서만 backendClips가 새로 채워진다.
        // 실패 판정은 아래 backendFailureMessage로 그대로 유지된다.
        backendClips = normalizeBackendClips(args.clips);

        if (!isSuccessfulModalStatus(args.status)) {
          backendFailureMessage = `Modal ${args.source} reported status "${String(args.status)}": ${toErrorMessage(
            args.error ?? "Unknown modal processing error",
          )}`;
        }
      }

      if (shouldWaitForCallback && !callbackUrl) {
        throw new Error(
          "Modal accepted async processing, but NEXT_PUBLIC_SITE_URL is not configured for callbacks",
        );
      }

      if (!shouldWaitForCallback) {
        recordModalPayloadIntoAttemptState({
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
            recordModalPayloadIntoAttemptState({
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

        const pollAction = resolveModalPollAction({
          generatedClipCount,
          clipCount,
          modalCallbackReceived,
          hasBackendFailure: backendFailureMessage !== null,
          backendClipCount: backendClips?.length ?? null,
        });

        if (pollAction === "detected") {
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
              recordModalPayloadIntoAttemptState({
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

        if (pollAction === "settle") {
          const promisedClipCount = backendClips?.length ?? 0;

          await step.sleep(
            "wait-for-partial-clips-settle",
            MODAL_METADATA_GRACE_INTERVAL,
          );

          generatedClipCount = await step.run(
            "recount-generated-clips-after-settle",
            async () => countGeneratedClipKeys(outputPrefix),
          );

          if (generatedClipCount < promisedClipCount) {
            console.warn("Modal reported more clips than S3 exposed", {
              uploadedFileId,
              attempt,
              generatedClipCount,
              promisedClipCount,
              expectedClipCount: clipCount,
            });
          }

          generatedClipsDetected = true;
          break;
        }

        if (pollAction === "failed") {
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

      const completion = await step.run("settle-processing-attempt", () =>
        settleProcessingAttempt({
          uploadedFileId,
          attempt,
          userId: context.userId,
          backendClips,
          failureCode: backendFailureMessage
            ? "backend_failed"
            : shouldWaitForCallback && !modalCallbackReceived
              ? "callback_timeout"
              : "no_clips_generated",
          noteCode: resolvePartialClipNoteCode({
            clipsFound: generatedClipCount,
            expectedClipCount: clipCount,
            backendFailureMessage,
          }),
        }),
      );
      if (!completion.completed)
        return { skipped: true, status: "attempt_no_longer_active" };
      if (completion.clipsFound === 0)
        return {
          skipped: false,
          status: backendFailureMessage
            ? "backend_failed"
            : "no_clips_generated",
        };

      return { skipped: false, status: "processed" };
    } catch (error) {
      await step.run("settle-backend-failed", () =>
        settleProcessingAttempt({
          uploadedFileId,
          attempt,
          userId: context.userId,
          failureCode: "backend_failed",
        }),
      );

      throw error;
    }
  },
);

// ⚠️ uploaded-file/model/stale-policy.ts의 stuckAlertMs(90m) 근거 중 하나.
//    바꾸면 그쪽도 함께 재검토할 것.
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
  async ({ event, step, runId }): Promise<ProcessingRunResult> => {
    const { uploadedFileId, attempt } = event.data;
    const context = await step.run("load-processing-context", () =>
      loadVideoProcessingContext(uploadedFileId, attempt),
    );
    if (!context || !["queued", "processing"].includes(context.status))
      return { skipped: true };
    if (context.mode !== "analyze") return { skipped: true };
    const { language, clipCount, outputPrefix } = context;

    const sourceCheck = await step.run(
      "check-source-object-exists",
      async () => {
        try {
          return {
            status: "checked" as const,
            exists: await objectExists(context.s3Key),
          };
        } catch (error) {
          reportError(error, {
            origin: "analyzeVideo.checkSourceObject",
            uploadedFileId,
            attempt,
            s3Key: context.s3Key,
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
    const claimResult = await step.run("claim-processing-attempt", () =>
      claimProcessingAttempt({
        uploadedFileId,
        userId: context.userId,
        attempt,
        workerRunId: runId,
      }),
    );
    if (claimResult.status === "no_credits")
      return { skipped: false, status: "no credits" };

    if (claimResult.status !== "started") {
      // 이전에는 status를 `: undefined`로 접어 두 결과가 한 리터럴에 섞였다.
      // 실행 기록에서 둘을 구분해 읽을 수 있도록 분기를 드러낸다.
      if (claimResult.status === "already_processing") {
        return { skipped: true, status: "already_processing" };
      }

      return { skipped: true };
    }

    await step.sendEvent("schedule-stuck-watch", {
      name: "processing/attempt.claimed",
      data: {
        uploadedFileId,
        attempt,
        matchKey: event.data.matchKey,
        claimedAt: new Date().toISOString(),
      },
    });

    try {
      const callbackUrl = env.NEXT_PUBLIC_SITE_URL
        ? `${env.NEXT_PUBLIC_SITE_URL}/api/webhooks/modal`
        : undefined;

      const modalResponse = await step.run(
        "send-analyze-to-modal",
        async () => {
          if (
            !(await beginProcessingSpawn({
              uploadedFileId,
              attempt,
              workerRunId: runId,
            }))
          ) {
            const existing = await findProcessingDispatchForAttempt(
              uploadedFileId,
              attempt,
            );
            return {
              status: "accepted",
              call_id: existing?.modalCallId ?? null,
            } as Record<string, unknown>;
          }
          try {
            const response = await fetch(env.PROCESS_VIDEO_ENDPOINT, {
              method: "POST",
              signal: AbortSignal.timeout(30_000),
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
              throw new ModalDispatchRejectedError(
                `Modal analyze dispatch failed (${response.status}): ${text.slice(0, 500)}`,
              );
            }

            const result = (await response.json()) as Record<string, unknown>;
            return result;
          } catch (error) {
            await recordFailedProcessingSpawn(error, {
              uploadedFileId,
              attempt,
              workerRunId: runId,
            });
            throw error;
          }
        },
      );
      if (modalResponse.status !== "accepted" || modalResponse.call_id) {
        await step.run("record-send-analyze-to-modal-result", () =>
          recordProcessingSpawnResult({
            uploadedFileId,
            attempt,
            workerRunId: runId,
            response: modalResponse,
          }),
        );
      }

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
        (
          moment,
        ): moment is AnalyzedMomentPayload & {
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
            // Korean analyze 참고 번역(FEAT-46). moment에 없으면 컬럼 null.
            referenceTranslation: moment.referenceTranslation ?? null,
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

export const watchProcessingAttempt = inngest.createFunction(
  {
    id: "watch-processing-attempt",
    retries: 1,
    // reconcile이 정체를 강제 실패시키며 보내는 취소 이벤트로 자는 감시자도 함께 끝낸다.
    // processVideo·analyzeVideo와 동일한 matchKey 매칭이라 계약이 일치한다.
    cancelOn: [
      {
        event: "process-video-events/cancel",
        match: "data.matchKey",
      },
    ],
  },
  // ⚠️ concurrency를 두지 않는다. processVideo·analyzeVideo는 account/userId 스코프
  //    limit 1을 갖는데(functions.ts:298·:762), 자는 감시자가 그 슬롯을 점유하면
  //    유저의 다음 처리 런이 최대 stuckAlertMs 동안 막힌다.
  { event: "processing/attempt.claimed" },
  async ({ event, step }) => {
    const { uploadedFileId, attempt, claimedAt } = event.data;

    await step.sleep(
      "wait-for-stuck-threshold",
      PROCESSING_STALE_POLICY.stuckAlertMs,
    );

    // step 경계는 JSON 직렬화를 거치므로 Date를 그대로 반환하지 않는다.
    // 경과 계산까지 step 안에서 끝내고 원시 값만 넘긴다.
    // still-processing이면 처리 함수가 stuckAlertMs가 지나도록 상태를 못 바꿨다는 뜻이다.
    const check = await step.run("check-attempt-still-processing", async () => {
      const stillProcessing = await isUploadedFileAttemptStillProcessing(
        uploadedFileId,
        attempt,
      );
      return {
        stillProcessing,
        elapsedMinutes: stuckAlertElapsedMinutes(claimedAt, new Date()),
      };
    });

    if (!check.stillProcessing) {
      return { alerted: false };
    }

    reportPipelineFailure({
      kind: "stuck-processing",
      uploadedFileId,
      processingStartedAt: claimedAt,
      elapsedMinutes: check.elapsedMinutes,
    });

    await flushReports();

    return { alerted: true };
  },
);
