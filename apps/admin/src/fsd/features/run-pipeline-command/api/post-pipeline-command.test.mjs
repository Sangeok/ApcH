import assert from "node:assert/strict";
import { after, beforeEach, describe, it, mock } from "node:test";

const AUTH_SENTINEL = new Error("NEXT_REDIRECT");
const state = {
  authError: null,
  token: "token-1",
  fetchCalls: [],
};
const originalFetch = globalThis.fetch;

mock.module("~/server/auth/guard", {
  namedExports: {
    requireAdmin: async () => {
      if (state.authError) throw state.authError;
      return { userId: "admin-1", email: "admin@example.com" };
    },
  },
});
mock.module("~/env", {
  namedExports: {
    env: {
      get GITHUB_PIPELINE_TOKEN() {
        return state.token;
      },
    },
  },
});

globalThis.fetch = async (...args) => {
  state.fetchCalls.push(args);
  return { ok: true, status: 201 };
};

const { postPipelineCommand } = await import("./post-pipeline-command.ts");
const { ISSUE_COMMENTS_URL } = await import("~/fsd/entities/pipeline");
const { resolvePipelineCommand } = await import("../model/commands.ts");

after(() => {
  globalThis.fetch = originalFetch;
  mock.restoreAll();
});
beforeEach(() => {
  state.authError = null;
  state.token = "token-1";
  state.fetchCalls = [];
});

describe("postPipelineCommand", () => {
  it("lets auth control-flow escape before fetch", async () => {
    state.authError = AUTH_SENTINEL;
    await assert.rejects(
      postPipelineCommand("pipeline-run"),
      (error) => error === AUTH_SENTINEL,
    );
    assert.equal(state.fetchCalls.length, 0);
  });

  it("rejects invalid keys and missing tokens before fetch", async () => {
    assert.deepEqual(await postPipelineCommand("__proto__"), {
      success: false,
      error: "Unknown command",
    });
    state.token = undefined;
    assert.deepEqual(await postPipelineCommand("pipeline-run"), {
      success: false,
      error: "GitHub token is not configured",
    });
    assert.equal(state.fetchCalls.length, 0);
  });

  it("posts the exact whitelisted body", async () => {
    assert.deepEqual(await postPipelineCommand("pipeline-run"), {
      success: true,
      data: undefined,
    });
    assert.equal(state.fetchCalls.length, 1);
    const [url, init] = state.fetchCalls[0];
    assert.equal(url, ISSUE_COMMENTS_URL);
    assert.equal(init.method, "POST");
    assert.equal(init.headers.Authorization, "Bearer token-1");
    assert.deepEqual(JSON.parse(init.body), {
      body: resolvePipelineCommand("pipeline-run"),
    });
  });
});
