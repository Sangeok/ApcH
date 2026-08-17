import assert from "node:assert/strict";
import { after, beforeEach, describe, it, mock } from "node:test";

const AUTH_SENTINEL = new Error("NEXT_REDIRECT");
const state = {
  authError: null,
  token: "token-1",
  transportError: null,
  response: null,
  fetchCalls: [],
};
const originalFetch = globalThis.fetch;

// auth·env·fetch만 mock한다. server-only는 mock하지 않는다 — 이 액션은 직접 import하지 않고
// 유일한 import처인 guard.ts:1이 통째로 mock되므로 로드되지 않는다(기존 액션 테스트와 동일).
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
  if (state.transportError) throw state.transportError;
  return state.response;
};

const { getPipelineProgress } = await import("./get-pipeline-progress.ts");
// entity 좌표는 실물을 import해 대조한다(mock 아님).
const { ISSUE_COMMENTS_URL } = await import("~/fsd/entities/pipeline");

function jsonResponse(payload, { ok = true, status = 200 } = {}) {
  return { ok, status, json: async () => payload };
}

after(() => {
  globalThis.fetch = originalFetch;
  mock.restoreAll();
});
beforeEach(() => {
  state.authError = null;
  state.token = "token-1";
  state.transportError = null;
  state.response = jsonResponse([]);
  state.fetchCalls = [];
});

describe("getPipelineProgress", () => {
  it("lets auth control-flow escape before fetch", async () => {
    state.authError = AUTH_SENTINEL;
    await assert.rejects(getPipelineProgress(), (e) => e === AUTH_SENTINEL);
    assert.equal(state.fetchCalls.length, 0);
  });

  it("targets issue #87 comments with a 6h since window, per_page=100, no-store, and Bearer when a token exists", async () => {
    const before = Date.now();
    const result = await getPipelineProgress();
    const after = Date.now();

    assert.equal(state.fetchCalls.length, 1);
    const [url, init] = state.fetchCalls[0];
    const parsed = new URL(url);
    assert.equal(`${parsed.origin}${parsed.pathname}`, ISSUE_COMMENTS_URL);
    assert.equal(parsed.searchParams.get("per_page"), "100");

    const WINDOW_MS = 6 * 60 * 60 * 1000;
    const since = Date.parse(parsed.searchParams.get("since"));
    assert.ok(since >= before - WINDOW_MS - 5000);
    assert.ok(since <= after - WINDOW_MS + 5000);

    assert.equal(init.cache, "no-store");
    assert.equal(init.headers.Authorization, "Bearer token-1");
    assert.equal(init.headers.Accept, "application/vnd.github+json");
    assert.deepEqual(result, { kind: "idle" }); // 빈 배열
  });

  it("omits Authorization when no token is configured", async () => {
    state.token = undefined;
    await getPipelineProgress();
    const [, init] = state.fetchCalls[0];
    assert.equal(init.headers.Authorization, undefined);
  });

  it("drops comments created before the window (edited-comment reentry)", async () => {
    const old = new Date(Date.now() - 10 * 60 * 60 * 1000).toISOString();
    state.response = jsonResponse([
      { body: "오래전 명령(편집돼 창에 재진입)", created_at: old },
    ]);
    // 창(6h) 밖 created_at은 걸러져 미응답으로 되살아나지 않는다 → idle
    assert.deepEqual(await getPipelineProgress(), { kind: "idle" });
  });

  it("returns unknown on transport failure", async () => {
    state.transportError = new Error("network down");
    assert.deepEqual(await getPipelineProgress(), { kind: "unknown" });
  });

  it("returns unknown on non-OK status", async () => {
    state.response = jsonResponse([], { ok: false, status: 403 });
    assert.deepEqual(await getPipelineProgress(), { kind: "unknown" });
  });

  it("returns unknown when the body is not valid JSON", async () => {
    state.response = {
      ok: true,
      status: 200,
      json: async () => {
        throw new Error("invalid json");
      },
    };
    assert.deepEqual(await getPipelineProgress(), { kind: "unknown" });
  });

  it("returns unknown when the payload is not an array", async () => {
    state.response = jsonResponse({ message: "Not Found" });
    assert.deepEqual(await getPipelineProgress(), { kind: "unknown" });
  });

  it("returns unknown when a member is null", async () => {
    state.response = jsonResponse([null]);
    assert.deepEqual(await getPipelineProgress(), { kind: "unknown" });
  });

  it("returns unknown when a member is a primitive", async () => {
    state.response = jsonResponse(["just a string"]);
    assert.deepEqual(await getPipelineProgress(), { kind: "unknown" });
  });

  // body 누락과 created_at 누락은 각각 단언한다 — 한 케이스로 합치면 "body" in value의
  // 거짓 분기를 아무도 밟지 않아 branch coverage가 96.43%에서 멈춘다(실측).
  it("returns unknown when a member is missing body", async () => {
    state.response = jsonResponse([{ created_at: new Date().toISOString() }]);
    assert.deepEqual(await getPipelineProgress(), { kind: "unknown" });
  });

  it("returns unknown when a member is missing created_at", async () => {
    state.response = jsonResponse([{ body: "명령" }]);
    assert.deepEqual(await getPipelineProgress(), { kind: "unknown" });
  });

  it("returns unknown when a field has the wrong type", async () => {
    state.response = jsonResponse([
      { body: 123, created_at: new Date().toISOString() },
    ]);
    assert.deepEqual(await getPipelineProgress(), { kind: "unknown" });
  });

  it("returns unknown when created_at is an unparseable timestamp", async () => {
    state.response = jsonResponse([{ body: "명령", created_at: "not-a-date" }]);
    assert.deepEqual(await getPipelineProgress(), { kind: "unknown" });
  });

  it("fails closed (no partial aggregation) when a malformed member sits next to a valid one", async () => {
    state.response = jsonResponse([
      { body: "정상 명령", created_at: new Date().toISOString() },
      { body: 123, created_at: new Date().toISOString() },
    ]);
    assert.deepEqual(await getPipelineProgress(), { kind: "unknown" });
  });

  it("passes filtered comments to deriveProgress in FIFO order (reply pays the oldest)", async () => {
    const cmd1 = new Date(Date.now() - 10 * 60_000).toISOString();
    const cmd2 = new Date(Date.now() - 150_000).toISOString(); // 2.5분 전
    const rep = new Date(Date.now() - 60_000).toISOString();
    state.response = jsonResponse([
      { body: "명령 1", created_at: cmd1 },
      { body: "명령 2", created_at: cmd2 },
      { body: "[claude] 명령 1 처리", created_at: rep },
    ]);
    const result = await getPipelineProgress();
    // 답글은 가장 오래된 명령1을 갚고, 명령2가 미응답으로 남는다.
    assert.equal(result.kind, "awaiting");
    assert.equal(result.sinceIso, cmd2);
    assert.equal(result.minutes, 2);
  });
});
