import "server-only";
import { createHash } from "node:crypto";
import { z } from "zod";
import { db } from "~/server/db";
import { lockUserForCredits } from "~/fsd/entities/user/server";
import { getAttemptOutputPrefix } from "~/fsd/entities/uploaded-file";
import { lockUploadedFileForProcessing } from "~/fsd/entities/uploaded-file/server";
import {
  findLegacyProducerDrainState,
  lockProcessingDispatch,
  updateProcessingDispatch,
} from "~/fsd/entities/processing-dispatch/server";
import { videoProcessingRuntime } from "./video-runtime-dependencies";

const identifier = z.string().min(1).max(200);
const receiptSchema = z
  .object({
    schemaVersion: z.literal(1),
    cutoff: z.string().datetime(),
    confirmedAt: z.string().datetime(),
    workspaceId: identifier,
    environmentId: identifier,
    deployments: z
      .object({ web: identifier, inngest: identifier, gpu: identifier })
      .strict(),
    evidence: z
      .object({
        reference: z.string().min(1).max(1000),
        modalActive: z.literal(0),
        inngestActive: z.literal(0),
        queued: z.literal(0),
        retries: z.literal(0),
        callbacks: z.literal(0),
        dispatches: z.literal(0),
      })
      .strict(),
    targets: z
      .array(
        z
          .object({
            dispatchId: identifier,
            uploadedFileId: identifier,
            attempt: z.number().int().positive(),
            outputPrefix: z.string().min(1).max(1000),
          })
          .strict(),
      )
      .max(10000),
  })
  .strict();

/** Trusted operational entry, never a Server Action. External zero-run evidence is independently reviewed. */
export async function recordLegacyProducerDrain(
  rawReceipt: string,
  options: { apply?: boolean } = {},
): Promise<{ applied: boolean; targetCount: number; receiptSha256: string }> {
  if (
    videoProcessingRuntime().admissionEnabled() ||
    videoProcessingRuntime().workerStartEnabled()
  )
    throw new Error("Both video admission gates must be closed");
  const receipt = receiptSchema.parse(JSON.parse(rawReceipt) as unknown);
  const cutoff = new Date(receipt.cutoff);
  const confirmedAt = new Date(receipt.confirmedAt);
  if (cutoff > confirmedAt || confirmedAt > new Date())
    throw new Error("Invalid drain confirmation time");
  const receiptSha256 = createHash("sha256").update(rawReceipt).digest("hex");
  const targetIds = receipt.targets.map((target) => target.dispatchId);
  if (new Set(targetIds).size !== targetIds.length)
    throw new Error("Duplicate drain target");
  return db.$transaction(async (tx) => {
    let state = await findLegacyProducerDrainState(cutoff, tx);
    for (const userId of [
      ...new Set(state.dispatches.map((entry) => entry.uploadedFile.userId)),
    ].sort())
      await lockUserForCredits(userId, tx);
    for (const uploadId of [
      ...new Set(state.dispatches.map((entry) => entry.uploadedFileId)),
    ].sort())
      await lockUploadedFileForProcessing(uploadId, tx);
    for (const id of state.dispatches.map((entry) => entry.id).sort())
      await lockProcessingDispatch(id, tx);
    state = await findLegacyProducerDrainState(cutoff, tx);
    if (state.activeUploads || state.pendingDispatches)
      throw new Error("Database video drain is incomplete");
    const actual = state.dispatches.map((entry) => ({
      dispatchId: entry.id,
      uploadedFileId: entry.uploadedFileId,
      attempt: entry.attempt,
      outputPrefix: getAttemptOutputPrefix(
        entry.uploadedFile.s3Key,
        entry.attempt,
      ),
    }));
    const targets = [...receipt.targets].sort((left, right) =>
      left.dispatchId.localeCompare(right.dispatchId),
    );
    if (JSON.stringify(actual) !== JSON.stringify(targets))
      throw new Error(
        "Frozen legacy target scope no longer matches the database",
      );
    for (const entry of state.dispatches) {
      if (
        ["pending_enqueue", "queued", "processing"].includes(
          entry.uploadedFile.status,
        )
      )
        throw new Error("Active legacy target cannot be marked ended");
      if (
        entry.modalSpawnState === "ended" &&
        entry.producerEndEvidence !== null
      ) {
        const proof = entry.producerEndEvidence as { receiptSha256?: unknown };
        if (proof.receiptSha256 !== receiptSha256)
          throw new Error(
            "Legacy target already has a different termination receipt",
          );
      }
      if (options.apply)
        await updateProcessingDispatch(
          entry.id,
          {
            modalSpawnState: "ended",
            producerEndEvidence: {
              kind: "legacy-drain",
              receiptSha256,
              cutoff: receipt.cutoff,
              confirmedAt: receipt.confirmedAt,
              workspaceId: receipt.workspaceId,
              environmentId: receipt.environmentId,
              deployments: receipt.deployments,
              evidenceReference: receipt.evidence.reference,
              binding: actual.find((target) => target.dispatchId === entry.id)!,
            },
          },
          tx,
        );
    }
    return {
      applied: Boolean(options.apply),
      targetCount: actual.length,
      receiptSha256,
    };
  });
}
