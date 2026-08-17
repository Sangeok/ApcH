import assert from "node:assert/strict";
import { after, beforeEach, describe, it, mock } from "node:test";

const AUTH_SENTINEL = new Error("NEXT_REDIRECT");
const originalFetch = globalThis.fetch;
const state = {
  authError: null,
  token: "token-1",
  calls: [],
  responses: [],
};

const BOARD = `# PROJECT_BOARD

## 2026-08-17
- [ ] FEAT-01: Example
  agent: admin-dev
  area: apps/admin
  status: 승인대기
  근거: test
`;
const REVIEW_BOARD = BOARD.replace("승인대기", "검토대기");

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

function response({ ok = true, status = 200, json }) {
  return { ok, status, json: json ?? (async () => ({})) };
}

function boardResponse(markdown = BOARD) {
  return response({
    json: async () => ({
      content: Buffer.from(markdown).toString("base64"),
      sha: "sha-1",
    }),
  });
}

globalThis.fetch = async (...args) => {
  state.calls.push(args);
  const next = state.responses.shift();
  if (next instanceof Error) throw next;
  if (!next) throw new Error("Unexpected fetch");
  return next;
};

const { commitGateTransition, commitRejectTransition } = await import(
  "./commit-gate-transition.ts"
);
const { BOARD_BRANCH, BOARD_CONTENTS_URL } = await import(
  "~/fsd/entities/pipeline"
);

after(() => {
  globalThis.fetch = originalFetch;
  mock.restoreAll();
});
beforeEach(() => {
  state.authError = null;
  state.token = "token-1";
  state.calls = [];
  state.responses = [];
});

describe("pipeline gate actions", () => {
  it("lets auth control-flow escape before any GitHub read", async () => {
    state.authError = AUTH_SENTINEL;
    await assert.rejects(
      commitGateTransition("FEAT-01", "승인대기"),
      (error) => error === AUTH_SENTINEL,
    );
    assert.equal(state.calls.length, 0);
  });

  it("fails without a token before fetch", async () => {
    state.token = undefined;
    assert.deepEqual(await commitGateTransition("FEAT-01", "승인대기"), {
      success: false,
      error: "GitHub 토큰이 설정되지 않았습니다",
    });
    assert.equal(state.calls.length, 0);
  });

  it("preserves Core invalid-input behavior: GET once and PUT zero", async () => {
    state.responses = [boardResponse()];
    const forward = await commitGateTransition("FEAT-01", "완료");
    assert.equal(forward.success, false);
    assert.equal(state.calls.length, 1);

    state.calls = [];
    state.responses = [boardResponse()];
    const reject = await commitRejectTransition(
      "arbitrary",
      "FEAT-01",
      "승인대기",
    );
    assert.deepEqual(reject, {
      success: false,
      error: "허용되지 않은 반려 액션입니다",
    });
    assert.equal(state.calls.length, 1);
  });

  it("keeps malformed and null JSON as rejected promises in Core", async () => {
    state.responses = [
      response({ json: async () => JSON.parse("not-json") }),
    ];
    await assert.rejects(commitGateTransition("FEAT-01", "승인대기"));

    state.calls = [];
    state.responses = [response({ json: async () => null })];
    await assert.rejects(commitGateTransition("FEAT-01", "승인대기"));
  });

  it("handles missing GitHub fields and stale board state without PUT", async () => {
    state.responses = [response({ json: async () => ({ sha: "sha-1" }) })];
    assert.deepEqual(await commitGateTransition("FEAT-01", "승인대기"), {
      success: false,
      error: "보드 콘텐츠를 읽지 못했습니다",
    });
    assert.equal(state.calls.length, 1);

    state.calls = [];
    state.responses = [boardResponse(REVIEW_BOARD)];
    const stale = await commitGateTransition("FEAT-01", "승인대기");
    assert.equal(stale.success, false);
    assert.match(stale.error, /이미 바뀌었습니다/);
    assert.equal(state.calls.length, 1);
  });

  it("commits the exact forward edit and optimistic-lock payload", async () => {
    state.responses = [boardResponse(), response({ status: 200 })];
    assert.deepEqual(await commitGateTransition("FEAT-01", "승인대기"), {
      success: true,
      data: undefined,
    });
    assert.equal(state.calls.length, 2);
    assert.equal(
      state.calls[0][0],
      `${BOARD_CONTENTS_URL}?ref=${BOARD_BRANCH}`,
    );
    assert.equal(state.calls[0][1].cache, "no-store");
    const [putUrl, putInit] = state.calls[1];
    assert.equal(putUrl, BOARD_CONTENTS_URL);
    assert.equal(putInit.method, "PUT");
    const payload = JSON.parse(putInit.body);
    assert.deepEqual(
      { message: payload.message, sha: payload.sha, branch: payload.branch },
      {
        message:
          "docs(board): open FEAT-01 for planning via dashboard gate",
        sha: "sha-1",
        branch: BOARD_BRANCH,
      },
    );
    assert.equal(
      Buffer.from(payload.content, "base64").toString("utf8"),
      BOARD.replace("status: 승인대기", "status: 계획지시"),
    );
  });

  it("commits a whitelisted reject edit", async () => {
    state.responses = [boardResponse(REVIEW_BOARD), response({ status: 200 })];
    assert.deepEqual(
      await commitRejectTransition("bounce", "FEAT-01", "검토대기"),
      { success: true, data: undefined },
    );
    const payload = JSON.parse(state.calls[1][1].body);
    assert.equal(
      payload.message,
      "docs(board): bounce FEAT-01 back to planning via dashboard gate",
    );
    assert.equal(
      Buffer.from(payload.content, "base64").toString("utf8"),
      REVIEW_BOARD.replace("status: 검토대기", "status: 계획지시"),
    );
  });

  it("turns a SHA conflict into the existing handled failure", async () => {
    state.responses = [
      boardResponse(),
      response({ ok: false, status: 409 }),
    ];
    assert.deepEqual(await commitGateTransition("FEAT-01", "승인대기"), {
      success: false,
      error: "보드가 방금 바뀌었습니다. 새로고침 후 다시 시도하세요",
    });
  });
});
