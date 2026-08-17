import assert from "node:assert/strict";
import { after, beforeEach, describe, it, mock } from "node:test";

const AUTH_SENTINEL = new Error("NEXT_REDIRECT");
const state = {
  authError: null,
  reportError: null,
  calls: [],
};

mock.module("~/server/auth/guard", {
  namedExports: {
    requireAdmin: async () => {
      state.calls.push("auth");
      if (state.authError) throw state.authError;
      return { userId: "admin-1", email: "admin@example.com" };
    },
  },
});
mock.module("~/fsd/shared/observability", {
  namedExports: {
    withIsolatedReportScope: (run) => {
      state.calls.push("scope:start");
      const result = run();
      state.calls.push("scope:return");
      return result;
    },
    setReportUser: (userId) => state.calls.push(`user:${userId}`),
    reportPipelineFailure: (report) => {
      state.calls.push(`capture:${report.kind}`);
      if (state.reportError) throw state.reportError;
    },
    flushReports: async () => state.calls.push("flush"),
  },
});

const { sendObservabilityTestEvent } = await import(
  "./send-observability-test-event.ts"
);

after(() => mock.restoreAll());
beforeEach(() => {
  state.authError = null;
  state.reportError = null;
  state.calls = [];
});

describe("sendObservabilityTestEvent", () => {
  it("lets auth control-flow escape before entering the Sentry scope", async () => {
    state.authError = AUTH_SENTINEL;
    await assert.rejects(
      sendObservabilityTestEvent(),
      (error) => error === AUTH_SENTINEL,
    );
    assert.deepEqual(state.calls, ["auth"]);
  });

  it("isolates user attribution, capture and flush in order", async () => {
    assert.deepEqual(await sendObservabilityTestEvent(), {
      success: true,
      data: undefined,
    });
    assert.deepEqual(state.calls, [
      "auth",
      "scope:start",
      "user:admin-1",
      "capture:stuck-processing",
      "flush",
      "scope:return",
    ]);
  });

  it("returns the current handled failure after authorized reporting errors", async () => {
    state.reportError = new Error("capture failed");
    const originalError = console.error;
    console.error = () => {};
    try {
      assert.deepEqual(await sendObservabilityTestEvent(), {
        success: false,
        error: "Failed to send test event",
      });
    } finally {
      console.error = originalError;
    }
  });
});
