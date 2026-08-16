"use server";

import { env } from "~/env";
import { requireAdmin } from "~/auth/guard";
import { type ActionResult, failure, success } from "~/lib/result";
import { BOARD_BRANCH, BOARD_CONTENTS_URL } from "./github";
import { applyGateTransition, gateCommitMessage } from "./transitions";

const GITHUB_HEADERS = {
  Accept: "application/vnd.github+json",
  "X-GitHub-Api-Version": "2022-11-28",
};

// 순수 전이 거부 사유 → 사용자 문구.
const REASON_MESSAGE: Record<string, string> = {
  "not-whitelisted": "허용되지 않은 게이트 전이입니다",
  "not-found": "보드에서 항목을 찾지 못했습니다",
  format: "보드 형식을 해석하지 못했습니다",
  stale: "보드가 이미 바뀌었습니다. 새로고침 후 다시 시도하세요",
};

export async function commitGateTransition(
  id: string,
  expectedStatus: string,
): Promise<ActionResult<void>> {
  // 인가는 try 밖 최상단(NEXT_REDIRECT를 catch가 삼키지 않게, command-action.ts와 동일).
  await requireAdmin();

  const token = env.GITHUB_PIPELINE_TOKEN;
  if (!token) {
    return failure("GitHub 토큰이 설정되지 않았습니다");
  }
  const auth = { ...GITHUB_HEADERS, Authorization: `Bearer ${token}` };

  // 1) 현재 dev 보드 콘텐츠 + sha. raw(CDN 캐시)가 아니라 contents API로 HEAD를 읽는다.
  let getRes: Response;
  try {
    getRes = await fetch(`${BOARD_CONTENTS_URL}?ref=${BOARD_BRANCH}`, {
      headers: auth,
      cache: "no-store",
    });
  } catch (error) {
    console.error("Failed to load board", error);
    return failure("보드를 불러오지 못했습니다");
  }
  if (!getRes.ok) {
    return failure(`GitHub API가 ${getRes.status} 오류로 응답했습니다`);
  }
  const meta = (await getRes.json()) as { content?: string; sha?: string };
  if (typeof meta.content !== "string" || typeof meta.sha !== "string") {
    return failure("보드 콘텐츠를 읽지 못했습니다");
  }
  const markdown = Buffer.from(meta.content, "base64").toString("utf-8");

  // 2) 순수 전이(화이트리스트 + 스테일 가드 + status 줄만 교체).
  const edit = applyGateTransition(markdown, id, expectedStatus);
  if (!edit.ok) {
    return failure(REASON_MESSAGE[edit.reason] ?? "전이를 적용하지 못했습니다");
  }

  // 3) 커밋(PUT). sha 낙관적 잠금 — GET 이후 원격이 바뀌면 409.
  let putRes: Response;
  try {
    putRes = await fetch(BOARD_CONTENTS_URL, {
      method: "PUT",
      headers: { ...auth, "Content-Type": "application/json" },
      body: JSON.stringify({
        message: gateCommitMessage(id, edit.to),
        content: Buffer.from(edit.markdown, "utf-8").toString("base64"),
        sha: meta.sha,
        branch: BOARD_BRANCH,
      }),
    });
  } catch (error) {
    console.error("Failed to commit board transition", error);
    return failure("보드 커밋에 실패했습니다");
  }
  if (putRes.status === 409) {
    return failure("보드가 방금 바뀌었습니다. 새로고침 후 다시 시도하세요");
  }
  if (!putRes.ok) {
    return failure(`GitHub API가 ${putRes.status} 오류로 응답했습니다`);
  }
  return success();
}
