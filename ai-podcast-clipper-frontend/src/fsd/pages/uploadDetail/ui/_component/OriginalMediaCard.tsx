"use client";

import { useEffect, useState } from "react";
import { getOriginalPlayUrl } from "~/fsd/features/upload/api";
import { toast } from "sonner";
import { Download } from "lucide-react";
import { Button } from "~/fsd/shared/ui/atoms/button";
import { Badge } from "~/fsd/shared/ui/atoms/badge";
import {
  Card,
  CardContent,
  CardHeader,
} from "~/fsd/shared/ui/atoms/card";

interface OriginalMediaCardProps {
  uploadedFileId: string;
  displayName: string | null;
  status: string;
}

export default function OriginalMediaCard({
  uploadedFileId,
  displayName,
  status,
}: OriginalMediaCardProps) {
  const [playUrl, setPlayUrl] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const fetchUrl = async () => {
      setIsLoading(true);
      try {
        const result = await getOriginalPlayUrl(uploadedFileId);
        if (result.success) {
          setPlayUrl(result.data.url);
        } else {
          toast.error("Failed to get original play url: " + result.error);
          console.error("Failed to get original play url: " + result.error);
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        toast.error("Failed to get original play url: " + message);
        console.error("Failed to get original play url: " + message);
      } finally {
        setIsLoading(false);
      }
    };
    void fetchUrl();
  }, [uploadedFileId]);

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
    <Card className="from-background/70 to-background overflow-hidden rounded-2xl border bg-gradient-to-b shadow-lg lg:col-span-1">
      <CardHeader className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <p className="text-muted-foreground text-sm">Original media</p>
          <h3 className="text-lg font-semibold">
            {displayName ?? "Untitled"}
          </h3>
        </div>
        <Badge variant="secondary" className="capitalize">
          {status}
        </Badge>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="overflow-hidden rounded-xl bg-black">
          {!isLoading && playUrl && (
            <div className="flex flex-col gap-y-2">
              <video
                src={playUrl}
                controls
                preload="metadata"
                className="w-full rounded-md object-cover"
              />
            </div>
          )}
        </div>
        <Button
          variant="outline"
          className="w-full"
          onClick={handleDownload}
          disabled={!playUrl || isLoading}
        >
          <Download className="mr-2 h-4 w-4" />
          Download
        </Button>
      </CardContent>
    </Card>
  );
}
