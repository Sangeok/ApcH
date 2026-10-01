import {
  type CaptionStyle,
} from "~/fsd/shared/config/constants";
import { cn } from "~/fsd/shared/lib/utils";
import { getPreviewVerticalInset } from "../model/caption-preview";
import { resolveEffectiveCaptionStyle } from "../model/effective-caption-style";

// 썸네일 견본 문구 — 목업 유래 비기능 견본. 실제 클립은 사용자 전사를 쓴다.
const SPECIMEN_TEXT = { english: "the real reason", korean: "진짜 이유는" } as const;

interface CaptionStyleThumbnailProps {
  style: CaptionStyle | null;
  language: string;
  paddingPercent: number;
}

export default function CaptionStyleThumbnail({
  style,
  language,
  paddingPercent,
}: CaptionStyleThumbnailProps) {
  const effective = resolveEffectiveCaptionStyle(style, language);
  const isKorean = language === "Korean";
  // 100px 기준 inset = % (MARGINV/PLAY_RES_Y × 100). top/bottom은 프레임 전체 기준.
  const inset = getPreviewVerticalInset(effective.position, 100);
  const centered = inset.top === null && inset.bottom === null;
  // 견본이라 외곽선도 축척하지 않고 근사한다(0이면 0, 아니면 0.5 + w/2, 최대 3px).
  const strokePx =
    effective.outlineWidth === 0
      ? 0
      : Math.min(3, 0.5 + effective.outlineWidth * 0.5);
  const text = SPECIMEN_TEXT[isKorean ? "korean" : "english"];
  const fontFamily = isKorean
    ? "var(--font-noto-sans-kr)"
    : "var(--font-anton)";

  return (
    <div className="ring-border relative aspect-[9/16] w-[76px] shrink-0 overflow-hidden rounded-md bg-black ring-1">
      {/* 회색 장면 = 렌더 영상. 검은 상하 띠(여백)는 실비율. */}
      <div
        className="absolute inset-x-0 bg-neutral-500"
        style={{ top: `${paddingPercent}%`, bottom: `${paddingPercent}%` }}
      />
      <div
        className={cn(
          "pointer-events-none absolute inset-x-0 flex justify-center px-1 text-center",
          centered && "inset-y-0 items-center",
        )}
        style={{
          top: inset.top !== null ? `${inset.top}%` : undefined,
          bottom: inset.bottom !== null ? `${inset.bottom}%` : undefined,
        }}
      >
        <span
          className="text-[11px] leading-none"
          style={{
            fontFamily,
            color: effective.color,
            textTransform: effective.uppercase ? "uppercase" : "none",
            WebkitTextStroke: `${strokePx}px ${effective.outlineColor}`,
            paintOrder: "stroke fill",
          }}
        >
          {text}
        </span>
      </div>
    </div>
  );
}
