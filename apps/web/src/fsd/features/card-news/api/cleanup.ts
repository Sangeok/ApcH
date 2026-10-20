import "server-only";
import { S3DeleteError } from "~/fsd/shared/api/s3";

import type { Prisma } from "@repo/db";
import {
  createAssetCleanupJob,
  claimAssetCleanupJob,
  completeContainedAssetCleanupJobs,
  deleteCardNewsSetsAfterCleanup,
  findAssetCleanupJob,
  findAssetCleanupJobsForScope,
  findCardNewsInvocationById,
  findCardNewsJob,
  findCardNewsSet,
  listAssetCleanupJobs,
  lockAssetCleanupJob,
  lockCardNewsSet,
  lockCardNewsJob,
  parseCardNewsInput,
  parseCardNewsManifest,
  parseProducerStatusResponse,
  updateAssetCleanupJob,
  updateCardNewsInvocation,
  updateCardNewsJob,
  updateCardNewsSet,
} from "~/fsd/entities/card-news/server";
import {
  deleteClipRecord,
  lockClipForCardNews,
} from "~/fsd/entities/clip/server";
import { deleteUploadedFileRecord } from "~/fsd/entities/uploaded-file/server";
import {
  findProcessingDispatchById,
  updateProcessingDispatch,
} from "~/fsd/entities/processing-dispatch/server";
import { lockUserForCredits } from "~/fsd/entities/user/server";
import { lockUploadedFileForProcessing } from "~/fsd/entities/uploaded-file/server";
import { CARD_NEWS_CONFIG } from "~/fsd/shared/config/card-news";
import {
  cardNewsTransaction,
  jsonValue,
  lockedCardNewsSet,
  lockedCardNewsJob,
  lockCardNewsScope,
} from "./reservation-tx";
import { cardNewsRuntime } from "./runtime-dependencies";

type Producer = {
  kind: "video" | "card-news";
  referenceId: string;
  modalCallId: string | null;
  ended?: boolean;
  producerEndEvidence?: unknown;
};
type Job = NonNullable<Awaited<ReturnType<typeof findCardNewsJob>>>;

const strings = (value: unknown): string[] =>
  Array.isArray(value)
    ? value.filter((entry): entry is string => typeof entry === "string")
    : [];

function producersForJob(job: Job): Producer[] {
  const invocations = job.invocations.map((invocation) => ({
    kind: "card-news" as const,
    referenceId: invocation.id,
    modalCallId: invocation.modalCallId,
    ended: invocation.status === "ended",
    producerEndEvidence: invocation.producerEndEvidence,
  }));
  if (
    !job.modalCallId &&
    !job.invocations.length &&
    job.modalSpawnState === "not_sent"
  )
    return [];
  if (
    job.modalCallId &&
    job.invocations.some(
      (invocation) => invocation.modalCallId === job.modalCallId,
    )
  )
    return invocations;
  return [
    ...invocations,
    { kind: "card-news", referenceId: job.id, modalCallId: job.modalCallId },
  ];
}

export async function enqueueOrphanCleanup(
  job: Job,
  tx: Prisma.TransactionClient,
): Promise<void> {
  const input = parseCardNewsInput(job.inputSnapshot);
  const retained = job.selectedInvocationId
    ? [`${input.outputPrefix}${job.selectedInvocationId}/`]
    : [];
  const existing = (
    await findAssetCleanupJobsForScope(job.userId, "orphan", job.id, tx)
  )[0];
  if (existing) {
    if (retained.length)
      await updateAssetCleanupJob(
        existing.id,
        {
          retainedReferences: jsonValue([
            ...new Set([...strings(existing.retainedReferences), ...retained]),
          ]),
        },
        tx,
      );
    return;
  }
  await createAssetCleanupJob(
    {
      userId: job.userId,
      kind: "orphan",
      scopeId: job.id,
      scopeSnapshot: jsonValue({
        jobId: job.id,
        setId: job.setId,
        epoch: job.executionEpoch,
      }),
      dedicatedPrefixes: jsonValue([input.outputPrefix]),
      retainedReferences: jsonValue(retained),
      producerReferences: jsonValue(producersForJob(job)),
      notBefore: cardNewsRuntime().now(),
    },
    tx,
  );
}

export async function enqueueRetiredOutputCleanup(
  setId: string,
  tx: Prisma.TransactionClient,
): Promise<void> {
  const set = await findCardNewsSet(setId, tx);
  if (!set) return;
  const complete = set.jobs
    .filter(
      (job) =>
        job.status === "completed" && job.manifest && !job.outputRetiredAt,
    )
    .sort((left, right) => right.inputRevision - left.inputRevision);
  const protectedObjects = new Set<string>();
  for (const job of complete.slice(0, 2)) {
    const manifest = parseCardNewsManifest(job.manifest);
    for (const object of [
      ...manifest.cards,
      ...manifest.coverCandidates,
      manifest.zip,
    ])
      protectedObjects.add(object.key);
  }
  // Every render still references the original cover candidates.
  for (const job of set.jobs.filter(
    (job) => job.status === "pending" || job.status === "running",
  ))
    for (const candidate of parseCardNewsInput(job.inputSnapshot)
      .coverCandidates)
      protectedObjects.add(candidate.key);
  for (const job of complete.slice(2)) {
    if (
      (await findAssetCleanupJobsForScope(set.userId, "retention", job.id, tx))
        .length
    )
      continue;
    const current = await findCardNewsJob(job.id, tx);
    if (!current) continue;
    const input = parseCardNewsInput(job.inputSnapshot);
    await createAssetCleanupJob(
      {
        userId: set.userId,
        kind: "retention",
        scopeId: job.id,
        scopeSnapshot: jsonValue({ jobId: job.id, setId }),
        dedicatedPrefixes: jsonValue([input.outputPrefix]),
        retainedReferences: jsonValue([...protectedObjects]),
        producerReferences: jsonValue(producersForJob(current)),
        notBefore: new Date(
          cardNewsRuntime().now().getTime() + CARD_NEWS_CONFIG.retentionDelayMs,
        ),
      },
      tx,
    );
  }
}

export async function acceptCardNewsDeletion(
  userId: string,
  setId: string,
): Promise<{ status: "deleting"; cleanupId: string }> {
  return cardNewsTransaction(async (tx) => {
    const set = await lockedCardNewsSet(setId, userId, tx);
    if (
      set.jobs.some(
        (job) => job.status === "pending" || job.status === "running",
      )
    )
      throw new Error("Wait for active card news jobs before deleting");
    const producers: Producer[] = [];
    for (const entry of set.jobs) {
      const job = await findCardNewsJob(entry.id, tx);
      if (job) producers.push(...producersForJob(job));
    }
    await updateCardNewsSet(
      setId,
      { status: "deleting", deletedAt: cardNewsRuntime().now() },
      tx,
    );
    const cleanup = await createAssetCleanupJob(
      {
        userId,
        kind: "set",
        scopeId: setId,
        scopeSnapshot: jsonValue({
          scopeKind: "set",
          scopeId: setId,
          setIds: [setId],
          jobIds: set.jobs.map((job) => job.id),
          clipIds: [],
          uploadedFileId: set.uploadedFileId,
        }),
        dedicatedPrefixes: jsonValue([`card-news/${userId}/${setId}/`]),
        producerReferences: jsonValue(producers),
      },
      tx,
    );
    return { status: "deleting", cleanupId: cleanup.id };
  });
}

async function producerEnded(producer: Producer): Promise<boolean> {
  if (producer.ended && producer.producerEndEvidence) return true;
  let callId = producer.modalCallId;
  if (producer.kind === "video") {
    const dispatch = await findProcessingDispatchById(producer.referenceId);
    if (!dispatch)
      return Boolean(producer.ended && producer.producerEndEvidence);
    if (
      dispatch.modalSpawnState === "not_sent" ||
      (dispatch.modalSpawnState === "ended" && dispatch.producerEndEvidence)
    )
      return true;
    callId = dispatch.modalCallId;
  } else {
    const invocation = await findCardNewsInvocationById(producer.referenceId);
    if (invocation?.status === "ended" && invocation.producerEndEvidence)
      return true;
    callId =
      invocation?.modalCallId ??
      (await findCardNewsJob(producer.referenceId))?.modalCallId ??
      callId;
  }
  if (!callId) return false;
  try {
    const result = parseProducerStatusResponse(
      await cardNewsRuntime().producerStatus({
        schemaVersion: 1,
        kind: producer.kind,
        referenceId: producer.referenceId,
        modalCallId: callId,
      }),
    );
    if (result.status !== "ended") return false;
    if (producer.kind === "video") {
      const dispatch = await findProcessingDispatchById(producer.referenceId);
      if (dispatch)
        await cardNewsTransaction(async (tx) => {
          await lockUserForCredits(dispatch.uploadedFile.userId, tx);
          await lockUploadedFileForProcessing(dispatch.uploadedFileId, tx);
          const current = await findProcessingDispatchById(dispatch.id, tx);
          if (current?.modalCallId === callId)
            await updateProcessingDispatch(
              dispatch.id,
              {
                modalSpawnState: "ended",
                producerEndEvidence: jsonValue({
                  kind: "modal-status",
                  observedAt: cardNewsRuntime().now().toISOString(),
                  modalCallId: callId,
                }),
              },
              tx,
            );
        });
    }
    if (producer.kind === "card-news") {
      const invocation = await findCardNewsInvocationById(producer.referenceId);
      if (invocation)
        await cardNewsTransaction(async (tx) => {
          await updateCardNewsInvocation(
            invocation.id,
            {
              status: "ended",
              endedAt: cardNewsRuntime().now(),
              producerEndEvidence: jsonValue({
                kind: "modal-status",
                observedAt: cardNewsRuntime().now().toISOString(),
              }),
            },
            tx,
          );
        });
    }
    return true;
  } catch {
    return false;
  }
}

export async function runCardNewsCleanup(cleanupId: string): Promise<void> {
  const job = await cardNewsTransaction(async (tx) => {
    const cleanup = await findAssetCleanupJob(cleanupId, tx);
    const now = cardNewsRuntime().now();
    if (
      !cleanup ||
      cleanup.status === "completed" ||
      cleanup.notBefore > now ||
      (cleanup.leaseUntil && cleanup.leaseUntil > now)
    )
      return null;
    if (
      !(await claimAssetCleanupJob(
        cleanupId,
        now,
        new Date(now.getTime() + 50_000),
        tx,
      ))
    )
      return null;
    return findAssetCleanupJob(cleanupId, tx);
  });
  if (!job) return;
  try {
    const currentOrphan =
      job.kind === "orphan" &&
      job.scopeSnapshot !== null &&
      typeof job.scopeSnapshot === "object" &&
      !Array.isArray(job.scopeSnapshot) &&
      job.scopeSnapshot.jobId === job.scopeId
        ? await cardNewsTransaction(async (tx) => {
            const current = await lockedCardNewsJob(job.scopeId, tx);
            const latest = await lockAssetCleanupJob(job.id, tx);
            if (!latest || latest.status === "completed") return null;
            if (current.status === "pending" || current.status === "running")
              throw new Error("Waiting for card news final reconciliation");
            const input = parseCardNewsInput(current.inputSnapshot);
            const retained = new Set(strings(latest.retainedReferences));
            if (current.selectedInvocationId)
              retained.add(
                `${input.outputPrefix}${current.selectedInvocationId}/`,
              );
            return updateAssetCleanupJob(
              latest.id,
              { retainedReferences: jsonValue([...retained]) },
              tx,
            );
          })
        : job;
    if (!currentOrphan) return;
    const producerReferences = Array.isArray(job.producerReferences)
      ? (job.producerReferences as Producer[])
      : [];
    if (
      !(await Promise.all(producerReferences.map(producerEnded))).every(Boolean)
    )
      throw new Error("Waiting for producer termination evidence");
    const prefixes = strings(job.dedicatedPrefixes);
    const exact = strings(job.exactKeys);
    const retained = strings(currentOrphan.retainedReferences);
    const allowed = (key: string) =>
      (exact.includes(key) ||
        prefixes.some((prefix) => key.startsWith(prefix))) &&
      !retained.some(
        (keep) => key === keep || (keep.endsWith("/") && key.startsWith(keep)),
      );
    const candidates = new Set(exact.filter(allowed));
    for (const prefix of prefixes)
      for (const key of await cardNewsRuntime().listObjects(prefix))
        if (allowed(key)) candidates.add(key);
    await cardNewsRuntime().deleteObjects([...candidates]);
    for (const prefix of prefixes)
      if ((await cardNewsRuntime().listObjects(prefix)).some(allowed))
        throw new Error("Objects remain in cleanup scope");
    for (const key of exact.filter(allowed)) {
      try {
        await cardNewsRuntime().headObject(key);
        throw new Error("Exact object remains in cleanup scope");
      } catch (error) {
        if (
          !(error instanceof Error) ||
          !["NotFound", "NoSuchKey", "404"].includes(error.name)
        )
          throw error;
      }
    }
    await cardNewsTransaction(async (tx) => {
      const latest = await findAssetCleanupJob(cleanupId, tx);
      if (!latest || latest.status === "completed") return;
      if (["set", "clip", "uploaded-file"].includes(job.kind)) {
        const scope = job.scopeSnapshot;
        if (
          !scope ||
          typeof scope !== "object" ||
          Array.isArray(scope) ||
          (typeof scope.uploadedFileId !== "string" &&
            !(job.kind === "clip" && scope.uploadedFileId === null))
        )
          throw new Error("Invalid cleanup scope");
        const clipIds = strings(scope.clipIds).sort();
        const setIds = strings(scope.setIds).sort();
        const firstSet = setIds.length
          ? await findCardNewsSet(setIds[0]!, tx)
          : null;
        if (typeof scope.uploadedFileId === "string") {
          await lockCardNewsScope(
            {
              userId: job.userId,
              uploadedFileId: scope.uploadedFileId,
              clipId: clipIds[0] ?? firstSet?.clipId ?? "",
            },
            tx,
          );
        } else {
          await lockUserForCredits(job.userId, tx);
        }
        const remainingClipIds =
          typeof scope.uploadedFileId === "string" ? clipIds.slice(1) : clipIds;
        for (const clipId of remainingClipIds)
          await lockClipForCardNews(clipId, tx);
        for (const setId of setIds) {
          const set = await lockCardNewsSet(setId, tx);
          if (set)
            for (const task of [...set.jobs].sort((left, right) =>
              left.id.localeCompare(right.id),
            ))
              await lockCardNewsJob(task.id, tx);
        }
      }
      // The DB trigger must see terminal cleanup before parent removal; both changes roll back together.
      await updateAssetCleanupJob(
        cleanupId,
        {
          status: "completed",
          completedAt: cardNewsRuntime().now(),
          leaseUntil: null,
          lastError: null,
          failedKeys: jsonValue([]),
        },
        tx,
      );
      if (job.kind === "retention")
        await updateCardNewsJob(
          job.scopeId,
          { outputRetiredAt: cardNewsRuntime().now() },
          tx,
        );
      else if (["set", "clip", "uploaded-file"].includes(job.kind)) {
        const scope = job.scopeSnapshot;
        if (!scope || typeof scope !== "object" || Array.isArray(scope))
          throw new Error("Invalid cleanup scope");
        await completeContainedAssetCleanupJobs(
          {
            userId: job.userId,
            setIds: strings(scope.setIds),
            jobIds: strings(scope.jobIds),
            dispatchIds: strings(scope.dispatchIds),
            exceptId: job.id,
          },
          tx,
        );
        await deleteCardNewsSetsAfterCleanup(strings(scope.setIds), tx);
        if (job.kind === "clip")
          for (const clipId of strings(scope.clipIds))
            await deleteClipRecord(clipId, { tx });
        if (job.kind === "uploaded-file")
          await deleteUploadedFileRecord(job.scopeId, job.userId, { tx });
      }
    });
  } catch (error) {
    await cardNewsTransaction(async (tx) => {
      const current = await lockAssetCleanupJob(cleanupId, tx);
      if (!current || current.status === "completed") return;
      await updateAssetCleanupJob(
        cleanupId,
        {
          status: "retryable_failed",
          failedKeys: jsonValue(
            error instanceof S3DeleteError ? error.failedKeys : [],
          ),
          leaseUntil: null,
          nextRetryAt: new Date(cardNewsRuntime().now().getTime() + 60_000),
          lastError:
            error instanceof Error
              ? error.message.slice(0, 200)
              : "cleanup_failed",
        },
        tx,
      );
    });
  }
}

export async function cleanupPendingCardNewsAssets(): Promise<void> {
  for (const cleanup of await listAssetCleanupJobs(
    cardNewsRuntime().now(),
    100,
  ))
    await runCardNewsCleanup(cleanup.id);
}
