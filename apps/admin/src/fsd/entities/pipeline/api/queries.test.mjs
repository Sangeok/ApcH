import assert from "node:assert/strict";
import { after, beforeEach, describe, it, mock } from "node:test";

const originalFetch = globalThis.fetch;
const calls = [];
const state = { response: null };

mock.module("server-only", { namedExports: {} });

globalThis.fetch = async (...args) => {
  calls.push(args);
  return state.response;
};

const { getPipelineBoard } = await import("./queries.ts");
const { BOARD_RAW_URL } = await import("../config/github.ts");

after(() => {
  globalThis.fetch = originalFetch;
  mock.restoreAll();
});
beforeEach(() => {
  calls.length = 0;
  state.response = {
    ok: true,
    status: 200,
    text: async () => `# PROJECT_BOARD

## 2026-08-17
- [ ] FEAT-10: Example
  agent: admin-dev
  area: apps/admin
  status: 검토대기
  근거: test
`,
  };
});

describe("pipeline board query", () => {
  it("performs one exact no-store raw-board GET and parses sections", async () => {
    const sections = await getPipelineBoard();
    assert.equal(calls.length, 1);
    assert.deepEqual(calls[0], [BOARD_RAW_URL, { cache: "no-store" }]);
    assert.equal(sections.length, 1);
    assert.equal(sections[0].items[0].id, "FEAT-10");
  });

  it("throws on a non-OK response", async () => {
    state.response = { ok: false, status: 503, text: async () => "" };
    await assert.rejects(getPipelineBoard(), /503/);
    assert.equal(calls.length, 1);
  });
});
