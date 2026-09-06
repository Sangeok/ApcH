"use client";

import type { Clip } from "@repo/db";
import { Copy, X } from "lucide-react";
import { formatSecondsAsClock } from "~/fsd/shared/lib/format-duration";
import { useScriptClipboard } from "../../model/use-script-clipboard";
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
  const { scriptText, hasScript, copyScript } = useScriptClipboard(clip);

  // "값이 없다"를 여기서만 정한다 — 공유 포매터는 숫자만 받는다.
  const formatTimestamp = (seconds: number | null | undefined) =>
    seconds === null || seconds === undefined || !Number.isFinite(seconds)
      ? null
      : formatSecondsAsClock(seconds);

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
              onClick={copyScript}
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
