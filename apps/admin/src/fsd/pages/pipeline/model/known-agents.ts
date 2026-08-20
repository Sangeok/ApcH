// 순수. 발화 주체의 정체성. board.ts/reporting.ts와 같은 이유로 DB·fetch를 들이지 않는다.
import { ROSTER_AGENT_IDS } from "~/fsd/shared/agents/roster";

export type AgentIdentity = {
  id: string;
  handle: string; // 화면 이름(보드 agent 필드와 연결)
  role: string;
  emoji: string; // 초기 아바타(추후 일러스트 교체)
};

const ROSTER: Record<string, AgentIdentity> = {
  pm: { id: "pm", handle: "PM", role: "선정·발주", emoji: "📋" },
  "admin-dev": {
    id: "admin-dev",
    handle: "admin-dev",
    role: "어드민 개발",
    emoji: "🛠️",
  },
  "web-dev": { id: "web-dev", handle: "web-dev", role: "웹 개발", emoji: "🧩" },
  "doc-auditor": {
    id: "doc-auditor",
    handle: "doc-auditor",
    role: "문서 감사",
    emoji: "🔍",
  },
  "feature-scout": {
    id: "feature-scout",
    handle: "feature-scout",
    role: "기능 조사",
    emoji: "🧭",
  },
};

export const ROSTER_ORDER: readonly string[] = ROSTER_AGENT_IDS;

export function identityFor(agentId: string | null): AgentIdentity {
  if (agentId !== null) {
    const known = ROSTER[agentId]; // noUncheckedIndexedAccess: AgentIdentity | undefined
    if (known !== undefined) return known;
    return { id: agentId, handle: agentId, role: "에이전트", emoji: "" };
  }
  return { id: "system", handle: "시스템", role: "미지정", emoji: "•" };
}

export function initialOf(identity: AgentIdentity): string {
  const ch = identity.handle.trim().charAt(0); // charAt은 없으면 "" 반환
  return ch === "" ? "?" : ch.toUpperCase();
}
