"use client";

import { useEffect, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Suspense } from "react";
import type { UploadedFileDetail } from "~/fsd/entities/uploaded-file/model/types";
import { isActiveProcessingStatus } from "~/fsd/entities/uploaded-file/model/processing-status";
import { STATUS_CONFIG } from "~/fsd/pages/dashboard/config";
import { UploadedFileActions } from "~/fsd/features/upload";
import ProcessingTimeline from "~/fsd/pages/upload-detail/ui/_component/ProcessingTimeline";
import { Badge } from "~/fsd/shared/ui/atoms/badge";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "~/fsd/shared/ui/atoms/card";
import { Separator } from "~/fsd/shared/ui/atoms/separator";
import ClipDisplay from "~/fsd/widgets/clip-display/ui";
import OriginalMediaCard from "./_component/OriginalMediaCard";

interface UploadDetailPageProps {
  uploadedFileData: UploadedFileDetail;
}

export default function UploadDetailPage({
  uploadedFileData,
}: UploadDetailPageProps) {
  const router = useRouter();
  const [, startTransition] = useTransition();
  const {
    id: uploadedFileId,
    displayName,
    createdAt,
    status,
    clips,
    enqueueRequestedAt,
    queuedAt,
    processingStartedAt,
    terminalStatusAt,
    failureCode,
    targetClipCount,
  } = uploadedFileData;
  const statusConfig = STATUS_CONFIG[status];

  useEffect(() => {
    if (!isActiveProcessingStatus(status)) {
      return;
    }

    const intervalId = window.setInterval(() => {
      startTransition(() => {
        router.refresh();
      });
    }, 7_500);

    return () => window.clearInterval(intervalId);
  }, [router, startTransition, status]);

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
            <Badge variant={statusConfig.variant}>{statusConfig.label}</Badge>
          </div>
        </div>
        <UploadedFileActions uploadedFileId={uploadedFileId} status={status} />
      </header>

      <section className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-1">
          <CardHeader>
            <CardTitle>Summary</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4 text-sm">
            <div className="flex justify-between">
              <span className="text-muted-foreground">Visible clips</span>
              <span className="font-medium">{clips.length}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Target clip count</span>
              <span className="font-medium">{targetClipCount}</span>
            </div>
          </CardContent>
        </Card>

        <OriginalMediaCard
          uploadedFileId={uploadedFileId}
          displayName={displayName}
          status={status}
        />

        <Card className="lg:col-span-1">
          <CardHeader>
            <CardTitle>Processing timeline</CardTitle>
          </CardHeader>
          <CardContent>
            <ProcessingTimeline
              status={status}
              enqueueRequestedAt={enqueueRequestedAt}
              queuedAt={queuedAt}
              processingStartedAt={processingStartedAt}
              terminalStatusAt={terminalStatusAt}
              failureCode={failureCode}
            />
          </CardContent>
        </Card>
      </section>

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
            fallback={<p className="text-muted-foreground">Loading clips...</p>}
          >
            {clips.length > 0 ? (
              <ClipDisplay clips={clips} allowDelete={false} />
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
