import type { Metadata } from "next";

import { getAgentReportIndex } from "~/fsd/entities/agent-report/api";
import { getPipelineBoard } from "~/fsd/entities/pipeline/api";
import { getPlanDocIds } from "~/fsd/entities/repo-doc/api";
import { buildBriefing, PipelineBriefing } from "~/fsd/pages/pipeline";
import { requireAdmin } from "~/server/auth/guard";

export const metadata: Metadata = {
  title: "Admin Pipeline",
  robots: { index: false, follow: false },
};

// 매 요청 dev 브랜치 보드를 다시 읽는 투영이므로 정적화하지 않는다.
export const dynamic = "force-dynamic";

export default async function AdminPipelineRoute() {
  await requireAdmin();
  const [sections, reports, planDocIds] = await Promise.all([
    getPipelineBoard(),
    getAgentReportIndex(),
    getPlanDocIds(),
  ]);
  const briefing = buildBriefing(sections, new Date(), { planDocIds, reports });

  return (
    <main className="bg-briefing min-h-screen">
      <PipelineBriefing briefing={briefing} reports={reports} />
    </main>
  );
}
