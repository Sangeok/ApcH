import "server-only";

import { createHash, randomUUID } from "node:crypto";
import type { Prisma } from "@repo/db";
import { CARD_NEWS_STAGES } from "~/fsd/entities/card-news";
import { env } from "~/env";
import { findCardNewsSourceClip } from "~/fsd/entities/clip/server";
import {
  canonicalJson,
  canonicalSourceHash,
  validateManifestBinding,
  createCardNewsInvocation,
  createCardNewsJob,
  createCardNewsSet,
  findCardNewsInvocation,
  findCardNewsJob,
  findCardNewsJobByRequest,
  findCardNewsSet,
  listActiveCardNewsJobs,
  listRecoverableCardNewsJobs,
  listPendingCardNewsAnalyticsJobs,
  parseCardNewsCallback,
  parseCardNewsDraft,
  parseCardNewsInput,
  parseCardNewsManifest,
  parseCardNewsSource,
  parseProducerStatusResponse,
  updateCardNewsInvocation,
  updateCardNewsJob,
  updateCardNewsSet,
} from "~/fsd/entities/card-news/server";
import {
  CARD_NEWS_CONFIG,
  canAcceptCardNews,
} from "~/fsd/shared/config/card-news";
import { editorDraftSchema, markEditedCards } from "../model/editor-schema";
import { cardNewsRuntime } from "./runtime-dependencies";
import {
  cardNewsTransaction,
  jsonValue,
  lockedCardNewsJob,
  lockedCardNewsSet,
  lockCardNewsScope,
  reserveCardNewsCredit,
  settleCardNewsCredit,
} from "./reservation-tx";
import { enqueueOrphanCleanup, enqueueRetiredOutputCleanup } from "./cleanup";
import { queueAnalytics, flushCardNewsAnalytics } from "./analytics";

export function stableHash(value: unknown): string {
  return createHash("sha256").update(canonicalJson(value)).digest("hex");
}

const isActive = (status: string) =>
  status === "pending" || status === "running";
const requestEvent = (job: {
  id: string;
  kind: string;
  executionEpoch: number;
  inputRevision: number;
}) => ({
  name:
    job.kind === "generate"
      ? ("card-news/generate.requested" as const)
      : ("card-news/render.requested" as const),
  data: {
    jobId: job.id,
    executionEpoch: job.executionEpoch,
    revision: job.inputRevision,
    matchKey: `${job.id}:${job.executionEpoch}:${job.inputRevision}`,
  },
});

function makeInput(args: {
  userId: string;
  setId: string;
  jobId: string;
  source: unknown;
  sourceHash: string;
  revision: number;
  draft: unknown;
  coverCandidates: unknown[];
  deadlineAt: Date;
  initialTheme?: string;
  versions?: {
    templateVersion: string;
    fontVersion: string;
    promptVersion: string;
    modelVersion: string;
  };
}) {
  return parseCardNewsInput({
    schemaVersion: 1,
    mode: args.draft ? "render" : "generate",
    jobId: args.jobId,
    setId: args.setId,
    userId: args.userId,
    executionEpoch: 1,
    revision: args.revision,
    sourceHash: args.sourceHash,
    source: args.source,
    draft: args.draft,
    coverCandidates: args.coverCandidates,
    outputPrefix: `card-news/${args.userId}/${args.setId}/${args.jobId}/e1/`,
    callbackUrl: `${env.NEXT_PUBLIC_SITE_URL!.replace(/\/$/, "")}/api/webhooks/card-news`,
    writeDeadlineAt: args.deadlineAt.toISOString(),
    templateVersion:
      args.versions?.templateVersion ?? CARD_NEWS_CONFIG.templateVersion,
    fontVersion: args.versions?.fontVersion ?? CARD_NEWS_CONFIG.fontVersion,
    promptVersion:
      args.versions?.promptVersion ?? CARD_NEWS_CONFIG.promptVersion,
    modelVersion: args.versions?.modelVersion ?? CARD_NEWS_CONFIG.modelVersion,
    initialTheme: args.initialTheme ?? "light",
    cardCount: CARD_NEWS_CONFIG.defaultCardCount,
  });
}

export async function createPaidCardNews(
  userId: string,
  payload: {
    clipId: string;
    requestId: string;
    theme: "light" | "dark";
    regeneratedFromId?: string;
  },
): Promise<{ setId: string; jobId: string }> {
  const requestHash = stableHash(payload);
  const previousRequest = await findCardNewsJobByRequest(
    userId,
    payload.requestId,
  );
  if (previousRequest) {
    if (previousRequest.requestHash !== requestHash)
      throw new Error("Request ID already belongs to a different request");
    return { setId: previousRequest.setId, jobId: previousRequest.id };
  }
  if (
    !canAcceptCardNews(
      {
        enabled: env.CARD_NEWS_ENABLED,
        allowedUserIds: env.CARD_NEWS_ALLOWED_USER_IDS,
        endpoint: env.CARD_NEWS_ENDPOINT,
        endpointAuth: env.CARD_NEWS_ENDPOINT_AUTH,
        webhookSecret: env.CARD_NEWS_WEBHOOK_SECRET,
        siteUrl: env.NEXT_PUBLIC_SITE_URL,
      },
      userId,
    )
  )
    throw new Error("Card news generation is not available");
  const clip = await findCardNewsSourceClip(payload.clipId, userId);
  if (
    clip?.uploadedFile &&
    !["English", "Korean"].includes(clip.uploadedFile.language)
  )
    throw new Error(
      "Card news currently supports English and Korean source clips",
    );
  if (
    !clip?.uploadedFile ||
    clip.deletedAt ||
    clip.uploadedFile.deletedAt ||
    clip.uploadedFile.userId !== userId ||
    !clip.uploadedFile.uploaded ||
    clip.processingAttempt <= 0 ||
    clip.processingAttempt > clip.uploadedFile.lastSuccessfulAttempt
  )
    throw new Error("Choose a completed clip with an available original video");
  const source = parseCardNewsSource({
    schemaVersion: 1,
    clipId: clip.id,
    processingAttempt: clip.processingAttempt,
    uploadedFileId: clip.uploadedFile.id,
    s3Key: clip.uploadedFile.s3Key,
    clipS3Key: clip.s3Key,
    startSeconds: clip.startSeconds,
    endSeconds: clip.endSeconds,
    scriptText: clip.scriptText,
    hook: clip.hook,
    payoff: clip.payoff,
    language: clip.uploadedFile.language === "Korean" ? "Korean" : "English",
    subtitleStatus: clip.subtitleStatus,
    sourceSentenceCount: (clip.scriptText ?? "")
      .split(/(?<=[.!?。！？])\s+|\n+/u)
      .filter((sentence) => sentence.trim()).length,
  });
  try {
    await Promise.all([
      cardNewsRuntime().headObject(source.s3Key),
      cardNewsRuntime().headObject(source.clipS3Key),
    ]);
  } catch {
    throw new Error(
      "Original video or clip could not be checked. Please try again.",
    );
  }
  const result = await cardNewsTransaction(async (tx) => {
    await lockCardNewsScope(
      { userId, uploadedFileId: source.uploadedFileId, clipId: source.clipId },
      tx,
    );
    const existing = await findCardNewsJobByRequest(
      userId,
      payload.requestId,
      tx,
    );
    if (existing) {
      if (existing.requestHash !== requestHash)
        throw new Error("Request ID already belongs to a different request");
      return { setId: existing.setId, jobId: existing.id };
    }
    const current = await findCardNewsSourceClip(payload.clipId, userId, {
      tx,
    });
    if (
      !current?.uploadedFile ||
      current.deletedAt ||
      current.uploadedFile.deletedAt ||
      current.uploadedFile.userId !== userId ||
      current.s3Key !== source.clipS3Key ||
      current.uploadedFile.s3Key !== source.s3Key ||
      current.startSeconds !== source.startSeconds ||
      current.endSeconds !== source.endSeconds ||
      current.scriptText !== source.scriptText ||
      current.processingAttempt !== source.processingAttempt ||
      current.processingAttempt > current.uploadedFile.lastSuccessfulAttempt
    )
      throw new Error(
        "Clip changed while preparing generation. Please try again.",
      );
    if (
      (await listActiveCardNewsJobs(userId, tx)).some(
        (job) => job.kind === "generate",
      )
    )
      throw new Error("A paid card news generation is already in progress");
    let approvedSource = source;
    if (payload.regeneratedFromId) {
      const parent = await lockedCardNewsSet(
        payload.regeneratedFromId,
        userId,
        tx,
      );
      if (parent.clipId !== source.clipId || parent.status !== "ready")
        throw new Error("Only completed card news can be regenerated");
      approvedSource = parseCardNewsSource(parent.sourceSnapshot);
    }
    const now = cardNewsRuntime().now();
    const deadlineAt = new Date(now.getTime() + CARD_NEWS_CONFIG.jobTimeoutMs);
    const setId = randomUUID();
    const jobId = randomUUID();
    const sourceHash = canonicalSourceHash(approvedSource);
    const reservationId = await reserveCardNewsCredit(userId, jobId, tx);
    await createCardNewsSet(
      {
        id: setId,
        userId,
        clipId: source.clipId,
        uploadedFileId: source.uploadedFileId,
        sourceSnapshot: jsonValue(approvedSource),
        sourceHash,
        language: approvedSource.language,
        draftSnapshots: {},
        regeneratedFromId: payload.regeneratedFromId,
        status: "generating",
      },
      tx,
    );
    const input = makeInput({
      userId,
      setId,
      jobId,
      source: approvedSource,
      sourceHash,
      revision: 1,
      draft: null,
      coverCandidates: [],
      deadlineAt,
      initialTheme: payload.theme,
    });
    await createCardNewsJob(
      {
        id: jobId,
        userId,
        setId,
        kind: "generate",
        requestId: payload.requestId,
        requestHash,
        inputRevision: 1,
        inputSnapshot: jsonValue(input),
        reservationId,
        templateVersion: CARD_NEWS_CONFIG.templateVersion,
        deadlineAt,
        nextDispatchAt: now,
        pendingAnalytics: jsonValue([
          queueAnalytics(
            payload.regeneratedFromId
              ? "card_news_regenerated"
              : "card_news_requested",
            { setId, jobId, revision: 1, billingStatus: "held" },
          ),
        ]),
      },
      tx,
    );
    return { setId, jobId };
  });
  await dispatchCardNewsJob(result.jobId);
  return result;
}

export async function dispatchCardNewsJob(jobId: string): Promise<void> {
  const claimed = await cardNewsTransaction(async (tx) => {
    const job = await lockedCardNewsJob(jobId, tx);
    const now = cardNewsRuntime().now();
    if (
      !isActive(job.status) ||
      job.deadlineAt <= now ||
      (job.dispatchLeaseUntil && job.dispatchLeaseUntil > now) ||
      (job.claimedAt &&
        job.heartbeatAt &&
        now.getTime() - job.heartbeatAt.getTime() < 90_000)
    )
      return null;
    return updateCardNewsJob(
      jobId,
      {
        dispatchStatus: "sending",
        dispatchLeaseUntil: new Date(now.getTime() + 45_000),
        dispatchCount: { increment: 1 },
      },
      tx,
    );
  });
  if (!claimed) return;
  try {
    await cardNewsRuntime().sendEvent(requestEvent(claimed));
    await cardNewsTransaction(async (tx) => {
      const current = await lockedCardNewsJob(jobId, tx);
      if (isActive(current.status))
        await updateCardNewsJob(
          jobId,
          {
            dispatchStatus: "sent",
            dispatchedAt: cardNewsRuntime().now(),
            dispatchLeaseUntil: null,
            nextDispatchAt: new Date(
              cardNewsRuntime().now().getTime() + 60_000,
            ),
            lastDispatchError: null,
          },
          tx,
        );
    });
  } catch (error) {
    await cardNewsTransaction(async (tx) => {
      const current = await lockedCardNewsJob(jobId, tx);
      if (isActive(current.status))
        await updateCardNewsJob(
          jobId,
          {
            dispatchStatus: "retryable_failed",
            dispatchLeaseUntil: null,
            nextDispatchAt: new Date(
              cardNewsRuntime().now().getTime() + 60_000,
            ),
            lastDispatchError:
              error instanceof Error
                ? error.message.slice(0, 200)
                : "event_delivery_failed",
          },
          tx,
        );
    });
  }
  await flushCardNewsAnalytics(jobId);
}

export async function claimCardNewsJob(
  jobId: string,
  executionEpoch: number,
  revision: number,
  workerRunId: string,
) {
  return cardNewsTransaction(async (tx) => {
    const job = await lockedCardNewsJob(jobId, tx);
    if (
      !isActive(job.status) ||
      job.executionEpoch !== executionEpoch ||
      job.inputRevision !== revision ||
      job.set.deletedAt ||
      job.set.clip.deletedAt ||
      job.set.clip.uploadedFile?.deletedAt
    )
      return null;
    if (
      job.workerRunId &&
      job.workerRunId !== workerRunId &&
      job.heartbeatAt &&
      cardNewsRuntime().now().getTime() - job.heartbeatAt.getTime() < 90_000
    )
      return null;
    await updateCardNewsJob(
      job.id,
      {
        status: "running",
        workerRunId,
        claimedAt: job.claimedAt ?? cardNewsRuntime().now(),
        heartbeatAt: cardNewsRuntime().now(),
      },
      tx,
    );
    return {
      input: parseCardNewsInput(job.inputSnapshot),
      modalCallId: job.modalCallId,
      hasInvocation: job.invocations.length > 0,
    };
  });
}

export async function spawnCardNewsJob(
  jobId: string,
  workerRunId: string,
): Promise<void> {
  const input = await prepareCardNewsCpuSpawn(jobId, workerRunId);
  if (!input) return;
  const result = await callCardNewsCpu(input);
  await recordCardNewsCpuSpawn(jobId, result);
}

export async function prepareCardNewsCpuSpawn(
  jobId: string,
  workerRunId: string,
) {
  return cardNewsTransaction(async (tx) => {
    const job = await lockedCardNewsJob(jobId, tx);
    if (
      !isActive(job.status) ||
      job.workerRunId !== workerRunId ||
      job.modalCallId ||
      job.invocations.length > 0
    )
      return null;
    // Ambiguous POST must never be repeated; started registration can recover its call ID.
    if (job.modalSpawnState !== "not_sent") return null;
    await updateCardNewsJob(
      job.id,
      { modalSpawnState: "sending", heartbeatAt: cardNewsRuntime().now() },
      tx,
    );
    return parseCardNewsInput(job.inputSnapshot);
  });
}

export async function callCardNewsCpu(
  input: ReturnType<typeof parseCardNewsInput>,
): Promise<{ modalCallId: string | null }> {
  try {
    const accepted = await cardNewsRuntime().postCpu(input);
    if (
      !accepted ||
      typeof accepted !== "object" ||
      !("schemaVersion" in accepted) ||
      accepted.schemaVersion !== 1 ||
      !("status" in accepted) ||
      accepted.status !== "accepted" ||
      !("call_id" in accepted) ||
      typeof accepted.call_id !== "string" ||
      !accepted.call_id.startsWith("fc-")
    )
      throw new Error("Invalid CPU acceptance");
    return { modalCallId: accepted.call_id };
  } catch {
    return { modalCallId: null };
  }
}

export async function recordCardNewsCpuSpawn(
  jobId: string,
  result: { modalCallId: string | null },
): Promise<void> {
  if (result.modalCallId)
    return recordCardNewsSpawnResult(jobId, result.modalCallId);
  await cardNewsTransaction(async (tx) => {
    const job = await lockedCardNewsJob(jobId, tx);
    if (isActive(job.status) && !job.modalCallId)
      await updateCardNewsJob(
        jobId,
        {
          modalSpawnState: "unknown",
          lastDispatchError: "spawn_response_unknown",
        },
        tx,
      );
  });
}

export async function recordCardNewsSpawnResult(
  jobId: string,
  modalCallId: string,
): Promise<void> {
  await cardNewsTransaction(async (tx) => {
    const job = await lockedCardNewsJob(jobId, tx);
    if (isActive(job.status) && !job.modalCallId)
      await updateCardNewsJob(
        jobId,
        {
          modalCallId,
          modalSpawnState: "accepted",
          heartbeatAt: cardNewsRuntime().now(),
        },
        tx,
      );
  });
}

export async function acceptCardNewsCallback(
  raw: unknown,
): Promise<{ accepted: boolean; writeDeadlineAt: string | null }> {
  const callback = parseCardNewsCallback(raw);
  const result = await cardNewsTransaction(async (tx) => {
    const job = await lockedCardNewsJob(callback.jobId, tx);
    const current =
      job.executionEpoch === callback.executionEpoch &&
      job.inputRevision === callback.revision;
    const writable =
      current &&
      isActive(job.status) &&
      !job.set.deletedAt &&
      !job.set.clip.deletedAt &&
      !job.set.clip.uploadedFile?.deletedAt &&
      job.deadlineAt > cardNewsRuntime().now();
    let invocation = await findCardNewsInvocation(
      job.id,
      callback.executionEpoch,
      callback.invocationId,
      tx,
    );
    if (callback.outcome === "started") {
      if (!writable || !callback.modalCallId)
        return { accepted: false, writeDeadlineAt: null };
      if (!invocation)
        invocation = await createCardNewsInvocation(
          {
            jobId: job.id,
            executionEpoch: callback.executionEpoch,
            invocationId: callback.invocationId,
            modalCallId: callback.modalCallId,
            writeDeadlineAt: job.deadlineAt,
          },
          tx,
        );
      else if (invocation.modalCallId !== callback.modalCallId)
        throw new Error("Invocation binding conflict");
      await updateCardNewsJob(
        job.id,
        {
          modalCallId: job.modalCallId ?? callback.modalCallId,
          modalSpawnState: "accepted",
          progressInvocationId:
            job.progressInvocationId ?? callback.invocationId,
          heartbeatAt: cardNewsRuntime().now(),
        },
        tx,
      );
      return {
        accepted: true,
        writeDeadlineAt: invocation.writeDeadlineAt.toISOString(),
      };
    }
    if (
      !invocation ||
      (callback.modalCallId && callback.modalCallId !== invocation.modalCallId)
    )
      throw new Error("Unregistered invocation");
    if (!writable) {
      if (!isActive(job.status)) await enqueueOrphanCleanup(job, tx);
      return { accepted: false, writeDeadlineAt: null };
    }
    if (callback.outcome === "progress") {
      if (callback.stage === "completed" || callback.stage === "failed")
        throw new Error("Invalid progress stage");
      if (callback.sequence > invocation.progressSequence) {
        const rank = (stage: string) =>
          CARD_NEWS_STAGES.findIndex((value) => value === stage);
        const stage =
          rank(callback.stage) >= rank(invocation.stage)
            ? callback.stage
            : invocation.stage;
        await updateCardNewsInvocation(
          invocation.id,
          { progressSequence: callback.sequence, stage },
          tx,
        );
        const selected = job.progressInvocationId;
        if (
          selected === callback.invocationId &&
          rank(stage) >= rank(job.stage)
        )
          await updateCardNewsJob(
            job.id,
            { stage, heartbeatAt: cardNewsRuntime().now() },
            tx,
          );
      }
      return {
        accepted: true,
        writeDeadlineAt: invocation.writeDeadlineAt.toISOString(),
      };
    }
    const inbox = Array.isArray(job.callbackInbox) ? job.callbackInbox : [];
    const same = inbox.find(
      (entry) =>
        entry &&
        typeof entry === "object" &&
        "invocationId" in entry &&
        entry.invocationId === callback.invocationId &&
        "outcome" in entry &&
        entry.outcome === callback.outcome,
    );
    if (same && stableHash(same) !== stableHash(callback))
      throw new Error("Conflicting completion notice");
    if (!same)
      await updateCardNewsJob(
        job.id,
        {
          callbackInbox: jsonValue([...inbox, callback]),
          heartbeatAt: cardNewsRuntime().now(),
        },
        tx,
      );
    return {
      accepted: true,
      writeDeadlineAt: invocation.writeDeadlineAt.toISOString(),
    };
  });
  if (callback.outcome === "completed" || callback.outcome === "failed") {
    try {
      await cardNewsRuntime().sendEvent({
        name: "card-news/completed",
        data: {
          jobId: callback.jobId,
          executionEpoch: callback.executionEpoch,
          revision: callback.revision,
          matchKey: `${callback.jobId}:${callback.executionEpoch}:${callback.revision}`,
        },
      });
    } catch {
      /* Inbox is durable; the minute recovery worker reads it directly. */
    }
  }
  return result;
}

async function validatedManifest(
  job: NonNullable<Awaited<ReturnType<typeof findCardNewsJob>>>,
  key: string,
) {
  const input = parseCardNewsInput(job.inputSnapshot);
  const manifest = parseCardNewsManifest(
    JSON.parse(await cardNewsRuntime().readObject(key)),
  );
  validateManifestBinding(manifest, input);
  if (
    manifest.jobId !== job.id ||
    manifest.executionEpoch !== job.executionEpoch ||
    manifest.revision !== job.inputRevision ||
    manifest.sourceHash !== input.sourceHash ||
    key !== `${input.outputPrefix}${manifest.invocationId}/manifest.json` ||
    manifest.templateVersion !== input.templateVersion ||
    manifest.fontVersion !== input.fontVersion ||
    manifest.promptVersion !== input.promptVersion ||
    manifest.modelVersion !== input.modelVersion
  )
    throw new Error("Manifest binding mismatch");
  const invocation = job.invocations.find(
    (entry) =>
      entry.executionEpoch === manifest.executionEpoch &&
      entry.invocationId === manifest.invocationId,
  );
  if (!invocation) throw new Error("Unregistered manifest producer");
  if (
    job.kind === "render" &&
    stableHash(manifest.draftDocument) !== stableHash(input.draft)
  )
    throw new Error("Rendered document differs from immutable revision");
  const draft = parseCardNewsDraft(manifest.draftDocument);
  if (
    draft.cards.some((card) =>
      card.sourceSentenceIds.some(
        (index) => index >= input.source.sourceSentenceCount,
      ),
    )
  )
    throw new Error("Source sentence reference out of range");
  for (const object of [
    ...manifest.cards,
    ...manifest.coverCandidates,
    manifest.zip,
  ]) {
    const allowed =
      object.key.startsWith(`${input.outputPrefix}${manifest.invocationId}/`) ||
      (job.kind === "render" &&
        input.coverCandidates.some(
          (candidate) =>
            candidate.key === object.key &&
            stableHash(candidate) === stableHash(object),
        ));
    if (!allowed) throw new Error("Output escaped invocation prefix");
    const head = await cardNewsRuntime().headObject(object.key);
    if (
      head.contentLength !== object.sizeBytes ||
      head.contentType !== object.contentType ||
      (head.metadata.sha256 ?? head.metadata["checksum-sha256"]) !==
        object.sha256
    )
      throw new Error("Stored output checksum or metadata mismatch");
  }
  return manifest;
}

export async function reconcileCardNewsJob(jobId: string): Promise<boolean> {
  const job = await findCardNewsJob(jobId);
  if (!job || !isActive(job.status)) return true;
  const input = parseCardNewsInput(job.inputSnapshot);
  const keys = new Set<string>();
  for (const entry of Array.isArray(job.callbackInbox)
    ? job.callbackInbox
    : []) {
    try {
      const callback = parseCardNewsCallback(entry);
      if (callback.outcome === "completed" && callback.manifestKey)
        keys.add(callback.manifestKey);
    } catch {
      /* Reject old malformed inbox data without publishing it. */
    }
  }
  for (const key of await cardNewsRuntime().listObjects(input.outputPrefix))
    if (key.endsWith("/manifest.json")) keys.add(key);
  for (const key of [...keys].sort()) {
    let manifest: Awaited<ReturnType<typeof validatedManifest>>;
    try {
      manifest = await validatedManifest(job, key);
    } catch (error) {
      console.warn("Card news candidate rejected", {
        jobId,
        reason: error instanceof Error ? error.name : "unknown",
      });
      continue;
    }
    {
      const completed = await cardNewsTransaction(async (tx) => {
        const current = await lockedCardNewsJob(jobId, tx);
        if (
          !isActive(current.status) ||
          current.executionEpoch !== manifest.executionEpoch ||
          current.inputRevision !== manifest.revision ||
          current.set.deletedAt ||
          current.set.clip.deletedAt ||
          current.set.clip.uploadedFile?.deletedAt
        )
          return false;
        await settleCardNewsCredit(current.reservationId, tx, 1);
        await updateCardNewsJob(
          jobId,
          {
            status: "completed",
            stage: "completed",
            selectedManifestKey: key,
            selectedInvocationId: manifest.invocationId,
            manifest: jsonValue(manifest),
            usageMetrics: jsonValue(manifest.usageMetrics),
            completedAt: cardNewsRuntime().now(),
            dispatchLeaseUntil: null,
            pendingAnalytics: jsonValue([
              ...(Array.isArray(current.pendingAnalytics)
                ? current.pendingAnalytics
                : []),
              queueAnalytics("card_news_completed", {
                setId: current.setId,
                jobId,
                revision: current.inputRevision,
                cardCount: manifest.cards.length,
                durationMs:
                  cardNewsRuntime().now().getTime() -
                  current.createdAt.getTime(),
                billingStatus: current.kind === "generate" ? "settled" : "free",
              }),
            ]),
          },
          tx,
        );
        const snapshots =
          current.set.draftSnapshots &&
          typeof current.set.draftSnapshots === "object" &&
          !Array.isArray(current.set.draftSnapshots)
            ? current.set.draftSnapshots
            : {};
        await updateCardNewsSet(
          current.setId,
          {
            status: "ready",
            publishedRevision: Math.max(
              current.set.publishedRevision,
              current.inputRevision,
            ),
            ...(current.kind === "generate"
              ? {
                  draftRevision: 1,
                  draftDocument: jsonValue(manifest.draftDocument),
                  draftSnapshots: jsonValue({
                    ...snapshots,
                    "1": manifest.draftDocument,
                  }),
                }
              : {}),
          },
          tx,
        );
        await enqueueOrphanCleanup(
          { ...current, selectedInvocationId: manifest.invocationId },
          tx,
        );
        await enqueueNextRender(current.setId, tx);
        await enqueueRetiredOutputCleanup(current.setId, tx);
        return true;
      });
      await flushCardNewsAnalytics(jobId);
      return completed;
    }
  }
  const now = cardNewsRuntime().now();
  const invocations = await Promise.all(
    job.invocations.map(async (invocation) => {
      if (invocation.status === "ended") return "ended";
      try {
        const result = parseProducerStatusResponse(
          await cardNewsRuntime().producerStatus({
            schemaVersion: 1,
            kind: "card-news",
            referenceId: invocation.id,
            modalCallId: invocation.modalCallId,
          }),
        );
        if (result.status === "ended")
          await cardNewsTransaction(async (tx) => {
            await updateCardNewsInvocation(
              invocation.id,
              {
                status: "ended",
                endedAt: now,
                producerEndEvidence: jsonValue({
                  kind: "modal-status",
                  observedAt: now.toISOString(),
                }),
              },
              tx,
            );
          });
        return result.status;
      } catch {
        return "unknown";
      }
    }),
  );
  const failures = (
    Array.isArray(job.callbackInbox) ? job.callbackInbox : []
  ).filter(
    (entry) =>
      entry &&
      typeof entry === "object" &&
      "outcome" in entry &&
      entry.outcome === "failed",
  );
  const exhausted =
    job.invocations.length > 0 &&
    invocations.every((status) => status === "ended") &&
    failures.length >= job.invocations.length;
  if (
    job.deadlineAt <= now ||
    exhausted ||
    (!job.claimedAt &&
      now.getTime() - job.createdAt.getTime() >=
        CARD_NEWS_CONFIG.dispatchDeadlineMs)
  ) {
    const failedNotice = failures.length
      ? parseCardNewsCallback(failures[failures.length - 1])
      : null;
    await failCardNewsJob(
      job.id,
      failedNotice?.failureCode ??
        (job.deadlineAt <= now ? "job_timeout" : "dispatch_timeout"),
    );
    return true;
  }
  await dispatchCardNewsJob(job.id);
  return false;
}

export async function failCardNewsJob(
  jobId: string,
  failureCode: string,
): Promise<void> {
  await cardNewsTransaction(async (tx) => {
    const job = await lockedCardNewsJob(jobId, tx);
    if (!isActive(job.status)) return;
    await settleCardNewsCredit(job.reservationId, tx, 0);
    await updateCardNewsJob(
      jobId,
      {
        status: "failed",
        stage: "failed",
        failureCode,
        completedAt: cardNewsRuntime().now(),
        pendingAnalytics: jsonValue([
          ...(Array.isArray(job.pendingAnalytics) ? job.pendingAnalytics : []),
          queueAnalytics("card_news_failed", {
            setId: job.setId,
            jobId,
            revision: job.inputRevision,
            failureCode,
            billingStatus: job.kind === "generate" ? "released" : "free",
          }),
        ]),
      },
      tx,
    );
    if (job.kind === "generate")
      await updateCardNewsSet(job.setId, { status: "failed" }, tx);
    await enqueueOrphanCleanup(job, tx);
    await enqueueNextRender(job.setId, tx);
  });
  await flushCardNewsAnalytics(jobId);
}

export async function enqueueNextRender(
  setId: string,
  tx: Prisma.TransactionClient,
): Promise<string | null> {
  const set = await findCardNewsSet(setId, tx);
  if (
    !set ||
    !set.pendingRenderRevision ||
    set.deletedAt ||
    set.jobs.some((job) => job.kind === "render" && isActive(job.status))
  )
    return null;
  const revision = set.pendingRenderRevision;
  const snapshots = set.draftSnapshots;
  if (
    !snapshots ||
    typeof snapshots !== "object" ||
    Array.isArray(snapshots) ||
    !(String(revision) in snapshots)
  )
    throw new Error("Saved revision snapshot missing");
  const draft = parseCardNewsDraft(snapshots[String(revision)]);
  const completed = set.jobs.find(
    (job) => job.status === "completed" && job.manifest && !job.outputRetiredAt,
  );
  if (!completed) throw new Error("No completed cover candidates");
  const manifest = parseCardNewsManifest(completed.manifest);
  const previousAttempt = set.jobs.find(
    (job) =>
      job.kind === "render" &&
      job.inputRevision === revision &&
      job.status === "failed",
  );
  const versions = previousAttempt
    ? parseCardNewsInput(previousAttempt.inputSnapshot)
    : manifest;
  const now = cardNewsRuntime().now();
  const deadlineAt = new Date(now.getTime() + CARD_NEWS_CONFIG.jobTimeoutMs);
  const jobId = randomUUID();
  const input = makeInput({
    userId: set.userId,
    setId,
    jobId,
    source: set.sourceSnapshot,
    sourceHash: set.sourceHash,
    revision,
    draft,
    coverCandidates: manifest.coverCandidates,
    deadlineAt,
    versions,
  });
  await createCardNewsJob(
    {
      id: jobId,
      userId: set.userId,
      setId,
      kind: "render",
      requestId: randomUUID(),
      requestHash: stableHash(input),
      inputRevision: revision,
      inputSnapshot: jsonValue(input),
      templateVersion: input.templateVersion,
      deadlineAt,
      nextDispatchAt: now,
    },
    tx,
  );
  await updateCardNewsSet(setId, { pendingRenderRevision: null }, tx);
  return jobId;
}

export async function saveCardNewsRevision(
  userId: string,
  payload: { setId: string; expectedRevision: number; draft: unknown },
): Promise<{ revision: number }> {
  const requested = editorDraftSchema.parse(payload.draft);
  return cardNewsTransaction(async (tx) => {
    const set = await lockedCardNewsSet(payload.setId, userId, tx);
    if (set.status !== "ready" || !set.draftDocument)
      throw new Error("Wait for the first complete result before editing");
    if (set.draftRevision !== payload.expectedRevision)
      throw new Error(
        "revision_conflict: A newer saved version exists. Your unsaved input is still available.",
      );
    const previous = editorDraftSchema.parse(set.draftDocument);
    if (
      requested.language !== previous.language ||
      requested.cards.length !== previous.cards.length ||
      requested.cards.some(
        (card) =>
          !previous.cards.some(
            (old) => old.id === card.id && old.role === card.role,
          ),
      )
    )
      throw new Error(
        "Card roles, IDs, language and card count cannot be changed",
      );
    const draft = parseCardNewsDraft(markEditedCards(previous, requested));
    const revision = set.draftRevision + 1;
    const snapshots =
      set.draftSnapshots &&
      typeof set.draftSnapshots === "object" &&
      !Array.isArray(set.draftSnapshots)
        ? set.draftSnapshots
        : {};
    if (String(revision) in snapshots)
      throw new Error("Immutable revision already exists");
    await updateCardNewsSet(
      set.id,
      {
        draftRevision: revision,
        draftDocument: jsonValue(draft),
        draftSnapshots: jsonValue({ ...snapshots, [revision]: draft }),
        pendingRenderRevision: revision,
      },
      tx,
    );
    const nextJobId = await enqueueNextRender(set.id, tx);
    const jobId =
      nextJobId ??
      set.jobs.find((job) => job.kind === "render" && isActive(job.status))?.id;
    if (jobId) {
      const analyticsJob = await findCardNewsJob(jobId, tx);
      await updateCardNewsJob(
        jobId,
        {
          pendingAnalytics: jsonValue([
            ...(Array.isArray(analyticsJob?.pendingAnalytics)
              ? analyticsJob.pendingAnalytics
              : []),
            queueAnalytics("card_news_edited", {
              setId: set.id,
              jobId,
              revision,
              cardCount: draft.cards.length,
              billingStatus: "free",
              editedFieldCount: previous.cards.reduce(
                (sum, card, index) =>
                  sum +
                  Number(stableHash(card) !== stableHash(draft.cards[index])),
                0,
              ),
            }),
          ]),
        },
        tx,
      );
    }
    return { revision };
  });
}

export async function retryCardNewsRender(
  userId: string,
  setId: string,
  revision: number,
): Promise<void> {
  await cardNewsTransaction(async (tx) => {
    const set = await lockedCardNewsSet(setId, userId, tx);
    if (set.status !== "ready" || revision !== set.draftRevision)
      throw new Error("Only the latest saved revision can be retried");
    if (
      set.jobs.some(
        (job) =>
          job.kind === "render" &&
          job.inputRevision === revision &&
          (isActive(job.status) || job.status === "completed"),
      )
    )
      return;
    await updateCardNewsSet(setId, { pendingRenderRevision: revision }, tx);
    await enqueueNextRender(setId, tx);
  });
}

export async function dispatchPendingCardNewsJobs(): Promise<void> {
  for (const job of await listRecoverableCardNewsJobs(
    cardNewsRuntime().now(),
    100,
  )) {
    await dispatchCardNewsJob(job.id);
    await flushCardNewsAnalytics(job.id);
  }
  for (const job of await listPendingCardNewsAnalyticsJobs(100))
    await flushCardNewsAnalytics(job.id);
}

export async function recoverCardNewsJobs(): Promise<void> {
  for (const job of await listRecoverableCardNewsJobs(
    cardNewsRuntime().now(),
    100,
  ))
    await reconcileCardNewsJob(job.id);
}
