import type { TranscriptWord } from "~/fsd/shared/lib/transcript";
import { buildCaptionCues, type CaptionCue } from "./caption-preview";

// 정지 미리보기 창(초). 아래 샘플 단어 전부를 포함(마지막 end 8.9 < 10).
export const SAMPLE_CAPTION_CLIP_END = 10;

// 각 단어 {start:i, end:i+0.9}. maxWordsPerLine 최댓값(8, MAX_WORDS_RANGE.MAX)까지
// 한 줄을 채울 수 있도록 언어마다 9단어를 둔다.
const EN_WORDS = [
  "Style",
  "your",
  "captions",
  "the",
  "way",
  "you",
  "want",
  "them",
  "shown",
];
const KR_WORDS = [
  "지금",
  "자막",
  "스타일을",
  "원하는",
  "대로",
  "화면에서",
  "미리",
  "확인해",
  "보세요",
];

function toWords(list: readonly string[]): TranscriptWord[] {
  return list.map((word, i) => ({ start: i, end: i + 0.9, word }));
}

export function sampleCaptionWords(language: string): TranscriptWord[] {
  return toWords(language === "Korean" ? KR_WORDS : EN_WORDS);
}

// 정지 샘플 미리보기가 그리는 텍스트 = 첫 큐. CaptionPreviewPlayer의 sample 분기가 이 함수를 쓴다.
export function firstCueText(cues: readonly CaptionCue[]): string {
  return cues[0]?.text ?? "";
}

// 샘플 단어 → 정지 미리보기 텍스트. maxWords·uppercase 효과가 곧바로 보인다.
// 플레이어와 같은 firstCueText를 거치므로, 테스트가 실제로 그려지는 첫 큐 선택까지 지킨다.
export function firstSampleCueText(
  language: string,
  maxWords: number,
  uppercase: boolean,
): string {
  return firstCueText(
    buildCaptionCues(
      sampleCaptionWords(language),
      0,
      SAMPLE_CAPTION_CLIP_END,
      maxWords,
      uppercase,
    ),
  );
}
