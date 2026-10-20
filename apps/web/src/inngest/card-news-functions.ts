import { inngest } from "./client";
import {
  claimCardNewsJob,
  runCardNewsCleanup,
  dispatchCardNewsJob,
  flushCardNewsAnalytics,
  reconcileCardNewsJob,
  prepareCardNewsCpuSpawn,
  callCardNewsCpu,
  recordCardNewsCpuSpawn,
} from "~/fsd/features/card-news/server";
import {
  listRecoverableCardNewsJobs,
  listPendingCardNewsAnalyticsJobs,
  listAssetCleanupJobs,
} from "~/fsd/entities/card-news/server";

export const generateCardNews = inngest.createFunction(
  {
    id: "generate-card-news",
    retries: 1,
    concurrency: { limit: 1, key: "event.data.jobId" },
  },
  { event: "card-news/generate.requested" },
  async ({ event, step, runId }) => {
    const context = await step.run("claim-generation", () =>
      claimCardNewsJob(
        event.data.jobId,
        event.data.executionEpoch,
        event.data.revision,
        runId,
      ),
    );
    if (!context) return { ignored: true };
    const input = await step.run("prepare-generation-spawn", () =>
      prepareCardNewsCpuSpawn(event.data.jobId, runId),
    );
    if (input) {
      const accepted = await step.run("call-generation-cpu", () =>
        callCardNewsCpu(input),
      );
      await step.run("persist-generation-call-id", () =>
        recordCardNewsCpuSpawn(event.data.jobId, accepted),
      );
    }
    for (let round = 0; round < 30; round += 1) {
      const terminal = await step.run(`reconcile-generation-${round}`, () =>
        reconcileCardNewsJob(event.data.jobId),
      );
      if (terminal) return { terminal: true };
      await step.waitForEvent(`wait-generation-${round}`, {
        event: "card-news/completed",
        timeout: "30s",
        match: "data.matchKey",
      });
    }
    await step.run("final-generation-reconciliation", () =>
      reconcileCardNewsJob(event.data.jobId),
    );
    return { recoveryPending: true };
  },
);

export const renderCardNews = inngest.createFunction(
  {
    id: "render-card-news",
    retries: 1,
    concurrency: { limit: 1, key: "event.data.jobId" },
  },
  { event: "card-news/render.requested" },
  async ({ event, step, runId }) => {
    const context = await step.run("claim-render", () =>
      claimCardNewsJob(
        event.data.jobId,
        event.data.executionEpoch,
        event.data.revision,
        runId,
      ),
    );
    if (!context) return { ignored: true };
    const input = await step.run("prepare-render-spawn", () =>
      prepareCardNewsCpuSpawn(event.data.jobId, runId),
    );
    if (input) {
      const accepted = await step.run("call-render-cpu", () =>
        callCardNewsCpu(input),
      );
      await step.run("persist-render-call-id", () =>
        recordCardNewsCpuSpawn(event.data.jobId, accepted),
      );
    }
    for (let round = 0; round < 30; round += 1) {
      const terminal = await step.run(`reconcile-render-${round}`, () =>
        reconcileCardNewsJob(event.data.jobId),
      );
      if (terminal) return { terminal: true };
      await step.waitForEvent(`wait-render-${round}`, {
        event: "card-news/completed",
        timeout: "30s",
        match: "data.matchKey",
      });
    }
    await step.run("final-render-reconciliation", () =>
      reconcileCardNewsJob(event.data.jobId),
    );
    return { recoveryPending: true };
  },
);

export const dispatchPendingCardNews = inngest.createFunction(
  { id: "dispatch-pending-card-news", retries: 1, concurrency: 1 },
  { cron: "* * * * *" },
  async ({ step }) => {
    const jobIds = await step.run("list-durable-card-news-outbox", async () =>
      (await listRecoverableCardNewsJobs(new Date(), 100)).map((job) => job.id),
    );
    for (const id of jobIds)
      await step.run(`dispatch-card-news-${id}`, () => dispatchCardNewsJob(id));
    const analyticsIds = await step.run(
      "list-card-news-analytics-outbox",
      async () =>
        (await listPendingCardNewsAnalyticsJobs(100)).map((job) => job.id),
    );
    for (const id of analyticsIds)
      await step.run(`flush-card-news-analytics-${id}`, () =>
        flushCardNewsAnalytics(id),
      );
  },
);
export const reconcileCardNewsJobs = inngest.createFunction(
  { id: "reconcile-card-news-jobs", retries: 1, concurrency: 1 },
  { cron: "* * * * *" },
  async ({ step }) => {
    const jobIds = await step.run("list-recoverable-card-news", async () =>
      (await listRecoverableCardNewsJobs(new Date(), 100)).map((job) => job.id),
    );
    for (const id of jobIds)
      await step.run(`recover-card-news-${id}`, () => reconcileCardNewsJob(id));
  },
);
export const cleanupCardNewsAssets = inngest.createFunction(
  { id: "cleanup-card-news-assets", retries: 1, concurrency: 1 },
  { cron: "* * * * *" },
  async ({ step }) => {
    const cleanupIds = await step.run(
      "list-card-news-cleanup-scopes",
      async () =>
        (await listAssetCleanupJobs(new Date(), 100)).map(
          (cleanup) => cleanup.id,
        ),
    );
    for (const id of cleanupIds)
      await step.run(`cleanup-card-news-${id}`, () => runCardNewsCleanup(id));
  },
);
