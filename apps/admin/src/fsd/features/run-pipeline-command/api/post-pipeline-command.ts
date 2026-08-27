"use server";

import { env } from "~/env";
import { ISSUE_COMMENTS_URL } from "~/fsd/entities/pipeline";
import { type ActionResult, failure, success } from "~/fsd/shared/api/result";
import { requireAdmin } from "~/server/auth/guard";
import {
  resolvePipelineCommand,
  type PipelineCommandKey,
} from "../model/commands";

// #87 코멘트가 외부 webhook(pipeline-command)을 깨워 에이전트를 돌린다.
// 게이트 전이(계획지시·구현승인)는 사용자 몫이므로 이 명령은 status를 바꾸지 않고
// "현재 status대로 처리하라"는 실행 트리거만 보낸다.
// 명령 계약(2026-08-14 실측으로 확정 — 「범위 밖 의존」 1 참고): 접두 토큰은 없다.
// webhook은 이슈의 모든 새 코멘트에 발화하고, 루틴 지침이 (a) 이슈 #87 (b) 작성자가
// 저장소 소유자 (c) "[claude]"로 시작하지 않음 — 세 조건으로 명령을 고른다.
// 따라서 이 문자열은 "[claude]"로 시작하면 안 되고, 게시 계정이 소유자여야 한다.
// 게시 가능한 본문은 commands.ts의 화이트리스트가 유일한 출처다(보안 경계).
// 루틴이 실행 중 남기는 진행 코멘트("[claude][진행]" 접두)도 (c)에 걸려 명령이 아니다 —
// get-pipeline-progress.ts/progress.ts가 이를 진행 상태(running)로 읽는다(FEAT-24).

export async function postPipelineCommand(
  command: PipelineCommandKey,
): Promise<ActionResult<void>> {
  // 목적지 인가는 그대로 try 밖·최상단(NEXT_REDIRECT를 catch가 삼키지 않게).
  await requireAdmin();

  // 화이트리스트 밖 key는 여기서 거부한다. 클라이언트는 key만 보내고 본문은 서버가 정한다.
  const body = resolvePipelineCommand(command);
  if (body === null) {
    return failure("Unknown command");
  }

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
      body: JSON.stringify({ body }),
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
