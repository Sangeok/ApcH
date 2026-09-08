"use client";

import type { TranscriptWord } from "~/fsd/features/clip-review";
import { cn } from "~/fsd/shared/lib/utils";
import { Button } from "~/fsd/shared/ui/atoms/button";
import {
  CAPTION_STYLE_OPTIONS,
  CAPTION_STYLE_PRESETS,
  type CaptionStyle,
} from "~/fsd/shared/config/constants";
import { matchPresetId } from "../../model/caption-presets";
import CaptionPreviewPlayer from "./CaptionPreviewPlayer";

interface CaptionStyleEditorProps {
  language: string;
  // null = 언어별 기본값 (백엔드 하드코딩) 사용.
  value: CaptionStyle | null;
  // 미리보기 플레이어가 쓰는 원본 영상 URL·클립 구간·구간 안 단어(타이밍 포함).
  playUrl: string | null;
  clipStart: number;
  clipEnd: number;
  words: TranscriptWord[];
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
  playUrl,
  clipStart,
  clipEnd,
  words,
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
        <CaptionPreviewPlayer
          playUrl={playUrl}
          clipStart={clipStart}
          clipEnd={clipEnd}
          words={words}
          language={language}
          fontSize={effectiveFontSize}
          color={effectiveColor}
          outlineColor={effectiveOutlineColor}
          outlineWidth={effectiveOutlineWidth}
          maxWords={effectiveMaxWords}
          uppercase={effectiveUppercase}
          position={effectivePosition}
        />
        {/* 못 닫는 근사 둘을 말한다: 크롭은 렌더 시 화자를 따라가 중앙 크롭과 다르고,
            한국어는 렌더 시 번역되므로 여기선 영어 원문으로 보인다. */}
        <p className="text-center text-[11px] text-muted-foreground">
          Live preview on your video. The final clip crops to whoever is
          speaking, so framing will differ. Korean clips are translated at
          render time — the words here are the English source.
        </p>
      </div>
    </div>
  );
}
