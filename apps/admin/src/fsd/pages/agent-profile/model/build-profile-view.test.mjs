import assert from "node:assert/strict";
import { describe, it } from "node:test";

// shared·repo-doc index·agent-report index 모두 순수(server-only 미전이)라 mock 불필요.
const { parseAgentDefinition, buildAgentProfileView } = await import(
  "./build-profile-view.ts"
);

describe("parseAgentDefinition", () => {
  it("extracts description and body from real frontmatter", () => {
    const content = [
      "---",
      "name: admin-dev",
      "description: 계획서 작성 → 승인 → 구현 순서로 처리한다. 밖은 안 건드린다.",
      "tools: Read, Write, Edit",
      "---",
      "",
      "# 역할",
      "",
      "본문 문단.",
    ].join("\n");
    const { description, body } = parseAgentDefinition(content);
    assert.equal(
      description,
      "계획서 작성 → 승인 → 구현 순서로 처리한다. 밖은 안 건드린다.",
    );
    // 본문은 닫는 `---` 뒤부터, 선행 빈 줄 제거.
    assert.equal(body, "# 역할\n\n본문 문단.");
  });

  it("returns null description and full body when there is no frontmatter", () => {
    const content = "# 제목\n\n본문뿐.";
    assert.deepEqual(parseAgentDefinition(content), {
      description: null,
      body: "# 제목\n\n본문뿐.",
    });
  });

  it("fails open to full body when the frontmatter is never closed", () => {
    const content = "---\nname: x\ndescription: 안 닫힘\n# 역할\n본문";
    // 크래시 없이 null + 전체(정규화된) 본문.
    assert.deepEqual(parseAgentDefinition(content), {
      description: null,
      body: "---\nname: x\ndescription: 안 닫힘\n# 역할\n본문",
    });
  });

  it("normalizes CRLF before parsing", () => {
    const content = "---\r\nname: y\r\ndescription: 윈도우 개행\r\n---\r\n\r\n# 본문";
    const { description, body } = parseAgentDefinition(content);
    assert.equal(description, "윈도우 개행");
    assert.equal(body, "# 본문");
  });

  it("treats a blank description value as null", () => {
    const content = "---\nname: z\ndescription:   \n---\n\n# 본문";
    assert.equal(parseAgentDefinition(content).description, null);
  });
});

describe("buildAgentProfileView", () => {
  const reports = [
    { name: "FEAT-14.md", label: "FEAT-14", size: 10 },
    { name: "FEAT-15.md", label: "FEAT-15", size: 20 },
  ];

  it("returns an empty definition view when content is null but keeps records", () => {
    const view = buildAgentProfileView("admin-dev", null, reports);
    assert.equal(view.agentId, "admin-dev");
    assert.equal(view.roleSummary, null);
    assert.equal(view.bodyHtml, "");
    assert.equal(view.hasDefinition, false);
    assert.deepEqual(view.records, [
      { label: "FEAT-14", href: "/pipeline/docs/agents/admin-dev/FEAT-14" },
      { label: "FEAT-15", href: "/pipeline/docs/agents/admin-dev/FEAT-15" },
    ]);
  });

  it("maps each report to a reportDocHref link", () => {
    const view = buildAgentProfileView("web-dev", null, [
      { name: "FEAT-16.md", label: "FEAT-16", size: 5 },
    ]);
    assert.deepEqual(view.records, [
      { label: "FEAT-16", href: "/pipeline/docs/agents/web-dev/FEAT-16" },
    ]);
  });

  it("renders the definition body to html when a definition exists", () => {
    const content = "---\ndescription: 요약\n---\n\n# 역할\n\n본문.";
    const view = buildAgentProfileView("pm", content, []);
    assert.equal(view.hasDefinition, true);
    assert.equal(view.roleSummary, "요약");
    assert.ok(view.bodyHtml.includes("<h1>역할</h1>"));
    assert.deepEqual(view.records, []);
  });
});
