import type { AgentReport } from "~/fsd/entities/agent-report";
import { renderInline, renderMarkdown, reportDocHref } from "~/fsd/entities/repo-doc";

export type ProfileRecord = { label: string; href: string };
export type DefinitionSectionView = { titleHtml: string; bodyHtml: string };
export type AgentProfileView = {
  agentId: string;
  roleSummary: string | null; // frontmatter description
  introHtml: string; // 첫 덩어리(도입부) 렌더, 정의 없으면 ""
  sections: DefinitionSectionView[]; // 나머지 `##` 절, 정의 없으면 []
  hasDefinition: boolean;
  records: ProfileRecord[];
};

/** `.claude/agents/<id>.md` frontmatter를 떼어 description과 본문으로 나눈다.
 *  frontmatter가 없거나 닫히지 않으면 description=null, body=전체(fail-open to body). */
export function parseAgentDefinition(content: string): {
  description: string | null;
  body: string;
} {
  const normalized = content.replace(/\r\n/g, "\n");
  const lines = normalized.split("\n");
  if (lines[0] !== "---") return { description: null, body: normalized };
  let close = -1;
  for (let i = 1; i < lines.length; i++) {
    if (lines[i] === "---") {
      close = i;
      break;
    }
  }
  if (close === -1) return { description: null, body: normalized };
  let description: string | null = null;
  for (let i = 1; i < close; i++) {
    const line = lines[i] ?? "";
    if (line.startsWith("description:")) {
      const value = line.slice("description:".length).trim();
      description = value === "" ? null : value;
      break;
    }
  }
  const body = lines
    .slice(close + 1)
    .join("\n")
    .replace(/^\n+/, "");
  return { description, body };
}

/** 정의 본문을 펜스 밖 `##` 경계로 나눈다. intro = 첫 `##` 앞(도입부),
 *  sections = 각 `##` 절(heading 줄 제외 본문). 코드 펜스(```) 안의 `##`는
 *  경계가 아니다 — pm.md의 `## YYYY-MM-DD`(펜스 안 예시)가 절로 찢기면 안 된다. */
export function outlineDefinitionBody(body: string): {
  intro: string;
  sections: { title: string; body: string }[];
} {
  const lines = body.replace(/\r\n/g, "\n").split("\n");
  const intro: string[] = [];
  const sections: { title: string; lines: string[] }[] = [];
  let current: { title: string; lines: string[] } | null = null;
  let inFence = false;
  for (const line of lines) {
    if (line.startsWith("```")) {
      inFence = !inFence;
    }
    const heading = inFence ? null : /^##\s+(.*)$/.exec(line);
    if (heading) {
      current = { title: (heading[1] ?? "").trim(), lines: [] };
      sections.push(current);
      continue;
    }
    if (current === null) {
      intro.push(line);
    } else {
      current.lines.push(line);
    }
  }
  return {
    intro: intro.join("\n").replace(/\n+$/, ""),
    sections: sections.map((s) => ({
      title: s.title,
      body: s.lines.join("\n").replace(/^\n+/, "").replace(/\n+$/, ""),
    })),
  };
}

export function buildAgentProfileView(
  agentId: string,
  definitionContent: string | null,
  reports: AgentReport[],
): AgentProfileView {
  const parsed =
    definitionContent === null
      ? { description: null, body: "" }
      : parseAgentDefinition(definitionContent);
  const outline = outlineDefinitionBody(parsed.body);
  return {
    agentId,
    roleSummary: parsed.description,
    introHtml: outline.intro === "" ? "" : renderMarkdown(outline.intro),
    sections: outline.sections.map((s) => ({
      titleHtml: renderInline(s.title),
      bodyHtml: renderMarkdown(s.body),
    })),
    hasDefinition: definitionContent !== null,
    records: reports.map((r) => ({
      label: r.label,
      href: reportDocHref(agentId, r.label),
    })),
  };
}
