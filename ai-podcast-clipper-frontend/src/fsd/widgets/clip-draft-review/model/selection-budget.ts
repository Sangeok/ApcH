import type { ClipDraft } from "generated/prisma";

/**
 * 선택 예산. **선택만** 다루며 크레딧은 포함하지 않는다.
 *
 * 크레딧을 상한에 접지 않는 이유: 서버는 크레딧을 **생성 시점에만** 막고
 * (features/upload/api/index.ts:444) 선택 자체는 제한하지 않는다. 클라이언트가
 * 크레딧으로 체크박스를 잠그면 서버보다 엄격해지고, 크레딧을 사도록 유도하는
 * 대신 하드 캡으로 막게 된다. 크레딧은 getGenerateBlockReason의 별도 사유다.
 *
 * ⚠️ 상한 규칙은 서버 가드가 함께 강제한다(:438 target, :444 credits).
 *    나중에 상한 정책을 바꾸게 되면 **이 함수와 서버 가드를 함께** 고쳐야 한다.
 *    이 함수만 고치면 UI가 허용한 선택을 서버가 거부하는 상태로 조용히 갈라진다.
 *
 * 파라미터를 전체 ClipDraft가 아니라 실제로 읽는 필드로만 좁힌다 —
 * 이 모듈이 Prisma 스키마 변경의 영향권에 들어가지 않게 한다.
 */
export interface SelectionBudget {
  /** 선택 상한 = targetClipCount. CLIP_COUNT_OPTIONS가 1~4이므로 항상 1 이상이다. */
  limit: number;
  selectedCount: number;
  remaining: number;
  isFull: boolean;
}

export function getSelectionBudget(input: {
  clipDrafts: Pick<ClipDraft, "selected">[];
  targetClipCount: number;
}): SelectionBudget {
  const { clipDrafts, targetClipCount } = input;
  const selectedCount = clipDrafts.filter((draft) => draft.selected).length;
  const remaining = Math.max(0, targetClipCount - selectedCount);

  return {
    limit: targetClipCount,
    selectedCount,
    remaining,
    isFull: remaining === 0,
  };
}

/**
 * 겹치는 draft의 id 집합. **호출부가 선택된 draft만 넘겨야 한다** —
 * 이 함수는 selected를 읽지 않는다.
 *
 * 파라미터 이름으로 전제를 드러내기 위해 내부에서 필터하지 않고 `drafts`로
 * 명명한다. 백엔드가 항상 목표의 2배를 인접 구간으로 만들기 때문에, 전체
 * clipDrafts를 넘기면 선택하지 않은 카드까지 겹침으로 표시된다.
 *
 * 겹침 규칙의 원본은 3곳이 함께 바뀌어야 한다: 백엔드 identify_moments의
 * non-overlap 제약 → 서버 가드(features/upload/api/index.ts:448-460) → 이 함수.
 */
export function getOverlappingDraftIds(
  drafts: Pick<ClipDraft, "id" | "startSeconds" | "endSeconds">[],
): Set<string> {
  const sorted = [...drafts].sort((a, b) => a.startSeconds - b.startSeconds);
  const overlapping = new Set<string>();

  for (let i = 1; i < sorted.length; i++) {
    const prev = sorted[i - 1]!;
    const next = sorted[i]!;

    if (next.startSeconds < prev.endSeconds) {
      // 겹침은 쌍의 속성이므로 양쪽 모두 표시한다.
      overlapping.add(prev.id);
      overlapping.add(next.id);
    }
  }

  return overlapping;
}
