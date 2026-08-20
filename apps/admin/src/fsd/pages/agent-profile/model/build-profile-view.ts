import type { AgentReport } from "~/fsd/entities/agent-report";
import { renderMarkdown, reportDocHref } from "~/fsd/entities/repo-doc";

export type ProfileRecord = { label: string; href: string };
export type AgentProfileView = {
  agentId: string;
  roleSummary: string | null; // frontmatter description
  bodyHtml: string; // 본문 렌더(frontmatter 제거 후), 없으면 ""
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

export function buildAgentProfileView(
  agentId: string,
  definitionContent: string | null,
  reports: AgentReport[],
): AgentProfileView {
  const parsed =
    definitionContent === null
      ? { description: null, body: "" }
      : parseAgentDefinition(definitionContent);
  return {
    agentId,
    roleSummary: parsed.description,
    bodyHtml: parsed.body === "" ? "" : renderMarkdown(parsed.body),
    hasDefinition: definitionContent !== null,
    records: reports.map((r) => ({
      label: r.label,
      href: reportDocHref(agentId, r.label),
    })),
  };
}
