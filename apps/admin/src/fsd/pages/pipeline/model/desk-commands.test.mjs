import assert from "node:assert/strict";
import { after, describe, it, mock } from "node:test";

mock.module("server-only", { namedExports: {} });
mock.module("~/env", {
  namedExports: { env: { GITHUB_PIPELINE_TOKEN: undefined } },
});
mock.module("~/server/auth/guard", {
  namedExports: {
    requireAdmin: async () => ({
      userId: "admin-test-user",
      email: "admin@example.com",
    }),
  },
});

const { resolvePipelineCommand } = await import(
  "~/fsd/features/run-pipeline-command"
);
const { deskCommandFor } = await import("./desk-commands.ts");

after(() => mock.restoreAll());

describe("deskCommandFor", () => {
  it("maps command-bearing desks to their key and label", () => {
    assert.deepEqual(deskCommandFor("pm"), {
      key: "pm-select",
      label: "선정 실행",
    });
    assert.deepEqual(deskCommandFor("admin-dev"), {
      key: "admin-work",
      label: "작업 진행",
    });
    assert.deepEqual(deskCommandFor("web-dev"), {
      key: "web-work",
      label: "작업 진행",
    });
    assert.deepEqual(deskCommandFor("doc-auditor"), {
      key: "audit-run",
      label: "감사 실행",
    });
    assert.deepEqual(deskCommandFor("feature-scout"), {
      key: "scout-run",
      label: "조사 실행",
    });
  });

  it("returns null for unknown agents", () => {
    assert.equal(deskCommandFor("unknown"), null);
  });

  it("every desk command key resolves to a real whitelist body", () => {
    // 라벨이 실제 화이트리스트 키에 붙어 있는지 — 두 모듈이 서로 드리프트하는 것을 막는다.
    for (const agentId of [
      "pm",
      "admin-dev",
      "web-dev",
      "doc-auditor",
      "feature-scout",
    ]) {
      const cmd = deskCommandFor(agentId);
      assert.notEqual(cmd, null);
      assert.notEqual(resolvePipelineCommand(cmd.key), null);
    }
  });
});
