import type { ClipRange } from "./use-clip-draft-review";

export type PreviewKind = "start" | "full" | "end";

// 경계를 짧게 듣기 위한 프리뷰 창. pre/post-roll이 요점이다 — start부터 재생하면
// 무엇을 잘랐든 깔끔하게 들려 잘림을 판정할 수 없다. 경계 앞 1.5초(잘린 앞말)와
// 경계 뒤 3.5초(클립 내용)를 함께 들려 "말 중간이 잘렸는가"를 귀로 판정하게 한다.
const PRE_ROLL_SECONDS = 1.5;
const POST_ROLL_SECONDS = 3.5;

// handlePreview가 이미 임의 구간 재생기이므로(ui/index.tsx:204) 카드는 구간만 계산해 넘긴다.
// currentTime 음수는 브라우저가 0으로 클램프하지만, 순수 계산에서도 0으로 막아 판정을 코드에 남긴다.
export function getPreviewRange(
  kind: PreviewKind,
  startSeconds: number,
  endSeconds: number,
): ClipRange {
  if (kind === "start") {
    return {
      startSeconds: Math.max(0, startSeconds - PRE_ROLL_SECONDS),
      endSeconds: startSeconds + POST_ROLL_SECONDS,
    };
  }
  if (kind === "end") {
    return {
      startSeconds: Math.max(0, endSeconds - POST_ROLL_SECONDS),
      endSeconds: endSeconds + PRE_ROLL_SECONDS,
    };
  }
  return { startSeconds, endSeconds };
}
