import {
  CAPTION_STYLE_OPTIONS,
  type CaptionStyle,
} from "~/fsd/shared/config/constants";

export interface EffectiveCaptionStyle {
  position: CaptionStyle["position"];
  fontSize: number;
  color: string;
  maxWordsPerLine: number;
  outlineColor: string;
  outlineWidth: number;
  uppercase: boolean;
}

// 저장값(null 포함) 위에 언어별 기본값을 얹은 "유효 스타일".
// null 필드 = 백엔드 언어별 기본값. CaptionStyleEditor와 업로드 폼 썸네일이 공유한다.
export function resolveEffectiveCaptionStyle(
  style: CaptionStyle | null,
  language: string,
): EffectiveCaptionStyle {
  const isKorean = language === "Korean";
  return {
    position: style?.position ?? CAPTION_STYLE_OPTIONS.DEFAULT_POSITION,
    fontSize:
      style?.fontSize ??
      (isKorean
        ? CAPTION_STYLE_OPTIONS.DEFAULT_FONT_SIZE.Korean
        : CAPTION_STYLE_OPTIONS.DEFAULT_FONT_SIZE.English),
    color: style?.color ?? CAPTION_STYLE_OPTIONS.DEFAULT_COLOR,
    maxWordsPerLine:
      style?.maxWordsPerLine ??
      (isKorean
        ? CAPTION_STYLE_OPTIONS.DEFAULT_MAX_WORDS.Korean
        : CAPTION_STYLE_OPTIONS.DEFAULT_MAX_WORDS.English),
    outlineColor:
      style?.outlineColor ?? CAPTION_STYLE_OPTIONS.DEFAULT_OUTLINE_COLOR,
    outlineWidth:
      style?.outlineWidth ??
      (isKorean
        ? CAPTION_STYLE_OPTIONS.DEFAULT_OUTLINE_WIDTH.Korean
        : CAPTION_STYLE_OPTIONS.DEFAULT_OUTLINE_WIDTH.English),
    uppercase: style?.uppercase ?? false,
  };
}
