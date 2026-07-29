import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  getSelectionBudget,
  getOverlappingDraftIds,
} from "./selection-budget.ts";

function draft(overrides) {
  return {
    id: "draft-1",
    selected: false,
    startSeconds: 0,
    endSeconds: 40,
    ...overrides,
  };
}

describe("selection budget", () => {
  it("leaves the full limit remaining when nothing is selected", () => {
    const budget = getSelectionBudget({
      clipDrafts: [],
      targetClipCount: 3,
    });

    // 빈 입력 — 계산 없이 확인 가능한 값.
    assert.equal(budget.selectedCount, 0);
    assert.equal(budget.remaining, budget.limit);
    assert.equal(budget.isFull, false);
  });

  it("is full exactly when the seeded selection equals the target", () => {
    // 실제 초기 상태를 재현한다: 목표 3, draft 6개, 상위 3개 선택
    // (inngest/functions.ts의 `selected: order < clipCount`).
    const clipDrafts = [0, 1, 2, 3, 4, 5].map((i) =>
      draft({ id: `d${i}`, selected: i < 3 }),
    );
    const budget = getSelectionBudget({ clipDrafts, targetClipCount: 3 });

    assert.equal(budget.isFull, true);
    assert.equal(budget.remaining, 0);
  });

  it("never goes negative and keeps isFull consistent with remaining", () => {
    const budget = getSelectionBudget({
      clipDrafts: [
        draft({ id: "a", selected: true }),
        draft({ id: "b", selected: true }),
      ],
      targetClipCount: 1,
    });

    // 계약 불변식 — SelectionBudget 시그니처와 Math.max 가드에서 도출.
    // 선택이 상한을 넘는 과도 상태(낙관적 갱신 중)에서도 remaining은 음수가 아니다.
    assert.ok(budget.remaining >= 0);
    assert.equal(budget.isFull, budget.remaining === 0);
    assert.equal(budget.limit, 1);
  });

  it("flags both sides of an overlapping pair", () => {
    const ids = getOverlappingDraftIds([
      draft({ id: "a", startSeconds: 0, endSeconds: 40 }),
      draft({ id: "b", startSeconds: 30, endSeconds: 70 }),
      draft({ id: "c", startSeconds: 80, endSeconds: 120 }),
    ]);

    assert.ok(ids.has("a"));
    assert.ok(ids.has("b"));
    assert.equal(ids.has("c"), false);
  });

  it("returns an empty set when no ranges overlap", () => {
    const ids = getOverlappingDraftIds([
      draft({ id: "a", startSeconds: 0, endSeconds: 40 }),
      draft({ id: "b", startSeconds: 40, endSeconds: 80 }),
    ]);

    // 경계 접촉(next.start === prev.end)은 겹침이 아니다 — 서버 가드의
    // `next.startSeconds < prev.endSeconds`와 동일한 판정.
    assert.equal(ids.size, 0);
  });
});
