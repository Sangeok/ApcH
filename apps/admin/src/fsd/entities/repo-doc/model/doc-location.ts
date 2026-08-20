export type DocKind = "plan" | "report";
export type DocLocation = {
  path: string;          // 저장소 상대 경로 (docs/plans/FEAT-14.md)
  kind: DocKind;
  itemId: string | null; // 항목 문서면 ID, 고정명 문서(감사기록 등)면 null
  agent: string | null;  // 보고서면 행위자, 계획서면 null
};
export type DocLink = { label: string; href: string; kind: DocKind };

const SEGMENT_RE = /^[\w.가-힣-]+$/u; // \w=[A-Za-z0-9_]; FEAT-14·admin-dev·감사기록 통과
const ITEM_ID_RE = /^[A-Z]+-\d+$/;

function safeSegment(seg: string): boolean {
  return SEGMENT_RE.test(seg) && seg !== "." && !seg.includes("..");
}

/** slug(catch-all) → 화이트리스트 통과 경로. 밖이면 null(호출부가 notFound). */
export function locationFromSlug(slug: string[]): DocLocation | null {
  if (slug.length < 2 || !slug.every(safeSegment)) return null;
  const root = slug[0];
  const rest = slug.slice(1);
  if (root === "plans") {
    if (rest.length !== 1) return null;
    const file = rest[0] ?? "";
    return {
      path: `docs/plans/${file}.md`,
      kind: "plan",
      itemId: ITEM_ID_RE.test(file) ? file : null,
      agent: null,
    };
  }
  if (root === "agents") {
    if (rest.length !== 2) return null;
    const agent = rest[0] ?? "";
    const file = rest[1] ?? "";
    return {
      path: `docs/agents/${agent}/${file}.md`,
      kind: "report",
      itemId: ITEM_ID_RE.test(file) ? file : null,
      agent,
    };
  }
  return null;
}

/** api 층의 방어선(defense in depth): fetch 직전에 경로를 다시 검사한다. */
export function isWhitelistedDocPath(path: string): boolean {
  const plan = /^docs\/plans\/([\w.가-힣-]+)\.md$/u.exec(path);
  if (plan !== null) return safeSegment(plan[1] ?? "");
  const report = /^docs\/agents\/([\w.가-힣-]+)\/([\w.가-힣-]+)\.md$/u.exec(path);
  return (
    report !== null &&
    safeSegment(report[1] ?? "") &&
    safeSegment(report[2] ?? "")
  );
}

export function planDocHref(id: string): string {
  return `/pipeline/docs/plans/${id}`;
}
export function reportDocHref(agent: string, name: string): string {
  return `/pipeline/docs/agents/${agent}/${name}`;
}
const REPORT_LABEL: Record<string, string> = {
  "main-loop": "검증 기록",
  "admin-dev": "구현 보고",
  "web-dev": "구현 보고",
  "backend-dev": "구현 보고",
  "doc-auditor": "감사 보고",
  "feature-scout": "정찰 보고",
};
// docs/agents/README.md의 보고 행위자 닫힌 목록(pm은 폴더 없음).
// 결정적 순서: 계획→검증→구현→감사→정찰.
const DOC_LINK_AGENTS: readonly string[] = [
  "main-loop", "admin-dev", "web-dev", "backend-dev", "doc-auditor", "feature-scout",
];

/** 항목 ID의 형제 문서 링크. AgentReport 타입에 의존하지 않도록 원시값만 받는다
 *  — entities peer import(agent-report) 금지를 피하기 위함. */
export function docLinksForItem(
  id: string,
  hasPlan: boolean,
  agentsWithDoc: ReadonlySet<string>,
): DocLink[] {
  const links: DocLink[] = [];
  if (hasPlan) links.push({ label: "계획서", href: planDocHref(id), kind: "plan" });
  for (const agent of DOC_LINK_AGENTS) {
    if (agentsWithDoc.has(agent)) {
      links.push({ label: REPORT_LABEL[agent] ?? "기록", href: reportDocHref(agent, id), kind: "report" });
    }
  }
  return links;
}
