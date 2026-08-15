import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { resolvePipelineCommand } from "./commands.ts";

// FEAT-04 command-action.ts:15-16의 COMMAND_BODY 원문. pipeline-run 본문이
// 이 검증된 문자열에서 드리프트하면 루틴이 명령을 인식하지 못한다.
const ORIGINAL_COMMAND_BODY =
  "파이프라인을 진행해 주세요. PROJECT_BOARD.md의 각 항목을 현재 status와 런북 규칙대로 처리하되, 게이트 전이(계획지시·구현승인)는 사용자 몫이므로 바꾸지 마세요.";

const KEYS = [
  "pipeline-run",
  "pm-select",
  "audit-run",
  "scout-run",
  "admin-work",
  "web-work",
];

describe("resolvePipelineCommand", () => {
  it("keeps pipeline-run byte-for-byte identical to the original COMMAND_BODY", () => {
    assert.equal(resolvePipelineCommand("pipeline-run"), ORIGINAL_COMMAND_BODY);
  });

  it("returns a non-empty string for every whitelist key", () => {
    for (const key of KEYS) {
      const body = resolvePipelineCommand(key);
      assert.equal(typeof body, "string");
      assert.ok(body.length > 0, `${key} body is empty`);
    }
  });

  it("rejects unknown and prototype-pollution keys with null", () => {
    assert.equal(resolvePipelineCommand("arbitrary"), null);
    assert.equal(resolvePipelineCommand("__proto__"), null);
    assert.equal(resolvePipelineCommand("toString"), null);
  });

  it("never starts a body with [claude] (webhook 계약)", () => {
    for (const key of KEYS) {
      assert.ok(
        !resolvePipelineCommand(key).startsWith("[claude]"),
        `${key} starts with [claude]`,
      );
    }
  });

  it("includes the gate-transition guard in every body", () => {
    for (const key of KEYS) {
      assert.ok(
        resolvePipelineCommand(key).includes(
          "게이트 전이(계획지시·구현승인)는 사용자 몫",
        ),
        `${key} missing gate guard`,
      );
    }
  });

  it("routes each dev 작업 진행 command to its own workspace", () => {
    for (const key of ["admin-work", "web-work"]) {
      assert.ok(
        resolvePipelineCommand(key).includes(
          "배정된 항목을 현재 status와 런북 규칙대로",
        ),
        `${key} missing 작업 진행 instruction`,
      );
    }
    assert.ok(resolvePipelineCommand("admin-work").startsWith("admin-dev로서"));
    assert.ok(resolvePipelineCommand("web-work").startsWith("web-dev로서"));
  });
});
