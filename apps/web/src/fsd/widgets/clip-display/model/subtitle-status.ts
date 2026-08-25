// 백엔드가 클립마다 콜백에 싣는 subtitleStatus(BUG-02)를 사용자 안내 문구로 매핑한다.
// 키는 translation_fallback.py의 상태 상수와 일치해야 한다(콜백 wire 계약):
//   "partial-fallback" = 일부 줄이 영어로 폴백, "full-fallback" = 전량 영어 폴백.
// "ok"·미지 값·nullish/공백은 안내 없음(null) — 정상 자막에 경고 배지를 붙이지 않는다.
// 앱 UI 언어는 영어다(ClipCard/ClipActions/ScriptModal 전부 영어) — 문구도 영어.
const SUBTITLE_FALLBACK_NOTICES: Record<string, string> = {
  "partial-fallback": "Some subtitles couldn't be translated — shown in English.",
  "full-fallback": "Translation failed — subtitles shown in English.",
};

export function subtitleFallbackNotice(
  subtitleStatus: string | null | undefined,
): string | null {
  if (subtitleStatus == null) return null;
  const trimmed = subtitleStatus.trim();
  if (trimmed.length === 0) return null;
  return SUBTITLE_FALLBACK_NOTICES[trimmed] ?? null;
}
