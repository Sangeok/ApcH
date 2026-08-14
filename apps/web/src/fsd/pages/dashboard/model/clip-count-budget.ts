import {
  CLIP_COUNT_OPTIONS,
  CLIP_DURATION_LIMITS,
} from "~/fsd/shared/config/constants";

/** 선택 가능한 최대 옵션. CLIP_COUNT_OPTIONS가 1..4이므로 현재는 4. */
const MAX_CLIP_COUNT_OPTION =
  CLIP_COUNT_OPTIONS[CLIP_COUNT_OPTIONS.length - 1]!.value;

/**
 * 소스 재생 길이(초)로 구조적으로 확보 가능한 최대 클립 개수를 계산한다.
 *
 * - 클립은 최소 CLIP_DURATION_LIMITS.MIN_SECONDS(30초)이고 비겹침이므로,
 *   길이 D 소스에 들어갈 수 있는 최소 길이 클립 수의 상한은 floor(D / MIN_SECONDS)다.
 * - 옵션 최댓값(4)으로 클램프한다. 10분 소스의 구조적 상한은 20이지만 옵션은 4까지뿐이다.
 * - 길이 미상(null·비유한·0 이하)이면 가드하지 않고 옵션 최댓값을 그대로 허용한다.
 * - MIN_SECONDS 미만인 소스는 0을 반환한다(클립 한 개도 불가능). 이 값을 1로
 *   끌어올리지 않는 이유: 사실을 감추면 UI가 만들 수 없는 개수를 허용하게 된다.
 *
 * 서버는 duration을 저장·검사하지 않으므로(schemas.ts:19-22) 이 규칙에 대응하는
 * 서버 가드가 없다 — 동기화해야 할 상대가 없어 shared/config가 아니라 이 슬라이스에 둔다.
 */
export function getMaxFeasibleClipCount(durationSeconds: number | null): number {
  if (
    durationSeconds === null ||
    !Number.isFinite(durationSeconds) ||
    durationSeconds <= 0
  ) {
    return MAX_CLIP_COUNT_OPTION;
  }

  const structuralMax = Math.floor(
    durationSeconds / CLIP_DURATION_LIMITS.MIN_SECONDS,
  );

  return Math.min(MAX_CLIP_COUNT_OPTION, structuralMax);
}
