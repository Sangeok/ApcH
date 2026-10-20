import assert from "node:assert/strict";
import test from "node:test";
import { sanitizeCardNewsAnalyticsContext } from "./analytics-context.ts";

const context = {
  anonymousId: "anon_12345678-1234-4234-8234-123456789abc",
  sessionId: "session_12345678-1234-4234-8234-123456789abc",
};

test("card-news context admits existing UUID and timestamp IDs and trims whitespace", () => {
  assert.deepEqual(
    sanitizeCardNewsAnalyticsContext({
      anonymousId: ` ${context.anonymousId} `,
      sessionId: ` ${context.sessionId} `,
    }),
    context,
  );
  const fallback = {
    anonymousId: "anon_1792470000000-a1b2c3",
    sessionId: "session_1792470000000-d4e5f6",
  };
  assert.deepEqual(sanitizeCardNewsAnalyticsContext(fallback), fallback);
});

test("invalid or expanded analytics context is discarded without changing product input", () => {
  for (const value of [
    undefined,
    null,
    [],
    "text",
    {},
    { ...context, userId: "other" },
    { ...context, source: "private transcript" },
    { ...context, anonymousId: "https://example.com" },
    { ...context, sessionId: "session_" + "a".repeat(90) },
    { ...context, anonymousId: "anon_not-an-id" },
    { ...context, sessionId: 123 },
  ]) {
    assert.equal(sanitizeCardNewsAnalyticsContext(value), null);
  }
  assert.deepEqual(context, {
    anonymousId: "anon_12345678-1234-4234-8234-123456789abc",
    sessionId: "session_12345678-1234-4234-8234-123456789abc",
  });
});
