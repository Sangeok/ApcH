import "server-only";
import { env } from "~/env";
import { listS3Objects, headS3Object } from "~/fsd/shared/api/s3";
import {
  isVideoGenerationAdmissionEnabled,
  isVideoWorkerStartEnabled,
} from "~/fsd/shared/config/processing-admission";

const defaults = {
  now: () => new Date(),
  listObjects: listS3Objects,
  headObject: headS3Object,
  workerStartEnabled: isVideoWorkerStartEnabled,
  admissionEnabled: isVideoGenerationAdmissionEnabled,
  producerStatus: async (body: unknown): Promise<unknown> => {
    if (!env.CARD_NEWS_ENDPOINT || !env.CARD_NEWS_ENDPOINT_AUTH)
      throw new Error("Producer status endpoint unavailable");
    const response = await fetch(
      `${env.CARD_NEWS_ENDPOINT.replace(/\/$/, "")}/status`,
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
    if (!response.ok) throw new Error("Producer status unavailable");
    return response.json();
  },
};
let dependencies = defaults;
export function videoProcessingRuntime(): typeof defaults {
  return dependencies;
}

/** Private deterministic I/O seam; never exported to a client or Server Action. */
export function replaceVideoProcessingRuntimeForTest(
  overrides: Partial<typeof defaults>,
): () => void {
  if (process.env.NODE_ENV !== "test")
    throw new Error("Video test dependencies require NODE_ENV=test");
  const previous = dependencies;
  dependencies = { ...defaults, ...overrides };
  return () => {
    dependencies = previous;
  };
}
