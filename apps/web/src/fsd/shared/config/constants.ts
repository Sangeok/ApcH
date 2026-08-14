/**
 * Upload configuration constants
 */
export const UPLOAD_CONFIG = {
  MAX_FILE_SIZE: 900 * 1024 * 1024, // 900MB
  ACCEPTED_TYPES: { "video/mp4": [".mp4"] },
} as const;

/**
 * Supported languages for subtitle/transcription
 */
export const SUPPORTED_LANGUAGES = [
  { value: "English", label: "English" },
  { value: "Korean", label: "한국어" },
] as const;

/**
 * Clip count options for video processing
 */
export const CLIP_COUNT_OPTIONS = [
  { value: 1, label: "1 clip" },
  { value: 2, label: "2 clips" },
  { value: 3, label: "3 clips" },
  { value: 4, label: "4 clips" },
] as const;

export const DEFAULT_LANGUAGE = SUPPORTED_LANGUAGES[0].value;
export const DEFAULT_CLIP_COUNT = CLIP_COUNT_OPTIONS[2].value;

export const YOUTUBE_TITLE_MAX_LENGTH = 100;
export const YOUTUBE_DESCRIPTION_MAX_LENGTH = 5000;

/**
 * Clip duration limits. Must stay in sync with
 * apps/backend/main.py MIN_CLIP_DURATION / MAX_CLIP_DURATION.
 */
export const CLIP_DURATION_LIMITS = {
  MIN_SECONDS: 30,
  MAX_SECONDS: 90,
} as const;

/**
 * Caption style editing options. Defaults must stay in sync with the hardcoded
 * values in apps/backend/main.py:
 * create_subtitles_with_ffmpeg (en: fontsize 122, max_word 5, outline 1.1) /
 * create_korean_subtitles_with_ffmpeg (kr: fontsize 130, max_word 3, outline 1.3),
 * and with resolve_caption_style's validation ranges.
 */
export const CAPTION_STYLE_OPTIONS = {
  POSITIONS: ["top", "middle", "bottom"],
  DEFAULT_POSITION: "middle",
  FONT_SIZE_RANGE: { MIN: 60, MAX: 200 },
  DEFAULT_FONT_SIZE: { English: 122, Korean: 130 },
  COLOR_PRESETS: ["#FFFFFF", "#FFE45E", "#7CF3FF", "#111111"],
  DEFAULT_COLOR: "#FFFFFF",
  MAX_WORDS_RANGE: { MIN: 1, MAX: 8 },
  DEFAULT_MAX_WORDS: { English: 5, Korean: 3 },
  OUTLINE_COLOR_PRESETS: ["#000000", "#111111", "#FFFFFF", "#1D4ED8"],
  DEFAULT_OUTLINE_COLOR: "#000000",
  OUTLINE_WIDTH_RANGE: { MIN: 0, MAX: 6 },
  // 백엔드 resolve_caption_style의 default_outline과 동기 (EN 1.1 / KR 1.3).
  // 소수라서 스테퍼는 Math.round 후 증감한다 (CaptionStyleEditor).
  DEFAULT_OUTLINE_WIDTH: { English: 1.1, Korean: 1.3 },
} as const;

// 30~90초 검증의 단일 지점. zod refine과 서버 액션 가드가 모두 이 함수를 사용한다.
export function isClipDurationWithinLimits(
  startSeconds: number,
  endSeconds: number,
): boolean {
  const duration = endSeconds - startSeconds;
  return (
    duration >= CLIP_DURATION_LIMITS.MIN_SECONDS &&
    duration <= CLIP_DURATION_LIMITS.MAX_SECONDS
  );
}

/**
 * 캡션 스타일 계약의 단일 원천(canonical) 타입.
 * 검증 스키마(features/clip-review/model/schemas.ts의 captionStyleSchema),
 * 렌더 이벤트 페이로드(src/inngest/client.ts의 RenderCaptionStyle),
 * 렌더 디스패처의 JSON 캐스팅, 검토 UI가 전부 이 타입 하나를 참조한다.
 * 모든 필드는 required-but-nullable: null = 백엔드가 언어별 기본값으로 해석.
 */
export type CaptionStyle = {
  position: (typeof CAPTION_STYLE_OPTIONS.POSITIONS)[number];
  fontSize: number | null;
  color: string | null;
  maxWordsPerLine: number | null;
  outlineColor: string | null;
  outlineWidth: number | null;
  uppercase: boolean | null;
};

/**
 * 이름 붙인 캡션 룩. 선택하면 스타일 필드를 통째로 덮어쓴다.
 * position은 프리셋 소속이 아니다 — 사용자가 고른 위치는 프리셋을 바꿔도 유지된다
 * (CaptionStyleEditor의 emit이 effective 위에 병합하므로 자동 보존).
 * fontSize/maxWordsPerLine은 null로 두어 언어별 기본값과 싸우지 않게 한다.
 */
export const CAPTION_STYLE_PRESETS = [
  {
    id: "clean-white",
    label: "Clean White",
    style: {
      fontSize: null,
      color: "#FFFFFF",
      maxWordsPerLine: null,
      outlineColor: "#000000",
      outlineWidth: 1,
      uppercase: false,
    },
  },
  {
    id: "bold-yellow",
    label: "Bold Yellow",
    style: {
      fontSize: null,
      color: "#FFE45E",
      maxWordsPerLine: null,
      outlineColor: "#000000",
      outlineWidth: 3,
      uppercase: true,
    },
  },
  {
    id: "outline-punch",
    label: "Outline Punch",
    style: {
      fontSize: null,
      color: "#FFFFFF",
      maxWordsPerLine: null,
      outlineColor: "#000000",
      outlineWidth: 5,
      uppercase: true,
    },
  },
  {
    id: "mint-pop",
    label: "Mint Pop",
    style: {
      fontSize: null,
      color: "#7CF3FF",
      maxWordsPerLine: null,
      outlineColor: "#111111",
      outlineWidth: 2,
      uppercase: false,
    },
  },
] as const satisfies readonly {
  id: string;
  label: string;
  style: Omit<CaptionStyle, "position">;
}[];

export type CaptionStylePresetId = (typeof CAPTION_STYLE_PRESETS)[number]["id"];
