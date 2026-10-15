import type {
  CaptionStyle,
  CaptionStyleDefaults,
} from "~/fsd/shared/config/constants";

export interface VideoStyleSnapshot {
  paddingPercent: number;
  captionStyles: CaptionStyleDefaults;
}

// CaptionStyle의 전 필드. 하나라도 빠지면 그 필드만 바꾼 편집이 미저장으로 안 잡혀
// 저장 버튼이 켜지지 않는다. Record<keyof CaptionStyle, true>라 필드가 늘거나 빠지면
// tsc가 깨진다 — 배열에 satisfies만 걸면 빠진 키를 못 잡는다(marginV가 FEAT-61·62에서 실제로 늘었다).
const CAPTION_STYLE_FIELDS: Record<keyof CaptionStyle, true> = {
  position: true,
  fontSize: true,
  color: true,
  maxWordsPerLine: true,
  outlineColor: true,
  outlineWidth: true,
  uppercase: true,
  marginV: true,
};
const CAPTION_STYLE_KEYS = Object.keys(
  CAPTION_STYLE_FIELDS,
) as (keyof CaptionStyle)[];

// null(=언어 기본값)과 객체는 DB에 다르게 쓰이므로 서로 다르다.
// 둘 다 객체면 필드별로 비교하되 undefined와 null을 같게 본다
// — 옛 저장값에는 marginV 키가 없다(런타임 undefined). 그 위에서 Position 버튼을
//   누르면 편집기가 marginV: null을 실어 보내므로(CaptionStyleEditor emit), 보이는 것이
//   그대로여도 거짓 미저장이 되는 것을 막는다.
function captionStyleEquals(
  a: CaptionStyle | null,
  b: CaptionStyle | null,
): boolean {
  if (a === null || b === null) return a === b;
  return CAPTION_STYLE_KEYS.every((key) => (a[key] ?? null) === (b[key] ?? null));
}

export function hasUnsavedVideoStyle(
  saved: VideoStyleSnapshot,
  current: VideoStyleSnapshot,
): boolean {
  return (
    saved.paddingPercent !== current.paddingPercent ||
    !captionStyleEquals(
      saved.captionStyles.english,
      current.captionStyles.english,
    ) ||
    !captionStyleEquals(saved.captionStyles.korean, current.captionStyles.korean)
  );
}
