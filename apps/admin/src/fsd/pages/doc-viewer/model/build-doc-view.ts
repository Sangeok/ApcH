import type { AgentReport } from "~/fsd/entities/agent-report";
import type { BoardItem } from "~/fsd/entities/pipeline";
import {
  docLinksForItem, docSourceUrl, planDocHref, reportDocHref, renderMarkdown,
  type DocKind, type DocLink, type DocLocation,
} from "~/fsd/entities/repo-doc";
import { rejectActionsFor, resolveGateTransition, type RejectAction } from "~/fsd/features/transition-pipeline-gate";

export type DossierTab = DocLink & { active: boolean };
export type DocView = {
  kind: DocKind;
  kindLabel: string;       // "계획서 · 현재 계약" | "보고서 · 누적 기록"
  title: string;
  itemId: string | null;
  status: string | null;
  gateLabel: string | null; // 게이트② 버튼이 찍을 to(검토대기→구현승인 등), 없으면 null
  rejectActions: RejectAction[];
  tabs: DossierTab[];
  html: string;
  sourceUrl: string;
};

function fileLabel(path: string): string {
  const base = path.split("/").pop() ?? path;
  return base.endsWith(".md") ? base.slice(0, -3) : base;
}

/** 이 항목의 실재하는 형제 문서 탭. currentHref로 active 결정. */
export function dossierTabs(
  itemId: string, currentHref: string,
  hasPlan: boolean, reports: ReadonlyMap<string, AgentReport[]>,
): DossierTab[] {
  const agentsWithDoc = new Set(
    [...reports].filter(([, l]) => l.some((r) => r.name === `${itemId}.md`)).map(([a]) => a),
  );
  return docLinksForItem(itemId, hasPlan, agentsWithDoc).map((d) => ({ ...d, active: d.href === currentHref }));
}

export function buildDocView(
  location: DocLocation, content: string,
  boardItem: BoardItem | null,
  planDocIds: ReadonlySet<string>,
  reports: ReadonlyMap<string, AgentReport[]>,
): DocView {
  const status = boardItem?.status ?? null;
  // 뷰어의 실행 제어는 발주 스코프 (a)인 게이트②만: 승인대기 게이트①은 /pipeline 결재함 소유다.
  const canRunGateTwo = location.itemId !== null && status === "검토대기";
  const gateTo = canRunGateTwo ? resolveGateTransition(status) : null;
  const currentHref =
    location.kind === "plan"
      ? planDocHref(location.itemId ?? fileLabel(location.path))
      : reportDocHref(location.agent ?? "", fileLabel(location.path));
  return {
    kind: location.kind,
    kindLabel: location.kind === "plan" ? "계획서 · 현재 계약" : "보고서 · 누적 기록",
    title: location.itemId ?? fileLabel(location.path),
    itemId: location.itemId,
    status,
    gateLabel: gateTo,
    rejectActions: canRunGateTwo ? rejectActionsFor(status) : [],
    tabs: location.itemId !== null
      ? dossierTabs(location.itemId, currentHref, planDocIds.has(location.itemId), reports)
      : [], // 고정명 문서(감사기록 등)는 탭 없이 단독 렌더(백로그 참고)
    html: renderMarkdown(content),
    sourceUrl: docSourceUrl(location.path),
  };
}
