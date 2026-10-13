import "server-only";

import { Prisma } from "@repo/db";
import { db } from "~/server/db";
import {
  createCreditReservation,
  findCreditReservation,
  releaseCreditReservation,
  settleCreditReservation,
} from "~/fsd/entities/credit-reservation/server";
import {
  lockUserForCredits,
  releaseUserReservedCredits,
  reserveUserCredits,
  settleUserCredits,
} from "~/fsd/entities/user/server";
import { lockUploadedFileForProcessing } from "~/fsd/entities/uploaded-file/server";
import { lockClipForCardNews } from "~/fsd/entities/clip/server";
import {
  findCardNewsJob,
  findCardNewsSet,
  lockCardNewsJob,
  lockCardNewsSet,
} from "~/fsd/entities/card-news/server";

export function jsonValue(value: unknown): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
}

export async function cardNewsTransaction<T>(
  operation: (tx: Prisma.TransactionClient) => Promise<T>,
): Promise<T> {
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      return await db.$transaction(operation, {
        maxWait: 10_000,
        timeout: 20_000,
      });
    } catch (error) {
      if (
        attempt === 2 ||
        !(error instanceof Prisma.PrismaClientKnownRequestError) ||
        error.code !== "P2034"
      )
        throw error;
    }
  }
  throw new Error("Unreachable transaction retry");
}

export async function lockCardNewsScope(
  scope: {
    userId: string;
    uploadedFileId: string;
    clipId: string;
    setId?: string;
    jobId?: string;
  },
  tx: Prisma.TransactionClient,
): Promise<void> {
  await lockUserForCredits(scope.userId, tx);
  await lockUploadedFileForProcessing(scope.uploadedFileId, tx);
  await lockClipForCardNews(scope.clipId, tx);
  if (scope.setId) await lockCardNewsSet(scope.setId, tx);
  if (scope.jobId) await lockCardNewsJob(scope.jobId, tx);
}

export async function reserveCardNewsCredit(
  userId: string,
  jobId: string,
  tx: Prisma.TransactionClient,
): Promise<string> {
  if (!(await reserveUserCredits(userId, 1, tx)))
    throw new Error("Insufficient available credits");
  const reservation = await createCreditReservation(
    {
      userId,
      operationKey: `card-news:${jobId}`,
      kind: "card-news",
      reservedAmount: 1,
    },
    tx,
  );
  return reservation.id;
}

export async function settleCardNewsCredit(
  reservationId: string | null,
  tx: Prisma.TransactionClient,
  chargedAmount: 0 | 1,
): Promise<void> {
  if (!reservationId) return;
  const reservation = await findCreditReservation(reservationId, tx);
  if (reservation?.status !== "held") return;
  const changed =
    chargedAmount === 1
      ? await settleCreditReservation(reservationId, 1, tx)
      : await releaseCreditReservation(reservationId, tx);
  if (!changed) return;
  const balanced =
    chargedAmount === 1
      ? await settleUserCredits(
          reservation.userId,
          reservation.reservedAmount,
          1,
          tx,
        )
      : await releaseUserReservedCredits(
          reservation.userId,
          reservation.reservedAmount,
          tx,
        );
  if (!balanced) throw new Error("Reservation balance invariant violated");
}

export async function lockedCardNewsSet(
  setId: string,
  userId: string,
  tx: Prisma.TransactionClient,
) {
  const hint = await findCardNewsSet(setId, tx);
  if (!hint || hint.userId !== userId) throw new Error("Card news not found");
  await lockCardNewsScope(
    { userId, uploadedFileId: hint.uploadedFileId, clipId: hint.clipId, setId },
    tx,
  );
  const current = await findCardNewsSet(setId, tx);
  if (
    !current ||
    current.userId !== userId ||
    current.deletedAt ||
    current.clip.deletedAt ||
    current.clip.uploadedFile?.deletedAt
  )
    throw new Error("Card news not available");
  return current;
}

export async function lockedCardNewsJob(
  jobId: string,
  tx: Prisma.TransactionClient,
) {
  const hint = await findCardNewsJob(jobId, tx);
  if (!hint) throw new Error("Card news job not found");
  await lockCardNewsScope(
    {
      userId: hint.userId,
      uploadedFileId: hint.set.uploadedFileId,
      clipId: hint.set.clipId,
      setId: hint.setId,
      jobId,
    },
    tx,
  );
  const current = await findCardNewsJob(jobId, tx);
  if (!current) throw new Error("Card news job disappeared");
  return current;
}
