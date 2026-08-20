// 앱 전역 roster 멤버십의 단일 출처. 사무실 책상·상세 라우트·repo-doc 문서
// 화이트리스트가 모두 이 닫힌 목록에 합의한다. entities는 peer import 금지(R2)라
// repo-doc이 pages 로스터를 못 읽으므로, 셋 다 닿는 유일한 하위 계층인 shared가 집이다.
// DB·fetch·server-only를 들이지 않는다.
export const ROSTER_AGENT_IDS = [
  "pm",
  "admin-dev",
  "web-dev",
  "doc-auditor",
  "feature-scout",
] as const;

export type RosterAgentId = (typeof ROSTER_AGENT_IDS)[number];

export function isRosterAgentId(id: string): id is RosterAgentId {
  return (ROSTER_AGENT_IDS as readonly string[]).includes(id);
}

/** 이 행위자의 정의 파일 경로. roster id에서만 조립한다. */
export function agentDefinitionPath(id: RosterAgentId): string {
  return `.claude/agents/${id}.md`;
}

// 접두사/정규식이 아니라 roster에서 조립한 정확 경로의 닫힌 집합(요구 2).
// backend-dev.md는 정의 파일이 있어도 책상이 없어 여기 없다 — 진입점 없는 문서는 못 읽는다.
const AGENT_DEFINITION_PATHS: ReadonlySet<string> = new Set(
  ROSTER_AGENT_IDS.map((id) => agentDefinitionPath(id)),
);

/** getDocContent의 방어선: 이 경로가 정의 파일 화이트리스트에 있나. */
export function isAgentDefinitionPath(path: string): boolean {
  return AGENT_DEFINITION_PATHS.has(path);
}

/** 사무실 책상 → 상세 페이지 라우트. */
export function agentProfileHref(id: string): string {
  return `/pipeline/agents/${id}`;
}
