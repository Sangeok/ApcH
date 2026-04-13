"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import type { Clip } from "generated/prisma";
import { parseJsonArray } from "~/fsd/shared/lib/utils";
import { copyToClipboard } from "~/fsd/widgets/clip-display/lib/copy-to-clipboard";
import { formatAllMetadataForCopy } from "~/fsd/widgets/clip-display/lib/format-metadata";

export type CopiedField = "Title" | "Description" | "Hashtags" | "Tag" | "All metadata";

const COPY_FEEDBACK_DELAY_MS = 2000;

export function useMetadataClipboard(clip: Clip) {
  const [copiedField, setCopiedField] = useState<CopiedField | null>(null);

  const hashtags = useMemo(
    () => parseJsonArray<string>(clip.youtubeHashtags),
    [clip.youtubeHashtags],
  );

  // copiedField가 설정되면 COPY_FEEDBACK_DELAY_MS 후 자동 초기화.
  // useEffect cleanup으로 언마운트 시 타이머 누수를 방지한다.
  useEffect(() => {
    if (copiedField === null) return;
    const timer = setTimeout(() => setCopiedField(null), COPY_FEEDBACK_DELAY_MS);
    return () => clearTimeout(timer);
  }, [copiedField]);

  // React Compiler 미활성화 환경에서 함수 참조를 안정화한다.
  const handleCopyMetadata = useCallback(
    async (field: CopiedField, value: string) => {
      if (!value) {
        toast.error(`${field} is not available.`);
        return;
      }
      const result = await copyToClipboard(value);
      if (result.success) {
        setCopiedField(field);
      } else {
        toast.error(`Failed to copy ${field.toLowerCase()}: ${result.error}`);
      }
    },
    [],
  );

  const handleCopyAllMetadata = useCallback(async () => {
    const allText = formatAllMetadataForCopy(clip, hashtags);
    await handleCopyMetadata("All metadata", allText);
  }, [clip, hashtags, handleCopyMetadata]);

  return { copiedField, hashtags, handleCopyMetadata, handleCopyAllMetadata };
}
