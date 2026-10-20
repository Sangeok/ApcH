import "server-only";
import { db } from "~/server/db";
import { lockUserForCredits } from "~/fsd/entities/user/server";
import { lockUploadedFileForProcessing } from "~/fsd/entities/uploaded-file/server";
import {
  findProcessingDispatchById,
  listProcessingDispatchRecoveryCandidates,
  lockProcessingDispatch,
  updateProcessingDispatch,
} from "~/fsd/entities/processing-dispatch/server";
import { parseProducerStatusResponse } from "~/fsd/entities/card-news/server";
import { videoProcessingRuntime } from "./video-runtime-dependencies";
import { settleProcessingAttempt } from "./settle-processing-attempt";

export async function recordVideoProducerEnd(
  dispatchId: string,
  evidence: { kind: string; observedAt: string },
): Promise<void> {
  const hint = await findProcessingDispatchById(dispatchId);
  if (!hint) return;
  await db.$transaction(async (tx) => {
    await lockUserForCredits(hint.uploadedFile.userId, tx);
    await lockUploadedFileForProcessing(hint.uploadedFileId, tx);
    await lockProcessingDispatch(dispatchId, tx);
    await updateProcessingDispatch(
      dispatchId,
      { modalSpawnState: "ended", producerEndEvidence: evidence },
      tx,
    );
  });
}

/** Global recovery does not require a dashboard visit or the original Inngest run. */
export async function reconcileVideoReservations(): Promise<{
  checked: number;
  settled: number;
}> {
  const now = videoProcessingRuntime().now();
  const candidates = await listProcessingDispatchRecoveryCandidates(20);
  let settled = 0;
  await Promise.all(
    candidates.map(async (dispatch) => {
      let ended =
        dispatch.modalSpawnState === "ended" &&
        dispatch.producerEndEvidence !== null;
      if (!ended && dispatch.modalCallId) {
        try {
          const result = await videoProcessingRuntime().producerStatus({
            schemaVersion: 1,
            kind: "video",
            referenceId: dispatch.id,
            modalCallId: dispatch.modalCallId,
          });
          if (parseProducerStatusResponse(result).status === "ended") {
            ended = true;
            await recordVideoProducerEnd(dispatch.id, {
              kind: "modal-status",
              observedAt: now.toISOString(),
            });
          }
        } catch {
          /* Unknown producer state never authorizes storage deletion. */
        }
      }
      const expired =
        dispatch.deadlineAt !== null && dispatch.deadlineAt <= now;
      if (!ended && !expired) return;
      if (dispatch.uploadedFile.status !== "processing") return;
      const result = await settleProcessingAttempt({
        uploadedFileId: dispatch.uploadedFileId,
        attempt: dispatch.attempt,
        userId: dispatch.uploadedFile.userId,
        failureCode: "worker_timeout",
        now,
      });
      if (result.completed) settled += 1;
    }),
  );
  return { checked: candidates.length, settled };
}
