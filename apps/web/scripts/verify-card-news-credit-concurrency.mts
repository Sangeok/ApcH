import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { verificationRuntime } from "./card-news-verification-runtime.mts";

const runtime = await verificationRuntime();
try {
  const fixture = await runtime.createFixture(1);
  const requestId = randomUUID();
  const attempts = await Promise.all(
    Array.from({ length: 20 }, () =>
      runtime.actions.createCardNews({
        clipId: fixture.clip.id,
        requestId,
        theme: "light",
      }),
    ),
  );
  assert.ok(attempts.every((result) => result.success));
  const jobs = new Set(
    attempts
      .filter((result) => result.success)
      .map((result) => result.data.jobId),
  );
  assert.equal(jobs.size, 1);
  const jobId = [...jobs][0]!;
  const reserved = await runtime.assertBalance(fixture.userId);
  assert.equal(reserved.credits, 1);
  assert.equal(reserved.reservedCredits, 1);
  const conflict = await runtime.actions.createCardNews({
    clipId: fixture.clip.id,
    requestId,
    theme: "dark",
  });
  assert.equal(conflict.success, false);
  const extra = await runtime.actions.createCardNews({
    clipId: fixture.clip.id,
    requestId: randomUUID(),
    theme: "light",
  });
  assert.equal(extra.success, false);
  const completed = await runtime.complete(jobId);
  await Promise.all(
    Array.from({ length: 20 }, () =>
      runtime.lifecycle.acceptCardNewsCallback({
        ...completed.callback,
        outcome: "completed",
        sequence: 5,
        stage: "completed",
        manifestKey: completed.manifestKey,
      }),
    ),
  );
  const settled = await runtime.assertBalance(fixture.userId);
  assert.equal(settled.credits, 0);
  assert.equal(settled.reservedCredits, 0);
  assert.equal(
    await runtime.db.creditReservation.count({
      where: { userId: fixture.userId },
    }),
    1,
  );
  const failureFixture = await runtime.createFixture(1);
  const created = await runtime.actions.createCardNews({
    clipId: failureFixture.clip.id,
    requestId: randomUUID(),
    theme: "light",
  });
  assert.ok(created.success);
  await Promise.all(
    Array.from({ length: 20 }, () =>
      runtime.lifecycle.failCardNewsJob(created.data.jobId, "job_timeout"),
    ),
  );
  const released = await runtime.assertBalance(failureFixture.userId);
  assert.equal(released.credits, 1);
  assert.equal(released.reservedCredits, 0);
  const constraints = await runtime.db.$queryRaw<
    { conname: string }[]
  >`SELECT conname::text AS conname FROM pg_constraint WHERE conrelid IN ('"User"'::regclass, '"CreditReservation"'::regclass, '"CardNewsJob"'::regclass)`;
  assert.ok(constraints.some((row) => row.conname.includes("balance")));
  assert.ok(constraints.some((row) => row.conname.includes("amount")));
  console.log(
    "Card news concurrency: idempotency, request conflict, exactly-once settle/release and held balance checks passed",
  );
} finally {
  await runtime.dispose();
}
