import type { Metadata } from "next";
import { notFound } from "next/navigation";

import type { AgentReport } from "~/fsd/entities/agent-report";
import { getAgentReportIndex } from "~/fsd/entities/agent-report/api";
import { getPipelineBoard } from "~/fsd/entities/pipeline/api";
import { latestItemById, type BoardItem } from "~/fsd/entities/pipeline";
import { getDocContent, getPlanDocIds } from "~/fsd/entities/repo-doc/api";
import { locationFromSlug } from "~/fsd/entities/repo-doc";
import { buildDocView, DocViewer } from "~/fsd/pages/doc-viewer";
import { requireAdmin } from "~/server/auth/guard";

export const metadata: Metadata = { title: "Admin Pipeline Doc", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic"; // 매 요청 dev 브랜치 문서를 다시 읽는다

export default async function AdminPipelineDocRoute({ params }: { params: Promise<{ slug: string[] }> }) {
  await requireAdmin(); // (protected)/layout.tsx:11이 이미 확인하지만 목적지 재검사(3중 방어선 3층)
  const { slug } = await params;
  const location = locationFromSlug(slug);
  if (location === null) notFound(); // 화이트리스트 밖(요구 4)

  const content = await getDocContent(location.path);
  if (content === null) notFound(); // 미존재(raw 404)

  // 항목 문서일 때만 보드 상태·게이트(스코프 a)·형제 탭(스코프 b) 문맥을 읽는다.
  let boardItem: BoardItem | null = null;
  let planDocIds: ReadonlySet<string> = new Set<string>();
  let reports: ReadonlyMap<string, AgentReport[]> = new Map<string, AgentReport[]>();
  if (location.itemId !== null) {
    const [sections, planIds, reportIndex] = await Promise.all([
      getPipelineBoard(), getPlanDocIds(), getAgentReportIndex(),
    ]);
    boardItem = latestItemById(sections, location.itemId);
    planDocIds = planIds;
    reports = reportIndex;
  }
  const view = buildDocView(location, content, boardItem, planDocIds, reports);
  return (
    <main className="bg-briefing min-h-screen">
      <DocViewer view={view} />
    </main>
  );
}
