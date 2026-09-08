// 검토 화면은 언어 선택과 무관하게 영어 전사를 보여준다 — previewText는 wordsInRange의
// 영어 단어들이고(ClipDraftCard.tsx:113), 한국어 번역은 렌더 단계에서만 만들어진다
// (apps/backend/main.py:837 elif selected_language == "Korean" → :840
// create_korean_subtitles_with_ffmpeg, :474 Gemini 번역, 실패 시 :535
// korean_texts = english_texts 영어 폴백). 그래서 "Korean을 골랐는데 화면이 영어"라는
// 오독을 막는 안내는 English가 아닌 언어에서만 필요하다.
//
// 언어 이름은 전달된 값(SUPPORTED_LANGUAGES[].value: "English"|"Korean")을 그대로
// 문장에 넣는다 — 앱 UI가 영어라(clip-display/model/subtitle-status.ts:5 주석) 영어
// 문장 안의 언어명도 값("Korean")이 맞고, CaptionStyleEditor.tsx:310-311의 기존 문구와도
// 일관된다. English·nullish/공백은 안내 없음(null) — 영어 전사가 곧 최종 자막이라
// 오독 여지가 없다. "English"만 제외하므로 향후 언어가 늘어도 자동으로 커버된다.
export function reviewLanguageNotice(
  language: string | null | undefined,
): string | null {
  if (language == null) return null;
  const trimmed = language.trim();
  if (trimmed.length === 0 || trimmed === "English") return null;
  return `Subtitles will be translated to ${trimmed} when you generate. This review shows the English transcript.`;
}

// 이 검토 화면이 최종 자막과 다른 언어(영어 원문)를 보여주는가.
// 헤더 안내와 카드 previewText 라벨이 같은 조건으로 켜지도록 안내 존재로 판정한다 —
// "English" 리터럴을 두 곳에 두지 않는다.
export function showsEnglishSourceForTranslation(
  language: string | null | undefined,
): boolean {
  return reviewLanguageNotice(language) !== null;
}
