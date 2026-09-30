export const VIDEO_PADDING_PERCENT_RANGE = {
  MIN: 0,
  MAX: 25,
  STEP: 1,
  DEFAULT: 0,
} as const;

export const VIDEO_FRAME_SIZE = { WIDTH: 1080, HEIGHT: 1920 } as const;

export function parseVideoPaddingPercent(value: unknown): number | null {
  return typeof value === "number" &&
    Number.isInteger(value) &&
    value >= VIDEO_PADDING_PERCENT_RANGE.MIN &&
    value <= VIDEO_PADDING_PERCENT_RANGE.MAX
    ? value
    : null;
}

export function resolveVideoPaddingPercent(value: unknown): number {
  return parseVideoPaddingPercent(value) ?? VIDEO_PADDING_PERCENT_RANGE.DEFAULT;
}

export function getVideoFrameLayout(value: unknown) {
  const percent = resolveVideoPaddingPercent(value);
  const paddingPx = Math.floor((VIDEO_FRAME_SIZE.HEIGHT * percent + 50) / 100);
  return {
    width: VIDEO_FRAME_SIZE.WIDTH,
    height: VIDEO_FRAME_SIZE.HEIGHT,
    paddingPx,
    contentHeight: VIDEO_FRAME_SIZE.HEIGHT - 2 * paddingPx,
  };
}

export function videoFramingSummary(value: unknown): string | null {
  const percent = resolveVideoPaddingPercent(value);
  return percent === 0 ? null : `${percent}% top & bottom`;
}
