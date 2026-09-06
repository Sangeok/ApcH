import { NextResponse } from "next/server";
import { z } from "zod";
import { recordAnalyticsEvent } from "~/fsd/entities/analytics-event/server";
import { ANALYTICS_EVENT_NAMES } from "~/fsd/shared/analytics/event-catalog";
import { sanitizeAnalyticsMetadata } from "~/fsd/shared/analytics/lib/metadata";
import {
  normalizeAnalyticsPath,
  normalizeAnalyticsReferrer,
} from "~/fsd/shared/analytics/lib/normalize-path";
import { auth } from "~/server/auth";

const MAX_BODY_BYTES = 10 * 1024;

const analyticsEventSchema = z.object({
  name: z.enum(ANALYTICS_EVENT_NAMES),
  anonymousId: z.string().trim().min(8).max(80),
  sessionId: z.string().trim().min(8).max(80),
  path: z.string().trim().min(1).max(2048),
  referrer: z.string().trim().max(512).nullish(),
  metadata: z.record(z.unknown()).optional(),
});

function response(status: number) {
  return new NextResponse(null, { status });
}

function isJsonRequest(request: Request) {
  return request.headers
    .get("content-type")
    ?.toLowerCase()
    .includes("application/json");
}

function byteLength(value: string) {
  return new TextEncoder().encode(value).byteLength;
}

export async function POST(request: Request) {
  if (!isJsonRequest(request)) {
    return response(400);
  }

  const contentLength = request.headers.get("content-length");

  if (contentLength && Number(contentLength) > MAX_BODY_BYTES) {
    return response(400);
  }

  const rawBody = await request.text();

  if (byteLength(rawBody) > MAX_BODY_BYTES) {
    return response(400);
  }

  let parsedBody: unknown;

  try {
    parsedBody = JSON.parse(rawBody);
  } catch {
    return response(400);
  }

  if (
    parsedBody &&
    typeof parsedBody === "object" &&
    Object.prototype.hasOwnProperty.call(parsedBody, "userId")
  ) {
    return response(400);
  }

  if (byteLength(JSON.stringify(parsedBody)) > MAX_BODY_BYTES) {
    return response(400);
  }

  const parsedEvent = analyticsEventSchema.safeParse(parsedBody);

  if (!parsedEvent.success) {
    return response(400);
  }

  const normalizedPath = normalizeAnalyticsPath(parsedEvent.data.path);

  if (normalizedPath.startsWith("/admin")) {
    return response(204);
  }

  const session = await auth();

  try {
    await recordAnalyticsEvent({
      name: parsedEvent.data.name,
      anonymousId: parsedEvent.data.anonymousId,
      sessionId: parsedEvent.data.sessionId,
      path: normalizedPath,
      referrer: normalizeAnalyticsReferrer(parsedEvent.data.referrer),
      metadata: sanitizeAnalyticsMetadata(
        parsedEvent.data.name,
        parsedEvent.data.metadata,
      ),
      userId: session?.user?.id ?? null,
    });
  } catch (error) {
    console.error("Failed to record analytics event", error);

    return response(204);
  }

  return response(204);
}
