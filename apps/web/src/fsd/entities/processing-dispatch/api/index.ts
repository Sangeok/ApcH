import "server-only";

import type { Prisma } from "@repo/db";
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
  },
  options?: { tx?: Prisma.TransactionClient },
) {
  return getClient(options?.tx).processingDispatch.create({
    data: {
      ...data,
      status: DISPATCH_STATUS.pending,
    },
  });
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
