"use client";

import Link from "next/link";
import { Play } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import {
  UploadedFileStatusBadge,
  type UploadedFileSummary,
} from "~/fsd/entities/uploaded-file";
import { getOriginalPlayUrl } from "~/fsd/features/upload";
import { usePlayUrl } from "~/fsd/shared/lib/use-play-url";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "~/fsd/shared/ui/atoms/card";

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
  const playUrlState = usePlayUrl(file.id, getOriginalPlayUrl, {
    enabled: isPlaybackRequested,
  });
  const readyPlayUrl =
    playUrlState.status === "ready" ? playUrlState.url : null;
  const videoRef = useRef<HTMLVideoElement>(null);

  // 인라인 화살표 ref는 렌더마다 detach/re-attach되어 play()를 다시 호출한다.
  // 이 목록은 7.5초 큐 폴마다 리렌더되므로 사용자가 일시정지해도 곧 다시 재생됐다.
  // 소스가 바뀔 때만 한 번 재생한다.
  useEffect(() => {
    if (!readyPlayUrl) {
      return;
    }

    void videoRef.current?.play().catch(() => undefined);
  }, [readyPlayUrl]);

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
        <UploadedFileStatusBadge status={file.status} className="text-xs" />
      </CardHeader>
      <CardContent className="text-muted-foreground space-y-2 text-sm">
        {!isPlaybackRequested && (
          <button
            type="button"
            aria-label="Play original media"
            onClick={() => setIsPlaybackRequested(true)}
            className="bg-muted hover:bg-muted/80 focus-visible:ring-ring flex aspect-video w-full cursor-pointer items-center justify-center rounded-md transition focus-visible:ring-2 focus-visible:outline-none"
          >
            <Play className="text-muted-foreground h-8 w-8" />
          </button>
        )}
        {playUrlState.status === "loading" && (
          <div className="bg-muted aspect-video w-full animate-pulse rounded-md" />
        )}
        {playUrlState.status === "error" && (
          <div className="bg-muted flex aspect-video items-center justify-center rounded-md">
            <p className="text-muted-foreground text-xs">Video unavailable</p>
          </div>
        )}
        {playUrlState.status === "ready" && (
          <video
            ref={videoRef}
            src={playUrlState.url}
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
