import "server-only";

import { env } from "~/env";
import { isAgentDefinitionPath } from "~/fsd/shared/agents/roster";
import { docContentUrl, plansDirUrl } from "../config/github";
import { isWhitelistedDocPath } from "../model/doc-location";

/** 화이트리스트 통과 경로의 raw 내용. 404(없음)면 null. 방어선: 경로 재검사.
 *  docs/plans·docs/agents(뷰어)에 더해 roster 정의 파일(.claude/agents/<id>.md)을 통과시킨다. */
export async function getDocContent(path: string): Promise<string | null> {
  if (!isWhitelistedDocPath(path) && !isAgentDefinitionPath(path)) return null;
  const res = await fetch(docContentUrl(path), { cache: "no-store" });
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`Failed to fetch doc (${path}): ${res.status}`);
  return res.text();
}

/** docs/plans/ 목록 → 항목 ID 집합(계획서 실재 판별). contents API 1회. */
export async function getPlanDocIds(): Promise<Set<string>> {
  const token = env.GITHUB_PIPELINE_TOKEN;
  const res = await fetch(plansDirUrl(), {
    cache: "no-store",
    headers: {
      Accept: "application/vnd.github+json",
      ...(token === undefined ? {} : { Authorization: `Bearer ${token}` }),
    },
  });
  if (res.status === 404) return new Set();
  if (!res.ok) throw new Error(`Failed to fetch plan index: ${res.status}`);
  const raw: unknown = await res.json();
  if (!Array.isArray(raw)) return new Set();
  const ids = new Set<string>();
  for (const e of raw as { type?: unknown; name?: unknown }[]) {
    if (e === null || typeof e !== "object") continue;
    if (e.type !== "file" || typeof e.name !== "string") continue;
    const m = /^([A-Z]+-\d+)\.md$/.exec(e.name); // FEAT-14.md → FEAT-14; README.md·template.md 제외
    if (m?.[1] !== undefined) ids.add(m[1]); // 옵셔널 체이닝 — `m && m[1]`은 prefer-optional-chain 위반
  }
  return ids;
}
