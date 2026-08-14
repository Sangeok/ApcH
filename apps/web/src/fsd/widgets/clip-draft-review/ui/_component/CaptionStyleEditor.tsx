"use client";

import { cn } from "~/fsd/shared/lib/utils";
import { Button } from "~/fsd/shared/ui/atoms/button";
import {
  CAPTION_STYLE_OPTIONS,
  CAPTION_STYLE_PRESETS,
  type CaptionStyle,
} from "~/fsd/shared/config/constants";
import { matchPresetId } from "../../model/caption-presets";

interface CaptionStyleEditorProps {
  language: string;
  // null = 언어별 기본값 (백엔드 하드코딩) 사용.
  value: CaptionStyle | null;
  // 현재 구간에 포함되는 전사 단어 (미리보기 텍스트용).
  previewWords: string[];
  onChange: (style: CaptionStyle) => void;
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

function languageDefaultOutlineWidth(language: string): number {
  return language === "Korean"
    ? CAPTION_STYLE_OPTIONS.DEFAULT_OUTLINE_WIDTH.Korean
    : CAPTION_STYLE_OPTIONS.DEFAULT_OUTLINE_WIDTH.English;
}

// 저장된 값이 없는 필드는 null로 남긴다. 아래 emit이 이 값을 펼치므로
// 손대지 않은 필드는 계속 null(= 백엔드 언어별 기본값)로 저장된다.
const EMPTY_STYLE: CaptionStyle = {
  position: CAPTION_STYLE_OPTIONS.DEFAULT_POSITION,
  fontSize: null,
  color: null,
  maxWordsPerLine: null,
  outlineColor: null,
  outlineWidth: null,
  uppercase: null,
};

export default function CaptionStyleEditor({
  language,
  value,
  previewWords,
  onChange,
}: CaptionStyleEditorProps) {
  // 저장된 값 위에 언어별 기본값을 얹은 "유효 스타일". 컨트롤과 미리보기가 이 값을 표시한다.
  const effectivePosition =
    value?.position ?? CAPTION_STYLE_OPTIONS.DEFAULT_POSITION;
  const effectiveFontSize = value?.fontSize ?? languageDefaultFontSize(language);
  const effectiveColor = value?.color ?? CAPTION_STYLE_OPTIONS.DEFAULT_COLOR;
  const effectiveMaxWords =
    value?.maxWordsPerLine ?? languageDefaultMaxWords(language);
  const effectiveOutlineColor =
    value?.outlineColor ?? CAPTION_STYLE_OPTIONS.DEFAULT_OUTLINE_COLOR;
  const effectiveOutlineWidth =
    value?.outlineWidth ?? languageDefaultOutlineWidth(language);
  const effectiveUppercase = value?.uppercase ?? false;

  // 저장값(null 포함)을 그대로 펼친다. effective를 펼치면 위치만 바꿔도
  // 폰트/줄당 단어가 실제 값으로 굳어져, 프리셋과 동일한 모습인데도
  // 프리셋 칩이 꺼진다(프리셋은 position을 포함하지 않는다).
  const emit = (patch: Partial<CaptionStyle>) => {
    onChange({ ...(value ?? EMPTY_STYLE), ...patch });
  };

  const activePreset = matchPresetId(value);
  const previewText = previewWords.slice(0, effectiveMaxWords).join(" ");

  // 미리보기 컨테이너 높이 기준 좌표 환산 (ASS PlayResY 1920 기준, main.py).
  const PREVIEW_HEIGHT_PX = 320;
  const previewScale = PREVIEW_HEIGHT_PX / 1920;
  const previewFontPx = Math.max(10, Math.round(effectiveFontSize * previewScale));
  // ASS 외곽선은 글리프 바깥으로 나가고 CSS 스트로크는 글리프 중앙을 기준으로
  // 그려진다. 같은 두께로 보이려면 2배가 필요하다 (근사값).
  const previewStrokePx = effectiveOutlineWidth * previewScale * 2;

  const justifyClass =
    effectivePosition === "top"
      ? "justify-start pt-6"
      : effectivePosition === "bottom"
        ? "justify-end pb-6"
        : "justify-center";

  return (
    <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
      <div className="flex flex-col gap-3">
        <div>
          <p className="mb-1 text-xs font-medium text-muted-foreground">
            Preset
          </p>
          <div className="flex flex-wrap gap-1">
            {CAPTION_STYLE_PRESETS.map((preset) => (
              <Button
                key={preset.id}
                type="button"
                size="sm"
                variant={activePreset === preset.id ? "default" : "outline"}
                onClick={() => emit(preset.style)}
              >
                {preset.label}
              </Button>
            ))}
          </div>
        </div>

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
                variant={effectivePosition === position ? "default" : "outline"}
                onClick={() => emit({ position })}
              >
                {POSITION_LABELS[position]}
              </Button>
            ))}
          </div>
        </div>

        <div>
          <p className="mb-1 text-xs font-medium text-muted-foreground">
            Font size: {effectiveFontSize}
          </p>
          <input
            type="range"
            min={CAPTION_STYLE_OPTIONS.FONT_SIZE_RANGE.MIN}
            max={CAPTION_STYLE_OPTIONS.FONT_SIZE_RANGE.MAX}
            value={effectiveFontSize}
            onChange={(event) => emit({ fontSize: Number(event.target.value) })}
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
                  effectiveColor.toUpperCase() === color.toUpperCase() &&
                    "ring-2 ring-offset-2",
                )}
                style={{ backgroundColor: color }}
              />
            ))}
          </div>
        </div>

        <div>
          <p className="mb-1 text-xs font-medium text-muted-foreground">
            Outline color
          </p>
          <div className="flex gap-2">
            {CAPTION_STYLE_OPTIONS.OUTLINE_COLOR_PRESETS.map((color) => (
              <button
                key={color}
                type="button"
                aria-label={`Outline ${color}`}
                onClick={() => emit({ outlineColor: color })}
                className={cn(
                  "h-6 w-6 rounded-full border",
                  effectiveOutlineColor.toUpperCase() === color.toUpperCase() &&
                    "ring-2 ring-offset-2",
                )}
                style={{ backgroundColor: color }}
              />
            ))}
          </div>
        </div>

        <div>
          <p className="mb-1 text-xs font-medium text-muted-foreground">
            Outline width: {effectiveOutlineWidth}
          </p>
          <div className="flex items-center gap-2">
            {/* 언어 기본값이 소수(1.1/1.3)라 반올림 후 증감한다. 한 번 누른
                뒤부터는 정수만 오가므로 zod의 int 제약과 어긋나지 않는다. */}
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={() =>
                emit({
                  outlineWidth: Math.max(
                    CAPTION_STYLE_OPTIONS.OUTLINE_WIDTH_RANGE.MIN,
                    Math.round(effectiveOutlineWidth) - 1,
                  ),
                })
              }
            >
              -
            </Button>
            <span className="w-6 text-center text-sm">
              {effectiveOutlineWidth}
            </span>
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={() =>
                emit({
                  outlineWidth: Math.min(
                    CAPTION_STYLE_OPTIONS.OUTLINE_WIDTH_RANGE.MAX,
                    Math.round(effectiveOutlineWidth) + 1,
                  ),
                })
              }
            >
              +
            </Button>
          </div>
        </div>

        <div>
          <p className="mb-1 text-xs font-medium text-muted-foreground">
            Words per line: {effectiveMaxWords}
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
                    effectiveMaxWords - 1,
                  ),
                })
              }
            >
              -
            </Button>
            <span className="w-6 text-center text-sm">{effectiveMaxWords}</span>
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={() =>
                emit({
                  maxWordsPerLine: Math.min(
                    CAPTION_STYLE_OPTIONS.MAX_WORDS_RANGE.MAX,
                    effectiveMaxWords + 1,
                  ),
                })
              }
            >
              +
            </Button>
          </div>
        </div>

        <div>
          <p className="mb-1 text-xs font-medium text-muted-foreground">
            Letter case
          </p>
          <Button
            type="button"
            size="sm"
            variant={effectiveUppercase ? "default" : "outline"}
            onClick={() => emit({ uppercase: !effectiveUppercase })}
          >
            Uppercase
          </Button>
        </div>
      </div>

      <div className="flex flex-col gap-2">
        <div
          className={cn(
            "relative mx-auto flex w-[180px] flex-col overflow-hidden rounded-lg bg-gradient-to-b from-slate-700 to-slate-900",
            justifyClass,
          )}
          style={{ height: PREVIEW_HEIGHT_PX }}
        >
          <p
            className="px-2 text-center font-bold leading-tight"
            style={{
              fontSize: previewFontPx,
              color: effectiveColor,
              textTransform: effectiveUppercase ? "uppercase" : "none",
              WebkitTextStroke: `${previewStrokePx}px ${effectiveOutlineColor}`,
              paintOrder: "stroke fill",
              textShadow: "0 1px 4px rgba(0,0,0,0.9)",
            }}
          >
            {previewText || "Caption preview"}
          </p>
        </div>
        {/* 무엇이 다른지 말해야 한다. 캡션 좌표는 백엔드와 동일한 PlayResY 1920
            기준으로 환산하므로 정확하고, 배경만 실제와 다르다 — 최종 클립은
            프레임마다 화자를 따라가는 세로 크롭이다(main.py create_vertical_video). */}
        <p className="text-center text-[11px] text-muted-foreground">
          Caption size, color, case and position are accurate; the outline is
          approximate. The background is not — the final clip is cropped to
          vertical and follows whoever is speaking.
        </p>
      </div>
    </div>
  );
}
