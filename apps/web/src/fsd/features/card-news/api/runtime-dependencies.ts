import "server-only";

import { env } from "~/env";
import type { requireAuth } from "~/fsd/shared/api/auth-guard";
import {
  deleteS3Objects,
  generatePresignedGetUrl,
  getS3ObjectText,
  headS3Object,
  listS3Objects,
} from "~/fsd/shared/api/s3";
import { inngest } from "~/inngest/client";

const defaults = {
  authenticate: async (): ReturnType<typeof requireAuth> => {
    const { requireAuth: authenticate } = await import(
      "~/fsd/shared/api/auth-guard"
    );
    return authenticate();
  },
  now: () => new Date(),
  headObject: headS3Object,
  listObjects: listS3Objects,
  readObject: getS3ObjectText,
  deleteObjects: deleteS3Objects,
  signObject: generatePresignedGetUrl,
  sendEvent: async (event: {
    name:
      | "card-news/generate.requested"
      | "card-news/render.requested"
      | "card-news/completed";
    data: {
      jobId: string;
      executionEpoch: number;
      revision: number;
      matchKey: string;
    };
  }): Promise<void> => {
    await inngest.send(event);
  },
  postCpu: async (body: unknown): Promise<unknown> => {
    const response = await fetch(env.CARD_NEWS_ENDPOINT!, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${env.CARD_NEWS_ENDPOINT_AUTH}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(15_000),
    });
    if (!response.ok)
      throw new Error(`CPU acceptance failed: ${response.status}`);
    return response.json();
  },
  producerStatus: async (body: unknown): Promise<unknown> => {
    const response = await fetch(
      `${env.CARD_NEWS_ENDPOINT!.replace(/\/$/, "")}/status`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${env.CARD_NEWS_ENDPOINT_AUTH}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(10_000),
      },
    );
    if (!response.ok)
      throw new Error(`Producer status failed: ${response.status}`);
    return response.json();
  },
};

export type CardNewsRuntimeDependencies = typeof defaults;
let dependencies: CardNewsRuntimeDependencies = defaults;

export function cardNewsRuntime(): CardNewsRuntimeDependencies {
  return dependencies;
}

// Private test boundary: never exported by a slice barrel or a Server Action.
export function replaceCardNewsRuntimeForTest(
  overrides: Partial<CardNewsRuntimeDependencies>,
): () => void {
  if (process.env.NODE_ENV !== "test")
    throw new Error("Test dependencies require NODE_ENV=test");
  const previous = dependencies;
  dependencies = { ...defaults, ...overrides };
  return () => {
    dependencies = previous;
  };
}
