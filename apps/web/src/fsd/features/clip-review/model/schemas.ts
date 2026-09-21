import { z } from "zod";
import {
  CLIP_DURATION_LIMITS,
  isClipDurationWithinLimits,
} from "~/fsd/shared/config/constants";
import { captionStyleSchema } from "~/fsd/shared/config/caption-style-schema";

// 같은 CaptionStyle 모양을 features/settings·features/upload도 검증하므로 shared로 이관했다
// (shared/config/caption-style-schema.ts). 검토 편집 스키마는 이 슬라이스가 계속 소유한다.
// 배럴(features/clip-review/index.ts)과 기존 딥 임포트 소비자를 위해 재수출을 유지한다.
export { captionStyleSchema };

export const updateClipDraftSchema = z
  .object({
    clipDraftId: z.string().cuid(),
    startSeconds: z.number().min(0),
    endSeconds: z.number().positive(),
    selected: z.boolean(),
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
