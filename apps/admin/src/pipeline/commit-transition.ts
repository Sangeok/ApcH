"use server";

import { env } from "~/env";
import { requireAdmin } from "~/auth/guard";
import { type ActionResult, failure, success } from "~/lib/result";
import { BOARD_BRANCH, BOARD_CONTENTS_URL } from "./github";
import {
  applyBounceTransition,
  applyDiscard,
  applyGateTransition,
  applyHoldTransition,
  gateCommitMessage,
  holdResultLine,
  rejectCommitMessage,
} from "./transitions";

const GITHUB_HEADERS = {
  Accept: "application/vnd.github+json",
  "X-GitHub-Api-Version": "2022-11-28",
};

// 순수 전이 거부 사유 → 사용자 문구(승인·반려 공용).
const REASON_MESSAGE: Record<string, string> = {
  "not-whitelisted": "허용되지 않은 전이입니다",
  "not-found": "보드에서 항목을 찾지 못했습니다",
  format: "보드 형식을 해석하지 못했습니다",
  stale: "보드가 이미 바뀌었습니다. 새로고침 후 다시 시도하세요",
};

type BoardEdit =
  | { ok: true; markdown: string; message: string }
  | { ok: false; message: string };

// GET(콘텐츠+sha) → makeEdit(순수) → PUT(sha 낙관적 잠금). 토큰·409·오류 문구를 한 곳에.
async function commitBoardEdit(
  makeEdit: (markdown: string) => BoardEdit,
): Promise<ActionResult<void>> {
  const token = env.GITHUB_PIPELINE_TOKEN;
  if (!token) return failure("GitHub 토큰이 설정되지 않았습니다");
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

  // 2) 순수 편집(화이트리스트 + 스테일 가드 + 최소 diff).
  const edit = makeEdit(markdown);
  if (!edit.ok) return failure(edit.message);

  // 3) 커밋(PUT). sha 낙관적 잠금 — GET 이후 원격이 바뀌면 409.
  let putRes: Response;
  try {
    putRes = await fetch(BOARD_CONTENTS_URL, {
      method: "PUT",
      headers: { ...auth, "Content-Type": "application/json" },
      body: JSON.stringify({
        message: edit.message,
        content: Buffer.from(edit.markdown, "utf-8").toString("base64"),
        sha: meta.sha,
        branch: BOARD_BRANCH,
      }),
    });
  } catch (error) {
    console.error("Failed to commit board edit", error);
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

// 승인(전진 전이) — 기존 signature·동작 유지, 플러밍만 헬퍼로.
export async function commitGateTransition(
  id: string,
  expectedStatus: string,
): Promise<ActionResult<void>> {
  // 인가는 try 밖 최상단(NEXT_REDIRECT를 catch가 삼키지 않게, command-action.ts와 동일).
  await requireAdmin();
  return commitBoardEdit((markdown) => {
    const edit = applyGateTransition(markdown, id, expectedStatus);
    if (!edit.ok) {
      return {
        ok: false,
        message: REASON_MESSAGE[edit.reason] ?? "전이를 적용하지 못했습니다",
      };
    }
    return {
      ok: true,
      markdown: edit.markdown,
      message: gateCommitMessage(id, edit.to),
    };
  });
}

// 반려 — action은 서버가 화이트리스트로 다시 검증(권위는 서버). 클라는 key만 보낸다.
export async function commitRejectTransition(
  action: string,
  id: string,
  expectedStatus: string,
): Promise<ActionResult<void>> {
  await requireAdmin();
  return commitBoardEdit((markdown) => {
    switch (action) {
      case "bounce": {
        const edit = applyBounceTransition(markdown, id, expectedStatus);
        if (!edit.ok) {
          return {
            ok: false,
            message: REASON_MESSAGE[edit.reason] ?? "반려를 적용하지 못했습니다",
          };
        }
        return {
          ok: true,
          markdown: edit.markdown,
          message: rejectCommitMessage("bounce", id),
        };
      }
      case "hold": {
        const edit = applyHoldTransition(
          markdown,
          id,
          expectedStatus,
          holdResultLine(new Date()),
        );
        if (!edit.ok) {
          return {
            ok: false,
            message: REASON_MESSAGE[edit.reason] ?? "반려를 적용하지 못했습니다",
          };
        }
        return {
          ok: true,
          markdown: edit.markdown,
          message: rejectCommitMessage("hold", id),
        };
      }
      case "discard": {
        const edit = applyDiscard(markdown, id, expectedStatus);
        if (!edit.ok) {
          return {
            ok: false,
            message: REASON_MESSAGE[edit.reason] ?? "반려를 적용하지 못했습니다",
          };
        }
        return {
          ok: true,
          markdown: edit.markdown,
          message: rejectCommitMessage("discard", id),
        };
      }
      default:
        return { ok: false, message: "허용되지 않은 반려 액션입니다" };
    }
  });
}
