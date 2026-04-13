"use client";

import { useState } from "react";
import Link from "next/link";
import { Play } from "lucide-react";
import { Badge } from "~/fsd/shared/ui/atoms/badge";
import { usePlayUrl } from "~/fsd/shared/hooks/usePlayUrl";
import { getOriginalPlayUrl } from "~/fsd/features/upload/api";
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
  const [shouldPlay, setShouldPlay] = useState(false);
  const { playUrl, error } = usePlayUrl(
    file.id,
    getOriginalPlayUrl,
    { enabled: shouldPlay },
  );

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
        <Badge variant="outline" className="text-xs capitalize">
          {file.status}
        </Badge>
      </CardHeader>
      <CardContent className="text-muted-foreground space-y-2 text-sm">
        {!shouldPlay && (
          <button
            type="button"
            aria-label="영상 재생"
            onClick={() => setShouldPlay(true)}
            className="aspect-video w-full rounded-md bg-muted flex items-center justify-center hover:bg-muted/80 transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <Play className="h-8 w-8 text-muted-foreground" />
          </button>
        )}
        {shouldPlay && !playUrl && !error && (
          <div className="aspect-video w-full animate-pulse rounded-md bg-muted" />
        )}
        {shouldPlay && error && (
          <div className="aspect-video flex items-center justify-center rounded-md bg-muted">
            <p className="text-muted-foreground text-xs">Video unavailable</p>
          </div>
        )}
        {shouldPlay && playUrl && (
          <video
            ref={(el) => { void el?.play().catch(() => {}); }}
            src={playUrl}
            controls
            playsInline
            preload="metadata"
            className="w-full rounded-md object-cover"
          />
        )}
        <p>Uploaded: {createdLabel}</p>
        <p>{file.clipsCount} generated clips</p>
      </CardContent>
    </Card>
  );
}
