"use client";

import { useMemo, useState } from "react";
import { cn } from "~/fsd/shared/lib/utils";
import { Button } from "~/fsd/shared/ui/atoms/button";
import {
  CLIP_DURATION_LIMITS,
  isClipDurationWithinLimits,
} from "~/fsd/shared/config/constants";
import type {
  ClipRange,
  TranscriptWord,
} from "../../model/use-clip-draft-review";

interface AddCustomClipPanelProps {
  transcriptWords: TranscriptWord[];
  onAdd: (range: ClipRange) => Promise<void>;
  isAdding: boolean;
}

function getLengthLabel(
  range: { duration: number } | null,
  withinLimits: boolean,
): string {
  if (!range) return "No range selected";
  const base = `Length: ${range.duration.toFixed(1)}s`;
  if (withinLimits) return base;
  return `${base} (must be ${CLIP_DURATION_LIMITS.MIN_SECONDS}-${CLIP_DURATION_LIMITS.MAX_SECONDS}s)`;
}

export default function AddCustomClipPanel({
  transcriptWords,
  onAdd,
  isAdding,
}: AddCustomClipPanelProps) {
  const [open, setOpen] = useState(false);
  const [startIdx, setStartIdx] = useState<number | null>(null);
  const [endIdx, setEndIdx] = useState<number | null>(null);

  const range = useMemo(() => {
    if (startIdx === null || endIdx === null) return null;
    const lo = Math.min(startIdx, endIdx);
    const hi = Math.max(startIdx, endIdx);
    const start = transcriptWords[lo]?.start;
    const end = transcriptWords[hi]?.end;
    if (typeof start !== "number" || typeof end !== "number") return null;
    return { startSeconds: start, endSeconds: end, duration: end - start };
  }, [startIdx, endIdx, transcriptWords]);

  const withinLimits =
    !!range && isClipDurationWithinLimits(range.startSeconds, range.endSeconds);

  const handleWordClick = (idx: number) => {
    const isStartingNewSelection = startIdx === null || endIdx !== null;
    if (isStartingNewSelection) {
      setStartIdx(idx);
      setEndIdx(null);
      return;
    }
    setEndIdx(idx);
  };

  const handleAdd = async () => {
    if (!range || !withinLimits) return;
    try {
      await onAdd({
        startSeconds: range.startSeconds,
        endSeconds: range.endSeconds,
      });
      // 성공 시에만 초기화/닫기. 실패는 mutation onError 토스트로 노출되고,
      // 사용자가 다시 시도할 수 있도록 선택을 유지한다.
      setStartIdx(null);
      setEndIdx(null);
      setOpen(false);
    } catch {
      // onError가 이미 실패를 사용자에게 알렸다.
    }
  };

  if (transcriptWords.length === 0) {
    return null; // 전사 없음 → 폴백(숫자 입력)은 Open Questions
  }

  const selectedLo =
    startIdx === null ? null : Math.min(startIdx, endIdx ?? startIdx);
  const selectedHi =
    startIdx === null ? null : Math.max(startIdx, endIdx ?? startIdx);

  return (
    <div className="rounded-lg border p-4">
      <div className="flex items-center justify-between">
        <p className="text-sm font-medium">Add a clip AI missed</p>
        <Button
          type="button"
          size="sm"
          variant="ghost"
          onClick={() => setOpen((v) => !v)}
        >
          {open ? "Close" : "Add custom clip"}
        </Button>
      </div>

      {open && (
        <div className="mt-3 space-y-3">
          <p className="text-muted-foreground text-xs">
            Click the first word, then the last word of the clip.
          </p>
          <div className="max-h-48 overflow-y-auto text-sm leading-relaxed">
            {transcriptWords.map((word, idx) => {
              const inRange =
                selectedLo !== null &&
                selectedHi !== null &&
                idx >= selectedLo &&
                idx <= selectedHi;
              return (
                // <button>으로 두면 Tab 도달과 Enter/Space 활성화가 브라우저
                // 기본 동작으로 붙는다(onKeyDown 수동 구현 불필요).
                // `inline`은 버튼 기본값 inline-block이 전사 문단의 줄바꿈
                // 흐름을 바꾸는 걸 막는다 — 레이아웃은 기존 <span>과 동일하다.
                // type="button"은 폼 안에 놓였을 때의 의도치 않은 제출을 막는다.
                <button
                  key={`${idx}-${word.start}`}
                  type="button"
                  aria-pressed={inRange}
                  onClick={() => handleWordClick(idx)}
                  className={cn(
                    "inline cursor-pointer rounded px-0.5 text-left",
                    inRange && "bg-primary/20",
                  )}
                >
                  {word.word}{" "}
                </button>
              );
            })}
          </div>

          <div className="flex items-center justify-between">
            <p
              className={cn(
                "text-xs",
                withinLimits ? "text-muted-foreground" : "text-destructive",
              )}
            >
              {getLengthLabel(range, withinLimits)}
            </p>
            <Button
              type="button"
              size="sm"
              disabled={!withinLimits || isAdding}
              onClick={handleAdd}
            >
              {isAdding ? "Adding..." : "Add clip"}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
