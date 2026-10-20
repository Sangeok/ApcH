import "server-only";

import { Prisma } from "@repo/db";
import { db } from "~/server/db";
import type { ProcessingDispatchStatus } from "../model/types";

type DbClient = Prisma.TransactionClient | typeof db;
export type PendingProcessingDispatch = Awaited<
  ReturnType<typeof findPendingProcessingDispatchById>
>;

function getClient(tx?: Prisma.TransactionClient): DbClient {
  return tx ?? db;
}

// DB status 리터럴을 union에 묶는다. 이 상수를 거치지 않으면 `"dead-letter"` 같은
// 오타가 컴파일을 통과하고, findPendingProcessingDispatchById가 회수할 수 없는 행이 남는다.
const DISPATCH_STATUS = {
  pending: "pending",
  sending: "sending",
  sent: "sent",
  deadLetter: "dead_letter",
} as const satisfies Record<string, ProcessingDispatchStatus>;

export async function createProcessingDispatch(
  data: {
    uploadedFileId: string;
    attempt: number;
    kind: "auto" | "analyze" | "render";
    inputSnapshot?: Prisma.InputJsonValue;
  },
  options?: { tx?: Prisma.TransactionClient },
) {
  return getClient(options?.tx).processingDispatch.create({
    data: {
      ...data,
      status: DISPATCH_STATUS.pending,
      modalSpawnState: "not_sent",
    },
  });
}

export async function findProcessingDispatchForAttempt(
  uploadedFileId: string,
  attempt: number,
  tx?: Prisma.TransactionClient,
) {
  return getClient(tx).processingDispatch.findUnique({
    where: { uploadedFileId_attempt: { uploadedFileId, attempt } },
    include: { uploadedFile: true, reservation: true },
  });
}

export async function lockProcessingDispatch(
  id: string,
  tx: Prisma.TransactionClient,
): Promise<void> {
  await tx.$queryRaw`SELECT "id" FROM "ProcessingDispatch" WHERE "id" = ${id} FOR UPDATE`;
}

export async function updateProcessingDispatch(
  id: string,
  data: Prisma.ProcessingDispatchUncheckedUpdateInput,
  tx: Prisma.TransactionClient,
) {
  return tx.processingDispatch.update({ where: { id }, data });
}

export async function listProcessingDispatchRecoveryCandidates(limit = 50) {
  const rows = await db.$queryRaw<{ id: string }[]>`
    SELECT d."id" FROM "ProcessingDispatch" d
    JOIN "UploadedFile" f ON f."id" = d."uploadedFileId"
    LEFT JOIN "CreditReservation" r ON r."id" = d."reservationId"
    WHERE r."status" = 'held' OR (f."status" = 'processing' AND f."currentAttempt" = d."attempt" AND d."kind" = 'analyze')
    ORDER BY d."deadlineAt" ASC NULLS LAST, d."id" ASC LIMIT ${limit}
  `;
  return db.processingDispatch.findMany({
    where: { id: { in: rows.map((row) => row.id) } },
    include: { uploadedFile: true, reservation: true },
    orderBy: [{ deadlineAt: "asc" }, { id: "asc" }],
  });
}

export async function listProcessingDispatchesForUpload(
  uploadedFileId: string,
  tx?: Prisma.TransactionClient,
) {
  return getClient(tx).processingDispatch.findMany({
    where: { uploadedFileId },
    include: { reservation: true },
    orderBy: { id: "asc" },
  });
}

export async function findProcessingDispatchById(
  id: string,
  tx?: Prisma.TransactionClient,
) {
  return getClient(tx).processingDispatch.findUnique({
    where: { id },
    include: { uploadedFile: true, reservation: true },
  });
}

export async function findLegacyProducerDrainState(
  cutoff: Date,
  tx: Prisma.TransactionClient,
) {
  const [activeUploads, pendingDispatches, dispatches] = await Promise.all([
    tx.uploadedFile.count({
      where: { status: { in: ["pending_enqueue", "queued", "processing"] } },
    }),
    tx.processingDispatch.count({
      where: { status: { in: ["pending", "sending"] } },
    }),
    tx.processingDispatch.findMany({
      where: {
        createdAt: { lte: cutoff },
        workerRunId: null,
        reservationId: null,
        inputSnapshot: { equals: Prisma.DbNull },
        modalCallId: null,
        modalSpawnState: { in: ["unknown", "ended"] },
      },
      include: { uploadedFile: true },
      orderBy: { id: "asc" },
    }),
  ]);
  return { activeUploads, pendingDispatches, dispatches };
}

export async function findPendingProcessingDispatchById(dispatchId: string) {
  return db.processingDispatch.findFirst({
    where: {
      id: dispatchId,
      status: DISPATCH_STATUS.pending,
    },
    select: {
      id: true,
      attempt: true,
      kind: true,
      inputSnapshot: true,
      uploadedFile: {
        select: {
          id: true,
          userId: true,
          language: true,
          targetClipCount: true,
          s3Key: true,
          currentAttempt: true,
          uploaded: true,
          reviewAttempt: true,
          transcriptS3Key: true,
        },
      },
    },
  });
}

export async function claimPendingProcessingDispatch(
  dispatchId: string,
  now: Date,
): Promise<boolean> {
  const claimed = await db.processingDispatch.updateMany({
    where: {
      id: dispatchId,
      status: DISPATCH_STATUS.pending,
    },
    data: {
      status: DISPATCH_STATUS.sending,
      lockedAt: now,
      dispatchCount: {
        increment: 1,
      },
    },
  });

  return claimed.count === 1;
}

export async function markProcessingDispatchSent(
  dispatchId: string,
  options?: { tx?: Prisma.TransactionClient; now?: Date },
) {
  const now = options?.now ?? new Date();

  return getClient(options?.tx).processingDispatch.update({
    where: { id: dispatchId },
    data: {
      status: DISPATCH_STATUS.sent,
      dispatchedAt: now,
      lockedAt: null,
      lastError: null,
    },
  });
}

export async function markProcessingDispatchDeadLetter(
  dispatchId: string,
  errorMessage: string,
  options?: { tx?: Prisma.TransactionClient },
) {
  return getClient(options?.tx).processingDispatch.update({
    where: { id: dispatchId },
    data: {
      status: DISPATCH_STATUS.deadLetter,
      lastError: errorMessage,
      lockedAt: null,
      dispatchedAt: null,
    },
  });
}
