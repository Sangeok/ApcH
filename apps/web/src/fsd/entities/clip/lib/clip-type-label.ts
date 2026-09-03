/**
 * 백엔드가 clipType에 넣는 값 → 표시 라벨.
 *
 * 프롬프트가 열거하는 값은 `"qa" | "insight"` 둘뿐이지만(main.py) 강제 장치가 없어
 * 다른 값이 올 수 있다. 매핑에 없으면 원본을 그대로 돌려 빈 칸으로 삼키지 않는다.
 * CSS `capitalize`로는 qa가 "Qa"가 되어 오히려 틀린 표기가 되므로 매핑이 필요하다.
 *
 * 이 규칙은 최종 클립 카드(widgets/clip-display)와 검토 카드(widgets/clip-draft-review)가
 * 함께 쓰는 wire 계약이다. 두 위젯은 같은 레이어라 서로 임포트할 수 없으므로 —
 * 옆이 아니라 아래로 — 엔티티에 둔다.
 */
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
