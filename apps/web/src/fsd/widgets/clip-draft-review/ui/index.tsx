"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import type { ClipDraft } from "@repo/db";
import { getOriginalPlayUrl } from "~/fsd/features/upload/api";
import { usePlayUrl } from "~/fsd/shared/lib/use-play-url";
import { trackAnalyticsEvent } from "~/fsd/shared/analytics";
import { cn } from "~/fsd/shared/lib/utils";
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
          {/* Before의 제목은 "4 of 7 moments selected"인데 바로 아래 안내는
              "4 of 4 picked"였다 — 같은 분자에 분모가 둘이라 어느 쪽이 예산인지
              읽히지 않는다. 제목은 예산(분모 = limit)만 말하고, 후보 개수는
              아래 설명 문장으로 내린다. */}
          <div className="mt-1 flex flex-wrap items-center gap-3">
            <h2 className="text-xl font-semibold">
              {selectedCount} of {budget.limit} clips picked
            </h2>
            {/* 예산은 이 화면의 핵심 규칙인데 지금까지 12px 회색 산문에만
                있었다. 개수를 개수로 보여준다. 같은 사실을 h2가 이미 말하므로
                스크린리더에는 중복이라 숨긴다. */}
            <div aria-hidden="true" className="flex items-center gap-1.5">
              {Array.from({ length: budget.limit }, (_, slot) => (
                <span
                  key={slot}
                  className={cn(
                    "h-2 w-8 rounded-full",
                    // 빈 칸도 같은 색의 옅은 톤으로 채운다 — "여기가 채워질
                    // 자리"임이 색으로 드러난다.
                    // 테두리(ring-border)만 남기는 안은 실패했다: --border가
                    // oklch(0.922)라 1px ring으로는 흰 배경에서 사실상 안 보여,
                    // 레일이 채워졌을 때만 존재하고 비면 사라졌다. 그러면
                    // "N칸 중 몇 칸"이라는 예산의 형태가 전달되지 않는다.
                    slot < budget.selectedCount ? "bg-picked" : "bg-picked/25",
                  )}
                />
              ))}
            </div>
          </div>
          {/* 화면은 목표 개수만큼 이미 선택된 채로 열린다(inngest/functions.ts).
              즉 첫 렌더의 기본 상태가 remaining === 0이므로, 이 문구는 오류가
              아니라 정상 상태를 설명해야 한다 — "다 썼다"가 아니라 "교체하라". */}
          <p className="text-muted-foreground mt-1 text-xs">
            {`${clipDrafts.length} moments suggested. `}
            {budget.remaining > 0
              ? `${budget.remaining} slot${budget.remaining === 1 ? "" : "s"} left. `
              : "Swap one out to change your pick. "}
            {`Each clip uses 1 credit; you have ${currentUserCredits}.`}
          </p>
          {/* 예산을 바꾸는 버튼이므로 예산 표시 옆에 둔다. 카드 목록 안에 두면
              목록을 스크롤하는 순간 함께 화면 밖으로 나간다.
              draft 개수는 목표와 무관하다 — 백엔드는 2배를 "요청"할 뿐이고
              (main.py:904 "Return exactly TARGET_COUNT moments if possible")
              강제 장치가 없어 목표보다 많이도, 적게도 온다. 그래서 상한을
              넘길 수 있는 "전체 선택" 대신 예산만큼만 랭킹 상위에서 채운다.
              slice(0, limit)은 draft가 상한보다 적어도 그대로 동작한다. */}
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <Button
              type="button"
              size="sm"
              variant="outline"
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
        </div>
        <div className="flex flex-col items-end gap-1">
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button disabled={!canGenerate}>
                {/* 0개일 때 "Generate 0 clips · 0 credits"는 셀 것이 없는데
                    세고 있다. 개수는 고른 게 있을 때만 말한다. */}
                {selectedCount === 0
                  ? "Generate clips"
                  : `Generate ${selectedCount} ${clipNoun} · ${selectedCount} ${creditNoun}`}
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
              {/* "0개 선택"만 오류색을 쓰지 않는다. 나머지 3종(상한·크레딧·
                  겹침)은 사용자가 고쳐야 할 문제지만, 빈 선택은 방금 Clear
                  selection을 누른 정상 상태다. 의도한 조작에 경고색으로
                  답하면 안 된다. */}
              <p
                className={cn(
                  "text-xs",
                  generateBlockReason.kind === "empty"
                    ? "text-muted-foreground"
                    : "text-destructive",
                )}
              >
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

      {/* 플레이어는 참조물이고 후보 목록이 주역이므로 비대칭으로 나눈다.
          50/50이면 16:9 플레이어(약 250px)가 목록 높이를 따라가지 못해
          왼쪽 컬럼 아래가 통째로 빈다. */}
      <div className="grid grid-cols-1 gap-6 px-6 py-6 lg:grid-cols-[minmax(0,360px)_1fr]">
        {/* 이 컬럼은 플레이어(약 200px) 하나만 담는데 오른쪽 목록은 1800px가
            넘어서, 아래로 큰 여백이 남는다. 360px 컬럼에 무엇을 쌓아도 채울 수
            있는 크기가 아니다. 그리고 이 여백은 "긴 목록을 훑는 동안 플레이어가
            계속 보여야 한다"(카드의 Preview가 여기서 재생된다)의 대가라,
            없애려면 그 기능을 깎아야 한다.
            그래서 채우지 않고 면으로 정의한다 — 배경이 있는 패널 안에 놓이면
            같은 여백이 "빈 페이지"가 아니라 "프리뷰 패널"로 읽힌다.
            면이 생기려면 바깥이 stretch로 늘어나야 하므로 self-start를 쓸 수
            없다. sticky는 안쪽으로 옮긴다: 패널이 전체 높이를 차지하고 플레이어는
            그 안에서 스크롤을 따라온다. */}
        <div className="bg-muted/40 rounded-xl p-3">
          {/* top-20 = 대시보드 헤더(sticky top-0, h-16 = 4rem) + 1rem 여백.
              top-6으로 두면 스크롤 시 플레이어가 헤더 뒤로 들어간다. */}
          <div className="lg:sticky lg:top-20">
            <div className="overflow-hidden rounded-lg bg-black">
              {playUrl && (
                <video
                  ref={videoRef}
                  src={playUrl}
                  controls
                  preload="metadata"
                  className="w-full"
                />
              )}
            </div>
            {/* 최종 산출물이 세로 영상이라는 사실은 지금까지 CaptionStyleEditor
              안에만 있었는데, 그 패널은 카드마다 접혀 있어(styleOpen 기본 false)
              사실상 노출되지 않았다. 크레딧을 쓰기 직전 가장 큰 시각 요소가
              가로 플레이어이므로 그 바로 아래에 상시 표기한다.
              크롭 가이드를 그리지는 않는다 — 화자 트래킹 결과는 렌더 중에
              생성되어 검토 시점에 존재하지 않으므로 실제와 다른 정보가 된다. */}
            <p className="text-muted-foreground mt-2 text-xs">
              Source video. Each clip is cropped to vertical (9:16) and follows
              whoever is speaking.
            </p>
          </div>
        </div>

        <div className="flex flex-col gap-4">
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
