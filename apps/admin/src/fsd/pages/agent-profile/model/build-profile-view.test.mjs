import assert from "node:assert/strict";
import { describe, it } from "node:test";

// shared·repo-doc index·agent-report index 모두 순수(server-only 미전이)라 mock 불필요.
const { parseAgentDefinition, outlineDefinitionBody, buildAgentProfileView } =
  await import("./build-profile-view.ts");

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

describe("outlineDefinitionBody", () => {
  it("splits an intro chunk and each `##` section, dropping the heading line", () => {
    const body = [
      "# 역할",
      "",
      "도입 문단.",
      "",
      "## 담당 범위",
      "",
      "범위 본문.",
      "",
      "## 검증",
      "검증 본문.",
    ].join("\n");
    const { intro, sections } = outlineDefinitionBody(body);
    assert.equal(intro, "# 역할\n\n도입 문단.");
    assert.equal(sections.length, 2);
    assert.equal(sections[0].title, "담당 범위");
    assert.equal(sections[0].body, "범위 본문.");
    assert.equal(sections[1].title, "검증");
    assert.equal(sections[1].body, "검증 본문.");
    // heading 줄은 절 body에 남지 않는다 (summary와 중복 방지).
    assert.ok(!sections[0].body.includes("## 담당 범위"));
  });

  it("keeps a `##` inside a code fence with the previous chunk (pm.md:57 trap)", () => {
    const body = [
      "## 활동 기록",
      "",
      "예시 형식:",
      "",
      "```",
      "## 2026-01-01",
      "- 항목",
      "```",
    ].join("\n");
    const { intro, sections } = outlineDefinitionBody(body);
    assert.equal(intro, "");
    // 펜스 안 `## 2026-01-01`이 두 번째 절을 만들면 안 된다.
    assert.equal(sections.length, 1);
    assert.equal(sections[0].title, "활동 기록");
    assert.ok(sections[0].body.includes("## 2026-01-01"));
  });

  it("treats a `##` after a closed fence as a boundary again", () => {
    const body = [
      "## A",
      "",
      "```",
      "## 펜스 안",
      "```",
      "",
      "## B",
      "B 본문.",
    ].join("\n");
    const { sections } = outlineDefinitionBody(body);
    assert.equal(sections.length, 2);
    assert.equal(sections[0].title, "A");
    assert.ok(sections[0].body.includes("## 펜스 안"));
    assert.equal(sections[1].title, "B");
    assert.equal(sections[1].body, "B 본문.");
  });

  it("toggles on a language-tagged fence so later `##` sections survive", () => {
    // ```ts 로 연 펜스가 startsWith 계약으로 닫힌다. `line === "```"` 구현이면
    // 언어 태그 열림에서 토글을 놓쳐 이후 절을 이전 청크로 삼킨다(sections.length 감소).
    const body = [
      "## 코드 예시",
      "",
      "```ts",
      "const x = 1;",
      "## 이건 펜스 안",
      "```",
      "",
      "## 다음 절",
      "다음 본문.",
      "",
      "## 또 다음 절",
      "또 본문.",
    ].join("\n");
    const { sections } = outlineDefinitionBody(body);
    assert.equal(sections.length, 3);
    assert.equal(sections[0].title, "코드 예시");
    assert.ok(sections[0].body.includes("## 이건 펜스 안"));
    assert.equal(sections[1].title, "다음 절");
    assert.equal(sections[2].title, "또 다음 절");
  });

  it("returns the whole body as intro when there is no `##`", () => {
    const body = "# 역할\n\n도입만 있고 절은 없다.";
    const { intro, sections } = outlineDefinitionBody(body);
    assert.equal(intro, "# 역할\n\n도입만 있고 절은 없다.");
    assert.deepEqual(sections, []);
  });

  it("yields an empty intro when the body starts with a `##`", () => {
    const { intro, sections } = outlineDefinitionBody("## 유일 절\n본문.");
    assert.equal(intro, "");
    assert.equal(sections.length, 1);
    assert.equal(sections[0].title, "유일 절");
    assert.equal(sections[0].body, "본문.");
  });

  it("does not treat `###` or `##text` as boundaries", () => {
    const body = [
      "## 부모 절",
      "",
      "### 하위 제목",
      "하위 본문.",
      "##붙은건아님",
    ].join("\n");
    const { sections } = outlineDefinitionBody(body);
    assert.equal(sections.length, 1);
    assert.equal(sections[0].title, "부모 절");
    assert.ok(sections[0].body.includes("### 하위 제목"));
    assert.ok(sections[0].body.includes("##붙은건아님"));
  });

  it("normalizes CRLF before splitting", () => {
    const body = "# 역할\r\n\r\n도입.\r\n\r\n## 절 A\r\nA 본문.";
    const { intro, sections } = outlineDefinitionBody(body);
    assert.equal(intro, "# 역할\n\n도입.");
    assert.equal(sections.length, 1);
    assert.equal(sections[0].title, "절 A");
    assert.equal(sections[0].body, "A 본문.");
  });

  it("preserves inline code in a section title", () => {
    const { sections } = outlineDefinitionBody("## `area` 규칙\n본문.");
    assert.equal(sections[0].title, "`area` 규칙");
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
    assert.equal(view.introHtml, "");
    assert.equal(view.sections.length, 0);
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

  it("splits the definition into an intro and collapsible sections", () => {
    const content = [
      "---",
      "description: 요약",
      "---",
      "",
      "# 역할",
      "",
      "도입 문단.",
      "",
      "## `area` 절",
      "",
      "절 본문.",
    ].join("\n");
    const view = buildAgentProfileView("pm", content, []);
    assert.equal(view.hasDefinition, true);
    assert.equal(view.roleSummary, "요약");
    assert.ok(view.introHtml.includes("<h1>역할</h1>"));
    assert.equal(view.sections.length, 1);
    // 절 제목은 renderInline으로 렌더돼 인라인 코드를 살린다.
    assert.ok(view.sections[0].titleHtml.includes("<code>area</code>"));
    assert.ok(view.sections[0].bodyHtml.includes("<p>절 본문.</p>"));
    assert.deepEqual(view.records, []);
  });
});
