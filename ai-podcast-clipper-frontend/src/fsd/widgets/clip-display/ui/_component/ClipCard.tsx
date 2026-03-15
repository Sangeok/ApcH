"use client";

import type { Clip } from "generated/prisma";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { useClipPlayUrl } from "~/fsd/shared/hooks/useClipPlayUrl";
import { ClipActions } from "./ClipActions";
import { ClipVideoPlayer } from "./ClipVideoPlayer";
import { ScriptModal } from "./ScriptModal";
import { YoutubeMetadataModal } from "./YoutubeMetadataModal";
import type { ActionResult } from "~/fsd/shared/api/result";

interface ClipCardProps {
  clip: Clip;
  onDelete: (clipId: string) => Promise<ActionResult<void>>;
  onDeleted: (clipId: string) => void;
}

export default function ClipCard({ clip, onDelete, onDeleted }: ClipCardProps) {
  const { playUrl, isLoading } = useClipPlayUrl(clip.id);
  const [isScriptOpen, setIsScriptOpen] = useState<boolean>(false);
  const [isMetadataOpen, setIsMetadataOpen] = useState<boolean>(false);

  const scriptText = clip.scriptText?.trim() ?? "";
  const hasScript = scriptText.length > 0;

  const youtubeHashtags: string[] = useMemo(() => {
    if (!clip.youtubeHashtags) return [];
    try {
      return JSON.parse(clip.youtubeHashtags) as string[];
    } catch {
      return [];
    }
  }, [clip.youtubeHashtags]);

  const hasMetadata = Boolean(
    clip.youtubeTitle ?? clip.youtubeDescription ?? youtubeHashtags.length > 0,
  );

  const handleCopyScript = async () => {
    if (!hasScript) {
      toast.error("Script is not available yet.");
      return;
    }

    try {
      if (!navigator?.clipboard?.writeText) {
        throw new Error("Clipboard API not available");
      }
      await navigator.clipboard.writeText(scriptText);
      toast.success("Copied script.");
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      toast.error("Failed to copy script: " + message);
    }
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
        onDeleted={onDeleted}
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
