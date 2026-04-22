import "server-only";

import type { Prisma } from "generated/prisma";
import { db } from "~/server/db";

type DbClient = Prisma.TransactionClient | typeof db;

function getClient(tx?: Prisma.TransactionClient): DbClient {
  return tx ?? db;
}

export async function createClipsBulk(
  data: Prisma.ClipCreateManyInput[],
  options?: { tx?: Prisma.TransactionClient },
) {
  if (data.length === 0) {
    return { count: 0 };
  }

  return getClient(options?.tx).clip.createMany({
    data,
    skipDuplicates: true,
  });
}

export async function findClipById(clipId: string, userId: string) {
  return db.clip.findFirstOrThrow({
    where: {
      id: clipId,
      userId,
    },
    select: {
      id: true,
      s3Key: true,
      processingAttempt: true,
      uploadedFile: {
        select: {
          id: true,
          lastSuccessfulAttempt: true,
        },
      },
    },
  });
}

export async function deleteClipRecord(
  clipId: string,
  options?: { tx?: Prisma.TransactionClient },
) {
  return getClient(options?.tx).clip.delete({
    where: { id: clipId },
  });
}

export async function deleteClipsByUploadedFileId(
  uploadedFileId: string,
  options?: { tx?: Prisma.TransactionClient },
) {
  return getClient(options?.tx).clip.deleteMany({
    where: { uploadedFileId },
  });
}
