import "server-only";
import type { Prisma } from "@repo/db";
import { z } from "zod";
import { db } from "~/server/db";
import {
  lockUserForCredits,
  reserveUserCredits,
  getUserCreditBalance,
} from "~/fsd/entities/user/server";
import {
  createCreditReservation,
  findCreditReservationByOperationKey,
} from "~/fsd/entities/credit-reservation/server";
import {
  findProcessingDispatchForAttempt,
  lockProcessingDispatch,
  updateProcessingDispatch,
} from "~/fsd/entities/processing-dispatch/server";
import {
  findCurrentProcessingAttemptContext,
  lockUploadedFileForProcessing,
  startUploadedFileProcessingAttempt,
  markUploadedFileAttemptNoCredits,
} from "~/fsd/entities/uploaded-file/server";
import { videoProcessingRuntime } from "./video-runtime-dependencies";

const snapshotSchema = z.object({
  clipCount: z.number().int().min(1).max(4),
  language: z.enum(["English", "Korean"]),
  outputPrefix: z.string().min(1),
  mode: z.enum(["auto", "analyze", "render"]),
  moments: z
    .array(
      z.object({
        index: z.number().int(),
        start: z.number().finite().nonnegative(),
        end: z.number().finite().positive(),
        type: z.string().nullable().optional(),
        hook: z.string().nullable().optional(),
        payoff: z.string().nullable().optional(),
      }),
    )
    .optional(),
  transcriptS3Key: z.string().nullable().optional(),
});

export function parseVideoProcessingSnapshot(
  value: unknown,
): z.infer<typeof snapshotSchema> {
  return snapshotSchema.parse(value);
}

export async function loadVideoProcessingContext(
  uploadedFileId: string,
  attempt: number,
) {
  const [context, dispatch] = await Promise.all([
    findCurrentProcessingAttemptContext(uploadedFileId, attempt),
    findProcessingDispatchForAttempt(uploadedFileId, attempt),
  ]);
  if (!context || !dispatch || dispatch.uploadedFile.deletedAt) return null;
  // Legacy runs must be drained before cutover. Never invent a paid input from an untrusted event.
  const parsed = snapshotSchema.safeParse(dispatch.inputSnapshot);
  if (!parsed.success || parsed.data.mode !== dispatch.kind) return null;
  return { ...context, ...parsed.data, dispatchId: dispatch.id };
}

export async function claimProcessingAttempt(args: {
  uploadedFileId: string;
  userId: string;
  attempt: number;
  workerRunId: string;
  now?: Date;
}): Promise<{
  status: "started" | "already_processing" | "not_claimable" | "no_credits";
}> {
  const now = args.now ?? videoProcessingRuntime().now();
  return db.$transaction(async (tx) => {
    await lockUserForCredits(args.userId, tx);
    await lockUploadedFileForProcessing(args.uploadedFileId, tx);
    const dispatch = await findProcessingDispatchForAttempt(
      args.uploadedFileId,
      args.attempt,
      tx,
    );
    if (
      !dispatch ||
      dispatch.uploadedFile.userId !== args.userId ||
      dispatch.uploadedFile.currentAttempt !== args.attempt ||
      dispatch.uploadedFile.deletedAt
    )
      return { status: "not_claimable" };
    await lockProcessingDispatch(dispatch.id, tx);
    const snapshot = snapshotSchema.parse(dispatch.inputSnapshot);
    if (snapshot.mode !== dispatch.kind) return { status: "not_claimable" };
    if (dispatch.uploadedFile.status === "processing") {
      return {
        status:
          dispatch.workerRunId === args.workerRunId &&
          (dispatch.kind === "analyze" ||
            dispatch.reservation?.status === "held")
            ? "started"
            : "already_processing",
      };
    }
    if (!videoProcessingRuntime().workerStartEnabled())
      return { status: "not_claimable" };
    const balance = await getUserCreditBalance(args.userId, { tx });
    const needed = dispatch.kind === "analyze" ? 1 : snapshot.clipCount;
    if (!balance || balance.available < needed) {
      await markUploadedFileAttemptNoCredits(
        args.uploadedFileId,
        args.attempt,
        { tx, now },
      );
      return { status: "no_credits" };
    }
    const claimed = await startUploadedFileProcessingAttempt(
      args.uploadedFileId,
      args.userId,
      args.attempt,
      { tx, now },
    );
    if (claimed.status !== "started") return claimed;
    let reservationId: string | null = null;
    if (dispatch.kind !== "analyze") {
      const operationKey = `video:${args.uploadedFileId}:${args.attempt}`;
      if (await findCreditReservationByOperationKey(operationKey, tx))
        throw new Error("Terminal video reservation cannot be reopened");
      if (!(await reserveUserCredits(args.userId, snapshot.clipCount, tx)))
        throw new Error("Video reservation lost its locked balance");
      const reservation = await createCreditReservation(
        {
          userId: args.userId,
          operationKey,
          kind: "video",
          reservedAmount: snapshot.clipCount,
        },
        tx,
      );
      reservationId = reservation.id;
    }
    await updateProcessingDispatch(
      dispatch.id,
      {
        reservationId,
        workerRunId: args.workerRunId,
        claimedAt: now,
        heartbeatAt: now,
        leaseUntil: new Date(now.getTime() + 120_000),
        deadlineAt: new Date(now.getTime() + 65 * 60_000),
      },
      tx,
    );
    return { status: "started" };
  });
}

export async function beginProcessingSpawn(args: {
  uploadedFileId: string;
  attempt: number;
  workerRunId: string;
}): Promise<boolean> {
  const hint = await findProcessingDispatchForAttempt(
    args.uploadedFileId,
    args.attempt,
  );
  if (!hint) return false;
  return db.$transaction(async (tx) => {
    await lockUserForCredits(hint.uploadedFile.userId, tx);
    await lockUploadedFileForProcessing(args.uploadedFileId, tx);
    await lockProcessingDispatch(hint.id, tx);
    const current = await findProcessingDispatchForAttempt(
      args.uploadedFileId,
      args.attempt,
      tx,
    );
    if (
      !current ||
      current.uploadedFile.deletedAt ||
      current.uploadedFile.currentAttempt !== args.attempt ||
      current.uploadedFile.status !== "processing" ||
      current.workerRunId !== args.workerRunId ||
      current.modalSpawnState !== "not_sent"
    )
      return false;
    await updateProcessingDispatch(
      current.id,
      { modalSpawnState: "sending", heartbeatAt: new Date() },
      tx,
    );
    return true;
  });
}

export async function recordProcessingSpawnResult(args: {
  uploadedFileId: string;
  attempt: number;
  workerRunId: string;
  response: Record<string, unknown>;
}): Promise<void> {
  const hint = await findProcessingDispatchForAttempt(
    args.uploadedFileId,
    args.attempt,
  );
  if (!hint) throw new Error("Processing dispatch missing");
  const callId =
    typeof args.response.call_id === "string" &&
    /^fc-[a-zA-Z0-9_-]+$/.test(args.response.call_id)
      ? args.response.call_id
      : null;
  if (args.response.status === "accepted" && !callId)
    throw new Error("Accepted Modal response has no valid call ID");
  if (
    !callId &&
    !["success", "failed", "completed", "ok"].includes(
      String(args.response.status),
    )
  )
    throw new Error("Unrecognized synchronous producer result");
  await db.$transaction(async (tx) => {
    await lockUserForCredits(hint.uploadedFile.userId, tx);
    await lockUploadedFileForProcessing(args.uploadedFileId, tx);
    await lockProcessingDispatch(hint.id, tx);
    const current = await findProcessingDispatchForAttempt(
      args.uploadedFileId,
      args.attempt,
      tx,
    );
    if (!current || current.workerRunId !== args.workerRunId) return;
    if (current.modalCallId && current.modalCallId !== callId)
      throw new Error("Conflicting producer call ID");
    await updateProcessingDispatch(
      current.id,
      callId
        ? { modalCallId: callId, modalSpawnState: "accepted" }
        : {
            modalSpawnState: "ended",
            producerEndEvidence: {
              kind: "synchronous-response",
              confirmedAt: new Date().toISOString(),
            } as Prisma.InputJsonValue,
          },
      tx,
    );
  });
}

type ProcessingSpawnOwner = {
  uploadedFileId: string;
  attempt: number;
  workerRunId: string;
};

async function leaveSendingProcessingSpawn(
  args: ProcessingSpawnOwner,
  modalSpawnState: "unknown" | "not_sent",
): Promise<void> {
  const hint = await findProcessingDispatchForAttempt(
    args.uploadedFileId,
    args.attempt,
  );
  if (!hint) return;
  await db.$transaction(async (tx) => {
    await lockUserForCredits(hint.uploadedFile.userId, tx);
    await lockUploadedFileForProcessing(args.uploadedFileId, tx);
    await lockProcessingDispatch(hint.id, tx);
    const current = await findProcessingDispatchForAttempt(
      args.uploadedFileId,
      args.attempt,
      tx,
    );
    if (
      current?.workerRunId === args.workerRunId &&
      current.modalSpawnState === "sending"
    )
      await updateProcessingDispatch(current.id, { modalSpawnState }, tx);
  });
}

/** The POST may have reached Modal (timeout, network error): never POST again for this attempt. */
export async function markProcessingSpawnUnknown(
  args: ProcessingSpawnOwner,
): Promise<void> {
  await leaveSendingProcessingSpawn(args, "unknown");
}

/** Modal answered with a non-2xx response, so nothing was spawned: the step retry may POST again. */
export async function resetRejectedProcessingSpawn(
  args: ProcessingSpawnOwner,
): Promise<void> {
  await leaveSendingProcessingSpawn(args, "not_sent");
}
