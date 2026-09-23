import { z } from "zod";
import {
  CAPTION_STYLE_OPTIONS,
  type CaptionStyle,
} from "~/fsd/shared/config/constants";

// User.defaultCaptionStyleEnglish·Korean / UploadedFile.captionStyle JSON의
// 공용 검증기. 세 컬럼이 같은 CaptionStyle 모양을 공유하므로 하위 레이어(shared)에 둬
// features/settings·features/upload·features/clip-review가 딥 임포트해도 peer 위반이 없다
// (shared는 W2/W6 면제). 캡션 계약의 원천 타입은 shared/config의 CaptionStyle 하나이며,
// satisfies가 스키마-타입 드리프트를 막는다. 허용 범위는 백엔드 resolve_caption_style과 동기
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
