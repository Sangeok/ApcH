import { timingSafeEqual } from "node:crypto";
import { env } from "~/env";
import { acceptCardNewsCallback } from "~/fsd/features/card-news/server";
import { z } from "zod";

export const maxDuration = 10;

export async function POST(request: Request): Promise<Response> {
  const expected = env.CARD_NEWS_WEBHOOK_SECRET;
  const authorization = request.headers.get("authorization") ?? "";
  const supplied = authorization.startsWith("Bearer ")
    ? authorization.slice(7)
    : "";
  if (
    !expected ||
    Buffer.byteLength(supplied) !== Buffer.byteLength(expected) ||
    !timingSafeEqual(Buffer.from(supplied), Buffer.from(expected))
  )
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  const text = await request.text();
  if (Buffer.byteLength(text) > 16_384)
    return Response.json({ error: "Payload too large" }, { status: 413 });
  let payload: unknown;
  try {
    payload = JSON.parse(text);
  } catch {
    return Response.json({ error: "Invalid JSON" }, { status: 400 });
  }
  try {
    return Response.json(await acceptCardNewsCallback(payload));
  } catch (error) {
    if (error instanceof z.ZodError)
      return Response.json(
        { error: "Invalid callback contract" },
        { status: 400 },
      );
    if (
      error instanceof Error &&
      /not found|Unregistered|binding conflict|Conflicting/.test(error.message)
    )
      return Response.json(
        { error: "Callback binding rejected" },
        { status: 409 },
      );
    console.error("Card news callback persistence failed", {
      error: error instanceof Error ? error.name : "unknown",
    });
    return Response.json(
      { error: "Callback persistence temporarily unavailable" },
      { status: 503 },
    );
  }
}
