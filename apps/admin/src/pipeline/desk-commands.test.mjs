import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { resolvePipelineCommand } from "./commands.ts";
import { deskCommandFor } from "./desk-commands.ts";

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
