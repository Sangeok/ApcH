"use client";

import type { Clip } from "generated/prisma";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { useClipPlayUrl } from "~/fsd/shared/hooks/useClipPlayUrl";
import { copyToClipboard } from "~/fsd/widgets/clip-display/lib/copy-to-clipboard";
import { parseJsonArray } from "~/fsd/shared/lib/utils";
import { ClipActions } from "./ClipActions";
import { ClipVideoPlayer } from "./ClipVideoPlayer";
import { ScriptModal } from "./ScriptModal";
import { YoutubeMetadataModal } from "./YoutubeMetadataModal";
import type { ActionResult } from "~/fsd/shared/api/result";

interface ClipCardProps {
  clip: Clip;
  onDelete: (clipId: string) => Promise<ActionResult<void>>;
  onDeleteSuccess: (clipId: string) => void;
}

export default function ClipCard({ clip, onDelete, onDeleteSuccess }: ClipCardProps) {
  const { playUrl, isLoading } = useClipPlayUrl(clip.id);
  const [isScriptOpen, setIsScriptOpen] = useState(false);
  const [isMetadataOpen, setIsMetadataOpen] = useState(false);

  const scriptText = clip.scriptText?.trim() ?? "";
  const hasScript = scriptText.length > 0;

  const youtubeHashtags = useMemo(
    () => parseJsonArray<string>(clip.youtubeHashtags),
    [clip.youtubeHashtags],
  );

  const hasMetadata = Boolean(
    clip.youtubeTitle ?? clip.youtubeDescription ?? youtubeHashtags.length > 0,
  );

  const handleCopyScript = async () => {
    if (!hasScript) {
      toast.error("Script is not available yet.");
      return;
    }
    await copyToClipboard(scriptText, "script");
  };

  return (
    <div className="flex max-w-52 flex-col gap-2">
      <ClipVideoPlayer src={playUrl} isLoading={isLoading} />
      <ClipActions
        clip={clip}
        playUrl={playUrl}
        isLoading={isLoading}
        hasScript={hasScript}
        hasMetadata={hasMetadata}
        onOpenScript={() => setIsScriptOpen(true)}
        onOpenMetadata={() => setIsMetadataOpen(true)}
        onCopyScript={handleCopyScript}
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
