import "server-only";

import type { Prisma } from "generated/prisma";
import { db } from "~/server/db";
import { objectExists } from "~/fsd/shared/api/s3";
import {
  isProcessingStatus,
  type ProcessingStatus,
} from "../model/processing-status";
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
type EnsureUploadedFileQueuedForDispatchResult =
  | { status: "queued" }
  | { status: "already_advanced"; currentStatus: ProcessingStatus }
  | { status: "not_found" }
  | {
      status: "not_queueable";
      currentStatus: string;
      uploaded: boolean;
    };

function getClient(tx?: Prisma.TransactionClient): DbClient {
  return tx ?? db;
}

// Converts DB source state into the public upload lifecycle DTO and validates
// the string status before exposing it as the domain ProcessingStatus type.
function toUploadLifecycleState(
  state: Pick<UploadedFileSourceState, "status" | "uploaded" | "currentAttempt">,
): UploadLifecycleState {
  if (!isProcessingStatus(state.status)) {
    throw new Error(`Invalid uploaded file status: ${state.status}`);
  }

  return {
    status: state.status,
    uploaded: state.uploaded,
    currentAttempt: state.currentAttempt,
  };
}

export async function findUploadedFileSourceState(
  uploadedFileId: string,
  userId: string,
) {
  return db.uploadedFile.findFirstOrThrow({
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

// Converts a DB status into a UI-visible status, rejecting hidden upload drafts.
function toNonHiddenStatus(status: string): Exclude<ProcessingStatus, "upload_pending"> {
  if (!isProcessingStatus(status)) {
    throw new Error(`Invalid uploaded file status: ${status}`);
  }

  if (status === "upload_pending") {
    throw new Error("Hidden upload draft cannot be exposed");
  }

  return status;
}

// Creates a pending upload draft used to track and recover a direct S3 upload.
export async function createUploadDraft(data: {
  userId: string;
  s3Key: string;
  displayName: string | null;
  language: string;
  targetClipCount: number;
}) {
  return db.uploadedFile.create({
    data: {
      ...data,
      uploaded: false,
      status: "upload_pending",
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
): Promise<UploadedFileDetail | null> {
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
    return null;
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

// Loads the current user's uploaded file state needed before scheduling processing.
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

// Loads the DB-backed context for a processing worker, only for the current attempt.
export async function findCurrentProcessingAttemptContext(
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
      status: true,
      user: {
        select: {
          credits: true,
        },
      },
    },
  });
}

// Verifies the source object exists in S3 and marks the upload as uploaded.
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

  const confirmedState = await db.$transaction(async (tx) => {
    const result = await tx.uploadedFile.updateMany({
      where: {
        id: uploadedFileId,
        userId,
        status: "upload_pending",
        uploaded: false,
      },
      data: {
        uploaded: true,
        sourceUploadedAt: new Date(),
      },
    });

    const state = await tx.uploadedFile.findFirstOrThrow({
      where: { id: uploadedFileId, userId },
      select: {
        status: true,
        uploaded: true,
        currentAttempt: true,
      },
    });

    if (result.count !== 1 && !state.uploaded) {
      throw new Error("Uploaded file source could not be confirmed");
    }

    return toUploadLifecycleState(state);
  });

  if (!confirmedState.uploaded) {
    throw new Error("Uploaded file source could not be confirmed");
  }

  return {
    status: "confirmed",
    state: confirmedState,
  };
}

// Background sweep helper that confirms raw upload drafts by id when their S3
// object exists. Re-reads after a missed update so stale cleanup avoids deleting
// drafts that were concurrently confirmed or removed.
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

  const result = await db.uploadedFile.updateMany({
    where: {
      id: uploadedFileId,
      status: "upload_pending",
      uploaded: false,
    },
    data: {
      uploaded: true,
      sourceUploadedAt: new Date(),
    },
  });

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

// Marks a processing attempt as queued after its dispatch row has successfully
// sent the Inngest processing event.
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

export async function ensureUploadedFileQueuedForDispatch(
  uploadedFileId: string,
  attempt: number,
  options?: { tx?: Prisma.TransactionClient; now?: Date },
): Promise<EnsureUploadedFileQueuedForDispatchResult> {
  const now = options?.now ?? new Date();
  const client = getClient(options?.tx);

  const queued = await client.uploadedFile.updateMany({
    where: {
      id: uploadedFileId,
      currentAttempt: attempt,
      status: "pending_enqueue",
      uploaded: true,
    },
    data: {
      status: "queued",
      queuedAt: now,
    },
  });

  if (queued.count === 1) {
    return { status: "queued" };
  }

  const current = await client.uploadedFile.findFirst({
    where: {
      id: uploadedFileId,
      currentAttempt: attempt,
    },
    select: {
      status: true,
      uploaded: true,
    },
  });

  if (!current) {
    return { status: "not_found" };
  }

  if (current.status === "queued" && current.uploaded) {
    return { status: "queued" };
  }

  if (
    current.status === "processing" ||
    current.status === "processed" ||
    current.status === "failed" ||
    current.status === "no credits"
  ) {
    return {
      status: "already_advanced",
      currentStatus: current.status,
    };
  }

  return {
    status: "not_queueable",
    currentStatus: current.status,
    uploaded: current.uploaded,
  };
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

export async function hasProcessingUploadForUser(userId: string): Promise<boolean> {
  const count = await db.uploadedFile.count({
    where: {
      userId,
      status: "processing",
    },
  });

  return count > 0;
}

// Finds upload drafts that are not DB-confirmed yet but may already have their
// source object in S3, so the background sweep can verify and recover them.
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

// Finds old unconfirmed upload drafts that are candidates for cleanup after a
// final S3 existence check.
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
) {
  const result = await db.uploadedFile.deleteMany({
    where: { id: uploadedFileId, userId },
  });

  if (result.count === 0) {
    throw new Error("Uploaded file not found");
  }

  return result;
}

export async function deleteUploadedFileRecordById(uploadedFileId: string) {
  return db.uploadedFile.delete({
    where: { id: uploadedFileId },
  });
}
