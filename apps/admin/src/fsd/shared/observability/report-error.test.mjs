import assert from "node:assert/strict";
import { after, beforeEach, describe, it, mock } from "node:test";

const state = { calls: [], flushError: null, flushResult: true };

mock.module("server-only", { namedExports: {} });
mock.module("@sentry/nextjs", {
  namedExports: {
    withScope: (run) => {
      state.calls.push("scope");
      return run({
        setTag: (...args) => state.calls.push(["tag", ...args]),
        setContext: (...args) => state.calls.push(["context", ...args]),
        setLevel: (...args) => state.calls.push(["level", ...args]),
        setFingerprint: (...args) => state.calls.push(["fingerprint", ...args]),
      });
    },
    withIsolationScope: (run) => {
      state.calls.push("isolation");
      return run();
    },
    captureException: (error) => state.calls.push(["exception", error]),
    captureMessage: (message) => state.calls.push(["message", message]),
    setUser: (user) => state.calls.push(["user", user]),
    flush: async (timeout) => {
      state.calls.push(["flush", timeout]);
      if (state.flushError) throw state.flushError;
      return state.flushResult;
    },
  },
});

const {
  flushReports,
  reportError,
  reportPipelineFailure,
  setReportUser,
  withIsolatedReportScope,
} = await import("./report-error.ts");

const originalError = console.error;
after(() => {
  console.error = originalError;
  mock.restoreAll();
});
beforeEach(() => {
  state.calls = [];
  state.flushError = null;
  state.flushResult = true;
  console.error = () => {};
});

describe("observability report helpers", () => {
  it("captures exceptions inside a tagged scope without throwing", () => {
    const error = new Error("boom");
    reportError(error, { origin: "query", itemId: "FEAT-10" });
    assert.ok(state.calls.some((call) => call[0] === "tag"));
    assert.ok(
      state.calls.some(
        (call) => Array.isArray(call) && call[0] === "exception" && call[1] === error,
      ),
    );
  });

  it("derives pipeline failure fingerprint and message centrally", () => {
    reportPipelineFailure({
      kind: "pipeline-failure",
      failureCode: "upload",
      uploadedFileId: "file-1",
      attempt: 2,
    });
    assert.ok(
      state.calls.some(
        (call) =>
          Array.isArray(call) &&
          call[0] === "fingerprint" &&
          call[1][0] === "pipeline-failure" &&
          call[1][1] === "upload",
      ),
    );
    assert.ok(
      state.calls.some(
        (call) =>
          Array.isArray(call) &&
          call[0] === "message" &&
          call[1] === "pipeline-failure: upload",
      ),
    );
  });

  it("keeps user attribution inside the explicit isolation callback", () => {
    const value = withIsolatedReportScope(() => {
      setReportUser("admin-1");
      return "done";
    });
    assert.equal(value, "done");
    assert.deepEqual(state.calls, ["isolation", ["user", { id: "admin-1" }]]);
  });

  it("keeps flush as never-throw Promise<void> and discards Sentry false", async () => {
    state.flushResult = false;
    assert.equal(await flushReports(321), undefined);
    assert.deepEqual(state.calls, [["flush", 321]]);

    state.calls = [];
    state.flushError = new Error("flush failed");
    assert.equal(await flushReports(), undefined);
    assert.deepEqual(state.calls, [["flush", 2000]]);
  });
});
