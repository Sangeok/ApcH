// 순수 상수. peer slice(pipeline) 임포트는 FSD 경계가 금지하므로 좌표를 자체 보유한다.
// pipeline/config/github.ts와 값이 같아야 한다 — 보고서는 보드와 같은 브랜치에 산다.
const GITHUB_OWNER = "Sangeok";
const GITHUB_REPO = "ApcH";
const REPORT_BRANCH = "dev";

export const AGENT_REPORTS_PATH = "docs/agents";

/** 디렉터리 목록은 raw CDN으로 불가능하다(404 실측). contents API만 가능하다. */
export function agentReportDirUrl(agent?: string): string {
  const path =
    agent === undefined
      ? AGENT_REPORTS_PATH
      : `${AGENT_REPORTS_PATH}/${agent}`;
  return `https://api.github.com/repos/${GITHUB_OWNER}/${GITHUB_REPO}/contents/${path}?ref=${REPORT_BRANCH}`;
}
