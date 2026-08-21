"use client";

import type { Clip } from "@repo/db";
import { useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { getClipPlayUrl } from "~/fsd/features/clip/api";
import { trackAnalyticsEvent } from "~/fsd/shared/analytics";
import { usePlayUrl } from "~/fsd/shared/lib/use-play-url";
import { copyToClipboard } from "~/fsd/widgets/clip-display/lib/copy-to-clipboard";
import {
  clipTypeLabel,
  hasClipRationale,
} from "~/fsd/widgets/clip-display/model/clip-rationale";
import { parseJsonArray } from "~/fsd/shared/lib/utils";
import { ClipActions } from "./ClipActions";
import { ClipVideoPlayer } from "./ClipVideoPlayer";
import { ScriptModal } from "./ScriptModal";
import { YoutubeMetadataModal } from "./YoutubeMetadataModal";
import type { ActionResult } from "~/fsd/shared/api/result";

interface ClipCardProps {
  clip: Clip;
  allowDelete: boolean;
  onDelete: (clipId: string) => Promise<ActionResult<void>>;
  onDeleteSuccess: (clipId: string) => void;
}

export default function ClipCard({
  clip,
  allowDelete,
  onDelete,
  onDeleteSuccess,
}: ClipCardProps) {
  const { playUrl, isLoading, error } = usePlayUrl(clip.id, getClipPlayUrl);
  const [isScriptOpen, setIsScriptOpen] = useState(false);
  const [isMetadataOpen, setIsMetadataOpen] = useState(false);
  const trackedPlayRef = useRef(false);

  const scriptText = clip.scriptText?.trim() ?? "";
  const hasScript = scriptText.length > 0;

  const youtubeHashtags = useMemo(
    () => parseJsonArray<string>(clip.youtubeHashtags),
    [clip.youtubeHashtags],
  );

  const hasMetadata = Boolean(
    clip.youtubeTitle ?? clip.youtubeDescription ?? youtubeHashtags.length > 0,
  );

  const typeLabel = clipTypeLabel(clip.clipType);
  const hook = clip.hook?.trim() ?? "";
  const payoff = clip.payoff?.trim() ?? "";
  const showRationale = hasClipRationale(clip);

  const handleCopyScript = async () => {
    if (!hasScript) {
      toast.error("Script is not available yet.");
      return;
    }
    const result = await copyToClipboard(scriptText);
    if (result.success) {
      toast.success("Copied script.");
    } else {
      toast.error(`Failed to copy script: ${result.error}`);
    }
  };

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
      <ClipVideoPlayer
        src={playUrl}
        isLoading={isLoading}
        error={error}
        onPlay={handlePlay}
      />
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
        playUrl={playUrl}
        isLoading={isLoading}
        hasScript={hasScript}
        hasMetadata={hasMetadata}
        onOpenScript={() => setIsScriptOpen(true)}
        onOpenMetadata={() => setIsMetadataOpen(true)}
        onCopyScript={handleCopyScript}
        allowDelete={allowDelete}
        onDelete={onDelete}
        onDeleteSuccess={onDeleteSuccess}
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
