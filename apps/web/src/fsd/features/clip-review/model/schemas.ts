import { z } from "zod";
import {
  CAPTION_STYLE_OPTIONS,
  CLIP_DURATION_LIMITS,
  isClipDurationWithinLimits,
  type CaptionStyle,
} from "~/fsd/shared/config/constants";

// ClipDraft.captionStyle JSON의 유일한 검증 지점. 캡션 계약의 원천 타입은
// shared/config의 CaptionStyle 하나이며, satisfies가 스키마-타입 드리프트를 막는다.
// 허용 범위는 백엔드 resolve_caption_style과 동기
// (main.py: fontSize 60-200, maxWordsPerLine 1-8, outlineWidth 0-6).
export const captionStyleSchema = z.object({
  position: z.enum(CAPTION_STYLE_OPTIONS.POSITIONS),
  fontSize: z
    .number()
    .int()
    .min(CAPTION_STYLE_OPTIONS.FONT_SIZE_RANGE.MIN)
    .max(CAPTION_STYLE_OPTIONS.FONT_SIZE_RANGE.MAX)
    .nullable(),
  color: z
    .string()
    .regex(/^#[0-9a-fA-F]{6}$/, "Color must be #RRGGBB")
    .nullable(),
  maxWordsPerLine: z
    .number()
    .int()
    .min(CAPTION_STYLE_OPTIONS.MAX_WORDS_RANGE.MIN)
    .max(CAPTION_STYLE_OPTIONS.MAX_WORDS_RANGE.MAX)
    .nullable(),
  outlineColor: z
    .string()
    .regex(/^#[0-9a-fA-F]{6}$/, "Color must be #RRGGBB")
    .nullable(),
  outlineWidth: z
    .number()
    .int()
    .min(CAPTION_STYLE_OPTIONS.OUTLINE_WIDTH_RANGE.MIN)
    .max(CAPTION_STYLE_OPTIONS.OUTLINE_WIDTH_RANGE.MAX)
    .nullable(),
  uppercase: z.boolean().nullable(),
}) satisfies z.ZodType<CaptionStyle>;

export type CaptionStyleInput = CaptionStyle;

export const updateClipDraftSchema = z
  .object({
    clipDraftId: z.string().cuid(),
    startSeconds: z.number().min(0),
    endSeconds: z.number().positive(),
    selected: z.boolean(),
    // undefined = 스타일 변경 없음, null = 기본 스타일로 리셋
    captionStyle: captionStyleSchema.nullable().optional(),
  })
  .refine(
    (value) => isClipDurationWithinLimits(value.startSeconds, value.endSeconds),
    {
      message: `Clip length must be between ${CLIP_DURATION_LIMITS.MIN_SECONDS}s and ${CLIP_DURATION_LIMITS.MAX_SECONDS}s`,
    },
  );

export const addCustomClipDraftSchema = z
  .object({
    uploadedFileId: z.string().cuid(),
    startSeconds: z.number().min(0),
    endSeconds: z.number().positive(),
  })
  .refine(
    (value) => isClipDurationWithinLimits(value.startSeconds, value.endSeconds),
    {
      message: `Clip length must be between ${CLIP_DURATION_LIMITS.MIN_SECONDS}s and ${CLIP_DURATION_LIMITS.MAX_SECONDS}s`,
    },
  );
