"use client";

import type { Clip } from "generated/prisma";
import { Copy, X } from "lucide-react";
import { useEffect, useId, useRef } from "react";
import { toast } from "sonner";
import { copyToClipboard } from "~/fsd/widgets/clip-display/lib/copy-to-clipboard";
import { Button } from "~/fsd/shared/ui/atoms/button";

interface ScriptModalProps {
  clip: Clip;
  isOpen: boolean;
  onClose: () => void;
}

export function ScriptModal({ clip, isOpen, onClose }: ScriptModalProps) {
  const scriptDialogTitleId = useId();
  const closeButtonRef = useRef<HTMLButtonElement | null>(null);

  const scriptText = clip.scriptText?.trim() ?? "";
  const hasScript = scriptText.length > 0;

  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        onClose();
      }
    };
    document.addEventListener("keydown", handleKeyDown);

    const originalOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    const raf = requestAnimationFrame(() => {
      closeButtonRef.current?.focus();
    });

    return () => {
      cancelAnimationFrame(raf);
      document.removeEventListener("keydown", handleKeyDown);
      document.body.style.overflow = originalOverflow;
    };
  }, [isOpen, onClose]);

  const handleCopyScript = async () => {
    if (!hasScript) {
      toast.error("Script is not available yet.");
      return;
    }
    await copyToClipboard(scriptText, "script");
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

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50">
      <div
        className="absolute inset-0 bg-black/50 backdrop-blur-sm"
        onClick={onClose}
        aria-hidden="true"
      />

      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={scriptDialogTitleId}
        className="bg-background absolute inset-x-0 bottom-0 mx-auto flex w-full max-w-lg flex-col rounded-t-2xl border shadow-xl md:inset-y-0 md:right-0 md:bottom-auto md:mx-0 md:h-full md:max-w-md md:rounded-none md:rounded-l-2xl"
      >
        <div className="flex items-start justify-between gap-3 border-b p-4">
          <div className="min-w-0">
            <h2 id={scriptDialogTitleId} className="text-base font-semibold">
              Script
            </h2>
            <p className="text-muted-foreground mt-1 text-xs">
              {timecodeLabel ? `Timecode: ${timecodeLabel}` : "Timecode: -"}
            </p>
          </div>

          <Button asChild variant="ghost" size="icon-sm">
            <button
              ref={closeButtonRef}
              type="button"
              onClick={onClose}
              aria-label="Close"
            >
              <X className="h-4 w-4" />
            </button>
          </Button>
        </div>

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
      </div>
    </div>
  );
}
