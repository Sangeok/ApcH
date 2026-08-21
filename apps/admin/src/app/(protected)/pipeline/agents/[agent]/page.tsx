import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { getAgentReports } from "~/fsd/entities/agent-report/api";
import { getDocContent } from "~/fsd/entities/repo-doc/api";
import { AgentProfile, buildAgentProfileView } from "~/fsd/pages/agent-profile";
import {
  agentDefinitionPath,
  isRosterAgentId,
} from "~/fsd/shared/agents/roster";
import { requireAdmin } from "~/server/auth/guard";

export const metadata: Metadata = {
  title: "Admin Agent Profile",
  robots: { index: false, follow: false },
};
export const dynamic = "force-dynamic";

export default async function AgentProfileRoute({
  params,
}: {
  params: Promise<{ agent: string }>;
}) {
  await requireAdmin(); // 목적지 재검사(3중 방어선 3층)
  const { agent } = await params;
  if (!isRosterAgentId(agent)) notFound(); // 요구 2: roster 밖은 notFound

  const [definition, reports] = await Promise.all([
    getDocContent(agentDefinitionPath(agent)),
    getAgentReports(agent),
  ]);
  const view = buildAgentProfileView(agent, definition, reports);
  return (
    <main className="bg-briefing min-h-screen">
      <AgentProfile view={view} />
    </main>
  );
}
