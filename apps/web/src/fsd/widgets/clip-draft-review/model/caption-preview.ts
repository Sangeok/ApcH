import type { TranscriptWord } from "~/fsd/features/clip-review";
import { CAPTION_RENDER, type CaptionStyle } from "~/fsd/shared/config/constants";

export interface CaptionCue {
  start: number; // 클립 상대 초 (main.py start_rel)
  end: number; // 클립 상대 초 (main.py end_rel)
  text: string;
}

// apps/backend/main.py:287-345 create_subtitles_with_ffmpeg 의 묶기를 그대로 옮긴다.
// 전사가 같으면 큐도 같으므로(결정적) 새 렌더 없이 실렌더의 텍스트·큐 시각을 재현한다.
export function buildCaptionCues(
  words: readonly TranscriptWord[],
  clipStart: number,
  clipEnd: number,
  maxWords: number,
  uppercase: boolean,
): CaptionCue[] {
  // main.py:300-305 — 클립 범위 안 세그먼트만. (web TranscriptWord.start/end는
  // parseTranscriptWords가 이미 number로 보장하므로 null 검사는 불필요.)
  const inRange = words.filter(
    (w) => w.start >= clipStart && w.end <= clipEnd,
  );

  const cues: CaptionCue[] = [];
  let current: string[] = [];
  let curStart = 0;
  let curEnd = 0;

  const flush = () => {
    const text = current.join(" ");
    cues.push({
      start: curStart,
      end: curEnd,
      text: uppercase ? text.toUpperCase() : text, // main.py:384-385
    });
  };

  for (const w of inRange) {
    const word = w.word.trim();
    const startRel = Math.max(0, w.start - clipStart); // main.py:321
    const endRel = Math.max(0, w.end - clipStart); // main.py:322
    if (word === "" || endRel <= 0) continue; // main.py:317,324-326

    if (current.length === 0) {
      current = [word];
      curStart = startRel;
      curEnd = endRel;
    } else if (current.length >= maxWords) {
      flush(); // main.py:334-338
      current = [word];
      curStart = startRel;
      curEnd = endRel;
    } else {
      current.push(word); // main.py:340-342
      curEnd = endRel;
    }
  }
  if (current.length > 0) flush(); // main.py:344-345

  return cues;
}

// 현재 재생 위치(클립 상대 초)의 큐. 백엔드는 큐 사이에 공백을 두므로
// (앞 큐 end ~ 다음 큐 start) 그 구간엔 자막이 없다 → null.
export function pickActiveCue(
  cues: readonly CaptionCue[],
  relativeSeconds: number,
): CaptionCue | null {
  for (const cue of cues) {
    if (relativeSeconds >= cue.start && relativeSeconds < cue.end) return cue;
  }
  return null;
}

function previewScale(previewHeightPx: number): number {
  return previewHeightPx / CAPTION_RENDER.PLAY_RES_Y;
}

// libass REAL_DIM 보정 포함. main.py fontsize(EN 122 / KR 130 등)를 미리보기 px로.
export function getPreviewFontPx(
  assFontSize: number,
  language: string,
  previewHeightPx: number,
): number {
  const emScale =
    language === "Korean"
      ? CAPTION_RENDER.EM_SCALE.Korean
      : CAPTION_RENDER.EM_SCALE.English;
  return Math.max(8, assFontSize * emScale * previewScale(previewHeightPx));
}

// ASS 외곽선은 글리프 바깥, CSS 스트로크는 글리프 중앙 기준 → 같아 보이려면 2배.
export function getPreviewStrokePx(
  assOutlineWidth: number,
  previewHeightPx: number,
): number {
  return assOutlineWidth * previewScale(previewHeightPx) * 2;
}

// ASS shadow(6.5)를 미리보기 오프셋 px로. borderstyle 1의 드롭섀도 근사.
export function getPreviewShadowPx(previewHeightPx: number): number {
  return CAPTION_RENDER.SHADOW * previewScale(previewHeightPx);
}

// 세로 위치. top/bottom은 marginv(main.py:141-142)를 px로, middle은 중앙(둘 다 null).
export function getPreviewVerticalInset(
  position: CaptionStyle["position"],
  previewHeightPx: number,
): { top: number | null; bottom: number | null } {
  const scale = previewScale(previewHeightPx);
  if (position === "top")
    return { top: CAPTION_RENDER.MARGINV.top * scale, bottom: null };
  if (position === "bottom")
    return { top: null, bottom: CAPTION_RENDER.MARGINV.bottom * scale };
  return { top: null, bottom: null }; // middle
}
