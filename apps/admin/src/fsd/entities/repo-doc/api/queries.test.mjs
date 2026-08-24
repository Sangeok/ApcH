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

const { getDocContent, getPlanDocIds } = await import("./queries.ts");
const { docContentUrl, plansDirUrl } = await import("../config/github.ts");

after(() => {
  globalThis.fetch = originalFetch;
  mock.restoreAll();
});
beforeEach(() => {
  calls.length = 0;
  state.token = "token-1";
  state.response = null;
});

describe("getDocContent", () => {
  it("returns null without fetching for a non-whitelisted path", async () => {
    assert.equal(await getDocContent("src/env.js"), null);
    assert.equal(calls.length, 0);
  });

  it("returns raw text on 200 from the raw content URL", async () => {
    state.response = { ok: true, status: 200, text: async () => "# hi" };
    const path = "docs/plans/FEAT-14.md";
    assert.equal(await getDocContent(path), "# hi");
    assert.equal(calls.length, 1);
    assert.deepEqual(calls[0], [docContentUrl(path), { cache: "no-store" }]);
  });

  it("returns null on 404", async () => {
    state.response = { ok: false, status: 404, text: async () => "" };
    assert.equal(await getDocContent("docs/plans/NOPE-1.md"), null);
  });

  it("throws on a non-OK, non-404 status", async () => {
    state.response = { ok: false, status: 500, text: async () => "" };
    await assert.rejects(getDocContent("docs/plans/FEAT-14.md"), /500/);
  });

  it("fetches a roster agent definition file", async () => {
    state.response = { ok: true, status: 200, text: async () => "# 역할" };
    const path = ".claude/agents/admin-dev.md";
    assert.equal(await getDocContent(path), "# 역할");
    assert.equal(calls.length, 1);
    assert.deepEqual(calls[0], [docContentUrl(path), { cache: "no-store" }]);
  });

  it("fetches the backend-dev definition file now that it is roster (관측 2c)", async () => {
    // backend-dev를 roster에서 빼면 이 케이스가 fetch 없이 null이 돼 실패한다 —
    // 정의 파일 열람 개방의 직접 증거이자 화이트리스트 실개방 검출기.
    state.response = { ok: true, status: 200, text: async () => "# 역할" };
    const path = ".claude/agents/backend-dev.md";
    assert.equal(await getDocContent(path), "# 역할");
    assert.equal(calls.length, 1);
    assert.deepEqual(calls[0], [docContentUrl(path), { cache: "no-store" }]);
  });

  it("returns null without fetching for a non-roster definition file", async () => {
    assert.equal(await getDocContent(".claude/agents/main-loop.md"), null);
    assert.equal(calls.length, 0);
  });

  it("returns null without fetching for a traversal-shaped definition path", async () => {
    assert.equal(await getDocContent(".claude/agents/../secret.md"), null);
    assert.equal(calls.length, 0);
  });
});

function jsonResponse(payload, { ok = true, status = 200 } = {}) {
  return { ok, status, json: async () => payload };
}

describe("getPlanDocIds", () => {
  it("collects only FEAT-style ids and excludes README/template", async () => {
    state.response = jsonResponse([
      { type: "file", name: "FEAT-14.md" },
      { type: "file", name: "BUG-05.md" },
      { type: "file", name: "README.md" },
      { type: "file", name: "template.md" },
      { type: "dir", name: "archive" },
    ]);
    const ids = await getPlanDocIds();
    assert.deepEqual([...ids].sort(), ["BUG-05", "FEAT-14"]);
  });

  it("sends the plans dir URL with a Bearer header when a token exists", async () => {
    state.response = jsonResponse([]);
    await getPlanDocIds();
    const [url, init] = calls[0];
    assert.equal(url, plansDirUrl());
    assert.equal(init.cache, "no-store");
    assert.equal(init.headers.Authorization, "Bearer token-1");
    assert.equal(init.headers.Accept, "application/vnd.github+json");
  });

  it("omits Authorization when no token is configured", async () => {
    state.token = undefined;
    state.response = jsonResponse([]);
    await getPlanDocIds();
    const [, init] = calls[0];
    assert.equal(init.headers.Authorization, undefined);
  });

  it("returns an empty Set for a non-array payload", async () => {
    state.response = jsonResponse({ message: "Not Found" });
    assert.equal((await getPlanDocIds()).size, 0);
  });

  it("returns an empty Set on 404", async () => {
    state.response = jsonResponse([], { ok: false, status: 404 });
    assert.equal((await getPlanDocIds()).size, 0);
  });

  it("throws on a non-OK, non-404 status", async () => {
    state.response = jsonResponse([], { ok: false, status: 500 });
    await assert.rejects(getPlanDocIds(), /500/);
  });
});
