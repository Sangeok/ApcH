"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import type { ClipDraft } from "generated/prisma";
import { getOriginalPlayUrl } from "~/fsd/features/upload/api";
import { usePlayUrl } from "~/fsd/shared/lib/use-play-url";
import { trackAnalyticsEvent } from "~/fsd/shared/analytics";
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
import {
  getOverlappingDraftIds,
  getSelectionBudget,
  type SelectionBudget,
} from "../model/selection-budget";
import {
  REVIEW_ANALYTICS_PATH,
  useClipDraftReview,
} from "../model/use-clip-draft-review";
import AddCustomClipPanel from "./_component/AddCustomClipPanel";
import ClipDraftCard from "./_component/ClipDraftCard";

interface ClipDraftReviewSectionProps {
  uploadedFileId: string;
  clipDrafts: ClipDraft[];
  targetClipCount: number;
  currentUserCredits: number;
  language: string;
}

// 차단 사유의 종류. 사유별 후속 UI(빌링 링크)와 계측 메타데이터(reason)가
// 같은 값을 쓰도록 한 곳에서 정의하고 export한다 — 계측 쪽이 문자열을
// 다시 쓰지 않고 이 타입을 참조하게 해서 주석이 아니라 컴파일러가 묶는다.
export type BlockKind = "empty" | "credits" | "limit" | "overlap";

// 서버 액션 confirmClipDraftsAndGenerate의 가드와 동일한 규칙의 클라이언트 미러.
// 순서도 서버와 같다: 0개 → 상한 → 크레딧 → 겹침.
//
// 크레딧은 budget에 들어 있지 않다. 선택을 제한하지 않고 생성만 막기 때문이다
// (selection-budget.ts 주석 참고). 그래서 인자로 따로 받는다.
function getGenerateBlockReason({
  budget,
  currentUserCredits,
  overlappingCount,
}: {
  budget: SelectionBudget;
  currentUserCredits: number;
  overlappingCount: number;
}): { message: string; kind: BlockKind } | null {
  if (budget.selectedCount === 0) {
    return { message: "Select at least one clip to generate.", kind: "empty" };
  }
  // 예산 UI가 입력 단계에서 막으므로 정상 조작으로는 도달하지 않지만,
  // 낙관적 갱신 도중의 과도 상태를 위해 사유는 남겨둔다.
  if (budget.selectedCount > budget.limit) {
    return {
      message: `You can generate up to ${budget.limit} clips for this upload.`,
      kind: "limit",
    };
  }
  // 크레딧 부족은 정상 경로에서 도달한다 — 검토 화면은 목표 개수만큼 미리
  // 선택된 채로 열리므로, 크레딧이 목표보다 적은 사용자는 첫 렌더부터 이 사유를 본다.
  if (currentUserCredits < budget.selectedCount) {
    return {
      message: `Not enough credits — need ${budget.selectedCount}, you have ${currentUserCredits}.`,
      kind: "credits",
    };
  }
  if (overlappingCount > 0) {
    return {
      message: `${overlappingCount} selected clips overlap. Adjust the highlighted ranges.`,
      kind: "overlap",
    };
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
  // 검토 화면 진입 1회 계측. upload_detail_viewed(pages/upload-detail/ui/index.tsx)와
  // 동일하게 ref로 중복 발화를 막는다.
  const trackedOpenRef = useRef(false);
  const {
    transcriptWords,
    saveDraft,
    applyStyleToAll,
    confirmAndGenerate,
    addCustomClip,
    selectUpToBudget,
    deselectAll,
    isConfirming,
    isApplyingToAll,
    isAddingCustom,
    isSavingDraft,
    isSettingSelection,
  } = useClipDraftReview(uploadedFileId, clipDrafts, { targetClipCount });

  const selectedDrafts = useMemo(
    () => clipDrafts.filter((draft) => draft.selected),
    [clipDrafts],
  );

  const budget = useMemo(
    () => getSelectionBudget({ clipDrafts, targetClipCount }),
    [clipDrafts, targetClipCount],
  );

  // 헤더 카운트·클립 명사·확인 다이얼로그가 이 이름을 그대로 쓴다.
  // budget에서 파생시켜 같은 값이 두 경로로 계산되지 않게 한다.
  const selectedCount = budget.selectedCount;

  // 겹침 판정을 id 집합으로 받아 어떤 카드가 겹치는지 표시할 수 있게 한다.
  // getOverlappingDraftIds는 selected를 읽지 않으므로 선택된 것만 넘긴다.
  const overlappingDraftIds = useMemo(
    () => getOverlappingDraftIds(selectedDrafts),
    [selectedDrafts],
  );

  const generateBlockReason = getGenerateBlockReason({
    budget,
    currentUserCredits,
    overlappingCount: overlappingDraftIds.size,
  });

  const canGenerate = !isConfirming && generateBlockReason === null;

  useEffect(() => {
    if (trackedOpenRef.current) {
      return;
    }

    trackedOpenRef.current = true;

    void trackAnalyticsEvent(
      "clip_review_opened",
      {
        uploadedFileId,
        draftCount: clipDrafts.length,
        // 선택 상한. 예산 모듈(Phase 2) 도입 후에도 값은 동일하다.
        budgetLimit: targetClipCount,
        credits: currentUserCredits,
      },
      {
        path: REVIEW_ANALYTICS_PATH,
        dedupeKey: `clip_review_opened:${uploadedFileId}`,
      },
    );
  }, [uploadedFileId, clipDrafts.length, targetClipCount, currentUserCredits]);

  // 사유별로 "이 사용자가 이 벽에 부딪혔는가"를 1회 기록한다.
  //
  // ⚠️ dedupeKey의 수명: sentDedupeKeys는 모듈 스코프 Set이고 비워지지 않는다
  //    (shared/analytics/lib/track-event.ts). 즉 같은 키는 페이지 세션 동안
  //    영구히 1회만 나간다 — 사유가 해소됐다가 다시 걸려도 재발화하지 않는다.
  //    여기서는 그게 의도다(도달 여부가 지표, 횟수가 아님).
  useEffect(() => {
    if (!generateBlockReason) {
      return;
    }

    void trackAnalyticsEvent(
      "clip_review_generate_blocked",
      {
        uploadedFileId,
        reason: generateBlockReason.kind,
        selectedCount: budget.selectedCount,
      },
      {
        path: REVIEW_ANALYTICS_PATH,
        dedupeKey: `clip_review_generate_blocked:${uploadedFileId}:${generateBlockReason.kind}`,
      },
    );
    // generateBlockReason 객체는 매 렌더 새로 생성되므로 객체가 아니라 kind에
    // 의존한다. selectedCount는 페이로드에 실리므로 함께 둔다 — 이 값 때문에
    // 이펙트가 자주 재실행되지만, 실제 전송은 dedupeKey가 1회로 막는다.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [uploadedFileId, generateBlockReason?.kind, budget.selectedCount]);

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
          {/* 화면은 목표 개수만큼 이미 선택된 채로 열린다(inngest/functions.ts).
              즉 첫 렌더의 기본 상태가 remaining === 0이므로, 이 문구는 오류가
              아니라 정상 상태를 설명해야 한다 — "다 썼다"가 아니라 "교체하라". */}
          <p className="text-muted-foreground mt-1 text-xs">
            {budget.remaining > 0
              ? `${budget.selectedCount} of ${budget.limit} picked. ${budget.remaining} left.`
              : `${budget.limit} of ${budget.limit} picked — swap one out to change your pick.`}
            {` Each clip uses 1 credit; you have ${currentUserCredits}.`}
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
            <div className="max-w-[260px] text-right">
              <p className="text-destructive text-xs">
                {generateBlockReason.message}
              </p>
              {/* 크레딧 부족은 유일하게 사용자가 스스로 풀 수 있는 사유다.
                  사유만 알리고 경로를 안 주면 여기서 막다른 길이 된다. */}
              {generateBlockReason.kind === "credits" && (
                <Link
                  href="/dashboard/billing"
                  className="text-primary text-xs underline underline-offset-2"
                >
                  Buy credits
                </Link>
              )}
            </div>
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
            {/* draft는 항상 목표의 2배라 "전체 선택"은 성립하지 않는다.
                예산만큼만 랭킹 상위에서 채운다. */}
            <Button
              type="button"
              size="sm"
              variant="ghost"
              disabled={isSettingSelection || budget.isFull}
              onClick={() => selectUpToBudget(budget.limit)}
            >
              Fill {budget.limit} slots
            </Button>
            <Button
              type="button"
              size="sm"
              variant="ghost"
              disabled={isSettingSelection || budget.selectedCount === 0}
              onClick={() => deselectAll()}
            >
              Clear selection
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
              isOverlapping={overlappingDraftIds.has(draft.id)}
              isBudgetFull={budget.isFull}
            />
          ))}
        </div>
      </div>
    </section>
  );
}
