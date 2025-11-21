"use client";

import type { Clip } from "generated/prisma";
import { Download, Loader2, Play, Trash } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useState, useTransition } from "react";
import { toast } from "sonner";
import { deleteClip, getClipPlayUrl } from "~/actions/generation";
import { Button } from "~/fsd/shared/ui/atoms/button";

interface ClipCardProps {
  clip: Clip;
  onDeleted: (clipId: string) => void;
}

export default function ClipCard({ clip, onDeleted }: ClipCardProps) {
  const router = useRouter();
  const [playUrl, setPlayUrl] = useState<string | null>(null);
  const [isLoadingUrl, setIsLoadingUrl] = useState<boolean>(true);
  const [isDeleting, startDeleting] = useTransition();

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
        <Button
          onClick={handleDelete}
          variant="outline"
          size="sm"
          disabled={isDeleting}
          aria-busy={isDeleting}
        >
          {isDeleting ? (
            <>
              <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
              Deleting...
            </>
          ) : (
            <>
              <Trash className="mr-1.5 h-4 w-4" />
              Delete
            </>
          )}
        </Button>
      </div>
    </div>
  );
}
