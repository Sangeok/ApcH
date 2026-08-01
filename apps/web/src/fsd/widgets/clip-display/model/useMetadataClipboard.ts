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

  useEffect(() => {
    if (copiedField === null) return;
    const timer = setTimeout(() => setCopiedField(null), COPY_FEEDBACK_DELAY_MS);
    return () => clearTimeout(timer);
  }, [copiedField]);

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
