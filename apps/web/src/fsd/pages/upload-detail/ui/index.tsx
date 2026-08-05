"use client";

import { Suspense, useEffect, useRef } from "react";
import {
  isPartialClipResultCode,
  PARTIAL_CLIPS_INSUFFICIENT,
} from "~/fsd/entities/uploaded-file/model/clip-generation-outcome";
import type { UploadedFileDetail } from "~/fsd/entities/uploaded-file/model/types";
import { UploadedFileStatusBadge } from "~/fsd/entities/uploaded-file/ui/UploadedFileStatusBadge";
import { UploadedFileActions } from "~/fsd/features/upload";
import { useLiveUploadedFileDetail } from "~/fsd/pages/upload-detail/model/use-live-uploaded-file-detail";
import ProcessingTimeline from "~/fsd/pages/upload-detail/ui/_component/ProcessingTimeline";
import { trackAnalyticsEvent } from "~/fsd/shared/analytics";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "~/fsd/shared/ui/atoms/card";
import { Separator } from "~/fsd/shared/ui/atoms/separator";
import ClipDisplay from "~/fsd/widgets/clip-display/ui";
import ClipDraftReviewSection from "~/fsd/widgets/clip-draft-review/ui";
import OriginalMediaCard from "./_component/OriginalMediaCard";

interface UploadDetailPageProps {
  uploadedFileData: UploadedFileDetail;
}

export default function UploadDetailPage({
  uploadedFileData,
}: UploadDetailPageProps) {
  const trackedDetailViewRef = useRef(false);
  const { data: liveUploadedFileData } =
    useLiveUploadedFileDetail(uploadedFileData);
  const {
    id: uploadedFileId,
    displayName,
    createdAt,
    status,
    clips,
    clipDrafts,
    language,
    enqueueRequestedAt,
    queuedAt,
    processingStartedAt,
    terminalStatusAt,
    reviewReadyAt,
    failureCode,
    targetClipCount,
    currentUserCredits,
  } = liveUploadedFileData;

  useEffect(() => {
    if (trackedDetailViewRef.current) {
      return;
    }

    trackedDetailViewRef.current = true;
    void trackAnalyticsEvent(
      "upload_detail_viewed",
      {
        uploadedFileId,
        status,
        visibleClipsCount: clips.length,
      },
      {
        path: "/dashboard/uploads/[uploadedFileId]",
        dedupeKey: `upload_detail_viewed:${uploadedFileId}`,
      },
    );
  }, [clips.length, status, uploadedFileId]);

  // 검토 단계에서는 검토 섹션이 핵심 작업이므로 요약 카드보다 먼저 배치하고,
  // 이 시점에 항상 비어 있는 Generated clips 섹션은 숨긴다.
  // 두 판정은 함께 바뀌는 "검토 모드 레이아웃" 결정이므로 나란히 명명해 둔다.
  const isUnderReview = status === "review_pending" && clipDrafts.length > 0;
  const showGeneratedClips = status !== "review_pending" || clips.length > 0;

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
            <UploadedFileStatusBadge status={status} />
          </div>
        </div>
        <UploadedFileActions
          uploadedFileId={uploadedFileId}
          status={status}
          currentUserCredits={currentUserCredits}
        />
      </header>

      {status === "processed" && isPartialClipResultCode(failureCode) && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">
              {failureCode === PARTIAL_CLIPS_INSUFFICIENT
                ? "Fewer clips than requested"
                : "Processing stopped before all clips were done"}
            </CardTitle>
          </CardHeader>
          <CardContent className="text-sm text-muted-foreground">
            {failureCode === PARTIAL_CLIPS_INSUFFICIENT
              ? "Processing finished without an error but produced fewer clips than requested. Reprocessing costs credits again and may return the same result."
              : "The clips below finished before processing failed. Reprocessing may produce more clips and will cost credits again."}
          </CardContent>
        </Card>
      )}

      {isUnderReview && (
        <ClipDraftReviewSection
          uploadedFileId={uploadedFileId}
          clipDrafts={clipDrafts}
          targetClipCount={targetClipCount}
          currentUserCredits={currentUserCredits}
          language={language}
        />
      )}

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
              reviewReadyAt={reviewReadyAt}
              failureCode={failureCode}
            />
          </CardContent>
        </Card>
      </section>

      {showGeneratedClips && (
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
              fallback={
                <p className="text-muted-foreground">Loading clips...</p>
              }
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
      )}
    </div>
  );
}
