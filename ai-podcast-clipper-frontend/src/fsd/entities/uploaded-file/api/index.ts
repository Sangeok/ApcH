import "server-only";

import type { Prisma } from "generated/prisma";
import { db } from "~/server/db";
import type { ProcessingStatus } from "../model/processing-status";
import type { UploadedFileSummary } from "../model/types";

type DbClient = Prisma.TransactionClient | typeof db;

function getClient(tx?: Prisma.TransactionClient): DbClient {
  return tx ?? db;
}

export async function createUploadedFile(
  data: {
    userId: string;
    s3Key: string;
    displayName: string | null;
    uploaded: boolean;
    language: string;
  },
  options?: { tx?: Prisma.TransactionClient },
) {
  return getClient(options?.tx).uploadedFile.create({
    data,
    select: { id: true },
  });
}

export async function listUploadedFileSummariesByUserId(
  userId: string,
): Promise<UploadedFileSummary[]> {
  const files = await db.uploadedFile.findMany({
    where: {
      userId,
      uploaded: true,
    },
    select: {
      id: true,
      displayName: true,
      status: true,
      createdAt: true,
      _count: {
        select: {
          clips: true,
        },
      },
    },
  });

  return files.map((file) => ({
    id: file.id,
    fileName: file.displayName ?? "Untitled",
    status: file.status as ProcessingStatus,
    clipsCount: file._count.clips,
    createdAt: file.createdAt,
  }));
}

export async function getUploadedFileDetailsById(
  uploadedFileId: string,
  userId: string,
) {
  return db.uploadedFile.findUniqueOrThrow({
    where: { id: uploadedFileId, userId },
    select: {
      id: true,
      displayName: true,
      createdAt: true,
      updatedAt: true,
      status: true,
      language: true,
      clips: {
        orderBy: { createdAt: "desc" },
      },
    },
  });
}

export async function findUploadedFileS3Key(
  uploadedFileId: string,
  userId: string,
) {
  return db.uploadedFile.findUniqueOrThrow({
    where: { id: uploadedFileId, userId },
    select: { s3Key: true },
  });
}

export async function findUploadedFileForDeletion(
  uploadedFileId: string,
  userId: string,
) {
  return db.uploadedFile.findUnique({
    where: { id: uploadedFileId, userId },
    select: { s3Key: true },
  });
}

export async function findUploadedFileForProcessTrigger(
  uploadedFileId: string,
  userId: string,
) {
  return db.uploadedFile.findUniqueOrThrow({
    where: { id: uploadedFileId, userId },
    select: {
      uploaded: true,
      id: true,
      userId: true,
    },
  });
}

export async function findUploadedFileForReprocess(
  uploadedFileId: string,
  userId: string,
) {
  return db.uploadedFile.findFirstOrThrow({
    where: { id: uploadedFileId, userId },
    select: {
      id: true,
      userId: true,
      status: true,
      uploaded: true,
      s3Key: true,
      language: true,
    },
  });
}

export async function findUploadedFileProcessingContext(uploadedFileId: string) {
  const uploadedFile = await db.uploadedFile.findUniqueOrThrow({
    where: { id: uploadedFileId },
    select: {
      user: {
        select: {
          id: true,
          credits: true,
        },
      },
      s3Key: true,
    },
  });

  return {
    userId: uploadedFile.user.id,
    credits: uploadedFile.user.credits,
    s3Key: uploadedFile.s3Key,
  };
}

export async function updateUploadedFileStatus(
  uploadedFileId: string,
  status: ProcessingStatus,
  options?: { tx?: Prisma.TransactionClient },
) {
  return getClient(options?.tx).uploadedFile.update({
    where: { id: uploadedFileId },
    data: { status },
  });
}

export async function updateUploadedFileLanguage(
  uploadedFileId: string,
  userId: string,
  language: string,
  options?: { tx?: Prisma.TransactionClient },
) {
  return getClient(options?.tx).uploadedFile.update({
    where: { id: uploadedFileId, userId },
    data: { language },
  });
}

export async function setUploadedFileUploaded(
  uploadedFileId: string,
  uploaded: boolean,
  options?: { userId?: string; tx?: Prisma.TransactionClient },
) {
  const where = options?.userId
    ? { id: uploadedFileId, userId: options.userId }
    : { id: uploadedFileId };

  return getClient(options?.tx).uploadedFile.update({
    where,
    data: { uploaded },
  });
}

export async function deleteUploadedFileRecord(
  uploadedFileId: string,
  userId: string,
  options?: { tx?: Prisma.TransactionClient },
) {
  return getClient(options?.tx).uploadedFile.delete({
    where: { id: uploadedFileId, userId },
  });
}
