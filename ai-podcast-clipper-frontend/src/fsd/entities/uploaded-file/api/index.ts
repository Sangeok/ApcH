import "server-only";

import type { Prisma } from "generated/prisma";
import { db } from "~/server/db";
import { objectExists } from "~/fsd/shared/api/s3";
import type { ProcessingStatus } from "../model/processing-status";
import type {
  RecoverableUploadDraftSummary,
  UploadedFileDetail,
  UploadedFileSummary,
  UploadLifecycleState,
} from "../model/types";

type DbClient = Prisma.TransactionClient | typeof db;
type UploadedFileSourceState = {
  status: string;
  uploaded: boolean;
  currentAttempt: number;
  s3Key: string;
};

function getClient(tx?: Prisma.TransactionClient): DbClient {
  return tx ?? db;
}

function toUploadLifecycleState(
  state: Pick<UploadedFileSourceState, "status" | "uploaded" | "currentAttempt">,
): UploadLifecycleState {
  return {
    status: state.status as ProcessingStatus,
    uploaded: state.uploaded,
    currentAttempt: state.currentAttempt,
  };
}

async function findUploadedFileSourceState(
  uploadedFileId: string,
  userId: string,
  options?: { tx?: Prisma.TransactionClient },
): Promise<UploadedFileSourceState> {
  return getClient(options?.tx).uploadedFile.findFirstOrThrow({
    where: { id: uploadedFileId, userId },
    select: {
      status: true,
      uploaded: true,
      currentAttempt: true,
      s3Key: true,
    },
  });
}

async function findUploadedFileSourceStateById(
  uploadedFileId: string,
  options?: { tx?: Prisma.TransactionClient },
): Promise<UploadedFileSourceState | null> {
  return getClient(options?.tx).uploadedFile.findFirst({
    where: { id: uploadedFileId },
    select: {
      status: true,
      uploaded: true,
      currentAttempt: true,
      s3Key: true,
    },
  });
}

function toNonHiddenStatus(status: string): Exclude<ProcessingStatus, "upload_pending"> {
  if (status === "upload_pending") {
    throw new HiddenUploadDraftError();
  }

  return status as Exclude<ProcessingStatus, "upload_pending">;
}

export class HiddenUploadDraftError extends Error {
  constructor() {
    super("Hidden upload draft");
    this.name = "HiddenUploadDraftError";
  }
}

export async function createUploadedFile(
  data: {
    userId: string;
    s3Key: string;
    displayName: string | null;
    language: string;
    targetClipCount: number;
  },
  options?: { tx?: Prisma.TransactionClient },
) {
  return getClient(options?.tx).uploadedFile.create({
    data: {
      ...data,
      uploaded: false,
      status: "upload_pending",
      currentAttempt: 0,
      lastSuccessfulAttempt: 0,
    },
    select: { id: true },
  });
}

export async function listUploadedFileSummariesByUserId(
  userId: string,
): Promise<UploadedFileSummary[]> {
  const files = await db.uploadedFile.findMany({
    where: {
      userId,
      status: {
        not: "upload_pending",
      },
    },
    orderBy: {
      createdAt: "desc",
    },
    select: {
      id: true,
      displayName: true,
      status: true,
      createdAt: true,
      lastSuccessfulAttempt: true,
    },
  });

  const fileIds = files.map((file) => file.id);

  const groupedCounts = fileIds.length
    ? await db.clip.groupBy({
        by: ["uploadedFileId", "processingAttempt"],
        where: {
          uploadedFileId: {
            in: fileIds,
          },
        },
        _count: {
          _all: true,
        },
      })
    : [];

  const countsByAttempt = new Map(
    groupedCounts.map((group) => [
      `${group.uploadedFileId ?? ""}:${group.processingAttempt}`,
      group._count._all,
    ]),
  );

  return files.map((file) => ({
    id: file.id,
    fileName: file.displayName ?? "Untitled",
    status: toNonHiddenStatus(file.status),
    createdAt: file.createdAt,
    visibleClipsCount:
      file.lastSuccessfulAttempt > 0
        ? (countsByAttempt.get(`${file.id}:${file.lastSuccessfulAttempt}`) ?? 0)
        : 0,
  }));
}

export async function listRecoverableUploadDraftsByUserId(
  userId: string,
): Promise<RecoverableUploadDraftSummary[]> {
  const files = await db.uploadedFile.findMany({
    where: {
      userId,
      status: "upload_pending",
      uploaded: true,
    },
    orderBy: {
      sourceUploadedAt: "desc",
    },
    select: {
      id: true,
      displayName: true,
      language: true,
      targetClipCount: true,
      createdAt: true,
      sourceUploadedAt: true,
    },
  });

  return files.map((file) => ({
    id: file.id,
    fileName: file.displayName ?? "Untitled",
    language: file.language,
    targetClipCount: file.targetClipCount,
    createdAt: file.createdAt,
    sourceUploadedAt: file.sourceUploadedAt,
  }));
}

export async function getUploadedFileDetailsById(
  uploadedFileId: string,
  userId: string,
): Promise<UploadedFileDetail> {
  const file = await db.uploadedFile.findFirstOrThrow({
    where: { id: uploadedFileId, userId },
    select: {
      id: true,
      displayName: true,
      createdAt: true,
      status: true,
      language: true,
      targetClipCount: true,
      failureCode: true,
      enqueueRequestedAt: true,
      queuedAt: true,
      processingStartedAt: true,
      terminalStatusAt: true,
      currentAttempt: true,
      lastSuccessfulAttempt: true,
    },
  });

  if (file.status === "upload_pending") {
    throw new HiddenUploadDraftError();
  }

  const clips =
    file.lastSuccessfulAttempt > 0
      ? await db.clip.findMany({
          where: {
            uploadedFileId: file.id,
            processingAttempt: file.lastSuccessfulAttempt,
          },
          orderBy: {
            createdAt: "desc",
          },
        })
      : [];

  return {
    ...file,
    status: toNonHiddenStatus(file.status),
    clips,
  };
}

export async function findUploadedFileS3Key(
  uploadedFileId: string,
  userId: string,
) {
  return db.uploadedFile.findFirstOrThrow({
    where: { id: uploadedFileId, userId },
    select: { s3Key: true },
  });
}

export async function getUploadedFileProcessingRequestState(
  uploadedFileId: string,
  userId: string,
) {
  return findUploadedFileSourceState(uploadedFileId, userId);
}

export async function findUploadedFileForDeletion(
  uploadedFileId: string,
  userId: string,
) {
  return db.uploadedFile.findFirst({
    where: { id: uploadedFileId, userId },
    select: {
      id: true,
      s3Key: true,
      status: true,
      uploaded: true,
    },
  });
}

export async function findUploadedFileForProcessRequest(
  uploadedFileId: string,
  userId: string,
) {
  return db.uploadedFile.findFirstOrThrow({
    where: { id: uploadedFileId, userId },
    select: {
      id: true,
      userId: true,
      s3Key: true,
      status: true,
      uploaded: true,
      currentAttempt: true,
      targetClipCount: true,
      language: true,
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
      currentAttempt: true,
      targetClipCount: true,
    },
  });
}

export async function findUploadedFileProcessingContext(
  uploadedFileId: string,
  attempt: number,
) {
  return db.uploadedFile.findFirst({
    where: {
      id: uploadedFileId,
      currentAttempt: attempt,
    },
    select: {
      userId: true,
      s3Key: true,
      language: true,
      status: true,
      processingStartedAt: true,
      targetClipCount: true,
      user: {
        select: {
          credits: true,
        },
      },
    },
  });
}

async function confirmUploadedFileSourceUnchecked(
  uploadedFileId: string,
  userId: string,
  options?: { tx?: Prisma.TransactionClient; now?: Date },
): Promise<UploadLifecycleState> {
  const now = options?.now ?? new Date();
  const client = getClient(options?.tx);

  await client.uploadedFile.updateMany({
    where: {
      id: uploadedFileId,
      userId,
      status: "upload_pending",
      uploaded: false,
    },
    data: {
      uploaded: true,
      sourceUploadedAt: now,
    },
  });

  const state = await client.uploadedFile.findFirstOrThrow({
    where: { id: uploadedFileId, userId },
    select: {
      status: true,
      uploaded: true,
      currentAttempt: true,
    },
  });

  return {
    status: state.status as ProcessingStatus,
    uploaded: state.uploaded,
    currentAttempt: state.currentAttempt,
  };
}

async function confirmUploadedFileSourceByIdUnchecked(
  uploadedFileId: string,
  options?: { tx?: Prisma.TransactionClient; now?: Date },
) {
  const now = options?.now ?? new Date();

  return getClient(options?.tx).uploadedFile.updateMany({
    where: {
      id: uploadedFileId,
      status: "upload_pending",
      uploaded: false,
    },
    data: {
      uploaded: true,
      sourceUploadedAt: now,
    },
  });
}

export async function confirmUploadedFileSourceIfObjectExists(
  uploadedFileId: string,
  userId: string,
): Promise<
  | { status: "confirmed"; state: UploadLifecycleState }
  | { status: "missing_object"; state: UploadLifecycleState }
> {
  const currentState = await findUploadedFileSourceState(uploadedFileId, userId);

  if (currentState.uploaded) {
    return {
      status: "confirmed",
      state: toUploadLifecycleState(currentState),
    };
  }

  if (!(await objectExists(currentState.s3Key))) {
    return {
      status: "missing_object",
      state: toUploadLifecycleState(currentState),
    };
  }

  const confirmedState = await confirmUploadedFileSourceUnchecked(
    uploadedFileId,
    userId,
  );

  if (!confirmedState.uploaded) {
    throw new Error("Uploaded file source could not be confirmed");
  }

  return {
    status: "confirmed",
    state: confirmedState,
  };
}

export async function confirmUploadedFileSourceByIdIfObjectExists(
  uploadedFileId: string,
): Promise<
  | { status: "confirmed"; confirmedNow: boolean }
  | { status: "missing_object" }
  | { status: "not_found" }
  | { status: "skipped" }
> {
  const currentState = await findUploadedFileSourceStateById(uploadedFileId);

  if (!currentState) {
    return { status: "not_found" };
  }

  if (currentState.uploaded) {
    return { status: "confirmed", confirmedNow: false };
  }

  if (!(await objectExists(currentState.s3Key))) {
    return { status: "missing_object" };
  }

  const result = await confirmUploadedFileSourceByIdUnchecked(uploadedFileId);

  if (result.count === 1) {
    return { status: "confirmed", confirmedNow: true };
  }

  const refreshedState = await findUploadedFileSourceStateById(uploadedFileId);

  if (!refreshedState) {
    return { status: "not_found" };
  }

  if (refreshedState.uploaded) {
    return { status: "confirmed", confirmedNow: false };
  }

  return { status: "skipped" };
}

export async function markUploadedFileQueuedFromDispatch(
  uploadedFileId: string,
  attempt: number,
  options?: { tx?: Prisma.TransactionClient; now?: Date },
) {
  const now = options?.now ?? new Date();

  return getClient(options?.tx).uploadedFile.updateMany({
    where: {
      id: uploadedFileId,
      currentAttempt: attempt,
      status: "pending_enqueue",
    },
    data: {
      status: "queued",
      queuedAt: now,
    },
  });
}

export async function startUploadedFileProcessingAttempt(
  uploadedFileId: string,
  attempt: number,
  options?: { tx?: Prisma.TransactionClient; now?: Date },
) {
  const now = options?.now ?? new Date();

  return getClient(options?.tx).uploadedFile.updateMany({
    where: {
      id: uploadedFileId,
      currentAttempt: attempt,
      status: "queued",
      processingStartedAt: null,
    },
    data: {
      status: "processing",
      processingStartedAt: now,
    },
  });
}

export async function markUploadedFileAttemptProcessed(
  uploadedFileId: string,
  attempt: number,
  options?: { tx?: Prisma.TransactionClient; now?: Date },
) {
  const now = options?.now ?? new Date();

  return getClient(options?.tx).uploadedFile.updateMany({
    where: {
      id: uploadedFileId,
      currentAttempt: attempt,
      status: "processing",
    },
    data: {
      status: "processed",
      terminalStatusAt: now,
      lastSuccessfulAttempt: attempt,
      failureCode: null,
    },
  });
}

export async function markUploadedFileAttemptFailed(
  uploadedFileId: string,
  attempt: number,
  failureCode: string,
  options?: {
    tx?: Prisma.TransactionClient;
    now?: Date;
    statuses?: ProcessingStatus[];
  },
) {
  const now = options?.now ?? new Date();
  const statuses = options?.statuses ?? ["pending_enqueue", "queued", "processing"];

  return getClient(options?.tx).uploadedFile.updateMany({
    where: {
      id: uploadedFileId,
      currentAttempt: attempt,
      status: {
        in: statuses,
      },
    },
    data: {
      status: "failed",
      terminalStatusAt: now,
      failureCode,
    },
  });
}

export async function markUploadedFileAttemptNoCredits(
  uploadedFileId: string,
  attempt: number,
  options?: { tx?: Prisma.TransactionClient; now?: Date },
) {
  const now = options?.now ?? new Date();

  return getClient(options?.tx).uploadedFile.updateMany({
    where: {
      id: uploadedFileId,
      currentAttempt: attempt,
      status: "queued",
    },
    data: {
      status: "no credits",
      terminalStatusAt: now,
      failureCode: null,
    },
  });
}

export async function updateUploadedFileStatus(
  uploadedFileId: string,
  status: ProcessingStatus,
  options?: {
    tx?: Prisma.TransactionClient;
    processingStartedAt?: Date | null;
    queuedAt?: Date | null;
    terminalStatusAt?: Date | null;
    failureCode?: string | null;
  },
) {
  return getClient(options?.tx).uploadedFile.update({
    where: { id: uploadedFileId },
    data: {
      status,
      ...(options?.processingStartedAt !== undefined
        ? { processingStartedAt: options.processingStartedAt }
        : {}),
      ...(options?.queuedAt !== undefined ? { queuedAt: options.queuedAt } : {}),
      ...(options?.terminalStatusAt !== undefined
        ? { terminalStatusAt: options.terminalStatusAt }
        : {}),
      ...(options?.failureCode !== undefined
        ? { failureCode: options.failureCode }
        : {}),
    },
  });
}

export async function updateUploadedFileLanguage(
  uploadedFileId: string,
  userId: string,
  language: string,
  options?: { tx?: Prisma.TransactionClient },
) {
  return getClient(options?.tx).uploadedFile.update({
    where: { id: uploadedFileId },
    data: { language },
  });
}

export async function setUploadedFileUploaded(
  uploadedFileId: string,
  uploaded: boolean,
  options?: { tx?: Prisma.TransactionClient },
) {
  return getClient(options?.tx).uploadedFile.update({
    where: { id: uploadedFileId },
    data: { uploaded },
  });
}

export async function findStaleProcessingUploadedFiles(staleBefore: Date) {
  return db.uploadedFile.findMany({
    where: {
      status: "processing",
      processingStartedAt: {
        lt: staleBefore,
      },
    },
    select: {
      id: true,
      currentAttempt: true,
    },
  });
}

export async function findRawUploadDraftsForPromotion(limit = 50) {
  return db.uploadedFile.findMany({
    where: {
      status: "upload_pending",
      uploaded: false,
    },
    orderBy: {
      createdAt: "asc",
    },
    take: limit,
    select: {
      id: true,
      s3Key: true,
    },
  });
}

export async function findStaleRawUploadDrafts(staleBefore: Date, limit = 50) {
  return db.uploadedFile.findMany({
    where: {
      status: "upload_pending",
      uploaded: false,
      createdAt: {
        lt: staleBefore,
      },
    },
    orderBy: {
      createdAt: "asc",
    },
    take: limit,
    select: {
      id: true,
      s3Key: true,
    },
  });
}

export async function findStaleRecoverableUploadDrafts(
  staleBefore: Date,
  limit = 50,
) {
  return db.uploadedFile.findMany({
    where: {
      status: "upload_pending",
      uploaded: true,
      sourceUploadedAt: {
        lt: staleBefore,
      },
    },
    orderBy: {
      sourceUploadedAt: "asc",
    },
    take: limit,
    select: {
      id: true,
      userId: true,
      s3Key: true,
    },
  });
}

export async function deleteUploadedFileRecord(
  uploadedFileId: string,
  userId: string,
  options?: { tx?: Prisma.TransactionClient },
) {
  const result = await getClient(options?.tx).uploadedFile.deleteMany({
    where: { id: uploadedFileId, userId },
  });

  if (result.count === 0) {
    throw new Error("Uploaded file not found");
  }

  return result;
}

export async function deleteUploadedFileRecordById(
  uploadedFileId: string,
  options?: { tx?: Prisma.TransactionClient },
) {
  return getClient(options?.tx).uploadedFile.delete({
    where: { id: uploadedFileId },
  });
}
