// 참고 번역(FEAT-46 Korean analyze)의 카드 표시 판정.
// 번역은 AI 구간(aiStartSeconds~aiEndSeconds) 단어로 만들어지므로, 사용자가 현재 구간을
// 편집하면 카드에 보이는 영어 원문(현재 구간)과 번역(AI 구간)이 다른 단어를 가리킬 수 있다.
// 그래서 숨기지 않고 라벨로 "AI 추천 구간 기준"임을 밝힌다(FEAT-48 요구 ③ 결정).
// 라벨은 사용자에게 보이는 카피라 정확값이 계약이다(review-language-notice.ts 선례).

// AI 구간과 현재 구간의 차이가 이 값(초) 이하이면 "같은 구간"으로 본다.
// 화면 표기·편집 단위가 0.1초(ClipDraftCard roundTenth)라 그보다 작은 차이는 보이지 않는다.
const RANGE_MATCH_TOLERANCE_SECONDS = 0.05;

const FRESH_LABEL =
  "Korean reference — final subtitles are translated separately and may differ.";
const STALE_LABEL =
  "Korean reference for the AI-suggested range — final subtitles are translated separately and may differ.";

export interface ReferenceTranslationDisplay {
  text: string;
  label: string;
}

export function resolveReferenceTranslationDisplay(input: {
  referenceTranslation: string | null | undefined;
  aiStartSeconds: number;
  aiEndSeconds: number;
  currentStartSeconds: number;
  currentEndSeconds: number;
}): ReferenceTranslationDisplay | null {
  const { referenceTranslation } = input;
  if (referenceTranslation == null) return null;
  const text = referenceTranslation.trim();
  if (text.length === 0) return null;

  const isStale =
    Math.abs(input.currentStartSeconds - input.aiStartSeconds) >
      RANGE_MATCH_TOLERANCE_SECONDS ||
    Math.abs(input.currentEndSeconds - input.aiEndSeconds) >
      RANGE_MATCH_TOLERANCE_SECONDS;

  return { text, label: isStale ? STALE_LABEL : FRESH_LABEL };
}
