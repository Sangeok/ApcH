// src/app/dashboard/uploads/[uploadedFileId]/page.tsx
import { notFound } from "next/navigation";
import { Suspense } from "react";
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
import { getUploadedFileDetails } from "~/actions/uploaded-files";
import ProcessingTimeline from "~/fsd/features/processing-timeline";

interface UploadDetailPageProps {
  params: { uploadedFileId: string };
}

export default async function UploadDetailPage({
  params,
}: UploadDetailPageProps) {
  const data = await getUploadedFileDetails(params.uploadedFileId);
  if (!data) {
    notFound();
  }

  const { id, displayName, createdAt, updatedAt, status, clips } = data;

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-6 px-4 py-8">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-muted-foreground text-sm">Upload detail</p>
          <h1 className="text-3xl font-semibold tracking-tight">
            {displayName}
          </h1>
          <div className="text-muted-foreground mt-2 flex items-center gap-2 text-sm">
            <span>{new Date(createdAt).toLocaleString()}</span>
            <Separator orientation="vertical" className="h-4" />
            <Badge variant="outline">{status}</Badge>
          </div>
        </div>
        <UploadedFileActions uploadedFileId={id} hasClips={clips.length > 0} />
      </header>

      <section className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <Card>
          <CardHeader>
            <CardTitle>Summary</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4 text-sm">
            <div className="flex justify-between">
              <span className="text-muted-foreground">Clips generated</span>
              <span className="font-medium">{clips.length}</span>
            </div>
            {/* <div className="flex justify-between">
              <span className="text-muted-foreground">Duration</span>
              <span className="font-medium">{duration ?? "—"}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Size</span>
              <span className="font-medium">
                {sizeLabel ?? "—"}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">S3 Key</span>
              <span className="truncate font-medium" title={s3Key}>
                {s3Key}
              </span>
            </div> */}
          </CardContent>
        </Card>

        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>Processing timeline</CardTitle>
          </CardHeader>
          <CardContent>
            <ProcessingTimeline
              status={
                status as "queued" | "processing" | "processed" | "failed"
              }
              createdAt={new Date(createdAt)}
              updatedAt={new Date(updatedAt)}
              //   logs={processingLogs}
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
            fallback={<p className="text-muted-foreground">Loading clips…</p>}
          >
            {clips.length > 0 ? (
              <ClipDisplay clips={clips} />
            ) : (
              <p className="text-muted-foreground text-center">
                클립이 생성되지 않았습니다.
              </p>
            )}
          </Suspense>
        </div>
      </section>
    </div>
  );
}
