import "server-only";
import type { Prisma } from "@repo/db";
import { db } from "~/server/db";
import {
  lockUserForCredits,
  settleUserCredits,
  releaseUserReservedCredits,
} from "~/fsd/entities/user/server";
import {
  lockCreditReservation,
  settleCreditReservation,
  releaseCreditReservation,
} from "~/fsd/entities/credit-reservation/server";
import {
  findProcessingDispatchForAttempt,
  lockProcessingDispatch,
  updateProcessingDispatch,
} from "~/fsd/entities/processing-dispatch/server";
import {
  lockUploadedFileForProcessing,
  markUploadedFileAttemptProcessed,
  markUploadedFileAttemptFailed,
} from "~/fsd/entities/uploaded-file/server";
import {
  createClipsBulk,
  countClipsForAttemptS3Keys,
  updateClipMetadataFromBackendClips,
} from "~/fsd/entities/clip/server";
import { createAssetCleanupJob } from "~/fsd/entities/card-news/server";
import { videoProcessingRuntime } from "./video-runtime-dependencies";
import { resolvePartialClipNoteCode } from "~/fsd/entities/uploaded-file";
import type { UploadedFileFailureCode } from "~/fsd/entities/uploaded-file";
import type { ProcessVideoBackendClip } from "~/inngest/modal-contract";

export async function findAttemptGeneratedClipKeys(
  outputPrefix: string,
): Promise<string[]> {
  return (await videoProcessingRuntime().listObjects(`${outputPrefix}/`))
    .filter(
      (key) => key.startsWith(`${outputPrefix}/clip_`) && key.endsWith(".mp4"),
    )
    .sort();
}

/** Publication, terminal status and credit settlement share one locked transaction. */
export async function settleProcessingAttempt(args: {
  uploadedFileId: string;
  attempt: number;
  userId: string;
  backendClips?: ProcessVideoBackendClip[];
  failureCode?: UploadedFileFailureCode;
  noteCode?: string | null;
  now?: Date;
}): Promise<{ completed: boolean; clipsFound: number }> {
  const hint = await findProcessingDispatchForAttempt(
    args.uploadedFileId,
    args.attempt,
  );
  if (!hint || hint.uploadedFile.userId !== args.userId)
    return { completed: false, clipsFound: 0 };
  const snapshot = hint.inputSnapshot as {
    outputPrefix?: unknown;
    clipCount?: unknown;
  } | null;
  const prefix =
    typeof snapshot?.outputPrefix === "string" ? snapshot.outputPrefix : null;
  const maximum =
    typeof snapshot?.clipCount === "number" &&
    Number.isInteger(snapshot.clipCount)
      ? snapshot.clipCount
      : 0;
  if (!prefix || maximum < 1 || maximum > 4)
    return { completed: false, clipsFound: 0 };
  const discovered =
    hint.reservation?.status === "held"
      ? await findAttemptGeneratedClipKeys(prefix)
      : [];
  const verified = await Promise.all(
    discovered.map(async (key) => {
      const head = await videoProcessingRuntime().headObject(key);
      // GPU upload_file uses S3's application/octet-stream default for existing MP4s.
      return head.contentLength > 0 &&
        ["video/mp4", "application/octet-stream"].includes(
          head.contentType.split(";")[0]!.trim(),
        )
        ? key
        : null;
    }),
  );
  const keys = verified
    .filter((key): key is string => key !== null)
    .slice(0, maximum);
  const now = args.now ?? videoProcessingRuntime().now();
  return db.$transaction(async (tx) => {
    await lockUserForCredits(args.userId, tx);
    await lockUploadedFileForProcessing(args.uploadedFileId, tx);
    await lockProcessingDispatch(hint.id, tx);
    const dispatch = await findProcessingDispatchForAttempt(
      args.uploadedFileId,
      args.attempt,
      tx,
    );
    if (
      !dispatch ||
      dispatch.uploadedFile.deletedAt ||
      dispatch.uploadedFile.currentAttempt !== args.attempt ||
      dispatch.uploadedFile.status !== "processing"
    )
      return { completed: false, clipsFound: 0 };
    const reservation = dispatch.reservation;
    if (dispatch.kind === "analyze") {
      if (!args.failureCode) return { completed: false, clipsFound: 0 };
      const updated = await markUploadedFileAttemptFailed(
        args.uploadedFileId,
        args.attempt,
        args.failureCode,
        { tx, now, statuses: ["processing"] },
      );
      return { completed: updated.count === 1, clipsFound: 0 };
    }
    if (reservation?.status !== "held")
      return { completed: false, clipsFound: 0 };
    await lockCreditReservation(reservation.id, tx);
    const allowed = new Set(keys);
    const metadata = (args.backendClips ?? []).filter(
      (clip) => typeof clip.s3Key === "string" && allowed.has(clip.s3Key),
    );
    const createData: Prisma.ClipCreateManyInput[] = keys.map((s3Key) => ({
      s3Key,
      uploadedFileId: args.uploadedFileId,
      userId: args.userId,
      processingAttempt: args.attempt,
    }));
    await createClipsBulk(createData, { tx });
    await updateClipMetadataFromBackendClips(
      {
        uploadedFileId: args.uploadedFileId,
        processingAttempt: args.attempt,
        clips: metadata,
      },
      { tx },
    );
    const clipsFound = await countClipsForAttemptS3Keys(
      args.uploadedFileId,
      args.attempt,
      keys,
      { tx },
    );
    if (clipsFound > reservation.reservedAmount)
      throw new Error("Video charge exceeds reservation");
    if (clipsFound > 0) {
      await markUploadedFileAttemptProcessed(
        args.uploadedFileId,
        args.attempt,
        {
          tx,
          now,
          noteCode:
            resolvePartialClipNoteCode({
              clipsFound,
              expectedClipCount: maximum,
              backendFailureMessage:
                args.failureCode === "backend_failed" ? "backend_failed" : null,
            }) ?? args.noteCode,
        },
      );
      if (
        !(await settleCreditReservation(reservation.id, clipsFound, tx)) ||
        !(await settleUserCredits(
          args.userId,
          reservation.reservedAmount,
          clipsFound,
          tx,
        ))
      )
        throw new Error("Video settlement lost its locked reservation");
    } else {
      await markUploadedFileAttemptFailed(
        args.uploadedFileId,
        args.attempt,
        args.failureCode ?? "no_clips_generated",
        { tx, now, statuses: ["processing"] },
      );
      if (
        !(await releaseCreditReservation(reservation.id, tx)) ||
        !(await releaseUserReservedCredits(
          args.userId,
          reservation.reservedAmount,
          tx,
        ))
      )
        throw new Error("Video release lost its locked reservation");
    }
    await updateProcessingDispatch(
      dispatch.id,
      { leaseUntil: null, heartbeatAt: now },
      tx,
    );
    await createAssetCleanupJob(
      {
        userId: args.userId,
        kind: "orphan",
        scopeId: dispatch.id,
        scopeSnapshot: { scopeKind: "video-attempt", dispatchId: dispatch.id },
        exactKeys: [],
        dedicatedPrefixes: [`${prefix}/`],
        retainedReferences: keys,
        producerReferences: [
          {
            kind: "video",
            referenceId: dispatch.id,
            modalCallId: dispatch.modalCallId,
            ended:
              dispatch.modalSpawnState === "ended" ||
              dispatch.modalSpawnState === "not_sent",
            producerEndEvidence: dispatch.producerEndEvidence,
          },
        ],
        notBefore: new Date(now.getTime() + 24 * 60 * 60_000),
      },
      tx,
    );
    return { completed: true, clipsFound };
  });
}
