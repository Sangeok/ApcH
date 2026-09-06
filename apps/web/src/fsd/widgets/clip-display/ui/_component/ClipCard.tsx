"use client";

import type { Clip } from "@repo/db";
import { AlertTriangle } from "lucide-react";
import { useMemo, useRef, useState } from "react";
import { getClipPlayUrl } from "~/fsd/features/clip";
import { trackAnalyticsEvent } from "~/fsd/shared/analytics";
import { usePlayUrl } from "~/fsd/shared/lib/use-play-url";
import { useScriptClipboard } from "../../model/use-script-clipboard";
import {
  clipTypeLabel,
  hasClipRationale,
} from "../../model/clip-rationale";
import { subtitleFallbackNotice } from "../../model/subtitle-status";
import { isNonEmptyString, parseJsonArray } from "~/fsd/shared/lib/utils";
import { ClipActions } from "./ClipActions";
import { ClipVideoPlayer } from "./ClipVideoPlayer";
import { ScriptModal } from "./ScriptModal";
import { YoutubeMetadataModal } from "./YoutubeMetadataModal";

interface ClipCardProps {
  clip: Clip;
  onOptimisticRemove: (clipId: string) => void;
}

export default function ClipCard({ clip, onOptimisticRemove }: ClipCardProps) {
  const playUrlState = usePlayUrl(clip.id, getClipPlayUrl);
  const [isScriptOpen, setIsScriptOpen] = useState(false);
  const [isMetadataOpen, setIsMetadataOpen] = useState(false);
  const trackedPlayRef = useRef(false);

  const { hasScript, copyScript } = useScriptClipboard(clip);

  const youtubeHashtags = useMemo(
    () => parseJsonArray(clip.youtubeHashtags, isNonEmptyString),
    [clip.youtubeHashtags],
  );

  const hasMetadata =
    Boolean(clip.youtubeTitle) ||
    Boolean(clip.youtubeDescription) ||
    youtubeHashtags.length > 0;

  const typeLabel = clipTypeLabel(clip.clipType);
  const hook = clip.hook?.trim() ?? "";
  const payoff = clip.payoff?.trim() ?? "";
  const showRationale = hasClipRationale(clip);
  const fallbackNotice = subtitleFallbackNotice(clip.subtitleStatus);

  const handlePlay = () => {
    if (trackedPlayRef.current) {
      return;
    }

    trackedPlayRef.current = true;
    void trackAnalyticsEvent(
      "clip_viewed",
      {
        clipId: clip.id,
        uploadedFileId: clip.uploadedFileId ?? undefined,
      },
      {
        path: "/dashboard/uploads/[uploadedFileId]",
        dedupeKey: `clip_viewed:${clip.id}`,
      },
    );
  };

  return (
    <div className="flex max-w-52 flex-col gap-2">
      <ClipVideoPlayer state={playUrlState} onPlay={handlePlay} />
      {fallbackNotice && (
        <p className="flex items-start gap-1 text-xs leading-snug text-amber-600 dark:text-amber-500">
          <AlertTriangle className="mt-0.5 size-3 shrink-0" aria-hidden="true" />
          <span>{fallbackNotice}</span>
        </p>
      )}
      {showRationale && (
        <div className="flex flex-col gap-0.5">
          {typeLabel && (
            <span className="text-muted-foreground text-xs">{typeLabel}</span>
          )}
          {hook && (
            <span className="line-clamp-2 text-sm leading-snug font-semibold">
              {hook}
            </span>
          )}
          {payoff && (
            <span className="text-muted-foreground line-clamp-2 text-xs leading-snug">
              {payoff}
            </span>
          )}
        </div>
      )}
      <ClipActions
        clip={clip}
        playUrlState={playUrlState}
        hasScript={hasScript}
        hasMetadata={hasMetadata}
        onOpenScript={() => setIsScriptOpen(true)}
        onOpenMetadata={() => setIsMetadataOpen(true)}
        onCopyScript={copyScript}
        onOptimisticRemove={onOptimisticRemove}
      />
      <ScriptModal
        clip={clip}
        isOpen={isScriptOpen}
        onClose={() => setIsScriptOpen(false)}
      />
      <YoutubeMetadataModal
        clip={clip}
        isOpen={isMetadataOpen}
        onClose={() => setIsMetadataOpen(false)}
      />
    </div>
  );
}
