import { z } from "zod";
import {
  CLIP_COUNT_OPTIONS,
  SUPPORTED_LANGUAGES,
} from "~/fsd/shared/config/constants";

const SUPPORTED_CLIP_COUNTS = CLIP_COUNT_OPTIONS.map((option) => option.value);
const SUPPORTED_LANGUAGE_VALUES = SUPPORTED_LANGUAGES.map((option) => option.value);
const SUPPORTED_CLIP_COUNT_SET = new Set<number>(SUPPORTED_CLIP_COUNTS);
const SUPPORTED_LANGUAGE_SET = new Set<string>(SUPPORTED_LANGUAGE_VALUES);

export const prepareUploadSchema = z.object({
  fileName: z.string().min(1, "File name is required"),
  contentType: z.string().min(1, "Content type is required"),
  language: z.string().refine(
    (value) => SUPPORTED_LANGUAGE_SET.has(value),
    "Unsupported language",
  ),
  clipCount: z.number().int().refine(
    (value) => SUPPORTED_CLIP_COUNT_SET.has(value),
    "Unsupported clip count",
  ),
  reviewBeforeGenerate: z.boolean(),
});

export const scheduleUploadedFileProcessingSchema = z.object({
  uploadedFileId: z.string().cuid(),
});

export function isSupportedClipCount(clipCount: number): boolean {
  return SUPPORTED_CLIP_COUNT_SET.has(clipCount);
}
