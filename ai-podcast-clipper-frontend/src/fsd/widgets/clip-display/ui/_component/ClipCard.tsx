"use client";

import type { Clip } from "generated/prisma";
import {
  Copy,
  Download,
  FileText,
  Loader2,
  MoreHorizontal,
  Play,
  Trash,
  X,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useId, useRef, useState, useTransition } from "react";
import { toast } from "sonner";
import { deleteClip, getClipPlayUrl } from "~/actions/generation";
import { Button } from "~/fsd/shared/ui/atoms/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "~/fsd/shared/ui/atoms/dropdown-menu";

interface ClipCardProps {
  clip: Clip;
  onDeleted: (clipId: string) => void;
}

export default function ClipCard({ clip, onDeleted }: ClipCardProps) {
  const router = useRouter();
  const scriptDialogTitleId = useId();
  const closeButtonRef = useRef<HTMLButtonElement | null>(null);

  const [playUrl, setPlayUrl] = useState<string | null>(null);
  const [isLoadingUrl, setIsLoadingUrl] = useState<boolean>(true);
  const [isDeleting, startDeleting] = useTransition();
  const [isScriptOpen, setIsScriptOpen] = useState<boolean>(false);

  const scriptText = clip.scriptText?.trim() ?? "";
  const hasScript = scriptText.length > 0;

  useEffect(() => {
    const fetchPlayUrl = async () => {
      setIsLoadingUrl(true);
      try {
        const result = await getClipPlayUrl(clip.id);
        if (result.success && result.url) {
          setPlayUrl(result.url);
        } else if (result.error) {
          toast.error("Failed to get play url: " + result.error);
          console.error("Failed to get play url: " + result.error);
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        toast.error("Failed to get play url: " + message);
        console.error("Failed to get play url: " + message);
      } finally {
        setIsLoadingUrl(false);
      }
    };
    void fetchPlayUrl();
  }, [clip.id]);

  useEffect(() => {
    if (!isScriptOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setIsScriptOpen(false);
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
  }, [isScriptOpen]);

  const handleDownload = () => {
    if (!playUrl) return;

    const link = document.createElement("a");
    link.href = playUrl;
    link.style.display = "none";
    document.body.append(link);
    link.click();
    document.body.removeChild(link);
  };

  const handleDelete = () => {
    startDeleting(async () => {
      const result = await deleteClip(clip.id);
      if (result.success) {
        toast.success("Clip deleted");
        onDeleted(clip.id);
      } else {
        toast.error(result.error ?? "Failed to delete clip");
        router.refresh();
      }
    });
  };

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
    <div className="flex max-w-52 flex-col gap-2">
      <div className="bg-muted">
        {isLoadingUrl && (
          <div className="flex h-full w-full items-center justify-center">
            <Loader2 className="text-muted-foreground h-8 w-8 animate-spin" />
          </div>
        )}
        {!isLoadingUrl && playUrl && (
          <video
            src={playUrl}
            controls
            preload="metadata"
            className="h-full w-full rounded-md object-cover"
          />
        )}
        {!isLoadingUrl && !playUrl && (
          <div className="flex h-full w-full items-center justify-center">
            <Play className="text-muted-foreground h-10 w-10 opacity-50" />
          </div>
        )}
      </div>
      <div className="flex flex-col gap-2">
        <div className="flex items-center gap-2">
          <Button
            onClick={handleDownload}
            variant="outline"
            size="sm"
            className="flex-1"
            disabled={!playUrl || isLoadingUrl}
            aria-busy={isLoadingUrl}
          >
            {isLoadingUrl ? (
              <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
            ) : (
              <Download className="mr-1.5 h-4 w-4" />
            )}
            Download
          </Button>

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="outline"
                size="icon-sm"
                aria-label="More actions"
                disabled={isDeleting}
              >
                <MoreHorizontal className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem
                onClick={() => setIsScriptOpen(true)}
                className="cursor-pointer"
              >
                <FileText className="mr-2 h-4 w-4" />
                Script
              </DropdownMenuItem>
              <DropdownMenuItem
                onClick={handleCopyScript}
                disabled={!hasScript}
                className="cursor-pointer"
              >
                <Copy className="mr-2 h-4 w-4" />
                Copy script
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                onClick={handleDelete}
                disabled={isDeleting}
                variant="destructive"
                className="cursor-pointer"
              >
                {isDeleting ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <Trash className="mr-2 h-4 w-4" />
                )}
                Delete
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>

        {isScriptOpen && (
          <div className="fixed inset-0 z-50">
            <div
              className="absolute inset-0 bg-black/50 backdrop-blur-sm"
              onClick={() => setIsScriptOpen(false)}
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
                  <h2
                    id={scriptDialogTitleId}
                    className="text-base font-semibold"
                  >
                    Script
                  </h2>
                  <p className="text-muted-foreground mt-1 text-xs">
                    {timecodeLabel
                      ? `Timecode: ${timecodeLabel}`
                      : "Timecode: -"}
                  </p>
                </div>

                <Button asChild variant="ghost" size="icon-sm">
                  <button
                    ref={closeButtonRef}
                    type="button"
                    onClick={() => setIsScriptOpen(false)}
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
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setIsScriptOpen(false)}
                  >
                    Close
                  </Button>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
