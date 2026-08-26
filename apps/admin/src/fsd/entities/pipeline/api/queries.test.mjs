import assert from "node:assert/strict";
import { after, beforeEach, describe, it, mock } from "node:test";

const originalFetch = globalThis.fetch;
const state = { token: "token-1", response: null };
const calls = [];

mock.module("server-only", { namedExports: {} });
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
  calls.push(args);
  return state.response;
};

const { getPipelineBoard } = await import("./queries.ts");
const { BOARD_RAW_URL, BOARD_CONTENTS_URL, BOARD_BRANCH } = await import(
  "../config/github.ts"
);

const MARKDOWN = `# PROJECT_BOARD

## 2026-08-17
- [ ] FEAT-10: Example
  agent: admin-dev
  area: apps/admin
  status: 검토대기
  근거: test
`;

function contentsResponse(markdown, { ok = true, status = 200 } = {}) {
  return {
    ok,
    status,
    json: async () => ({
      content: Buffer.from(markdown, "utf-8").toString("base64"),
    }),
  };
}

after(() => {
  globalThis.fetch = originalFetch;
  mock.restoreAll();
});
beforeEach(() => {
  calls.length = 0;
  state.token = "token-1";
  state.response = contentsResponse(MARKDOWN);
});

describe("pipeline board query — token present (contents API)", () => {
  it("performs one exact contents-API GET (Bearer, no-store) and parses sections", async () => {
    const sections = await getPipelineBoard();
    assert.equal(calls.length, 1);
    const [url, init] = calls[0];
    assert.equal(url, `${BOARD_CONTENTS_URL}?ref=${BOARD_BRANCH}`);
    assert.equal(init.cache, "no-store");
    assert.equal(init.headers.Accept, "application/vnd.github+json");
    assert.equal(init.headers.Authorization, "Bearer token-1");
    assert.equal(sections.length, 1);
    assert.equal(sections[0].items[0].id, "FEAT-10");
  });

  it("throws on a non-OK response", async () => {
    state.response = contentsResponse("", { ok: false, status: 503 });
    await assert.rejects(getPipelineBoard(), /503/);
    assert.equal(calls.length, 1);
  });

  it("throws (fail-closed) when content is missing, without falling back to raw CDN", async () => {
    state.response = { ok: true, status: 200, json: async () => ({}) };
    await assert.rejects(getPipelineBoard(), /content/);
    assert.equal(calls.length, 1);
    assert.notEqual(calls[0][0], BOARD_RAW_URL);
  });
});

describe("pipeline board query — token absent (raw CDN fallback)", () => {
  it("performs one exact no-store raw-board GET (no headers) and parses sections", async () => {
    state.token = undefined;
    state.response = { ok: true, status: 200, text: async () => MARKDOWN };
    const sections = await getPipelineBoard();
    assert.equal(calls.length, 1);
    assert.deepEqual(calls[0], [BOARD_RAW_URL, { cache: "no-store" }]);
    assert.equal(sections.length, 1);
    assert.equal(sections[0].items[0].id, "FEAT-10");
  });

  it("throws on a non-OK response", async () => {
    state.token = undefined;
    state.response = { ok: false, status: 503, text: async () => "" };
    await assert.rejects(getPipelineBoard(), /503/);
    assert.equal(calls.length, 1);
  });
});
