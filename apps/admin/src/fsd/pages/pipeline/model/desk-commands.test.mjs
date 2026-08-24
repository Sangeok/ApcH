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
    assert.deepEqual(deskCommandFor("backend-dev"), {
      key: "backend-work",
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

  it("returns null for plan-verifier (roster member with no desk command, 요구 3)", () => {
    // plan-verifier는 roster이지만 책상 명령이 없다 — 검증은 런북 4단계에서 메인 루프가
    // 수행하는 일이라 별도 트리거 대상이 아니다. null이면 PixelDeskUnit이 버튼을 안 그린다.
    assert.equal(deskCommandFor("plan-verifier"), null);
  });

  it("every desk command key resolves to a real whitelist body", () => {
    // 라벨이 실제 화이트리스트 키에 붙어 있는지 — 두 모듈이 서로 드리프트하는 것을 막는다.
    for (const agentId of [
      "pm",
      "admin-dev",
      "web-dev",
      "backend-dev",
      "doc-auditor",
      "feature-scout",
    ]) {
      const cmd = deskCommandFor(agentId);
      assert.notEqual(cmd, null);
      assert.notEqual(resolvePipelineCommand(cmd.key), null);
    }
  });
});
