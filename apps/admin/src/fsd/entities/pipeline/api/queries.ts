import "server-only";

import { env } from "~/env";
import {
  BOARD_BRANCH,
  BOARD_CONTENTS_URL,
  BOARD_RAW_URL,
} from "../config/github";
import { parseBoard, type BoardSection } from "../model/board";

// 투영(읽기)은 매 요청 dev HEAD를 다시 읽는다. no-store는 Next 데이터 캐시만 끈다 —
// raw CDN 엣지 캐시(max-age=300)는 그와 무관하게 낡은 본문을 줘서 도장 직후 최대 5분
// 지연이 생긴다(FEAT-22). 토큰이 있으면 contents API로 dev HEAD를 직접 읽어(쓰기 경로
// commit-gate-transition.ts:45와 동일 방식) 잔상을 없앤다. 토큰이 없으면 미인증 contents
// API(60/h)가 Vercel 공유 IP에서 남의 트래픽에 막힐 수 있어 raw CDN으로 폴백한다 —
// 폴백 시엔 다시 max-age=300 잔상이 생기지만, 프로덕션은 토큰이 설정돼 있어(env.js:37-45,
// 게이트 커밋에 필수) 이 폴백은 토큰 없는 배포(dev/preview)에서만 탄다.
export async function getPipelineBoard(): Promise<BoardSection[]> {
  const token = env.GITHUB_PIPELINE_TOKEN;

  if (token === undefined) {
    const res = await fetch(BOARD_RAW_URL, { cache: "no-store" });
    if (!res.ok) {
      throw new Error(`Failed to fetch PROJECT_BOARD.md: ${res.status}`);
    }
    return parseBoard(await res.text());
  }

  const res = await fetch(`${BOARD_CONTENTS_URL}?ref=${BOARD_BRANCH}`, {
    cache: "no-store",
    headers: {
      Accept: "application/vnd.github+json",
      Authorization: `Bearer ${token}`,
    },
  });
  if (!res.ok) {
    throw new Error(`Failed to fetch PROJECT_BOARD.md: ${res.status}`);
  }
  const meta = (await res.json()) as { content?: string };
  if (typeof meta.content !== "string") {
    throw new Error("Failed to read PROJECT_BOARD.md content");
  }
  const markdown = Buffer.from(meta.content, "base64").toString("utf-8");
  return parseBoard(markdown);
}
