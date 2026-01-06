"use client";

import { Tabs, TabsContent, TabsList, TabsTrigger } from "@radix-ui/react-tabs";
import type { Clip } from "generated/prisma";
import {
  Check,
  Copy,
  Download,
  FileText,
  Hash,
  Loader2,
  MoreHorizontal,
  Play,
  Trash,
  Type,
  X,
} from "lucide-react";
import { useRouter } from "next/navigation";
import {
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  useTransition,
} from "react";
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

  const [isMetadataOpen, setIsMetadataOpen] = useState<boolean>(false);
  const [copiedField, setCopiedField] = useState<string | null>(null);

  const scriptText = clip.scriptText?.trim() ?? "";
  const hasScript = scriptText.length > 0;

  const youtubeHashtags: string[] = useMemo(() => {
    if (!clip.youtubeHashtags) return [];
    try {
      return JSON.parse(clip.youtubeHashtags);
    } catch {
      return [];
    }
  }, [clip.youtubeHashtags]);

  const hasMetadata =
    clip.youtubeTitle || clip.youtubeDescription || youtubeHashtags.length > 0;

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

  const handleCopyMetadata = async (field: string, value: string) => {
    if (!value) {
      toast.error(`${field} is not available.`);
      return;
    }

    try {
      await navigator.clipboard.writeText(value);
      setCopiedField(field);
      toast.success(`Copied ${field.toLowerCase()}.`);
      setTimeout(() => setCopiedField(null), 2000);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      toast.error(`Failed to copy: ${message}`);
    }
  };

  const handleCopyAllMetadata = async () => {
    const allText = [
      clip.youtubeTitle,
      clip.youtubeDescription,
      youtubeHashtags.join(" "),
    ]
      .filter(Boolean)
      .join("\n\n");

    await handleCopyMetadata("All metadata", allText);
  };

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
                onClick={() => setIsMetadataOpen(true)}
                disabled={!hasMetadata}
                className="cursor-pointer"
              >
                <Hash className="mr-2 h-4 w-4" />
                YouTube Metadata
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

        {isMetadataOpen && (
          <div className="fixed inset-0 z-50">
            <div
              className="absolute inset-0 bg-black/50 backdrop-blur-sm"
              onClick={() => setIsMetadataOpen(false)}
            />

            <div
              role="dialog"
              aria-modal="true"
              className="bg-background absolute inset-x-0 bottom-0 mx-auto flex w-full max-w-lg flex-col rounded-t-2xl border shadow-xl md:inset-y-0 md:right-0 md:bottom-auto md:mx-0 md:h-full md:max-w-md md:rounded-none md:rounded-l-2xl"
            >
              {/* 헤더 */}
              <div className="flex items-start justify-between gap-3 border-b p-4">
                <div>
                  <h2 className="text-base font-semibold">YouTube Metadata</h2>
                  <p className="text-muted-foreground mt-1 text-xs">
                    SEO-optimized for YouTube Shorts
                  </p>
                </div>
                <Button
                  variant="ghost"
                  size="icon-sm"
                  onClick={() => setIsMetadataOpen(false)}
                >
                  <X className="h-4 w-4" />
                </Button>
              </div>

              {/* 탭 콘텐츠 */}
              <div className="flex-1 overflow-auto p-4">
                <Tabs defaultValue="title" className="w-full">
                  <TabsList className="grid w-full grid-cols-3">
                    <TabsTrigger value="title">
                      <Type className="mr-1.5 h-3.5 w-3.5" />
                      Title
                    </TabsTrigger>
                    <TabsTrigger value="description">
                      <FileText className="mr-1.5 h-3.5 w-3.5" />
                      Desc
                    </TabsTrigger>
                    <TabsTrigger value="hashtags">
                      <Hash className="mr-1.5 h-3.5 w-3.5" />
                      Tags
                    </TabsTrigger>
                  </TabsList>

                  <TabsContent value="title" className="mt-4 space-y-3">
                    <div className="flex justify-between text-sm">
                      <span className="font-medium">Title</span>
                      <span className="text-muted-foreground">
                        {clip.youtubeTitle?.length ?? 0}/100
                      </span>
                    </div>
                    <div className="bg-muted/30 rounded-lg border p-3">
                      <p className="text-sm">
                        {clip.youtubeTitle || "Not available"}
                      </p>
                    </div>
                    <Button
                      variant="secondary"
                      size="sm"
                      className="w-full"
                      onClick={() =>
                        handleCopyMetadata("Title", clip.youtubeTitle ?? "")
                      }
                    >
                      {copiedField === "Title" ? (
                        <Check className="mr-2 h-4 w-4" />
                      ) : (
                        <Copy className="mr-2 h-4 w-4" />
                      )}
                      Copy Title
                    </Button>
                  </TabsContent>

                  <TabsContent value="description" className="mt-4 space-y-3">
                    <div className="flex justify-between text-sm">
                      <span className="font-medium">Description</span>
                      <span className="text-muted-foreground">
                        {clip.youtubeDescription?.length ?? 0}/5000
                      </span>
                    </div>
                    <div className="bg-muted/30 max-h-48 overflow-auto rounded-lg border p-3">
                      <p className="text-sm whitespace-pre-wrap">
                        {clip.youtubeDescription || "Not available"}
                      </p>
                    </div>
                    <Button
                      variant="secondary"
                      size="sm"
                      className="w-full"
                      onClick={() =>
                        handleCopyMetadata(
                          "Description",
                          clip.youtubeDescription ?? "",
                        )
                      }
                    >
                      {copiedField === "Description" ? (
                        <Check className="mr-2 h-4 w-4" />
                      ) : (
                        <Copy className="mr-2 h-4 w-4" />
                      )}
                      Copy Description
                    </Button>
                  </TabsContent>

                  <TabsContent value="hashtags" className="mt-4 space-y-3">
                    <span className="text-sm font-medium">
                      Hashtags ({youtubeHashtags.length})
                    </span>
                    <div className="flex flex-wrap gap-2">
                      {youtubeHashtags.map((tag, idx) => (
                        <button
                          key={idx}
                          onClick={() => handleCopyMetadata(`Tag`, tag)}
                          className="bg-muted hover:bg-muted/80 rounded-full px-3 py-1 text-sm"
                        >
                          {tag}
                        </button>
                      ))}
                    </div>
                    <Button
                      variant="secondary"
                      size="sm"
                      className="w-full"
                      onClick={() =>
                        handleCopyMetadata(
                          "Hashtags",
                          youtubeHashtags.join(" "),
                        )
                      }
                    >
                      Copy All Hashtags
                    </Button>
                  </TabsContent>
                </Tabs>
              </div>

              {/* 푸터 */}
              <div className="flex justify-end gap-2 border-t p-4">
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={handleCopyAllMetadata}
                >
                  <Copy className="mr-2 h-4 w-4" />
                  Copy All
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setIsMetadataOpen(false)}
                >
                  Close
                </Button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
