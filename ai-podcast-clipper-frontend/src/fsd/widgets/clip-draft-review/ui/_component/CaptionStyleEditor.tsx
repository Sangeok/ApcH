"use client";

import { cn } from "~/fsd/shared/lib/utils";
import { Button } from "~/fsd/shared/ui/atoms/button";
import {
  CAPTION_STYLE_OPTIONS,
  type CaptionStyle,
} from "~/fsd/shared/config/constants";

interface CaptionStyleEditorProps {
  language: string;
  // null = 언어별 기본값 (백엔드 하드코딩) 사용.
  value: CaptionStyle | null;
  // 현재 구간에 포함되는 전사 단어 (미리보기 텍스트용).
  previewWords: string[];
  onChange: (style: CaptionStyle) => void;
  onReset: () => void;
  onApplyToAll: (style: CaptionStyle) => void;
  isApplyingToAll: boolean;
}

const POSITION_LABELS: Record<
  (typeof CAPTION_STYLE_OPTIONS.POSITIONS)[number],
  string
> = {
  top: "Top",
  middle: "Middle",
  bottom: "Bottom",
};

function languageDefaultFontSize(language: string): number {
  return language === "Korean"
    ? CAPTION_STYLE_OPTIONS.DEFAULT_FONT_SIZE.Korean
    : CAPTION_STYLE_OPTIONS.DEFAULT_FONT_SIZE.English;
}

function languageDefaultMaxWords(language: string): number {
  return language === "Korean"
    ? CAPTION_STYLE_OPTIONS.DEFAULT_MAX_WORDS.Korean
    : CAPTION_STYLE_OPTIONS.DEFAULT_MAX_WORDS.English;
}

export default function CaptionStyleEditor({
  language,
  value,
  previewWords,
  onChange,
  onReset,
  onApplyToAll,
  isApplyingToAll,
}: CaptionStyleEditorProps) {
  // 저장된 값 위에 언어별 기본값을 얹은 "유효 스타일". 컨트롤은 이 값을 표시한다.
  const effective: CaptionStyle = {
    position: value?.position ?? CAPTION_STYLE_OPTIONS.DEFAULT_POSITION,
    fontSize: value?.fontSize ?? languageDefaultFontSize(language),
    color: value?.color ?? CAPTION_STYLE_OPTIONS.DEFAULT_COLOR,
    maxWordsPerLine:
      value?.maxWordsPerLine ?? languageDefaultMaxWords(language),
  };

  const emit = (patch: Partial<CaptionStyle>) => {
    onChange({ ...effective, ...patch });
  };

  const previewFontSize = effective.fontSize ?? languageDefaultFontSize(language);
  const previewColor = effective.color ?? CAPTION_STYLE_OPTIONS.DEFAULT_COLOR;
  const previewMaxWords =
    effective.maxWordsPerLine ?? languageDefaultMaxWords(language);
  const previewText = previewWords.slice(0, previewMaxWords).join(" ");

  // 미리보기 컨테이너 높이 기준 좌표 환산 (ASS PlayResY 1920 기준, main.py).
  const PREVIEW_HEIGHT_PX = 320;
  const previewFontPx = Math.max(
    10,
    Math.round(previewFontSize * (PREVIEW_HEIGHT_PX / 1920)),
  );

  const justifyClass =
    effective.position === "top"
      ? "justify-start pt-6"
      : effective.position === "bottom"
        ? "justify-end pb-6"
        : "justify-center";

  return (
    <div className="mt-3 grid grid-cols-1 gap-4 rounded-lg border p-3 sm:grid-cols-2">
      <div className="flex flex-col gap-3">
        <div>
          <p className="mb-1 text-xs font-medium text-muted-foreground">
            Position
          </p>
          <div className="flex gap-1">
            {CAPTION_STYLE_OPTIONS.POSITIONS.map((position) => (
              <Button
                key={position}
                type="button"
                size="sm"
                variant={
                  effective.position === position ? "default" : "outline"
                }
                onClick={() => emit({ position })}
              >
                {POSITION_LABELS[position]}
              </Button>
            ))}
          </div>
        </div>

        <div>
          <p className="mb-1 text-xs font-medium text-muted-foreground">
            Font size: {previewFontSize}
          </p>
          <input
            type="range"
            min={CAPTION_STYLE_OPTIONS.FONT_SIZE_RANGE.MIN}
            max={CAPTION_STYLE_OPTIONS.FONT_SIZE_RANGE.MAX}
            value={previewFontSize}
            onChange={(event) =>
              emit({ fontSize: Number(event.target.value) })
            }
            className="w-full"
          />
        </div>

        <div>
          <p className="mb-1 text-xs font-medium text-muted-foreground">Color</p>
          <div className="flex gap-2">
            {CAPTION_STYLE_OPTIONS.COLOR_PRESETS.map((color) => (
              <button
                key={color}
                type="button"
                aria-label={color}
                onClick={() => emit({ color })}
                className={cn(
                  "h-6 w-6 rounded-full border",
                  previewColor.toUpperCase() === color.toUpperCase() &&
                    "ring-2 ring-offset-2",
                )}
                style={{ backgroundColor: color }}
              />
            ))}
          </div>
        </div>

        <div>
          <p className="mb-1 text-xs font-medium text-muted-foreground">
            Words per line: {previewMaxWords}
          </p>
          <div className="flex items-center gap-2">
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={() =>
                emit({
                  maxWordsPerLine: Math.max(
                    CAPTION_STYLE_OPTIONS.MAX_WORDS_RANGE.MIN,
                    previewMaxWords - 1,
                  ),
                })
              }
            >
              -
            </Button>
            <span className="w-6 text-center text-sm">{previewMaxWords}</span>
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={() =>
                emit({
                  maxWordsPerLine: Math.min(
                    CAPTION_STYLE_OPTIONS.MAX_WORDS_RANGE.MAX,
                    previewMaxWords + 1,
                  ),
                })
              }
            >
              +
            </Button>
          </div>
        </div>

        <div className="flex gap-2">
          <Button type="button" size="sm" variant="ghost" onClick={onReset}>
            Reset style
          </Button>
          <Button
            type="button"
            size="sm"
            variant="secondary"
            disabled={isApplyingToAll}
            onClick={() => onApplyToAll(effective)}
          >
            Apply to all clips
          </Button>
        </div>
      </div>

      <div className="flex flex-col gap-2">
        <div
          className={cn(
            "relative mx-auto flex w-[180px] overflow-hidden rounded-lg bg-gradient-to-b from-slate-700 to-slate-900",
            justifyClass,
          )}
          style={{ height: PREVIEW_HEIGHT_PX }}
        >
          <p
            className="px-2 text-center font-bold leading-tight"
            style={{
              fontSize: previewFontPx,
              color: previewColor,
              textShadow: "0 1px 4px rgba(0,0,0,0.9)",
            }}
          >
            {previewText || "Caption preview"}
          </p>
        </div>
        <p className="text-center text-[11px] text-muted-foreground">
          Preview is approximate — final render may differ.
        </p>
      </div>
    </div>
  );
}
