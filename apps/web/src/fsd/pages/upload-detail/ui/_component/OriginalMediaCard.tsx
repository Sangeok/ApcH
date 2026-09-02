"use client";

import { getOriginalPlayUrl } from "~/fsd/features/upload";
import {
  type ProcessingStatus,
  UploadedFileStatusBadge,
} from "~/fsd/entities/uploaded-file";
import { usePlayUrl } from "~/fsd/shared/lib/use-play-url";
import { triggerDownload } from "~/fsd/shared/lib/triggerDownload";
import { Download } from "lucide-react";
import { Button } from "~/fsd/shared/ui/atoms/button";
import { Card, CardContent, CardHeader } from "~/fsd/shared/ui/atoms/card";

interface OriginalMediaCardProps {
  uploadedFileId: string;
  displayName: string | null;
  status: Exclude<ProcessingStatus, "upload_pending">;
}

export default function OriginalMediaCard({
  uploadedFileId,
  displayName,
  status,
}: OriginalMediaCardProps) {
  const { playUrl, isLoading } = usePlayUrl(uploadedFileId, getOriginalPlayUrl);

  const handleDownload = () => {
    if (!playUrl) return;
    triggerDownload(playUrl);
  };

  return (
    <Card className="from-background/70 to-background overflow-hidden rounded-2xl border bg-gradient-to-b shadow-lg lg:col-span-1">
      <CardHeader className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <p className="text-muted-foreground text-sm">Original media</p>
          <h3 className="text-lg font-semibold">{displayName ?? "Untitled"}</h3>
        </div>
        <UploadedFileStatusBadge status={status} />
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="overflow-hidden rounded-xl bg-black">
          {!isLoading && playUrl && (
            <video
              src={playUrl}
              controls
              preload="metadata"
              className="w-full rounded-md object-cover"
            />
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
