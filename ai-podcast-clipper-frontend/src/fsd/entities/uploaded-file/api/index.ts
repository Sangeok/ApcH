import "server-only";

import { Prisma } from "generated/prisma";
import { inngest } from "~/inngest/client";
import { db } from "~/server/db";
import { decrementUserCreditsFloorZero } from "~/fsd/entities/user";
import { deleteS3Object, objectExists } from "~/fsd/shared/api/s3";
import { getProcessingMatchKey } from "../model/attempt-prefix";
import {
  ACTIVE_PROCESSING_STATUSES,
  isProcessingStatus,
  type ProcessingStatus,
} from "../model/processing-status";
import { PROCESSING_STALE_POLICY } from "../model/stale-policy";
import type {
  ActiveUploadedFileQueueState,
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
type StaleProcessingCandidate = {
  id: string;
  userId: string;
  status: string;
  currentAttempt: number;
  failureCode: string | null;
  enqueueRequestedAt: Date | null;
  queuedAt: Date | null;
  processingStartedAt: Date | null;
};

function getClient(tx?: Prisma.TransactionClient): DbClient {
  return tx ?? db;
}

// Converts DB source state into the public upload lifecycle DTO and validates
// the string status before exposing it as the domain ProcessingStatus type.
function toUploadLifecycleState(
  state: Pick<
    UploadedFileSourceState,
    "status" | "uploaded" | "currentAttempt"
  >,
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

// Converts a DB status into a UI-visible status, rejecting hidden upload drafts.
function toNonHiddenStatus(
  status: string,
): Exclude<ProcessingStatus, "upload_pending"> {
  if (!isProcessingStatus(status)) {
    throw new Error(`Invalid uploaded file status: ${status}`);
  }

  if (status === "upload_pending") {
    throw new Error("Hidden upload draft cannot be exposed");
  }

  return status;
}

function toProcessingStatus(status: string): ProcessingStatus {
  if (!isProcessingStatus(status)) {
    throw new Error(`Invalid uploaded file status: ${status}`);
  }

  return status;
}

function isOlderThan(date: Date | null, threshold: Date): boolean {
  return date !== null && date < threshold;
}

function isActiveProcessingStatusValue(
  status: ProcessingStatus,
): status is (typeof ACTIVE_PROCESSING_STATUSES)[number] {
  return (ACTIVE_PROCESSING_STATUSES as readonly ProcessingStatus[]).includes(
    status,
  );
}

function getStaleFailureCode(
  file: StaleProcessingCandidate,
  now: Date,
  hasProcessingUploadForQueuedState: boolean,
): string | null {
  switch (file.status) {
    case "pending_enqueue": {
      const staleBefore = new Date(
        now.getTime() - PROCESSING_STALE_POLICY.pendingEnqueueTimeoutMs,
      );

      return isOlderThan(file.enqueueRequestedAt, staleBefore)
        ? "dispatch_timeout"
        : null;
    }
    case "queued": {
      if (hasProcessingUploadForQueuedState) {
        return null;
      }

      const staleBefore = new Date(
        now.getTime() - PROCESSING_STALE_POLICY.queuedWorkerStartTimeoutMs,
      );

      return isOlderThan(file.queuedAt, staleBefore)
        ? "queued_worker_not_started"
        : null;
    }
    case "processing": {
      const staleBefore = new Date(
        now.getTime() - PROCESSING_STALE_POLICY.processingTimeoutMs,
      );

      return isOlderThan(file.processingStartedAt, staleBefore)
        ? "worker_timeout"
        : null;
    }
    default:
      return null;
  }
}

async function sendProcessingCancelEventBestEffort(args: {
  uploadedFileId: string;
  attempt: number;
}) {
  try {
    await inngest.send({
      name: "process-video-events/cancel",
      data: {
        uploadedFileId: args.uploadedFileId,
        attempt: args.attempt,
        matchKey: getProcessingMatchKey(args.uploadedFileId, args.attempt),
      },
    });
  } catch (error) {
    console.error("Failed to send processing cancel event", {
      uploadedFileId: args.uploadedFileId,
      attempt: args.attempt,
      error,
    });
  }
}

// Creates a pending upload draft used to track and recover a direct S3 upload.
export async function createUploadDraft(data: {
  userId: string;
  s3Key: string;
  displayName: string | null;
  language: string;
  targetClipCount: number;
  reviewBeforeGenerate: boolean;
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

export async function listActiveUploadedFileQueueStateByUserId(
  userId: string,
  queueLimit = 25,
): Promise<ActiveUploadedFileQueueState> {
  const [activeIdRows, queueFiles] = await Promise.all([
    db.uploadedFile.findMany({
      where: {
        userId,
        status: {
          in: [...ACTIVE_PROCESSING_STATUSES],
        },
      },
      select: {
        id: true,
      },
    }),
    db.uploadedFile.findMany({
      where: {
        userId,
        status: {
          in: [...ACTIVE_PROCESSING_STATUSES],
        },
      },
      orderBy: {
        createdAt: "desc",
      },
      take: queueLimit,
      select: {
        id: true,
        displayName: true,
        status: true,
        createdAt: true,
        lastSuccessfulAttempt: true,
      },
    }),
  ]);

  const activeUploadedFileIds = activeIdRows.map((file) => file.id);
  const activeAttemptPairs = queueFiles
    .filter((file) => file.lastSuccessfulAttempt > 0)
    .map((file) => ({
      uploadedFileId: file.id,
      processingAttempt: file.lastSuccessfulAttempt,
    }));

  const groupedCounts =
    activeAttemptPairs.length > 0
      ? await db.clip.groupBy({
          by: ["uploadedFileId", "processingAttempt"],
          where: {
            OR: activeAttemptPairs,
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

  return {
    activeUploadedFileIds,
    queueFiles: queueFiles.map((file) => ({
      id: file.id,
      fileName: file.displayName ?? "Untitled",
      status: toNonHiddenStatus(file.status),
      createdAt: file.createdAt,
      visibleClipsCount:
        file.lastSuccessfulAttempt > 0
          ? (countsByAttempt.get(`${file.id}:${file.lastSuccessfulAttempt}`) ??
            0)
          : 0,
    })),
  };
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
      reviewBeforeGenerate: true,
      reviewAttempt: true,
      reviewReadyAt: true,
      user: {
        select: {
          credits: true,
        },
      },
    },
  });

  if (file.status === "upload_pending") {
    return null;
  }

  const { user, ...fileData } = file;

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

  const clipDrafts =
    file.reviewAttempt !== null
      ? await db.clipDraft.findMany({
          where: {
            uploadedFileId: file.id,
            attempt: file.reviewAttempt,
          },
          orderBy: { index: "asc" },
        })
      : [];

  return {
    ...fileData,
    status: toNonHiddenStatus(file.status),
    currentUserCredits: user.credits,
    clips,
    clipDrafts,
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
  const currentState = await findUploadedFileSourceState(
    uploadedFileId,
    userId,
  );

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

export type StartProcessingAttemptResult =
  | { status: "started" }
  | { status: "already_processing" }
  | { status: "not_claimable" };

// Atomically claims a queued attempt as processing while enforcing one
// processing run per user. The partial unique index
// "UploadedFile_one_processing_per_user_idx" is the real guarantee; the
// pre-check is a fast path and the P2002 catch closes the SELECT/UPDATE race,
// both resolving to already_processing.
export async function startUploadedFileProcessingAttempt(
  uploadedFileId: string,
  userId: string,
  attempt: number,
  options?: { now?: Date },
): Promise<StartProcessingAttemptResult> {
  const now = options?.now ?? new Date();

  try {
    return await db.$transaction(async (tx) => {
      if (await hasProcessingUploadForUser(userId, { tx })) {
        return { status: "already_processing" };
      }

      const claimed = await tx.uploadedFile.updateMany({
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

      if (claimed.count !== 1) {
        return { status: "not_claimable" };
      }

      return { status: "started" };
    });
  } catch (error) {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2002"
    ) {
      return { status: "already_processing" };
    }

    throw error;
  }
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

// Marks an analysis attempt as awaiting user review. Records which attempt's
// drafts are under review and where the reusable transcript lives.
export async function markUploadedFileAttemptReviewPending(
  uploadedFileId: string,
  attempt: number,
  args: { transcriptS3Key: string | null },
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
      status: "review_pending",
      reviewAttempt: attempt,
      reviewReadyAt: now,
      transcriptS3Key: args.transcriptS3Key,
      failureCode: null,
    },
  });
}

export async function isUploadedFileAttemptStillProcessing(
  uploadedFileId: string,
  attempt: number,
): Promise<boolean> {
  const file = await db.uploadedFile.findFirst({
    where: {
      id: uploadedFileId,
      currentAttempt: attempt,
      status: "processing",
    },
    select: { id: true },
  });

  return file !== null;
}

export async function isUploadedFileAttemptCurrent(
  uploadedFileId: string,
  attempt: number,
): Promise<boolean> {
  const file = await db.uploadedFile.findFirst({
    where: {
      id: uploadedFileId,
      currentAttempt: attempt,
    },
    select: { id: true },
  });

  return file !== null;
}

export async function completeUploadedFileProcessingAttempt(args: {
  uploadedFileId: string;
  attempt: number;
  userId: string;
  clipsFound: number;
  now?: Date;
}): Promise<{ completed: boolean }> {
  return db.$transaction(async (tx) => {
    const updated = await markUploadedFileAttemptProcessed(
      args.uploadedFileId,
      args.attempt,
      {
        tx,
        now: args.now,
      },
    );

    if (updated.count !== 1) {
      return { completed: false };
    }

    await decrementUserCreditsFloorZero(args.userId, args.clipsFound, { tx });
    return { completed: true };
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
  const statuses = options?.statuses ?? [
    "pending_enqueue",
    "queued",
    "processing",
  ];

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
      ...(options?.queuedAt !== undefined
        ? { queuedAt: options.queuedAt }
        : {}),
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

export async function hasProcessingUploadForUser(
  userId: string,
  options?: { tx?: Prisma.TransactionClient },
): Promise<boolean> {
  const count = await getClient(options?.tx).uploadedFile.count({
    where: {
      userId,
      status: "processing",
    },
  });

  return count > 0;
}

export async function reconcileStaleUploadedFileForUser(
  uploadedFileId: string,
  userId: string,
  options?: { now?: Date },
): Promise<{
  changed: boolean;
  status: ProcessingStatus;
  failureCode: string | null;
}> {
  const now = options?.now ?? new Date();
  const file = await db.uploadedFile.findFirst({
    where: { id: uploadedFileId, userId },
    select: {
      id: true,
      userId: true,
      status: true,
      currentAttempt: true,
      failureCode: true,
      enqueueRequestedAt: true,
      queuedAt: true,
      processingStartedAt: true,
    },
  });

  if (!file) {
    throw new Error("Uploaded file not found");
  }

  const status = toProcessingStatus(file.status);

  if (!isActiveProcessingStatusValue(status)) {
    return {
      changed: false,
      status,
      failureCode: file.failureCode,
    };
  }

  const hasProcessingForQueuedState =
    status === "queued" ? await hasProcessingUploadForUser(userId) : false;
  const failureCode = getStaleFailureCode(
    file,
    now,
    hasProcessingForQueuedState,
  );

  if (!failureCode) {
    return {
      changed: false,
      status,
      failureCode: file.failureCode,
    };
  }

  const updated = await markUploadedFileAttemptFailed(
    file.id,
    file.currentAttempt,
    failureCode,
    {
      now,
      statuses: [status],
    },
  );

  if (updated.count === 1 && failureCode === "worker_timeout") {
    await sendProcessingCancelEventBestEffort({
      uploadedFileId: file.id,
      attempt: file.currentAttempt,
    });
  }

  const latest = await db.uploadedFile.findFirstOrThrow({
    where: { id: uploadedFileId, userId },
    select: {
      status: true,
      failureCode: true,
    },
  });

  return {
    changed: updated.count === 1,
    status: toProcessingStatus(latest.status),
    failureCode: latest.failureCode,
  };
}

export async function reconcileStaleUploadedFilesForUser(
  userId: string,
  options?: { now?: Date; limit?: number },
): Promise<{ changedCount: number }> {
  const now = options?.now ?? new Date();
  const limit = options?.limit ?? 50;
  const activeFiles = await db.uploadedFile.findMany({
    where: {
      userId,
      status: {
        in: [...ACTIVE_PROCESSING_STATUSES],
      },
    },
    orderBy: {
      createdAt: "asc",
    },
    take: limit,
    select: {
      id: true,
      userId: true,
      status: true,
      currentAttempt: true,
      failureCode: true,
      enqueueRequestedAt: true,
      queuedAt: true,
      processingStartedAt: true,
    },
  });

  let changedCount = 0;

  for (const file of activeFiles.filter(
    (file) => file.status === "processing",
  )) {
    const failureCode = getStaleFailureCode(file, now, false);

    if (failureCode !== "worker_timeout") {
      continue;
    }

    const updated = await markUploadedFileAttemptFailed(
      file.id,
      file.currentAttempt,
      failureCode,
      {
        now,
        statuses: ["processing"],
      },
    );

    if (updated.count === 1) {
      changedCount += 1;
      await sendProcessingCancelEventBestEffort({
        uploadedFileId: file.id,
        attempt: file.currentAttempt,
      });
    }
  }

  for (const file of activeFiles.filter(
    (file) => file.status === "pending_enqueue",
  )) {
    const failureCode = getStaleFailureCode(file, now, false);

    if (failureCode !== "dispatch_timeout") {
      continue;
    }

    const updated = await markUploadedFileAttemptFailed(
      file.id,
      file.currentAttempt,
      failureCode,
      {
        now,
        statuses: ["pending_enqueue"],
      },
    );

    if (updated.count === 1) {
      changedCount += 1;
    }
  }

  const hasProcessing = await hasProcessingUploadForUser(userId);

  if (!hasProcessing) {
    for (const file of activeFiles.filter((file) => file.status === "queued")) {
      const failureCode = getStaleFailureCode(file, now, false);

      if (failureCode !== "queued_worker_not_started") {
        continue;
      }

      const updated = await markUploadedFileAttemptFailed(
        file.id,
        file.currentAttempt,
        failureCode,
        {
          now,
          statuses: ["queued"],
        },
      );

      if (updated.count === 1) {
        changedCount += 1;
      }
    }
  }

  return { changedCount };
}

export async function reconcileUploadDraftsForUser(
  userId: string,
  options?: { now?: Date; limit?: number },
): Promise<{
  promoted: number;
  deletedRaw: number;
  deletedRecoverable: number;
  skippedDueToErrors: number;
}> {
  const now = options?.now ?? new Date();
  const limit = options?.limit ?? 50;
  const rawStaleBefore = new Date(
    now.getTime() - PROCESSING_STALE_POLICY.rawUploadDraftTtlMs,
  );
  const recoverableStaleBefore = new Date(
    now.getTime() - PROCESSING_STALE_POLICY.recoverableUploadDraftTtlMs,
  );
  const drafts = await db.uploadedFile.findMany({
    where: {
      userId,
      status: "upload_pending",
    },
    orderBy: {
      createdAt: "asc",
    },
    take: limit,
    select: {
      id: true,
      s3Key: true,
      uploaded: true,
      createdAt: true,
      sourceUploadedAt: true,
    },
  });

  let promoted = 0;
  let deletedRaw = 0;
  let deletedRecoverable = 0;
  let skippedDueToErrors = 0;

  for (const draft of drafts) {
    if (!draft.uploaded) {
      let exists: boolean;

      try {
        exists = await objectExists(draft.s3Key);
      } catch (error) {
        skippedDueToErrors += 1;
        console.error("Failed to check upload draft source object", {
          uploadedFileId: draft.id,
          s3Key: draft.s3Key,
          error,
        });
        continue;
      }

      if (exists) {
        const updated = await db.uploadedFile.updateMany({
          where: {
            id: draft.id,
            userId,
            status: "upload_pending",
            uploaded: false,
          },
          data: {
            uploaded: true,
            sourceUploadedAt: now,
          },
        });

        promoted += updated.count;
        continue;
      }

      if (draft.createdAt < rawStaleBefore) {
        const deleted = await db.uploadedFile.deleteMany({
          where: {
            id: draft.id,
            userId,
            status: "upload_pending",
            uploaded: false,
          },
        });

        deletedRaw += deleted.count;
      }

      continue;
    }

    const retentionDate = draft.sourceUploadedAt ?? draft.createdAt;

    if (retentionDate >= recoverableStaleBefore) {
      continue;
    }

    try {
      await deleteS3Object(draft.s3Key);
    } catch (error) {
      skippedDueToErrors += 1;
      console.error("Failed to delete stale recoverable upload draft source", {
        uploadedFileId: draft.id,
        s3Key: draft.s3Key,
        error,
      });
      continue;
    }

    const deleted = await db.uploadedFile.deleteMany({
      where: {
        id: draft.id,
        userId,
        status: "upload_pending",
        uploaded: true,
      },
    });

    deletedRecoverable += deleted.count;
  }

  return {
    promoted,
    deletedRaw,
    deletedRecoverable,
    skippedDueToErrors,
  };
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
