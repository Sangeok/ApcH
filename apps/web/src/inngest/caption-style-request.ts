import type { CaptionStyle } from "~/fsd/shared/config/constants";

/**
 * Modal 요청의 요청 단위 caption_style을 정한다 — auto·render 공통(FEAT-52).
 * - 업로드 스냅샷이 있으면 그 값. 클립별 스타일은 폐지됐고, 백엔드는 클립별
 *   caption_style이 없으면 이 요청 단위 값으로 폴백한다(FEAT-51 render 게이트 제거).
 * - null이면 undefined(JSON.stringify가 키를 생략) → 백엔드 언어 기본값.
 */
export function requestCaptionStyle(
  snapshot: CaptionStyle | null,
): CaptionStyle | undefined {
  return snapshot ?? undefined;
}
