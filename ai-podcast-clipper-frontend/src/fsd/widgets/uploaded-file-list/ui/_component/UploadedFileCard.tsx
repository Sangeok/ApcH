"use client";

import Link from "next/link";
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
  const { playUrl, isLoading, error } = usePlayUrl(file.id, getOriginalPlayUrl);

  return (
    <Link href={detailHref} className="block focus:outline-none">
      <Card className="hover:border-primary h-full transition focus-visible:ring-2">
        <CardHeader className="flex flex-row items-start justify-between space-y-0">
          <CardTitle className="text-base font-medium">
            {file.fileName}
          </CardTitle>
          <Badge variant="outline" className="text-xs capitalize">
            {file.status}
          </Badge>
        </CardHeader>
        <CardContent className="text-muted-foreground space-y-2 text-sm">
          {isLoading && (
            <div className="aspect-video w-full animate-pulse rounded-md bg-muted" />
          )}
          {!isLoading && error && (
            <div className="aspect-video flex items-center justify-center rounded-md bg-muted">
              <p className="text-muted-foreground text-xs">Video unavailable</p>
            </div>
          )}
          {!isLoading && playUrl && (
            <div onClick={(e) => e.stopPropagation()}>
              <video
                src={playUrl}
                controls
                preload="metadata"
                className="w-full rounded-md object-cover"
              />
            </div>
          )}
          <p>Uploaded: {createdLabel}</p>
          <p>{file.clipsCount} generated clips</p>
        </CardContent>
      </Card>
    </Link>
  );
}
