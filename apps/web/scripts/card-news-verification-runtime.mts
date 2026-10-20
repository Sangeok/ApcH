import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";

function isLiteralLoopback(hostname: string): boolean {
  const host = hostname.replace(/^\[|\]$/g, "").toLowerCase();
  return host === "::1" || /^127\.(?:\d{1,3}\.){2}\d{1,3}$/.test(host);
}

/** The optional insecure WS transport is available only for a local test DB. */
export function parseLocalVerificationProxy(
  value: string | undefined,
  database: URL,
): URL | null {
  if (value === undefined) return null;
  let proxy: URL;
  try {
    proxy = new URL(value);
  } catch {
    throw new Error("Invalid local verification WS proxy URL");
  }
  if (
    value.length === 0 ||
    /[\s\\]/.test(value) ||
    proxy.protocol !== "ws:" ||
    !isLiteralLoopback(proxy.hostname) ||
    !proxy.port ||
    Number(proxy.port) < 1 ||
    proxy.username ||
    proxy.password ||
    proxy.search ||
    proxy.hash ||
    !["/", "/v2"].includes(proxy.pathname) ||
    ![proxy.origin, proxy.href].includes(value)
  )
    throw new Error(
      "Local verification proxy requires a canonical ws:// loopback IP URL and explicit port",
    );
  if (
    !["postgres:", "postgresql:"].includes(database.protocol) ||
    !isLiteralLoopback(database.hostname) ||
    !database.port ||
    Number(database.port) < 1 ||
    database.pathname === "/" ||
    [...database.searchParams.keys()].some(
      (key) =>
        !["sslmode", "connect_timeout", "application_name"].includes(key),
    )
  )
    throw new Error(
      "Local verification proxy requires a loopback PostgreSQL target without host overrides",
    );
  return proxy;
}

export async function verificationRuntime() {
  const supplied = process.env.CARD_NEWS_TEST_DATABASE_URL;
  if (!supplied || process.env.CARD_NEWS_TEST_DATABASE_CONFIRMED !== "true")
    throw new Error(
      "A separate CARD_NEWS_TEST_DATABASE_URL and CARD_NEWS_TEST_DATABASE_CONFIRMED=true are required",
    );
  const parseDatabaseUrl = (value: string) => {
    try {
      return new URL(value);
    } catch {
      throw new Error("Invalid database URL");
    }
  };
  const identity = (value: URL) =>
    `${value.hostname.replace(/-pooler(?=\.)/, "")}:${value.port || "5432"}${value.pathname}`;
  const target = parseDatabaseUrl(supplied);
  if (
    !["postgres:", "postgresql:"].includes(target.protocol) ||
    !target.hostname ||
    target.pathname === "/"
  )
    throw new Error("Invalid test database target");
  if (
    [process.env.DATABASE_URL, process.env.DATABASE_URL_UNPOOLED].some(
      (current) =>
        current && identity(parseDatabaseUrl(current)) === identity(target),
    )
  )
    throw new Error("Test database must differ from the current database");
  const localProxy = parseLocalVerificationProxy(
    process.env.CARD_NEWS_TEST_LOCAL_WS_PROXY,
    target,
  );
  if (
    (globalThis as typeof globalThis & { prisma?: unknown }).prisma !==
    undefined
  )
    throw new Error(
      "Isolated verification requires a fresh process without a previously loaded Prisma client",
    );
  const savedEnvironment = { ...process.env };
  const values = {
    NODE_ENV: "test",
    DATABASE_URL: supplied,
    DATABASE_URL_UNPOOLED: supplied,
    AUTH_SECRET: "card-news-test-auth",
    AWS_ACCESS_KEY_ID: "test-access",
    AWS_SECRET_ACCESS_KEY: "test-secret",
    AWS_REGION: "us-east-1",
    S3_BUCKET_NAME: "card-news-test",
    PROCESS_VIDEO_ENDPOINT: "https://video.invalid",
    PROCESS_VIDEO_ENDPOINT_AUTH: "test-video",
    AUTH_GOOGLE_ID: "test-google",
    AUTH_GOOGLE_SECRET: "test-google",
    POLAR_ACCESS_TOKEN: "test-polar",
    POLAR_WEBHOOK_SECRET_DEV: "test-polar",
    POLAR_WEBHOOK_SECRET_PROD: "test-polar",
    POLAR_SERVER: "sandbox",
    MODAL_WEBHOOK_SECRET: "test-modal",
    CARD_NEWS_ENABLED: "true",
    CARD_NEWS_ALLOWED_USER_IDS: "",
    CARD_NEWS_ENDPOINT: "https://card-news.invalid",
    CARD_NEWS_ENDPOINT_AUTH: "test-cpu",
    CARD_NEWS_WEBHOOK_SECRET: "test-webhook",
    NEXT_PUBLIC_SITE_URL: "https://web.invalid",
    VIDEO_GENERATION_ADMISSION_ENABLED: "true",
    VIDEO_WORKER_START_ENABLED: "true",
  };
  for (const key of [
    "SKIP_ENV_VALIDATION",
    "SENTRY_DSN",
    "SENTRY_AUTH_TOKEN",
    "INNGEST_EVENT_KEY",
    "INNGEST_SIGNING_KEY",
    "AUTH_URL",
    "NEXT_PUBLIC_SENTRY_DSN",
  ])
    delete process.env[key];
  Object.assign(process.env, values);
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => {
    throw new Error(
      "Unexpected external network call in isolated verification",
    );
  };
  let restoreDependencies = () => {};
  let restoreNeon = () => {};
  let disconnect = async () => {};
  const restoreGlobals = () => {
    restoreDependencies();
    restoreNeon();
    globalThis.fetch = originalFetch;
    for (const key of Object.keys(process.env))
      if (!(key in savedEnvironment)) delete process.env[key];
    Object.assign(process.env, savedEnvironment);
  };
  const fixtureUserIds: string[] = [];
  try {
    if (localProxy) {
      // Configure the same PrismaNeon production adapter before its DB client
      // is imported; no adapter substitution or direct SQL client is used.
      const { neonConfig } = await import("@neondatabase/serverless");
      if (
        process.env.NODE_ENV !== "test" ||
        typeof globalThis.WebSocket !== "function"
      )
        throw new Error(
          "Local verification transport requires NODE_ENV=test and a native Node WebSocket constructor",
        );
      const previous = {
        wsProxy: neonConfig.wsProxy,
        useSecureWebSocket: neonConfig.useSecureWebSocket,
        forceDisablePgSSL: neonConfig.forceDisablePgSSL,
        pipelineConnect: neonConfig.pipelineConnect,
        webSocketConstructor: neonConfig.webSocketConstructor,
      };
      restoreNeon = () => {
        Object.assign(neonConfig, previous);
      };
      neonConfig.wsProxy = (host, port) => {
        if (
          !isLiteralLoopback(host) ||
          host.replace(/^\[|\]$/g, "") !==
            target.hostname.replace(/^\[|\]$/g, "") ||
          String(port) !== target.port
        )
          throw new Error(
            "Local verification transport rejected an unbound database address",
          );
        return `${localProxy.host}${localProxy.pathname}?address=${encodeURIComponent(`${target.hostname}:${target.port}`)}`;
      };
      neonConfig.useSecureWebSocket = false;
      neonConfig.forceDisablePgSSL = true;
      neonConfig.pipelineConnect = false;
      neonConfig.webSocketConstructor = globalThis.WebSocket;
    }
    const { db } = await import("@repo/db");
    disconnect = () => db.$disconnect();
    const actions = await import("../src/fsd/features/card-news/api/index.ts");
    const lifecycle = await import(
      "../src/fsd/features/card-news/api/job-lifecycle.ts"
    );
    const cleanup = await import(
      "../src/fsd/features/card-news/api/cleanup.ts"
    );
    const { replaceCardNewsRuntimeForTest } = await import(
      "../src/fsd/features/card-news/api/runtime-dependencies.ts"
    );
    const fixtures = JSON.parse(
      await readFile(
        path.resolve("../../packages/db/contracts/card-news-v1.fixtures.json"),
        "utf8",
      ),
    ) as { cases: { definition: string; valid: boolean; value: unknown }[] };
    const manifestTemplate = fixtures.cases.find(
      (entry) => entry.definition === "manifest" && entry.valid,
    )!.value as Record<string, unknown>;
    const objects = new Map<
      string,
      {
        text?: string;
        contentLength: number;
        contentType: string;
        metadata: Record<string, string>;
      }
    >();
    const events: unknown[] = [];
    let authenticatedUserId: string | null = null;
    let now = new Date();
    let producerStatus: "pending" | "ended" | "unknown" = "pending";
    let cpuCalls = 0;
    restoreDependencies = replaceCardNewsRuntimeForTest({
      authenticate: async () =>
        authenticatedUserId
          ? {
              success: true,
              data: {
                userId: authenticatedUserId,
                session: {
                  user: { id: authenticatedUserId },
                  expires: "2099-01-01",
                },
              },
            }
          : { success: false, error: "Unauthorized" },
      now: () => now,
      headObject: async (key) => {
        const object = objects.get(key);
        if (!object) {
          const error = new Error("Missing fixture object");
          error.name = "NotFound";
          throw error;
        }
        return object;
      },
      listObjects: async (prefix) =>
        [...objects.keys()].filter((key) => key.startsWith(prefix)).sort(),
      readObject: async (key) => {
        const object = objects.get(key);
        if (!object?.text) throw new Error("Missing fixture manifest");
        return object.text;
      },
      deleteObjects: async (keys) => {
        keys.forEach((key) => objects.delete(key));
      },
      signObject: async (key) =>
        `https://download.invalid/${encodeURIComponent(key)}`,
      sendEvent: async (event) => {
        events.push(event);
      },
      postCpu: async () => {
        cpuCalls += 1;
        return {
          schemaVersion: 1,
          status: "accepted",
          call_id: `fc-test-${cpuCalls}`,
        };
      },
      producerStatus: async () => ({
        schemaVersion: 1,
        status: producerStatus,
      }),
    });
    async function createFixture(credits = 10) {
      const userId = `cn-test-${randomUUID()}`;
      fixtureUserIds.push(userId);
      await db.user.create({
        data: { id: userId, email: `${userId}@example.invalid`, credits },
      });
      const upload = await db.uploadedFile.create({
        data: {
          userId,
          s3Key: `uploads/${userId}/source.mp4`,
          uploaded: true,
          status: "processed",
          currentAttempt: 1,
          lastSuccessfulAttempt: 1,
          sourceUploadedAt: now,
        },
      });
      const clip = await db.clip.create({
        data: {
          userId,
          uploadedFileId: upload.id,
          processingAttempt: 1,
          s3Key: `uploads/${userId}/attempt-1/clip.mp4`,
          startSeconds: 0,
          endSeconds: 30,
          scriptText:
            "Use one clear idea per card. Preserve the source facts. Review the summary before posting.",
          subtitleStatus: "ok",
        },
      });
      for (const key of [upload.s3Key, clip.s3Key])
        objects.set(key, {
          contentLength: 100,
          contentType: "video/mp4",
          metadata: {},
        });
      authenticatedUserId = userId;
      return { userId, upload, clip };
    }
    async function complete(jobId: string, invocationId = randomUUID()) {
      const job = await db.cardNewsJob.findUniqueOrThrow({
        where: { id: jobId },
      });
      const input = job.inputSnapshot as unknown as {
        outputPrefix: string;
        sourceHash: string;
        templateVersion: string;
        fontVersion: string;
        promptVersion: string;
        modelVersion: string;
        draft: unknown;
        coverCandidates: unknown[];
        initialTheme: string;
      };
      const callback = {
        schemaVersion: 1,
        jobId,
        executionEpoch: job.executionEpoch,
        revision: job.inputRevision,
        invocationId,
        modalCallId: "fc-fixture",
        sequence: 0,
        stage: "accepted",
        outcome: "started",
        manifestKey: null,
        failureCode: null,
      };
      assert.equal(
        (await lifecycle.acceptCardNewsCallback(callback)).accepted,
        true,
      );
      const manifest = structuredClone(manifestTemplate) as Record<
        string,
        unknown
      >;
      Object.assign(manifest, {
        jobId,
        executionEpoch: job.executionEpoch,
        revision: job.inputRevision,
        invocationId,
        sourceHash: input.sourceHash,
        templateVersion: input.templateVersion,
        fontVersion: input.fontVersion,
        promptVersion: input.promptVersion,
        modelVersion: input.modelVersion,
      });
      const draft = input.draft ?? manifest.draftDocument;
      if (
        draft &&
        typeof draft === "object" &&
        "theme" in draft &&
        !input.draft
      )
        draft.theme = input.initialTheme;
      manifest.draftDocument = draft;
      manifest.caption = (draft as { caption: string }).caption;
      manifest.hashtags = (draft as { hashtags: string[] }).hashtags;
      const prefix = `${input.outputPrefix}${invocationId}/`;
      const cards = manifest.cards as {
        key: string;
        id: string;
        contentType: string;
        sizeBytes: number;
        sha256: string;
      }[];
      const draftCards = (draft as { cards: { id: string }[] }).cards;
      cards.forEach((card, index) => {
        card.key = `${prefix}${String(index + 1).padStart(2, "0")}.jpg`;
        card.id = draftCards[index]!.id;
      });
      if (input.draft) manifest.coverCandidates = input.coverCandidates;
      else
        (manifest.coverCandidates as { key: string; id: string }[]).forEach(
          (cover) => {
            cover.key = `${prefix}${cover.id}.jpg`;
          },
        );
      (manifest.zip as { key: string }).key = `${prefix}cards.zip`;
      for (const asset of [
        ...cards,
        ...(manifest.coverCandidates as typeof cards),
        manifest.zip as (typeof cards)[number],
      ])
        objects.set(asset.key, {
          contentLength: asset.sizeBytes,
          contentType: asset.contentType,
          metadata: { sha256: asset.sha256 },
        });
      const manifestKey = `${prefix}manifest.json`;
      objects.set(manifestKey, {
        text: JSON.stringify(manifest),
        contentLength: 1000,
        contentType: "application/json",
        metadata: {},
      });
      await lifecycle.acceptCardNewsCallback({
        ...callback,
        outcome: "completed",
        sequence: 5,
        stage: "completed",
        manifestKey,
      });
      await lifecycle.reconcileCardNewsJob(jobId);
      return { manifest, manifestKey, callback };
    }
    async function assertBalance(userId: string) {
      const user = await db.user.findUniqueOrThrow({ where: { id: userId } });
      const held = await db.creditReservation.aggregate({
        where: { userId, status: "held" },
        _sum: { reservedAmount: true },
      });
      assert.equal(user.reservedCredits, held._sum.reservedAmount ?? 0);
      assert.ok(
        user.reservedCredits >= 0 && user.reservedCredits <= user.credits,
      );
      return user;
    }
    async function dispose() {
      try {
        for (const job of await db.cardNewsJob.findMany({
          where: {
            userId: { in: fixtureUserIds },
            status: { in: ["pending", "running"] },
          },
        }))
          await lifecycle.failCardNewsJob(job.id, "test_cleanup");
        await db.assetCleanupJob.updateMany({
          where: { userId: { in: fixtureUserIds } },
          data: { status: "completed" },
        });
        await db.cardNewsSet.updateMany({
          where: { userId: { in: fixtureUserIds } },
          data: { deletedAt: new Date(), status: "deleting" },
        });
        await db.cardNewsSet.deleteMany({
          where: { userId: { in: fixtureUserIds } },
        });
        await db.assetCleanupJob.deleteMany({
          where: { userId: { in: fixtureUserIds } },
        });
        await db.processingDispatch.deleteMany({
          where: { uploadedFile: { userId: { in: fixtureUserIds } } },
        });
        await db.creditReservation.deleteMany({
          where: { userId: { in: fixtureUserIds } },
        });
        await db.uploadedFile.deleteMany({
          where: { userId: { in: fixtureUserIds } },
        });
        await db.user.deleteMany({ where: { id: { in: fixtureUserIds } } });
      } finally {
        await db.$disconnect();
        restoreGlobals();
      }
    }
    return {
      db,
      actions,
      lifecycle,
      cleanup,
      objects,
      events,
      createFixture,
      complete,
      assertBalance,
      dispose,
      authenticate: (value: string | null) => {
        authenticatedUserId = value;
      },
      advance: (milliseconds: number) => {
        now = new Date(now.getTime() + milliseconds);
      },
      producerStatus: (value: typeof producerStatus) => {
        producerStatus = value;
      },
      cpuCalls: () => cpuCalls,
    };
  } catch (error) {
    try {
      await disconnect();
    } finally {
      restoreGlobals();
    }
    throw error;
  }
}

export type CardNewsVerificationRuntime = Awaited<
  ReturnType<typeof verificationRuntime>
>;
