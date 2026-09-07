"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { TranscriptWord } from "~/fsd/features/clip-review";
import type { CaptionStyle } from "~/fsd/shared/config/constants";
import { cn } from "~/fsd/shared/lib/utils";
import {
  buildCaptionCues,
  getPreviewFontPx,
  getPreviewShadowPx,
  getPreviewStrokePx,
  getPreviewVerticalInset,
  pickActiveCue,
} from "../../model/caption-preview";

const PREVIEW_HEIGHT_PX = 320;
const PREVIEW_WIDTH_PX = 180; // 9:16

interface CaptionPreviewPlayerProps {
  playUrl: string | null;
  clipStart: number;
  clipEnd: number;
  words: TranscriptWord[];
  language: string;
  // effective(언어 기본값 얹은) 스타일. CaptionStyleEditor가 계산해 넘긴다.
  fontSize: number;
  color: string;
  outlineColor: string;
  outlineWidth: number;
  maxWords: number;
  uppercase: boolean;
  position: CaptionStyle["position"];
}

export default function CaptionPreviewPlayer(props: CaptionPreviewPlayerProps) {
  const { playUrl, clipStart, clipEnd, words, language } = props;
  const videoRef = useRef<HTMLVideoElement>(null);
  const [activeText, setActiveText] = useState("");

  const cues = useMemo(
    () =>
      buildCaptionCues(words, clipStart, clipEnd, props.maxWords, props.uppercase),
    [words, clipStart, clipEnd, props.maxWords, props.uppercase],
  );

  // 큐 목록은 ref로 읽는다. 재생 이펙트의 의존성에 cues를 넣으면 줄당 단어·대문자를
  // 바꿀 때마다 재생이 클립 시작으로 되돌아간다. 스타일 변경은 현재 위치의 큐만 다시 고른다.
  const cuesRef = useRef(cues);
  useEffect(() => {
    cuesRef.current = cues;
    const video = videoRef.current;
    if (!video) return;
    setActiveText(pickActiveCue(cues, video.currentTime - clipStart)?.text ?? "");
  }, [cues, clipStart]);

  // 클립 구간을 음소거로 반복 재생하며 timeupdate마다 현재 큐를 고른다.
  // timeupdate 주기(~250ms)만큼 큐 전환이 늦을 수 있다 — 메인 프리뷰
  // (ui/index.tsx:213-225)와 같은 한계다.
  useEffect(() => {
    const video = videoRef.current;
    if (!video || playUrl === null) return;

    const seekToStart = () => {
      video.currentTime = clipStart;
      void video.play();
    };
    const onTimeUpdate = () => {
      if (video.currentTime >= clipEnd) video.currentTime = clipStart; // 루프
      setActiveText(
        pickActiveCue(cuesRef.current, video.currentTime - clipStart)?.text ?? "",
      );
    };

    video.addEventListener("loadedmetadata", seekToStart);
    video.addEventListener("timeupdate", onTimeUpdate);
    if (video.readyState >= 1) seekToStart();
    return () => {
      video.removeEventListener("loadedmetadata", seekToStart);
      video.removeEventListener("timeupdate", onTimeUpdate);
    };
  }, [playUrl, clipStart, clipEnd]);

  const inset = getPreviewVerticalInset(props.position, PREVIEW_HEIGHT_PX);
  const fontPx = getPreviewFontPx(props.fontSize, language, PREVIEW_HEIGHT_PX);
  const strokePx = getPreviewStrokePx(props.outlineWidth, PREVIEW_HEIGHT_PX);
  const shadowPx = getPreviewShadowPx(PREVIEW_HEIGHT_PX);
  const fontFamily =
    language === "Korean" ? "var(--font-noto-sans-kr)" : "var(--font-anton)";
  const centered = inset.top === null && inset.bottom === null;

  return (
    <div
      className="relative mx-auto overflow-hidden rounded-lg bg-black"
      style={{ width: PREVIEW_WIDTH_PX, height: PREVIEW_HEIGHT_PX }}
    >
      {playUrl !== null && (
        // 크롭은 렌더 시 화자 추적이라 여기선 중앙 크롭(object-cover)으로 근사.
        <video
          ref={videoRef}
          src={playUrl}
          muted
          playsInline
          className="h-full w-full object-cover"
        />
      )}
      <div
        className={cn(
          "pointer-events-none absolute inset-x-0 flex justify-center px-2",
          centered && "inset-y-0 items-center",
        )}
        style={{ top: inset.top ?? undefined, bottom: inset.bottom ?? undefined }}
      >
        {activeText !== "" && (
          <p
            className="text-center leading-tight"
            style={{
              fontFamily,
              fontSize: fontPx,
              color: props.color,
              textTransform: props.uppercase ? "uppercase" : "none",
              WebkitTextStroke: `${strokePx}px ${props.outlineColor}`,
              paintOrder: "stroke fill",
              // ASS backcolor (12,12,12,210): 알파 210/255는 투명도라 불투명도는 1 − 0.82 ≈ 0.18.
              textShadow: `${shadowPx}px ${shadowPx}px 0 rgba(12,12,12,0.18)`,
            }}
          >
            {activeText}
          </p>
        )}
      </div>
    </div>
  );
}
