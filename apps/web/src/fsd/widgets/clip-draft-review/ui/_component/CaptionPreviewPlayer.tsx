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
  const bgVideoRef = useRef<HTMLVideoElement>(null);
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
    const bgVideo = bgVideoRef.current;
    if (!video || playUrl === null) return;

    // 전경·배경 두 <video>를 같은 클립 구간에서 재생한다. 배경은 블러라 프레임 단위
    // 정합이 보이지 않으므로, 매 timeupdate(~250ms)마다 seek하지 않고(그러면 배경이
    // 끊긴다) 루프 경계에서만 clipStart로 재정렬한다. 사이 구간은 둘 다 1.0×로 흐른다.
    const startFg = () => {
      video.currentTime = clipStart;
      void video.play();
    };
    const startBg = () => {
      if (!bgVideo) return;
      bgVideo.currentTime = clipStart;
      void bgVideo.play();
    };
    const onTimeUpdate = () => {
      if (video.currentTime >= clipEnd) {
        video.currentTime = clipStart; // 루프
        startBg(); // 배경도 같은 시점으로 재정렬
      }
      setActiveText(
        pickActiveCue(cuesRef.current, video.currentTime - clipStart)?.text ?? "",
      );
    };

    video.addEventListener("loadedmetadata", startFg);
    video.addEventListener("timeupdate", onTimeUpdate);
    bgVideo?.addEventListener("loadedmetadata", startBg);
    if (video.readyState >= 1) startFg();
    if (bgVideo && bgVideo.readyState >= 1) startBg();
    return () => {
      video.removeEventListener("loadedmetadata", startFg);
      video.removeEventListener("timeupdate", onTimeUpdate);
      bgVideo?.removeEventListener("loadedmetadata", startBg);
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
        // 백엔드 resize 모드(main.py:245-262) 재현: 블러 배경(cover + 살짝 확대) 위에
        // 원본 전체(contain, 레터박스)를 얹는다. 얼굴이 잡히면 실렌더는 화자 x 크롭
        // (crop 모드, main.py:265-275)이라 이와 다르다 — 아래 안내가 그 한계를 말한다.
        <>
          <video
            ref={bgVideoRef}
            src={playUrl}
            muted
            playsInline
            aria-hidden
            className="absolute inset-0 h-full w-full scale-110 object-cover blur-lg"
          />
          <video
            ref={videoRef}
            src={playUrl}
            muted
            playsInline
            className="absolute inset-0 h-full w-full object-contain"
          />
        </>
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
