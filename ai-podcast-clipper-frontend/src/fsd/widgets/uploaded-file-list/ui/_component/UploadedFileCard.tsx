"use client";

import Link from "next/link";
import { Badge } from "~/fsd/shared/ui/atoms/badge";
import { useState, useEffect } from "react";
import { toast } from "sonner";
import { getOriginalPlayUrl } from "~/actions/uploaded-files";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "~/fsd/shared/ui/atoms/card";

interface UploadedFileCardProps {
  file: {
    id: string;
    fileName: string;
    status: string;
    createdAt: Date;
    clipsCount: number;
  };
}

export function UploadedFileCard({ file }: UploadedFileCardProps) {
  const detailHref = `/dashboard/uploads/${file.id}`;
  const createdLabel = new Intl.DateTimeFormat("en", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(file.createdAt));

  const [playUrl, setPlayUrl] = useState<string | null>(null);
  const [isLoadingOriginalPlayUrl, setIsLoadingOriginalPlayUrl] =
    useState<boolean>(true);

  useEffect(() => {
    const fetchOriginalPlayUrl = async () => {
      setIsLoadingOriginalPlayUrl(true);
      try {
        const result = await getOriginalPlayUrl(file.id);
        if (result.success && result.url) {
          setPlayUrl(result.url);
        } else if (result.error) {
          toast.error("Failed to get original play url: " + result.error);
          console.error("Failed to get original play url: " + result.error);
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        toast.error("Failed to get original play url: " + message);
        console.error("Failed to get original play url: " + message);
      } finally {
        setIsLoadingOriginalPlayUrl(false);
      }
    };
    void fetchOriginalPlayUrl();
  }, [file.id]);

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
          {!isLoadingOriginalPlayUrl && playUrl && (
            <div className="flex flex-col gap-y-2">
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
