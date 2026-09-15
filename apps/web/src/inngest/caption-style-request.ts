import type { CaptionStyle } from "~/fsd/shared/config/constants";

/**
 * auto Modal 요청의 요청 단위 caption_style을 정한다.
 * - render 모드: undefined — 백엔드는 render에서 요청 단위 스타일을 무시하고
 *   moments[].caption_style만 쓴다(FEAT-41 소유자 결정 2026-09-14). 키를 아예 생략한다.
 * - auto 모드: 업로드 스냅샷. 스냅샷이 null이면 undefined(키 생략) → 백엔드 언어 기본값.
 */
export function autoRequestCaptionStyle(
  isRenderMode: boolean,
  snapshot: CaptionStyle | null,
): CaptionStyle | undefined {
  if (isRenderMode) return undefined;
  return snapshot ?? undefined;
}
