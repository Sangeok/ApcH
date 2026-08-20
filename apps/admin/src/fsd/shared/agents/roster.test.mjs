import assert from "node:assert/strict";
import { describe, it } from "node:test";

const {
  ROSTER_AGENT_IDS,
  isRosterAgentId,
  agentDefinitionPath,
  isAgentDefinitionPath,
  agentProfileHref,
} = await import("./roster.ts");

describe("isRosterAgentId", () => {
  it("accepts the five roster ids", () => {
    for (const id of ROSTER_AGENT_IDS) {
      assert.equal(isRosterAgentId(id), true);
    }
    assert.deepEqual([...ROSTER_AGENT_IDS], [
      "pm",
      "admin-dev",
      "web-dev",
      "doc-auditor",
      "feature-scout",
    ]);
  });

  it("rejects ids outside the closed roster", () => {
    for (const id of ["backend-dev", "main-loop", "", "PM", "admin", "../pm"]) {
      assert.equal(isRosterAgentId(id), false);
    }
  });
});

describe("agentDefinitionPath", () => {
  it("assembles exactly .claude/agents/<id>.md", () => {
    assert.equal(agentDefinitionPath("pm"), ".claude/agents/pm.md");
    assert.equal(
      agentDefinitionPath("admin-dev"),
      ".claude/agents/admin-dev.md",
    );
    assert.equal(
      agentDefinitionPath("feature-scout"),
      ".claude/agents/feature-scout.md",
    );
  });
});

describe("isAgentDefinitionPath", () => {
  it("accepts the five exact roster definition paths", () => {
    for (const id of ROSTER_AGENT_IDS) {
      assert.equal(isAgentDefinitionPath(`.claude/agents/${id}.md`), true);
    }
  });

  it("rejects non-roster, prefix-shaped, and traversal paths", () => {
    // backend-dev has a definition file but no desk → no reading entry point.
    for (const path of [
      ".claude/agents/backend-dev.md",
      ".claude/agents/main-loop.md",
      ".claude/agents/pm",
      ".claude/agents/pm.mdx",
      ".claude/agents/../secret.md",
      "docs/plans/FEAT-15.md",
    ]) {
      assert.equal(isAgentDefinitionPath(path), false);
    }
  });
});

describe("agentProfileHref", () => {
  it("routes a desk to its profile page", () => {
    assert.equal(agentProfileHref("admin-dev"), "/pipeline/agents/admin-dev");
    assert.equal(agentProfileHref("pm"), "/pipeline/agents/pm");
  });
});
