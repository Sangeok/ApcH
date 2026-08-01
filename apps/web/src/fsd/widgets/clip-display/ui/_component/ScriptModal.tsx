"use client";

import type { Clip } from "generated/prisma";
import { Copy, X } from "lucide-react";
import { toast } from "sonner";
import { copyToClipboard } from "~/fsd/widgets/clip-display/lib/copy-to-clipboard";
import { Button } from "~/fsd/shared/ui/atoms/button";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "~/fsd/shared/ui/atoms/sheet";

interface ScriptModalProps {
  clip: Clip;
  isOpen: boolean;
  onClose: () => void;
}

export function ScriptModal({ clip, isOpen, onClose }: ScriptModalProps) {
  const scriptText = clip.scriptText?.trim() ?? "";
  const hasScript = scriptText.length > 0;

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

  const formatTimestamp = (seconds: number | null | undefined) => {
    if (seconds === null || seconds === undefined) return null;
    if (!Number.isFinite(seconds)) return null;
    const total = Math.max(0, Math.floor(seconds));
    const m = Math.floor(total / 60);
    const s = total % 60;
    return `${m}:${String(s).padStart(2, "0")}`;
  };

  const startLabel = formatTimestamp(clip.startSeconds);
  const endLabel = formatTimestamp(clip.endSeconds);
  const timecodeLabel =
    startLabel && endLabel ? `${startLabel}–${endLabel}` : null;

  return (
    <Sheet open={isOpen} onOpenChange={(open) => { if (!open) onClose(); }}>
      <SheetContent
        side="right"
        showCloseButton={false}
        overlayClassName="bg-black/50 backdrop-blur-sm"
        className="flex w-full max-w-md flex-col gap-0 p-0"
      >
        <SheetHeader className="flex-row items-start justify-between gap-3 border-b p-4">
          <div className="min-w-0">
            <SheetTitle className="text-base">Script</SheetTitle>
            <p className="text-muted-foreground mt-1 text-xs">
              {timecodeLabel ? `Timecode: ${timecodeLabel}` : "Timecode: -"}
            </p>
          </div>

          <Button asChild variant="ghost" size="icon-sm">
            <button
              type="button"
              onClick={onClose}
              aria-label="Close"
            >
              <X className="h-4 w-4" />
            </button>
          </Button>
        </SheetHeader>

        <div className="flex min-h-0 flex-1 flex-col gap-4 p-4">
          <div className="bg-muted/30 min-h-0 flex-1 overflow-auto rounded-lg border p-3">
            <pre className="text-sm leading-relaxed break-words whitespace-pre-wrap">
              {hasScript ? scriptText : "Script is not available yet."}
            </pre>
          </div>

          <div className="flex items-center justify-end gap-2">
            <Button
              variant="secondary"
              size="sm"
              onClick={handleCopyScript}
              disabled={!hasScript}
            >
              <Copy className="mr-2 h-4 w-4" />
              Copy
            </Button>
            <Button variant="outline" size="sm" onClick={onClose}>
              Close
            </Button>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}
