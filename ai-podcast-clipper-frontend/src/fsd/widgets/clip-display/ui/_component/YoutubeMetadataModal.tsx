"use client";

import { Tabs, TabsContent, TabsList, TabsTrigger } from "@radix-ui/react-tabs";
import type { Clip } from "generated/prisma";
import {
  Check,
  Copy,
  FileText,
  Hash,
  Type,
  X,
} from "lucide-react";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { YOUTUBE_DESCRIPTION_MAX_LENGTH, YOUTUBE_TITLE_MAX_LENGTH } from "~/fsd/shared/config/constants";
import { parseJsonArray } from "~/fsd/shared/lib/utils";
import { Button } from "~/fsd/shared/ui/atoms/button";
import { copyToClipboard } from "~/fsd/widgets/clip-display/lib/copy-to-clipboard";

type CopiedField = "Title" | "Description" | "Hashtags" | "Tag" | "All metadata";

interface CopyButtonProps {
  field: CopiedField;
  label: string;
  value: string;
  copiedField: CopiedField | null;
  onCopy: (field: CopiedField, value: string) => Promise<void>;
  disabled?: boolean;
}

function CopyButton({ field, label, value, copiedField, onCopy, disabled }: CopyButtonProps) {
  const isCopied = copiedField === field;

  return (
    <Button
      variant="secondary"
      size="sm"
      className="group relative w-full overflow-hidden rounded-xl bg-gradient-to-r from-amber-500/10 to-orange-500/10 font-semibold transition-all duration-200 hover:from-amber-500/20 hover:to-orange-500/20 hover:shadow-lg"
      onClick={() => onCopy(field, value)}
      disabled={disabled}
    >
      <div className="absolute inset-0 bg-gradient-to-r from-amber-500/0 via-amber-500/20 to-amber-500/0 opacity-0 transition-opacity duration-500 group-hover:opacity-100" />
      {isCopied ? (
        <>
          <Check className="animate-in zoom-in mr-2 h-4 w-4 duration-200" />
          Copied!
        </>
      ) : (
        <>
          <Copy className="mr-2 h-4 w-4 transition-transform duration-200 group-hover:scale-110" />
          {label}
        </>
      )}
    </Button>
  );
}

interface CharacterCountBarProps {
  label: string;
  current: number;
  max: number;
}

function CharacterCountBar({ label, current, max }: CharacterCountBarProps) {
  const isOver = current > max;

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <span className="text-sm font-semibold">{label}</span>
        <span className={`text-xs font-medium tabular-nums ${isOver ? "text-red-500" : "text-muted-foreground"}`}>
          {current}/{max}
        </span>
      </div>
      <div className="bg-muted/30 h-1.5 w-full overflow-hidden rounded-full">
        <div
          className={`h-full rounded-full transition-all duration-500 ${isOver ? "bg-gradient-to-r from-red-500 to-red-600" : "bg-gradient-to-r from-amber-500 to-orange-500"}`}
          style={{ width: `${Math.min((current / max) * 100, 100)}%` }}
        />
      </div>
    </div>
  );
}

interface YoutubeMetadataModalProps {
  clip: Clip;
  isOpen: boolean;
  onClose: () => void;
}

export function YoutubeMetadataModal({
  clip,
  isOpen,
  onClose,
}: YoutubeMetadataModalProps) {
  const [copiedField, setCopiedField] = useState<CopiedField | null>(null);

  const youtubeHashtags = useMemo(
    () => parseJsonArray<string>(clip.youtubeHashtags),
    [clip.youtubeHashtags],
  );

  const handleCopyMetadata = async (field: CopiedField, value: string) => {
    if (!value) {
      toast.error(`${field} is not available.`);
      return;
    }
    const result = await copyToClipboard(value);
    if (result.success) {
      setCopiedField(field);
      setTimeout(() => setCopiedField(null), 2000);
    } else {
      toast.error(`Failed to copy ${field.toLowerCase()}: ${result.error}`);
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

  if (!isOpen) return null;

  return (
    <div className="animate-in fade-in fixed inset-0 z-50 duration-200">
      <div
        className="absolute inset-0 bg-gradient-to-br from-black/60 via-black/50 to-black/60 backdrop-blur-md"
        onClick={onClose}
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
        {/* Header */}
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
              onClick={onClose}
              className="hover:bg-muted/50 shrink-0 rounded-lg transition-all duration-200 hover:rotate-90"
              aria-label="Close metadata panel"
            >
              <X className="h-4 w-4" />
            </Button>
          </div>
        </div>

        {/* Content */}
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
              <CharacterCountBar
                label="Title"
                current={clip.youtubeTitle?.length ?? 0}
                max={YOUTUBE_TITLE_MAX_LENGTH}
              />
              <div className="group border-border/50 from-muted/30 to-muted/10 hover:border-border relative overflow-hidden rounded-xl border bg-gradient-to-br p-4 backdrop-blur-sm transition-all duration-200">
                <p className="text-sm leading-relaxed">
                  {clip.youtubeTitle ?? (
                    <span className="text-muted-foreground italic">
                      Not available
                    </span>
                  )}
                </p>
              </div>
              <CopyButton
                field="Title"
                label="Copy Title"
                value={clip.youtubeTitle ?? ""}
                copiedField={copiedField}
                onCopy={handleCopyMetadata}
              />
            </TabsContent>

            {/* Description Tab */}
            <TabsContent
              value="description"
              className="animate-in fade-in slide-in-from-bottom-2 mt-6 space-y-4 duration-300"
            >
              <CharacterCountBar
                label="Description"
                current={clip.youtubeDescription?.length ?? 0}
                max={YOUTUBE_DESCRIPTION_MAX_LENGTH}
              />
              <div className="group border-border/50 from-muted/30 to-muted/10 hover:border-border relative max-h-64 overflow-auto rounded-xl border bg-gradient-to-br p-4 backdrop-blur-sm transition-all duration-200">
                <p className="text-sm leading-relaxed whitespace-pre-wrap">
                  {clip.youtubeDescription ?? (
                    <span className="text-muted-foreground italic">
                      Not available
                    </span>
                  )}
                </p>
                {/* Fade overlay at bottom */}
                <div className="from-muted/30 pointer-events-none absolute inset-x-0 bottom-0 h-12 bg-gradient-to-t to-transparent" />
              </div>
              <CopyButton
                field="Description"
                label="Copy Description"
                value={clip.youtubeDescription ?? ""}
                copiedField={copiedField}
                onCopy={handleCopyMetadata}
              />
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
                      onClick={() => handleCopyMetadata("Tag", tag)}
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
              <CopyButton
                field="Hashtags"
                label="Copy All Hashtags"
                value={youtubeHashtags.join(" ")}
                copiedField={copiedField}
                onCopy={handleCopyMetadata}
                disabled={youtubeHashtags.length === 0}
              />
            </TabsContent>
          </Tabs>
        </div>

        {/* Footer */}
        <div className="border-border/50 from-background/80 to-background/60 animate-in fade-in slide-in-from-bottom border-t bg-gradient-to-br p-5 backdrop-blur-sm delay-200 duration-300">
          <div className="flex items-center justify-between gap-3">
            <Button
              variant="outline"
              size="sm"
              onClick={onClose}
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
  );
}
