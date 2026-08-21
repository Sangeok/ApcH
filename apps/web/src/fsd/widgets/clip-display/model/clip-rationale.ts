// 백엔드 프롬프트가 열거하는 clipType 값은 "qa"|"insight" 둘뿐이나 강제 장치가 없어
// 다른 값이 올 수 있다(ClipDraftCard.tsx:22-30 주석과 같은 사실). 매핑에 없으면 원본을
// 그대로 돌려 빈 칸으로 삼키지 않는다. widgets/clip-draft-review의 동명 상수와 규칙이 같지만
// FSD 동일 레이어 peer 임포트 금지라 공유하지 않고 여기 둔다(FEAT-16 계획서 「대안」 참조).
const CLIP_TYPE_LABELS: Record<string, string> = {
  qa: "Q&A",
  insight: "Insight",
};

export function clipTypeLabel(
  clipType: string | null | undefined,
): string | null {
  if (clipType == null) return null;
  const trimmed = clipType.trim();
  if (trimmed.length === 0) return null;
  return CLIP_TYPE_LABELS[trimmed] ?? trimmed;
}

export function hasClipRationale(clip: {
  clipType: string | null;
  hook: string | null;
  payoff: string | null;
}): boolean {
  return (
    (clip.clipType?.trim().length ?? 0) > 0 ||
    (clip.hook?.trim().length ?? 0) > 0 ||
    (clip.payoff?.trim().length ?? 0) > 0
  );
}
