"use server";

import { env } from "~/env";
import { ISSUE_COMMENTS_URL } from "~/fsd/entities/pipeline";
import { requireAdmin } from "~/server/auth/guard";
import { deriveProgress, type ProgressState } from "../model/progress";

// 이슈 #87 코멘트를 읽어 진행 상태를 도출한다(요구 3·4 무게중심). 읽기 전용:
// 새 외부 쓰기가 아니다(쓰기는 여전히 코멘트 POST·보드 커밋 둘뿐).
const WINDOW_MS = 6 * 60 * 60 * 1000; // 6시간: 어떤 실행+임계보다 넉넉한 창

export async function getPipelineProgress(): Promise<ProgressState> {
  // 내부 대시보드 전용 + 우리 서버가 임의 폴링으로 GitHub 프록시가 되지 않게.
  await requireAdmin();

  const windowStart = Date.now() - WINDOW_MS;
  const since = new Date(windowStart).toISOString();
  const url = `${ISSUE_COMMENTS_URL}?since=${since}&per_page=100`;

  // 인증 이유(실측): 폴링 15s=240req/h인데 미인증 한도는 60/h(측정 X-RateLimit-Limit: 60).
  // 토큰(기존 Issues RW — 코멘트 읽기 포함)으로 인증하면 5000/h라 여유롭다. 새 권한 불필요.
  const headers: Record<string, string> = {
    Accept: "application/vnd.github+json",
    "X-GitHub-Api-Version": "2022-11-28",
  };
  const token = env.GITHUB_PIPELINE_TOKEN;
  if (token) headers.Authorization = `Bearer ${token}`;

  // fetch와 본문 파싱을 한 try에 둔다 — 파싱 실패(비정상 본문)도 읽기 실패이고,
  // 여기서 새어 나가면 클라이언트 폴링이 reject를 받아 pill이 얼어붙는다.
  let raw: unknown;
  try {
    const res = await fetch(url, { headers, cache: "no-store" });
    if (!res.ok) return { kind: "unknown" };
    raw = await res.json();
  } catch (error) {
    console.error("Failed to read pipeline progress", error);
    return { kind: "unknown" };
  }
  if (!Array.isArray(raw)) return { kind: "unknown" };
  // Array.isArray는 unknown을 any[]로 좁힌다. 그대로 순회하면 any가 흘러나가
  // @typescript-eslint/no-unsafe-assignment·no-unsafe-member-access 4건으로 lint가 깨진다.
  const rawComments: unknown[] = raw;

  // GitHub의 `since`는 **마지막 수정 시각** 기준이다(생성 시각이 아니다 — REST 문서).
  // 그래서 오래된 코멘트를 편집하면 옛 created_at을 달고 창에 다시 들어오고, 이미 답글로
  // 갚힌 명령이 짝 없는 미응답으로 되살아나 "무응답 4320분" 같은 거짓 경보가 뜬다.
  // 창의 의미를 "최근 6시간에 생성된 것"으로 고정한다.
  const comments: { body: string; createdAt: string }[] = [];
  for (const value of rawComments) {
    if (typeof value !== "object" || value === null) {
      return { kind: "unknown" };
    }
    const body = "body" in value ? value.body : undefined;
    const createdAt = "created_at" in value ? value.created_at : undefined;
    if (typeof body !== "string" || typeof createdAt !== "string") {
      return { kind: "unknown" };
    }
    const createdAtMs = Date.parse(createdAt);
    if (Number.isNaN(createdAtMs)) return { kind: "unknown" };
    if (createdAtMs >= windowStart) comments.push({ body, createdAt });
  }
  return deriveProgress(comments, new Date());
}
