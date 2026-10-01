import { CLIP_COUNT_OPTIONS } from "~/fsd/shared/config/constants";
import { getMaxFeasibleClipCount } from "./clip-count-budget";

const MAX_CLIP_COUNT_OPTION =
  CLIP_COUNT_OPTIONS[CLIP_COUNT_OPTIONS.length - 1]!.value;

// 길이 미상은 getMaxFeasibleClipCount가 옵션 최댓값으로 돌려주므로 여기서 따로 가드하지 않는다.
export function clipCountNotice(durationSeconds: number | null): string | null {
  const max = getMaxFeasibleClipCount(durationSeconds);

  // 0 = 30초 미만. 그 안내는 파일 줄에 destructive로 뜬다.
  if (max === 0) return null;
  if (max < MAX_CLIP_COUNT_OPTION) {
    return `This video fits up to ${max} ${max === 1 ? "clip" : "clips"}. The AI may return fewer.`;
  }
  return "The AI may return fewer.";
}
