"use server";

import { z } from "zod";
import {
  findAssetCleanupJobsForScope,
  hasDueActiveCardNewsJob,
  lockAssetCleanupJob,
  listUserAssetCleanupJobs,
  updateAssetCleanupJob,
  findCardNewsSet,
  listCardNewsSets,
  parseCardNewsManifest,
  toCardNewsDetail,
  toCardNewsSummary,
} from "~/fsd/entities/card-news/server";
import { kickMaintenanceDrain } from "~/inngest/maintenance-event";
import type {
  CardNewsDetail,
  CardNewsExport,
  CardNewsSummary,
} from "~/fsd/entities/card-news";
import { getUserCreditBalance } from "~/fsd/entities/user/server";
import { canUserAccessCardNews } from "./access";
import { failure, success, type ActionResult } from "~/fsd/shared/api/result";
import { cardNewsRuntime } from "./runtime-dependencies";
import {
  createPaidCardNews,
  retryCardNewsRender,
  saveCardNewsRevision,
} from "./job-lifecycle";
import { acceptCardNewsDeletion } from "./cleanup";
import { recordCardNewsDownload } from "./analytics";
import {
  cardNewsTransaction,
  lockedCardNewsSet,
  lockCardNewsScope,
} from "./reservation-tx";

export type AssetCleanupStatus = {
  id: string;
  kind: string;
  status: string;
  lastError: string | null;
  createdAt: string;
};

const id = z.string().min(1).max(100);
const createSchema = z
  .object({
    clipId: id,
    requestId: z.string().uuid(),
    theme: z.enum(["light", "dark"]).default("light"),
    analyticsContext: z.unknown().optional(),
  })
  .strict();
const regenerateSchema = createSchema.extend({ regeneratedFromId: id });

async function authenticatedAction<T>(
  action: (userId: string) => Promise<T>,
): Promise<ActionResult<T>> {
  const authentication = await cardNewsRuntime().authenticate();
  if (!authentication.success) return failure(authentication.error);
  try {
    return success(await action(authentication.data.userId));
  } catch (error) {
    return failure(
      error instanceof z.ZodError
        ? error.issues
            .map((issue) => `${issue.path.join(".")}: ${issue.message}`)
            .join("; ")
        : error instanceof Error
          ? error.message
          : "Card news request failed",
    );
  }
}

export async function createCardNews(
  raw: unknown,
): Promise<ActionResult<{ setId: string; jobId: string }>> {
  return authenticatedAction((userId) =>
    createPaidCardNews(userId, createSchema.parse(raw)),
  );
}

export async function regenerateCardNews(
  raw: unknown,
): Promise<ActionResult<{ setId: string; jobId: string }>> {
  return authenticatedAction((userId) =>
    createPaidCardNews(userId, regenerateSchema.parse(raw)),
  );
}

export async function listCardNews(
  raw: unknown = {},
): Promise<ActionResult<{ authUserId: string; sets: CardNewsSummary[] }>> {
  return authenticatedAction(async (userId) => {
    if (await hasDueActiveCardNewsJob(userId, new Date()))
      await kickMaintenanceDrain("card-news-read");
    const filter = z.object({ clipId: id.optional() }).strict().parse(raw);
    const sets = await listCardNewsSets(userId);
    return {
      authUserId: userId,
      sets: sets
        .filter((set) => !filter.clipId || set.clipId === filter.clipId)
        .map(toCardNewsSummary),
    };
  });
}

export async function getCardNewsDetail(
  raw: unknown,
): Promise<ActionResult<{ authUserId: string; detail: CardNewsDetail }>> {
  return authenticatedAction(async (userId) => {
    if (await hasDueActiveCardNewsJob(userId, new Date()))
      await kickMaintenanceDrain("card-news-read");
    const { setId } = z.object({ setId: id }).strict().parse(raw);
    const set = await findCardNewsSet(setId);
    if (!set || set.userId !== userId) throw new Error("Card news not found");
    const cleanups = await findAssetCleanupJobsForScope(userId, "set", setId);
    const detail = toCardNewsDetail(set, cleanups[0] ?? null);
    const complete = set.jobs.find(
      (job) =>
        job.status === "completed" &&
        job.inputRevision === set.publishedRevision &&
        !job.outputRetiredAt &&
        job.manifest,
    );
    if (
      !set.deletedAt &&
      !set.clip.deletedAt &&
      !set.clip.uploadedFile?.deletedAt
    ) {
      if (complete) {
        const manifest = parseCardNewsManifest(complete.manifest);
        detail.previewImages = await Promise.all(
          manifest.cards.map(async (card) => ({
            id: card.id,
            url: await cardNewsRuntime().signObject(card.key),
          })),
        );
        detail.coverCandidates = await Promise.all(
          manifest.coverCandidates.map(async (cover) => ({
            id: cover.id,
            url: await cardNewsRuntime().signObject(cover.key),
          })),
        );
      }
    }
    return cardNewsTransaction(async (tx) => {
      await lockCardNewsScope(
        {
          userId,
          uploadedFileId: set.uploadedFileId,
          clipId: set.clipId,
          setId,
        },
        tx,
      );
      const current = await findCardNewsSet(setId, tx);
      if (!current || current.userId !== userId)
        throw new Error("Card news not found");
      const currentCleanups = await findAssetCleanupJobsForScope(
        userId,
        "set",
        setId,
        tx,
      );
      const currentDetail = toCardNewsDetail(
        current,
        currentCleanups[0] ?? null,
      );
      const currentOutput = current.jobs.find((job) => job.id === complete?.id);
      if (
        !current.deletedAt &&
        !current.clip.deletedAt &&
        !current.clip.uploadedFile?.deletedAt &&
        current.publishedRevision === set.publishedRevision &&
        currentOutput?.status === "completed" &&
        !currentOutput.outputRetiredAt &&
        currentOutput.selectedManifestKey === complete?.selectedManifestKey
      ) {
        currentDetail.previewImages = detail.previewImages;
        currentDetail.coverCandidates = detail.coverCandidates;
      }
      return { authUserId: userId, detail: currentDetail };
    });
  });
}

export async function saveCardNews(
  raw: unknown,
): Promise<ActionResult<{ revision: number }>> {
  return authenticatedAction((userId) => {
    const parsed = z
      .object({
        setId: id,
        expectedRevision: z.number().int().positive(),
        draft: z.unknown(),
        analyticsContext: z.unknown().optional(),
      })
      .strict()
      .parse(raw);
    return saveCardNewsRevision(userId, { ...parsed, draft: parsed.draft });
  });
}

export async function retryCardNews(raw: unknown): Promise<ActionResult<void>> {
  return authenticatedAction(async (userId) => {
    const input = z
      .object({ setId: id, revision: z.number().int().positive() })
      .strict()
      .parse(raw);
    await retryCardNewsRender(userId, input.setId, input.revision);
  });
}

export async function exportCardNews(
  raw: unknown,
): Promise<ActionResult<CardNewsExport>> {
  return authenticatedAction(async (userId) => {
    const { setId, revision, analyticsContext } = z
      .object({
        setId: id,
        revision: z.number().int().positive(),
        analyticsContext: z.unknown().optional(),
      })
      .strict()
      .parse(raw);
    const set = await findCardNewsSet(setId);
    if (
      !set ||
      set.userId !== userId ||
      set.deletedAt ||
      set.clip.deletedAt ||
      set.clip.uploadedFile?.deletedAt
    )
      throw new Error("Card news not available");
    const selected = set.jobs.find(
      (job) =>
        job.inputRevision === revision &&
        job.status === "completed" &&
        !job.outputRetiredAt &&
        job.manifest,
    );
    if (!selected?.manifest)
      throw new Error("This version is not ready for download");
    const manifest = parseCardNewsManifest(selected.manifest);
    // Verify every output before issuing a new set of URLs; signing alone does not prove availability.
    await Promise.all(
      [...manifest.cards, manifest.zip].map((object) =>
        cardNewsRuntime().headObject(object.key),
      ),
    );
    const images = await Promise.all(
      manifest.cards.map(async (card, index) => {
        const filename = `${String(index + 1).padStart(2, "0")}-${index === 0 ? "cover" : index === manifest.cards.length - 1 ? "summary" : `card-${index + 1}`}.jpg`;
        return {
          id: card.id,
          filename,
          url: await cardNewsRuntime().signObject(card.key, undefined, {
            filename,
          }),
        };
      }),
    );
    const zipUrl = await cardNewsRuntime().signObject(
      manifest.zip.key,
      undefined,
      { filename: `card-news-v${revision}.zip` },
    );
    await cardNewsTransaction(async (tx) => {
      const current = await lockedCardNewsSet(setId, userId, tx);
      const output = current.jobs.find((job) => job.id === selected.id);
      if (
        !output ||
        output.outputRetiredAt ||
        output.selectedManifestKey !== selected.selectedManifestKey
      )
        throw new Error("This version is no longer available");
    });
    await recordCardNewsDownload({
      userId,
      setId,
      jobId: selected.id,
      revision,
      cardCount: images.length,
      analyticsContext,
      jobAnalyticsContext: selected.analyticsContext,
    });
    return {
      revision,
      images,
      zipUrl,
      caption: manifest.caption,
      hashtags: manifest.hashtags,
    };
  });
}

export async function deleteCardNews(
  raw: unknown,
): Promise<ActionResult<{ status: "deleting"; cleanupId: string }>> {
  return authenticatedAction((userId) =>
    acceptCardNewsDeletion(
      userId,
      z.object({ setId: id }).strict().parse(raw).setId,
    ),
  );
}

export async function getCardNewsCreationContext(): Promise<
  ActionResult<{
    userId: string;
    creditBalance: { owned: number; reserved: number; available: number };
    enabled: boolean;
    sets: CardNewsSummary[];
  }>
> {
  return authenticatedAction(async (userId) => ({
    userId,
    creditBalance: await getUserCreditBalance(userId),
    enabled: canUserAccessCardNews(userId),
    sets: (await listCardNewsSets(userId)).map(toCardNewsSummary),
  }));
}

export async function listAssetCleanupStatuses(): Promise<
  ActionResult<{ authUserId: string; cleanups: AssetCleanupStatus[] }>
> {
  return authenticatedAction(async (userId) => ({
    authUserId: userId,
    cleanups: (await listUserAssetCleanupJobs(userId, 20)).map((job) => ({
      id: job.id,
      kind: job.kind,
      status: job.status,
      lastError: job.lastError,
      createdAt: job.createdAt.toISOString(),
    })),
  }));
}

export async function retryAssetCleanup(
  raw: unknown,
): Promise<ActionResult<void>> {
  return authenticatedAction(async (userId) => {
    const { cleanupId } = z.object({ cleanupId: id }).strict().parse(raw);
    await cardNewsTransaction(async (tx) => {
      const job = await lockAssetCleanupJob(cleanupId, tx);
      if (job?.userId !== userId) throw new Error("Cleanup not found");
      if (job.status === "completed") return;
      if (job.leaseUntil && job.leaseUntil > cardNewsRuntime().now())
        throw new Error("Cleanup is already running");
      await updateAssetCleanupJob(
        job.id,
        {
          status: "pending",
          nextRetryAt: cardNewsRuntime().now(),
          leaseUntil: null,
        },
        tx,
      );
    });
  });
}
