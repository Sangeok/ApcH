"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { ClipDraft } from "@repo/db";
import { cn } from "~/fsd/shared/lib/utils";
import { Button } from "~/fsd/shared/ui/atoms/button";
import {
  CAPTION_STYLE_OPTIONS,
  CLIP_DURATION_LIMITS,
  type CaptionStyle,
} from "~/fsd/shared/config/constants";
import type {
  ClipRange,
  SaveDraftInput,
  TranscriptWord,
} from "../../model/use-clip-draft-review";
import CaptionStyleDialog from "./CaptionStyleDialog";

const STEP_SECONDS = 0.5;
const AUTO_SAVE_DEBOUNCE_MS = 600;

// 백엔드 프롬프트가 열거하는 값은 둘뿐이다
// (main.py:899 `"type": <"qa" | "insight">`).
// CSS capitalize로는 qa가 "Qa"가 되어 오히려 틀린 표기가 되므로 매핑한다.
// 다만 프롬프트의 요청일 뿐 강제 장치가 없어 다른 값이 올 수 있으니,
// 매핑에 없으면 원본을 그대로 보여준다(빈 칸으로 삼키지 않는다).
const CLIP_TYPE_LABELS: Record<string, string> = {
  qa: "Q&A",
  insight: "Insight",
};

// draft.captionStyle(Prisma JsonValue) → shared CaptionStyle 강제 변환의 단일 지점.
// 필드가 늘기 전에 저장된 행에는 신규 키가 없다. 그대로 다이얼로그에 넣으면
// 아무것도 고치지 않고 Apply 했을 때 zod(required-but-nullable)가 거부하므로
// 누락 키를 null(= 백엔드 언어별 기본값)로 채운다.
function toCaptionStyle(raw: ClipDraft["captionStyle"]): CaptionStyle | null {
  if (raw === null || raw === undefined) return null;
  // Partial로 받는다 — 저장된 행에 신규 키가 없을 수 있다는 사실을 타입에도
  // 남겨야 아래 기본값이 죽은 코드로 취급되지 않는다.
  const stored = raw as Partial<CaptionStyle>;
  return {
    position: stored.position ?? CAPTION_STYLE_OPTIONS.DEFAULT_POSITION,
    fontSize: stored.fontSize ?? null,
    color: stored.color ?? null,
    maxWordsPerLine: stored.maxWordsPerLine ?? null,
    outlineColor: stored.outlineColor ?? null,
    outlineWidth: stored.outlineWidth ?? null,
    uppercase: stored.uppercase ?? null,
  };
}

interface ClipDraftCardProps {
  draft: ClipDraft;
  isActive: boolean;
  language: string;
  transcriptWords: TranscriptWord[];
  onPreview: (range: ClipRange) => void;
  onSave: (input: SaveDraftInput) => Promise<void>;
  onApplyToAll: (style: CaptionStyle) => void;
  isApplyingToAll: boolean;
  isOverlapping: boolean;
  isBudgetFull: boolean;
}

function roundTenth(value: number): number {
  return Math.round(value * 10) / 10;
}

function formatTime(seconds: number): string {
  const safe = Math.max(0, seconds);
  const minutes = Math.floor(safe / 60);
  const rest = safe - minutes * 60;
  return `${minutes}:${rest.toFixed(1).padStart(4, "0")}`;
}

function nearestBoundary(value: number, boundaries: number[]): number {
  if (boundaries.length === 0) {
    return value;
  }

  let best = boundaries[0]!;
  let bestDistance = Math.abs(best - value);

  for (const boundary of boundaries) {
    const distance = Math.abs(boundary - value);
    if (distance < bestDistance) {
      bestDistance = distance;
      best = boundary;
    }
  }

  return best;
}

export default function ClipDraftCard({
  draft,
  isActive,
  language,
  transcriptWords,
  onPreview,
  onSave,
  onApplyToAll,
  isApplyingToAll,
  isOverlapping,
  isBudgetFull,
}: ClipDraftCardProps) {
  // 구간·스타일은 사용자가 편집 중인 값이라 로컬 state로 두지만, 선택 여부는
  // detail 캐시(draft.selected)에서 직접 읽는다. 로컬로 복사하면 위젯 헤더의
  // Select all/Deselect all이 캐시만 갱신하고 카드 체크박스는 그대로 남는다.
  const [startSeconds, setStartSeconds] = useState<number>(draft.startSeconds);
  const [endSeconds, setEndSeconds] = useState<number>(draft.endSeconds);
  // 캡션 스타일은 로컬 state로 두지 않는다. 편집은 다이얼로그의 작업본에서만
  // 일어나고 Apply가 곧바로 저장하므로, 구간 자동 저장은 스타일을 건드리지 않는다
  // (captionStyle: undefined = 변경 없음).
  const [styleOpen, setStyleOpen] = useState<boolean>(false);
  const [isSaving, setIsSaving] = useState<boolean>(false);
  const skipInitialAutoSaveRef = useRef(true);
  const autoSaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const duration = roundTenth(endSeconds - startSeconds);
  const withinLimits =
    duration >= CLIP_DURATION_LIMITS.MIN_SECONDS &&
    duration <= CLIP_DURATION_LIMITS.MAX_SECONDS;

  const wordsInRange = useMemo(
    () =>
      transcriptWords.filter(
        (word) => word.start >= startSeconds && word.end <= endSeconds,
      ),
    [transcriptWords, startSeconds, endSeconds],
  );

  const previewText = wordsInRange.map((word) => word.word).join(" ");

  const adjustStart = (delta: number) => {
    const next = nearestBoundary(
      roundTenth(startSeconds + delta),
      transcriptWords.map((word) => word.start),
    );
    setStartSeconds(Math.max(0, roundTenth(next)));
  };

  const adjustEnd = (delta: number) => {
    const next = nearestBoundary(
      roundTenth(endSeconds + delta),
      transcriptWords.map((word) => word.end),
    );
    setEndSeconds(Math.max(0, roundTenth(next)));
  };

  const resetToAi = () => {
    setStartSeconds(draft.aiStartSeconds);
    setEndSeconds(draft.aiEndSeconds);
  };

  const runSave = async (input: SaveDraftInput) => {
    setIsSaving(true);
    try {
      await onSave(input);
    } catch {
      // 실패 토스트와 캐시 롤백은 saveMutation onError가 처리한다.
      // 로컬 편집값은 유지되어 다음 변경 시 다시 저장을 시도한다.
    } finally {
      setIsSaving(false);
    }
  };

  const clearPendingAutoSave = () => {
    if (autoSaveTimerRef.current) {
      clearTimeout(autoSaveTimerRef.current);
      autoSaveTimerRef.current = null;
    }
  };

  // 구간 변경의 디바운스 자동 저장. 길이 제한 밖 값은 서버 가드와
  // 동일하게 저장하지 않으며, 제한 안으로 돌아오면 그때 저장된다.
  useEffect(() => {
    if (skipInitialAutoSaveRef.current) {
      skipInitialAutoSaveRef.current = false;
      return;
    }
    if (!withinLimits) return;

    clearPendingAutoSave();
    autoSaveTimerRef.current = setTimeout(() => {
      autoSaveTimerRef.current = null;
      void runSave({
        clipDraftId: draft.id,
        startSeconds,
        endSeconds,
        selected: draft.selected,
        // 스타일은 다이얼로그 Apply만 저장한다. 여기서 값을 실으면 다른
        // 카드의 Apply to all 결과를 오래된 값으로 덮을 수 있다.
        captionStyle: undefined,
      });
    }, AUTO_SAVE_DEBOUNCE_MS);

    return clearPendingAutoSave;
    // 의존성 제외는 전부 의도적이다:
    // - draft.selected: handleSelectedChange가 타이머를 취소하고 즉시 저장하는
    //   별도 경로다. 여기 포함하면 토글마다 디바운스 저장이 중복 발화하고,
    //   Select all/Deselect all이 모든 카드에서 중복 저장을 유발한다.
    // - withinLimits/runSave/clearPendingAutoSave: 렌더마다 재생성되는 파생값/
    //   함수로, 타이머는 이펙트 생성 시점 렌더의 최신 값을 캡처하면 충분하다.
    // 이 배열에 값을 추가하는 "lint 경고 수정"은 stale-타이머 경합을 되살린다.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [startSeconds, endSeconds]);

  // 선택 여부는 디바운스 없이 즉시 저장한다. 현재 구간이 길이 제한 밖이라
  // 저장 불가능하면, 마지막으로 저장된 서버 구간을 유지한 채 선택만 반영한다.
  // 체크박스 표시는 saveMutation onMutate의 낙관적 갱신이 담당하므로 여기서
  // 로컬 state를 따로 두지 않는다(실패 시 롤백도 그대로 화면에 반영된다).
  const handleSelectedChange = (nextSelected: boolean) => {
    clearPendingAutoSave();
    void runSave({
      clipDraftId: draft.id,
      startSeconds: withinLimits ? startSeconds : draft.startSeconds,
      endSeconds: withinLimits ? endSeconds : draft.endSeconds,
      selected: nextSelected,
      captionStyle: undefined,
    });
  };

  // 다이얼로그 Apply. 구간 자동 저장과 경합하지 않도록 대기 중인 타이머를
  // 취소하고 현재 구간과 함께 한 번에 저장한다.
  const handleApplyStyle = (style: CaptionStyle | null) => {
    clearPendingAutoSave();
    void runSave({
      clipDraftId: draft.id,
      startSeconds: withinLimits ? startSeconds : draft.startSeconds,
      endSeconds: withinLimits ? endSeconds : draft.endSeconds,
      selected: draft.selected,
      captionStyle: style,
    });
  };

  // 예산이 찬 상태에서 아직 선택되지 않은 카드만 잠근다.
  // 이미 선택된 카드는 항상 해제 가능해야 교체가 된다.
  const isBlockedByBudget = isBudgetFull && !draft.selected;

  return (
    <div
      className={cn(
        "rounded-lg border p-4 transition-colors",
        // 3상태를 시각적으로 가른다. Before는 선택 여부를 opacity로만 구분해
        // (1) 고른 카드와 안 고른 카드의 차이가 약했고 (2) 예산 때문에 잠긴
        // 카드가 그냥 안 고른 카드와 똑같아 보였다. 게다가 후보 본문까지
        // 흐려져서 이 화면의 본 과제인 "비교"가 방해받았다.
        // 고른 것을 색으로 올리고, 흐리게 하는 건 잠긴 것에만 남긴다.
        draft.selected && "border-picked bg-picked/5",
        isBlockedByBudget && "border-dashed opacity-60",
        // 겹침은 고쳐야 하는 상태이므로 위 색을 덮는다.
        // cn은 twMerge라 같은 border-color 유틸리티는 뒤가 이긴다.
        isOverlapping && "border-destructive",
        // 프리뷰 재생 중. 선택 여부와 다른 축이라 border가 아니라 ring이다.
        isActive && "ring-primary ring-2",
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <label
          className={cn(
            // min-w-0이 없으면 flex 자식의 기본 min-width:auto 때문에 아래
            // line-clamp가 줄지 않고 카드를 밀어낸다.
            "flex min-w-0 flex-1 items-start gap-2",
            isBlockedByBudget && "cursor-not-allowed",
          )}
        >
          <input
            type="checkbox"
            // accent-color로 네이티브 체크박스에 색을 준다. shadcn Checkbox를
            // 들이면 onChange → onCheckedChange로 저장 경로까지 바뀌므로,
            // 상태 표현은 카드가 담당하게 두고 여기는 색만 맞춘다.
            className="accent-picked mt-1 size-4"
            checked={draft.selected}
            disabled={isBlockedByBudget}
            aria-describedby={
              isBlockedByBudget ? `${draft.id}-budget-hint` : undefined
            }
            onChange={(event) => handleSelectedChange(event.target.checked)}
          />
          <span className="min-w-0">
            {/* 식별 라인. Before는 순위·타입·구간이 hook 아래 배지 3개로
                흩어져 있었고 셋 다 같은 무게라 아무것도 눈에 들어오지 않았다.
                한 줄로 모아 위로 올리고 순위만 강조한다.
                순위는 장식이 아니다 — clipDrafts는 Gemini 랭킹 순으로 오고
                (orderBy index asc) Fill N slots가 상위 N개를 채우므로,
                "AI가 몇 번째로 꼽았는가"는 사용자가 알아야 할 정보다. */}
            <span className="text-muted-foreground flex flex-wrap items-center gap-x-2 gap-y-1 text-xs">
              <span className="text-foreground bg-muted rounded px-1.5 py-0.5 font-semibold tabular-nums">
                #{draft.index + 1}
              </span>
              {draft.clipType && (
                <span>
                  {CLIP_TYPE_LABELS[draft.clipType] ?? draft.clipType}
                </span>
              )}
              <span className="tabular-nums">
                {formatTime(startSeconds)}–{formatTime(endSeconds)}
              </span>
              {/* 길이는 이 한 곳에서만 표시한다. 제한 위반은 색으로 알리고,
                  위반의 결과("저장되지 않음")만 아래에서 문장으로 말한다. */}
              <span
                className={cn(
                  "tabular-nums",
                  !withinLimits && "text-destructive font-medium",
                )}
              >
                {duration.toFixed(1)}s
              </span>
            </span>
            {/* hook은 제목이 아니라 AI가 쓴 문장이라 clamp가 없으면 카드마다
                4줄짜리 볼드 덩어리가 된다. 7개를 비교하는 게 이 화면의 과제라
                카드 높이를 예측 가능하게 묶는다. */}
            {/* ⚠️ line-clamp-*와 block을 같이 쓰면 안 된다. 둘 다 display를
                건드리는데 번들에서 .block{display:block}이 line-clamp의
                display:-webkit-box보다 뒤에 나와 clamp가 통째로 죽는다
                (tailwind-merge도 서로 다른 그룹이라 정리해 주지 않는다).
                아래 payoff가 실제로 그 상태였다 — clamp 2줄로 적혀 있었지만
                화면에는 4줄로 나왔다. -webkit-box가 이미 블록 레벨이라
                block은 없어도 된다. */}
            <span className="mt-1.5 line-clamp-2 text-sm leading-snug font-semibold">
              {draft.hook ?? "Untitled moment"}
            </span>
            {draft.payoff && (
              <span className="text-muted-foreground mt-0.5 line-clamp-2 text-xs leading-snug">
                {draft.payoff}
              </span>
            )}
          </span>
        </label>
        <div className="flex shrink-0 items-center gap-2">
          {isSaving && (
            <span className="text-muted-foreground text-xs">Saving…</span>
          )}
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={() => onPreview({ startSeconds, endSeconds })}
          >
            Preview
          </Button>
        </div>
      </div>

      <div className="mt-3 grid grid-cols-2 gap-3">
        <div>
          {/* 식별 라인이 m:ss 범위를 담당하므로 여기서 되풀이하지 않는다.
              이 필드는 초 단위 편집기이고, 라벨에 단위를 명시해야 위쪽의
              "4:32.9"와 이 입력의 "272.9"가 같은 값의 두 표기가 아니라
              서로 다른 역할로 읽힌다. */}
          <p className="text-muted-foreground mb-1 text-xs font-medium">
            Start (s)
          </p>
          {/* Before는 테두리 있는 박스 3개가 gap으로 떨어져 있어 카드마다
              6개, 목록 전체로 42개의 상자가 깔렸다. 하나의 컨트롤로 묶는다.
              폭은 w-fit + w-24다. 잘림을 고치려고 컬럼 전체(w-full)를 채웠더니
              값 6~7자짜리 입력이 카드에서 가장 큰 요소가 되어, 부차적 컨트롤이
              hook보다 무거워졌다. w-24면 "12345.678"까지 들어간다. */}
          <div className="flex w-fit items-center rounded-md border">
            <button
              type="button"
              aria-label="Nudge start back"
              className="text-foreground/70 hover:bg-muted hover:text-foreground focus-visible:ring-ring rounded-l-md px-2.5 py-1.5 text-sm focus-visible:ring-2 focus-visible:outline-none"
              onClick={() => adjustStart(-STEP_SECONDS)}
            >
              {/* 하이픈이 아니라 마이너스 기호. 식별 라인의 범위 대시(–)와
                  헷갈리지 않게 한다. */}
              −
            </button>
            <input
              type="number"
              step={0.1}
              min={0}
              // 위 <p>는 label 요소가 아니라 이 입력의 접근 가능한 이름이 되지
              // 못한다. 라벨 문구를 고치는 김에 이름을 붙인다.
              aria-label="Start seconds"
              value={startSeconds}
              onChange={(event) =>
                setStartSeconds(Math.max(0, Number(event.target.value)))
              }
              // 반올림은 onChange가 아니라 blur에서 한다. 입력마다 반올림하면
              // "272." 같은 입력 중간 상태가 272로 덮여 소수점을 칠 수 없다.
              onBlur={() => setStartSeconds(roundTenth(startSeconds))}
              className="w-24 border-x px-2 py-1.5 text-center text-sm tabular-nums focus-visible:outline-none"
            />
            <button
              type="button"
              aria-label="Nudge start forward"
              className="text-foreground/70 hover:bg-muted hover:text-foreground focus-visible:ring-ring rounded-r-md px-2.5 py-1.5 text-sm focus-visible:ring-2 focus-visible:outline-none"
              onClick={() => adjustStart(STEP_SECONDS)}
            >
              +
            </button>
          </div>
        </div>

        <div>
          <p className="text-muted-foreground mb-1 text-xs font-medium">
            End (s)
          </p>
          <div className="flex w-fit items-center rounded-md border">
            <button
              type="button"
              aria-label="Nudge end back"
              className="text-foreground/70 hover:bg-muted hover:text-foreground focus-visible:ring-ring rounded-l-md px-2.5 py-1.5 text-sm focus-visible:ring-2 focus-visible:outline-none"
              onClick={() => adjustEnd(-STEP_SECONDS)}
            >
              −
            </button>
            <input
              type="number"
              step={0.1}
              min={0}
              aria-label="End seconds"
              value={endSeconds}
              onChange={(event) =>
                setEndSeconds(Math.max(0, Number(event.target.value)))
              }
              onBlur={() => setEndSeconds(roundTenth(endSeconds))}
              className="w-24 border-x px-2 py-1.5 text-center text-sm tabular-nums focus-visible:outline-none"
            />
            <button
              type="button"
              aria-label="Nudge end forward"
              className="text-foreground/70 hover:bg-muted hover:text-foreground focus-visible:ring-ring rounded-r-md px-2.5 py-1.5 text-sm focus-visible:ring-2 focus-visible:outline-none"
              onClick={() => adjustEnd(STEP_SECONDS)}
            >
              +
            </button>
          </div>
        </div>
      </div>

      {/* Before는 길이를 배지와 여기 두 곳에 렌더했다. 값은 배지가 갖고,
          여기서는 위반했을 때 그 결과만 말한다 — 정상 상태에서 이 줄은 없다. */}
      {!withinLimits && (
        <p className="text-destructive mt-2 text-xs">
          Not saved — length must be {CLIP_DURATION_LIMITS.MIN_SECONDS}–
          {CLIP_DURATION_LIMITS.MAX_SECONDS}s.
        </p>
      )}

      {isOverlapping && (
        <p className="text-destructive mt-1 text-xs">
          Overlaps another selected clip. Adjust the start or end.
        </p>
      )}

      {isBlockedByBudget && (
        <p
          id={`${draft.id}-budget-hint`}
          className="text-muted-foreground mt-1 text-xs"
        >
          Swap one out to pick this instead.
        </p>
      )}

      {previewText && (
        <p className="bg-muted mt-2 line-clamp-3 rounded p-2 text-xs">
          {previewText}
        </p>
      )}

      {/* 카드를 "내용"과 "부가 조작"으로 가른다. Before는 컨테이너 없는 ghost
          버튼 2개가 본문과 같은 크기로 떠 있어 hook과 무게를 다퉜다. */}
      <div className="mt-3 flex flex-wrap items-center gap-1 border-t pt-2">
        <Button
          type="button"
          size="sm"
          variant="ghost"
          className="text-muted-foreground hover:text-foreground h-7 px-2 text-xs"
          onClick={resetToAi}
        >
          Reset to AI suggestion
        </Button>
        {/* 구간이 길이 제한 밖이면 서버가 저장 자체를 거부하므로, 스타일만
            따로 저장할 방법이 없다. 구간을 먼저 고치게 막는다. */}
        <Button
          type="button"
          size="sm"
          variant="ghost"
          disabled={!withinLimits}
          className="text-muted-foreground hover:text-foreground h-7 px-2 text-xs"
          onClick={() => setStyleOpen(true)}
        >
          Caption style
        </Button>
      </div>

      <CaptionStyleDialog
        open={styleOpen}
        onOpenChange={setStyleOpen}
        language={language}
        initialValue={toCaptionStyle(draft.captionStyle)}
        previewWords={wordsInRange.map((word) => word.word)}
        onApply={handleApplyStyle}
        onApplyToAll={onApplyToAll}
        isApplyingToAll={isApplyingToAll}
      />
    </div>
  );
}
