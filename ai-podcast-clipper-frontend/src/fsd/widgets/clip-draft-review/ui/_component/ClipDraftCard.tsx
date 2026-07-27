"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { ClipDraft } from "generated/prisma";
import { cn } from "~/fsd/shared/lib/utils";
import { Button } from "~/fsd/shared/ui/atoms/button";
import { Badge } from "~/fsd/shared/ui/atoms/badge";
import {
  CLIP_DURATION_LIMITS,
  type CaptionStyle,
} from "~/fsd/shared/config/constants";
import type {
  ClipRange,
  SaveDraftInput,
  TranscriptWord,
} from "../../model/use-clip-draft-review";
import CaptionStyleEditor from "./CaptionStyleEditor";

const STEP_SECONDS = 0.5;
const AUTO_SAVE_DEBOUNCE_MS = 600;

// draft.captionStyle(Prisma JsonValue) → shared CaptionStyle 강제 변환의 단일
// 지점. 초기값과 스타일 에디터 오픈 동기화가 함께 사용한다.
function toCaptionStyle(raw: ClipDraft["captionStyle"]): CaptionStyle | null {
  return (raw as CaptionStyle | null) ?? null;
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
}: ClipDraftCardProps) {
  // 구간·스타일은 사용자가 편집 중인 값이라 로컬 state로 두지만, 선택 여부는
  // detail 캐시(draft.selected)에서 직접 읽는다. 로컬로 복사하면 위젯 헤더의
  // Select all/Deselect all이 캐시만 갱신하고 카드 체크박스는 그대로 남는다.
  const [startSeconds, setStartSeconds] = useState<number>(draft.startSeconds);
  const [endSeconds, setEndSeconds] = useState<number>(draft.endSeconds);
  const [captionStyle, setCaptionStyle] = useState<CaptionStyle | null>(
    toCaptionStyle(draft.captionStyle),
  );
  // 이 카드에서 스타일을 직접 편집했을 때만 저장 payload에 captionStyle을 싣는다.
  // false면 undefined(변경 없음)를 보내, Apply to all로 서버에 저장된 스타일이
  // 이 카드의 오래된 로컬 값으로 되돌아가는 것을 막는다.
  const [styleDirty, setStyleDirty] = useState<boolean>(false);
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

  // 구간·캡션 스타일 변경의 디바운스 자동 저장. 길이 제한 밖 값은 서버 가드와
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
        captionStyle: styleDirty ? captionStyle : undefined,
      });
    }, AUTO_SAVE_DEBOUNCE_MS);

    return clearPendingAutoSave;
    // 의존성 제외는 전부 의도적이다:
    // - draft.selected: handleSelectedChange가 타이머를 취소하고 즉시 저장하는
    //   별도 경로다. 여기 포함하면 토글마다 디바운스 저장이 중복 발화하고,
    //   Select all/Deselect all이 모든 카드에서 중복 저장을 유발한다.
    // - styleDirty: 항상 captionStyle 변경과 함께만 바뀐다(onChange/onReset/
    //   onApplyToAll/handleToggleStyleOpen). 단독 트리거가 되어선 안 된다.
    // - withinLimits/runSave/clearPendingAutoSave: 렌더마다 재생성되는 파생값/
    //   함수로, 타이머는 이펙트 생성 시점 렌더의 최신 값을 캡처하면 충분하다.
    // 이 배열에 값을 추가하는 "lint 경고 수정"은 stale-타이머 경합을 되살린다.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [startSeconds, endSeconds, captionStyle]);

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
      captionStyle: styleDirty ? captionStyle : undefined,
    });
  };

  // 에디터를 여는 시점의 서버 저장값을 편집 기준으로 동기화한다
  // (다른 카드에서 Apply to all 한 결과 반영).
  const handleToggleStyleOpen = () => {
    setStyleOpen((open) => {
      const next = !open;
      if (next) {
        setCaptionStyle(toCaptionStyle(draft.captionStyle));
        setStyleDirty(false);
      }
      return next;
    });
  };

  return (
    <div
      className={cn(
        "rounded-lg border p-4",
        isActive && "ring-2 ring-primary",
        !draft.selected && "opacity-70",
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <label className="flex items-start gap-2">
          <input
            type="checkbox"
            className="mt-1"
            checked={draft.selected}
            onChange={(event) => handleSelectedChange(event.target.checked)}
          />
          <span>
            <span className="block text-sm leading-snug font-semibold">
              {draft.hook ?? `Clip #${draft.index + 1}`}
            </span>
            {draft.payoff && (
              <span className="text-muted-foreground mt-0.5 line-clamp-2 block text-xs leading-snug">
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

      <div className="mt-2 flex flex-wrap items-center gap-1">
        {draft.clipType && <Badge variant="secondary">{draft.clipType}</Badge>}
        <Badge variant="outline">
          {formatTime(startSeconds)}–{formatTime(endSeconds)}
        </Badge>
        <Badge variant="outline">{duration.toFixed(1)}s</Badge>
      </div>

      <div className="mt-3 grid grid-cols-2 gap-3">
        <div>
          <p className="mb-1 text-xs font-medium text-muted-foreground">
            Start: {formatTime(startSeconds)}
          </p>
          <div className="flex items-center gap-1">
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={() => adjustStart(-STEP_SECONDS)}
            >
              -
            </Button>
            <input
              type="number"
              step={0.1}
              min={0}
              value={startSeconds}
              onChange={(event) =>
                setStartSeconds(Math.max(0, Number(event.target.value)))
              }
              className="w-20 rounded border px-2 py-1 text-sm"
            />
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={() => adjustStart(STEP_SECONDS)}
            >
              +
            </Button>
          </div>
        </div>

        <div>
          <p className="mb-1 text-xs font-medium text-muted-foreground">
            End: {formatTime(endSeconds)}
          </p>
          <div className="flex items-center gap-1">
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={() => adjustEnd(-STEP_SECONDS)}
            >
              -
            </Button>
            <input
              type="number"
              step={0.1}
              min={0}
              value={endSeconds}
              onChange={(event) =>
                setEndSeconds(Math.max(0, Number(event.target.value)))
              }
              className="w-20 rounded border px-2 py-1 text-sm"
            />
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={() => adjustEnd(STEP_SECONDS)}
            >
              +
            </Button>
          </div>
        </div>
      </div>

      <p
        className={cn(
          "mt-2 text-xs",
          withinLimits ? "text-muted-foreground" : "text-destructive",
        )}
      >
        Length: {duration.toFixed(1)}s
        {!withinLimits &&
          ` — not saved (must be ${CLIP_DURATION_LIMITS.MIN_SECONDS}-${CLIP_DURATION_LIMITS.MAX_SECONDS}s)`}
      </p>

      {previewText && (
        <p className="mt-2 line-clamp-3 rounded bg-muted p-2 text-xs">
          {previewText}
        </p>
      )}

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <Button type="button" size="sm" variant="ghost" onClick={resetToAi}>
          Reset to AI suggestion
        </Button>
        <Button
          type="button"
          size="sm"
          variant="ghost"
          onClick={handleToggleStyleOpen}
        >
          {styleOpen ? "Hide caption style" : "Caption style"}
        </Button>
      </div>

      {styleOpen && (
        <CaptionStyleEditor
          language={language}
          value={captionStyle}
          previewWords={wordsInRange.map((word) => word.word)}
          onChange={(style) => {
            setStyleDirty(true);
            setCaptionStyle(style);
          }}
          onReset={() => {
            setStyleDirty(true);
            setCaptionStyle(null);
          }}
          onApplyToAll={(style) => {
            // 벌크 저장이 이 카드에도 적용되므로 로컬을 적용값으로 맞추고
            // dirty를 해제해 이후 자동 저장이 스타일을 다시 보내지 않게 한다.
            setStyleDirty(false);
            setCaptionStyle(style);
            onApplyToAll(style);
          }}
          isApplyingToAll={isApplyingToAll}
        />
      )}
    </div>
  );
}
