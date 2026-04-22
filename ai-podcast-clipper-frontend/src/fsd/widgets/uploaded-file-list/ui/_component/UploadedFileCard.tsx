"use client";

import Link from "next/link";
import { Play } from "lucide-react";
import { useState } from "react";
import { getOriginalPlayUrl } from "~/fsd/features/upload/api";
import { STATUS_CONFIG } from "~/fsd/pages/dashboard/config";
import { usePlayUrl } from "~/fsd/shared/lib/use-play-url";
import { Badge } from "~/fsd/shared/ui/atoms/badge";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "~/fsd/shared/ui/atoms/card";
import type { UploadedFileSummary } from "~/fsd/widgets/uploaded-file-list/model/types";

const dateFormatter = new Intl.DateTimeFormat("en", {
  dateStyle: "medium",
  timeStyle: "short",
});

interface UploadedFileCardProps {
  file: UploadedFileSummary;
}

export function UploadedFileCard({ file }: UploadedFileCardProps) {
  const detailHref = `/dashboard/uploads/${file.id}`;
  const createdLabel = dateFormatter.format(new Date(file.createdAt));
  const [isPlaybackRequested, setIsPlaybackRequested] = useState(false);
  const { playUrl, error } = usePlayUrl(file.id, getOriginalPlayUrl, {
    enabled: isPlaybackRequested,
  });
  const statusConfig = STATUS_CONFIG[file.status];

  return (
    <Card className="h-full transition">
      <CardHeader className="flex flex-row items-start justify-between space-y-0">
        <CardTitle className="text-base font-medium">
          <Link
            href={detailHref}
            className="hover:underline focus:outline-none focus-visible:ring-2"
          >
            {file.fileName}
          </Link>
        </CardTitle>
        <Badge variant={statusConfig.variant} className="text-xs">
          {statusConfig.label}
        </Badge>
      </CardHeader>
      <CardContent className="text-muted-foreground space-y-2 text-sm">
        {!isPlaybackRequested && (
          <button
            type="button"
            aria-label="Play original media"
            onClick={() => setIsPlaybackRequested(true)}
            className="flex aspect-video w-full cursor-pointer items-center justify-center rounded-md bg-muted transition hover:bg-muted/80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <Play className="h-8 w-8 text-muted-foreground" />
          </button>
        )}
        {isPlaybackRequested && !playUrl && !error && (
          <div className="aspect-video w-full animate-pulse rounded-md bg-muted" />
        )}
        {isPlaybackRequested && error && (
          <div className="flex aspect-video items-center justify-center rounded-md bg-muted">
            <p className="text-muted-foreground text-xs">Video unavailable</p>
          </div>
        )}
        {isPlaybackRequested && playUrl && (
          <video
            ref={(element) => {
              void element?.play().catch(() => undefined);
            }}
            src={playUrl}
            controls
            playsInline
            preload="metadata"
            className="w-full rounded-md object-cover"
          />
        )}
        <p>Uploaded: {createdLabel}</p>
        <p>{file.visibleClipsCount} visible clips</p>
      </CardContent>
    </Card>
  );
}
