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
          <div className="animate-in fade-in fixed inset-0 z-50 duration-200">
            <div
              className="absolute inset-0 bg-gradient-to-br from-black/60 via-black/50 to-black/60 backdrop-blur-md"
              onClick={() => setIsMetadataOpen(false)}
            />

            <div
              role="dialog"
              aria-modal="true"
              aria-label="YouTube Metadata Panel"
              className="border-border/50 from-background/95 to-background animate-in slide-in-from-bottom md:animate-in md:slide-in-from-right absolute inset-x-0 bottom-0 mx-auto flex w-full max-w-lg flex-col overflow-hidden rounded-t-3xl border bg-gradient-to-b shadow-2xl backdrop-blur-xl duration-300 md:inset-y-0 md:right-0 md:bottom-auto md:mx-0 md:h-full md:max-w-md md:rounded-none md:rounded-l-3xl"
              style={{
                boxShadow:
                  "0 0 0 1px rgba(255,255,255,0.05), 0 25px 50px -12px rgba(0,0,0,0.5)",
              }}
            >
              {/* Header with enhanced styling */}
              <div className="border-border/50 animate-in fade-in slide-in-from-top relative border-b bg-gradient-to-br from-amber-500/5 via-transparent to-transparent p-5 delay-75 duration-300">
                <div className="absolute inset-0 bg-gradient-to-r from-amber-500/10 to-transparent opacity-0 transition-opacity duration-500 group-hover:opacity-100" />
                <div className="relative flex items-start justify-between gap-4">
                  <div className="flex-1 space-y-1.5">
                    <div className="flex items-center gap-2">
                      <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br from-amber-500/20 to-orange-500/20 backdrop-blur-sm">
                        <Hash className="h-4 w-4 text-amber-500" />
                      </div>
                      <h2 className="text-lg font-bold tracking-tight">
                        YouTube Metadata
                      </h2>
                    </div>
                    <p className="text-muted-foreground text-xs font-medium">
                      SEO-optimized for YouTube Shorts
                    </p>
                  </div>
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    onClick={() => setIsMetadataOpen(false)}
                    className="hover:bg-muted/50 shrink-0 rounded-lg transition-all duration-200 hover:rotate-90"
                    aria-label="Close metadata panel"
                  >
                    <X className="h-4 w-4" />
                  </Button>
                </div>
              </div>

              {/* Content area with improved spacing */}
              <div className="animate-in fade-in flex-1 overflow-auto p-5 delay-150 duration-300">
                <Tabs defaultValue="title" className="w-full">
                  <TabsList className="bg-muted/30 grid w-full grid-cols-3 gap-1.5 rounded-xl p-1.5 backdrop-blur-sm">
                    <TabsTrigger
                      value="title"
                      className="data-[state=active]:bg-background data-[state=active]:text-foreground rounded-lg px-3 py-2.5 text-xs font-semibold transition-all duration-200 data-[state=active]:shadow-sm"
                    >
                      <Type className="mr-1.5 h-3.5 w-3.5" />
                      Title
                    </TabsTrigger>
                    <TabsTrigger
                      value="description"
                      className="data-[state=active]:bg-background data-[state=active]:text-foreground rounded-lg px-3 py-2.5 text-xs font-semibold transition-all duration-200 data-[state=active]:shadow-sm"
                    >
                      <FileText className="mr-1.5 h-3.5 w-3.5" />
                      Desc
                    </TabsTrigger>
                    <TabsTrigger
                      value="hashtags"
                      className="data-[state=active]:bg-background data-[state=active]:text-foreground rounded-lg px-3 py-2.5 text-xs font-semibold transition-all duration-200 data-[state=active]:shadow-sm"
                    >
                      <Hash className="mr-1.5 h-3.5 w-3.5" />
                      Tags
                    </TabsTrigger>
                  </TabsList>

                  {/* Title Tab */}
                  <TabsContent
                    value="title"
                    className="animate-in fade-in slide-in-from-bottom-2 mt-6 space-y-4 duration-300"
                  >
                    <div className="space-y-2">
                      <div className="flex items-center justify-between">
                        <span className="text-sm font-semibold">Title</span>
                        <div className="flex items-center gap-2">
                          <span
                            className={`text-xs font-medium tabular-nums ${
                              (clip.youtubeTitle?.length ?? 0) > 100
                                ? "text-red-500"
                                : "text-muted-foreground"
                            }`}
                          >
                            {clip.youtubeTitle?.length ?? 0}/100
                          </span>
                        </div>
                      </div>
                      {/* Progress bar */}
                      <div className="bg-muted/30 h-1.5 w-full overflow-hidden rounded-full">
                        <div
                          className={`h-full rounded-full transition-all duration-500 ${
                            (clip.youtubeTitle?.length ?? 0) > 100
                              ? "bg-gradient-to-r from-red-500 to-red-600"
                              : "bg-gradient-to-r from-amber-500 to-orange-500"
                          }`}
                          style={{
                            width: `${Math.min(((clip.youtubeTitle?.length ?? 0) / 100) * 100, 100)}%`,
                          }}
                        />
                      </div>
                    </div>
                    <div className="group border-border/50 from-muted/30 to-muted/10 hover:border-border relative overflow-hidden rounded-xl border bg-gradient-to-br p-4 backdrop-blur-sm transition-all duration-200">
                      <p className="text-sm leading-relaxed">
                        {clip.youtubeTitle || (
                          <span className="text-muted-foreground italic">
                            Not available
                          </span>
                        )}
                      </p>
                    </div>
                    <Button
                      variant="secondary"
                      size="sm"
                      className="group relative w-full overflow-hidden rounded-xl bg-gradient-to-r from-amber-500/10 to-orange-500/10 font-semibold transition-all duration-200 hover:from-amber-500/20 hover:to-orange-500/20 hover:shadow-lg"
                      onClick={() =>
                        handleCopyMetadata("Title", clip.youtubeTitle ?? "")
                      }
                    >
                      <div className="absolute inset-0 bg-gradient-to-r from-amber-500/0 via-amber-500/20 to-amber-500/0 opacity-0 transition-opacity duration-500 group-hover:opacity-100" />
                      {copiedField === "Title" ? (
                        <>
                          <Check className="animate-in zoom-in mr-2 h-4 w-4 duration-200" />
                          Copied!
                        </>
                      ) : (
                        <>
                          <Copy className="mr-2 h-4 w-4 transition-transform duration-200 group-hover:scale-110" />
                          Copy Title
                        </>
                      )}
                    </Button>
                  </TabsContent>

                  {/* Description Tab */}
                  <TabsContent
                    value="description"
                    className="animate-in fade-in slide-in-from-bottom-2 mt-6 space-y-4 duration-300"
                  >
                    <div className="space-y-2">
                      <div className="flex items-center justify-between">
                        <span className="text-sm font-semibold">
                          Description
                        </span>
                        <div className="flex items-center gap-2">
                          <span
                            className={`text-xs font-medium tabular-nums ${
                              (clip.youtubeDescription?.length ?? 0) > 5000
                                ? "text-red-500"
                                : "text-muted-foreground"
                            }`}
                          >
                            {clip.youtubeDescription?.length ?? 0}/5000
                          </span>
                        </div>
                      </div>
                      {/* Progress bar */}
                      <div className="bg-muted/30 h-1.5 w-full overflow-hidden rounded-full">
                        <div
                          className={`h-full rounded-full transition-all duration-500 ${
                            (clip.youtubeDescription?.length ?? 0) > 5000
                              ? "bg-gradient-to-r from-red-500 to-red-600"
                              : "bg-gradient-to-r from-amber-500 to-orange-500"
                          }`}
                          style={{
                            width: `${Math.min(((clip.youtubeDescription?.length ?? 0) / 5000) * 100, 100)}%`,
                          }}
                        />
                      </div>
                    </div>
                    <div className="group border-border/50 from-muted/30 to-muted/10 hover:border-border relative max-h-64 overflow-auto rounded-xl border bg-gradient-to-br p-4 backdrop-blur-sm transition-all duration-200">
                      <p className="text-sm leading-relaxed whitespace-pre-wrap">
                        {clip.youtubeDescription || (
                          <span className="text-muted-foreground italic">
                            Not available
                          </span>
                        )}
                      </p>
                      {/* Fade overlay at bottom */}
                      <div className="from-muted/30 pointer-events-none absolute inset-x-0 bottom-0 h-12 bg-gradient-to-t to-transparent" />
                    </div>
                    <Button
                      variant="secondary"
                      size="sm"
                      className="group relative w-full overflow-hidden rounded-xl bg-gradient-to-r from-amber-500/10 to-orange-500/10 font-semibold transition-all duration-200 hover:from-amber-500/20 hover:to-orange-500/20 hover:shadow-lg"
                      onClick={() =>
                        handleCopyMetadata(
                          "Description",
                          clip.youtubeDescription ?? "",
                        )
                      }
                    >
                      <div className="absolute inset-0 bg-gradient-to-r from-amber-500/0 via-amber-500/20 to-amber-500/0 opacity-0 transition-opacity duration-500 group-hover:opacity-100" />
                      {copiedField === "Description" ? (
                        <>
                          <Check className="animate-in zoom-in mr-2 h-4 w-4 duration-200" />
                          Copied!
                        </>
                      ) : (
                        <>
                          <Copy className="mr-2 h-4 w-4 transition-transform duration-200 group-hover:scale-110" />
                          Copy Description
                        </>
                      )}
                    </Button>
                  </TabsContent>

                  {/* Hashtags Tab */}
                  <TabsContent
                    value="hashtags"
                    className="animate-in fade-in slide-in-from-bottom-2 mt-6 space-y-4 duration-300"
                  >
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-semibold">
                        Hashtags ({youtubeHashtags.length})
                      </span>
                    </div>
                    <div className="border-border/50 from-muted/30 to-muted/10 flex min-h-[120px] flex-wrap gap-2 rounded-xl border bg-gradient-to-br p-4 backdrop-blur-sm">
                      {youtubeHashtags.length > 0 ? (
                        youtubeHashtags.map((tag, idx) => (
                          <button
                            key={idx}
                            onClick={() => handleCopyMetadata(`Tag`, tag)}
                            className="group animate-clipcard-hashtag-fade-in border-border/50 from-background/80 to-background/60 relative overflow-hidden rounded-full border bg-gradient-to-br px-4 py-2 text-sm font-medium backdrop-blur-sm transition-all duration-200 hover:scale-105 hover:border-amber-500/30 hover:bg-gradient-to-br hover:from-amber-500/10 hover:to-orange-500/10 hover:shadow-md active:scale-95"
                            style={{
                              animationDelay: `${idx * 30}ms`,
                            }}
                          >
                            <span className="relative z-10">{tag}</span>
                            <div className="absolute inset-0 bg-gradient-to-r from-amber-500/0 via-amber-500/20 to-amber-500/0 opacity-0 transition-opacity duration-300 group-hover:opacity-100" />
                          </button>
                        ))
                      ) : (
                        <span className="text-muted-foreground m-auto italic">
                          No hashtags available
                        </span>
                      )}
                    </div>
                    <Button
                      variant="secondary"
                      size="sm"
                      className="group relative w-full overflow-hidden rounded-xl bg-gradient-to-r from-amber-500/10 to-orange-500/10 font-semibold transition-all duration-200 hover:from-amber-500/20 hover:to-orange-500/20 hover:shadow-lg"
                      onClick={() =>
                        handleCopyMetadata(
                          "Hashtags",
                          youtubeHashtags.join(" "),
                        )
                      }
                      disabled={youtubeHashtags.length === 0}
                    >
                      <div className="absolute inset-0 bg-gradient-to-r from-amber-500/0 via-amber-500/20 to-amber-500/0 opacity-0 transition-opacity duration-500 group-hover:opacity-100" />
                      {copiedField === "Hashtags" ? (
                        <>
                          <Check className="animate-in zoom-in mr-2 h-4 w-4 duration-200" />
                          Copied!
                        </>
                      ) : (
                        <>
                          <Copy className="mr-2 h-4 w-4 transition-transform duration-200 group-hover:scale-110" />
                          Copy All Hashtags
                        </>
                      )}
                    </Button>
                  </TabsContent>
                </Tabs>
              </div>

              {/* Footer with enhanced styling */}
              <div className="border-border/50 from-background/80 to-background/60 animate-in fade-in slide-in-from-bottom border-t bg-gradient-to-br p-5 backdrop-blur-sm delay-200 duration-300">
                <div className="flex items-center justify-between gap-3">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setIsMetadataOpen(false)}
                    className="hover:bg-muted/50 rounded-xl font-medium transition-all duration-200"
                  >
                    Close
                  </Button>
                  <Button
                    variant="default"
                    size="sm"
                    onClick={handleCopyAllMetadata}
                    className="group relative overflow-hidden rounded-xl bg-gradient-to-r from-amber-500 to-orange-500 font-semibold shadow-lg transition-all duration-200 hover:scale-105 hover:shadow-xl active:scale-95"
                  >
                    <div className="absolute inset-0 bg-gradient-to-r from-white/0 via-white/25 to-white/0 opacity-0 transition-opacity duration-500 group-hover:opacity-100" />
                    {copiedField === "All metadata" ? (
                      <>
                        <Check className="animate-in zoom-in mr-2 h-4 w-4 duration-200" />
                        Copied All!
                      </>
                    ) : (
                      <>
                        <Copy className="mr-2 h-4 w-4 transition-transform duration-200 group-hover:scale-110" />
                        Copy All
                      </>
                    )}
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
