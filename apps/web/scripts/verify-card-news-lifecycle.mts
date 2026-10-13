import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { verificationRuntime } from "./card-news-verification-runtime.mts";

const runtime = await verificationRuntime();
try {
  const { cardNewsRuntime, replaceCardNewsRuntimeForTest } = await import(
    "../src/fsd/features/card-news/api/runtime-dependencies.ts"
  );
  async function verifyOverdueWinner(
    jobId: string,
    userId: string,
    paid: boolean,
  ) {
    const dependencies = cardNewsRuntime();
    let injected = false;
    let cleanupId = "";
    const restore = replaceCardNewsRuntimeForTest({
      ...dependencies,
      readObject: async (key) => {
        const text = await dependencies.readObject(key);
        const manifest = JSON.parse(text);
        if (manifest.jobId === jobId && !injected) {
          injected = true;
          const job = await runtime.db.cardNewsJob.findUniqueOrThrow({
            where: { id: jobId },
            include: { invocations: true },
          });
          runtime.advance(15 * 60_000 + 1);
          const late = await runtime.lifecycle.acceptCardNewsCallback({
            schemaVersion: 1,
            jobId,
            executionEpoch: job.executionEpoch,
            revision: job.inputRevision,
            invocationId: manifest.invocationId,
            modalCallId: job.invocations[0]!.modalCallId,
            outcome: "completed",
            sequence: 5,
            stage: "completed",
            manifestKey: key,
            failureCode: null,
          });
          assert.equal(late.accepted, false);
          assert.equal(
            await runtime.db.assetCleanupJob.count({
              where: { kind: "orphan", scopeId: jobId },
            }),
            0,
            "overdue active callback must leave cleanup to final reconciliation",
          );
          const input = job.inputSnapshot as { outputPrefix: string };
          const stale = await runtime.db.assetCleanupJob.create({
            data: {
              userId,
              kind: "orphan",
              scopeId: jobId,
              scopeSnapshot: {
                jobId,
                setId: job.setId,
                epoch: job.executionEpoch,
              },
              dedicatedPrefixes: [input.outputPrefix],
              retainedReferences: [],
              producerReferences: [],
            },
          });
          cleanupId = stale.id;
          await runtime.cleanup.runCardNewsCleanup(cleanupId);
          assert.ok(
            runtime.objects.has(key),
            "active recovery candidate must survive stale orphan cleanup",
          );
          assert.notEqual(
            (
              await runtime.db.assetCleanupJob.findUniqueOrThrow({
                where: { id: cleanupId },
              })
            ).status,
            "completed",
          );
        }
        return text;
      },
    });
    let completed;
    try {
      completed = await runtime.complete(jobId);
    } finally {
      restore();
    }
    assert.ok(injected);
    const balance = await runtime.assertBalance(userId);
    assert.equal(balance.credits, 0);
    assert.equal(balance.reservedCredits, 0);
    assert.equal(
      await runtime.db.creditReservation.count({ where: { userId } }),
      1,
    );
    const selected = await runtime.db.cardNewsJob.findUniqueOrThrow({
      where: { id: jobId },
    });
    assert.equal(selected.status, "completed");
    assert.equal(selected.reservationId !== null, paid);
    const retained = await runtime.db.assetCleanupJob.findUniqueOrThrow({
      where: { id: cleanupId },
    });
    assert.ok(
      (retained.retainedReferences as string[]).some((prefix) =>
        completed.manifestKey.startsWith(prefix),
      ),
    );
    await runtime.db.assetCleanupJob.update({
      where: { id: cleanupId },
      data: { retainedReferences: [] },
    });
    runtime.producerStatus("ended");
    await runtime.cleanup.runCardNewsCleanup(cleanupId);
    assert.ok(
      runtime.objects.has(completed.manifestKey),
      "terminal orphan refresh must preserve selected manifest",
    );
    for (const output of [
      ...(completed.manifest.cards as { key: string }[]),
      ...(completed.manifest.coverCandidates as { key: string }[]),
      completed.manifest.zip as { key: string },
    ])
      assert.ok(
        runtime.objects.has(output.key),
        "published paid/free output must survive orphan cleanup",
      );
    runtime.authenticate(userId);
    assert.ok(
      (
        await runtime.actions.exportCardNews({
          setId: selected.setId,
          revision: selected.inputRevision,
        })
      ).success,
    );
    return selected.setId;
  }
  const overdue = await runtime.createFixture(1);
  const overdueCreated = await runtime.actions.createCardNews({
    clipId: overdue.clip.id,
    requestId: randomUUID(),
    theme: "light",
  });
  assert.ok(overdueCreated.success);
  const overdueSetId = await verifyOverdueWinner(
    overdueCreated.data.jobId,
    overdue.userId,
    true,
  );
  const overdueDetail = await runtime.actions.getCardNewsDetail({
    setId: overdueSetId,
  });
  assert.ok(overdueDetail.success && overdueDetail.data.detail.draftDocument);
  const overdueDraft = structuredClone(overdueDetail.data.detail.draftDocument);
  overdueDraft.hashtags = ["#example-topic"];
  const freeSaved = await runtime.actions.saveCardNews({
    setId: overdueSetId,
    expectedRevision: 1,
    draft: overdueDraft,
  });
  assert.ok(freeSaved.success);
  const overdueRender = await runtime.db.cardNewsJob.findFirstOrThrow({
    where: { setId: overdueSetId, kind: "render", status: "pending" },
  });
  await verifyOverdueWinner(overdueRender.id, overdue.userId, false);
  const fixture = await runtime.createFixture(3);
  runtime.authenticate(null);
  assert.equal(
    (
      await runtime.actions.createCardNews({
        clipId: fixture.clip.id,
        requestId: randomUUID(),
      })
    ).success,
    false,
  );
  const other = await runtime.createFixture();
  assert.equal(
    (
      await runtime.actions.createCardNews({
        clipId: fixture.clip.id,
        requestId: randomUUID(),
      })
    ).success,
    false,
  );
  runtime.authenticate(fixture.userId);
  const created = await runtime.actions.createCardNews({
    clipId: fixture.clip.id,
    requestId: randomUUID(),
    theme: "light",
  });
  assert.ok(created.success);
  assert.equal(
    (await runtime.actions.deleteCardNews({ setId: created.data.setId }))
      .success,
    false,
  );
  await runtime.complete(created.data.jobId);
  const detail = await runtime.actions.getCardNewsDetail({
    setId: created.data.setId,
  });
  assert.ok(detail.success);
  assert.ok(detail.data.detail.draftDocument);
  const original = detail.data.detail.draftDocument;
  const edited = structuredClone(original);
  edited.cards[1]!.title = "Saved manual edit";
  const first = await runtime.actions.saveCardNews({
    setId: created.data.setId,
    expectedRevision: 1,
    draft: edited,
  });
  assert.ok(first.success);
  assert.equal(first.data.revision, 2);
  const conflict = await runtime.actions.saveCardNews({
    setId: created.data.setId,
    expectedRevision: 1,
    draft: edited,
  });
  assert.equal(conflict.success, false);
  const third = structuredClone(edited);
  third.caption = "Third revision";
  assert.ok(
    (
      await runtime.actions.saveCardNews({
        setId: created.data.setId,
        expectedRevision: 2,
        draft: third,
      })
    ).success,
  );
  const fourth = structuredClone(third);
  fourth.caption = "Fourth revision";
  assert.ok(
    (
      await runtime.actions.saveCardNews({
        setId: created.data.setId,
        expectedRevision: 3,
        draft: fourth,
      })
    ).success,
  );
  const set = await runtime.db.cardNewsSet.findUniqueOrThrow({
    where: { id: created.data.setId },
    include: { jobs: true },
  });
  assert.equal(set.pendingRenderRevision, 4);
  assert.equal(Object.keys(set.draftSnapshots as object).length, 4);
  const render2 = set.jobs.find(
    (job) => job.kind === "render" && job.inputRevision === 2,
  )!;
  await runtime.complete(render2.id);
  const active = await runtime.db.cardNewsJob.findFirstOrThrow({
    where: { setId: set.id, kind: "render", status: "pending" },
  });
  assert.equal(active.inputRevision, 4);
  assert.equal(
    await runtime.db.cardNewsJob.count({
      where: { setId: set.id, inputRevision: 3 },
    }),
    0,
  );
  await runtime.complete(active.id);
  assert.equal((await runtime.assertBalance(fixture.userId)).credits, 2);
  assert.equal(runtime.cpuCalls(), 0);
  const previous = await runtime.actions.exportCardNews({
    setId: set.id,
    revision: 2,
  });
  assert.ok(previous.success);
  assert.equal(previous.data.caption, edited.caption);
  runtime.authenticate(other.userId);
  assert.equal(
    (await runtime.actions.getCardNewsDetail({ setId: set.id })).success,
    false,
  );
  assert.equal(
    (await runtime.actions.exportCardNews({ setId: set.id, revision: 4 }))
      .success,
    false,
  );
  runtime.authenticate(fixture.userId);
  const handler = await import("../src/app/api/webhooks/card-news/route.ts");
  assert.equal(
    (
      await handler.POST(
        new Request("https://web.invalid/api/webhooks/card-news", {
          method: "POST",
          body: "{}",
        }),
      )
    ).status,
    401,
  );
  const deleted = await runtime.actions.deleteCardNews({ setId: set.id });
  assert.ok(deleted.success);
  assert.equal(
    (await runtime.actions.exportCardNews({ setId: set.id, revision: 4 }))
      .success,
    false,
  );
  runtime.producerStatus("unknown");
  await runtime.cleanup.runCardNewsCleanup(deleted.data.cleanupId);
  assert.notEqual(
    (
      await runtime.db.assetCleanupJob.findUniqueOrThrow({
        where: { id: deleted.data.cleanupId },
      })
    ).status,
    "completed",
  );
  runtime.advance(60_000);
  runtime.producerStatus("ended");
  await runtime.cleanup.runCardNewsCleanup(deleted.data.cleanupId);
  assert.equal(
    await runtime.db.cardNewsSet.count({ where: { id: set.id } }),
    0,
  );
  assert.equal(
    await runtime.db.clip.count({ where: { id: fixture.clip.id } }),
    1,
  );
  assert.ok(runtime.objects.has(fixture.upload.s3Key));
  console.log(
    "Card news lifecycle: authentication, immutable/coalesced revisions, export, tombstones and producer-fenced cleanup passed",
  );
} finally {
  await runtime.dispose();
}
