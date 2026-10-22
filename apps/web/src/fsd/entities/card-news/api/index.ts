import "server-only";
import type {
  AssetCleanupJob,
  CardNewsInvocation,
  CardNewsJob,
  CardNewsSet,
  Prisma,
} from "@repo/db";
import { db } from "~/server/db";
import {
  parseCardNewsDraft,
  parseCardNewsSource,
  splitSourceSentences,
} from "../model/contract";
import type {
  CardNewsDetail,
  CardNewsJobSummary,
  CardNewsSummary,
} from "../model/types";

const setInclude = {
  jobs: {
    orderBy: { createdAt: "desc" as const },
    include: { invocations: true },
  },
  clip: { include: { uploadedFile: true } },
} satisfies Prisma.CardNewsSetInclude;
const jobInclude = {
  set: { include: setInclude },
  reservation: true,
  invocations: true,
} satisfies Prisma.CardNewsJobInclude;
export type CardNewsSetRecord = Prisma.CardNewsSetGetPayload<{
  include: typeof setInclude;
}>;
export type CardNewsJobRecord = Prisma.CardNewsJobGetPayload<{
  include: typeof jobInclude;
}>;

export async function findCardNewsSet(
  id: string,
  tx?: Prisma.TransactionClient,
): Promise<CardNewsSetRecord | null> {
  return (tx ?? db).cardNewsSet.findUnique({
    where: { id },
    include: setInclude,
  });
}
export async function findCardNewsJob(
  id: string,
  tx?: Prisma.TransactionClient,
): Promise<CardNewsJobRecord | null> {
  return (tx ?? db).cardNewsJob.findUnique({
    where: { id },
    include: jobInclude,
  });
}
export async function findCardNewsJobByRequest(
  userId: string,
  requestId: string,
  tx?: Prisma.TransactionClient,
): Promise<CardNewsJobRecord | null> {
  return (tx ?? db).cardNewsJob.findUnique({
    where: { userId_requestId: { userId, requestId } },
    include: jobInclude,
  });
}
export async function lockCardNewsSet(
  id: string,
  tx: Prisma.TransactionClient,
): Promise<CardNewsSetRecord | null> {
  await tx.$queryRaw`SELECT "id" FROM "CardNewsSet" WHERE "id" = ${id} FOR UPDATE`;
  return findCardNewsSet(id, tx);
}
export async function lockCardNewsJob(
  id: string,
  tx: Prisma.TransactionClient,
): Promise<CardNewsJobRecord | null> {
  await tx.$queryRaw`SELECT "id" FROM "CardNewsJob" WHERE "id" = ${id} FOR UPDATE`;
  return findCardNewsJob(id, tx);
}
export async function createCardNewsSet(
  data: Prisma.CardNewsSetUncheckedCreateInput,
  tx: Prisma.TransactionClient,
): Promise<CardNewsSet> {
  return tx.cardNewsSet.create({ data });
}
export async function createCardNewsJob(
  data: Prisma.CardNewsJobUncheckedCreateInput,
  tx: Prisma.TransactionClient,
): Promise<CardNewsJob> {
  return tx.cardNewsJob.create({ data });
}
export async function updateCardNewsSet(
  id: string,
  data: Prisma.CardNewsSetUncheckedUpdateInput,
  tx: Prisma.TransactionClient,
): Promise<CardNewsSet> {
  return tx.cardNewsSet.update({ where: { id }, data });
}
export async function updateCardNewsJob(
  id: string,
  data: Prisma.CardNewsJobUncheckedUpdateInput,
  tx: Prisma.TransactionClient,
): Promise<CardNewsJob> {
  return tx.cardNewsJob.update({ where: { id }, data });
}
export async function compareAndSetCardNewsJob(
  where: Prisma.CardNewsJobWhereInput,
  data: Prisma.CardNewsJobUncheckedUpdateManyInput,
  tx: Prisma.TransactionClient,
): Promise<boolean> {
  return (await tx.cardNewsJob.updateMany({ where, data })).count === 1;
}
export async function listCardNewsSets(
  userId: string,
  tx?: Prisma.TransactionClient,
): Promise<CardNewsSetRecord[]> {
  return (tx ?? db).cardNewsSet.findMany({
    where: { userId },
    include: setInclude,
    orderBy: { createdAt: "desc" },
  });
}
export async function listActiveCardNewsJobs(
  userId: string,
  tx?: Prisma.TransactionClient,
): Promise<CardNewsJobRecord[]> {
  return (tx ?? db).cardNewsJob.findMany({
    where: { userId, status: { in: ["pending", "running"] } },
    include: jobInclude,
    orderBy: { id: "asc" },
  });
}
export async function findCardNewsSetsForParent(
  userId: string,
  parent: { clipId?: string; uploadedFileId?: string },
  tx?: Prisma.TransactionClient,
): Promise<CardNewsSetRecord[]> {
  if (!parent.clipId && !parent.uploadedFileId)
    throw new Error("A parent deletion scope is required");
  return (tx ?? db).cardNewsSet.findMany({
    where: { userId, ...parent },
    include: setInclude,
    orderBy: { id: "asc" },
  });
}
export async function findActiveCardNewsJobsForSets(
  setIds: string[],
  tx: Prisma.TransactionClient,
): Promise<CardNewsJob[]> {
  return tx.cardNewsJob.findMany({
    where: { setId: { in: setIds }, status: { in: ["pending", "running"] } },
    orderBy: { id: "asc" },
  });
}
export async function markCardNewsSetsDeleting(
  setIds: string[],
  tx: Prisma.TransactionClient,
): Promise<number> {
  return (
    await tx.cardNewsSet.updateMany({
      where: { id: { in: setIds } },
      data: { status: "deleting", deletedAt: new Date() },
    })
  ).count;
}
export async function listRecoverableCardNewsJobs(
  now: Date,
  limit = 100,
): Promise<CardNewsJobRecord[]> {
  return db.cardNewsJob.findMany({
    where: {
      status: { in: ["pending", "running"] },
      OR: [
        { nextDispatchAt: null },
        { nextDispatchAt: { lte: now } },
        { deadlineAt: { lte: now } },
      ],
    },
    include: jobInclude,
    orderBy: [{ deadlineAt: "asc" }, { id: "asc" }],
    take: limit,
  });
}
export async function listPendingCardNewsAnalyticsJobs(
  limit = 100,
): Promise<CardNewsJobRecord[]> {
  return db.cardNewsJob.findMany({
    where: { NOT: { pendingAnalytics: { equals: [] } } },
    include: jobInclude,
    orderBy: { updatedAt: "asc" },
    take: limit,
  });
}
export async function listCardNewsJobsForSet(
  setId: string,
  tx?: Prisma.TransactionClient,
): Promise<CardNewsJobRecord[]> {
  return (tx ?? db).cardNewsJob.findMany({
    where: { setId },
    include: jobInclude,
    orderBy: [{ inputRevision: "desc" }, { createdAt: "desc" }],
  });
}
export async function findReusableCardNewsRender(
  setId: string,
  inputRevision: number,
  templateVersion: string,
  tx?: Prisma.TransactionClient,
): Promise<CardNewsJobRecord | null> {
  return (tx ?? db).cardNewsJob.findFirst({
    where: {
      setId,
      inputRevision,
      templateVersion,
      kind: "render",
      status: { in: ["pending", "running", "completed"] },
      outputRetiredAt: null,
    },
    include: jobInclude,
    orderBy: { createdAt: "desc" },
  });
}
export async function findCardNewsInvocation(
  jobId: string,
  executionEpoch: number,
  invocationId: string,
  tx?: Prisma.TransactionClient,
): Promise<CardNewsInvocation | null> {
  return (tx ?? db).cardNewsInvocation.findUnique({
    where: {
      jobId_executionEpoch_invocationId: {
        jobId,
        executionEpoch,
        invocationId,
      },
    },
  });
}
export async function findCardNewsInvocationById(
  id: string,
  tx?: Prisma.TransactionClient,
): Promise<CardNewsInvocation | null> {
  return (tx ?? db).cardNewsInvocation.findUnique({ where: { id } });
}
export async function createCardNewsInvocation(
  data: Prisma.CardNewsInvocationUncheckedCreateInput,
  tx: Prisma.TransactionClient,
): Promise<CardNewsInvocation> {
  return tx.cardNewsInvocation.create({ data });
}
export async function updateCardNewsInvocation(
  id: string,
  data: Prisma.CardNewsInvocationUncheckedUpdateInput,
  tx: Prisma.TransactionClient,
): Promise<CardNewsInvocation> {
  return tx.cardNewsInvocation.update({ where: { id }, data });
}
export async function listCardNewsInvocations(
  jobId: string,
  tx?: Prisma.TransactionClient,
): Promise<CardNewsInvocation[]> {
  return (tx ?? db).cardNewsInvocation.findMany({
    where: { jobId },
    orderBy: { invocationId: "asc" },
  });
}
export async function createAssetCleanupJob(
  data: Prisma.AssetCleanupJobUncheckedCreateInput,
  tx: Prisma.TransactionClient,
): Promise<AssetCleanupJob> {
  return tx.assetCleanupJob.create({ data });
}
export async function findAssetCleanupJob(
  id: string,
  tx?: Prisma.TransactionClient,
): Promise<AssetCleanupJob | null> {
  return (tx ?? db).assetCleanupJob.findUnique({ where: { id } });
}
export async function updateAssetCleanupJob(
  id: string,
  data: Prisma.AssetCleanupJobUncheckedUpdateInput,
  tx: Prisma.TransactionClient,
): Promise<AssetCleanupJob> {
  return tx.assetCleanupJob.update({ where: { id }, data });
}
export async function lockAssetCleanupJob(
  id: string,
  tx: Prisma.TransactionClient,
): Promise<AssetCleanupJob | null> {
  await tx.$queryRaw`SELECT "id" FROM "AssetCleanupJob" WHERE "id" = ${id} FOR UPDATE`;
  return findAssetCleanupJob(id, tx);
}
export async function listAssetCleanupJobs(
  now: Date,
  limit = 100,
): Promise<AssetCleanupJob[]> {
  return db.assetCleanupJob.findMany({
    where: {
      status: { not: "completed" },
      notBefore: { lte: now },
      AND: [
        { OR: [{ nextRetryAt: null }, { nextRetryAt: { lte: now } }] },
        { OR: [{ leaseUntil: null }, { leaseUntil: { lte: now } }] },
      ],
    },
    // A producer can remain unknown indefinitely. Retried rows move behind
    // untouched due rows so one blocked batch cannot starve later cleanups.
    orderBy: [{ updatedAt: "asc" }, { id: "asc" }],
    take: limit,
  });
}
export async function findAssetCleanupJobsForScope(
  userId: string,
  kind: string,
  scopeId: string,
  tx?: Prisma.TransactionClient,
): Promise<AssetCleanupJob[]> {
  return (tx ?? db).assetCleanupJob.findMany({
    where: { userId, kind, scopeId },
    orderBy: { createdAt: "desc" },
  });
}
/** Deletions the user started that are still in progress. Completed and internal orphan/retention jobs stay hidden. */
export async function listUserAssetCleanupJobs(
  userId: string,
  limit = 20,
): Promise<AssetCleanupJob[]> {
  return db.assetCleanupJob.findMany({
    where: {
      userId,
      kind: { in: ["set", "clip", "uploaded-file"] },
      status: { not: "completed" },
    },
    orderBy: { createdAt: "desc" },
    take: limit,
  });
}
export async function completeContainedAssetCleanupJobs(
  input: {
    userId: string;
    setIds: string[];
    jobIds: string[];
    dispatchIds: string[];
    exceptId: string;
  },
  tx: Prisma.TransactionClient,
): Promise<number> {
  // Only the caller's final, verified parent cleanup may retire exact contained
  // scopes. A broader parent prefix or another owner's records cannot match.
  const producers = [...new Set([...input.jobIds, ...input.dispatchIds])];
  return (
    await tx.assetCleanupJob.updateMany({
      where: {
        userId: input.userId,
        id: { not: input.exceptId },
        status: { not: "completed" },
        OR: [
          { kind: "set", scopeId: { in: input.setIds } },
          { kind: { in: ["orphan", "retention"] }, scopeId: { in: producers } },
        ],
      },
      data: {
        status: "completed",
        completedAt: new Date(),
        leaseUntil: null,
        nextRetryAt: null,
        failedKeys: [],
        lastError: null,
      },
    })
  ).count;
}
export async function claimAssetCleanupJob(
  id: string,
  now: Date,
  leaseUntil: Date,
  tx: Prisma.TransactionClient,
): Promise<boolean> {
  return (
    (
      await tx.assetCleanupJob.updateMany({
        where: {
          id,
          status: { not: "completed" },
          notBefore: { lte: now },
          OR: [{ leaseUntil: null }, { leaseUntil: { lte: now } }],
        },
        data: { status: "running", leaseUntil, attemptCount: { increment: 1 } },
      })
    ).count === 1
  );
}
export async function deleteCardNewsSetsAfterCleanup(
  setIds: string[],
  tx: Prisma.TransactionClient,
): Promise<number> {
  const active = await findActiveCardNewsJobsForSets(setIds, tx);
  if (active.length)
    throw new Error("Active card-news jobs prevent cleanup finalization");
  const held = await tx.cardNewsJob.count({
    where: { setId: { in: setIds }, reservation: { status: "held" } },
  });
  if (held)
    throw new Error("Held card-news reservations prevent cleanup finalization");
  return (
    await tx.cardNewsSet.deleteMany({
      where: { id: { in: setIds }, deletedAt: { not: null } },
    })
  ).count;
}

export function toCardNewsJobSummary(job: CardNewsJob): CardNewsJobSummary {
  if (
    !["generate", "render"].includes(job.kind) ||
    !["pending", "running", "completed", "failed", "superseded"].includes(
      job.status,
    ) ||
    ![
      "accepted",
      "generating-text",
      "extracting-cover",
      "rendering",
      "packaging",
      "completed",
      "failed",
    ].includes(job.stage)
  ) {
    throw new Error("Invalid stored card-news job state");
  }
  return {
    id: job.id,
    kind: job.kind as CardNewsJobSummary["kind"],
    revision: job.inputRevision,
    status: job.status as CardNewsJobSummary["status"],
    stage: job.stage as CardNewsJobSummary["stage"],
    failureCode: job.failureCode,
    createdAt: job.createdAt.toISOString(),
  };
}
export function toCardNewsSummary(set: CardNewsSetRecord): CardNewsSummary {
  if (
    !["generating", "ready", "failed", "deleting"].includes(set.status) ||
    !["English", "Korean"].includes(set.language)
  ) {
    throw new Error("Invalid stored card-news set state");
  }
  const draft =
    set.draftDocument === null ? null : parseCardNewsDraft(set.draftDocument);
  const active = set.jobs.find(
    (job) => job.status === "pending" || job.status === "running",
  );
  return {
    id: set.id,
    clipId: set.clipId,
    uploadedFileId: set.uploadedFileId,
    language: set.language as CardNewsSummary["language"],
    status: set.status as CardNewsSummary["status"],
    draftRevision: set.draftRevision,
    publishedRevision: set.publishedRevision,
    cardCount: draft?.cards.length ?? 0,
    activeJob: active ? toCardNewsJobSummary(active) : null,
    createdAt: set.createdAt.toISOString(),
    regeneratedFromId: set.regeneratedFromId,
  };
}
export function toCardNewsDetail(
  set: CardNewsSetRecord,
  cleanup?: AssetCleanupJob | null,
): CardNewsDetail {
  const source = parseCardNewsSource(set.sourceSnapshot);
  return {
    ...toCardNewsSummary(set),
    draftDocument:
      set.draftDocument === null ? null : parseCardNewsDraft(set.draftDocument),
    sourceSentences: splitSourceSentences(source.scriptText),
    subtitleStatus: source.subtitleStatus,
    completedRevisions: [
      ...new Set(
        set.jobs
          .filter(
            (job) => job.status === "completed" && job.outputRetiredAt === null,
          )
          .map((job) => job.inputRevision),
      ),
    ].sort((a, b) => b - a),
    jobs: set.jobs.map(toCardNewsJobSummary),
    coverCandidates: [],
    previewImages: [],
    cleanup: cleanup
      ? { id: cleanup.id, status: cleanup.status, lastError: cleanup.lastError }
      : null,
  };
}
