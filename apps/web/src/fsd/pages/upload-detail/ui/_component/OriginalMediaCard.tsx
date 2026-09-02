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
  const playUrlState = usePlayUrl(uploadedFileId, getOriginalPlayUrl);

  const handleDownload = () => {
    if (playUrlState.status !== "ready") return;
    triggerDownload(playUrlState.url);
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
          {playUrlState.status === "ready" && (
            <video
              src={playUrlState.url}
              controls
              preload="metadata"
              className="w-full rounded-md object-cover"
            />
          )}
          {/* 이전에는 실패 상태를 읽지 않아 presign 실패가 영원한 검은 상자로 남았다. */}
          {playUrlState.status === "error" && (
            <div className="flex aspect-video items-center justify-center">
              <p className="text-xs text-white/70">Video unavailable</p>
            </div>
          )}
        </div>
        <Button
          variant="outline"
          className="w-full"
          onClick={handleDownload}
          disabled={playUrlState.status !== "ready"}
        >
          <Download className="mr-2 h-4 w-4" />
          Download
        </Button>
      </CardContent>
    </Card>
  );
}
