import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { verificationRuntime } from "./card-news-verification-runtime.mts";

// The shared bootstrap rejects a missing, unconfirmed or current production DB
// before importing the DB client, and blocks real external service calls.
const runtime = await verificationRuntime();
const fixtureIds: string[] = [];
let restoreVideo = () => {};
let verificationError: unknown;
const cleanupErrors: unknown[] = [];

try {
  const video = await import("../src/fsd/features/upload/server.ts");
  const { replaceVideoProcessingRuntimeForTest } = await import(
    "../src/fsd/features/upload/api/video-runtime-dependencies.ts"
  );
  const { getAttemptOutputPrefix } = await import(
    "../src/fsd/entities/uploaded-file/index.ts"
  );
  const { createProcessingDispatch } = await import(
    "../src/fsd/entities/processing-dispatch/server.ts"
  );
  const { incrementUserCredits } = await import(
    "../src/fsd/entities/user/server.ts"
  );
  const { listAssetCleanupJobs } = await import(
    "../src/fsd/entities/card-news/server.ts"
  );

  // Recovery and legacy drain deliberately inspect global state. Never let
  // this verifier operate on someone else's active work, even in a test DB.
  assert.equal(
    await runtime.db.creditReservation.count({ where: { status: "held" } }),
    0,
    "Test DB must have no held reservations",
  );
  assert.equal(
    await runtime.db.uploadedFile.count({
      where: { status: { in: ["pending_enqueue", "queued", "processing"] } },
    }),
    0,
    "Test DB must have no active uploads",
  );
  assert.equal(
    await runtime.db.processingDispatch.count({
      where: { status: { in: ["pending", "sending"] } },
    }),
    0,
    "Test DB must have no pending dispatches",
  );
  assert.equal(
    await runtime.db.cardNewsJob.count({
      where: { status: { in: ["pending", "running"] } },
    }),
    0,
    "Test DB must have no active card news jobs",
  );

  let now = new Date();
  let workerEnabled = true;
  let admissionEnabled = true;
  let producerStatus: "pending" | "ended" | "unknown" = "pending";
  restoreVideo = replaceVideoProcessingRuntimeForTest({
    now: () => now,
    workerStartEnabled: () => workerEnabled,
    admissionEnabled: () => admissionEnabled,
    listObjects: async (prefix) =>
      [...runtime.objects.keys()]
        .filter((key) => key.startsWith(prefix))
        .sort(),
    headObject: async (key) => {
      const object = runtime.objects.get(key);
      if (!object) {
        const error = new Error("Missing fixture object");
        error.name = "NotFound";
        throw error;
      }
      return object;
    },
    producerStatus: async () => ({ schemaVersion: 1, status: producerStatus }),
  });

  async function fixture(
    credits: number,
    clipCount = 3,
    kind: "auto" | "analyze" | "render" = "auto",
    snapshotMode = kind,
  ) {
    const created = await runtime.createFixture(credits);
    fixtureIds.push(created.userId);
    // Existing production prefix logic uses the first path component. Give
    // every fixture a dedicated root so fake objects cannot cross attempts.
    const s3Key = `video-test-${randomUUID()}/source.mp4`;
    runtime.objects.set(s3Key, {
      contentLength: 100,
      contentType: "video/mp4",
      metadata: {},
    });
    const upload = await runtime.db.uploadedFile.update({
      where: { id: created.upload.id },
      data: {
        s3Key,
        status: "queued",
        currentAttempt: 2,
        targetClipCount: clipCount,
        language: "English",
      },
    });
    const prefix = getAttemptOutputPrefix(s3Key, 2);
    const dispatch = await createProcessingDispatch({
      uploadedFileId: upload.id,
      attempt: 2,
      kind,
      inputSnapshot: {
        clipCount,
        language: "English",
        outputPrefix: prefix,
        mode: snapshotMode,
        transcriptS3Key: null,
      },
    });
    // Queue delivery already happened; no event transport is invoked here.
    await runtime.db.processingDispatch.update({
      where: { id: dispatch.id },
      data: { status: "sent" },
    });
    const workerRunId = `test-run-${randomUUID()}`;
    return {
      ...created,
      upload,
      prefix,
      dispatch,
      workerRunId,
      args: {
        uploadedFileId: upload.id,
        attempt: 2,
        userId: created.userId,
        workerRunId,
      },
    };
  }
  // GPU upload_file sends no ContentType, so real clip objects carry S3's
  // default; the settlement must accept it (FEAT-63).
  function object(
    key: string,
    contentLength = 100,
    contentType = "binary/octet-stream",
  ) {
    runtime.objects.set(key, { contentLength, contentType, metadata: {} });
  }
  async function balance(userId: string, owned: number, reserved: number) {
    const actual = await runtime.assertBalance(userId);
    assert.equal(actual.credits, owned);
    assert.equal(actual.reservedCredits, reserved);
  }
  async function terminalUpload(uploadedFileId: string) {
    await runtime.db.uploadedFile.updateMany({
      where: {
        id: uploadedFileId,
        status: { in: ["queued", "pending_enqueue"] },
      },
      data: {
        status: "failed",
        failureCode: "worker_timeout",
        terminalStatusAt: now,
      },
    });
  }

  const partial = await fixture(3);
  const claims = await Promise.all(
    Array.from({ length: 20 }, () =>
      video.claimProcessingAttempt(partial.args),
    ),
  );
  assert.ok(claims.every((result) => result.status === "started"));
  assert.equal(
    await runtime.db.creditReservation.count({
      where: { userId: partial.userId },
    }),
    1,
  );
  await balance(partial.userId, 3, 3);
  assert.equal(
    (
      await video.claimProcessingAttempt({
        ...partial.args,
        workerRunId: "another-worker",
      })
    ).status,
    "already_processing",
  );
  const publishedKeys = [
    `${partial.prefix}/clip_0.mp4`,
    `${partial.prefix}/clip_1.mp4`,
  ];
  publishedKeys.forEach((key) => object(key));
  object(`${partial.prefix}/clip_2.mp4`, 0);
  object(`${partial.prefix}/clip_3.mp4`, 100, "text/plain");
  object(`${partial.prefix}/other.mp4`);
  const metadata = publishedKeys.map((s3Key, index) => ({
    index,
    s3Key,
    startSeconds: index * 10,
    endSeconds: index * 10 + 9,
    scriptText: `Published source ${index}.`,
    subtitleStatus: "ok",
  }));
  const settlements = await Promise.all(
    Array.from({ length: 20 }, () =>
      video.settleProcessingAttempt({
        ...partial.args,
        backendClips: metadata,
        failureCode: "backend_failed",
      }),
    ),
  );
  assert.equal(settlements.filter((result) => result.completed).length, 1);
  await balance(partial.userId, 1, 0);
  assert.equal(
    await runtime.db.clip.count({
      where: { uploadedFileId: partial.upload.id, processingAttempt: 2 },
    }),
    2,
  );
  const publishedUpload = await runtime.db.uploadedFile.findUniqueOrThrow({
    where: { id: partial.upload.id },
  });
  assert.equal(publishedUpload.status, "processed");
  assert.equal(publishedUpload.lastSuccessfulAttempt, 2);
  assert.equal(
    publishedUpload.failureCode,
    "partial_clips_after_backend_error",
  );
  const paid = await runtime.db.creditReservation.findFirstOrThrow({
    where: { userId: partial.userId },
  });
  assert.equal(paid.status, "settled");
  assert.equal(paid.chargedAmount, 2);

  // Terminal release cannot publish files that arrive after a failed attempt.
  const zero = await fixture(3);
  assert.equal(
    (await video.claimProcessingAttempt(zero.args)).status,
    "started",
  );
  const releases = await Promise.all(
    Array.from({ length: 20 }, () =>
      video.settleProcessingAttempt({
        ...zero.args,
        failureCode: "worker_timeout",
      }),
    ),
  );
  assert.equal(releases.filter((result) => result.completed).length, 1);
  await balance(zero.userId, 3, 0);
  object(`${zero.prefix}/clip_0.mp4`);
  assert.equal(
    (await video.settleProcessingAttempt(zero.args)).completed,
    false,
  );
  await video.reconcilePublishedVideoMetadata(zero.upload.id, 2, [
    { index: 0, s3Key: `${zero.prefix}/clip_0.mp4`, scriptText: "Late result" },
  ]);
  assert.equal(
    await runtime.db.clip.count({
      where: { uploadedFileId: zero.upload.id, processingAttempt: 2 },
    }),
    0,
  );

  // Late metadata can update a published row, never insert extra clips or
  // revive a tombstone. A newer parent attempt fences the old result too.
  await video.reconcilePublishedVideoMetadata(partial.upload.id, 2, [
    {
      index: 0,
      s3Key: publishedKeys[0]!,
      scriptText: "Updated published text",
    },
    {
      index: 5,
      s3Key: `${partial.prefix}/clip_5.mp4`,
      scriptText: "Not published",
    },
  ]);
  const publishedClip = await runtime.db.clip.findFirstOrThrow({
    where: {
      uploadedFileId: partial.upload.id,
      processingAttempt: 2,
      s3Key: publishedKeys[0],
    },
  });
  assert.equal(publishedClip.scriptText, "Updated published text");
  assert.equal(
    await runtime.db.clip.count({
      where: { uploadedFileId: partial.upload.id, processingAttempt: 2 },
    }),
    2,
  );
  await runtime.db.clip.update({
    where: { id: publishedClip.id },
    data: { deletedAt: now },
  });
  await video.reconcilePublishedVideoMetadata(partial.upload.id, 2, [
    { index: 0, s3Key: publishedClip.s3Key, scriptText: "Must not revive" },
  ]);
  assert.equal(
    (
      await runtime.db.clip.findUniqueOrThrow({
        where: { id: publishedClip.id },
      })
    ).scriptText,
    "Updated published text",
  );
  await runtime.db.uploadedFile.update({
    where: { id: partial.upload.id },
    data: { currentAttempt: 3 },
  });
  await video.reconcilePublishedVideoMetadata(partial.upload.id, 2, [
    { index: 1, s3Key: publishedKeys[1]!, scriptText: "Stale attempt" },
  ]);
  assert.equal(
    (
      await runtime.db.clip.findFirstOrThrow({
        where: {
          uploadedFileId: partial.upload.id,
          processingAttempt: 2,
          s3Key: publishedKeys[1],
        },
      })
    ).scriptText,
    "Published source 1.",
  );

  const analysis = await fixture(1, 3, "analyze");
  assert.equal(
    (await video.claimProcessingAttempt(analysis.args)).status,
    "started",
  );
  await balance(analysis.userId, 1, 0);
  assert.equal(
    await runtime.db.creditReservation.count({
      where: { userId: analysis.userId },
    }),
    0,
  );
  assert.equal(
    (
      await video.settleProcessingAttempt({
        ...analysis.args,
        failureCode: "analysis_timeout",
      })
    ).completed,
    true,
  );
  await balance(analysis.userId, 1, 0);
  const emptyAnalysis = await fixture(0, 3, "analyze");
  assert.equal(
    (await video.claimProcessingAttempt(emptyAnalysis.args)).status,
    "no_credits",
  );
  await balance(emptyAnalysis.userId, 0, 0);

  // Both products serialize on the same User row; only one can hold the last
  // available credit. These are real production action/claim transactions.
  const mixed = await fixture(1, 1);
  runtime.authenticate(mixed.userId);
  const [videoClaim, cardRequest] = await Promise.all([
    video.claimProcessingAttempt(mixed.args),
    runtime.actions.createCardNews({
      clipId: mixed.clip.id,
      requestId: randomUUID(),
      theme: "light",
    }),
  ]);
  assert.equal(
    Number(videoClaim.status === "started") + Number(cardRequest.success),
    1,
  );
  await balance(mixed.userId, 1, 1);
  if (cardRequest.success)
    await runtime.lifecycle.failCardNewsJob(
      cardRequest.data.jobId,
      "job_timeout",
    );
  if (videoClaim.status === "started")
    await video.settleProcessingAttempt({
      ...mixed.args,
      failureCode: "worker_timeout",
    });
  await terminalUpload(mixed.upload.id);
  await balance(mixed.userId, 1, 0);

  const purchased = await fixture(3);
  assert.equal(
    (await video.claimProcessingAttempt(purchased.args)).status,
    "started",
  );
  await incrementUserCredits(purchased.userId, 2);
  await balance(purchased.userId, 5, 3);
  await assert.rejects(
    runtime.db.user.update({
      where: { id: purchased.userId },
      data: { credits: 2 },
    }),
    "The database must reject owned credits below the active hold",
  );
  await assert.rejects(
    runtime.db.user.update({
      where: { id: purchased.userId },
      data: { reservedCredits: -1 },
    }),
    "The database must reject negative reserved credits",
  );
  await assert.rejects(
    runtime.db.creditReservation.update({
      where: { id: paid.id },
      data: { chargedAmount: 4 },
    }),
    "The database must reject charges above the original reservation",
  );
  await balance(purchased.userId, 5, 3);
  object(`${purchased.prefix}/clip_0.mp4`);
  object(`${purchased.prefix}/clip_1.mp4`);
  assert.equal(
    (await video.settleProcessingAttempt(purchased.args)).clipsFound,
    2,
  );
  await balance(purchased.userId, 3, 0);

  const mismatched = await fixture(3, 3, "analyze", "auto");
  assert.equal(
    await video.loadVideoProcessingContext(mismatched.upload.id, 2),
    null,
  );
  assert.equal(
    (await video.claimProcessingAttempt(mismatched.args)).status,
    "not_claimable",
  );
  await balance(mismatched.userId, 3, 0);
  await terminalUpload(mismatched.upload.id);
  const gated = await fixture(3);
  assert.equal(
    (
      await video.claimProcessingAttempt({
        ...gated.args,
        userId: mismatched.userId,
      })
    ).status,
    "not_claimable",
  );
  workerEnabled = false;
  assert.equal(
    (await video.claimProcessingAttempt(gated.args)).status,
    "not_claimable",
  );
  workerEnabled = true;
  assert.equal(
    (await video.claimProcessingAttempt(gated.args)).status,
    "started",
  );
  workerEnabled = false;
  assert.equal(
    (await video.claimProcessingAttempt(gated.args)).status,
    "started",
    "An already claimed run can resume during admission freeze",
  );
  workerEnabled = true;
  assert.equal(await video.beginProcessingSpawn(gated.args), true);
  await video.markProcessingSpawnUnknown(gated.args);
  assert.equal(
    await video.beginProcessingSpawn(gated.args),
    false,
    "Ambiguous spawn must never be submitted twice",
  );
  assert.equal(
    (
      await runtime.db.processingDispatch.findUniqueOrThrow({
        where: { id: gated.dispatch.id },
      })
    ).modalSpawnState,
    "unknown",
  );
  await video.recordProcessingSpawnResult({
    ...gated.args,
    response: { status: "accepted", call_id: "fc-video-fixture" },
  });
  assert.equal(
    (
      await runtime.db.processingDispatch.findUniqueOrThrow({
        where: { id: gated.dispatch.id },
      })
    ).modalCallId,
    "fc-video-fixture",
  );
  await assert.rejects(
    video.recordProcessingSpawnResult({
      ...gated.args,
      response: { status: "accepted" },
    }),
  );
  await assert.rejects(
    video.recordProcessingSpawnResult({
      ...gated.args,
      response: { status: "accepted", call_id: "fc-conflict" },
    }),
  );
  await video.settleProcessingAttempt({
    ...gated.args,
    failureCode: "worker_timeout",
  });

  // A deadline settles money independently of producer liveness. Unknown
  // producers remain an explicit cleanup barrier after the reservation ends.
  const expired = await fixture(3);
  assert.equal(
    (await video.claimProcessingAttempt(expired.args)).status,
    "started",
  );
  assert.equal(await video.beginProcessingSpawn(expired.args), true);
  await video.markProcessingSpawnUnknown(expired.args);
  object(`${expired.prefix}/clip_0.mp4`);
  now = new Date(now.getTime() + 66 * 60_000);
  const recovery = await video.reconcileVideoReservations();
  assert.equal(recovery.settled, 1);
  await balance(expired.userId, 2, 0);
  const cleanup = await runtime.db.assetCleanupJob.findFirstOrThrow({
    where: { scopeId: expired.dispatch.id },
  });
  const references = cleanup.producerReferences as unknown as {
    ended: boolean;
    modalCallId: string | null;
  }[];
  assert.equal(references[0]?.ended, false);
  assert.equal(references[0]?.modalCallId, null);
  assert.equal(cleanup.status, "pending");

  const confirmed = await fixture(1, 1);
  assert.equal(
    (await video.claimProcessingAttempt(confirmed.args)).status,
    "started",
  );
  assert.equal(await video.beginProcessingSpawn(confirmed.args), true);
  await video.recordProcessingSpawnResult({
    ...confirmed.args,
    response: { status: "accepted", call_id: "fc-ended-fixture" },
  });
  producerStatus = "ended";
  // The first observation only records the end; the webhook's own settlement
  // gets PRODUCER_END_SETTLE_GRACE_MS before recovery takes over (FEAT-63).
  assert.equal((await video.reconcileVideoReservations()).settled, 0);
  await balance(confirmed.userId, 1, 1);
  assert.equal(
    (
      await runtime.db.processingDispatch.findUniqueOrThrow({
        where: { id: confirmed.dispatch.id },
      })
    ).modalSpawnState,
    "ended",
  );
  now = new Date(now.getTime() + 5 * 60_000);
  assert.equal((await video.reconcileVideoReservations()).settled, 1);
  await balance(confirmed.userId, 1, 0);

  // A permanently unknown producer must not occupy every cleanup batch. Use
  // a batch of one to exercise the same ordering boundary deterministically.
  const fairIds = Array.from({ length: 3 }, () => `cn-fair-${randomUUID()}`);
  await runtime.db.assetCleanupJob.createMany({
    data: fairIds.map((id, index) => ({
      id,
      userId: expired.userId,
      kind: "orphan",
      scopeId: expired.dispatch.id,
      scopeSnapshot: {
        scopeKind: "video-attempt",
        dispatchId: expired.dispatch.id,
      },
      dedicatedPrefixes: [`${expired.prefix}/fairness-${index}/`],
      producerReferences:
        index < 2
          ? [
              {
                kind: "video",
                referenceId: expired.dispatch.id,
                modalCallId: null,
                ended: false,
              },
            ]
          : [],
      notBefore: new Date("1900-01-01T00:00:00.000Z"),
      updatedAt: new Date(
        new Date("1900-01-01T00:00:00.000Z").getTime() + index,
      ),
    })),
  });
  for (const id of fairIds.slice(0, 2)) {
    assert.equal((await listAssetCleanupJobs(now, 1))[0]?.id, id);
    await runtime.cleanup.runCardNewsCleanup(id);
    runtime.advance(120_000);
  }
  assert.equal((await listAssetCleanupJobs(now, 1))[0]?.id, fairIds[2]);
  await runtime.cleanup.runCardNewsCleanup(fairIds[2]!);
  assert.equal(
    (
      await runtime.db.assetCleanupJob.findUniqueOrThrow({
        where: { id: fairIds[2] },
      })
    ).status,
    "completed",
  );
  assert.equal(
    (
      await runtime.db.assetCleanupJob.findUniqueOrThrow({
        where: { id: fairIds[0] },
      })
    ).status,
    "retryable_failed",
  );

  // The operational writer verifies both gates and the entire frozen legacy
  // scope. Place the fixture before a historical cutoff so no ordinary test
  // data is marked ended. A preexisting legacy target makes this fail closed.
  const legacy = await runtime.createFixture(1);
  fixtureIds.push(legacy.userId);
  const legacyDispatch = await runtime.db.processingDispatch.create({
    data: {
      uploadedFileId: legacy.upload.id,
      attempt: 1,
      kind: "auto",
      status: "sent",
      createdAt: new Date("1900-01-01T00:00:00.000Z"),
      modalSpawnState: "unknown",
    },
  });
  const receipt = {
    schemaVersion: 1,
    cutoff: "1901-01-01T00:00:00.000Z",
    confirmedAt: new Date().toISOString(),
    workspaceId: "isolated-test",
    environmentId: "isolated-test",
    deployments: { web: "test-web", inngest: "test-inngest", gpu: "test-gpu" },
    evidence: {
      reference: "test-fixture-only",
      modalActive: 0,
      inngestActive: 0,
      queued: 0,
      retries: 0,
      callbacks: 0,
      dispatches: 0,
    },
    targets: [
      {
        dispatchId: legacyDispatch.id,
        uploadedFileId: legacy.upload.id,
        attempt: 1,
        outputPrefix: getAttemptOutputPrefix(legacy.upload.s3Key, 1),
      },
    ],
  };
  const rawReceipt = JSON.stringify(receipt);
  await assert.rejects(video.recordLegacyProducerDrain(rawReceipt));
  workerEnabled = false;
  admissionEnabled = false;
  const dryRun = await video.recordLegacyProducerDrain(rawReceipt);
  assert.equal(dryRun.applied, false);
  assert.equal(dryRun.targetCount, 1);
  assert.equal(
    (
      await runtime.db.processingDispatch.findUniqueOrThrow({
        where: { id: legacyDispatch.id },
      })
    ).modalSpawnState,
    "unknown",
  );
  await assert.rejects(
    video.recordLegacyProducerDrain(
      JSON.stringify({ ...receipt, targets: [] }),
      { apply: true },
    ),
  );
  await assert.rejects(
    video.recordLegacyProducerDrain(
      JSON.stringify({
        ...receipt,
        targets: [
          { ...receipt.targets[0], outputPrefix: "wrong-owner/attempt-1" },
        ],
      }),
      { apply: true },
    ),
  );
  const applied = await video.recordLegacyProducerDrain(rawReceipt, {
    apply: true,
  });
  assert.equal(applied.applied, true);
  assert.equal(
    (await video.recordLegacyProducerDrain(rawReceipt, { apply: true }))
      .receiptSha256,
    applied.receiptSha256,
  );
  await balance(legacy.userId, 1, 0);
  const endedLegacy = await runtime.db.processingDispatch.findUniqueOrThrow({
    where: { id: legacyDispatch.id },
  });
  assert.equal(endedLegacy.modalSpawnState, "ended");
  assert.equal(
    (endedLegacy.producerEndEvidence as { kind?: unknown })?.kind,
    "legacy-drain",
  );

  console.log(
    "Video compatibility: partial and zero settlement, analysis, shared credit races, credit purchase preservation, source fencing, spawn identity, global recovery and legacy drain scope passed",
  );
} catch (error) {
  verificationError = error;
} finally {
  // Use the production release path even when an assertion failed halfway
  // through a claimed fixture. Held dispatches cannot be deleted by triggers.
  try {
    const video = await import("../src/fsd/features/upload/server.ts");
    const held = await runtime.db.processingDispatch.findMany({
      where: {
        uploadedFile: { userId: { in: fixtureIds } },
        reservation: { status: "held" },
      },
    });
    for (const dispatch of held) {
      const source = dispatch.inputSnapshot as {
        outputPrefix?: unknown;
      } | null;
      if (typeof source?.outputPrefix === "string")
        for (const key of runtime.objects.keys())
          if (key.startsWith(`${source.outputPrefix}/`))
            runtime.objects.delete(key);
      const upload = await runtime.db.uploadedFile.findUniqueOrThrow({
        where: { id: dispatch.uploadedFileId },
      });
      await video.settleProcessingAttempt({
        uploadedFileId: upload.id,
        attempt: dispatch.attempt,
        userId: upload.userId,
        failureCode: "worker_timeout",
      });
    }
    assert.equal(
      await runtime.db.creditReservation.count({
        where: { userId: { in: fixtureIds }, status: "held", kind: "video" },
      }),
      0,
      "Fixture teardown must release every video hold",
    );
  } catch (error) {
    cleanupErrors.push(error);
  }
  try {
    await runtime.dispose();
  } catch (error) {
    cleanupErrors.push(error);
  } finally {
    restoreVideo();
  }
}

if (cleanupErrors.length)
  throw new AggregateError(
    [
      ...(verificationError === undefined ? [] : [verificationError]),
      ...cleanupErrors,
    ],
    "Video verification or fixture cleanup failed",
  );
if (verificationError !== undefined) throw verificationError;
