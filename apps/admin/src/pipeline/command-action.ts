"use server";

import { env } from "~/env";
import { requireAdmin } from "~/auth/guard";
import { type ActionResult, failure, success } from "~/lib/result";
import { ISSUE_COMMENTS_URL } from "./github";

// #87 코멘트가 외부 webhook(pipeline-command)을 깨워 에이전트를 돌린다.
// 게이트 전이(계획지시·구현승인)는 사용자 몫이므로 이 명령은 status를 바꾸지 않고
// "현재 status대로 처리하라"는 실행 트리거만 보낸다.
// 명령 계약(2026-08-14 실측으로 확정 — 「범위 밖 의존」 1 참고): 접두 토큰은 없다.
// webhook은 이슈의 모든 새 코멘트에 발화하고, 루틴 지침이 (a) 이슈 #87 (b) 작성자가
// 저장소 소유자 (c) "[claude]"로 시작하지 않음 — 세 조건으로 명령을 고른다.
// 따라서 이 문자열은 "[claude]"로 시작하면 안 되고, 게시 계정이 소유자여야 한다.
const COMMAND_BODY =
  "파이프라인을 진행해 주세요. PROJECT_BOARD.md의 각 항목을 현재 status와 런북 규칙대로 처리하되, 게이트 전이(계획지시·구현승인)는 사용자 몫이므로 바꾸지 마세요.";

export async function postPipelineCommand(): Promise<ActionResult<void>> {
  // 목적지 인가. test-action.ts와 동일하게 try 밖에서 부른다
  // (안에 넣으면 catch가 NEXT_REDIRECT를 삼킨다).
  await requireAdmin();

  const token = env.GITHUB_PIPELINE_TOKEN;
  if (!token) {
    return failure("GitHub token is not configured");
  }

  try {
    const res = await fetch(ISSUE_COMMENTS_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: "application/vnd.github+json",
        "X-GitHub-Api-Version": "2022-11-28",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ body: COMMAND_BODY }),
    });

    if (!res.ok) {
      return failure(`GitHub API responded ${res.status}`);
    }

    return success();
  } catch (error) {
    console.error("Failed to post pipeline command", error);
    return failure("Failed to post command");
  }
}
