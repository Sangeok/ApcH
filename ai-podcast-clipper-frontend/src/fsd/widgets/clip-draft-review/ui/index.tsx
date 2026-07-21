"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { ClipDraft } from "generated/prisma";
import { getOriginalPlayUrl } from "~/fsd/features/upload/api";
import { usePlayUrl } from "~/fsd/shared/lib/use-play-url";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "~/fsd/shared/ui/atoms/alert-dialog";
import { Button } from "~/fsd/shared/ui/atoms/button";
import type { ClipRange } from "../model/use-clip-draft-review";
import { useClipDraftReview } from "../model/use-clip-draft-review";
import AddCustomClipPanel from "./_component/AddCustomClipPanel";
import ClipDraftCard from "./_component/ClipDraftCard";

interface ClipDraftReviewSectionProps {
  uploadedFileId: string;
  clipDrafts: ClipDraft[];
  targetClipCount: number;
  currentUserCredits: number;
  language: string;
}

// 서버 액션 confirmClipDraftsAndGenerate의 가드(선택 1개 이상, 목표 개수 이하,
// 크레딧 충분, 구간 비겹침)와 동일한 규칙의 클라이언트 미러.
// 위에서부터 첫 번째로 걸리는 사유 하나만 반환한다.
function getGenerateBlockReason({
  selectedCount,
  targetClipCount,
  currentUserCredits,
  hasOverlap,
}: {
  selectedCount: number;
  targetClipCount: number;
  currentUserCredits: number;
  hasOverlap: boolean;
}): string | null {
  if (selectedCount === 0) {
    return "Select at least one clip to generate.";
  }
  if (selectedCount > targetClipCount) {
    return `You can generate up to ${targetClipCount} clips for this upload.`;
  }
  if (currentUserCredits < selectedCount) {
    return `Not enough credits — need ${selectedCount}, you have ${currentUserCredits}.`;
  }
  if (hasOverlap) {
    return "Selected clips must not overlap.";
  }
  return null;
}

export default function ClipDraftReviewSection({
  uploadedFileId,
  clipDrafts,
  targetClipCount,
  currentUserCredits,
  language,
}: ClipDraftReviewSectionProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const { playUrl } = usePlayUrl(uploadedFileId, getOriginalPlayUrl);
  const [activeDraftId, setActiveDraftId] = useState<string | null>(null);
  // 프리뷰 종료 시각. ref로 두어 timeupdate 리스너를 재구독 없이 유지한다.
  const previewEndRef = useRef<number | null>(null);
  const {
    transcriptWords,
    saveDraft,
    applyStyleToAll,
    confirmAndGenerate,
    addCustomClip,
    selectAll,
    deselectAll,
    isConfirming,
    isApplyingToAll,
    isAddingCustom,
    isSavingDraft,
    isSettingSelection,
  } = useClipDraftReview(uploadedFileId, clipDrafts);

  const selectedDrafts = useMemo(
    () => clipDrafts.filter((draft) => draft.selected),
    [clipDrafts],
  );
  const selectedCount = selectedDrafts.length;

  // 겹침 규칙의 원본은 3곳이 함께 바뀌어야 한다: 백엔드 identify_moments의
  // non-overlap 제약 → 서버 가드(features/upload/api/index.ts:447-454) → 이 미러.
  const hasOverlap = useMemo(() => {
    const sorted = [...selectedDrafts].sort(
      (a, b) => a.startSeconds - b.startSeconds,
    );
    return sorted.some(
      (draft, index) =>
        index > 0 && draft.startSeconds < sorted[index - 1]!.endSeconds,
    );
  }, [selectedDrafts]);

  const generateBlockReason = getGenerateBlockReason({
    selectedCount,
    targetClipCount,
    currentUserCredits,
    hasOverlap,
  });

  const canGenerate = !isConfirming && generateBlockReason === null;

  const handlePreview = (draftId: string, range: ClipRange) => {
    setActiveDraftId(draftId);
    const video = videoRef.current;
    if (!video) return;
    previewEndRef.current = range.endSeconds;
    video.currentTime = range.startSeconds;
    void video.play();
  };

  // 프리뷰 구간의 끝에서 재생을 멈춘다. timeupdate 주기(~250ms)만큼
  // 오버슛할 수 있다.
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    const handleTimeUpdate = () => {
      const end = previewEndRef.current;
      if (end !== null && video.currentTime >= end) {
        video.pause();
        previewEndRef.current = null;
      }
    };

    video.addEventListener("timeupdate", handleTimeUpdate);
    return () => video.removeEventListener("timeupdate", handleTimeUpdate);
  }, [playUrl]);

  const clipNoun = selectedCount === 1 ? "clip" : "clips";
  const creditNoun = selectedCount === 1 ? "credit" : "credits";

  return (
    <section className="bg-card rounded-xl border">
      <div className="flex flex-wrap items-start justify-between gap-4 border-b px-6 py-4">
        <div>
          <p className="text-muted-foreground text-sm">Review clip plan</p>
          <h2 className="text-xl font-semibold">
            {selectedCount} of {clipDrafts.length} moments selected
          </h2>
          <p className="text-muted-foreground mt-1 text-xs">
            Pick up to {targetClipCount} moments, fine-tune each range, then
            generate. Each generated clip uses 1 credit — you have{" "}
            {currentUserCredits}.
          </p>
        </div>
        <div className="flex flex-col items-end gap-1">
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button disabled={!canGenerate}>
                Generate {selectedCount} {clipNoun} · {selectedCount}{" "}
                {creditNoun}
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>
                  Generate {selectedCount} {clipNoun}?
                </AlertDialogTitle>
                <AlertDialogDescription>
                  This will render the {selectedCount} selected {clipNoun} and
                  use up to {selectedCount} of your {currentUserCredits}{" "}
                  {creditNoun}. The review step closes once rendering starts.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel asChild>
                  <Button variant="outline">Cancel</Button>
                </AlertDialogCancel>
                <AlertDialogAction asChild>
                  <Button
                    disabled={isSavingDraft}
                    onClick={() => confirmAndGenerate()}
                  >
                    Start generating
                  </Button>
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
          {generateBlockReason && (
            <p className="text-destructive max-w-[260px] text-right text-xs">
              {generateBlockReason}
            </p>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 gap-6 px-6 py-6 lg:grid-cols-2">
        <div className="overflow-hidden rounded-xl bg-black">
          {playUrl && (
            <video
              ref={videoRef}
              src={playUrl}
              controls
              preload="metadata"
              className="w-full rounded-md object-cover"
            />
          )}
        </div>

        <div className="flex max-h-[560px] flex-col gap-4 overflow-y-auto">
          <div className="flex items-center justify-end gap-2">
            <Button
              type="button"
              size="sm"
              variant="ghost"
              disabled={isSettingSelection}
              onClick={() => selectAll()}
            >
              Select all
            </Button>
            <Button
              type="button"
              size="sm"
              variant="ghost"
              disabled={isSettingSelection}
              onClick={() => deselectAll()}
            >
              Deselect all
            </Button>
          </div>
          <AddCustomClipPanel
            transcriptWords={transcriptWords}
            onAdd={addCustomClip}
            isAdding={isAddingCustom}
          />
          {clipDrafts.map((draft) => (
            <ClipDraftCard
              key={draft.id}
              draft={draft}
              isActive={draft.id === activeDraftId}
              language={language}
              transcriptWords={transcriptWords}
              onPreview={(range) => handlePreview(draft.id, range)}
              onSave={saveDraft}
              onApplyToAll={applyStyleToAll}
              isApplyingToAll={isApplyingToAll}
            />
          ))}
        </div>
      </div>
    </section>
  );
}
