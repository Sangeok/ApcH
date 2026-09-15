import type { TranscriptWord } from "~/fsd/shared/lib/transcript";
import { buildCaptionCues, type CaptionCue } from "./caption-preview";

// 정지 미리보기 창(초). 아래 샘플 단어 전부를 포함(마지막 end 8.9 < 10).
export const SAMPLE_CAPTION_CLIP_END = 10;

// 각 단어 {start:i, end:i+0.9}. maxWordsPerLine 최댓값(8, MAX_WORDS_RANGE.MAX)까지
// 한 줄을 채울 수 있도록 언어마다 9단어를 둔다. KR_WORDS는 두 소비자가 공유한다:
// 설정 화면 정지 샘플(sampleCaptionWords로 타이밍을 붙여 buildCaptionCues에 넣음)과,
// koreanSampleCues가 라이브 Korean 미리보기의 큐 텍스트를 채우는 어휘. 새 상수를 만들지 않는다.
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

// 라이브 Korean 미리보기. 실렌더는 각 큐(영어 max_word단어 묶음)를 한국어로 번역하지만
// (apps/backend/main.py create_korean_subtitles_with_ffmpeg), 미리보기는 렌더 없이
// 큐의 타이밍·개수는 그대로 두고 텍스트만 KR_WORDS를 순환해 채운다. 큐별 "영어 단어 수"만큼
// 한국어 토큰을 뽑으므로 Words per line을 늘리면 줄이 길어진다(실동작의 근사).
// buildCaptionCues 계약은 건드리지 않는다 — 그 결과 큐를 후처리할 뿐이다.
export function koreanSampleCues(cues: readonly CaptionCue[]): CaptionCue[] {
  let cursor = 0;
  return cues.map((cue) => {
    const trimmed = cue.text.trim();
    const wordCount = trimmed === "" ? 0 : trimmed.split(/\s+/).length;
    const tokens: string[] = [];
    for (let i = 0; i < wordCount; i += 1) {
      // cursor % length는 항상 범위 안이지만 noUncheckedIndexedAccess를 위해 ?? "".
      tokens.push(KR_WORDS[cursor % KR_WORDS.length] ?? "");
      cursor += 1;
    }
    return { start: cue.start, end: cue.end, text: tokens.join(" ") };
  });
}

// 미리보기 플레이어가 그릴 큐를 고른다. Korean 라이브 미리보기(검토 다이얼로그)만 텍스트를
// 한국어 샘플로 치환한다 — English는 그려지는 단어가 곧 실제 자막이라 그대로 두고, 설정 화면
// 정지 샘플(sample)은 이미 sampleCaptionWords(Korean)=KR_WORDS로 만든 큐라 그대로 둔다.
// 언어 판정은 폰트·EM_SCALE·languageDefaultMaxWords와 같은 language === "Korean"이다.
export function previewCaptionCues(
  cues: CaptionCue[],
  language: string,
  sample: boolean,
): CaptionCue[] {
  return language === "Korean" && !sample ? koreanSampleCues(cues) : cues;
}
