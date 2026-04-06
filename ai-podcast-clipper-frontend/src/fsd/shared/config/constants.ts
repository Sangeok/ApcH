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
