import { z } from "zod";
import {
  SUPPORTED_LANGUAGES,
  CLIP_COUNT_OPTIONS,
} from "~/fsd/shared/config/constants";

/**
 * Schema for processVideo input validation
 */
// Extract min/max clip counts safely
const MIN_CLIP_COUNT = CLIP_COUNT_OPTIONS[0].value;
const MAX_CLIP_COUNT = CLIP_COUNT_OPTIONS[CLIP_COUNT_OPTIONS.length - 1]!.value;

export const processVideoSchema = z.object({
  uploadedFileId: z.string().cuid(),
  language: z.enum(
    SUPPORTED_LANGUAGES.map((l) => l.value) as [string, ...string[]],
  ),
  clipCount: z.number().int().min(MIN_CLIP_COUNT).max(MAX_CLIP_COUNT),
});

export type ProcessVideoInput = z.infer<typeof processVideoSchema>;
