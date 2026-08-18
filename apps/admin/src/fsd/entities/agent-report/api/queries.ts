import "server-only";

import { env } from "~/env";
import { agentReportDirUrl } from "../config/github";
import { parseReportIndex, type AgentReport } from "../model/report-index";

/**
 * 한 행위자의 보고서 목록을 읽는다. 폴더가 없으면 404이고, 그것은 오류가 아니라
 * **아직 기록 없음**이다 — 폴더는 첫 보고서가 만든다(docs/agents/README.md).
 *
 * raw CDN은 디렉터리 목록을 못 준다(404 실측). contents API만 가능하고,
 * 미인증 한도가 60/h라 쓰기용 토큰의 Contents 읽기 권한을 재사용한다(새 권한 불필요).
 */
export async function getAgentReports(agent: string): Promise<AgentReport[]> {
  const token = env.GITHUB_PIPELINE_TOKEN;
  const res = await fetch(agentReportDirUrl(agent), {
    cache: "no-store",
    headers: {
      Accept: "application/vnd.github+json",
      ...(token === undefined ? {} : { Authorization: `Bearer ${token}` }),
    },
  });

  if (res.status === 404) return []; // 아직 기록 없음
  if (!res.ok) {
    throw new Error(`Failed to fetch agent reports (${agent}): ${res.status}`);
  }

  return parseReportIndex(await res.json());
}

/**
 * 행위자별 보고서 목록. 부모 디렉터리를 한 번 읽어 **실재하는 폴더만** 알아낸 뒤
 * 그것들만 병렬로 읽는다 — 폴더는 첫 보고서가 만들므로 초기에는 요청이 1회다.
 * 최대 1 + 행위자 수이며, 인증 한도 5,000/h 대비 무시할 수준이다.
 */
export async function getAgentReportIndex(): Promise<Map<string, AgentReport[]>> {
  const token = env.GITHUB_PIPELINE_TOKEN;
  const headers = {
    Accept: "application/vnd.github+json",
    ...(token === undefined ? {} : { Authorization: `Bearer ${token}` }),
  };

  const res = await fetch(agentReportDirUrl(), { cache: "no-store", headers });
  if (res.status === 404) return new Map(); // docs/agents 자체가 아직 없다
  if (!res.ok) {
    throw new Error(`Failed to fetch agent report index: ${res.status}`);
  }

  const raw: unknown = await res.json();
  const dirs = Array.isArray(raw)
    ? (raw as { type?: unknown; name?: unknown }[])
        .filter((e) => e !== null && typeof e === "object" && e.type === "dir")
        .map((e) => e.name)
        .filter((n): n is string => typeof n === "string")
    : [];

  const entries = await Promise.all(
    dirs.map(async (dir) => [dir, await getAgentReports(dir)] as const),
  );
  return new Map(entries);
}
