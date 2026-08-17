import "server-only";

import { BOARD_RAW_URL } from "../config/github";
import { parseBoard, type BoardSection } from "../model/board";

export async function getPipelineBoard(): Promise<BoardSection[]> {
  // no-store: 투영은 매 요청 dev 브랜치 보드를 다시 읽는다(빌드 시점 고정 금지).
  const res = await fetch(BOARD_RAW_URL, { cache: "no-store" });
  if (!res.ok) {
    throw new Error(`Failed to fetch PROJECT_BOARD.md: ${res.status}`);
  }
  return parseBoard(await res.text());
}
