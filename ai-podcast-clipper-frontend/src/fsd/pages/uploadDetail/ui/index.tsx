"use client";

import { Suspense, useEffect, useState } from "react";
import ClipDisplay from "~/fsd/widgets/clip-display/ui";
import { Badge } from "~/fsd/shared/ui/atoms/badge";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "~/fsd/shared/ui/atoms/card";
import { Separator } from "~/fsd/shared/ui/atoms/separator";
import UploadedFileActions from "~/fsd/features/upload/ui";
import ProcessingTimeline from "~/fsd/pages/uploadDetail/ui/_component/processing-timeline";
import type { Clip } from "generated/prisma";
import { getOriginalPlayUrl } from "~/actions/uploaded-files";
import { toast } from "sonner";
import { Download } from "lucide-react";
import { Button } from "~/fsd/shared/ui/atoms/button";
import type { ProcessingStatus } from "../model/type";

interface UploadDetailPageProps {
  uploadedFileData: {
    id: string;
    displayName: string | null;
    createdAt: Date;
    updatedAt: Date;
    status: string;
    language: string;
    clips: Clip[];
  };
}

export default function UploadDetailPage({
  uploadedFileData,
}: UploadDetailPageProps) {
  const { id, displayName, createdAt, updatedAt, status, clips } =
    uploadedFileData;

  const uploadedFileId = id;

  const [playUrl, setPlayUrl] = useState<string | null>(null);
  const [isLoadingOriginalPlayUrl, setIsLoadingOriginalPlayUrl] =
    useState<boolean>(true);

  useEffect(() => {
    const fetchOriginalPlayUrl = async () => {
      setIsLoadingOriginalPlayUrl(true);
      try {
        const result = await getOriginalPlayUrl(uploadedFileId);
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
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-6 px-4 py-8">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-muted-foreground text-sm">Upload detail</p>
          <h1 className="text-3xl font-semibold tracking-tight">
            {displayName ?? "Untitled"}
          </h1>
          <div className="text-muted-foreground mt-2 flex items-center gap-2 text-sm">
            <span>{new Date(createdAt).toLocaleString()}</span>
            <Separator orientation="vertical" className="h-4" />
            <Badge variant="outline">{status}</Badge>
          </div>
        </div>
        <UploadedFileActions uploadedFileId={uploadedFileId} />
      </header>

      <section className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        {/* Summary card */}
        <Card className="lg:col-span-1">
          <CardHeader>
            <CardTitle>Summary</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4 text-sm">
            <div className="flex justify-between">
              <span className="text-muted-foreground">Clips generated</span>
              <span className="font-medium">{clips.length}</span>
            </div>
          </CardContent>
        </Card>

        {/* Original media card */}
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
            </div>
            <Button
              variant="outline"
              className="w-full"
              onClick={handleDownload}
            >
              <Download className="mr-2 h-4 w-4" />
              Download
            </Button>
          </CardContent>
        </Card>

        {/* Processing timeline card */}
        <Card className="lg:col-span-1">
          <CardHeader>
            <CardTitle>Processing timeline</CardTitle>
          </CardHeader>
          <CardContent>
            <ProcessingTimeline
              status={status as ProcessingStatus}
              createdAt={new Date(createdAt)}
              updatedAt={new Date(updatedAt)}
            />
          </CardContent>
        </Card>
      </section>

      {/* Generated clips section */}
      <section className="bg-card rounded-xl border">
        <div className="flex items-center justify-between border-b px-6 py-4">
          <div>
            <p className="text-muted-foreground text-sm">Generated clips</p>
            <h2 className="text-xl font-semibold">
              {clips.length > 0
                ? `${clips.length} clip${clips.length > 1 ? "s" : ""}`
                : "No clips yet"}
            </h2>
          </div>
        </div>
        <div className="px-6 py-6">
          <Suspense
            fallback={<p className="text-muted-foreground">Loading clips…</p>}
          >
            {clips.length > 0 ? (
              <ClipDisplay clips={clips} />
            ) : (
              <p className="text-muted-foreground text-center">
                No clips generated yet
              </p>
            )}
          </Suspense>
        </div>
      </section>
    </div>
  );
}
