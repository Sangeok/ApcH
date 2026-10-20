import { CAPTION_RENDER, CAPTION_STYLE_OPTIONS } from "~/fsd/shared/config/constants";
import { getPreviewVerticalInset } from "./caption-preview";

// 정수·범위(0~960) 클램프. 비유한값은 MIN으로.
export function clampMarginV(value: number): number {
  const { MIN, MAX } = CAPTION_STYLE_OPTIONS.MARGIN_V_RANGE;
  if (!Number.isFinite(value)) return MIN;
  return Math.min(MAX, Math.max(MIN, Math.round(value)));
}

// 블록 중심 y(미리보기 px) → 저장할 {position, marginV}.
// 중심이 위쪽 절반이면 top(위 가장자리~블록 위), 아래쪽 절반이면 bottom(아래 가장자리~블록 아래).
// 기준 가장자리에서의 거리를 ASS px로 환산·클램프한다. 미리보기 1px ≈ PLAY_RES_Y/previewHeight ASS px.
export function resolveVerticalDrop(
  centerPx: number,
  blockHeightPx: number,
  previewHeightPx: number,
): { position: "top" | "bottom"; marginV: number } {
  const assPerPx = CAPTION_RENDER.PLAY_RES_Y / previewHeightPx; // 1920/320 = 6
  if (centerPx < previewHeightPx / 2) {
    const topEdgePx = centerPx - blockHeightPx / 2;
    return { position: "top", marginV: clampMarginV(topEdgePx * assPerPx) };
  }
  const bottomEdgePx = previewHeightPx - (centerPx + blockHeightPx / 2);
  return { position: "bottom", marginV: clampMarginV(bottomEdgePx * assPerPx) };
}

// 저장 위치 → 블록 중심 y(미리보기 px). 드래그 잡기·키보드 넛지의 역함수.
// 프리셋 폴백은 getPreviewVerticalInset이 소유한다 — 여기서 다시 쓰지 않는다. middle은 미리보기 중앙.
export function verticalDropToCenterPx(
  position: "top" | "middle" | "bottom",
  marginV: number | null,
  blockHeightPx: number,
  previewHeightPx: number,
): number {
  const inset = getPreviewVerticalInset(position, marginV, previewHeightPx);
  if (inset.top !== null) return inset.top + blockHeightPx / 2;
  if (inset.bottom !== null) return previewHeightPx - inset.bottom - blockHeightPx / 2;
  return previewHeightPx / 2; // middle
}

// 슬라이더 값(aria-valuenow): 한 줄 블록(libass 줄 상자 = assFontSize) 중심이 아래 가장자리에서 몇 %인가.
// 0 = 맨 아래, 100 = 맨 위. 위로 갈수록 커져 ArrowUp(위로 이동)과 방향이 같고, 기준 가장자리가 바뀌어도 연속이다.
export function captionHeightPercent(
  position: "top" | "middle" | "bottom",
  marginV: number | null,
  assFontSize: number,
): number {
  const H = CAPTION_RENDER.PLAY_RES_Y;
  const centerAss = verticalDropToCenterPx(position, marginV, assFontSize, H);
  return Math.round(100 * (1 - centerAss / H));
}
