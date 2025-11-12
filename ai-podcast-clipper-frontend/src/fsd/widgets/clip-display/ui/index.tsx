"use client";

import type { Clip } from "generated/prisma";
import { Download, Loader2, Play } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { getClipPlayUrl } from "~/actions/generation";
import { Button } from "~/fsd/shared/ui/atoms/button";

interface ClipDisplayProps {
  clips: Clip[];
}

function ClipCard({ clip }: { clip: Clip }) {
  const [playUrl, setPlayUrl] = useState<string | null>(null);
  const [isLoadingUrl, setIsLoadingUrl] = useState<boolean>(true);

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
        toast.error("Failed to get play url: " + error);
        console.error("Failed to get play url: " + error);
      } finally {
        setIsLoadingUrl(false);
      }
    };
    fetchPlayUrl();
  }, [clip.id]);

  const handleDownload = () => {
    if (!playUrl) return;

    const link = document.createElement("a");
    link.href = playUrl;
    link.style.display = "none";
    document.body.append(link);
    link.click();
    document.body.removeChild(link);
  };

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
        <Button onClick={handleDownload} variant="outline" size="sm">
          <Download className="mr-1.5 h-4 w-4" />
          Download
        </Button>
      </div>
    </div>
  );
}

export default function ClipDisplay({ clips }: ClipDisplayProps) {
  if (clips.length === 0) {
    return (
      <p className="text-muted-foreground p-4 text-center">No clips found</p>
    );
  }

  return (
    <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4">
      {clips.map((clip) => {
        return <ClipCard key={clip.id} clip={clip} />;
      })}
    </div>
  );
}
